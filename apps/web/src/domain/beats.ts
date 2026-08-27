/**
 * 五节拍结构 —— 产品红线的代码法源。
 *
 * 上游：`docs/methodology/glossary.md`（METH-002 §2/§3/§9）、
 * `docs/methodology/golden-5-beats.md`（METH-003 §1 整集总览）、PRD R1/R3 与 AC-6.1/6.3/6.8。
 *
 * 四条硬锁，本模块**在类型层与运行时同时锁死**：
 *
 * 1. **五节拍锁**：`beat_list` 长度恒为 5，顺序与语义不可变。本模块不导出任何
 *    增 / 删 / 移动 / 重排节拍的函数，返回的数组被冻结，`push` / `splice` / `reverse` 直接抛错。
 * 2. **宫格锁**：`frame_count` 由板序决定（B1–B4 = 3，B5 = 2），**不可由用户修改**；
 *    帧数组同样被冻结，帧序只允许左 → 右。
 * 3. **时长上限**：单板 ≤ {@link MAX_BEAT_DURATION_SEC} 秒。
 * 4. **无镜头级拆解**：节拍是最小叙事单元，不存在 shot / 景别 / 机位 / 运镜 / camera_json /
 *    逐镜时长等任何小于 beat 粒度的字段。组内切分归 AI，本模块不建模。
 *
 * 命名约定：**数据字段一律 snake_case**（对齐 METH-002 §10 与 PRD §9.2 的字段法源，
 * 便于 WK3 数据 / API 层直接序列化）；函数与类型名沿用 TS 惯例。
 */

import { isTransitionRule, type TransitionRule } from './transitions';

/** 节拍数量恒为 5。 */
export const BEAT_COUNT = 5 as const;

/** 单板时长上限（秒）。METH-002 §9「30s Cap」。 */
export const MAX_BEAT_DURATION_SEC = 30 as const;

/** 整集时长区间（秒），基准轴 88s。METH-002 §9 / METH-003 §1。 */
export const EPISODE_DURATION_RANGE_SEC = Object.freeze({ min: 70, max: 90 });
export const BASELINE_EPISODE_DURATION_SEC = 88 as const;

/** 节拍序号，1 起，恒为 1–5。 */
export type BeatIndex = 1 | 2 | 3 | 4 | 5;
export const BEAT_INDEXES: readonly BeatIndex[] = Object.freeze([1, 2, 3, 4, 5] as const);

/** 节拍语义枚举，顺序与语义硬锁（METH-002 §2）。 */
export type BeatType =
  | 'BEAT_HOOK'
  | 'BEAT_CONFLICT'
  | 'BEAT_ESCALATION'
  | 'BEAT_CHARGEUP'
  | 'BEAT_CLIFFHANGER';

/** 镜头组编号：1 Beat = 1 G，四者 1:1（METH-002 §1 恒等式）。 */
export type GIndex = 'G1' | 'G2' | 'G3' | 'G4' | 'G5';

/** 宫格数只有 3 与 2 两种，且由板序决定，不由用户选择。 */
export type FrameCount = 3 | 2;

/** 帧序，左 → 右，最大 3。 */
export type FrameOrder = 1 | 2 | 3;

/** 帧语义，以 Beat 1 为样板定义（METH-002 §3）。 */
export type FrameSemantic = 'impact' | 'reaction' | 'env';

/** 节拍状态点（编辑页左导航与成片页共用）。 */
export type BeatStatus = 'empty' | 'filled' | 'generating' | 'generated' | 'failed';

/**
 * 情绪基调预设（PRD 5.2.2 的单选项）。
 * `emotion` 字段本身是自由文本——METH-003 的组装样例用的是整句情绪描写；
 * 预设只作为 UI 的快速起手，不构成取值约束。
 */
export const EMOTION_PRESETS: readonly string[] = Object.freeze([
  '紧张',
  '温情',
  '悬疑',
  '爆笑',
  '愤怒',
  '悲伤',
  '燃',
] as const);

/**
 * 节拍帧（宫格）：只有一段白话画面描述，描述该段内的一个关键画面信息点。
 * 这里**没有**景别 / 机位 / 运镜，也没有比板更细的时长字段——
 * 宫格就是本产品对镜头级拆解（METH-002 §8 禁用词表首项）的替代物。
 */
export interface BeatFrame {
  /** 帧序，左 → 右，创建后不可写。 */
  readonly order: FrameOrder;
  /** 该帧的语义（仅 Beat 1 有 canon 语义，其余为 null）。 */
  readonly semantic: FrameSemantic | null;
  /** 这一格里发生什么、看到什么。 */
  text: string;
}

/** 一块板的 canon 规格，全部字段来自方法论法源，运行时冻结。 */
export interface BeatDef {
  readonly index: BeatIndex;
  readonly beat_type: BeatType;
  readonly g_index: GIndex;
  /** canon 节拍名，如「开篇钩子」。 */
  readonly name: string;
  /** 该板的叙事职责。 */
  readonly role: string;
  /** 时间位起点（秒，含）。 */
  readonly time_start: number;
  /** 时间位终点（秒，不含）。 */
  readonly time_end: number;
  /** canon 时长（秒），恒等于 `time_end - time_start`，且 ≤ 30。 */
  readonly duration_sec: number;
  /** 宫格数，由板序决定。 */
  readonly frame_count: FrameCount;
  /** 帧语义序列，长度等于 `frame_count`；仅 Beat 1 有 canon 语义。 */
  readonly frame_semantics: readonly (FrameSemantic | null)[];
  /** 本板结束时如何进入下一板，只在后期合成生效，绝不进 Prompt。 */
  readonly transition_rule: TransitionRule;
}

/**
 * 黄金五板骨架【CANON】——METH-003 §1 整集总览 + §8 组间衔接总表。
 *
 * 时间位 0-8 / 8-25 / 25-45 / 45-70 / 70-88，宫格 3 / 3 / 3 / 3 / 2，总时长 88s。
 * B4 在 METH-003 中记作「卡点硬切 + BGM 升调」，落到封闭枚举取 `BGM升调截断`。
 */
const BEAT_DEFS_SOURCE = [
  {
    index: 1,
    beat_type: 'BEAT_HOOK',
    g_index: 'G1',
    name: '开篇钩子',
    role: '3 秒内制造冲击，抛出全片钩子',
    time_start: 0,
    time_end: 8,
    duration_sec: 8,
    frame_count: 3,
    frame_semantics: ['impact', 'reaction', 'env'],
    transition_rule: '音频预接',
  },
  {
    index: 2,
    beat_type: 'BEAT_CONFLICT',
    g_index: 'G2',
    name: '矛盾建立',
    role: '交代对立方与利害，确立敌对关系',
    time_start: 8,
    time_end: 25,
    duration_sec: 17,
    frame_count: 3,
    frame_semantics: [null, null, null],
    transition_rule: '卡点硬切',
  },
  {
    index: 3,
    beat_type: 'BEAT_ESCALATION',
    g_index: 'G3',
    name: '打压升级',
    role: '压力逐级加码，情绪压到底部',
    time_start: 25,
    time_end: 45,
    duration_sec: 20,
    frame_count: 3,
    frame_semantics: [null, null, null],
    transition_rule: '纯硬切',
  },
  {
    index: 4,
    beat_type: 'BEAT_CHARGEUP',
    g_index: 'G4',
    name: '反转蓄力',
    role: '转机浮现、势能积累到临界点',
    time_start: 45,
    time_end: 70,
    duration_sec: 25,
    frame_count: 3,
    frame_semantics: [null, null, null],
    transition_rule: 'BGM升调截断',
  },
  {
    index: 5,
    beat_type: 'BEAT_CLIFFHANGER',
    g_index: 'G5',
    name: '断集留客',
    role: '在最高势能处切断，留悬念到下一集',
    time_start: 70,
    time_end: 88,
    duration_sec: 18,
    frame_count: 2,
    frame_semantics: [null, null],
    transition_rule: '黑屏断钩子',
  },
] as const satisfies readonly BeatDef[];

export const BEAT_DEFS: readonly BeatDef[] = Object.freeze(
  BEAT_DEFS_SOURCE.map((def) =>
    Object.freeze({ ...def, frame_semantics: Object.freeze([...def.frame_semantics]) }),
  ),
);

/**
 * 节拍板。
 *
 * `readonly` 的结构字段（index / beat_type / g_index / time_start / time_end /
 * frame_count / frames）在运行时以不可写属性定义，赋值会抛 `TypeError`——
 * 类型断言绕过编译期检查也改不动。
 *
 * 进 Prompt（●）：emotion / duration_sec / camera_rhythm / plot_core / frames[].text
 * 不进 Prompt（○）：title / transition_rule / note —— 见 `./prompt.ts` 的硬排除清单。
 */
export interface Beat {
  readonly index: BeatIndex;
  readonly beat_type: BeatType;
  readonly g_index: GIndex;
  readonly time_start: number;
  readonly time_end: number;
  /** 宫格数，锁定值来自 {@link BEAT_DEFS}。 */
  readonly frame_count: FrameCount;
  /** 节拍名称，可改；仅用于导航与成片页标识，○ 不进 Prompt。 */
  title: string;
  /** 本段情绪，● 进 Prompt。 */
  emotion: string;
  /** 本板时长（秒），● 进 Prompt 文本，同时作为 API 参数；≤ 30。 */
  duration_sec: number;
  /** 镜头节奏形容，不含刀数与逐镜时长，● 进 Prompt。 */
  camera_rhythm: string;
  /** 剧情核心，一句话剧情推进，● 进 Prompt。 */
  plot_core: string;
  /** 节拍帧，长度恒等于 `frame_count`，帧序左 → 右，数组被冻结。 */
  readonly frames: readonly BeatFrame[];
  /** 组间衔接，○ **绝不进入 Prompt 与生成请求体**。 */
  transition_rule: TransitionRule;
  /** 自由备忘，○ 不进 Prompt。 */
  note: string;
  status: BeatStatus;
}

/** 恒为 5 项的节拍板列表。 */
export type BeatList = readonly [Beat, Beat, Beat, Beat, Beat];

/** 运行时不可写的结构字段清单。 */
export const LOCKED_BEAT_FIELDS = Object.freeze([
  'index',
  'beat_type',
  'g_index',
  'time_start',
  'time_end',
  'frame_count',
  'frames',
] as const);

export type LockedBeatField = (typeof LOCKED_BEAT_FIELDS)[number];

export function beatDef(index: BeatIndex): BeatDef {
  const def = BEAT_DEFS[index - 1];
  if (def === undefined) {
    throw new RangeError(`节拍序号越界：${index}；节拍数恒为 ${BEAT_COUNT}`);
  }
  return def;
}

/** 板序 → 宫格数。B1–B4 = 3，B5 = 2。 */
export function frameCountFor(index: BeatIndex): FrameCount {
  return beatDef(index).frame_count;
}

function createFrames(def: BeatDef): readonly BeatFrame[] {
  const frames = Array.from({ length: def.frame_count }, (_, i) => {
    // `order` / `semantic` 只经 defineProperties 定义，不先出现在字面量里——
    // 重定义已存在的属性会保留原有的 writable: true，锁就形同虚设。
    const frame = { text: '' };
    Object.defineProperties(frame, {
      order: { value: (i + 1) as FrameOrder, enumerable: true },
      semantic: { value: def.frame_semantics[i] ?? null, enumerable: true },
    });
    return frame as BeatFrame;
  });
  // 冻结数组本身：push / splice / reverse / sort 与下标赋值全部抛错，
  // 帧对象不冻结，`text` 仍可编辑。
  return Object.freeze(frames);
}

function createBeat(def: BeatDef): Beat {
  const beat = {
    title: def.name,
    emotion: '',
    duration_sec: def.duration_sec,
    camera_rhythm: '',
    plot_core: '',
    transition_rule: def.transition_rule,
    note: '',
    status: 'empty' as BeatStatus,
  };

  Object.defineProperties(beat, {
    index: { value: def.index, enumerable: true },
    beat_type: { value: def.beat_type, enumerable: true },
    g_index: { value: def.g_index, enumerable: true },
    time_start: { value: def.time_start, enumerable: true },
    time_end: { value: def.time_end, enumerable: true },
    frame_count: { value: def.frame_count, enumerable: true },
    frames: { value: createFrames(def), enumerable: true },
  });

  return beat as Beat;
}

/**
 * 建出锁死的 5 块板。
 *
 * 返回的数组被冻结：任何增删改序（`push` / `pop` / `splice` / `reverse` / `sort` /
 * 下标赋值）都会抛 `TypeError`。**本模块不提供、也不得新增任何解锁入口。**
 */
export function createBeatList(): BeatList {
  return Object.freeze(BEAT_DEFS.map(createBeat)) as unknown as BeatList;
}

/** 参与 Prompt 组装的帧，按帧序左 → 右。 */
export function orderedFrames(beat: Beat): readonly BeatFrame[] {
  return beat.frames;
}

/** 单板时长是否在上限内（0 < d ≤ 30）。 */
export function isDurationWithinCap(durationSec: number): boolean {
  return Number.isFinite(durationSec) && durationSec > 0 && durationSec <= MAX_BEAT_DURATION_SEC;
}

/** 必填字段是否齐备（PRD 5.2.2 / AC-6.2）；未就绪的节拍不可提交生成。 */
export function isBeatReady(beat: Beat): boolean {
  return (
    beat.title.trim() !== '' &&
    beat.emotion.trim() !== '' &&
    beat.camera_rhythm.trim() !== '' &&
    beat.plot_core.trim() !== '' &&
    isDurationWithinCap(beat.duration_sec) &&
    beat.frames.length === beat.frame_count &&
    beat.frames.every((frame) => frame.text.trim() !== '')
  );
}

/** 红线违规码。 */
export type LockViolationCode =
  | 'BEAT_COUNT_NOT_5'
  | 'BEAT_INDEX_OUT_OF_ORDER'
  | 'BEAT_TYPE_MISMATCH'
  | 'G_INDEX_MISMATCH'
  | 'TIME_RANGE_MISMATCH'
  | 'FRAME_COUNT_MISMATCH'
  | 'FRAME_COUNT_NOT_LOCKED'
  | 'FRAME_ORDER_NOT_LTR'
  | 'DURATION_OVER_CAP'
  | 'TRANSITION_RULE_UNKNOWN';

export interface LockViolation {
  readonly code: LockViolationCode;
  readonly message: string;
  /** 违规所在板序；整表级违规为 null。 */
  readonly index: BeatIndex | null;
}

function violation(code: LockViolationCode, index: BeatIndex | null, message: string): LockViolation {
  return Object.freeze({ code, index, message });
}

/**
 * 校验五节拍锁 / 宫格锁 / 帧序锁 / 时长上限 / 衔接枚举。
 * 返回空数组表示合规。给 WK3 的数据层与 API 层复用，防止绕开构造函数写入非法结构。
 */
export function validateBeatList(beatList: readonly Beat[]): readonly LockViolation[] {
  const violations: LockViolation[] = [];

  if (beatList.length !== BEAT_COUNT) {
    violations.push(
      violation(
        'BEAT_COUNT_NOT_5',
        null,
        `节拍数恒为 ${BEAT_COUNT}，实际 ${beatList.length}；不允许增删节拍`,
      ),
    );
  }

  beatList.forEach((beat, i) => {
    const expectedIndex = (i + 1) as BeatIndex;
    if (beat.index !== expectedIndex) {
      violations.push(
        violation(
          'BEAT_INDEX_OUT_OF_ORDER',
          expectedIndex,
          `第 ${i + 1} 项的 index 为 ${beat.index}，节拍顺序不可重排`,
        ),
      );
      return;
    }

    const def = BEAT_DEFS[i];
    if (def === undefined) {
      return;
    }

    if (beat.beat_type !== def.beat_type) {
      violations.push(
        violation('BEAT_TYPE_MISMATCH', def.index, `节拍 ${def.index} 语义应为 ${def.beat_type}`),
      );
    }
    if (beat.g_index !== def.g_index) {
      violations.push(
        violation('G_INDEX_MISMATCH', def.index, `节拍 ${def.index} 镜头组应为 ${def.g_index}`),
      );
    }
    if (beat.time_start !== def.time_start || beat.time_end !== def.time_end) {
      violations.push(
        violation(
          'TIME_RANGE_MISMATCH',
          def.index,
          `节拍 ${def.index} 时间位应为 ${def.time_start}-${def.time_end}s`,
        ),
      );
    }
    if (beat.frame_count !== def.frame_count) {
      violations.push(
        violation(
          'FRAME_COUNT_NOT_LOCKED',
          def.index,
          `节拍 ${def.index} 宫格数由板序锁定为 ${def.frame_count}，不可修改`,
        ),
      );
    }
    if (beat.frames.length !== def.frame_count) {
      violations.push(
        violation(
          'FRAME_COUNT_MISMATCH',
          def.index,
          `节拍 ${def.index} 应有 ${def.frame_count} 格，实际 ${beat.frames.length}；不可增删宫格`,
        ),
      );
    }
    const orders = beat.frames.map((frame) => frame.order);
    const ltr = orders.every((order, at) => order === at + 1);
    if (!ltr) {
      violations.push(
        violation(
          'FRAME_ORDER_NOT_LTR',
          def.index,
          `节拍 ${def.index} 帧序只允许左 → 右，实际 [${orders.join(', ')}]`,
        ),
      );
    }
    if (!isDurationWithinCap(beat.duration_sec)) {
      violations.push(
        violation(
          'DURATION_OVER_CAP',
          def.index,
          `节拍 ${def.index} 时长 ${beat.duration_sec}s 超出上限 ${MAX_BEAT_DURATION_SEC}s`,
        ),
      );
    }
    if (!isTransitionRule(beat.transition_rule)) {
      violations.push(
        violation(
          'TRANSITION_RULE_UNKNOWN',
          def.index,
          `节拍 ${def.index} 的组间衔接「${String(beat.transition_rule)}」不在封闭目录内`,
        ),
      );
    }
  });

  return Object.freeze(violations);
}

/** 违规即抛错，用于写入前的守卫。 */
export function assertBeatListLocked(beatList: readonly Beat[]): void {
  const violations = validateBeatList(beatList);
  if (violations.length > 0) {
    throw new Error(
      `五节拍结构违规：${violations.map((item) => `[${item.code}] ${item.message}`).join('；')}`,
    );
  }
}
