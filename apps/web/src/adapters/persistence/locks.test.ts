/**
 * 结构锁断言的红线回归（`RULE-3` 宫格锁、`RULE-7` 帧序锁、`RULE-9` 转场隔离、
 * `RULE-11` 无镜头级拆解）。
 */

import { describe, expect, it } from 'vitest';
import { frameCountFor } from '../../domain/beats';
import type { NewProjectInput } from '../../domain/projects';
import { CANON_TOTAL_DURATION_SEC, createEmptyProject } from '../../store/projectFactory';
import {
  FORBIDDEN_BEAT_FIELDS,
  ProjectLockError,
  assertProjectLocks,
  normalizeProject,
} from './locks';
import type { StoredBeat, StoredProject } from './schema';

const input: NewProjectInput = {
  name: '第一集',
  genre: '末世·爽剧',
  aspect_ratio: '9:16',
  total_duration_sec: CANON_TOTAL_DURATION_SEC,
  style_prompt: '冷调赛博废土',
  protagonist: '短发女青年',
};

const project = (): StoredProject => createEmptyProject(input, 'prj_1', '2026-08-27T00:00:00.000Z');

/** 落库结构在库里就是普通 JSON；测试要模拟"手改过的库"，得先脱掉运行时锁。 */
function asPlain(source: StoredProject): StoredProject {
  return JSON.parse(JSON.stringify(source)) as StoredProject;
}

function withBeats(
  source: StoredProject,
  mutate: (beat: StoredBeat, at: number) => unknown,
): StoredProject {
  const plain = asPlain(source);
  plain.beat_list.forEach((beat, at) => mutate(beat, at));
  return plain;
}

describe('宫格锁（RULE-3 / FR-1-03）', () => {
  it('新建项目的宫格数由板序锁定：B1–B4 三格、B5 两格', () => {
    expect(project().beat_list.map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
  });

  it('库里的宫格数被手改后归一回板序锁定值', () => {
    const tampered = withBeats(project(), (beat) => {
      (beat as { frame_count: number }).frame_count = 3;
    });

    const normalized = normalizeProject(tampered);
    expect(normalized.beat_list.map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
    expect(normalized.beat_list[4]?.frames).toHaveLength(2);
  });

  it('归一后的板不接受改写宫格数', () => {
    const beat = normalizeProject(asPlain(project())).beat_list[0];
    expect(() => {
      (beat as unknown as { frame_count: number }).frame_count = 2;
    }).toThrow(TypeError);
  });
});

describe('帧序锁（RULE-7 / R4）', () => {
  it('新建项目的帧位恒为左 → 右', () => {
    for (const beat of project().beat_list) {
      expect(beat.frames.map((frame) => frame.order)).toEqual(
        Array.from({ length: frameCountFor(beat.index) }, (_, i) => i + 1),
      );
    }
  });

  it('帧位被打乱时归一回左 → 右，且按帧位取回各自的文案', () => {
    const scrambled = withBeats(project(), (beat) => {
      (beat as { frames: unknown }).frames = [
        { order: 3, semantic: null, text: '丙' },
        { order: 1, semantic: null, text: '甲' },
        { order: 2, semantic: null, text: '乙' },
      ].slice(0, frameCountFor(beat.index));
    });

    const normalized = normalizeProject(scrambled);
    expect(normalized.beat_list[0]?.frames.map((frame) => frame.order)).toEqual([1, 2, 3]);
    // 归一按 order 认领文案，不按数组下标：手改过的库里下标已经不可信。
    expect(normalized.beat_list[0]?.frames.map((frame) => frame.text)).toEqual(['甲', '乙', '丙']);
  });

  it('帧槽位缺失时补空格而不是崩在下标访问上', () => {
    const truncated = withBeats(project(), (beat) => {
      (beat as { frames: unknown }).frames = [{ order: 1, semantic: null, text: '只剩一格' }];
    });

    const normalized = normalizeProject(truncated);
    expect(normalized.beat_list[0]?.frames.map((frame) => frame.text)).toEqual(['只剩一格', '', '']);
  });

  it('归一后的帧数组不接受增删', () => {
    const beat = normalizeProject(asPlain(project())).beat_list[0];
    expect(() =>
      (beat.frames as unknown as { push: (v: unknown) => number }).push({}),
    ).toThrow(TypeError);
  });
});

describe('五节拍锁（RULE-2 / AC-6.1）', () => {
  it('板数不为 5 即拒绝', () => {
    const plain = asPlain(project());
    (plain as { beat_list: unknown }).beat_list = plain.beat_list.slice(0, 4);
    expect(() => normalizeProject(plain)).toThrow(ProjectLockError);
  });

  it('板序被改序即拒绝', () => {
    const plain = asPlain(project());
    (plain as { beat_list: unknown }).beat_list = [...plain.beat_list].reverse();
    expect(() => normalizeProject(plain)).toThrow(ProjectLockError);
  });

  it('板序越界即拒绝', () => {
    const plain = withBeats(project(), (beat, at) => {
      if (at === 0) {
        (beat as { index: number }).index = 9;
      }
    });
    expect(() => normalizeProject(plain)).toThrow(ProjectLockError);
  });
});

describe('时长上限（RULE-4）', () => {
  it('单板超过 30s 即拒绝，不静默夹紧', () => {
    const plain = withBeats(project(), (beat, at) => {
      if (at === 0) {
        (beat as { duration_sec: number }).duration_sec = 31;
      }
    });
    expect(() => normalizeProject(plain)).toThrow(ProjectLockError);
  });
});

describe('转场隔离（RULE-9 / AC-6.4）', () => {
  it('封闭目录外的衔接手法即拒绝', () => {
    const plain = withBeats(project(), (beat, at) => {
      if (at === 0) {
        (beat as { transition_rule: string }).transition_rule = '花式转场';
      }
    });
    expect(() => normalizeProject(plain)).toThrow(ProjectLockError);
  });

  it('衔接手法出现在 Prompt 快照里即拒绝', () => {
    const plain = withBeats(project(), (beat, at) => {
      if (at === 0) {
        (beat as { prompt_final: string }).prompt_final = `画面描述。衔接：${beat.transition_rule}`;
      }
    });
    expect(() => normalizeProject(plain)).toThrow(/衔接手法泄漏进 Prompt 快照/);
  });

  it('备注出现在 Prompt 快照里即拒绝', () => {
    const plain = withBeats(project(), (beat, at) => {
      if (at === 0) {
        (beat as { note: string }).note = '这里要留给后期对轨';
        (beat as { prompt_final: string }).prompt_final = '画面描述。这里要留给后期对轨';
      }
    });
    expect(() => normalizeProject(plain)).toThrow(/备注泄漏进 Prompt 快照/);
  });

  it('干净的 Prompt 快照不触发断言', () => {
    const plain = withBeats(project(), (beat) => {
      (beat as { prompt_final: string }).prompt_final = '冷调赛博废土，短发女青年，紧张压迫。';
    });
    expect(() => normalizeProject(plain)).not.toThrow();
  });
});

describe('无镜头级拆解（RULE-11 / AC-6.8）', () => {
  it('节拍上出现镜头级字段即拒绝', () => {
    for (const field of FORBIDDEN_BEAT_FIELDS) {
      const tainted = withBeats(project(), (beat, at) => {
        if (at === 0) {
          (beat as unknown as Record<string, unknown>)[field] = '违规值';
        }
      });

      expect(() => assertProjectLocks(tainted)).toThrow(/概念级禁止/);
      // 归一不能把违规字段"洗掉"：重铸前必须先拒绝，否则脏数据会被静默接受。
      expect(() => normalizeProject(tainted)).toThrow(/概念级禁止/);
    }
  });

  it('合法项目不触发任何断言', () => {
    expect(() => assertProjectLocks(project())).not.toThrow();
  });
});
