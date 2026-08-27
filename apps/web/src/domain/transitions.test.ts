/**
 * 组间衔接目录（METH-002 §5、METH-003 §8）。
 *
 * 衔接是**人的职责**：枚举封闭、接缝挂在上一板、第 5 板没有接缝。
 * 「衔接不进 Prompt」的断言在 `./prompt.test.ts` 与 `../prompt/assemble.test.ts`。
 */

import { describe, expect, it } from 'vitest';
import { BEAT_COUNT, BEAT_DEFS, BEAT_INDEXES } from './beats';
import {
  CANON_TRANSITION_BY_BEAT_INDEX,
  TRANSITION_CATALOG,
  TRANSITION_RULES,
  TRANSITION_SEAM_COUNT,
  TRANSITION_STAGE,
  canonTransitionFor,
  hasTransitionSeam,
  isTransitionRule,
  seamOf,
  transitionEntry,
  transitionEntryByCode,
  type TransitionRule,
} from './transitions';

describe('衔接目录是封闭枚举', () => {
  it('恰好 6 项，取值与方法论一致', () => {
    expect(TRANSITION_RULES).toEqual([
      '音频预接',
      '螺口顺滑过渡',
      '卡点硬切',
      'BGM升调截断',
      '黑屏断钩子',
      '纯硬切',
    ]);
    expect(TRANSITION_CATALOG).toHaveLength(6);
  });

  it('枚举码与中文标准词一一对应', () => {
    expect(TRANSITION_CATALOG.map((entry) => entry.code)).toEqual([
      'AUDIO_PRELAP',
      'SCREW_SMOOTH',
      'BEAT_SYNC_CUT',
      'BGM_PITCH_CUT',
      'BLACK_CUT_HOOK',
      'HARD_CUT',
    ]);
    expect(new Set(TRANSITION_RULES).size).toBe(TRANSITION_RULES.length);
    expect(new Set(TRANSITION_CATALOG.map((entry) => entry.code)).size).toBe(6);
  });

  it('目录与取值列表在运行时被冻结，不能私自扩表', () => {
    expect(Object.isFrozen(TRANSITION_CATALOG)).toBe(true);
    expect(Object.isFrozen(TRANSITION_RULES)).toBe(true);
    expect(() =>
      (TRANSITION_RULES as unknown as TransitionRule[]).push('闪白转场' as TransitionRule),
    ).toThrow(TypeError);
    expect(TRANSITION_RULES).toHaveLength(6);
  });

  it('每项都有说明文案，以及给剪辑读的操作要点', () => {
    TRANSITION_CATALOG.forEach((entry) => {
      expect(entry.note.trim()).not.toBe('');
      expect(entry.hint.trim()).not.toBe('');
    });
  });

  it('只在后期合成阶段生效', () => {
    expect(TRANSITION_STAGE).toBe('后期合成');
  });

  it('不导出任何扩展模板库的能力：枚举封闭', async () => {
    const moduleExports = Object.keys(await import('./transitions'));
    expect(
      moduleExports.filter((name) => /^(add|register|create|remove|delete)/i.test(name)),
    ).toEqual([]);
  });
});

describe('取值判定', () => {
  it('目录内取值通过，目录外取值不通过', () => {
    TRANSITION_RULES.forEach((rule) => {
      expect(isTransitionRule(rule)).toBe(true);
    });
    ['闪白转场', '叠化', '螺口顺滑', '', 'HARD_CUT'].forEach((value) => {
      expect(isTransitionRule(value)).toBe(false);
    });
  });

  it('非字符串一律不通过', () => {
    [null, undefined, 0, {}, []].forEach((value) => {
      expect(isTransitionRule(value)).toBe(false);
    });
  });

  it('transitionEntry 查得到目录项，查不到就抛错', () => {
    expect(transitionEntry('纯硬切').code).toBe('HARD_CUT');
    expect(transitionEntry('BGM升调截断').code).toBe('BGM_PITCH_CUT');
    expect(() => transitionEntry('叠化' as TransitionRule)).toThrow(RangeError);
  });

  it('transitionEntryByCode 按枚举码取回目录项', () => {
    expect(transitionEntryByCode('BLACK_CUT_HOOK').rule).toBe('黑屏断钩子');
    expect(() => transitionEntryByCode('DISSOLVE' as never)).toThrow(RangeError);
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
    expect(BEAT_INDEXES.map((index) => seamOf(index))).toEqual(['1-2', '2-3', '3-4', '4-5', null]);
  });

  it('默认衔接取方法论样板，且 B5 恒为 null', () => {
    expect(BEAT_INDEXES.map((index) => canonTransitionFor(index))).toEqual([
      '音频预接',
      '卡点硬切',
      '纯硬切',
      'BGM升调截断',
      null,
    ]);
    expect(CANON_TRANSITION_BY_BEAT_INDEX[5]).toBeNull();
  });

  it('默认值与 BEAT_DEFS 同源：B1–B4 逐项一致', () => {
    BEAT_DEFS.slice(0, TRANSITION_SEAM_COUNT).forEach((def) => {
      expect(canonTransitionFor(def.index)).toBe(def.transition_rule);
    });
  });

  it('默认值都落在封闭枚举内', () => {
    BEAT_INDEXES.forEach((index) => {
      const rule = canonTransitionFor(index);
      if (rule !== null) {
        expect(TRANSITION_RULES).toContain(rule);
      }
    });
  });
});
