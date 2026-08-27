/**
 * 五节拍结构 —— 产品红线（PRD V1.0 第 5.1 / 5.2 章，AC-6.1 / AC-6.3 / AC-6.8）
 *
 * 1. 一个项目恒有 5 个节拍。数量固定，本模块**不导出**任何增删节拍的能力，
 *    UI 与 API 同样不得提供入口。
 * 2. **不存在"分镜"这一层**：节拍是唯一生成单元，一个节拍 = 一次生成 = 一段视频。
 *    画面由 3 或 2 格「宫格」白话描述构成，替代传统分镜；因此本文件不得出现
 *    景别 / 机位 / 运镜 / 镜头(shot) 等分镜字段。
 *
 * 结构与类型由 W1/WK1 落地；W1/WK3 在此补齐宫格数位置锁、节拍时间位与衔接模板，
 * 供编辑页 UI 与 Prompt 组装读取。
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
 * 宫格数位置锁（方法论 METH-003 §1）：B1–B4 三格、B5 两格，全集恒 14 格。
 * 由板位决定，编辑页不提供切换入口。
 */
export const GRID_SIZE_BY_BEAT_INDEX = {
  1: 3,
  2: 3,
  3: 3,
  4: 3,
  5: 2,
} as const satisfies Record<BeatIndex, GridSize>;

/** 全集宫格总数，= 3+3+3+3+2。 */
export const TOTAL_GRID_CELL_COUNT = 14 as const;

/** 该板位应有的宫格数。 */
export function gridSizeForBeatIndex(index: BeatIndex): GridSize {
  return GRID_SIZE_BY_BEAT_INDEX[index];
}

/**
 * 各格的位置语义（方法论 METH-003 各板"节拍帧"表），左 → 右顺序锁定。
 * 只是**填写提示**：它说明这一格在叙事上承担什么，不涉及任何镜头级参数。
 */
export const CELL_ROLE_HINTS = {
  1: ['冲击', '反应', '环境'],
  2: ['对立方登场', '利害揭明', '立场对峙'],
  3: ['第一层打压', '第二层打压', '压力见顶'],
  4: ['转机浮现', '势能积累', '临界点'],
  5: ['抛出悬念', '最高势能处切断'],
} as const satisfies Record<BeatIndex, readonly string[]>;

export function cellRoleHint(index: BeatIndex, order: number): string {
  return CELL_ROLE_HINTS[index][order - 1] ?? '';
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
  /** 宫格规格：3 或 2。切到 2 时第 3 格内容保留为草稿、不参与组装。 */
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

/**
 * 新建项目时自动预填的 5 个节拍（PRD 5.1.2）。
 * 名称取方法论 METH-003 §1 的标准板名，为规格用词：编辑页只读展示，不可改写。
 */
export const BEAT_PRESETS: readonly BeatPreset[] = [
  { index: 1, name: '开篇钩子', role: '3 秒抓住观众的开场冲突' },
  { index: 2, name: '矛盾建立', role: '矛盾正面展开，敌对关系确立' },
  { index: 3, name: '打压升级', role: '冲突加码、压力递增到底部' },
  { index: 4, name: '反转蓄力', role: '转机浮现，反转前势能拉满' },
  { index: 5, name: '断集留客', role: '最高势能处截断，导向下一集' },
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
    gridSize: gridSizeForBeatIndex(preset.index),
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

/** 节拍在整集时间轴上的时间位（秒）。 */
export interface BeatTimeRange {
  readonly startSec: number;
  readonly endSec: number;
}

/**
 * 由各拍时长累加推出 5 个时间位（方法论 METH-003 §1 的"时间位"列）。
 * 任一拍时长未填则该拍及其后续时间位不可知，返回 null——不猜、不用 0 顶替。
 */
export function beatTimeRanges(
  beats: readonly Beat[],
): readonly (BeatTimeRange | null)[] {
  let cursor = 0;
  let broken = false;

  return beats.map((beat) => {
    if (broken || beat.durationSec === null) {
      broken = true;
      return null;
    }
    const range: BeatTimeRange = { startSec: cursor, endSec: cursor + beat.durationSec };
    cursor = range.endSec;
    return range;
  });
}

/** 整集总时长（秒）；任一拍时长未填则为 null。 */
export function episodeTotalSec(beats: readonly Beat[]): number | null {
  return beats.reduce<number | null>(
    (sum, beat) => (sum === null || beat.durationSec === null ? null : sum + beat.durationSec),
    0,
  );
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
