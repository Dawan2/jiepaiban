/**
 * v2 提交装配：把**既有拦截链**接到 v2 传输层前面。
 *
 * 关键点是「既有」：30s Cap、必填齐备、宫格锁、红线扫描全部复用
 * `generate/interceptors` 的 `DEFAULT_INTERCEPTORS`，本文件不新增任何一条判定，
 * 也不抄一份时长上限常量。换传输层不该动红线，红线只有一处。
 *
 * 提交顺序（任何一步失败都不会调用传输层，不消耗额度）：
 *
 *   拦截链（含 30s Cap） → 参考图键校验 → 组请求体（+ 泄漏断言） → transport.submitBeat
 */

import type { Beat } from '../../domain/beats';
import {
  assertPromptClean,
  buildGenerateRequest,
  findExcludedFieldLeaks,
} from '../../domain/prompt';
import type { Project } from '../../domain/projects';
import { idempotencyKeyFor } from '../adapter';
import {
  DEFAULT_INTERCEPTORS,
  runInterceptors,
  type GenerateInterceptor,
} from '../interceptors';
import { generateFailure, type GenerateFailure } from '../types';
import { assertBodyClean } from './redline';
import {
  buildBeatRequest,
  resolveSeedanceTransport,
  submitFailure,
  supportsPolling,
  type SeedanceBeatRequest,
  type SeedanceBeatTransport,
  type SeedanceJobId,
  type SeedanceJobSnapshot,
  type SeedanceSubmitResult,
} from './transport';

/**
 * 参考图键校验。键是不透明存储键，不是 URL、不是 data URI——
 * 发 object URL 出去等于发一个刷新即失效的地址，中继侧取不到图。
 */
export function validateReferenceImageKeys(
  beat: Beat,
  keys: readonly string[],
): GenerateFailure | null {
  if (keys.length > beat.frame_count) {
    return generateFailure(
      'PARAM_MISSING',
      'REFERENCE_IMAGE_KEYS_OVERFLOW',
      `节拍${beat.index}只有 ${beat.frame_count} 格，参考图键却有 ${keys.length} 个`,
    );
  }
  const blank = keys.some((key) => key.trim() === '');
  if (blank) {
    return generateFailure(
      'PARAM_MISSING',
      'REFERENCE_IMAGE_KEY_INVALID',
      `节拍${beat.index}的参考图键不能为空`,
    );
  }
  const url = keys.find((key) => key.includes('://') || key.startsWith('data:'));
  if (url !== undefined) {
    return generateFailure(
      'PARAM_MISSING',
      'REFERENCE_IMAGE_KEY_NOT_OPAQUE',
      `节拍${beat.index}的参考图必须以存储键提交，不能直接发地址（收到「${url}」）`,
    );
  }
  const leaked = keys.filter((key) => findExcludedFieldLeaks(beat, key).length > 0);
  if (leaked.length > 0) {
    return generateFailure(
      'CONTENT_VIOLATION',
      'EXCLUDED_FIELD_LEAK',
      `参考图键里出现了不该进入生成的字段内容（${leaked.join('、')}），已拦截提交`,
    );
  }
  return null;
}

export interface SeedanceBeatSubmitterOptions {
  readonly transport?: SeedanceBeatTransport;
  readonly interceptors?: readonly GenerateInterceptor[];
}

export interface SeedanceBeatSubmitter {
  readonly transport: SeedanceBeatTransport;
  readonly interceptors: readonly GenerateInterceptor[];
  /** 前置校验；通过返回 `null`。参考图键不传即视为无图。 */
  readonly precheck: (
    project: Project,
    beat: Beat,
    referenceImageKeys?: readonly string[],
  ) => GenerateFailure | null;
  /** 组请求体。Prompt 有泄漏时直接抛错（与 v1 出网口一致）。 */
  readonly buildRequest: (
    project: Project,
    beat: Beat,
    referenceImageKeys?: readonly string[],
  ) => SeedanceBeatRequest;
  /** 提交一次生成，成功返回 job id；校验未过或上游异常返回失败详情。 */
  readonly submitBeat: (
    project: Project,
    beat: Beat,
    referenceImageKeys?: readonly string[],
  ) => Promise<SeedanceSubmitResult>;
  /** 传输层不支持轮询时为 `null`。 */
  readonly pollJob: ((jobId: SeedanceJobId) => Promise<SeedanceJobSnapshot>) | null;
}

export function createSeedanceBeatSubmitter(
  options: SeedanceBeatSubmitterOptions = {},
): SeedanceBeatSubmitter {
  const transport = resolveSeedanceTransport(options);
  const interceptors = Object.freeze([...(options.interceptors ?? DEFAULT_INTERCEPTORS)]);

  function precheck(
    project: Project,
    beat: Beat,
    referenceImageKeys: readonly string[] = [],
  ): GenerateFailure | null {
    const request = buildGenerateRequest(project, beat);
    const failure = runInterceptors(interceptors, { project, beat, request });
    if (failure !== null) {
      return failure;
    }
    return validateReferenceImageKeys(beat, referenceImageKeys);
  }

  function buildRequest(
    project: Project,
    beat: Beat,
    referenceImageKeys: readonly string[] = [],
  ): SeedanceBeatRequest {
    const generateRequest = buildGenerateRequest(project, beat);
    // 双保险：组装器已做硬排除，出网口再断言一次内容与字段名。
    assertPromptClean(beat, generateRequest.prompt);
    const request = buildBeatRequest({
      prompt: generateRequest.prompt,
      duration_sec: generateRequest.params.duration_sec,
      reference_image_keys: referenceImageKeys,
    });
    assertBodyClean(request);
    return request;
  }

  const submitter: SeedanceBeatSubmitter = {
    transport,
    interceptors,
    precheck,
    buildRequest,
    async submitBeat(project, beat, referenceImageKeys = []) {
      const failure = precheck(project, beat, referenceImageKeys);
      if (failure !== null) {
        return { ok: false, failure };
      }
      const request = buildRequest(project, beat, referenceImageKeys);
      const idempotencyKey = idempotencyKeyFor(project, buildGenerateRequest(project, beat));
      try {
        return await transport.submitBeat(request, { idempotency_key: idempotencyKey });
      } catch (error) {
        return { ok: false, failure: submitFailure(errorMessage(error)) };
      }
    },
    pollJob: supportsPolling(transport) ? (jobId) => transport.pollJob(jobId) : null,
  };

  return Object.freeze(submitter);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
