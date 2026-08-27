/**
 * 生成队列与状态机（FR-4-01…08、AC-F4-1/2/4/5/6）。
 *
 * 覆盖：待生成 → 生成中 → 成功 / 失败四态、三类失败、一板一任务、
 * 幂等去重、前置校验阻断、单板重生成隔离、整集顺序入队。
 */

import { describe, expect, it, vi } from 'vitest';
import { MAX_BEAT_DURATION_SEC, type BeatIndex } from '../domain/beats';
import { beatAt } from '../domain/projects';
import { createBeat1Sample, createFilledEpisode } from '../testing/goldens';
import {
  createScriptedTransport,
  createSeedanceAdapter,
  moderationFailure,
  upstreamFailure,
  type SeedanceTransport,
  type SeedanceTransportResult,
} from './adapter';
import { createGenerateQueue, type GenerateQueue } from './queue';
import { createMemoryJobStore, type GenerateJobStore } from './store';
import {
  GENERATE_JOB_STATUSES,
  GENERATE_STATUS_LABEL,
  GENERATE_STATUS_TRANSITIONS,
  canTransition,
  isTerminalStatus,
  type GenerateJob,
} from './types';

interface Harness {
  readonly queue: GenerateQueue;
  readonly store: GenerateJobStore;
}

function harness(
  transport?: SeedanceTransport,
  onSettle?: (job: GenerateJob) => void,
): Harness {
  const store = createMemoryJobStore();
  let tick = 0;
  const queue = createGenerateQueue({
    adapter: createSeedanceAdapter(transport === undefined ? {} : { transport }),
    store,
    ...(onSettle === undefined ? {} : { onSettle }),
    now: () => {
      tick += 1;
      return new Date(Date.UTC(2026, 7, 27, 0, 0, tick)).toISOString();
    },
    newId: (() => {
      let seq = 0;
      return () => {
        seq += 1;
        return `job_${seq}`;
      };
    })(),
  });
  return { queue, store };
}

/** 可控的传输层：手动决定什么时候返回，用来观察「生成中」。 */
function deferredTransport(): {
  readonly transport: SeedanceTransport;
  readonly settle: (result: SeedanceTransportResult) => void;
} {
  let release: ((result: SeedanceTransportResult) => void) | null = null;
  const transport: SeedanceTransport = () =>
    new Promise<SeedanceTransportResult>((resolve) => {
      release = resolve;
    });
  return {
    transport,
    settle(result) {
      release?.(result);
    },
  };
}

describe('四态：待生成 → 生成中 → 成功 / 失败', () => {
  it('状态文案就是产品说的那四个词', () => {
    expect(GENERATE_STATUS_LABEL.PENDING).toBe('待生成');
    expect(GENERATE_STATUS_LABEL.RUNNING).toBe('生成中');
    expect(GENERATE_STATUS_LABEL.SUCCEEDED).toBe('成功');
    expect(GENERATE_STATUS_LABEL.FAILED).toBe('失败');
  });

  it('入队即「待生成」，跑完是「成功」并带回视频地址', async () => {
    const { queue } = harness();
    const { project, beat } = createBeat1Sample();

    const result = queue.enqueue(project, beat);
    expect(result.status).toBe('queued');
    if (result.status !== 'queued') {
      throw new Error('入队失败');
    }
    expect(result.job.status).toBe('PENDING');
    expect(result.job.model).toBe('Seedance 2.5');
    expect(result.job.prompt_snapshot).toContain('漫剧厚涂画风');
    expect(queue.pending()).toHaveLength(1);

    const done = await queue.runNext();
    expect(done?.status).toBe('SUCCEEDED');
    expect(done?.video_url).toContain('stub://seedance-2.5/b1/');
    expect(done?.failure).toBeNull();
    expect(queue.pending()).toHaveLength(0);
  });

  it('提交中的任务停在「生成中」，其他板照常入队', async () => {
    const { transport, settle } = deferredTransport();
    const { queue } = harness(transport);
    const project = createFilledEpisode();

    queue.enqueue(project, beatAt(project, 1));
    const running = queue.runNext();

    expect(queue.jobFor(project.id, 1)?.status).toBe('RUNNING');
    expect(queue.enqueue(project, beatAt(project, 2)).status).toBe('queued');

    settle({ ok: true, video_url: 'stub://ok.mp4' });
    await running;
    expect(queue.jobFor(project.id, 1)?.status).toBe('SUCCEEDED');
    expect(queue.jobFor(project.id, 2)?.status).toBe('PENDING');
  });

  it('状态迁移表封闭：成功 / 失败是终态', () => {
    expect(canTransition('PENDING', 'RUNNING')).toBe(true);
    expect(canTransition('RUNNING', 'SUCCEEDED')).toBe(true);
    expect(canTransition('RUNNING', 'FAILED')).toBe(true);
    expect(canTransition('SUCCEEDED', 'RUNNING')).toBe(false);
    expect(canTransition('FAILED', 'RUNNING')).toBe(false);
    expect(GENERATE_STATUS_TRANSITIONS.SUCCEEDED).toHaveLength(0);
    expect(GENERATE_STATUS_TRANSITIONS.FAILED).toHaveLength(0);
  });
});

describe('三类失败', () => {
  it('参数缺失：超 30 秒被阻断，任务根本不建', () => {
    const transport = vi.fn(async () => ({ ok: true, video_url: 'stub://x.mp4' }) as const);
    const { queue } = harness(transport);
    const { project, beat } = createBeat1Sample();
    beat.duration_sec = MAX_BEAT_DURATION_SEC + 1;

    const result = queue.enqueue(project, beat);
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('应当被阻断');
    }
    expect(result.failure.error_class).toBe('PARAM_MISSING');
    expect(result.failure.label).toBe('参数缺失');
    expect(result.failure.message).toContain('30 秒');
    expect(queue.jobs()).toHaveLength(0);
    expect(transport).not.toHaveBeenCalled();
  });

  it('参数缺失：必填没齐同样阻断', () => {
    const { queue } = harness();
    const { project, beat } = createBeat1Sample();
    beat.emotion = '';
    const result = queue.enqueue(project, beat);
    expect(result.status === 'blocked' && result.failure.error_class).toBe('PARAM_MISSING');
    expect(queue.jobs()).toHaveLength(0);
  });

  it('接口异常：上游报错落 FAILED，可重试', async () => {
    const { queue } = harness(createScriptedTransport([{ ok: false, failure: upstreamFailure('网关超时') }]));
    const { project, beat } = createBeat1Sample();

    queue.enqueue(project, beat);
    const done = await queue.runNext();

    expect(done?.status).toBe('FAILED');
    expect(done?.failure?.error_class).toBe('API_ERROR');
    expect(done?.failure?.label).toBe('接口异常');
    expect(done?.failure?.retryable).toBe(true);
    expect(done?.video_url).toBeNull();
  });

  it('内容违规：上游审核不通过落 FAILED，不可原样重投', async () => {
    const { queue } = harness(
      createScriptedTransport([{ ok: false, failure: moderationFailure('画面涉及违规内容') }]),
    );
    const { project, beat } = createBeat1Sample();

    queue.enqueue(project, beat);
    const done = await queue.runNext();

    expect(done?.status).toBe('FAILED');
    expect(done?.failure?.error_class).toBe('CONTENT_VIOLATION');
    expect(done?.failure?.label).toBe('内容违规');
    expect(done?.failure?.retryable).toBe(false);

    // 入参没变，重试直接把原因回给用户，不再打上游。
    const retried = queue.retry(project, beat);
    expect(retried.status === 'blocked' && retried.failure.error_class).toBe('CONTENT_VIOLATION');
  });

  it('内容违规：Prompt 命中衔接词时本地就拦下', () => {
    const { queue } = harness();
    const { project, beat } = createBeat1Sample();
    beat.plot_core = '这里做一次转场，把镜头推向下一段';
    const result = queue.enqueue(project, beat);
    expect(result.status === 'blocked' && result.failure.error_class).toBe('CONTENT_VIOLATION');
  });
});

describe('一板一任务与幂等', () => {
  it('同板同入参连点两次只有一个任务', () => {
    const { queue } = harness();
    const { project, beat } = createBeat1Sample();

    const first = queue.enqueue(project, beat);
    const second = queue.enqueue(project, beat);

    expect(first.status).toBe('queued');
    expect(second.status).toBe('reused');
    expect(queue.jobs()).toHaveLength(1);

    const firstId = first.status === 'queued' ? first.job.id : '';
    const secondId = second.status === 'reused' ? second.job.id : '';
    expect(secondId).toBe(firstId);
  });

  it('改了槽位再提交视为新任务', async () => {
    const { queue } = harness();
    const { project, beat } = createBeat1Sample();

    queue.enqueue(project, beat);
    await queue.drain();
    beat.plot_core = `${beat.plot_core}，并且当场撕碎请柬`;
    const second = queue.enqueue(project, beat);

    expect(second.status).toBe('queued');
    expect(queue.jobs()).toHaveLength(2);
    const keys = new Set(queue.jobs().map((job) => job.idempotency_key));
    expect(keys.size).toBe(2);
  });

  it('改衔接 / 名称 / 备注不构成新任务', async () => {
    const { queue } = harness();
    const { project, beat } = createBeat1Sample();

    queue.enqueue(project, beat);
    await queue.drain();
    beat.transition_rule = '纯硬切';
    beat.title = '换个板名';
    beat.note = '换条备注';

    expect(queue.enqueue(project, beat).status).toBe('reused');
    expect(queue.jobs()).toHaveLength(1);
  });

  it('本板有在途任务时，改了内容再提交只会被告知繁忙', () => {
    const { transport } = deferredTransport();
    const { queue } = harness(transport);
    const { project, beat } = createBeat1Sample();

    queue.enqueue(project, beat);
    void queue.runNext();
    beat.emotion = `${beat.emotion}，并且更狠`;

    const second = queue.enqueue(project, beat);
    expect(second.status).toBe('busy');
    expect(queue.jobs()).toHaveLength(1);
  });

  it('重新生成：成功过的板强制建新任务，attempt 递增', async () => {
    const { queue } = harness();
    const { project, beat } = createBeat1Sample();

    queue.enqueue(project, beat);
    await queue.drain();
    const again = queue.retry(project, beat);

    expect(again.status).toBe('queued');
    if (again.status === 'queued') {
      expect(again.job.attempt).toBe(2);
      expect(again.job.status).toBe('PENDING');
    }
    await queue.drain();
    expect(queue.jobFor(project.id, 1)?.attempt).toBe(2);
  });

  it('接口异常后重试是新任务，仍只影响本板', async () => {
    const { queue } = harness(
      createScriptedTransport([{ ok: false, failure: upstreamFailure('网关超时') }]),
    );
    const project = createFilledEpisode();

    queue.enqueue(project, beatAt(project, 3));
    await queue.drain();
    expect(queue.jobFor(project.id, 3)?.status).toBe('FAILED');

    queue.retry(project, beatAt(project, 3));
    await queue.drain();

    expect(queue.jobFor(project.id, 3)?.status).toBe('SUCCEEDED');
    expect(queue.jobFor(project.id, 1)).toBeUndefined();
    expect(queue.jobFor(project.id, 2)).toBeUndefined();
  });
});

describe('整集生成：5 次独立调用', () => {
  it('按 B1 → B5 依次入队，五个任务互相独立', async () => {
    const { queue } = harness();
    const project = createFilledEpisode();

    const results = queue.enqueueEpisode(project);
    expect(results).toHaveLength(5);
    expect(results.every((result) => result.status === 'queued')).toBe(true);
    expect(queue.pending().map((job) => job.beat_index)).toEqual([1, 2, 3, 4, 5]);

    const done = await queue.drain();
    expect(done.map((job) => job.beat_index)).toEqual([1, 2, 3, 4, 5]);
    expect(done.every((job) => job.status === 'SUCCEEDED')).toBe(true);
    expect(new Set(done.map((job) => job.video_url)).size).toBe(5);
  });

  it('不合规的板被跳过，其余照常入队', () => {
    const { queue } = harness();
    const project = createFilledEpisode();
    beatAt(project, 4).duration_sec = 42;

    const results = queue.enqueueEpisode(project);
    expect(results.map((result) => result.status)).toEqual([
      'queued',
      'queued',
      'queued',
      'blocked',
      'queued',
    ]);
    expect(queue.jobs().map((job) => job.beat_index)).toEqual([1, 2, 3, 5]);
  });

  it('重生成 B3 不动其他四板的结果', async () => {
    const { queue } = harness();
    const project = createFilledEpisode();

    queue.enqueueEpisode(project);
    await queue.drain();
    const before = new Map(
      queue.jobs().map((job) => [job.beat_index, job.video_url] as const),
    );

    beatAt(project, 3).plot_core = '第3板改写：继承权被当众剥夺';
    queue.enqueue(project, beatAt(project, 3));
    await queue.drain();

    ([1, 2, 4, 5] as const).forEach((index: BeatIndex) => {
      expect(queue.jobFor(project.id, index)?.video_url).toBe(before.get(index));
    });
    expect(queue.jobFor(project.id, 3)?.video_url).not.toBe(before.get(3));
  });
});

describe('持久化与订阅', () => {
  it('任务落在注入的 store 里，换个队列实例仍读得到', async () => {
    const store = createMemoryJobStore();
    const first = createGenerateQueue({ store });
    const { project, beat } = createBeat1Sample();

    first.enqueue(project, beat);
    await first.drain();

    const second = createGenerateQueue({ store });
    expect(second.jobFor(project.id, 1)?.status).toBe('SUCCEEDED');
  });

  it('每次状态流转都会通知订阅者', async () => {
    const { queue } = harness();
    const { project, beat } = createBeat1Sample();
    const seen: string[] = [];
    const unsubscribe = queue.subscribe((jobs: readonly GenerateJob[]) => {
      seen.push(jobs.map((job) => job.status).join(','));
    });

    queue.enqueue(project, beat);
    await queue.drain();
    unsubscribe();
    queue.reset();

    expect(seen).toEqual(['PENDING', 'RUNNING', 'SUCCEEDED']);
  });

  it('reset 清空全部任务', async () => {
    const { queue } = harness();
    const project = createFilledEpisode();
    queue.enqueueEpisode(project);
    await queue.drain();
    queue.reset();
    expect(queue.jobs()).toHaveLength(0);
  });
});

/**
 * `onSettle` 是生成结果落库的挂点（`store/generateResults.ts`）。
 * 它必须挂在状态机上而不是某个组件的订阅上：组件会卸载，状态机不会。
 */
describe('终态挂点 onSettle', () => {
  it('终态即回调，带的是落库后的终态快照', async () => {
    const onSettle = vi.fn<(job: GenerateJob) => void>();
    const { queue } = harness(undefined, onSettle);
    const { project, beat } = createBeat1Sample();

    queue.enqueue(project, beat);
    await queue.drain();

    expect(onSettle).toHaveBeenCalledTimes(1);
    const settled = onSettle.mock.calls[0]?.[0] as GenerateJob;
    expect(settled.status).toBe('SUCCEEDED');
    expect(settled.beat_index).toBe(1);
    expect(settled.video_url).toContain('stub://seedance-2.5/b1/');
    expect(settled.prompt_snapshot).toContain('漫剧厚涂画风');
  });

  it('失败同样回调一次：失败也是要落库的结果', async () => {
    const onSettle = vi.fn<(job: GenerateJob) => void>();
    const { queue } = harness(
      createScriptedTransport([{ ok: false, failure: upstreamFailure('网关超时') }]),
      onSettle,
    );
    const { project, beat } = createBeat1Sample();

    queue.enqueue(project, beat);
    await queue.drain();

    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle.mock.calls[0]?.[0].status).toBe('FAILED');
  });

  it('待生成与生成中不回调：在途状态不是结果', async () => {
    const onSettle = vi.fn<(job: GenerateJob) => void>();
    const { transport, settle } = deferredTransport();
    const { queue } = harness(transport, onSettle);
    const { project, beat } = createBeat1Sample();

    queue.enqueue(project, beat);
    expect(onSettle).not.toHaveBeenCalled();

    const running = queue.runNext();
    expect(queue.jobFor(project.id, 1)?.status).toBe('RUNNING');
    expect(onSettle).not.toHaveBeenCalled();

    settle({ ok: true, video_url: 'stub://ok.mp4' });
    await running;
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it('前置校验阻断的提交不回调：没有任务，也就没有结果', () => {
    const onSettle = vi.fn<(job: GenerateJob) => void>();
    const { queue } = harness(undefined, onSettle);
    const { project, beat } = createBeat1Sample();
    beat.duration_sec = MAX_BEAT_DURATION_SEC + 1;

    expect(queue.enqueue(project, beat).status).toBe('blocked');
    expect(onSettle).not.toHaveBeenCalled();
  });

  it('整集生成逐板回调五次，板序即 B1 → B5', async () => {
    const seen: BeatIndex[] = [];
    const { queue } = harness(undefined, (job) => seen.push(job.beat_index));
    const project = createFilledEpisode();

    queue.enqueueEpisode(project);
    await queue.drain();

    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('终态判定取自迁移表，不另立一份枚举', () => {
    expect(isTerminalStatus('SUCCEEDED')).toBe(true);
    expect(isTerminalStatus('FAILED')).toBe(true);
    expect(isTerminalStatus('PENDING')).toBe(false);
    expect(isTerminalStatus('RUNNING')).toBe(false);
    GENERATE_JOB_STATUSES.forEach((status) => {
      expect(isTerminalStatus(status)).toBe(GENERATE_STATUS_TRANSITIONS[status].length === 0);
    });
  });
});
