/**
 * 生成前置校验拦截器（FR-4-03、AC-F4-1、AC-R3-1）。
 *
 * 提交给 Seedance 2.5 之前，请求必须依次穿过这几道拦截器；
 * 任一命中即**阻断提交**并给出可读原因，不产生任务、不消耗额度。
 *
 * 对应关系：
 * - 必填未齐 / 单板时长越界 → 参数缺失
 * - 组间衔接、节拍名称、备注泄漏进 Prompt → 内容违规
 *
 * 时长拦截是硬红线：组内时长分配归 AI，人只给板时长，且**上限 30 秒**。
 */

import {
  MAX_BEAT_DURATION_SEC,
  isDurationWithinCap,
  orderedFrames,
  type Beat,
} from '../domain/beats';
import { findExcludedFieldLeaks, type GenerateRequest } from '../domain/prompt';
import { TRANSITION_RULES } from '../domain/transitions';
import type { Project } from '../domain/projects';
import { generateFailure, type GenerateFailure } from './types';

export interface InterceptorContext {
  readonly project: Project;
  readonly beat: Beat;
  readonly request: GenerateRequest;
}

export interface GenerateInterceptor {
  readonly name: string;
  /** 通过返回 `null`；命中返回失败详情。 */
  readonly inspect: (context: InterceptorContext) => GenerateFailure | null;
}

/**
 * 转场词拦截清单（PRD 5.3「最小集」）。
 * 组装器已经在源头剔除衔接字段，这里是组装**之后**的兜底扫描。
 */
export const TRANSITION_WORD_DENYLIST: readonly string[] = Object.freeze([
  ...TRANSITION_RULES,
  '螺口顺滑',
  '硬切',
  'BGM升调',
  'BGM 升调',
  '升调截断',
  '黑屏截断',
  '转场',
  '过渡',
]);

/** 必填槽位齐备（PRD 5.2.2）。 */
export const requiredFieldInterceptor: GenerateInterceptor = Object.freeze({
  name: 'required-fields',
  inspect({ beat, project }: InterceptorContext) {
    const missing: string[] = [];
    if (project.style_prompt.trim() === '') {
      missing.push('全局画风风格词');
    }
    if (project.protagonist.trim() === '') {
      missing.push('主角形象描述');
    }
    if (beat.emotion.trim() === '') {
      missing.push('本段情绪');
    }
    if (beat.camera_rhythm.trim() === '') {
      missing.push('镜头节奏');
    }
    if (beat.plot_core.trim() === '') {
      missing.push('剧情核心');
    }
    orderedFrames(beat).forEach((frame) => {
      if (frame.text.trim() === '') {
        missing.push(`第${frame.order}格画面描述`);
      }
    });

    if (missing.length === 0) {
      return null;
    }
    return generateFailure(
      'PARAM_MISSING',
      'FIELD_MISSING',
      `节拍${beat.index}还缺：${missing.join('、')}；补齐后才能生成`,
    );
  },
});

/**
 * 单板时长拦截：`0 < duration_sec ≤ 30`。
 *
 * 超上限属于参数非法，归入「参数缺失」类目——V1.0 只有三类错误，
 * 细分靠 `code = DURATION_OVER_CAP`。
 */
export const durationInterceptor: GenerateInterceptor = Object.freeze({
  name: 'duration-cap',
  inspect({ beat, request }: InterceptorContext) {
    const duration = request.params.duration_sec;
    if (!Number.isFinite(duration) || duration <= 0) {
      return generateFailure(
        'PARAM_MISSING',
        'DURATION_INVALID',
        `节拍${beat.index}的时长必须是大于 0 的秒数`,
      );
    }
    if (duration !== beat.duration_sec) {
      return generateFailure(
        'PARAM_MISSING',
        'DURATION_MISMATCH',
        `节拍${beat.index}的时长参数与板上时长不一致，请重新组装后再提交`,
      );
    }
    if (!isDurationWithinCap(duration)) {
      return generateFailure(
        'PARAM_MISSING',
        'DURATION_OVER_CAP',
        `节拍${beat.index}时长 ${duration} 秒，单板时长不得超过 ${MAX_BEAT_DURATION_SEC} 秒（组内时长分配由 AI 负责）`,
      );
    }
    return null;
  },
});

/** 宫格数必须等于板序锁定值，且帧序左 → 右。 */
export const frameLockInterceptor: GenerateInterceptor = Object.freeze({
  name: 'frame-lock',
  inspect({ beat, request }: InterceptorContext) {
    if (request.params.frame_count !== beat.frame_count) {
      return generateFailure(
        'PARAM_MISSING',
        'FRAME_COUNT_MISMATCH',
        `节拍${beat.index}的宫格数参数与板上锁定值不一致`,
      );
    }
    if (beat.frames.length !== beat.frame_count) {
      return generateFailure(
        'PARAM_MISSING',
        'FRAME_COUNT_MISMATCH',
        `节拍${beat.index}应有 ${beat.frame_count} 格，实际 ${beat.frames.length} 格`,
      );
    }
    const ltr = beat.frames.every((frame, at) => frame.order === at + 1);
    if (!ltr) {
      return generateFailure(
        'PARAM_MISSING',
        'FRAME_ORDER_NOT_LTR',
        `节拍${beat.index}的帧序只允许左 → 右`,
      );
    }
    return null;
  },
});

/** 红线扫描：衔接 / 名称 / 备注不得出现在 Prompt 全文里（AC-6.4）。 */
export const redLineInterceptor: GenerateInterceptor = Object.freeze({
  name: 'red-line',
  inspect({ beat, request }: InterceptorContext) {
    const leaks = findExcludedFieldLeaks(beat, request.prompt);
    if (leaks.length > 0) {
      return generateFailure(
        'CONTENT_VIOLATION',
        'EXCLUDED_FIELD_LEAK',
        `Prompt 里出现了不该进入生成的字段（${leaks.join('、')}），已拦截提交`,
      );
    }
    const hit = TRANSITION_WORD_DENYLIST.find((word) => request.prompt.includes(word));
    if (hit !== undefined) {
      return generateFailure(
        'CONTENT_VIOLATION',
        'TRANSITION_WORD_HIT',
        `Prompt 命中衔接词「${hit}」，衔接只在后期合成生效，已拦截提交`,
      );
    }
    return null;
  },
});

/** 默认拦截链，顺序即报错优先级。 */
export const DEFAULT_INTERCEPTORS: readonly GenerateInterceptor[] = Object.freeze([
  requiredFieldInterceptor,
  durationInterceptor,
  frameLockInterceptor,
  redLineInterceptor,
]);

/** 依次跑拦截链，返回第一个命中的失败；全通过返回 `null`。 */
export function runInterceptors(
  interceptors: readonly GenerateInterceptor[],
  context: InterceptorContext,
): GenerateFailure | null {
  for (const interceptor of interceptors) {
    const failure = interceptor.inspect(context);
    if (failure !== null) {
      return failure;
    }
  }
  return null;
}
