/**
 * 飞书协作文档载荷（W4/FEISHU-EXPORT）。
 *
 * 交付评审在飞书文档里做，但 `export/projectExport.ts` 的项目 JSON 是**机器档案**：
 * 字段全量、嵌套三层，贴进飞书只能得到一坨没人读的代码块。本模块出的是**人读的版本**：
 * 一集一份，集名在最前，五拍逐段列开（情绪 / 时间位 / 节拍帧 / Prompt 全文），
 * 组间衔接单独成节并标注只在后期生效。
 *
 * 与项目 JSON 的分工：
 *
 * | 产物 | 读者 | 形态 |
 * | --- | --- | --- |
 * | `export/projectExport.ts` 的项目 JSON | 导入侧程序 | 全字段、可回灌 |
 * | 本模块的飞书文档 | 后期合成 / 编剧 / 评审 | 分节、可粘贴、Markdown 与 JSON 双形态 |
 *
 * 红线复述（PRD R2 / AC-6.4）：组间衔接在本文档里**有**——后期合成要照它剪；
 * 但它只出现在「组间衔接总表」这一节，Prompt 全文那一节里一个字都没有。
 * 这条不是靠渲染时记得过滤：Prompt 文本取自 `domain/prompt.ts` 的白名单组装器，
 * 衔接字段压根没有进入那条通路的入口，`feishuMarkdown.test.ts` 再逐节复查一次。
 */

import {
  BEAT_COUNT,
  BEAT_INDEXES,
  beatDef,
  orderedFrames,
  type Beat,
  type BeatIndex,
  type FrameSemantic,
  type GIndex,
} from '../domain/beats';
import { assemblePrompt } from '../domain/prompt';
import { beatAt, episodeDuration, type Project } from '../domain/projects';
import { TRANSITION_STAGE, type TransitionCode, type TransitionRule } from '../domain/transitions';
import { beatLabel, buildSegmentTransition } from '../export/segments';

/** 文档格式版本；分节或字段有增删时递增。 */
export const FEISHU_DOC_SCHEMA_VERSION = 1 as const;

/** 空值占位。飞书表格里空单元格会被读成「漏填」，统一给一个可见的破折号。 */
export const FEISHU_EMPTY = '—' as const;

/** 节拍帧的连接符，与 `domain/prompt.ts` 的帧连接符同形，便于逐字对照。 */
export const FRAME_ARROW = ' → ' as const;

/** 帧语义的中文标注（仅节拍 1 有 canon 语义）。 */
export const FRAME_SEMANTIC_LABELS: Readonly<Record<FrameSemantic, string>> = Object.freeze({
  impact: '冲击',
  reaction: '反应',
  env: '环境',
});

export function frameSemanticLabel(semantic: FrameSemantic | null): string {
  return semantic === null ? '' : FRAME_SEMANTIC_LABELS[semantic];
}

export interface FeishuFrame {
  readonly order: number;
  readonly semantic: FrameSemantic | null;
  /** 语义中文标注；无 canon 语义时为空串。 */
  readonly semantic_label: string;
  readonly text: string;
  /** `冲击｜戒指砸在地上`；无语义时等于 `text`。 */
  readonly label: string;
}

/**
 * 一条组间衔接。`stage` 恒为「后期合成」，是本文档里唯一给衔接留的位置。
 */
export interface FeishuTransition {
  readonly beat_index: BeatIndex;
  /** `节拍1 → 节拍2`，末拍为 `节拍5 → 下一集`。 */
  readonly point_label: string;
  readonly rule: TransitionRule;
  readonly code: TransitionCode;
  readonly note: string;
  /** 恒为 {@link TRANSITION_STAGE}。 */
  readonly stage: typeof TRANSITION_STAGE;
  readonly is_episode_tail: boolean;
}

export interface FeishuBeatSection {
  readonly index: BeatIndex;
  readonly g_index: GIndex;
  /** canon 节拍名（开篇钩子…）。 */
  readonly beat_name: string;
  /** 用户改过的节拍名称。 */
  readonly title: string;
  /** `节拍1 · 开篇钩子`，Markdown 里的三级标题文案。 */
  readonly heading: string;
  readonly emotion: string;
  readonly time_start: number;
  readonly time_end: number;
  /** canon 时间位 `0-8s`。 */
  readonly time_range: string;
  readonly duration_sec: number;
  /** `8 秒`。 */
  readonly duration_label: string;
  readonly camera_rhythm: string;
  readonly plot_core: string;
  readonly note: string;
  readonly frame_count: number;
  readonly frames: readonly FeishuFrame[];
  /** 帧正文按帧序左 → 右拼接，与 Prompt 里的帧片段同形。 */
  readonly frames_text: string;
  /** 带语义标注的帧拼接，给人读。 */
  readonly frames_label_text: string;
  /** 提交给模型的 Prompt 全文（R5 所见即所发）。 */
  readonly prompt_final: string;
  /** 本拍的组间衔接；只在「组间衔接总表」那一节渲染。 */
  readonly transition: FeishuTransition;
  readonly status_label: string;
  readonly video_url: string | null;
}

/**
 * 交付状态入参。
 *
 * 故意只声明用得上的四个字段而不是直接吃 `SegmentCard`：
 * 成片页的段卡结构上满足它，后端接线时给一份更薄的状态数组也照样能用。
 */
export interface FeishuDeliveryInput {
  readonly beat_index: BeatIndex;
  readonly status_label: string;
  readonly is_generated: boolean;
  readonly video_url: string | null;
}

export interface FeishuDelivery {
  readonly ready_count: number;
  readonly total_count: typeof BEAT_COUNT;
  readonly missing_indexes: readonly BeatIndex[];
  readonly is_complete: boolean;
  /** `已齐 3/5 段；还缺 节拍4、节拍5`。 */
  readonly summary: string;
}

export interface FeishuDoc {
  readonly schema_version: typeof FEISHU_DOC_SCHEMA_VERSION;
  readonly generated_at: string;
  /** 集名 = 项目名，文档最前面那一行。 */
  readonly episode_title: string;
  /** `婚宴反转 · 节拍板导出`，Markdown 一级标题。 */
  readonly doc_title: string;
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
  /** 恒 5 段，顺序即节拍序。 */
  readonly beats: readonly FeishuBeatSection[];
  /** 恒 5 条，与 `beats[i].transition` 引用相等。 */
  readonly transitions: readonly FeishuTransition[];
  readonly transition_stage: typeof TRANSITION_STAGE;
  /** 未提供段状态时为 `null`（编辑阶段也能导文档）。 */
  readonly delivery: FeishuDelivery | null;
}

export interface FeishuDocOptions {
  /** 导出时间，默认取当前时刻；测试注入固定值。 */
  readonly now?: string;
  /** 各段成片状态；缺省时文档不出「成片交付状态」一节。 */
  readonly cards?: readonly FeishuDeliveryInput[];
}

function orText(value: string): string {
  const trimmed = value.trim();
  return trimmed === '' ? FEISHU_EMPTY : trimmed;
}

function buildFrames(beat: Beat): readonly FeishuFrame[] {
  return Object.freeze(
    orderedFrames(beat).map((frame) => {
      const semanticLabel = frameSemanticLabel(frame.semantic);
      const text = frame.text.trim();
      return Object.freeze({
        order: frame.order,
        semantic: frame.semantic,
        semantic_label: semanticLabel,
        text,
        label: semanticLabel === '' ? orText(text) : `${semanticLabel}｜${orText(text)}`,
      });
    }),
  );
}

function buildTransition(beat: Beat): FeishuTransition {
  const transition = buildSegmentTransition(beat);
  return Object.freeze({
    beat_index: transition.beat_index,
    point_label: transition.point_label,
    rule: transition.rule,
    code: transition.code,
    note: transition.note,
    stage: transition.stage,
    is_episode_tail: transition.is_episode_tail,
  });
}

function buildBeatSection(
  project: Project,
  index: BeatIndex,
  status: FeishuDeliveryInput | undefined,
): FeishuBeatSection {
  const beat = beatAt(project, index);
  const def = beatDef(index);
  const frames = buildFrames(beat);

  return Object.freeze({
    index: beat.index,
    g_index: beat.g_index,
    beat_name: def.name,
    title: orText(beat.title),
    heading: `${beatLabel(beat.index)} · ${orText(beat.title)}`,
    emotion: orText(beat.emotion),
    time_start: beat.time_start,
    time_end: beat.time_end,
    time_range: `${beat.time_start}-${beat.time_end}s`,
    duration_sec: beat.duration_sec,
    duration_label: `${beat.duration_sec} 秒`,
    camera_rhythm: orText(beat.camera_rhythm),
    plot_core: orText(beat.plot_core),
    note: orText(beat.note),
    frame_count: beat.frame_count,
    frames,
    frames_text: frames.map((frame) => frame.text).join(FRAME_ARROW),
    frames_label_text: frames.map((frame) => frame.label).join(FRAME_ARROW),
    prompt_final: assemblePrompt(project, beat),
    transition: buildTransition(beat),
    status_label: status?.status_label ?? FEISHU_EMPTY,
    video_url: status?.video_url ?? null,
  });
}

function buildDelivery(cards: readonly FeishuDeliveryInput[]): FeishuDelivery {
  const missing = Object.freeze(
    BEAT_INDEXES.filter(
      (index) => cards.find((card) => card.beat_index === index)?.is_generated !== true,
    ),
  );
  const ready = BEAT_COUNT - missing.length;

  return Object.freeze({
    ready_count: ready,
    total_count: BEAT_COUNT,
    missing_indexes: missing,
    is_complete: missing.length === 0,
    summary:
      missing.length === 0
        ? `已齐 ${ready}/${BEAT_COUNT} 段`
        : `已齐 ${ready}/${BEAT_COUNT} 段；还缺 ${missing.map(beatLabel).join('、')}`,
  });
}

/**
 * 建出一份飞书文档载荷。
 *
 * 段序恒为节拍序：只按 {@link BEAT_INDEXES} 遍历 `project.beat_list`，
 * `options.cards` 仅作为按 `beat_index` 查表的状态来源——**它的数组顺序不影响段序**。
 */
export function buildFeishuDoc(project: Project, options: FeishuDocOptions = {}): FeishuDoc {
  const cards = options.cards;
  const beats = Object.freeze(
    BEAT_INDEXES.map((index) =>
      buildBeatSection(
        project,
        index,
        cards?.find((card) => card.beat_index === index),
      ),
    ),
  );

  return Object.freeze({
    schema_version: FEISHU_DOC_SCHEMA_VERSION,
    generated_at: options.now ?? new Date().toISOString(),
    episode_title: orText(project.name),
    doc_title: `${orText(project.name)} · 节拍板导出`,
    project: Object.freeze({
      id: project.id,
      name: orText(project.name),
      genre: orText(project.genre),
      aspect_ratio: project.aspect_ratio,
      total_duration_sec: project.total_duration_sec,
      beat_duration_sum_sec: episodeDuration(project),
      style_prompt: orText(project.style_prompt),
      protagonist: orText(project.protagonist),
      updated_at: project.updated_at,
      beat_count: BEAT_COUNT,
    }),
    beats,
    transitions: Object.freeze(beats.map((beat) => beat.transition)),
    transition_stage: TRANSITION_STAGE,
    delivery: cards === undefined ? null : buildDelivery(cards),
  });
}
