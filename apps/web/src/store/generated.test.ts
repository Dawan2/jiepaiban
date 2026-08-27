/**
 * 生成结果落库（PRD §8.2、AC-6.9）。
 *
 * 编辑页与成片页共用这一份判据，所以三条主张必须成立：
 * 1. **只写有新结果的板**，库内已一致时返回空——否则保存态会在每次重渲染里被推成 `dirty`；
 * 2. **只动点到的那块板**，其余四块的成片地址与文案原样（IX-4 只锁本板）；
 * 3. 写回后结构锁仍在，`prompt_final` 落的是任务快照（衔接进不去，AC-6.4）。
 */

import { describe, expect, it } from 'vitest';
import { assertProjectLocks, rebuildBeat } from '../adapters/persistence';
import { BEAT_COUNT, type BeatIndex } from '../domain/beats';
import { assemblePrompt } from '../domain/prompt';
import { hydrateProject } from '../domain/projects';
import { TRANSITION_RULES } from '../domain/transitions';
import type { GenerateBoardState } from '../generate/controller';
import { makeProject, withFilledBeats } from '../testing/harness';
import { pendingGeneratedStates, withGeneratedResults } from './generated';

function succeededState(index: BeatIndex, url: string, prompt = `快照 B${index}`): GenerateBoardState {
  return {
    beat_index: index,
    status: 'SUCCEEDED',
    status_label: '成功',
    job: {
      id: `job_${index}`,
      project_id: 'prj_1',
      beat_index: index,
      model: 'Seedance 2.5',
      prompt_snapshot: prompt,
      params: { duration_sec: 8, aspect_ratio: '9:16', frame_count: 3, g_index: 'G1' },
      idempotency_key: `k_${index}`,
      status: 'SUCCEEDED',
      attempt: 1,
      created_at: '2026-08-27T09:00:00.000Z',
      updated_at: '2026-08-27T09:12:00.000Z',
      video_url: url,
      failure: null,
    },
    video_url: url,
    failure: null,
    blocked_reason: null,
    can_generate: true,
    action_label: '重新生成',
  };
}

function pendingState(index: BeatIndex): GenerateBoardState {
  return {
    beat_index: index,
    status: 'PENDING',
    status_label: '待生成',
    job: null,
    video_url: null,
    failure: null,
    blocked_reason: null,
    can_generate: true,
    action_label: '生成本板',
  };
}

const project = () => withFilledBeats(makeProject('prj_1'));

describe('pendingGeneratedStates —— 什么算「有新结果」', () => {
  it('库里还没有的成片地址算新结果', () => {
    const pending = pendingGeneratedStates(project(), [succeededState(1, 'https://cdn/a.mp4')]);

    expect(pending.map((state) => state.beat_index)).toEqual([1]);
  });

  it('地址与库内一致时返回空数组（保存态不该被推成 dirty）', () => {
    const written = withGeneratedResults(project(), [succeededState(1, 'https://cdn/a.mp4')]);

    expect(pendingGeneratedStates(written, [succeededState(1, 'https://cdn/a.mp4')])).toEqual([]);
  });

  it('没有地址的状态一律不算新结果（待生成 / 在途 / 失败）', () => {
    expect(pendingGeneratedStates(project(), [pendingState(1)])).toEqual([]);
  });

  it('同一板换了新地址（重投成功）算新结果', () => {
    const written = withGeneratedResults(project(), [succeededState(1, 'https://cdn/a.mp4')]);

    const pending = pendingGeneratedStates(written, [succeededState(1, 'https://cdn/b.mp4')]);

    expect(pending.map((state) => state.video_url)).toEqual(['https://cdn/b.mp4']);
  });
});

describe('withGeneratedResults —— 怎么写回', () => {
  it('写回 video_url / prompt_final / status，结构锁仍在', () => {
    const written = withGeneratedResults(project(), [
      succeededState(2, 'https://cdn/b2.mp4', '第二板快照'),
    ]);
    const beat = written.beat_list[1];

    expect(beat.video_url).toBe('https://cdn/b2.mp4');
    expect(beat.prompt_final).toBe('第二板快照');
    expect(beat.status).toBe('generated');
    expect(written.beat_list).toHaveLength(BEAT_COUNT);
    expect(() => assertProjectLocks(written)).not.toThrow();
  });

  it('只动点到的那块板，其余四块原样（IX-4）', () => {
    const before = withGeneratedResults(project(), [
      succeededState(1, 'https://cdn/b1.mp4'),
      succeededState(3, 'https://cdn/b3.mp4'),
    ]);

    const after = withGeneratedResults(before, [succeededState(3, 'https://cdn/b3-new.mp4')]);

    expect(after.beat_list[0]?.video_url).toBe('https://cdn/b1.mp4');
    expect(after.beat_list[2]?.video_url).toBe('https://cdn/b3-new.mp4');
    expect(after.beat_list.map((beat) => beat.title)).toEqual(
      before.beat_list.map((beat) => beat.title),
    );
  });

  it('任务缺快照时保留库里那份 prompt_final，不写成 null', () => {
    const seeded = withGeneratedResults(project(), [succeededState(1, 'https://cdn/a.mp4', '旧快照')]);
    const withoutJob: GenerateBoardState = {
      ...succeededState(1, 'https://cdn/b.mp4'),
      job: null,
    };

    const written = withGeneratedResults(seeded, [withoutJob]);

    expect(written.beat_list[0]?.video_url).toBe('https://cdn/b.mp4');
    expect(written.beat_list[0]?.prompt_final).toBe('旧快照');
  });

  it('落库的 prompt_final 里没有任何衔接取值（AC-6.4）', () => {
    const source = project();
    const { beat_list: beats, ...fields } = source;
    // 逐板写满衔接与备注，再用真正的组装器出快照走一次写回。
    const seeded = hydrateProject(
      fields,
      beats.map((beat, at) => {
        const copy = rebuildBeat(beat);
        copy.transition_rule = TRANSITION_RULES[at % TRANSITION_RULES.length] ?? '纯硬切';
        copy.note = `备注哨兵${beat.index}`;
        return copy;
      }),
    );

    const written = withGeneratedResults(
      seeded,
      seeded.beat_list.map((beat) =>
        succeededState(
          beat.index,
          `https://cdn/${beat.index}.mp4`,
          assemblePrompt(seeded, beat),
        ),
      ),
    );

    written.beat_list.forEach((beat) => {
      const snapshot = beat.prompt_final ?? '';
      TRANSITION_RULES.forEach((rule) => {
        expect(snapshot).not.toContain(rule);
      });
      expect(snapshot).not.toContain('备注哨兵');
    });
    // 衔接本身照旧落库（后期合成要用），只是没进快照。
    expect(written.beat_list[0]?.transition_rule).toBe(TRANSITION_RULES[0]);
  });
});
