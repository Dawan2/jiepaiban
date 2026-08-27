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
  /** 授予该取值的法源条目。 */
  readonly canon_source: string;
  /**
   * 该取值尚未被封闭枚举的法源（METH-002 §5）收录。
   *
   * 为 `true` 表示：目录里有它、方法论的枚举表还没有它。此类取值**照常可用**
   * （下游需求已经在用），但必须留痕待批，不能让差异悄悄沉进代码。
   */
  readonly pending_canon: boolean;
  /** 待批原因；`pending_canon` 为 `false` 时恒为 null。 */
  readonly pending_canon_reason: string | null;
}

/**
 * 封闭目录，共 6 项。
 *
 * 其中 5 项直接来自 METH-002 §5 的枚举表；`纯硬切`（`HARD_CUT`）是第 6 项，
 * 由 METH-003 §1/§8 的 B3 → B4 衔接点要求，但 METH-002 §5 的枚举表尚未收录，
 * 因此标记 `pending_canon: true`——见 {@link PENDING_CANON_TRANSITIONS}。
 */
export const TRANSITION_CATALOG: readonly TransitionEntry[] = Object.freeze([
  Object.freeze({
    code: 'AUDIO_PRELAP',
    rule: '音频预接',
    note: '下一段音频提前进入',
    canon_source: 'METH-002 §5',
    pending_canon: false,
    pending_canon_reason: null,
  }),
  Object.freeze({
    code: 'SCREW_SMOOTH',
    rule: '螺口顺滑过渡',
    note: '画面元素咬合式顺滑过渡',
    canon_source: 'METH-002 §5',
    pending_canon: false,
    pending_canon_reason: null,
  }),
  Object.freeze({
    code: 'BEAT_SYNC_CUT',
    rule: '卡点硬切',
    note: '踩音乐点硬切',
    canon_source: 'METH-002 §5',
    pending_canon: false,
    pending_canon_reason: null,
  }),
  Object.freeze({
    code: 'BGM_PITCH_CUT',
    rule: 'BGM升调截断',
    note: '升调推情绪并截断',
    canon_source: 'METH-002 §5',
    pending_canon: false,
    pending_canon_reason: null,
  }),
  Object.freeze({
    code: 'BLACK_CUT_HOOK',
    rule: '黑屏断钩子',
    note: '黑屏截断留悬念',
    canon_source: 'METH-002 §5',
    pending_canon: false,
    pending_canon_reason: null,
  }),
  Object.freeze({
    code: 'HARD_CUT',
    rule: '纯硬切',
    note: '无修饰直切，不做音画预接',
    canon_source: 'METH-003 §1 / §8（B3 → B4）',
    pending_canon: true,
    pending_canon_reason:
      'METH-003 §1/§8 把 B3 → B4 定为「纯硬切」，但 METH-002 §5 的封闭枚举只列了 5 项、不含此值；' +
      '待 METH-002 §5 补录后把 pending_canon 改回 false。',
  }),
] as const satisfies readonly TransitionEntry[]);

/** 全部合法衔接取值，顺序与目录一致。 */
export const TRANSITION_RULES: readonly TransitionRule[] = Object.freeze(
  TRANSITION_CATALOG.map((entry) => entry.rule),
);

/** 已被 METH-002 §5 枚举表收录的取值。 */
export const CANON_TRANSITION_RULES: readonly TransitionRule[] = Object.freeze(
  TRANSITION_CATALOG.filter((entry) => !entry.pending_canon).map((entry) => entry.rule),
);

/**
 * 目录里有、METH-002 §5 枚举表还没有的取值——**待批清单**。
 *
 * 这份清单存在的意义是「差异必须可见」：下游（模板库、UI 下拉、导出）可以照常使用，
 * 但任何人读目录都能立刻看到哪几项还欠一次法源修订。清空它的唯一正当方式是补法源，
 * 而不是把取值从目录里删掉。
 */
export const PENDING_CANON_TRANSITIONS: readonly TransitionEntry[] = Object.freeze(
  TRANSITION_CATALOG.filter((entry) => entry.pending_canon),
);

/** 衔接只在后期合成阶段生效，不属于生成阶段。 */
export const TRANSITION_STAGE = '后期合成' as const;

export function isTransitionRule(value: unknown): value is TransitionRule {
  return typeof value === 'string' && TRANSITION_RULES.includes(value as TransitionRule);
}

/** 该取值是否还欠一次 METH-002 §5 的法源修订。 */
export function isPendingCanonTransition(rule: TransitionRule): boolean {
  return transitionEntry(rule).pending_canon;
}

export function transitionEntry(rule: TransitionRule): TransitionEntry {
  const entry = TRANSITION_CATALOG.find((item) => item.rule === rule);
  if (entry === undefined) {
    throw new RangeError(`未知的组间衔接取值：${rule}`);
  }
  return entry;
}
