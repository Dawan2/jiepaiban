/**
 * 组间衔接目录（METH-002 §5 + METH-003 §8）。
 *
 * 衔接挂在**上一块板**上，语义为「本板结束时如何进入下一板」，且**只在后期合成阶段生效**。
 * 枚举封闭：新增取值必须先改方法论法源，再改本文件。
 *
 * 红线：衔接**永不进入 Prompt，也不出现在生成 API 请求体中**（PRD R2 / AC-6.4）。
 * 本模块只负责「有哪些合法取值」，过滤逻辑在 `./prompt.ts`。
 */

/** 衔接手法枚举码（METH-002 §5 的「枚举建议」列）。 */
export type TransitionCode =
  | 'AUDIO_PRELAP'
  | 'SCREW_SMOOTH'
  | 'BEAT_SYNC_CUT'
  | 'BGM_PITCH_CUT'
  | 'BLACK_CUT_HOOK'
  | 'HARD_CUT';

/** 衔接手法中文标准词，是落库与 UI 展示的取值。 */
export type TransitionRule =
  | '音频预接'
  | '螺口顺滑过渡'
  | '卡点硬切'
  | 'BGM升调截断'
  | '黑屏断钩子'
  | '纯硬切';

export interface TransitionEntry {
  readonly code: TransitionCode;
  readonly rule: TransitionRule;
  readonly note: string;
}

/** 封闭目录，共 6 项。 */
export const TRANSITION_CATALOG: readonly TransitionEntry[] = Object.freeze([
  Object.freeze({ code: 'AUDIO_PRELAP', rule: '音频预接', note: '下一段音频提前进入' }),
  Object.freeze({ code: 'SCREW_SMOOTH', rule: '螺口顺滑过渡', note: '画面元素咬合式顺滑过渡' }),
  Object.freeze({ code: 'BEAT_SYNC_CUT', rule: '卡点硬切', note: '踩音乐点硬切' }),
  Object.freeze({ code: 'BGM_PITCH_CUT', rule: 'BGM升调截断', note: '升调推情绪并截断' }),
  Object.freeze({ code: 'BLACK_CUT_HOOK', rule: '黑屏断钩子', note: '黑屏截断留悬念' }),
  Object.freeze({ code: 'HARD_CUT', rule: '纯硬切', note: '无修饰直切，不做音画预接' }),
] as const satisfies readonly TransitionEntry[]);

/** 全部合法衔接取值，顺序与目录一致。 */
export const TRANSITION_RULES: readonly TransitionRule[] = Object.freeze(
  TRANSITION_CATALOG.map((entry) => entry.rule),
);

/** 衔接只在后期合成阶段生效，不属于生成阶段。 */
export const TRANSITION_STAGE = '后期合成' as const;

export function isTransitionRule(value: unknown): value is TransitionRule {
  return typeof value === 'string' && TRANSITION_RULES.includes(value as TransitionRule);
}

export function transitionEntry(rule: TransitionRule): TransitionEntry {
  const entry = TRANSITION_CATALOG.find((item) => item.rule === rule);
  if (entry === undefined) {
    throw new RangeError(`未知的组间衔接取值：${rule}`);
  }
  return entry;
}
