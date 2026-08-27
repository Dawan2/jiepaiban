/**
 * 组间衔接模板测试。
 * 衔接是**人的职责**：枚举封闭、接缝挂在上一板、第 5 板没有接缝。
 */

import { describe, expect, it } from 'vitest';
import { BEAT_COUNT, BEAT_INDEXES } from './beats';
import {
  CANON_TRANSITION_BY_BEAT_INDEX,
  TRANSITION_SEAM_COUNT,
  TRANSITION_TEMPLATES,
  canonTransitionFor,
  hasTransitionSeam,
  seamOf,
  transitionTemplate,
} from './transitions';

describe('模板库', () => {
  it('恒 6 项，标准词与方法论一致', () => {
    expect(TRANSITION_TEMPLATES).toHaveLength(6);
    expect(TRANSITION_TEMPLATES.map((template) => template.label)).toEqual([
      '音频预接',
      '螺口顺滑过渡',
      '卡点硬切',
      'BGM升调截断',
      '黑屏断钩子',
      '纯硬切',
    ]);
  });

  it('id 唯一，且每项都有给剪辑读的操作要点', () => {
    const ids = TRANSITION_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TRANSITION_TEMPLATES.every((template) => template.hint.trim() !== '')).toBe(true);
  });

  it('按 id 可取回模板', () => {
    expect(transitionTemplate('black_cut_hook').label).toBe('黑屏断钩子');
  });

  it('不导出任何扩展模板库的能力：枚举封闭', async () => {
    const moduleExports = Object.keys(await import('./transitions'));
    expect(
      moduleExports.filter((name) => /^(add|register|create|remove|delete)/i.test(name)),
    ).toEqual([]);
  });
});

describe('接缝', () => {
  it('接缝数 = 节拍数 - 1', () => {
    expect(TRANSITION_SEAM_COUNT).toBe(BEAT_COUNT - 1);
    expect(TRANSITION_SEAM_COUNT).toBe(4);
  });

  it('B1–B4 有接缝，B5 没有：第 5 板之后是下一集', () => {
    expect(BEAT_INDEXES.filter((index) => hasTransitionSeam(index))).toEqual([1, 2, 3, 4]);
    expect(hasTransitionSeam(5)).toBe(false);
    expect(seamOf(5)).toBeNull();
  });

  it('接缝标识与板位对应', () => {
    expect(BEAT_INDEXES.map((index) => seamOf(index))).toEqual([
      '1-2',
      '2-3',
      '3-4',
      '4-5',
      null,
    ]);
  });

  it('默认衔接取方法论样板，且 B5 恒为 null', () => {
    expect(BEAT_INDEXES.map((index) => canonTransitionFor(index))).toEqual([
      'audio_prelap',
      'beat_sync_cut',
      'pure_hard_cut',
      'bgm_pitch_cut',
      null,
    ]);
    expect(CANON_TRANSITION_BY_BEAT_INDEX[5]).toBeNull();
  });

  it('默认值都落在封闭枚举内', () => {
    const ids = TRANSITION_TEMPLATES.map((template) => template.id);
    BEAT_INDEXES.forEach((index) => {
      const method = canonTransitionFor(index);
      if (method !== null) {
        expect(ids).toContain(method);
      }
    });
  });
});
