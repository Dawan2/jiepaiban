/**
 * Seedance 2.5 传输层 **v2**。
 *
 * v1（`generate/adapter.ts` 的 `SeedanceTransport`）是「一次调用直接拿到成片地址」，
 * 这在真实接口上不成立：视频生成是异步的，提交与取件必须分开。
 * v2 因此把接口收成两截：
 *
 *   submitBeat(prompt, duration_sec, reference_image_keys) → job_id
 *   pollJob(job_id) → 状态快照            （**可选**，桩件与不支持轮询的中继可以不实现）
 *
 * 三条边界（与 v1 一致，不因换接口而松动）：
 *
 * - **请求体恰好三个字段**：prompt、板时长、参考图键。没有凭据，没有组间衔接 /
 *   节拍名称 / 备注，没有任何镜头级结构。字段清单是常量 {@link SEEDANCE_BEAT_REQUEST_KEYS}，
 *   出网前由 `redline.assertBodyClean` 断言。
 * - **默认实现仍是桩件**：不出网、不鉴权、不读环境变量。接真实中继只需换 transport。
 * - **时长上限不在这里判**：30s Cap 归 `generate/interceptors` 的 `durationInterceptor`，
 *   由 `submitter.ts` 在提交之前跑完拦截链。传输层重复判一次就会出现第二个事实源。
 */

import { fingerprint } from '../adapter';
import { generateFailure, type GenerateFailure } from '../types';
import {
  DEFAULT_SEEDANCE_ENDPOINT_CONFIG,
  type SeedanceEndpointConfig,
} from './config';
import { assertBodyClean } from './redline';

/** 传输层协议版本。v1 与 v2 形状不兼容，靠这个字段区分。 */
export const SEEDANCE_TRANSPORT_VERSION = 2 as const;
export type SeedanceTransportVersion = typeof SEEDANCE_TRANSPORT_VERSION;

/** 桩件占位地址的协议前缀，与 v1 桩件保持同一形状，成片页无需分辨来源。 */
export const STUB_VIDEO_URL_PREFIX = 'stub://seedance-2.5' as const;

/**
 * 提交请求体。**字段恰为这三个**，顺序即 {@link SEEDANCE_BEAT_REQUEST_KEYS}。
 *
 * 参考图键是不透明存储键（如 `img_b1_c2_a.png`），不是 URL、不是 base64 —— 让图片
 * 内容与生成请求解耦，也避免把 object URL 这种刷新即失效的东西发出去。
 */
export interface SeedanceBeatRequest {
  readonly prompt: string;
  readonly duration_sec: number;
  readonly reference_image_keys: readonly string[];
}

export const SEEDANCE_BEAT_REQUEST_KEYS = Object.freeze([
  'prompt',
  'duration_sec',
  'reference_image_keys',
] as const);

/**
 * 提交的传输级选项。这些**不进请求体**：幂等键走请求头，取消走 AbortSignal。
 * 放在这里是为了让请求体的字段集保持封闭。
 */
export interface SeedanceSubmitOptions {
  readonly idempotency_key?: string;
  readonly signal?: AbortSignal;
}

export type SeedanceJobId = string;

export type SeedanceSubmitResult =
  | { readonly ok: true; readonly job_id: SeedanceJobId }
  | { readonly ok: false; readonly failure: GenerateFailure };

/** 轮询到的任务快照。状态码沿用 `generate/types` 的四态，不另立一套。 */
export type SeedanceJobSnapshot =
  | { readonly status: 'PENDING' | 'RUNNING' }
  | { readonly status: 'SUCCEEDED'; readonly video_url: string }
  | { readonly status: 'FAILED'; readonly failure: GenerateFailure };

export interface SeedanceBeatTransport {
  readonly version: SeedanceTransportVersion;
  /** `stub` = 不出网的桩件；`relay` = 经同源中继出网（中继侧补凭据）。 */
  readonly kind: 'stub' | 'relay';
  readonly config: SeedanceEndpointConfig;
  readonly submitBeat: (
    request: SeedanceBeatRequest,
    options?: SeedanceSubmitOptions,
  ) => Promise<SeedanceSubmitResult>;
  /** 可选：不支持轮询的实现直接不提供本方法。 */
  readonly pollJob?: (jobId: SeedanceJobId) => Promise<SeedanceJobSnapshot>;
}

/** 组请求体。只读白名单三项，别的字段进不来。 */
export function buildBeatRequest(fields: {
  readonly prompt: string;
  readonly duration_sec: number;
  readonly reference_image_keys?: readonly string[];
}): SeedanceBeatRequest {
  const request: SeedanceBeatRequest = Object.freeze({
    prompt: fields.prompt,
    duration_sec: fields.duration_sec,
    reference_image_keys: Object.freeze([...(fields.reference_image_keys ?? [])]),
  });
  assertBodyClean(request);
  return request;
}

/** 桩件任务 id：同一请求恒定，便于测试与联调对拍。 */
export function stubJobId(request: SeedanceBeatRequest, idempotencyKey?: string): SeedanceJobId {
  const payload = JSON.stringify({
    prompt: request.prompt,
    duration_sec: request.duration_sec,
    reference_image_keys: request.reference_image_keys,
    idempotency_key: idempotencyKey ?? null,
  });
  return `job_stub_${fingerprint(payload)}`;
}

export interface StubBeatTransportOptions {
  readonly config?: SeedanceEndpointConfig;
  /** 模拟提交延迟（毫秒）。 */
  readonly latencyMs?: number;
  /** 是否提供 `pollJob`。置 `false` 用来验证「轮询是可选的」。 */
  readonly poll?: boolean;
  /** 前 n 次轮询报「生成中」，之后报成功。默认 0（首次即成功）。 */
  readonly runningPolls?: number;
}

/**
 * 本地桩件传输层：**不出网、不鉴权、不读环境变量**。
 *
 * 提交只回一个确定性任务 id；成片地址在轮询里给，形状与真实异步接口一致，
 * 换成真实中继时调用方的代码不用改。
 */
export function createStubBeatTransport(
  options: StubBeatTransportOptions = {},
): SeedanceBeatTransport {
  const config = options.config ?? DEFAULT_SEEDANCE_ENDPOINT_CONFIG;
  const latencyMs = options.latencyMs ?? 0;
  const runningPolls = options.runningPolls ?? 0;
  const polled = new Map<SeedanceJobId, number>();

  const submitBeat = async (
    request: SeedanceBeatRequest,
    submitOptions?: SeedanceSubmitOptions,
  ): Promise<SeedanceSubmitResult> => {
    // 出网口的最后一道断言：形状不对宁可当场炸，不静默发出去。
    assertBodyClean(request);
    if (latencyMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, latencyMs);
      });
    }
    return { ok: true, job_id: stubJobId(request, submitOptions?.idempotency_key) };
  };

  const pollJob = async (jobId: SeedanceJobId): Promise<SeedanceJobSnapshot> => {
    const seen = polled.get(jobId) ?? 0;
    polled.set(jobId, seen + 1);
    if (seen < runningPolls) {
      return { status: 'RUNNING' };
    }
    return { status: 'SUCCEEDED', video_url: `${STUB_VIDEO_URL_PREFIX}/${jobId}.mp4` };
  };

  const base = { version: SEEDANCE_TRANSPORT_VERSION, kind: 'stub', config, submitBeat } as const;
  return Object.freeze(options.poll === false ? { ...base } : { ...base, pollJob });
}

/**
 * 按剧本依次返回提交结果，用于测试失败分支；剧本用尽后回落到桩件成功。
 * 剧本传输层同样不出网。
 */
export function createScriptedBeatTransport(
  script: readonly SeedanceSubmitResult[],
  options: StubBeatTransportOptions = {},
): SeedanceBeatTransport {
  const stub = createStubBeatTransport(options);
  let cursor = 0;
  const submitBeat = async (
    request: SeedanceBeatRequest,
    submitOptions?: SeedanceSubmitOptions,
  ): Promise<SeedanceSubmitResult> => {
    const scripted = script[cursor];
    cursor += 1;
    if (scripted === undefined) {
      return stub.submitBeat(request, submitOptions);
    }
    assertBodyClean(request);
    return scripted;
  };
  return Object.freeze({ ...stub, submitBeat });
}

/**
 * 取传输层实现。**没传就是桩件**——默认永远不出网，接真实中继必须显式注入。
 * 顺手校验协议版本：v1 的传输层形状不同，误传会在装配期就炸掉而不是运行期。
 */
export function resolveSeedanceTransport(
  options: { readonly transport?: SeedanceBeatTransport } = {},
): SeedanceBeatTransport {
  const transport = options.transport;
  if (transport === undefined) {
    return createStubBeatTransport();
  }
  if (transport.version !== SEEDANCE_TRANSPORT_VERSION) {
    throw new Error(
      `Seedance 传输层协议版本不匹配：需要 v${SEEDANCE_TRANSPORT_VERSION}，收到 v${String(transport.version)}`,
    );
  }
  return transport;
}

/** 传输层是否支持轮询（`pollJob` 可选）。 */
export function supportsPolling(
  transport: SeedanceBeatTransport,
): transport is SeedanceBeatTransport & {
  readonly pollJob: (jobId: SeedanceJobId) => Promise<SeedanceJobSnapshot>;
} {
  return typeof transport.pollJob === 'function';
}

/** 提交阶段的上游异常统一收敛成「接口异常」，可原样重试。 */
export function submitFailure(message: string): GenerateFailure {
  return generateFailure('API_ERROR', 'SUBMIT_FAILED', `提交生成失败：${message}`, true);
}

/** 轮询超时也归「接口异常」，可重试。 */
export function pollTimeoutFailure(waitedMs: number): GenerateFailure {
  return generateFailure(
    'API_ERROR',
    'POLL_TIMEOUT',
    `等待生成结果超过 ${Math.round(waitedMs / 1000)} 秒仍未完成，请稍后重试`,
    true,
  );
}
