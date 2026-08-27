/**
 * 结构锁断言的红线回归（`RULE-7` 帧序锁、`RULE-11` 无故事板）。
 */

import { describe, expect, it } from 'vitest';
import type { NewProjectInput } from '../../domain/projects';
import { CANON_TOTAL_DURATION_SEC, createEmptyProject } from '../../store/projectFactory';
import { FORBIDDEN_BEAT_FIELDS, ProjectLockError, assertProjectLocks, normalizeProject } from './locks';
import type { StoredProject } from './schema';

const input: NewProjectInput = {
  name: '第一集',
  genre: '末世·爽剧',
  aspectRatio: '9:16',
  episodeDurationSec: CANON_TOTAL_DURATION_SEC,
  stylePrompt: '冷调赛博废土',
  protagonist: '短发女青年',
};

const project = (): StoredProject => createEmptyProject(input, 'prj_1', '2026-08-27T00:00:00.000Z');

describe('帧序锁（RULE-7 / R4）', () => {
  it('新建项目的帧位恒为左→右 1–3', () => {
    expect(project().beats.every((beat) => beat.cells.map((cell) => cell.order).join() === '1,2,3')).toBe(
      true,
    );
  });

  it('帧位被打乱时归一回左→右，不接受"重排"语义', () => {
    const source = project();
    const scrambled: StoredProject = {
      ...source,
      beats: source.beats.map((beat) => ({
        ...beat,
        cells: [
          { order: 3 as const, description: '甲' },
          { order: 1 as const, description: '乙' },
          { order: 2 as const, description: '丙' },
        ],
      })),
    };

    const normalized = normalizeProject(scrambled);
    // 归一只改帧位标号、不动内容顺序：数组下标本身就是唯一的读取顺序。
    expect(normalized.beats[0]?.cells.map((cell) => cell.order)).toEqual([1, 2, 3]);
    expect(normalized.beats[0]?.cells.map((cell) => cell.description)).toEqual(['甲', '乙', '丙']);
  });

  it('帧槽位缺失时抛结构锁错误，而不是崩在下标访问上', () => {
    const source = project();
    const truncated = {
      ...source,
      beats: source.beats.map((beat) => ({ ...beat, cells: [beat.cells[0]] })),
    } as unknown as StoredProject;

    expect(() => normalizeProject(truncated)).toThrow(ProjectLockError);
  });
});

describe('无故事板（RULE-11 / AC-6.8）', () => {
  it('节拍上出现分镜 / 镜头级字段即拒绝', () => {
    for (const field of FORBIDDEN_BEAT_FIELDS) {
      const source = project();
      const tainted = {
        ...source,
        beats: source.beats.map((beat, i) => (i === 0 ? { ...beat, [field]: '违规值' } : beat)),
      } as StoredProject;

      expect(() => assertProjectLocks(tainted)).toThrow(/概念级禁止/);
    }
  });

  it('合法项目不触发任何断言', () => {
    expect(() => assertProjectLocks(project())).not.toThrow();
  });
});
