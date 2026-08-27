/**
 * 项目铸造的结构锁回归（PRD §5.1 / §7.1 / §7.2，`RULE-2` / `RULE-3`）。
 * 这些断言是产品红线的护栏：改动这里的期望值等于改产品定义，须先动方法论文档。
 */

import { describe, expect, it } from 'vitest';
import { BEAT_COUNT } from '../domain/beats';
import type { NewProjectInput } from '../domain/projects';
import { assertProjectLocks, ProjectLockError, type StoredProject } from '../adapters/persistence';
import {
  CANON_BEAT_DURATIONS,
  CANON_TOTAL_DURATION_SEC,
  CANON_TRANSITIONS,
  MAX_BEAT_DURATION_SEC,
  canonBeatDurations,
  createEmptyProject,
  reuseProject,
  setArchived,
} from './projectFactory';

const input: NewProjectInput = {
  name: '重生之我在末世卖煎饼',
  genre: '末世·爽剧',
  aspectRatio: '9:16',
  episodeDurationSec: CANON_TOTAL_DURATION_SEC,
  stylePrompt: '冷调赛博废土，胶片颗粒',
  protagonist: '短发女青年，机能风冲锋衣',
};

const NOW = '2026-08-27T00:00:00.000Z';

function newProject(overrides: Partial<NewProjectInput> = {}): StoredProject {
  return createEmptyProject({ ...input, ...overrides }, 'prj_1', NOW);
}

/** 一个填满内容、已生成视频的项目，用于验证复用的清空行为。 */
function filledProject(): StoredProject {
  const project = newProject();
  return {
    ...project,
    beats: project.beats.map((beat) => ({
      ...beat,
      summary: `第 ${beat.index} 拍的剧情概要`,
      tone: '紧张' as const,
      status: 'generated' as const,
      note: `第 ${beat.index} 拍备注`,
      promptFinal: `漫剧厚涂画风… 时长${beat.durationSec}秒`,
      videoUrl: `https://cdn.example.com/${beat.index}.mp4`,
      cells: [
        { order: 1 as const, description: `第 ${beat.index} 拍第 1 格画面` },
        { order: 2 as const, description: `第 ${beat.index} 拍第 2 格画面` },
        { order: 3 as const, description: `第 ${beat.index} 拍第 3 格画面` },
      ],
    })),
  };
}

describe('五节拍锁（RULE-2 / AC-6.1）', () => {
  it('createEmptyProject 恒产出 5 块板，序号 1–5', () => {
    const project = newProject();
    expect(project.beats).toHaveLength(BEAT_COUNT);
    expect(project.beats.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('不存在第 6 块板：多一块即被结构锁拒绝', () => {
    const project = newProject();
    const sixth = project.beats[4];
    if (sixth === undefined) {
      throw new Error('缺少第 5 块板');
    }

    const withSixth: StoredProject = { ...project, beats: [...project.beats, { ...sixth }] };

    expect(withSixth.beats).toHaveLength(6);
    expect(() => assertProjectLocks(withSixth)).toThrow(ProjectLockError);
    expect(() => assertProjectLocks(withSixth)).toThrow(/五节拍锁被破坏/);
  });

  it('少一块板同样被拒绝', () => {
    const project = newProject();
    const withFour: StoredProject = { ...project, beats: project.beats.slice(0, 4) };
    expect(() => assertProjectLocks(withFour)).toThrow(/五节拍锁被破坏/);
  });

  it('改序被拒绝（顺序恒为 1–5）', () => {
    const project = newProject();
    const reordered: StoredProject = { ...project, beats: [...project.beats].reverse() };
    expect(() => assertProjectLocks(reordered)).toThrow(/不可改序/);
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
    expect(newProject().beats.map((beat) => beat.gridSize)).toEqual([3, 3, 3, 3, 2]);
  });

  it('B5 只组装 2 格，但槽位仍保留 3 格数据', () => {
    const fifth = newProject().beats[4];
    expect(fifth?.gridSize).toBe(2);
    expect(fifth?.cells).toHaveLength(3);
  });

  it('宫格数被改成非锁定值即拒绝落库', () => {
    const project = newProject();
    const tampered: StoredProject = {
      ...project,
      beats: project.beats.map((beat) => (beat.index === 5 ? { ...beat, gridSize: 3 } : beat)),
    };
    expect(() => assertProjectLocks(tampered)).toThrow(/宫格锁被破坏/);
  });
});

describe('基准表时长（PRD §5.1 / RULE-4 / RULE-5）', () => {
  it('默认按基准表落 8 / 17 / 20 / 25 / 18 秒，合计 88 秒', () => {
    expect(newProject().beats.map((beat) => beat.durationSec)).toEqual([...CANON_BEAT_DURATIONS]);
    expect(CANON_BEAT_DURATIONS.reduce((a, b) => a + b, 0)).toBe(CANON_TOTAL_DURATION_SEC);
  });

  it('目标时长变化时按比例摊分，总和精确等于目标值', () => {
    for (const total of [70, 75, 80, 88, 90]) {
      const durations = canonBeatDurations(total);
      expect(durations).toHaveLength(BEAT_COUNT);
      expect(durations.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('单板时长永不超过 30 秒硬上限（RULE-4）', () => {
    const durations = canonBeatDurations(300);
    expect(Math.max(...durations)).toBeLessThanOrEqual(MAX_BEAT_DURATION_SEC);
  });

  it('衔接按基准表预置，B5 为黑屏截断', () => {
    expect(newProject().beats.map((beat) => beat.transition)).toEqual([...CANON_TRANSITIONS]);
  });
});

describe('复用项目（PRD §7.2）', () => {
  it('清空画面文案：所有节拍帧回到空态', () => {
    const copy = reuseProject(filledProject(), 'prj_2', NOW);

    const descriptions = copy.beats.flatMap((beat) => beat.cells.map((cell) => cell.description));
    expect(descriptions).toHaveLength(BEAT_COUNT * 3);
    expect(descriptions.every((text) => text === '')).toBe(true);
  });

  it('清空 Prompt 快照、视频地址与生成状态', () => {
    const copy = reuseProject(filledProject(), 'prj_2', NOW);

    expect(copy.beats.every((beat) => beat.promptFinal === null)).toBe(true);
    expect(copy.beats.every((beat) => beat.videoUrl === null)).toBe(true);
    expect(copy.beats.every((beat) => beat.status === 'empty')).toBe(true);
  });

  it('继承结构：板数、板序、语义、宫格数、时长与衔接原样保留', () => {
    const source = filledProject();
    const copy = reuseProject(source, 'prj_2', NOW);

    expect(copy.beats).toHaveLength(BEAT_COUNT);
    expect(copy.beats.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
    expect(copy.beats.map((beat) => beat.role)).toEqual(source.beats.map((beat) => beat.role));
    expect(copy.beats.map((beat) => beat.gridSize)).toEqual([3, 3, 3, 3, 2]);
    expect(copy.beats.map((beat) => beat.durationSec)).toEqual(
      source.beats.map((beat) => beat.durationSec),
    );
    expect(copy.beats.map((beat) => beat.transition)).toEqual(
      source.beats.map((beat) => beat.transition),
    );
  });

  it('继承项目级参数，只换 id / 名称 / 时间戳', () => {
    const source = filledProject();
    const copy = reuseProject(source, 'prj_2', '2026-09-01T00:00:00.000Z');

    expect(copy.genre).toBe(source.genre);
    expect(copy.aspectRatio).toBe(source.aspectRatio);
    expect(copy.episodeDurationSec).toBe(source.episodeDurationSec);
    expect(copy.stylePrompt).toBe(source.stylePrompt);
    expect(copy.protagonist).toBe(source.protagonist);

    expect(copy.id).toBe('prj_2');
    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe(`${source.name} · 复用`);
    expect(copy.createdAt).toBe('2026-09-01T00:00:00.000Z');
    expect(copy.reusedFromId).toBe(source.id);
  });

  it('复用是复制而非移动：源项目内容不受影响', () => {
    const source = filledProject();
    reuseProject(source, 'prj_2', NOW);

    expect(source.beats[0]?.cells[0]?.description).toBe('第 1 拍第 1 格画面');
    expect(source.beats[0]?.videoUrl).not.toBeNull();
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
