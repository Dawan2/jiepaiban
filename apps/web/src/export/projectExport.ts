/**
 * 项目导出与交付包（PRD 5.5.2「全部下载打包 zip」、AC-6.9 快照可溯）。
 *
 * 两种产物：
 *
 * 1. **项目 JSON**：项目级字段 + 5 块板全字段 + 各板 Prompt 全文 + 衔接总表 + 拼接计划。
 *    这是一份能把项目原样搬走的档案，也是快照可溯的落点。
 * 2. **交付包清单**：zip 里应该有哪些文件、每个文件从哪个地址取。
 *    V1.0 的视频地址是桩件地址（`stub://`），拿不到字节流，所以先出清单不出二进制；
 *    接真实签名 URL 后按清单逐项抓取打包即可，清单结构不用改。
 *
 * 红线复述：导出里**有**衔接（后期合成要用），生成请求体里**没有**衔接。
 * 两条路径的数据源不同——导出读的是板上字段，请求体读的是 `domain/prompt.ts` 的白名单。
 */

import { BEAT_COUNT, orderedFrames, beatDef, type BeatIndex } from '../domain/beats';
import { assemblePrompt } from '../domain/prompt';
import { beatAt, episodeDuration, type Project } from '../domain/projects';
import { TRANSITION_STAGE } from '../domain/transitions';
import type { DownloadFile } from './download';
import {
  deliveryManifestFileName,
  deliveryZipFileName,
  projectJsonFileName,
  segmentEntryPath,
} from './naming';
import type { SegmentCard } from './segments';
import { buildStitchPlan, type StitchPlan } from './stitchPlan';

/** 导出格式版本；字段有增删时递增，导入侧照此判断兼容性。 */
export const EXPORT_SCHEMA_VERSION = 1 as const;

export const JSON_MIME = 'application/json;charset=utf-8' as const;

export interface ExportOptions {
  /** 导出时间，默认取当前时刻；测试注入固定值。 */
  readonly now?: string;
}

export interface ExportedFrame {
  readonly order: number;
  readonly semantic: string | null;
  readonly text: string;
}

export interface ExportedBeat {
  readonly index: BeatIndex;
  readonly beat_type: string;
  readonly g_index: string;
  readonly beat_name: string;
  readonly title: string;
  readonly time_start: number;
  readonly time_end: number;
  readonly duration_sec: number;
  readonly frame_count: number;
  readonly frames: readonly ExportedFrame[];
  readonly emotion: string;
  readonly camera_rhythm: string;
  readonly plot_core: string;
  readonly note: string;
  /** 组间衔接：只给后期合成，不给生成。 */
  readonly transition_rule: string;
  readonly transition_code: string;
  readonly transition_point: string;
  readonly transition_stage: typeof TRANSITION_STAGE;
  readonly status: string;
  /** 提交给模型的 Prompt 全文（所见即所发，R5）。 */
  readonly prompt_final: string;
  readonly video_url: string | null;
  readonly generated_at: string | null;
  readonly attempt: number;
}

export interface ProjectExportPayload {
  readonly schema_version: typeof EXPORT_SCHEMA_VERSION;
  readonly exported_at: string;
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly genre: string;
    readonly aspect_ratio: Project['aspect_ratio'];
    readonly total_duration_sec: number;
    readonly beat_duration_sum_sec: number;
    readonly style_prompt: string;
    readonly protagonist: string;
    readonly updated_at: string;
    readonly beat_count: typeof BEAT_COUNT;
  };
  readonly beats: readonly ExportedBeat[];
  readonly transitions: StitchPlan['transitions'];
  readonly stitch_plan: {
    readonly total_duration_sec: number;
    readonly is_complete: boolean;
    readonly missing_indexes: readonly BeatIndex[];
    readonly rows: StitchPlan['rows'];
  };
}

function exportBeat(project: Project, card: SegmentCard): ExportedBeat {
  const beat = beatAt(project, card.beat_index);
  const def = beatDef(card.beat_index);

  return Object.freeze({
    index: beat.index,
    beat_type: beat.beat_type,
    g_index: beat.g_index,
    beat_name: def.name,
    title: beat.title,
    time_start: beat.time_start,
    time_end: beat.time_end,
    duration_sec: beat.duration_sec,
    frame_count: beat.frame_count,
    frames: Object.freeze(
      orderedFrames(beat).map((frame) =>
        Object.freeze({ order: frame.order, semantic: frame.semantic, text: frame.text }),
      ),
    ),
    emotion: beat.emotion,
    camera_rhythm: beat.camera_rhythm,
    plot_core: beat.plot_core,
    note: beat.note,
    transition_rule: card.transition.rule,
    transition_code: card.transition.code,
    transition_point: card.transition.point_label,
    transition_stage: TRANSITION_STAGE,
    status: card.status,
    prompt_final: assemblePrompt(project, beat),
    video_url: card.video_url,
    generated_at: card.generated_at,
    attempt: card.attempt,
  });
}

export function buildProjectExport(
  project: Project,
  cards: readonly SegmentCard[],
  options: ExportOptions = {},
): ProjectExportPayload {
  const plan = buildStitchPlan(project, cards);

  return Object.freeze({
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: options.now ?? new Date().toISOString(),
    project: Object.freeze({
      id: project.id,
      name: project.name,
      genre: project.genre,
      aspect_ratio: project.aspect_ratio,
      total_duration_sec: project.total_duration_sec,
      beat_duration_sum_sec: episodeDuration(project),
      style_prompt: project.style_prompt,
      protagonist: project.protagonist,
      updated_at: project.updated_at,
      beat_count: BEAT_COUNT,
    }),
    beats: Object.freeze(cards.map((card) => exportBeat(project, card))),
    transitions: plan.transitions,
    stitch_plan: Object.freeze({
      total_duration_sec: plan.total_duration_sec,
      is_complete: plan.is_complete,
      missing_indexes: plan.missing_indexes,
      rows: plan.rows,
    }),
  });
}

export interface DeliveryEntry {
  /** zip 内相对路径。 */
  readonly path: string;
  /** 取件地址；`null` 表示这份文件由本次导出即时生成（如项目 JSON）。 */
  readonly source_url: string | null;
  readonly beat_index: BeatIndex | null;
  readonly duration_sec: number | null;
}

export interface DeliveryManifest {
  readonly schema_version: typeof EXPORT_SCHEMA_VERSION;
  readonly created_at: string;
  readonly zip_file_name: string;
  readonly project_id: string;
  readonly project_name: string;
  readonly total_duration_sec: number;
  readonly segment_count: number;
  readonly is_complete: boolean;
  readonly missing_indexes: readonly BeatIndex[];
  readonly entries: readonly DeliveryEntry[];
  /** 打包状态说明，写进清单，避免后期合成的人误以为丢文件。 */
  readonly note: string;
}

const STUB_URL_PREFIX = 'stub://';

export function buildDeliveryManifest(
  project: Project,
  cards: readonly SegmentCard[],
  options: ExportOptions = {},
): DeliveryManifest {
  const plan = buildStitchPlan(project, cards);
  const segmentEntries: DeliveryEntry[] = cards
    .filter((card) => card.is_generated && card.video_url !== null)
    .map((card) =>
      Object.freeze({
        path: segmentEntryPath(project, beatAt(project, card.beat_index)),
        source_url: card.video_url,
        beat_index: card.beat_index,
        duration_sec: card.duration_sec,
      }),
    );

  const entries: DeliveryEntry[] = [
    ...segmentEntries,
    Object.freeze({
      path: projectJsonFileName(project),
      source_url: null,
      beat_index: null,
      duration_sec: null,
    }),
  ];

  const stubbed = segmentEntries.some((entry) => entry.source_url?.startsWith(STUB_URL_PREFIX));

  return Object.freeze({
    schema_version: EXPORT_SCHEMA_VERSION,
    created_at: options.now ?? new Date().toISOString(),
    zip_file_name: deliveryZipFileName(project),
    project_id: project.id,
    project_name: project.name,
    total_duration_sec: plan.total_duration_sec,
    segment_count: segmentEntries.length,
    is_complete: plan.is_complete,
    missing_indexes: plan.missing_indexes,
    entries: Object.freeze(entries),
    note: stubbed
      ? '视频地址为桩件地址，尚不可抓取；接入真实签名 URL 后按 entries 逐项抓取即可打包。'
      : '按 entries 逐项抓取后打包为 zip_file_name。',
  });
}

export function toJsonText(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** 项目 JSON 的可下载文件。 */
export function buildProjectJsonFile(
  project: Project,
  cards: readonly SegmentCard[],
  options: ExportOptions = {},
): DownloadFile {
  return Object.freeze({
    file_name: projectJsonFileName(project),
    text: toJsonText(buildProjectExport(project, cards, options)),
    mime: JSON_MIME,
  });
}

/** 交付包清单的可下载文件。 */
export function buildDeliveryManifestFile(
  project: Project,
  cards: readonly SegmentCard[],
  options: ExportOptions = {},
): DownloadFile {
  return Object.freeze({
    file_name: deliveryManifestFileName(project),
    text: toJsonText(buildDeliveryManifest(project, cards, options)),
    mime: JSON_MIME,
  });
}
