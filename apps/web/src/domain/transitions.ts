/**
 * 组间衔接模板（方法论 METH-003 §8、术语表 §5）。
 *
 * 红线（AC-6.4）：衔接描述的是**两段视频之间**的关系，只在后期合成阶段生效。
 * 本模块的任何内容都不得进入 Prompt 与生成请求体——
 * 组装器的输入类型根本不包含衔接字段（见 `src/prompt/assemble.ts`），
 * 因此"排除"不是拼装后过滤，而是类型上够不着。
 *
 * **本文件不得被 `src/prompt/**` 导入**，该约束有单元测试守卫。
 */

import { BEAT_COUNT, type BeatIndex } from './beats';

/** 衔接手法枚举，封闭 6 项；新增需先改方法论法源。 */
export type TransitionMethodId =
  | 'audio_prelap'
  | 'screw_smooth'
  | 'beat_sync_cut'
  | 'bgm_pitch_cut'
  | 'black_cut_hook'
  | 'pure_hard_cut';

export interface TransitionTemplate {
  readonly id: TransitionMethodId;
  /** 标准词，UI 与后期交接单共用。 */
  readonly label: string;
  /** 一句话操作要点，给剪辑的人读。 */
  readonly hint: string;
}

/** 衔接模板库，顺序即 UI 呈现顺序。 */
export const TRANSITION_TEMPLATES: readonly TransitionTemplate[] = [
  { id: 'audio_prelap', label: '音频预接', hint: '下一段的声音提前 0.3–0.5 秒进入，画面还没切' },
  { id: 'screw_smooth', label: '螺口顺滑过渡', hint: '前后画面找同构元素咬合，位置与运动方向对齐' },
  { id: 'beat_sync_cut', label: '卡点硬切', hint: '踩在音乐重音上硬切，前后各留 1 帧余量' },
  { id: 'bgm_pitch_cut', label: 'BGM升调截断', hint: 'BGM 升调把情绪推上去，到顶点直接截断' },
  { id: 'black_cut_hook', label: '黑屏断钩子', hint: '黑场 2–4 帧截断，悬念留在黑屏之后' },
  { id: 'pure_hard_cut', label: '纯硬切', hint: '不做任何修饰，画面与声音同时切换' },
];

const TEMPLATE_BY_ID: Record<TransitionMethodId, TransitionTemplate> = Object.fromEntries(
  TRANSITION_TEMPLATES.map((template) => [template.id, template]),
) as Record<TransitionMethodId, TransitionTemplate>;

export function transitionTemplate(id: TransitionMethodId): TransitionTemplate {
  return TEMPLATE_BY_ID[id];
}

/**
 * 接缝数 = 节拍数 - 1 = 4。
 * 衔接值挂在**上一块板**，语义为"本板结束时如何进入下一板"，所以第 5 板没有接缝。
 */
export const TRANSITION_SEAM_COUNT = BEAT_COUNT - 1;

/** 第 5 板之后是下一集，不由本集衔接管辖。 */
export function hasTransitionSeam(index: BeatIndex): boolean {
  return index < BEAT_COUNT;
}

/** 接缝标识：'1-2' | '2-3' | '3-4' | '4-5'。 */
export type TransitionSeam = '1-2' | '2-3' | '3-4' | '4-5';

export function seamOf(index: BeatIndex): TransitionSeam | null {
  return hasTransitionSeam(index) ? (`${index}-${index + 1}` as TransitionSeam) : null;
}

/**
 * 方法论样板给出的默认衔接（METH-003 §8）。
 * B4 → B5 原文为"卡点硬切 + BGM 升调"，在封闭枚举内取 `bgm_pitch_cut`（升调推情绪并截断）。
 */
export const CANON_TRANSITION_BY_BEAT_INDEX = {
  1: 'audio_prelap',
  2: 'beat_sync_cut',
  3: 'pure_hard_cut',
  4: 'bgm_pitch_cut',
  5: null,
} as const satisfies Record<BeatIndex, TransitionMethodId | null>;

export function canonTransitionFor(index: BeatIndex): TransitionMethodId | null {
  return CANON_TRANSITION_BY_BEAT_INDEX[index];
}
