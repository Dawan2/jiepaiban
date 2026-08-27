/**
 * 项目铸造的结构锁回归（PRD §5.1 / §7.1 / §7.2，`RULE-2` / `RULE-3`）。
 * 这些断言是产品红线的护栏：改动这里的期望值等于改产品定义，须先动方法论文档。
 */

import { describe, expect, it } from 'vitest';
import { BEAT_COUNT, BEAT_DEFS, MAX_BEAT_DURATION_SEC } from '../domain/beats';
import { hydrateProject, type NewProjectInput } from '../domain/projects';
import {
  assertProjectLocks,
  ProjectLockError,
  rebuildBeat,
  type StoredProject,
} from '../adapters/persistence';
import {
  CANON_BEAT_DURATIONS,
  CANON_TOTAL_DURATION_SEC,
  canonBeatDurations,
  createEmptyProject,
  reuseProject,
  setArchived,
} from './projectFactory';

const input: NewProjectInput = {
  name: '重生之我在末世卖煎饼',
  genre: '末世·爽剧',
  aspect_ratio: '9:16',
  total_duration_sec: CANON_TOTAL_DURATION_SEC,
  style_prompt: '冷调赛博废土，胶片颗粒',
  protagonist: '短发女青年，机能风冲锋衣',
};

const NOW = '2026-08-27T00:00:00.000Z';

function newProject(overrides: Partial<NewProjectInput> = {}): StoredProject {
  return createEmptyProject({ ...input, ...overrides }, 'prj_1', NOW);
}

/** 落库结构在库里就是普通 JSON；要模拟"手改过的库"，得先脱掉运行时锁。 */
function asPlain(source: StoredProject): StoredProject {
  return JSON.parse(JSON.stringify(source)) as StoredProject;
}

/** 一个填满内容、已生成视频的项目，用于验证复用的清空行为。 */
function filledProject(): StoredProject {
  const { beat_list: stored, ...fields } = newProject();
  const beats = stored.map((beat) => {
    const copy = rebuildBeat(beat);
    copy.plot_core = `第 ${beat.index} 板的剧情核心`;
    copy.emotion = '紧张压迫的情绪';
    copy.camera_rhythm = '极快切入，三段递进';
    copy.status = 'generated';
    copy.note = `第 ${beat.index} 板备注`;
    copy.prompt_final = `漫剧厚涂画风… 时长${beat.duration_sec}秒`;
    copy.video_url = `https://cdn.example.com/${beat.index}.mp4`;
    copy.frames.forEach((frame) => {
      frame.text = `第 ${beat.index} 板第 ${frame.order} 格画面`;
    });
    return copy;
  });
  return hydrateProject(fields, beats);
}

describe('五节拍锁（RULE-2 / AC-6.1）', () => {
  it('createEmptyProject 恒产出 5 块板，序号 1–5', () => {
    const project = newProject();
    expect(project.beat_list).toHaveLength(BEAT_COUNT);
    expect(project.beat_list.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('产出的板列表不接受增删改序', () => {
    const beats = newProject().beat_list;
    expect(() => (beats as unknown as { push: (v: unknown) => number }).push({})).toThrow(TypeError);
    expect(() => (beats as unknown as { reverse: () => unknown }).reverse()).toThrow(TypeError);
  });

  it('不存在第 6 块板：多一块即被结构锁拒绝', () => {
    const plain = asPlain(newProject());
    const sixth = plain.beat_list[4];
    if (sixth === undefined) {
      throw new Error('缺少第 5 块板');
    }
    (plain as { beat_list: unknown }).beat_list = [...plain.beat_list, sixth];

    expect(plain.beat_list).toHaveLength(6);
    expect(() => assertProjectLocks(plain)).toThrow(ProjectLockError);
    expect(() => assertProjectLocks(plain)).toThrow(/五节拍锁被破坏/);
  });

  it('少一块板同样被拒绝', () => {
    const plain = asPlain(newProject());
    (plain as { beat_list: unknown }).beat_list = plain.beat_list.slice(0, 4);
    expect(() => assertProjectLocks(plain)).toThrow(/五节拍锁被破坏/);
  });

  it('改序被拒绝（顺序恒为 1–5）', () => {
    const plain = asPlain(newProject());
    (plain as { beat_list: unknown }).beat_list = [...plain.beat_list].reverse();
    expect(() => assertProjectLocks(plain)).toThrow(/不可改序/);
  });

  it('本模块不导出任何增删板的能力', async () => {
    const moduleExports = Object.keys(await import('./projectFactory'));
    const mutators = moduleExports.filter((name) =>
      /^(add|append|insert|remove|delete)/i.test(name),
    );
    expect(mutators).toEqual([]);
  });
});

describe('宫格锁（RULE-3 / FR-1-03）', () => {
  it('B1–B4 三宫格、B5 两宫格，由板序推导', () => {
    expect(newProject().beat_list.map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
  });

  it('B5 只有 2 个帧槽位，没有第 3 格可填', () => {
    const fifth = newProject().beat_list[4];
    expect(fifth?.frame_count).toBe(2);
    expect(fifth?.frames).toHaveLength(2);
  });

  it('宫格数被改成非锁定值即拒绝落库', () => {
    const plain = asPlain(newProject());
    plain.beat_list.forEach((beat) => {
      if (beat.index === 5) {
        (beat as { frame_count: number }).frame_count = 3;
      }
    });
    expect(() => assertProjectLocks(plain)).toThrow(/宫格锁被破坏/);
  });

  it('铸出的板不接受改写宫格数', () => {
    const beat = newProject().beat_list[4];
    expect(() => {
      (beat as unknown as { frame_count: number }).frame_count = 3;
    }).toThrow(TypeError);
  });
});

describe('基准表时长（METH-003 §1 / RULE-4 / RULE-5）', () => {
  it('默认按基准表落 8 / 17 / 20 / 25 / 18 秒，合计 88 秒', () => {
    expect(newProject().beat_list.map((beat) => beat.duration_sec)).toEqual([
      ...CANON_BEAT_DURATIONS,
    ]);
    expect(CANON_BEAT_DURATIONS.reduce((a, b) => a + b, 0)).toBe(CANON_TOTAL_DURATION_SEC);
  });

  it('基准表直接取自领域层的 canon，不另抄一份', () => {
    expect([...CANON_BEAT_DURATIONS]).toEqual(BEAT_DEFS.map((def) => def.duration_sec));
  });

  it('目标时长变化时按比例摊分，总和精确等于目标值', () => {
    for (const total of [70, 75, 80, 88, 90]) {
      const durations = canonBeatDurations(total);
      expect(durations).toHaveLength(BEAT_COUNT);
      expect(durations.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('新建时把板时长摊到目标总时长', () => {
    const project = newProject({ total_duration_sec: 70 });
    expect(project.beat_list.reduce((sum, beat) => sum + beat.duration_sec, 0)).toBe(70);
  });

  it('单板时长永不超过 30 秒硬上限（RULE-4）', () => {
    const durations = canonBeatDurations(300);
    expect(Math.max(...durations)).toBeLessThanOrEqual(MAX_BEAT_DURATION_SEC);
  });

  it('时间位是规格而非派生值：摊时长不移动 canon 时间位', () => {
    const project = newProject({ total_duration_sec: 70 });
    expect(project.beat_list.map((beat) => [beat.time_start, beat.time_end])).toEqual(
      BEAT_DEFS.map((def) => [def.time_start, def.time_end]),
    );
  });

  it('衔接按 canon 预置，B5 为黑屏断钩子', () => {
    expect(newProject().beat_list.map((beat) => beat.transition_rule)).toEqual(
      BEAT_DEFS.map((def) => def.transition_rule),
    );
  });
});

describe('生成期字段（PRD §8.2）', () => {
  it('新建项目的 video_url / prompt_final 都是空位', () => {
    const project = newProject();
    expect(project.beat_list.every((beat) => beat.video_url === null)).toBe(true);
    expect(project.beat_list.every((beat) => beat.prompt_final === null)).toBe(true);
  });
});

describe('复用项目（PRD §7.2）', () => {
  it('清空画面文案：所有节拍帧回到空态', () => {
    const copy = reuseProject(filledProject(), 'prj_2', NOW);

    const texts = copy.beat_list.flatMap((beat) => beat.frames.map((frame) => frame.text));
    // 帧槽位总数 = 3+3+3+3+2 = 14，没有"保留的第 3 格草稿"。
    expect(texts).toHaveLength(14);
    expect(texts.every((text) => text === '')).toBe(true);
  });

  it('清空 Prompt 快照、视频地址与生成状态', () => {
    const copy = reuseProject(filledProject(), 'prj_2', NOW);

    expect(copy.beat_list.every((beat) => beat.prompt_final === null)).toBe(true);
    expect(copy.beat_list.every((beat) => beat.video_url === null)).toBe(true);
    expect(copy.beat_list.every((beat) => beat.status === 'empty')).toBe(true);
  });

  it('继承结构：板数、板序、语义、宫格数、时长与衔接原样保留', () => {
    const source = filledProject();
    const copy = reuseProject(source, 'prj_2', NOW);

    expect(copy.beat_list).toHaveLength(BEAT_COUNT);
    expect(copy.beat_list.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
    expect(copy.beat_list.map((beat) => beat.beat_type)).toEqual(
      source.beat_list.map((beat) => beat.beat_type),
    );
    expect(copy.beat_list.map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
    expect(copy.beat_list.map((beat) => beat.duration_sec)).toEqual(
      source.beat_list.map((beat) => beat.duration_sec),
    );
    expect(copy.beat_list.map((beat) => beat.transition_rule)).toEqual(
      source.beat_list.map((beat) => beat.transition_rule),
    );
  });

  it('继承板级情绪 / 镜头节奏 / 剧情核心（PRD §7.2「继承」列）', () => {
    const source = filledProject();
    const copy = reuseProject(source, 'prj_2', NOW);

    expect(copy.beat_list.map((beat) => beat.plot_core)).toEqual(
      source.beat_list.map((beat) => beat.plot_core),
    );
    expect(copy.beat_list.map((beat) => beat.emotion)).toEqual(
      source.beat_list.map((beat) => beat.emotion),
    );
    expect(copy.beat_list.map((beat) => beat.camera_rhythm)).toEqual(
      source.beat_list.map((beat) => beat.camera_rhythm),
    );
  });

  it('继承项目级参数，只换 id / 名称 / 时间戳', () => {
    const source = filledProject();
    const copy = reuseProject(source, 'prj_2', '2026-09-01T00:00:00.000Z');

    expect(copy.genre).toBe(source.genre);
    expect(copy.aspect_ratio).toBe(source.aspect_ratio);
    expect(copy.total_duration_sec).toBe(source.total_duration_sec);
    expect(copy.style_prompt).toBe(source.style_prompt);
    expect(copy.protagonist).toBe(source.protagonist);

    expect(copy.id).toBe('prj_2');
    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe(`${source.name} · 复用`);
    expect(copy.created_at).toBe('2026-09-01T00:00:00.000Z');
    expect(copy.reused_from_id).toBe(source.id);
  });

  it('复用是复制而非移动：源项目内容不受影响', () => {
    const source = filledProject();
    reuseProject(source, 'prj_2', NOW);

    expect(source.beat_list[0]?.frames[0]?.text).toBe('第 1 板第 1 格画面');
    expect(source.beat_list[0]?.video_url).not.toBeNull();
    expect(source.beat_list[0]?.status).toBe('generated');
  });

  it('复用产物仍是合法的 5 板锁定结构', () => {
    const copy = reuseProject(filledProject(), 'prj_2', NOW);
    expect(() => assertProjectLocks(copy)).not.toThrow();
  });

  it('复用产物默认不在归档态', () => {
    const archived = setArchived(filledProject(), true, NOW);
    expect(reuseProject(archived, 'prj_2', NOW).archived).toBe(false);
  });
});

describe('归档（列表页收起，数据保留）', () => {
  it('归档只改 archived 与 updated_at，板结构原样保留', () => {
    const source = filledProject();
    const archived = setArchived(source, true, '2026-09-01T00:00:00.000Z');

    expect(archived.archived).toBe(true);
    expect(archived.updated_at).toBe('2026-09-01T00:00:00.000Z');
    expect(archived.beat_list.map((beat) => beat.video_url)).toEqual(
      source.beat_list.map((beat) => beat.video_url),
    );
    expect(() => assertProjectLocks(archived)).not.toThrow();
  });
});
