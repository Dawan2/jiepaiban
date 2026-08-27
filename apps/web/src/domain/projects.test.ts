/**
 * 项目创建与 beat_list 恒等 5（METH-002 §10、PRD 5.1 / §9.3 / AC-6.1）。
 */

import { describe, expect, it } from 'vitest';
import {
  BASELINE_EPISODE_DURATION_SEC,
  BEAT_COUNT,
  EPISODE_DURATION_RANGE_SEC,
  type BeatIndex,
} from './beats';
import {
  DEFAULT_ASPECT_RATIO,
  beatAt,
  beatCompletion,
  createEmptyProject,
  createProject,
  episodeDuration,
  isEpisodeDurationValid,
  isNewProjectValid,
  isProjectReady,
  validateProject,
  type NewProjectInput,
} from './projects';

const input: NewProjectInput = {
  name: '重生之我在末世卖煎饼',
  genre: '末世·爽剧',
  aspect_ratio: '9:16',
  style_prompt: '冷调赛博废土，胶片颗粒',
  protagonist: '短发女青年，机能风冲锋衣',
};

describe('createEmptyProject(name)', () => {
  it('只给名字就能建出项目，beat_list 长度恒为 5', () => {
    const project = createEmptyProject('新项目');
    expect(project.name).toBe('新项目');
    expect(project.beat_list).toHaveLength(BEAT_COUNT);
    expect(project.beat_list.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('五板按 canon 预填名称与时长', () => {
    const project = createEmptyProject('新项目');
    expect(project.beat_list.map((beat) => beat.title)).toEqual([
      '开篇钩子',
      '矛盾建立',
      '打压升级',
      '反转蓄力',
      '断集留客',
    ]);
    expect(project.beat_list.map((beat) => beat.duration_sec)).toEqual([8, 17, 20, 25, 18]);
    expect(project.beat_list.map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
  });

  it('默认画幅 9:16，整集时长取 88s 基准轴', () => {
    const project = createEmptyProject('新项目');
    expect(project.aspect_ratio).toBe(DEFAULT_ASPECT_RATIO);
    expect(DEFAULT_ASPECT_RATIO).toBe('9:16');
    expect(project.total_duration_sec).toBe(BASELINE_EPISODE_DURATION_SEC);
  });

  it('五板时长之和等于整集时长，且落在 70–90s 区间', () => {
    const project = createEmptyProject('新项目');
    expect(episodeDuration(project)).toBe(BASELINE_EPISODE_DURATION_SEC);
    expect(isEpisodeDurationValid(episodeDuration(project))).toBe(true);
  });

  it('id 可注入，也可自动生成且互不重复', () => {
    expect(createEmptyProject('a', { id: 'prj_fixed' }).id).toBe('prj_fixed');
    const ids = Array.from({ length: 5 }, () => createEmptyProject('a').id);
    expect(new Set(ids).size).toBe(5);
  });

  it('刚建出来的项目即通过红线校验，但尚未就绪', () => {
    const project = createEmptyProject('新项目');
    expect(validateProject(project)).toEqual([]);
    expect(isProjectReady(project)).toBe(false);
  });

  it('两个项目的 beat_list 互相独立', () => {
    const a = createEmptyProject('a');
    const b = createEmptyProject('b');
    beatAt(a, 1).plot_core = '只改 a';
    expect(beatAt(b, 1).plot_core).toBe('');
  });
});

describe('createProject（强制字段齐备）', () => {
  it('强制字段齐备才可创建', () => {
    expect(isNewProjectValid(input)).toBe(true);
    expect(isNewProjectValid({ ...input, name: '   ' })).toBe(false);
    expect(isNewProjectValid({ ...input, genre: '' })).toBe(false);
    expect(isNewProjectValid({ ...input, style_prompt: '' })).toBe(false);
    expect(isNewProjectValid({ ...input, protagonist: '' })).toBe(false);
  });

  it('整集时长必须落在 70–90s', () => {
    expect(isNewProjectValid({ ...input, total_duration_sec: 88 })).toBe(true);
    expect(isNewProjectValid({ ...input, total_duration_sec: 70 })).toBe(true);
    expect(isNewProjectValid({ ...input, total_duration_sec: 90 })).toBe(true);
    expect(isNewProjectValid({ ...input, total_duration_sec: 69 })).toBe(false);
    expect(isNewProjectValid({ ...input, total_duration_sec: 91 })).toBe(false);
    expect(EPISODE_DURATION_RANGE_SEC).toEqual({ min: 70, max: 90 });
  });

  it('创建成功后项目恒带 5 块板（AC-6.1）', () => {
    const project = createProject(input, { id: 'prj_1', now: '2026-08-27T00:00:00Z' });
    expect(project.beat_list).toHaveLength(BEAT_COUNT);
    expect(project.genre).toBe(input.genre);
    expect(project.style_prompt).toBe(input.style_prompt);
    expect(project.protagonist).toBe(input.protagonist);
    expect(project.updated_at).toBe('2026-08-27T00:00:00Z');
    expect(validateProject(project)).toEqual([]);
  });
});

describe('完成度与取板', () => {
  it('完成度分母恒为 5', () => {
    const project = createProject(input, { id: 'prj_1', now: '2026-08-27T00:00:00Z' });
    expect(beatCompletion(project)).toEqual({ filled: 0, total: 5 });

    beatAt(project, 1).status = 'generated';
    expect(beatCompletion(project)).toEqual({ filled: 1, total: 5 });

    project.beat_list.forEach((beat) => {
      beat.status = 'filled';
    });
    expect(beatCompletion(project)).toEqual({ filled: 5, total: 5 });
  });

  it('beatAt 按板序取板，越界抛错', () => {
    const project = createEmptyProject('新项目');
    expect(beatAt(project, 1).title).toBe('开篇钩子');
    expect(beatAt(project, 5).title).toBe('断集留客');
    expect(() => beatAt(project, 6 as unknown as BeatIndex)).toThrow(RangeError);
    expect(() => beatAt(project, 0 as unknown as BeatIndex)).toThrow(RangeError);
  });
});
