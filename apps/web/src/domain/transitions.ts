/**
 * 组间衔接目录（METH-002 §5 + METH-003 §8）。
 *
 * 衔接挂在**上一块板**上，语义为「本板结束时如何进入下一板」，且**只在后期合成阶段生效**，
 * 因此第 5 板没有接缝。枚举封闭：新增取值必须先改方法论法源，再改本文件。
 *
 * 红线：衔接**永不进入 Prompt，也不出现在生成 API 请求体中**（PRD R2 / AC-6.4）。
 * 本模块只负责「有哪些合法取值」与「接缝挂在哪一板」，过滤逻辑在 `./prompt.ts`。
 *
 * **本文件不得被 `src/prompt/**` 导入**：排除不是拼完再删，而是组装器根本够不着——
 * 该约束有单元测试守卫。
 *
 * 本模块只对 `./beats` 做 **type-only** 导入。`./beats` 运行时依赖本模块的
 * `isTransitionRule`，反向再加一条运行时依赖会形成 TDZ 死锁。
 */

import type { BeatIndex } from './beats';

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
  /** 一句话释义，说明这是什么手法。 */
  readonly note: string;
  /** 操作要点，给做后期合成的人读。 */
  readonly hint: string;
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
 * 封闭目录，共 6 项；顺序即 UI 呈现顺序。
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
    hint: '下一段的声音提前 0.3–0.5 秒进入，画面还没切',
    canon_source: 'METH-002 §5',
    pending_canon: false,
    pending_canon_reason: null,
  }),
  Object.freeze({
    code: 'SCREW_SMOOTH',
    rule: '螺口顺滑过渡',
    note: '画面元素咬合式顺滑过渡',
    hint: '前后画面找同构元素咬合，位置与运动方向对齐',
    canon_source: 'METH-002 §5',
    pending_canon: false,
    pending_canon_reason: null,
  }),
  Object.freeze({
    code: 'BEAT_SYNC_CUT',
    rule: '卡点硬切',
    note: '踩音乐点硬切',
    hint: '踩在音乐重音上硬切，前后各留 1 帧余量',
    canon_source: 'METH-002 §5',
    pending_canon: false,
    pending_canon_reason: null,
  }),
  Object.freeze({
    code: 'BGM_PITCH_CUT',
    rule: 'BGM升调截断',
    note: '升调推情绪并截断',
    hint: 'BGM 升调把情绪推上去，到顶点直接截断',
    canon_source: 'METH-002 §5',
    pending_canon: false,
    pending_canon_reason: null,
  }),
  Object.freeze({
    code: 'BLACK_CUT_HOOK',
    rule: '黑屏断钩子',
    note: '黑屏截断留悬念',
    hint: '黑场 2–4 帧截断，悬念留在黑屏之后',
    canon_source: 'METH-002 §5',
    pending_canon: false,
    pending_canon_reason: null,
  }),
  Object.freeze({
    code: 'HARD_CUT',
    rule: '纯硬切',
    note: '无修饰直切，不做音画预接',
    hint: '不做任何修饰，画面与声音同时切换',
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

export function transitionEntryByCode(code: TransitionCode): TransitionEntry {
  const entry = TRANSITION_CATALOG.find((item) => item.code === code);
  if (entry === undefined) {
    throw new RangeError(`未知的组间衔接枚举码：${code}`);
  }
  return entry;
}

/**
 * 接缝数 = 节拍数 - 1 = 4。
 * 这里写字面量而非 `BEAT_COUNT - 1`：见文件头关于循环依赖的说明，
 * 二者一致由 `./transitions.test.ts` 断言。
 */
export const TRANSITION_SEAM_COUNT = 4 as const;

/** 第 5 板之后是下一集，不由本集衔接管辖。 */
export function hasTransitionSeam(index: BeatIndex): boolean {
  return index <= TRANSITION_SEAM_COUNT;
}

/** 接缝标识：'1-2' | '2-3' | '3-4' | '4-5'。 */
export type TransitionSeam = '1-2' | '2-3' | '3-4' | '4-5';

export function seamOf(index: BeatIndex): TransitionSeam | null {
  return hasTransitionSeam(index) ? (`${index}-${index + 1}` as TransitionSeam) : null;
}

/**
 * 方法论样板给出的默认衔接（METH-003 §8），与 `BEAT_DEFS[i].transition_rule` 同源。
 * B4 → B5 原文为「卡点硬切 + BGM 升调」，在封闭枚举内取 `BGM升调截断`。
 *
 * 第 5 板恒为 null——它没有接缝；`BEAT_DEFS[4].transition_rule` 里的
 * 「黑屏断钩子」描述的是**断集**手法，不是通往下一板的接缝。
 */
export const CANON_TRANSITION_BY_BEAT_INDEX = Object.freeze({
  1: '音频预接',
  2: '卡点硬切',
  3: '纯硬切',
  4: 'BGM升调截断',
  5: null,
} as const satisfies Record<BeatIndex, TransitionRule | null>);

export function canonTransitionFor(index: BeatIndex): TransitionRule | null {
  return CANON_TRANSITION_BY_BEAT_INDEX[index];
}
