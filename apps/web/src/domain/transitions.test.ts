/**
 * 组间衔接目录（METH-002 §5、METH-003 §8）。
 * 「衔接不进 Prompt」的断言在 `./prompt.test.ts`。
 */

import { describe, expect, it } from 'vitest';
import {
  TRANSITION_CATALOG,
  TRANSITION_RULES,
  TRANSITION_STAGE,
  isTransitionRule,
  transitionEntry,
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

  it('每项都有说明文案', () => {
    TRANSITION_CATALOG.forEach((entry) => {
      expect(entry.note.trim()).not.toBe('');
    });
  });

  it('只在后期合成阶段生效', () => {
    expect(TRANSITION_STAGE).toBe('后期合成');
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
});
