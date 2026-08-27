import { describe, expect, it } from 'vitest';
import { BEAT_COUNT } from './beats';
import { beatCompletion, createProject, isNewProjectValid, type NewProjectInput } from './projects';

const input: NewProjectInput = {
  name: '重生之我在末世卖煎饼',
  genre: '末世·爽剧',
  aspectRatio: '9:16',
  episodeDurationSec: 120,
  stylePrompt: '冷调赛博废土，胶片颗粒',
  protagonist: '短发女青年，机能风冲锋衣',
};

describe('项目创建（PRD 5.1）', () => {
  it('强制字段齐备才可创建', () => {
    expect(isNewProjectValid(input)).toBe(true);
    expect(isNewProjectValid({ ...input, name: '   ' })).toBe(false);
    expect(isNewProjectValid({ ...input, genre: '' })).toBe(false);
    expect(isNewProjectValid({ ...input, stylePrompt: '' })).toBe(false);
    expect(isNewProjectValid({ ...input, protagonist: '' })).toBe(false);
    expect(isNewProjectValid({ ...input, episodeDurationSec: 0 })).toBe(false);
  });

  it('创建成功后项目恒带 5 个节拍（AC-6.1）', () => {
    const project = createProject(input, 'prj_1', '2026-08-27T00:00:00Z');
    expect(project.beats).toHaveLength(BEAT_COUNT);
    expect(project.beats.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('完成度分母恒为 5', () => {
    const project = createProject(input, 'prj_1', '2026-08-27T00:00:00Z');
    expect(beatCompletion(project)).toEqual({ filled: 0, total: 5 });

    const firstBeat = project.beats[0];
    if (firstBeat === undefined) {
      throw new Error('project has no beats');
    }
    firstBeat.status = 'generated';
    expect(beatCompletion(project)).toEqual({ filled: 1, total: 5 });
  });
});
