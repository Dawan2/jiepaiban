/**
 * 编辑页工作态（W1/WK3）。
 *
 * 领域模型（`src/domain/beats.ts`）是结构与红线的事实源；本模块只是它的**编辑态投影**，
 * 额外承载两类尚未落到持久层的 UI 字段：
 *   - 宫格参考图（架构文档里的 `Frame.reference_image_key`，随持久化槽位入库）；
 *   - 结构化衔接（模板 id + 操作要点），领域侧目前是一段人读文本。
 *
 * 结构锁在类型与构造上兜住：节拍恒 5、宫格数由板位决定、名称只读，
 * 因此本模块**不导出**任何增删节拍或增删宫格的函数。
 */

import {
  type Beat,
  type BeatIndex,
  type BeatStatus,
  type EmotionTone,
  type GridSize,
  gridSizeForBeatIndex,
} from '../domain/beats';
import type { Project } from '../domain/projects';
import {
  canonTransitionFor,
  hasTransitionSeam,
  transitionTemplate,
  type TransitionMethodId,
} from '../domain/transitions';

/** 宫格参考图。本槽位存在内存里，`key` 即架构文档的参考图键。 */
export interface CellImage {
  readonly key: string;
  readonly name: string;
  /** 预览地址（object URL）；不可用时为空串，UI 退化为文件名展示。 */
  readonly previewUrl: string;
}

/** 一格宫格的编辑态：白话描述 + 可选参考图，别无其他。 */
export interface CellDraft {
  readonly order: 1 | 2 | 3;
  readonly description: string;
  readonly image: CellImage | null;
}

export interface BeatDraft {
  readonly index: BeatIndex;
  /** 标准板名，只读。 */
  readonly name: string;
  readonly role: string;
  /** 由板位决定，UI 无切换入口。 */
  readonly gridSize: GridSize;
  readonly summary: string;
  readonly tone: EmotionTone | null;
  readonly durationSec: number | null;
  /** 长度恒等于 {@link BeatDraft.gridSize}。 */
  readonly cells: readonly CellDraft[];
  /** 衔接手法；第 5 板无接缝，恒为 null。 */
  readonly transitionMethod: TransitionMethodId | null;
  /** 衔接操作要点，人读。 */
  readonly transitionNote: string;
  readonly status: BeatStatus;
}

function toCellDrafts(beat: Beat, gridSize: GridSize): readonly CellDraft[] {
  return beat.cells.slice(0, gridSize).map((cell) => ({
    order: cell.order,
    description: cell.description,
    image: null,
  }));
}

/** 由项目铸造 5 份节拍编辑态。数量与宫格数均由结构锁决定，不接受调用方指定。 */
export function createBeatDrafts(project: Project): readonly BeatDraft[] {
  return project.beats.map((beat) => {
    const gridSize = gridSizeForBeatIndex(beat.index);
    return {
      index: beat.index,
      name: beat.name,
      role: beat.role,
      gridSize,
      summary: beat.summary,
      tone: beat.tone,
      durationSec: beat.durationSec,
      cells: toCellDrafts(beat, gridSize),
      transitionMethod: canonTransitionFor(beat.index),
      transitionNote: beat.transition,
      status: beat.status,
    };
  });
}

/** 可被编辑的标量字段；`name` 不在其中——板名是规格用词，不可改写。 */
export type EditableBeatField = 'summary' | 'tone' | 'durationSec';

interface BeatFieldPatch {
  readonly summary?: string;
  readonly tone?: EmotionTone | null;
  readonly durationSec?: number | null;
  readonly transitionMethod?: TransitionMethodId | null;
  readonly transitionNote?: string;
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
export function updateCellDescription(
  drafts: readonly BeatDraft[],
  index: BeatIndex,
  order: number,
  description: string,
): readonly BeatDraft[] {
  return patchBeat(drafts, index, (draft) => ({
    ...draft,
    cells: draft.cells.map((cell) => (cell.order === order ? { ...cell, description } : cell)),
  }));
}

/** 挂载或清除一格的参考图（传 null 即清除）。 */
export function updateCellImage(
  drafts: readonly BeatDraft[],
  index: BeatIndex,
  order: number,
  image: CellImage | null,
): readonly BeatDraft[] {
  return patchBeat(drafts, index, (draft) => ({
    ...draft,
    cells: draft.cells.map((cell) => (cell.order === order ? { ...cell, image } : cell)),
  }));
}

/**
 * 回落到领域模型，供 Prompt 组装与红线断言使用。
 * 宫格恒补齐 3 格（B5 的第 3 格为空且不参与组装），以满足领域侧的三元组形状。
 */
export function draftToBeat(draft: BeatDraft): Beat {
  const description = (order: 1 | 2 | 3): string =>
    draft.cells.find((cell) => cell.order === order)?.description ?? '';

  const template = draft.transitionMethod === null ? null : transitionTemplate(draft.transitionMethod);
  const transitionText = [template?.label, draft.transitionNote.trim()]
    .filter((part): part is string => part !== undefined && part !== '')
    .join('：');

  return {
    index: draft.index,
    role: draft.role,
    name: draft.name,
    summary: draft.summary,
    tone: draft.tone,
    gridSize: draft.gridSize,
    cells: [
      { order: 1, description: description(1) },
      { order: 2, description: description(2) },
      { order: 3, description: description(3) },
    ],
    durationSec: draft.durationSec,
    transition: transitionText,
    note: '',
    status: draft.status,
  };
}

/** 该拍参考图键，按格序；无图的格不占位。 */
export function referenceImageKeys(draft: BeatDraft): readonly string[] {
  return draft.cells
    .map((cell) => cell.image?.key)
    .filter((key): key is string => key !== undefined);
}

/** 该拍是否有下一板接缝。 */
export function draftHasSeam(draft: BeatDraft): boolean {
  return hasTransitionSeam(draft.index);
}

/** 已填格数 / 应填格数，用于宫格区标题。 */
export function cellFillProgress(draft: BeatDraft): { filled: number; total: number } {
  return {
    filled: draft.cells.filter((cell) => cell.description.trim() !== '').length,
    total: draft.gridSize,
  };
}
