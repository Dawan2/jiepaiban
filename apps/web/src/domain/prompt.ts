/**
 * Prompt 组装器（METH-002 §4、METH-003 §2、PRD 5.3.2 / 5.3.6）。
 *
 * 组装公式（顺序固定，V1.0 不开放自定义模板）：
 *
 *   固定前缀（含项目级注入） + 本段情绪 + 时长 + 镜头节奏 + 剧情核心 + 节拍帧（左 → 右）
 *
 * **红线**：组间衔接（`transition_rule`）、节拍名称（`title`）、备注（`note`）
 * 三个字段做**硬排除**——既不进 Prompt 全文，也不进生成 API 请求体（PRD R2 / AC-6.4）。
 * 本文件的组装函数只读取白名单字段，`assertPromptClean` 再做一次事后断言，双保险。
 */

import { orderedFrames, type Beat } from './beats';
import type { Project } from './projects';

/** 固定前缀：系统注入的只读画风与一致性约束（METH-002 §4）。 */
export const FIXED_PREFIX = '漫剧厚涂画风，高清8K，人物五官稳定无漂移' as const;

/** 参与组装的节拍字段白名单（● 进 Prompt）。 */
export const PROMPT_BEAT_FIELDS = Object.freeze([
  'emotion',
  'duration_sec',
  'camera_rhythm',
  'plot_core',
  'frames',
] as const);

/** 硬排除清单（○ 绝不进入 Prompt 与生成请求体）。 */
export const PROMPT_EXCLUDED_BEAT_FIELDS = Object.freeze([
  'title',
  'transition_rule',
  'note',
] as const);

export type PromptExcludedBeatField = (typeof PROMPT_EXCLUDED_BEAT_FIELDS)[number];

/**
 * 组装器能看到的项目视图与节拍视图。
 *
 * 白名单不只是「组装时少读几个字段」——它是**类型层的排除**：
 * `title` / `transition_rule` / `note` 不在 {@link PromptBeatView} 里，
 * 组装器根本够不着，编辑层也就无法把它们递进来（PRD R2 / AC-6.4）。
 * `Project` 与 `Beat` 都可直接赋给这两个视图，调用方无需先做投影。
 */
export type PromptProjectView = Pick<Project, 'style_prompt' | 'protagonist' | 'aspect_ratio'>;
export type PromptBeatView = Pick<
  Beat,
  'emotion' | 'duration_sec' | 'camera_rhythm' | 'plot_core' | 'frames'
>;

/** 片段来源标签，供编辑页「来源可辨」着色使用（PRD 5.3.3）。 */
export type PromptSource = 'project' | 'beat' | 'frame';

export interface PromptSegment {
  readonly slot: string;
  readonly source: PromptSource;
  readonly text: string;
}

const SEPARATOR = '，';
const FRAME_ARROW = ' → ';

function clean(value: string): string {
  return value.trim();
}

/**
 * 拆出组装后的各片段（带来源标签），是 {@link assemblePrompt} 的唯一数据来源。
 * 空字段直接缺省，不产生占位文本。
 */
export function buildPromptSegments(
  project: PromptProjectView,
  beat: PromptBeatView,
): readonly PromptSegment[] {
  const segments: PromptSegment[] = [
    { slot: '固定前缀', source: 'project', text: FIXED_PREFIX },
  ];

  const projectSlots: readonly (readonly [string, string])[] = [
    ['全局画风风格词', project.style_prompt],
    ['主角形象描述', project.protagonist],
    ['画幅指令', `画幅${project.aspect_ratio}`],
  ];
  projectSlots.forEach(([slot, raw]) => {
    const text = clean(raw);
    if (text !== '') {
      segments.push({ slot, source: 'project', text });
    }
  });

  const beatSlots: readonly (readonly [string, string])[] = [
    ['本段情绪', clean(beat.emotion)],
    ['时长', `时长${beat.duration_sec}秒`],
    ['镜头节奏', clean(beat.camera_rhythm)],
    ['剧情核心', clean(beat.plot_core)],
  ];
  beatSlots.forEach(([slot, text]) => {
    if (text !== '') {
      segments.push({ slot, source: 'beat', text });
    }
  });

  const frameTexts = orderedFrames(beat)
    .map((frame) => clean(frame.text))
    .filter((text) => text !== '');
  if (frameTexts.length > 0) {
    segments.push({ slot: '节拍帧', source: 'frame', text: frameTexts.join(FRAME_ARROW) });
  }

  return Object.freeze(segments);
}

/** 组装当前节拍的最终 Prompt 全文。衔接 / 名称 / 备注永不出现。 */
export function assemblePrompt(project: PromptProjectView, beat: PromptBeatView): string {
  const text = buildPromptSegments(project, beat)
    .map((segment) => segment.text)
    .join(SEPARATOR);
  return `${text}。`;
}

/** 生成 API 参数位。时长同时进文本与参数（METH-003 组装样例进文本，PRD 5.3.2 要求参数位）。 */
export interface GenerateParams {
  readonly duration_sec: number;
  readonly aspect_ratio: Project['aspect_ratio'];
  readonly frame_count: Beat['frame_count'];
  readonly g_index: Beat['g_index'];
}

export interface GenerateRequest {
  readonly beat_index: Beat['index'];
  readonly prompt: string;
  readonly params: GenerateParams;
}

/**
 * 生成请求体。请求体里只有 prompt 与参数位——
 * 没有任何承载衔接 / 名称 / 备注的字段，也没有 shot / camera_json 之类的分镜结构。
 */
export function buildGenerateRequest(project: Project, beat: Beat): GenerateRequest {
  return Object.freeze({
    beat_index: beat.index,
    prompt: assemblePrompt(project, beat),
    params: Object.freeze({
      duration_sec: beat.duration_sec,
      aspect_ratio: project.aspect_ratio,
      frame_count: beat.frame_count,
      g_index: beat.g_index,
    }),
  });
}

/**
 * 事后断言：被排除字段的**内容**没有泄漏进给定文本。
 * 供组装器自测与 WK3 的提交前守卫复用（AC-6.4 要求自动化断言覆盖）。
 */
export function findExcludedFieldLeaks(beat: Beat, text: string): readonly PromptExcludedBeatField[] {
  return Object.freeze(
    PROMPT_EXCLUDED_BEAT_FIELDS.filter((field) => {
      const value = clean(String(beat[field]));
      return value !== '' && text.includes(value);
    }),
  );
}

export function assertPromptClean(beat: Beat, text: string): void {
  const leaks = findExcludedFieldLeaks(beat, text);
  if (leaks.length > 0) {
    throw new Error(`Prompt 泄漏了硬排除字段：${leaks.join(', ')}（AC-6.4）`);
  }
}
