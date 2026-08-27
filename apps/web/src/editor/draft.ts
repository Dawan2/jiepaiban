/**
 * 编辑页工作态。
 *
 * 领域模型（`src/domain/beats.ts`）是结构与红线的事实源；本模块只是它的**编辑态投影**。
 * 字段名一律沿用领域层的 snake_case，避免在两套命名之间来回翻译。
 *
 * 额外承载一类尚未落到持久层的 UI 字段：宫格参考图（架构文档的
 * `Frame.reference_image_key`，随持久化槽位入库）。
 *
 * 结构锁不在这一层复述，而是**回落时由领域层重新铸造**：{@link draftToBeat} 经
 * `createBeatList()` 取回锁死的板，再写入可编辑字段——因此宫格数、帧序、时间位
 * 这些锁在编辑态兜了一圈之后仍然成立。本模块也**不导出**任何增删节拍或增删宫格的函数。
 */

import {
  beatDef,
  createBeat,
  frameCountFor,
  type Beat,
  type BeatIndex,
  type BeatStatus,
  type FrameCount,
  type FrameOrder,
} from '../domain/beats';
import type { Project } from '../domain/projects';
import {
  canonTransitionFor,
  hasTransitionSeam,
  transitionEntry,
  type TransitionRule,
} from '../domain/transitions';

/**
 * 情绪基调预设 → 进 Prompt 的整句情绪描写。
 *
 * 领域层的 `emotion` 是**自由文本**（METH-003 的组装样例用的就是整句情绪描写），
 * `EMOTION_PRESETS` 只是 UI 的快速起手。这里给每个预设配一句现成的描写，
 * 选中即把整句写进 `emotion`——进 Prompt 的始终是 `emotion` 本身，
 * 不存在「预设值」与「Prompt 文案」两套东西。
 */
export const EMOTION_PRESET_TEXT: Readonly<Record<string, string>> = Object.freeze({
  紧张: '紧张压迫的情绪，压迫感持续收紧',
  温情: '温情柔和的情绪，节奏松而不散',
  悬疑: '悬疑不安的情绪，信息刻意留白',
  爆笑: '爆笑轻快的情绪，反应夸张外放',
  愤怒: '愤怒对抗的情绪，冲突正面爆发',
  悲伤: '悲伤低落的情绪，情绪向内收拢',
  燃: '昂扬燃向的情绪，气势逐步拉满',
});

/** 预设名 → 整句描写；不是预设的自由文本原样返回。 */
export function emotionTextFor(preset: string): string {
  return EMOTION_PRESET_TEXT[preset] ?? preset;
}

/** 整句描写 → 预设名，供下拉回显；对不上就返回空串（自由文本）。 */
export function emotionPresetOf(emotion: string): string {
  return (
    Object.keys(EMOTION_PRESET_TEXT).find((preset) => EMOTION_PRESET_TEXT[preset] === emotion) ?? ''
  );
}

/** 宫格参考图。本槽位存在内存里，`key` 即架构文档的参考图键。 */
export interface FrameImage {
  readonly key: string;
  readonly name: string;
  /** 预览地址（object URL）；不可用时为空串，UI 退化为文件名展示。 */
  readonly preview_url: string;
}

/** 一格宫格的编辑态：白话描述 + 可选参考图，别无其他。 */
export interface FrameDraft {
  readonly order: FrameOrder;
  readonly text: string;
  readonly image: FrameImage | null;
}

export interface BeatDraft {
  readonly index: BeatIndex;
  /** canon 板名，只读。 */
  readonly title: string;
  readonly role: string;
  /** 由板位决定，UI 无切换入口。 */
  readonly frame_count: FrameCount;
  /** canon 时间位，只读。 */
  readonly time_start: number;
  readonly time_end: number;
  readonly emotion: string;
  readonly camera_rhythm: string;
  readonly plot_core: string;
  readonly duration_sec: number;
  /** 长度恒等于 {@link BeatDraft.frame_count}。 */
  readonly frames: readonly FrameDraft[];
  /** 衔接手法；第 5 板无接缝，恒为 null。 */
  readonly transition_rule: TransitionRule | null;
  /** 衔接操作要点，人读；回落到领域层的 `note`，○ 不进 Prompt。 */
  readonly transition_note: string;
  readonly status: BeatStatus;
}

/** 由项目铸造 5 份节拍编辑态。数量与宫格数均由结构锁决定，不接受调用方指定。 */
export function createBeatDrafts(project: Project): readonly BeatDraft[] {
  return project.beat_list.map((beat) => ({
    index: beat.index,
    title: beat.title,
    role: beatDef(beat.index).role,
    frame_count: beat.frame_count,
    time_start: beat.time_start,
    time_end: beat.time_end,
    emotion: beat.emotion,
    camera_rhythm: beat.camera_rhythm,
    plot_core: beat.plot_core,
    duration_sec: beat.duration_sec,
    frames: beat.frames.map((frame) => ({ order: frame.order, text: frame.text, image: null })),
    transition_rule: canonTransitionFor(beat.index),
    transition_note: beat.note,
    status: beat.status,
  }));
}

/** 可被编辑的标量字段；`title` 不在其中——板名是规格用词，不可改写。 */
export type EditableBeatField = 'emotion' | 'camera_rhythm' | 'plot_core' | 'duration_sec';

interface BeatFieldPatch {
  readonly emotion?: string;
  readonly camera_rhythm?: string;
  readonly plot_core?: string;
  readonly duration_sec?: number;
  readonly transition_rule?: TransitionRule | null;
  readonly transition_note?: string;
}

function patchBeat(
  drafts: readonly BeatDraft[],
  index: BeatIndex,
  patch: (draft: BeatDraft) => BeatDraft,
): readonly BeatDraft[] {
  return drafts.map((draft) => (draft.index === index ? patch(draft) : draft));
}

export function updateBeatFields(
  drafts: readonly BeatDraft[],
  index: BeatIndex,
  patch: BeatFieldPatch,
): readonly BeatDraft[] {
  return patchBeat(drafts, index, (draft) => ({ ...draft, ...patch }));
}

/** 改一格的描述。格序由现有数据决定，不新增也不删除格。 */
export function updateFrameText(
  drafts: readonly BeatDraft[],
  index: BeatIndex,
  order: number,
  text: string,
): readonly BeatDraft[] {
  return patchBeat(drafts, index, (draft) => ({
    ...draft,
    frames: draft.frames.map((frame) => (frame.order === order ? { ...frame, text } : frame)),
  }));
}

/** 挂载或清除一格的参考图（传 null 即清除）。 */
export function updateFrameImage(
  drafts: readonly BeatDraft[],
  index: BeatIndex,
  order: number,
  image: FrameImage | null,
): readonly BeatDraft[] {
  return patchBeat(drafts, index, (draft) => ({
    ...draft,
    frames: draft.frames.map((frame) => (frame.order === order ? { ...frame, image } : frame)),
  }));
}

/**
 * 回落到领域模型，供 Prompt 组装与红线断言使用。
 *
 * 板不是在这里拼出来的，而是由 `createBeatList()` 铸出后再写入可编辑字段：
 * 宫格数、帧序、时间位、板序全部带着领域层的运行时锁回来，
 * 编辑态即便被篡改也无法把第 5 板变成 3 格。
 */
export function draftToBeat(draft: BeatDraft): Beat {
  const beat = createBeat(draft.index);

  beat.emotion = draft.emotion;
  beat.camera_rhythm = draft.camera_rhythm;
  beat.plot_core = draft.plot_core;
  beat.duration_sec = draft.duration_sec;
  beat.status = draft.status;
  // 衔接与要点都在硬排除清单里，分别落到 transition_rule 与 note。
  beat.transition_rule = draft.transition_rule ?? beat.transition_rule;
  beat.note = draft.transition_note;

  beat.frames.forEach((frame) => {
    frame.text = draft.frames.find((item) => item.order === frame.order)?.text ?? '';
  });

  return beat;
}

/** 该拍参考图键，按格序；无图的格不占位。 */
export function referenceImageKeys(draft: BeatDraft): readonly string[] {
  return draft.frames
    .map((frame) => frame.image?.key)
    .filter((key): key is string => key !== undefined);
}

/** 该拍是否有下一板接缝。 */
export function draftHasSeam(draft: BeatDraft): boolean {
  return hasTransitionSeam(draft.index);
}

/** 衔接手法的操作要点，给做后期合成的人读。 */
export function draftTransitionHint(draft: BeatDraft): string {
  return draft.transition_rule === null ? '' : transitionEntry(draft.transition_rule).hint;
}

/** 已填格数 / 应填格数，用于宫格区标题。 */
export function frameFillProgress(draft: BeatDraft): { filled: number; total: number } {
  return {
    filled: draft.frames.filter((frame) => frame.text.trim() !== '').length,
    total: frameCountFor(draft.index),
  };
}
