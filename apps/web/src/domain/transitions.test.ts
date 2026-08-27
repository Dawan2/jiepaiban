/**
 * 组间衔接目录（METH-002 §5、METH-003 §8）。
 * 「衔接不进 Prompt」的断言在 `./prompt.test.ts`。
 */

import { describe, expect, it } from 'vitest';
import {
  CANON_TRANSITION_RULES,
  PENDING_CANON_TRANSITIONS,
  TRANSITION_CATALOG,
  TRANSITION_RULES,
  TRANSITION_STAGE,
  isPendingCanonTransition,
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

  it('每项都有说明文案与法源出处', () => {
    TRANSITION_CATALOG.forEach((entry) => {
      expect(entry.note.trim()).not.toBe('');
      expect(entry.canon_source.trim()).not.toBe('');
    });
  });

  it('只在后期合成阶段生效', () => {
    expect(TRANSITION_STAGE).toBe('后期合成');
  });
});

describe('待批取值（pending_canon）', () => {
  it('METH-002 §5 收录 5 项，目录第 6 项「纯硬切」标记为待批', () => {
    expect(CANON_TRANSITION_RULES).toEqual([
      '音频预接',
      '螺口顺滑过渡',
      '卡点硬切',
      'BGM升调截断',
      '黑屏断钩子',
    ]);
    expect(CANON_TRANSITION_RULES).toHaveLength(5);
    expect(PENDING_CANON_TRANSITIONS.map((entry) => entry.rule)).toEqual(['纯硬切']);
    expect(isPendingCanonTransition('纯硬切')).toBe(true);
  });

  it('待批项与已收录项合起来正好是整个目录，不重不漏', () => {
    expect([...CANON_TRANSITION_RULES, ...PENDING_CANON_TRANSITIONS.map((e) => e.rule)].sort()).toEqual(
      [...TRANSITION_RULES].sort(),
    );
    expect(CANON_TRANSITION_RULES.length + PENDING_CANON_TRANSITIONS.length).toBe(
      TRANSITION_CATALOG.length,
    );
  });

  it('已收录项一律不标待批，法源指向 METH-002 §5', () => {
    CANON_TRANSITION_RULES.forEach((rule) => {
      const entry = transitionEntry(rule);
      expect(entry.pending_canon).toBe(false);
      expect(entry.pending_canon_reason).toBeNull();
      expect(entry.canon_source).toBe('METH-002 §5');
      expect(isPendingCanonTransition(rule)).toBe(false);
    });
  });

  it('待批项必须写明原因与需求出处，不能只挂一个空标记', () => {
    PENDING_CANON_TRANSITIONS.forEach((entry) => {
      expect(entry.pending_canon).toBe(true);
      expect(entry.pending_canon_reason).not.toBeNull();
      expect(entry.pending_canon_reason ?? '').toContain('METH-002 §5');
      expect(entry.canon_source).toContain('METH-003');
    });
  });

  it('待批不等于不可用：「纯硬切」照常是合法取值，且被 B3 使用', () => {
    expect(isTransitionRule('纯硬切')).toBe(true);
    expect(TRANSITION_RULES).toContain('纯硬切');
    expect(transitionEntry('纯硬切').code).toBe('HARD_CUT');
  });

  it('目录项被冻结，待批标记不能被就地抹掉', () => {
    const [pending] = PENDING_CANON_TRANSITIONS;
    expect(pending).toBeDefined();
    expect(Object.isFrozen(PENDING_CANON_TRANSITIONS)).toBe(true);
    expect(Object.isFrozen(CANON_TRANSITION_RULES)).toBe(true);
    expect(() => {
      (pending as unknown as { pending_canon: boolean }).pending_canon = false;
    }).toThrow(TypeError);
    expect(transitionEntry('纯硬切').pending_canon).toBe(true);
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
