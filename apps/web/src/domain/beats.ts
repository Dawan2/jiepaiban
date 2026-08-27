/**
 * 五节拍结构 —— 产品红线（PRD V1.0 第 5.1 / 5.2 章，AC-6.1 / AC-6.3 / AC-6.8）
 *
 * 1. 一个项目恒有 5 个节拍。数量固定，本模块**不导出**任何增删节拍的能力，
 *    UI 与 API 同样不得提供入口。
 * 2. **不存在"分镜"这一层**：节拍是唯一生成单元，一个节拍 = 一次生成 = 一段视频。
 *    画面由 3 或 2 格「宫格」白话描述构成，替代传统分镜；因此本文件不得出现
 *    景别 / 机位 / 运镜 / 镜头(shot) 等分镜字段。
 *
 * 本槽位（W1/WK1）只落地结构与类型；宫格编辑与 Prompt 组装由后续槽位（WK3）实现。
 */

/** 节拍数量固定为 5，不提供增删入口。 */
export const BEAT_COUNT = 5 as const;

/** 节拍序号，1 起。 */
export type BeatIndex = 1 | 2 | 3 | 4 | 5;

export const BEAT_INDEXES: readonly BeatIndex[] = [1, 2, 3, 4, 5];

/** 宫格规格仅允许 3 或 2，不开放其他数量。 */
export type GridSize = 3 | 2;

export const GRID_SIZES: readonly GridSize[] = [3, 2];

/**
 * 宫格锁（PRD V1.0 `RULE-3` / `FR-1-03`，法源 `METH-001 §6`）：
 * 宫格数由板序推导，B1–B4 = 3、B5 = 2，只读，UI 不提供修改入口。
 */
export function gridSizeForBeat(index: BeatIndex): GridSize {
  return index === BEAT_COUNT ? 2 : 3;
}

/** 情绪基调单选项（PRD 5.2.2）。 */
export type EmotionTone = '紧张' | '温情' | '悬疑' | '爆笑' | '愤怒' | '悲伤' | '燃';

export const EMOTION_TONES: readonly EmotionTone[] = [
  '紧张',
  '温情',
  '悬疑',
  '爆笑',
  '愤怒',
  '悲伤',
  '燃',
];

/** 节拍状态点（编辑页左导航与成片页共用）。 */
export type BeatStatus = 'empty' | 'filled' | 'generating' | 'generated' | 'failed';

/** 一格宫格：只有白话画面描述，没有任何分镜专业字段。 */
export interface GridCell {
  /** 格序，1 起，最大 3。 */
  readonly order: 1 | 2 | 3;
  /** 这一格里发生什么、看到什么。 */
  description: string;
}

/**
 * 节拍卡。
 * `● 进 Prompt`：summary / tone / cells / durationSec
 * `○ 不进 Prompt`：name / transition / note —— 其中 transition（衔接）为红线字段，
 * 任何情况下不得进入 Prompt 与生成请求体（AC-6.4）。
 */
export interface Beat {
  readonly index: BeatIndex;
  /** 叙事定位（钩子/冲突/…），预填且不可变，用于说明该节拍的作用。 */
  readonly role: string;
  /** 节拍名称，可改；仅用于导航与成片页标识，不进 Prompt。 */
  name: string;
  /** 剧情概要，1–3 句，进 Prompt。 */
  summary: string;
  /** 情绪基调，进 Prompt。 */
  tone: EmotionTone | null;
  /**
   * 宫格规格：由板序推导（B1–B4 = 3、B5 = 2，`RULE-3`），对用户只读。
   * 持久化层每次读写都按 {@link gridSizeForBeat} 归一，第 3 格数据始终保留但 B5 不参与组装。
   */
  gridSize: GridSize;
  /** 始终保留 3 格数据；参与组装的格数由 gridSize 决定。 */
  cells: readonly [GridCell, GridCell, GridCell];
  /** 该节拍视频段时长（秒），作为 API 参数位，不拼入 Prompt 文本。 */
  durationSec: number | null;
  /** 衔接说明：给人读的，**绝不进入 Prompt / 生成请求**。 */
  transition: string;
  /** 自由备忘，不进 Prompt。 */
  note: string;
  status: BeatStatus;
}

/**
 * 不得进入 Prompt 与生成请求体的节拍字段（AC-6.4 硬排除清单）。
 * Prompt 组装器（WK3）必须以此为准，并有单元测试断言覆盖。
 */
export const PROMPT_EXCLUDED_BEAT_FIELDS = ['name', 'transition', 'note'] as const;

export type PromptExcludedBeatField = (typeof PROMPT_EXCLUDED_BEAT_FIELDS)[number];

interface BeatPreset {
  readonly index: BeatIndex;
  readonly name: string;
  readonly role: string;
}

/** 新建项目时自动预填的 5 个节拍（PRD 5.1.2）。 */
export const BEAT_PRESETS: readonly BeatPreset[] = [
  { index: 1, name: '钩子', role: '3 秒抓住观众的开场冲突' },
  { index: 2, name: '冲突', role: '矛盾正面展开' },
  { index: 3, name: '升级', role: '冲突加码、压力递增' },
  { index: 4, name: '反转/高潮', role: '情节反转或情绪顶点' },
  { index: 5, name: '悬念钩子', role: '收尾留钩，导向下一集' },
];

const emptyCells = (): [GridCell, GridCell, GridCell] => [
  { order: 1, description: '' },
  { order: 2, description: '' },
  { order: 3, description: '' },
];

/**
 * 项目创建后自动生成的 5 个节拍。
 * 返回长度恒为 {@link BEAT_COUNT}；调用方不得增删元素。
 *
 * @param episodeDurationSec 单集目标时长（秒），用于预填每拍时长（目标时长 / 5）。
 */
export function createDefaultBeats(episodeDurationSec?: number): Beat[] {
  const perBeat =
    episodeDurationSec === undefined
      ? null
      : Math.max(1, Math.round(episodeDurationSec / BEAT_COUNT));

  return BEAT_PRESETS.map((preset) => ({
    index: preset.index,
    role: preset.role,
    name: preset.name,
    summary: '',
    tone: null,
    gridSize: gridSizeForBeat(preset.index),
    cells: emptyCells(),
    durationSec: perBeat,
    transition: '',
    note: '',
    status: 'empty',
  }));
}

/** 参与 Prompt 组装的宫格（切到 2 格时第 3 格作为草稿被排除）。 */
export function activeCells(beat: Beat): readonly GridCell[] {
  return beat.cells.slice(0, beat.gridSize);
}

/** 必填字段是否齐备（PRD 5.2.2 / AC-6.2）；未就绪的节拍不可提交生成。 */
export function isBeatReady(beat: Beat): boolean {
  return (
    beat.name.trim() !== '' &&
    beat.summary.trim() !== '' &&
    beat.tone !== null &&
    beat.durationSec !== null &&
    beat.durationSec > 0 &&
    activeCells(beat).every((cell) => cell.description.trim() !== '')
  );
}
