/**
 * Seedance 2.5 生成适配器 —— **本槽位只落 STUB**。
 *
 * 桩件的边界（重要）：
 * - **不发真实网络请求，不读任何 API Key / 环境变量**；传输层是注入进来的函数，
 *   默认实现是本地桩件，产出 `stub://` 形式的占位视频地址。
 * - 接真实接口时只需替换 `transport`，适配器与队列、状态机、拦截链一概不动。
 *
 * 适配器只做三件事：组请求体、跑前置校验、把提交交给传输层。
 * 排队、状态流转、持久化在 `./queue.ts`。
 */

import type { Beat } from '../domain/beats';
import { assertPromptClean, buildGenerateRequest, type GenerateRequest } from '../domain/prompt';
import type { Project } from '../domain/projects';
import {
  DEFAULT_INTERCEPTORS,
  runInterceptors,
  type GenerateInterceptor,
} from './interceptors';
import {
  SEEDANCE_MODEL,
  generateFailure,
  type GenerateFailure,
  type GenerateJob,
  type SeedanceModel,
} from './types';

/**
 * 提交给模型的请求体。
 *
 * 字段就这五个：模型、板序、prompt、参数位、幂等键。
 * **没有** API Key、没有账号信息、没有衔接 / 名称 / 备注、没有任何镜头级结构。
 */
export interface SeedanceSubmission {
  readonly model: SeedanceModel;
  readonly beat_index: GenerateRequest['beat_index'];
  readonly prompt: GenerateRequest['prompt'];
  readonly params: GenerateRequest['params'];
  readonly idempotency_key: string;
}

export type SeedanceTransportResult =
  | { readonly ok: true; readonly video_url: string }
  | { readonly ok: false; readonly failure: GenerateFailure };

export type SeedanceTransport = (
  submission: SeedanceSubmission,
) => Promise<SeedanceTransportResult>;

/** FNV-1a：足够稳定的幂等键，不引第三方依赖，也不需要异步的 WebCrypto。 */
export function fingerprint(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function idempotencyKeyFor(project: Project, request: GenerateRequest): string {
  const payload = JSON.stringify({
    project_id: project.id,
    beat_index: request.beat_index,
    prompt: request.prompt,
    params: request.params,
  });
  return `idem_${fingerprint(payload)}`;
}

/**
 * 本地桩件传输层：不出网、不鉴权，按幂等键产出确定性的占位地址。
 * 同一入参永远得到同一个 `video_url`，方便测试与联调对拍。
 */
export function createStubTransport(
  options: { readonly latencyMs?: number } = {},
): SeedanceTransport {
  const latencyMs = options.latencyMs ?? 0;
  return async (submission) => {
    if (latencyMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, latencyMs);
      });
    }
    return {
      ok: true,
      video_url: `stub://seedance-2.5/b${submission.beat_index}/${submission.idempotency_key}.mp4`,
    };
  };
}

/** 按剧本依次返回结果的传输层，用于测试失败分支；剧本用尽后回落到桩件成功。 */
export function createScriptedTransport(
  script: readonly SeedanceTransportResult[],
): SeedanceTransport {
  const stub = createStubTransport();
  let cursor = 0;
  return async (submission) => {
    const scripted = script[cursor];
    cursor += 1;
    if (scripted === undefined) {
      return stub(submission);
    }
    return scripted;
  };
}

/** 上游异常统一收敛成「接口异常」，可原样重试。 */
export function upstreamFailure(message: string): GenerateFailure {
  return generateFailure('API_ERROR', 'UPSTREAM_ERROR', `接口调用失败：${message}`, true);
}

/** 上游审核不通过收敛成「内容违规」，需改内容后再提交。 */
export function moderationFailure(message: string): GenerateFailure {
  return generateFailure('CONTENT_VIOLATION', 'MODERATION_REJECTED', message);
}

export interface SeedanceAdapterOptions {
  readonly transport?: SeedanceTransport;
  readonly interceptors?: readonly GenerateInterceptor[];
}

export interface SeedanceAdapter {
  readonly model: SeedanceModel;
  readonly interceptors: readonly GenerateInterceptor[];
  /** 前置校验；通过返回 `null`。 */
  readonly precheck: (project: Project, beat: Beat) => GenerateFailure | null;
  readonly buildSubmission: (project: Project, beat: Beat) => SeedanceSubmission;
  /** 提交一次生成；传输层抛错也会被收成「接口异常」。 */
  readonly submit: (submission: SeedanceSubmission) => Promise<SeedanceTransportResult>;
}

export function createSeedanceAdapter(options: SeedanceAdapterOptions = {}): SeedanceAdapter {
  const transport = options.transport ?? createStubTransport();
  const interceptors = Object.freeze([...(options.interceptors ?? DEFAULT_INTERCEPTORS)]);

  function buildSubmission(project: Project, beat: Beat): SeedanceSubmission {
    const request = buildGenerateRequest(project, beat);
    // 双保险：组装器已做硬排除，这里在出网口再断言一次。
    assertPromptClean(beat, request.prompt);
    return Object.freeze({
      model: SEEDANCE_MODEL,
      beat_index: request.beat_index,
      prompt: request.prompt,
      params: request.params,
      idempotency_key: idempotencyKeyFor(project, request),
    });
  }

  const adapter: SeedanceAdapter = {
    model: SEEDANCE_MODEL,
    interceptors,
    precheck(project, beat) {
      const request = buildGenerateRequest(project, beat);
      return runInterceptors(interceptors, { project, beat, request });
    },
    buildSubmission,
    async submit(submission) {
      try {
        return await transport(submission);
      } catch (error) {
        return { ok: false, failure: upstreamFailure(errorMessage(error)) };
      }
    },
  };

  return Object.freeze(adapter);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 提交体里绝不允许出现的字段名，供测试与评审复用。 */
export const FORBIDDEN_SUBMISSION_KEYS: readonly string[] = Object.freeze([
  'api_key',
  'apiKey',
  'token',
  'secret',
  'transition_rule',
  'title',
  'note',
]);

/** 任务能否原样重试（失败且失败类目允许重试）。 */
export function isRetryable(job: GenerateJob): boolean {
  return job.status === 'FAILED' && job.failure !== null && job.failure.retryable;
}
