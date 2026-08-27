/**
 * Prompt 组装器（**W1/WK3 桩实现**）。
 *
 * 契约来自架构文档 `docs/architecture/prompt-engine.md`；本文件先以最小实现打通
 * 「编辑即所见、所见即所发」（L7）的链路，供编辑页实时预览使用。
 * WK2 落地正式引擎时**替换实现、保持签名**：`assemble` / `toAssembleView` /
 * `assertNoRedline` 与 `PromptSegment` 的形状即为交接面。
 *
 * 组装公式：
 *   ① 固定前缀（项目级）  画风 + 主角 + 画质 + 画幅
 *   ② 节拍语义（节拍级）  情绪基调 + 剧情核心
 *   ③ 宫格时序（宫格级）  画面1 → 画面2 （→ 画面3）
 *   ④ 参数位（不入文本）  时长 / 画幅 / 参考图
 *
 * 红线（AC-6.4，L5）：`name` / `transition` / `note` 不在本模块的输入类型里。
 * 排除不是拼完再删，而是**类型上够不着**——见 {@link BeatAssembleView}。
 */

import {
  activeCells,
  type Beat,
  type BeatIndex,
  type EmotionTone,
  PROMPT_EXCLUDED_BEAT_FIELDS,
} from '../domain/beats';
import type { AspectRatio, Project } from '../domain/projects';

/** 桩实现版本号；随快照存档，规则演进后可解释历史差异。 */
export const ENGINE_VERSION = 'stub-w1-wk3';

/** 宫格之间的连接符。全引擎只有这一处产生格间连接符。 */
export const MULTI_SHOT_JOINER = ' → ';

/** 片段之间的连接符。 */
export const SEGMENT_JOINER = '，';

/** 全文收尾。 */
export const SENTENCE_END = '。';

/**
 * 片段来源只有三种。
 * **没有 `transition` 来源**——面板上也就不可能出现衔接内容（L5 的类型级保障）。
 */
export type SegmentSource = 'project' | 'beat' | 'frame';

export interface PromptSegment {
  readonly source: SegmentSource;
  /** 面板展示与着色用，例："项目级·风格词"。 */
  readonly label: string;
  /** 已含尾部连接符，保证 `text === segments.map(s => s.text).join('')`。 */
  readonly text: string;
}

/** 发往模型的非文本参数。时长走参数位，不拼进文本。 */
export interface GenerationParams {
  readonly durationSec: number | null;
  readonly aspectRatio: AspectRatio;
  readonly seed: number | null;
  /** 参考图键列表，按格序；无图则为空数组。 */
  readonly referenceImageKeys: readonly string[];
}

/** 未填项，UI 直接展示为"待填"。 */
export type MissingField =
  | { readonly kind: 'stylePrompt' }
  | { readonly kind: 'protagonist' }
  | { readonly kind: 'summary' }
  | { readonly kind: 'tone' }
  | { readonly kind: 'duration' }
  | { readonly kind: 'cell'; readonly order: number };

export interface AssembleWarning {
  readonly code: 'transition_text_in_cell';
  readonly message: string;
}

export interface AssembleResult {
  /** Prompt 全文；面板展示与请求体用的是同一个字符串（L7）。 */
  readonly text: string;
  /** 带来源标注的片段序列，供面板着色。 */
  readonly segments: readonly PromptSegment[];
  readonly params: GenerationParams;
  readonly engineVersion: string;
  /** 未填项；非空即不可提交生成。 */
  readonly missing: readonly MissingField[];
  /** 非阻断提示。 */
  readonly warnings: readonly AssembleWarning[];
}

/** 项目级固定前缀的构成要素。跨 5 板逐字符相同。 */
export interface PrefixInput {
  readonly stylePrompt: string;
  readonly protagonist: string;
  readonly aspectRatio: AspectRatio;
}

/**
 * 组装器能看到的节拍视图。
 * 注意此类型 **不包含** name / transition / note —— 组装器在类型层面就够不着它们。
 */
export interface BeatAssembleView {
  readonly index: BeatIndex;
  readonly summary: string;
  readonly tone: EmotionTone | null;
  readonly durationSec: number | null;
  /** 只含参与组装的格（B1–B4 三格、B5 两格）。 */
  readonly cells: readonly { readonly order: number; readonly description: string }[];
  /** 各格参考图键，按格序。 */
  readonly referenceImageKeys: readonly string[];
}

export interface AssembleInput {
  readonly prefix: PrefixInput;
  readonly beat: BeatAssembleView;
}

/** 情绪基调 → 文案映射；进 Prompt 的是文案，不是用户自由文本。 */
export const TONE_PROMPT_TEXT: Record<EmotionTone, string> = {
  紧张: '紧张压迫的情绪，压迫感持续收紧',
  温情: '温情柔和的情绪，节奏松而不散',
  悬疑: '悬疑不安的情绪，信息刻意留白',
  爆笑: '爆笑轻快的情绪，反应夸张外放',
  愤怒: '愤怒对抗的情绪，冲突正面爆发',
  悲伤: '悲伤低落的情绪，情绪向内收拢',
  燃: '昂扬燃向的情绪，气势逐步拉满',
};

/** 画幅 → 固定文案，不是自由文本。 */
export const ASPECT_PROMPT_TEXT: Record<AspectRatio, string> = {
  '9:16': '竖屏 9:16 画幅',
  '16:9': '横屏 16:9 画幅',
  '1:1': '方形 1:1 画幅',
};

/** 画质稳定词由系统注入，跨项目一致；在面板中可见（L7 不允许隐形注入）。 */
export const QUALITY_TOKENS = '高清 8K，人物五官稳定无漂移，同一角色跨镜一致';

/**
 * 唯一投影点。
 * 新增字段若想进 Prompt，必须显式改这里 —— 默认即排除。
 * name / transition / note 有意不投影（L5）。
 */
export function toAssembleView(
  beat: Beat,
  referenceImageKeys: readonly string[] = [],
): BeatAssembleView {
  return {
    index: beat.index,
    summary: beat.summary,
    tone: beat.tone,
    durationSec: beat.durationSec,
    cells: activeCells(beat).map((cell) => ({
      order: cell.order,
      description: cell.description,
    })),
    referenceImageKeys,
  };
}

export function toPrefixInput(project: Project): PrefixInput {
  return {
    stylePrompt: project.stylePrompt,
    protagonist: project.protagonist,
    aspectRatio: project.aspectRatio,
  };
}

interface DraftSegment {
  readonly source: SegmentSource;
  readonly label: string;
  readonly body: string;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * 给每个片段补尾部连接符，使全文可由 `join('')` 派生。
 * 相邻两格之间用宫格连接符，其余用片段连接符，末尾收句。
 */
function finalizeSegments(drafts: readonly DraftSegment[]): readonly PromptSegment[] {
  return drafts.map((draft, i) => {
    const next = drafts[i + 1];
    const separator =
      next === undefined
        ? SENTENCE_END
        : draft.source === 'frame' && next.source === 'frame'
          ? MULTI_SHOT_JOINER
          : SEGMENT_JOINER;

    return { source: draft.source, label: draft.label, text: draft.body + separator };
  });
}

/**
 * 唯一入口：面板渲染与提交路径共用（L7）。
 *
 * 与正式引擎的差异（桩实现，WK2 收口）：空字段不抛错，而是计入 `missing`，
 * 让编辑页能在填写过程中持续预览；提交前由 `missing` 为空把关。
 */
export function assemble(input: AssembleInput): AssembleResult {
  const { prefix, beat } = input;
  const drafts: DraftSegment[] = [];
  const missing: MissingField[] = [];

  // ① 固定前缀 —— 项目级，跨 5 板逐字符相同，不可跳过。
  const style = normalize(prefix.stylePrompt);
  if (style === '') {
    missing.push({ kind: 'stylePrompt' });
  } else {
    drafts.push({ source: 'project', label: '项目级·风格词', body: style });
  }

  const protagonist = normalize(prefix.protagonist);
  if (protagonist === '') {
    missing.push({ kind: 'protagonist' });
  } else {
    drafts.push({ source: 'project', label: '项目级·主角', body: protagonist });
  }

  drafts.push({ source: 'project', label: '项目级·画质', body: QUALITY_TOKENS });
  drafts.push({
    source: 'project',
    label: '项目级·画幅',
    body: ASPECT_PROMPT_TEXT[prefix.aspectRatio],
  });

  // ② 节拍语义 —— 情绪基调 + 剧情核心。
  if (beat.tone === null) {
    missing.push({ kind: 'tone' });
  } else {
    drafts.push({ source: 'beat', label: '节拍·情绪', body: TONE_PROMPT_TEXT[beat.tone] });
  }

  const summary = normalize(beat.summary);
  if (summary === '') {
    missing.push({ kind: 'summary' });
  } else {
    drafts.push({ source: 'beat', label: '节拍·剧情核心', body: summary });
  }

  // ③ 宫格时序 —— 严格按格序，不排序、不去重、不重排。
  beat.cells.forEach((cell) => {
    const description = normalize(cell.description);
    if (description === '') {
      missing.push({ kind: 'cell', order: cell.order });
      return;
    }
    drafts.push({ source: 'frame', label: `宫格 ${cell.order}`, body: description });
  });

  if (beat.durationSec === null || beat.durationSec <= 0) {
    missing.push({ kind: 'duration' });
  }

  const segments = finalizeSegments(drafts);

  return {
    // 全文由片段派生，不独立构造：面板着色与最终文本不可能不一致（L7）。
    text: segments.map((segment) => segment.text).join(''),
    segments,
    params: {
      durationSec: beat.durationSec,
      aspectRatio: prefix.aspectRatio,
      seed: null,
      referenceImageKeys: beat.referenceImageKeys,
    },
    engineVersion: ENGINE_VERSION,
    missing,
    warnings: [],
  };
}

export class RedlineViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedlineViolation';
  }
}

const ALLOWED_SOURCES: readonly SegmentSource[] = ['project', 'beat', 'frame'];

/**
 * 提交前的运行时断言（L5-c，生产路径同样生效）。
 *
 * 主判据（来源）：任何片段都不得来自被排除字段——被排除字段永不产生片段。
 * 辅判据（子串）：见 {@link redlineWarnings}，主判据通过时降级为告警而非错误，
 * 因为用户可能把衔接内容一字不差写进了画面描述，此时内容合法、来源合法。
 */
export function assertNoRedline(result: AssembleResult, beat: Beat): void {
  result.segments.forEach((segment) => {
    if (!ALLOWED_SOURCES.includes(segment.source)) {
      throw new RedlineViolation(`片段来源非法：${String(segment.source)}`);
    }
  });

  if (result.text !== result.segments.map((segment) => segment.text).join('')) {
    throw new RedlineViolation('Prompt 全文与片段序列不一致，违反「所见即所发」');
  }

  PROMPT_EXCLUDED_BEAT_FIELDS.forEach((field) => {
    const value = normalize(beat[field]);
    if (value === '') {
      return;
    }
    const fromExcludedField = result.segments.some((segment) => normalize(segment.text) === value);
    if (fromExcludedField) {
      throw new RedlineViolation(`被排除字段 ${field} 产生了 Prompt 片段`);
    }
  });
}

/** 辅判据：衔接内容疑似被写进画面描述时提示用户，不拦截提交。 */
export function redlineWarnings(result: AssembleResult, beat: Beat): readonly AssembleWarning[] {
  const transition = normalize(beat.transition);
  if (transition === '' || !result.text.includes(transition)) {
    return [];
  }
  return [
    {
      code: 'transition_text_in_cell',
      message: '衔接内容疑似被写入画面描述，衔接不参与 AI 生成，建议从描述中移除。',
    },
  ];
}
