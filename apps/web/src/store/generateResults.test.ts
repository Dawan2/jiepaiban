/**
 * 生成结果的落库通道（PRD §8.2 `video_url` / `prompt_final`）。
 *
 * 这个文件守的是一条行为红线：**生成结果的持久化不依赖编辑页**。
 * 任务进终态即写库，用户可以在生成跑完之前离页、关页、切项目，结果都不丢。
 * 相对地，30 秒时长上限与「衔接永不进 Prompt」两条红线一条都不放宽——
 * 这条新通道同样走 `repository.save` → `normalizeProject` → `assertProjectLocks`。
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MAX_BEAT_DURATION_SEC, type BeatIndex } from '../domain/beats';
import { beatAt, hydrateProject } from '../domain/projects';
import { rebuildBeat, type StoredBeat, type StoredProject } from '../adapters/persistence';
import {
  createScriptedTransport,
  createSeedanceAdapter,
  upstreamFailure,
  type SeedanceTransport,
  type SeedanceTransportResult,
} from '../generate/adapter';
import { createGenerateController } from '../generate/controller';
import { createGenerateQueue } from '../generate/queue';
import { createMemoryJobStore } from '../generate/store';
import { SEEDANCE_MODEL, type GenerateJob } from '../generate/types';
import { makeProject, seedRepository, withFilledBeats } from '../testing/harness';
import {
  applyJobResult,
  createGenerateResultWriter,
  jobResultPending,
  useGenerateResultWriter,
  type GenerateResultRepository,
} from './generateResults';

const PROJECT_ID = 'prj_persist';

function project(): StoredProject {
  return withFilledBeats(makeProject(PROJECT_ID, { name: '离页也不丢的一集' }));
}

function beatOf(source: StoredProject, index: number): StoredBeat {
  const beat = source.beat_list.find((item) => item.index === index);
  if (beat === undefined) {
    throw new Error(`板 ${index} 不存在`);
  }
  return beat;
}

/** 把某一板改成「已生成」的样子，用于断言重试失败不抹掉既有成片。 */
function withGeneratedBeat(source: StoredProject, index: BeatIndex): StoredProject {
  const { beat_list: stored, ...fields } = source;
  const beats = stored.map((beat) => {
    const copy = rebuildBeat(beat);
    if (copy.index === index) {
      copy.video_url = 'https://cdn.example.com/old.mp4';
      copy.prompt_final = '上一次成功时的 Prompt 快照';
      copy.status = 'generated';
    }
    return copy;
  });
  return hydrateProject(fields, beats);
}

function job(overrides: Partial<GenerateJob> = {}): GenerateJob {
  const base: GenerateJob = {
    id: 'job_1',
    project_id: PROJECT_ID,
    beat_index: 1,
    model: SEEDANCE_MODEL,
    prompt_snapshot: '漫剧厚涂画风，高清8K，人物五官稳定无漂移，冷调赛博废土。',
    params: { duration_sec: 8, aspect_ratio: '9:16', frame_count: 3, g_index: 'G1' },
    idempotency_key: 'idem_00000001',
    status: 'SUCCEEDED',
    attempt: 1,
    created_at: '2026-08-27T00:00:00.000Z',
    updated_at: '2026-08-27T00:00:05.000Z',
    video_url: 'stub://seedance-2.5/b1/idem_00000001.mp4',
    failure: null,
  };
  return Object.freeze({ ...base, ...overrides });
}

const failedJob = (overrides: Partial<GenerateJob> = {}): GenerateJob =>
  job({
    status: 'FAILED',
    video_url: null,
    failure: upstreamFailure('网关超时'),
    ...overrides,
  });

/** 可控传输层：手动决定任务什么时候收尾，用来把「收尾」排到「离页」之后。 */
function deferredTransport(): {
  readonly transport: SeedanceTransport;
  readonly settle: (result: SeedanceTransportResult) => void;
} {
  let release: ((result: SeedanceTransportResult) => void) | null = null;
  return {
    transport: () =>
      new Promise<SeedanceTransportResult>((resolve) => {
        release = resolve;
      }),
    settle(result) {
      release?.(result);
    },
  };
}

describe('applyJobResult：终态任务 → 板上字段', () => {
  it('成功任务把 video_url / prompt_final / status 写到对应板', () => {
    const settled = job();
    const next = applyJobResult(project(), settled);

    expect(next).not.toBeNull();
    const beat = beatOf(next as StoredProject, 1);
    expect(beat.video_url).toBe(settled.video_url);
    expect(beat.prompt_final).toBe(settled.prompt_snapshot);
    expect(beat.status).toBe('generated');
  });

  it('只动命中的那一板，其余四板不留痕', () => {
    const next = applyJobResult(project(), job({ beat_index: 3 })) as StoredProject;

    expect(next.beat_list.map((beat) => beat.video_url !== null)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(next.beat_list.map((beat) => beat.status)).toEqual([
      'filled',
      'filled',
      'generated',
      'filled',
      'filled',
    ]);
  });

  it('失败任务只落 status=failed', () => {
    const next = applyJobResult(project(), failedJob()) as StoredProject;

    expect(beatOf(next, 1).status).toBe('failed');
    expect(beatOf(next, 1).video_url).toBeNull();
  });

  it('重试失败不抹掉上一次成功产出的成片地址与快照', () => {
    const next = applyJobResult(withGeneratedBeat(project(), 1), failedJob()) as StoredProject;

    expect(beatOf(next, 1).status).toBe('failed');
    expect(beatOf(next, 1).video_url).toBe('https://cdn.example.com/old.mp4');
    expect(beatOf(next, 1).prompt_final).toBe('上一次成功时的 Prompt 快照');
  });

  it('在途任务不落库：待生成与生成中都还不是结果', () => {
    expect(applyJobResult(project(), job({ status: 'PENDING', video_url: null }))).toBeNull();
    expect(applyJobResult(project(), job({ status: 'RUNNING', video_url: null }))).toBeNull();
  });

  it('库里已经一致时返回 null（幂等，不产生多余写盘）', () => {
    const settled = job();
    const once = applyJobResult(project(), settled) as StoredProject;

    expect(once).not.toBeNull();
    expect(applyJobResult(once, settled)).toBeNull();
  });

  it('板序对不上（任务不属于这个项目结构）时不落库', () => {
    expect(applyJobResult(project(), job({ beat_index: 9 as unknown as BeatIndex }))).toBeNull();
  });

  it('回写不破坏五节拍锁与宫格锁', () => {
    const next = applyJobResult(project(), job()) as StoredProject;

    expect(next.beat_list).toHaveLength(5);
    expect(next.beat_list.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
    expect(next.beat_list.map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
    expect(Object.isFrozen(next.beat_list)).toBe(true);
  });

  it('jobResultPending 与 applyJobResult 口径一致', () => {
    const settled = job();
    const source = project();

    expect(jobResultPending(source, settled)).toBe(true);
    expect(jobResultPending(source, job({ status: 'RUNNING' }))).toBe(false);
    expect(jobResultPending(applyJobResult(source, settled) as StoredProject, settled)).toBe(false);
  });
});

describe('写入器：直连仓储', () => {
  it('终态任务直接落库，全程没有编辑页参与', async () => {
    const repository = await seedRepository([project()]);
    const writer = createGenerateResultWriter({ repository });

    await writer.settle(job());

    const stored = await repository.load(PROJECT_ID);
    expect(stored?.beat_list[0]?.video_url).toBe(job().video_url);
    expect(stored?.beat_list[0]?.prompt_final).toBe(job().prompt_snapshot);
    expect(stored?.beat_list[0]?.status).toBe('generated');
  });

  it('落库成功后回调已落库的项目，供编辑页对齐草稿', async () => {
    const repository = await seedRepository([project()]);
    const onPersisted = vi.fn<(job: GenerateJob, project: StoredProject) => void>();
    const writer = createGenerateResultWriter({ repository, onPersisted });

    await writer.settle(job());

    expect(onPersisted).toHaveBeenCalledTimes(1);
    expect(onPersisted.mock.calls[0]?.[0].id).toBe('job_1');
    expect(onPersisted.mock.calls[0]?.[1].beat_list[0]?.video_url).toBe(job().video_url);
  });

  it('同一结果重复报到只写一次库', async () => {
    const repository = await seedRepository([project()]);
    const save = vi.spyOn(repository, 'save');
    const writer = createGenerateResultWriter({ repository });

    await writer.settle(job());
    await writer.settle(job());

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('整集五个任务并发报到，五板结果都在（写盘串行，不互相盖掉）', async () => {
    const repository = await seedRepository([project()]);
    const writer = createGenerateResultWriter({ repository });
    const indexes: readonly BeatIndex[] = [1, 2, 3, 4, 5];

    // 故意不逐个 await：整集生成就是连着报到的，串行化必须由写入器自己保证。
    await Promise.all(
      indexes.map((index) =>
        writer.settle(
          job({
            id: `job_${index}`,
            beat_index: index,
            video_url: `stub://seedance-2.5/b${index}/idem.mp4`,
          }),
        ),
      ),
    );
    await writer.idle();

    const stored = await repository.load(PROJECT_ID);
    expect(stored?.beat_list.map((beat) => beat.video_url)).toEqual(
      indexes.map((index) => `stub://seedance-2.5/b${index}/idem.mp4`),
    );
  });

  it('项目已被删除时静默丢弃，不抛错', async () => {
    const repository = await seedRepository([]);
    const onError = vi.fn();
    const writer = createGenerateResultWriter({ repository, onError });

    await expect(writer.settle(job())).resolves.toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it('写盘失败走 onError，不把异常抛回状态机', async () => {
    const repository: GenerateResultRepository = {
      load: async () => project(),
      save: async () => {
        throw new Error('库满了');
      },
    };
    const onError = vi.fn<(error: unknown, job: GenerateJob) => void>();
    const writer = createGenerateResultWriter({ repository, onError });

    await expect(writer.settle(job())).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('库满了');
  });

  it('一次写盘失败不会堵死后面的任务', async () => {
    const repository = await seedRepository([project()]);
    const save = vi.spyOn(repository, 'save').mockRejectedValueOnce(new Error('库满了'));
    const writer = createGenerateResultWriter({ repository, onError: () => {} });

    await writer.settle(job({ id: 'job_1', beat_index: 1 }));
    await writer.settle(
      job({ id: 'job_2', beat_index: 2, video_url: 'stub://seedance-2.5/b2/idem.mp4' }),
    );

    expect(save).toHaveBeenCalledTimes(2);
    const stored = await repository.load(PROJECT_ID);
    expect(stored?.beat_list[1]?.video_url).toBe('stub://seedance-2.5/b2/idem.mp4');
  });

  it('在途任务报到不写库', async () => {
    const repository = await seedRepository([project()]);
    const save = vi.spyOn(repository, 'save');
    const writer = createGenerateResultWriter({ repository });

    await writer.settle(job({ status: 'RUNNING', video_url: null }));

    expect(save).not.toHaveBeenCalled();
  });

  it('React 侧的写入器身份只随仓储变化（队列只接一次线）', async () => {
    const repository = await seedRepository([project()]);
    const view = renderHook(
      ({ onPersisted }: { onPersisted: () => void }) =>
        useGenerateResultWriter({ repository, onPersisted }),
      { initialProps: { onPersisted: () => {} } },
    );

    const first = view.result.current;
    view.rerender({ onPersisted: () => {} });

    expect(view.result.current).toBe(first);
    expect(view.result.current.settle).toBe(first.settle);
  });
});

describe('接到队列上：离页之后收尾的任务照样落库', () => {
  async function wire(transport?: SeedanceTransport) {
    const repository = await seedRepository([project()]);
    const writer = createGenerateResultWriter({ repository });
    const queue = createGenerateQueue({
      adapter: createSeedanceAdapter(transport === undefined ? {} : { transport }),
      store: createMemoryJobStore(),
      onSettle: writer.settle,
    });
    const stored = (await repository.load(PROJECT_ID)) as StoredProject;
    const controller = createGenerateController({ project: stored, queue, autoRun: false });
    return { repository, writer, controller };
  }

  it('生成成功即落库，不经任何防抖', async () => {
    const { repository, writer, controller } = await wire();

    controller.generateBeat(1);
    await controller.run();
    await writer.idle();

    const stored = await repository.load(PROJECT_ID);
    expect(stored?.beat_list[0]?.video_url).toMatch(/^stub:\/\/seedance-2\.5/);
    expect(stored?.beat_list[0]?.prompt_final).not.toBeNull();
    expect(stored?.beat_list[0]?.status).toBe('generated');
  });

  it('控制器先 dispose（离页），任务后收尾——结果仍然落库', async () => {
    const deferred = deferredTransport();
    const { repository, writer, controller } = await wire(deferred.transport);

    controller.generateBeat(1);
    const running = controller.run();

    // 用户在这里离开了编辑页：控制器解绑，视图状态再没人看。
    controller.dispose();
    expect((await repository.load(PROJECT_ID))?.beat_list[0]?.video_url).toBeNull();

    deferred.settle({ ok: true, video_url: 'stub://seedance-2.5/b1/late.mp4' });
    await running;
    await writer.idle();

    const stored = await repository.load(PROJECT_ID);
    expect(stored?.beat_list[0]?.video_url).toBe('stub://seedance-2.5/b1/late.mp4');
    expect(stored?.beat_list[0]?.status).toBe('generated');
  });

  it('失败也落库：回到页面看到的是「失败」而不是「待生成」', async () => {
    const { repository, writer, controller } = await wire(
      createScriptedTransport([{ ok: false, failure: upstreamFailure('网关超时') }]),
    );

    controller.generateBeat(1);
    await controller.run();
    await writer.idle();

    const stored = await repository.load(PROJECT_ID);
    expect(stored?.beat_list[0]?.status).toBe('failed');
    expect(stored?.beat_list[0]?.video_url).toBeNull();
  });

  it('整集生成跑完，五板结果都在库里', async () => {
    const { repository, writer, controller } = await wire();

    controller.generateEpisode();
    await controller.run();
    await writer.idle();

    const stored = await repository.load(PROJECT_ID);
    expect(stored?.beat_list.every((beat) => beat.video_url !== null)).toBe(true);
    expect(stored?.beat_list.map((beat) => beat.status)).toEqual([
      'generated',
      'generated',
      'generated',
      'generated',
      'generated',
    ]);
  });

  it('落库的 Prompt 快照里没有衔接手法，也没有备注（AC-6.4）', async () => {
    const { repository, writer, controller } = await wire();

    controller.generateEpisode();
    await controller.run();
    await writer.idle();

    const stored = await repository.load(PROJECT_ID);
    stored?.beat_list.forEach((beat) => {
      expect(beat.prompt_final).not.toBeNull();
      expect(beat.prompt_final ?? '').not.toContain(beat.transition_rule);
    });
  });

  it('超 30 秒的板压根不入队，也就没有任何东西落库（RULE-4 拦截器仍在）', async () => {
    const repository = await seedRepository([project()]);
    const writer = createGenerateResultWriter({ repository });
    const queue = createGenerateQueue({
      adapter: createSeedanceAdapter(),
      store: createMemoryJobStore(),
      onSettle: writer.settle,
    });
    const stored = (await repository.load(PROJECT_ID)) as StoredProject;
    beatAt(stored, 2).duration_sec = MAX_BEAT_DURATION_SEC + 1;
    const controller = createGenerateController({ project: stored, queue, autoRun: false });

    const result = controller.generateBeat(2);
    await controller.run();
    await writer.idle();

    expect(result.status).toBe('blocked');
    expect(controller.jobs()).toHaveLength(0);
    expect((await repository.load(PROJECT_ID))?.beat_list[1]?.video_url).toBeNull();
  });

  it('注入队列时把 onSettle 交给控制器即报错（接线只有一处）', async () => {
    const repository = await seedRepository([project()]);
    const writer = createGenerateResultWriter({ repository });
    const stored = (await repository.load(PROJECT_ID)) as StoredProject;

    expect(() =>
      createGenerateController({
        project: stored,
        queue: createGenerateQueue({ store: createMemoryJobStore() }),
        onSettle: writer.settle,
      }),
    ).toThrow(/createGenerateQueue/);
  });
});
