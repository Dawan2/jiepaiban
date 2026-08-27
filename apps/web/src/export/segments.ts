/**
 * 段卡视图模型（PRD 5.5.1 / 5.5.2 / 5.5.4、AC-6.7）。
 *
 * 成片页恒为 **5 张段卡**，顺序恒等于节拍序 1 → 5。顺序不由入参决定：
 * 本模块只按 {@link BEAT_INDEXES} 遍历 `project.beat_list`，即使生成状态数组被打乱、
 * 缺项或重复，产出的卡序也不动。这是 R3「节拍数固定 5」在成片页的落点。
 *
 * 组间衔接在段卡上**可见**（后期合成要照着它剪），但它只是展示：
 * 段卡不参与任何请求体组装，重新生成一律走 `generate/` 的控制器，
 * 请求体由 `domain/prompt.ts` 的白名单组装，衔接进不去（R2 / AC-6.4）。
 *
 * 状态有**两个来源**，落库那份是底：
 *
 * | 来源 | 内容 | 何时是它说话 |
 * | --- | --- | --- |
 * | 落库的板（PRD §8.2 `video_url` / `prompt_final`） | 上一次生成的成片与 Prompt 快照 | 本次会话没有本板任务时 |
 * | 内存里的生成队列（`GenerateBoardState`） | 本次会话的在途 / 新结果 | 本板有任务时 |
 *
 * 只读队列是不够的：成片页刚打开时队列是空的，五块板会一齐显示「未生成」，
 * 连重投入口都给不出来——而库里明明存着五段成片。故队列只覆盖它真正知道的那几块板。
 */

import {
  BEAT_INDEXES,
  beatDef,
  type Beat,
  type BeatIndex,
  type GIndex,
} from '../domain/beats';
import { beatAt, type Project } from '../domain/projects';
import {
  TRANSITION_STAGE,
  transitionEntry,
  type TransitionCode,
  type TransitionRule,
} from '../domain/transitions';
import type { GenerateBoardState } from '../generate/controller';
import { GENERATE_STATUS_LABEL, type GenerateJobStatus } from '../generate/types';
import { segmentFileName } from './naming';

/** 末板衔接指向下一集，不指向第 6 块板（本产品没有第 6 块板）。 */
export const EPISODE_TAIL_LABEL = '下一集' as const;

/**
 * 落库的生成产物（PRD §8.2）。
 *
 * 结构式声明而不是 import 持久化层的 `StoredBeat`：成片页只需要「板上**可能**带这两个
 * 字段」这件事，不需要认识 IndexedDB。领域层刚铸出的板（两字段缺省）与落库的板都能直接传进来。
 */
export interface StoredGeneration {
  readonly video_url?: string | null;
  readonly prompt_final?: string | null;
}

/** 空串与 `null` 一样算未生成，判据与持久化层的 `hasVideo()` 保持一致。 */
function storedVideoUrl(beat: Beat): string | null {
  const url = (beat as Beat & StoredGeneration).video_url;
  return url === undefined || url === null || url === '' ? null : url;
}

function storedPromptFinal(beat: Beat): string | null {
  const prompt = (beat as Beat & StoredGeneration).prompt_final;
  return prompt === undefined || prompt === null || prompt === '' ? null : prompt;
}

export function beatLabel(index: BeatIndex): string {
  return `节拍${index}`;
}

/** 一条衔接：本板结束时如何进入下一板，只在后期合成生效。 */
export interface SegmentTransition {
  readonly beat_index: BeatIndex;
  /** `节拍1 → 节拍2`，末板为 `节拍5 → 下一集`。 */
  readonly point_label: string;
  readonly from_label: string;
  readonly to_label: string;
  readonly rule: TransitionRule;
  readonly code: TransitionCode;
  readonly note: string;
  /** 恒为「后期合成」。 */
  readonly stage: typeof TRANSITION_STAGE;
  readonly is_episode_tail: boolean;
}

export function buildSegmentTransition(beat: Beat): SegmentTransition {
  const entry = transitionEntry(beat.transition_rule);
  const isTail = beat.index === BEAT_INDEXES[BEAT_INDEXES.length - 1];
  const from = beatLabel(beat.index);
  const to = isTail ? EPISODE_TAIL_LABEL : beatLabel((beat.index + 1) as BeatIndex);

  return Object.freeze({
    beat_index: beat.index,
    point_label: `${from} → ${to}`,
    from_label: from,
    to_label: to,
    rule: entry.rule,
    code: entry.code,
    note: entry.note,
    stage: TRANSITION_STAGE,
    is_episode_tail: isTail,
  });
}

export interface SegmentDownload {
  readonly file_name: string;
  readonly url: string;
}

/** 一张段卡。字段全 `readonly`：视图模型每次重算，不做原地改写。 */
export interface SegmentCard {
  readonly beat_index: BeatIndex;
  readonly g_index: GIndex;
  /** 用户改过的节拍名称，○ 不进 Prompt，只作成片页标识。 */
  readonly title: string;
  /** canon 节拍名（开篇钩子…），与 `title` 分开，便于对账。 */
  readonly beat_name: string;
  readonly duration_sec: number;
  readonly time_start: number;
  readonly time_end: number;
  readonly status: GenerateJobStatus;
  readonly status_label: string;
  readonly video_url: string | null;
  /** 状态取自本次会话的队列，还是落库的板。 */
  readonly state_source: GenerationSource;
  /**
   * 实际提交给模型的 Prompt 快照（AC-6.9 快照可溯）：本次任务那份，或库里 `prompt_final`。
   * 从未生成过为 `null`，此时导出侧按当前字段现算一份。
   */
  readonly prompt_snapshot: string | null;
  /** 生成完成时间（ISO），未成功为 `null`。 */
  readonly generated_at: string | null;
  /** 展示用时间文案，未成功为 {@link EMPTY_TIME_LABEL}。 */
  readonly generated_at_label: string;
  readonly transition: SegmentTransition;
  readonly download: SegmentDownload | null;
  readonly can_download: boolean;
  readonly can_regenerate: boolean;
  readonly regenerate_label: string;
  /** 不能重新生成时的可读原因（IX-3：禁用必须给原因）。 */
  readonly regenerate_blocked_reason: string | null;
  readonly failure_message: string | null;
  readonly is_generated: boolean;
  readonly attempt: number;
}

export const EMPTY_TIME_LABEL = '—' as const;

/** ISO → `2026-08-27 09:12:00 UTC`。固定 UTC，避免不同机器出不同文案。 */
export function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return EMPTY_TIME_LABEL;
  }
  return `${parsed.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

function regenerateLabel(state: GenerateBoardState): string {
  if (state.status === 'FAILED' && state.failure?.retryable === true) {
    return '重试本段';
  }
  return '重新生成';
}

/**
 * 能否重新生成：必须已经生成过一次（本次会话的任务，**或**库里已有成片地址），
 * 且前置校验通过、本板无在途任务。
 * 「还没生成过」的板不给重投入口——那是编辑页的活，段卡只给「去编辑」。
 */
function regenerateGate(
  state: GenerateBoardState,
  resolved: ResolvedGeneration,
): {
  readonly can: boolean;
  readonly reason: string | null;
} {
  if (state.job === null && resolved.video_url === null) {
    return { can: false, reason: '本段还没生成过，先回编辑页填字段并生成' };
  }
  // 没有任务时的 `PENDING` 表示「从未提交」，不是「排队中」，不能当在途拦下来。
  if (state.job !== null && (state.status === 'RUNNING' || state.status === 'PENDING')) {
    return { can: false, reason: '本段正在生成，等这一轮跑完再重投' };
  }
  if (state.blocked_reason !== null) {
    return { can: false, reason: state.blocked_reason };
  }
  if (!state.can_generate) {
    return { can: false, reason: '本段暂时不能重投' };
  }
  return { can: true, reason: null };
}

/** 段卡状态的来源。 */
export type GenerationSource = 'live' | 'stored';

interface ResolvedGeneration {
  readonly source: GenerationSource;
  readonly status: GenerateJobStatus;
  readonly status_label: string;
  readonly video_url: string | null;
  readonly generated_at: string | null;
  readonly prompt_snapshot: string | null;
  readonly is_generated: boolean;
}

/**
 * 合流落库那份与队列那份。
 *
 * 无任务时以库为准（刷新页面后成片仍在）；有任务时徽章跟着任务走——在途与失败都要看得见——
 * 但成片地址与 Prompt 快照回落到库里那份：**重投失败不该把上一段已交付的成片抹掉**。
 */
function resolveGeneration(beat: Beat, state: GenerateBoardState): ResolvedGeneration {
  const storedUrl = storedVideoUrl(beat);
  const storedPrompt = storedPromptFinal(beat);

  if (state.job === null) {
    return {
      source: 'stored',
      status: storedUrl === null ? state.status : 'SUCCEEDED',
      status_label: storedUrl === null ? state.status_label : GENERATE_STATUS_LABEL.SUCCEEDED,
      video_url: storedUrl,
      // 库里只存地址不存完成时刻，未知就写未知，不拿项目的 updated_at 冒充。
      generated_at: null,
      prompt_snapshot: storedPrompt,
      is_generated: storedUrl !== null,
    };
  }

  const succeeded = state.status === 'SUCCEEDED' && state.video_url !== null;

  return {
    source: 'live',
    status: state.status,
    status_label: state.status_label,
    video_url: succeeded ? state.video_url : storedUrl,
    generated_at: succeeded ? state.job.updated_at : null,
    prompt_snapshot: succeeded ? state.job.prompt_snapshot : storedPrompt,
    is_generated: succeeded || storedUrl !== null,
  };
}

function buildCard(project: Project, beat: Beat, state: GenerateBoardState): SegmentCard {
  const def = beatDef(beat.index);
  const resolved = resolveGeneration(beat, state);
  const gate = regenerateGate(state, resolved);

  return Object.freeze({
    beat_index: beat.index,
    g_index: beat.g_index,
    title: beat.title,
    beat_name: def.name,
    duration_sec: beat.duration_sec,
    time_start: beat.time_start,
    time_end: beat.time_end,
    status: resolved.status,
    status_label: resolved.status_label,
    video_url: resolved.video_url,
    state_source: resolved.source,
    prompt_snapshot: resolved.prompt_snapshot,
    generated_at: resolved.generated_at,
    generated_at_label:
      resolved.generated_at === null ? EMPTY_TIME_LABEL : formatTimestamp(resolved.generated_at),
    transition: buildSegmentTransition(beat),
    download:
      resolved.video_url === null
        ? null
        : Object.freeze({ file_name: segmentFileName(project, beat), url: resolved.video_url }),
    can_download: resolved.video_url !== null,
    can_regenerate: gate.can,
    regenerate_label: regenerateLabel(state),
    regenerate_blocked_reason: gate.reason,
    failure_message:
      state.failure === null ? null : `${state.failure.label}·${state.failure.message}`,
    is_generated: resolved.is_generated,
    attempt: state.job?.attempt ?? 0,
  });
}

/** 板序没有对应状态时的空白态（状态数组缺项也不能少一张卡）。 */
function fallbackState(beatIndex: BeatIndex): GenerateBoardState {
  return Object.freeze({
    beat_index: beatIndex,
    status: 'PENDING',
    status_label: '待生成',
    job: null,
    video_url: null,
    failure: null,
    blocked_reason: null,
    can_generate: false,
    action_label: '生成本板',
  });
}

/**
 * 建出 5 张段卡，顺序恒为节拍序。
 *
 * `states` 只作为状态来源按 `beat_index` 查表——**它的数组顺序不影响卡序**；
 * 没有对应任务的板回落到 `project.beat_list` 上落库的 `video_url` / `prompt_final`。
 * 传落库项目（`StoredProject`）即可拿到落库态，传领域项目则只有队列态。
 */
export function buildSegmentCards(
  project: Project,
  states: readonly GenerateBoardState[],
): readonly SegmentCard[] {
  return Object.freeze(
    BEAT_INDEXES.map((index) => {
      const state = states.find((item) => item.beat_index === index) ?? fallbackState(index);
      return buildCard(project, beatAt(project, index), state);
    }),
  );
}

/** 缺片板号（AC-6.7 的反向判据）。 */
export function missingSegmentIndexes(cards: readonly SegmentCard[]): readonly BeatIndex[] {
  return Object.freeze(cards.filter((card) => !card.is_generated).map((card) => card.beat_index));
}

/** 缺片提示文案；齐备时返回 `null`。 */
export function missingSegmentReason(cards: readonly SegmentCard[]): string | null {
  const missing = missingSegmentIndexes(cards);
  if (missing.length === 0) {
    return null;
  }
  return `还缺 ${missing.map(beatLabel).join('、')} 的成片`;
}
