/**
 * 生成引擎（M4）的类型与状态机（PRD 6.4 FR-4-01…09、8.6 生成任务、AC-F4-1/2/5）。
 *
 * 恒等式：`1 Beat = 1 G = 1 节拍板 = 1 次 Seedance 2.5 generate`。
 * 一块板同一时刻最多一个在途任务，任务与板 1:1，不拆不合。
 *
 * 状态四态（挂在板上）：待生成 → 生成中 → 成功 / 失败。
 * 「待生成」同时覆盖「还没提交」与「已入队排队中」两种情形——
 * 对用户而言两者都是「还没开始出画面」，UI 只需要一个点。
 *
 * 失败三类：参数缺失 / 接口异常 / 内容违规。三类之外不新增错误类目，
 * 细分原因走 `code` 字段，保证 UI 文案与告警口径收敛（NFR-6 可解释性）。
 */

import type { BeatIndex } from '../domain/beats';
import type { GenerateParams } from '../domain/prompt';

/** 模型恒为 Seedance 2.5，没有模型选择（FR-4-09）。 */
export const SEEDANCE_MODEL = 'Seedance 2.5' as const;
export type SeedanceModel = typeof SEEDANCE_MODEL;

/** 任务状态码。 */
export type GenerateJobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export const GENERATE_JOB_STATUSES: readonly GenerateJobStatus[] = Object.freeze([
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
] as const);

/** 状态码 → 界面文案。 */
export const GENERATE_STATUS_LABEL: Readonly<Record<GenerateJobStatus, string>> = Object.freeze({
  PENDING: '待生成',
  RUNNING: '生成中',
  SUCCEEDED: '成功',
  FAILED: '失败',
});

/** 合法状态迁移。成功 / 失败都只能经「重新提交」回到待生成。 */
export const GENERATE_STATUS_TRANSITIONS: Readonly<
  Record<GenerateJobStatus, readonly GenerateJobStatus[]>
> = Object.freeze({
  PENDING: Object.freeze(['RUNNING', 'FAILED'] as const),
  RUNNING: Object.freeze(['SUCCEEDED', 'FAILED'] as const),
  SUCCEEDED: Object.freeze([] as const),
  FAILED: Object.freeze([] as const),
});

export function canTransition(from: GenerateJobStatus, to: GenerateJobStatus): boolean {
  return GENERATE_STATUS_TRANSITIONS[from].includes(to);
}

/** 在途状态：占住这块板的提交入口（IX-4 只锁本板）。 */
export function isActiveStatus(status: GenerateJobStatus): boolean {
  return status === 'PENDING' || status === 'RUNNING';
}

/**
 * 终态：任务不再流转，成功 / 失败的结果就是最终结果（重新提交产生的是新任务）。
 *
 * 由状态迁移表推导而非另抄一份枚举：迁移表是这件事的唯一法源。
 * 生成结果的落库通道以此为触发点（`store/generateResults.ts`）。
 */
export function isTerminalStatus(status: GenerateJobStatus): boolean {
  return GENERATE_STATUS_TRANSITIONS[status].length === 0;
}

/** 失败类目，封闭三项。 */
export type GenerateErrorClass = 'PARAM_MISSING' | 'API_ERROR' | 'CONTENT_VIOLATION';

export const GENERATE_ERROR_CLASSES: readonly GenerateErrorClass[] = Object.freeze([
  'PARAM_MISSING',
  'API_ERROR',
  'CONTENT_VIOLATION',
] as const);

export const GENERATE_ERROR_LABEL: Readonly<Record<GenerateErrorClass, string>> = Object.freeze({
  PARAM_MISSING: '参数缺失',
  API_ERROR: '接口异常',
  CONTENT_VIOLATION: '内容违规',
});

export interface GenerateFailure {
  readonly error_class: GenerateErrorClass;
  /** 界面展示用的中文类目名。 */
  readonly label: string;
  /** 细分原因码，便于埋点与排查；不新增错误类目。 */
  readonly code: string;
  /** 给用户看的可读原因（NFR-6：拦截必须说明原因）。 */
  readonly message: string;
  /** 是否允许原样重试。参数与内容问题需先改内容，改完再提交即为新任务。 */
  readonly retryable: boolean;
}

export function generateFailure(
  errorClass: GenerateErrorClass,
  code: string,
  message: string,
  retryable = false,
): GenerateFailure {
  return Object.freeze({
    error_class: errorClass,
    label: GENERATE_ERROR_LABEL[errorClass],
    code,
    message,
    retryable,
  });
}

/**
 * 生成任务。
 *
 * 字段全 `readonly`：任务不做原地改写，状态流转一律产出新快照后落库，
 * 便于 UI 做引用比较，也便于 WK3 的数据层直接序列化（字段 snake_case）。
 *
 * 这里**没有** `transition_rule` / `title` / `note`，也没有任何镜头级字段——
 * `prompt_snapshot` 由组装器产出，已经过硬排除（AC-6.4）。
 */
export interface GenerateJob {
  readonly id: string;
  readonly project_id: string;
  readonly beat_index: BeatIndex;
  readonly model: SeedanceModel;
  readonly prompt_snapshot: string;
  readonly params: GenerateParams;
  /** `project_id + beat_index + prompt + params` 的哈希，用于去重（FR-4-07）。 */
  readonly idempotency_key: string;
  readonly status: GenerateJobStatus;
  readonly attempt: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly video_url: string | null;
  readonly failure: GenerateFailure | null;
}

export function isGenerateJobStatus(value: unknown): value is GenerateJobStatus {
  return typeof value === 'string' && GENERATE_JOB_STATUSES.includes(value as GenerateJobStatus);
}
