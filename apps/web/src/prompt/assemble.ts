/**
 * 编辑页 Prompt 视图适配器（W2 整合）。
 *
 * **本模块不再自己组装 Prompt。** 组装公式的唯一实现是领域层的
 * `src/domain/prompt.ts`（WK2 法源：METH-002 §4、METH-003 §2、PRD 5.3.2 / 5.3.6）：
 *
 *   固定前缀（含项目级注入）+ 本段情绪 + 时长 + 镜头节奏 + 剧情核心 + 节拍帧（左 → 右）
 *
 * 这里做的只有三件事，都是**面板需要、领域层不该关心**的东西：
 *   ① 把领域片段展开成逐格片段，供面板按来源着色；
 *   ② 补上片段间的连接符，使 `text === segments.map(s => s.text).join('')`（L7）；
 *   ③ 汇总未填项与参数位，供「待填 / 就绪」与参数区展示。
 *
 * 全文与 `assemblePrompt(project, beat)` **逐字符相同**，该等式由单元测试守卫：
 * 面板所见即请求所发，不存在「预览一套、发送另一套」。
 *
 * 红线（PRD R2 / AC-6.4）：`title` / `transition_rule` / `note` 不在
 * {@link BeatAssembleView} 里，也不在领域层的 `PromptBeatView` 里——
 * 排除不是拼完再删，而是**类型上够不着**。
 *
 * **本文件不得导入 `src/domain/transitions`**，该约束有单元测试守卫。
 */

import {
  frameCountFor,
  isDurationWithinCap,
  type Beat,
  type BeatFrame,
  type BeatIndex,
} from '../domain/beats';
import {
  FIXED_PREFIX,
  PROMPT_EXCLUDED_BEAT_FIELDS,
  buildPromptSegments,
  findExcludedFieldLeaks,
  type PromptBeatView,
  type PromptProjectView,
  type PromptSource,
} from '../domain/prompt';
import type { AspectRatio, Project } from '../domain/projects';

/** 组装引擎版本号；随快照存档，规则演进后可解释历史差异。 */
export const ENGINE_VERSION = 'domain-wk2-1';

/** 宫格之间的连接符，与领域层的帧连接符一致。 */
export const MULTI_SHOT_JOINER = ' → ';

/** 片段之间的连接符。 */
export const SEGMENT_JOINER = '，';

/** 全文收尾。 */
export const SENTENCE_END = '。';

/**
 * 片段来源只有三种。
 * **没有 `transition` 来源**——面板上也就不可能出现衔接内容。
 */
export type SegmentSource = PromptSource;

export interface PromptSegment {
  readonly source: SegmentSource;
  /** 面板展示与着色用，例："项目级·风格词"。 */
  readonly label: string;
  /** 已含尾部连接符，保证 `text === segments.map(s => s.text).join('')`。 */
  readonly text: string;
}

/** 发往模型的非文本参数位。 */
export interface GenerationParams {
  readonly duration_sec: number;
  readonly aspect_ratio: AspectRatio;
  readonly frame_count: number;
  /** 参考图键列表，按格序；无图则为空数组。 */
  readonly reference_image_keys: readonly string[];
}

/** 未填项，UI 直接展示为「待填」。 */
export type MissingField =
  | { readonly kind: 'style_prompt' }
  | { readonly kind: 'protagonist' }
  | { readonly kind: 'emotion' }
  | { readonly kind: 'camera_rhythm' }
  | { readonly kind: 'plot_core' }
  | { readonly kind: 'duration_sec' }
  | { readonly kind: 'frame'; readonly order: number };

export interface AssembleWarning {
  readonly code: 'excluded_text_in_frame';
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
export type PrefixInput = PromptProjectView;

/**
 * 组装器能看到的节拍视图。
 * 注意此类型 **不包含** title / transition_rule / note —— 组装器够不着它们。
 */
export interface BeatAssembleView extends PromptBeatView {
  readonly index: BeatIndex;
  /** 各格参考图键，按格序。 */
  readonly reference_image_keys: readonly string[];
}

export interface AssembleInput {
  readonly prefix: PrefixInput;
  readonly beat: BeatAssembleView;
}

/** 面板上给领域槽位的展示名，`slot` → `来源级·短名`。 */
const SLOT_LABEL: Record<string, string> = {
  固定前缀: '项目级·固定前缀',
  全局画风风格词: '项目级·风格词',
  主角形象描述: '项目级·主角',
  画幅指令: '项目级·画幅',
  本段情绪: '节拍·情绪',
  时长: '节拍·时长',
  镜头节奏: '节拍·镜头节奏',
  剧情核心: '节拍·剧情核心',
};

/**
 * 唯一投影点。
 * 新增字段若想进 Prompt，必须显式改这里 —— 默认即排除。
 * title / transition_rule / note 有意不投影。
 */
export function toAssembleView(
  beat: Beat,
  referenceImageKeys: readonly string[] = [],
): BeatAssembleView {
  return {
    index: beat.index,
    emotion: beat.emotion,
    duration_sec: beat.duration_sec,
    camera_rhythm: beat.camera_rhythm,
    plot_core: beat.plot_core,
    frames: beat.frames,
    reference_image_keys: referenceImageKeys,
  };
}

export function toPrefixInput(project: Project): PrefixInput {
  return {
    style_prompt: project.style_prompt,
    protagonist: project.protagonist,
    aspect_ratio: project.aspect_ratio,
  };
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

interface DraftSegment {
  readonly source: SegmentSource;
  readonly label: string;
  readonly body: string;
}

/**
 * 给每个片段补尾部连接符，使全文可由 `join('')` 派生。
 * 相邻两格之间用宫格连接符，其余用片段连接符，末尾收句——
 * 与领域层 `assemblePrompt` 的 `join('，') + '。'` 逐字符等价。
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

function collectMissing(prefix: PrefixInput, beat: BeatAssembleView): readonly MissingField[] {
  const missing: MissingField[] = [];

  if (normalize(prefix.style_prompt) === '') {
    missing.push({ kind: 'style_prompt' });
  }
  if (normalize(prefix.protagonist) === '') {
    missing.push({ kind: 'protagonist' });
  }
  if (normalize(beat.emotion) === '') {
    missing.push({ kind: 'emotion' });
  }
  if (normalize(beat.camera_rhythm) === '') {
    missing.push({ kind: 'camera_rhythm' });
  }
  if (normalize(beat.plot_core) === '') {
    missing.push({ kind: 'plot_core' });
  }
  beat.frames.forEach((frame: BeatFrame) => {
    if (normalize(frame.text) === '') {
      missing.push({ kind: 'frame', order: frame.order });
    }
  });
  if (!isDurationWithinCap(beat.duration_sec)) {
    missing.push({ kind: 'duration_sec' });
  }

  return missing;
}

/**
 * 唯一入口：面板渲染与提交路径共用（L7）。
 *
 * 空字段不抛错，而是计入 `missing`，让编辑页能在填写过程中持续预览；
 * 提交前由 `missing` 为空把关。
 */
export function assemble(input: AssembleInput): AssembleResult {
  const { prefix, beat } = input;

  // 领域层把整段帧文案拼成一个片段；面板要逐格着色，这里按帧序拆回去。
  // 用的是同一份 `frames` 与同一个连接符，拼接结果与领域层逐字符相同。
  const frameDrafts: DraftSegment[] = beat.frames
    .map((frame: BeatFrame) => ({ order: frame.order, body: frame.text.trim() }))
    .filter((frame) => frame.body !== '')
    .map((frame) => ({ source: 'frame' as const, label: `宫格 ${frame.order}`, body: frame.body }));

  // 其余片段一律取自领域组装器，本模块不自行拼接任何文案。
  const drafts: DraftSegment[] = buildPromptSegments(prefix, beat).flatMap((segment) =>
    segment.source === 'frame'
      ? frameDrafts
      : [
          {
            source: segment.source,
            label: SLOT_LABEL[segment.slot] ?? segment.slot,
            body: segment.text,
          },
        ],
  );

  const segments = finalizeSegments(drafts);

  return {
    // 全文由片段派生，不独立构造：面板着色与最终文本不可能不一致（L7）。
    text: segments.map((segment) => segment.text).join(''),
    segments,
    params: {
      duration_sec: beat.duration_sec,
      aspect_ratio: prefix.aspect_ratio,
      frame_count: frameCountFor(beat.index),
      reference_image_keys: beat.reference_image_keys,
    },
    engineVersion: ENGINE_VERSION,
    missing: collectMissing(prefix, beat),
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
 * 提交前的运行时断言（生产路径同样生效）。
 *
 * 主判据是**来源**：被排除字段永不产生片段。领域层的 `assertPromptClean` 用的是
 * 子串判据，对组装器自测足够严；但在编辑页上它有误报——用户完全可能把衔接标准词
 * 一字不差写进画面描述，此时内容合法、来源合法。故这里以来源为准，
 * 子串命中降级为 {@link redlineWarnings} 的告警。
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
    const value = normalize(String(beat[field]));
    if (value === '') {
      return;
    }
    const fromExcludedField = result.segments.some((segment) => normalize(segment.text) === value);
    if (fromExcludedField) {
      throw new RedlineViolation(`被排除字段 ${field} 产生了 Prompt 片段`);
    }
  });
}

/** 辅判据：被排除字段的内容疑似被写进画面描述时提示用户，不拦截提交。 */
export function redlineWarnings(result: AssembleResult, beat: Beat): readonly AssembleWarning[] {
  if (findExcludedFieldLeaks(beat, result.text).length === 0) {
    return [];
  }
  return [
    {
      code: 'excluded_text_in_frame',
      message: '衔接 / 板名 / 备注的内容疑似被写入画面描述，它们不参与 AI 生成，建议从描述中移除。',
    },
  ];
}

/** 固定前缀由系统注入，面板必须能看见它——不存在隐形注入。 */
export { FIXED_PREFIX };
