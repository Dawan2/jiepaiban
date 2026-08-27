/**
 * 拼接计划与衔接总表（PRD 5.5.3 / 5.5.5、FR-5-06 同源）。
 *
 * 「拼接计划」是给后期合成看的一张单子：5 段按板序排开，各段起止时间位、时长、
 * 成片地址，段与段之间挂着衔接手法。它是 V1.1「一键拼接」的输入契约——
 * V1.0 先把单子出全，按钮置灰等 V1.1（5.5.5）。
 *
 * 红线：这张单子**只往后期走**。衔接手法在这里是一等公民，但它从不回流到生成侧；
 * 请求体的字段白名单在 `domain/prompt.ts`，与本模块没有任何通路（R2 / AC-6.4）。
 */

import { EPISODE_DURATION_RANGE_SEC, type BeatIndex } from '../domain/beats';
import { isEpisodeDurationValid, type Project } from '../domain/projects';
import { TRANSITION_STAGE } from '../domain/transitions';
import {
  missingSegmentIndexes,
  missingSegmentReason,
  type SegmentCard,
  type SegmentTransition,
} from './segments';

/** V1.1 才解锁「一键拼接」（PRD 5.5.5 / §10 版本纪律）。 */
export const STITCH_UNLOCK_VERSION = 'V1.1' as const;
export const STITCH_LOCKED_HINT = `一键拼接为 ${STITCH_UNLOCK_VERSION} 能力，V1.0 只出拼接计划` as const;

export interface StitchRow {
  readonly beat_index: BeatIndex;
  readonly title: string;
  readonly duration_sec: number;
  /** 在拼接后成片里的起点（秒），由前序段的实际时长累加得出。 */
  readonly start_sec: number;
  readonly end_sec: number;
  /** `00:00 – 00:08`。 */
  readonly range_label: string;
  readonly video_url: string | null;
  readonly is_ready: boolean;
  readonly status_label: string;
  readonly transition: SegmentTransition;
}

export interface StitchPlan {
  readonly project_id: string;
  readonly project_name: string;
  readonly aspect_ratio: Project['aspect_ratio'];
  /** 恒 5 行，顺序即节拍序。 */
  readonly rows: readonly StitchRow[];
  /** 衔接总表，与 `rows` 同源同序（FR-5-06 / AC-F5-8）。 */
  readonly transitions: readonly SegmentTransition[];
  /** 衔接生效阶段，恒为「后期合成」。 */
  readonly transition_stage: typeof TRANSITION_STAGE;
  readonly total_duration_sec: number;
  readonly ready_count: number;
  readonly missing_indexes: readonly BeatIndex[];
  readonly is_complete: boolean;
  /** 缺片原因；齐备时 `null`。 */
  readonly blocked_reason: string | null;
  /** 整集时长是否落在 70–90s 区间内。 */
  readonly is_duration_in_range: boolean;
  readonly duration_range_sec: typeof EPISODE_DURATION_RANGE_SEC;
}

/** 秒 → `mm:ss`。 */
export function formatClock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.round(totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function buildStitchPlan(project: Project, cards: readonly SegmentCard[]): StitchPlan {
  let cursor = 0;
  const rows: StitchRow[] = cards.map((card) => {
    const start = cursor;
    cursor += card.duration_sec;
    return Object.freeze({
      beat_index: card.beat_index,
      title: card.title,
      duration_sec: card.duration_sec,
      start_sec: start,
      end_sec: cursor,
      range_label: `${formatClock(start)} – ${formatClock(cursor)}`,
      video_url: card.video_url,
      is_ready: card.is_generated,
      status_label: card.status_label,
      transition: card.transition,
    });
  });

  const missing = missingSegmentIndexes(cards);

  return Object.freeze({
    project_id: project.id,
    project_name: project.name,
    aspect_ratio: project.aspect_ratio,
    rows: Object.freeze(rows),
    transitions: Object.freeze(cards.map((card) => card.transition)),
    transition_stage: TRANSITION_STAGE,
    total_duration_sec: cursor,
    ready_count: cards.length - missing.length,
    missing_indexes: missing,
    is_complete: missing.length === 0,
    blocked_reason: missingSegmentReason(cards),
    is_duration_in_range: isEpisodeDurationValid(cursor),
    duration_range_sec: EPISODE_DURATION_RANGE_SEC,
  });
}
