/**
 * Seedance 2.5 出网端点配置（W7 传输层 v2）。
 *
 * **本类型不含任何凭据字段**，这不是「暂时没加」，而是配置的形状本身就到不了凭据：
 * 前端拿得到的东西等于用户拿得到的东西，浏览器里没有能藏住密钥的地方。
 * 打包进 bundle 的 `VITE_*`、写在 localStorage 里的 key、请求头里的 Bearer，
 * 三条路都等价于把密钥公开发布。
 *
 * 因此鉴权的位置只有一处：**同源中继**（`base_url` 指向自家后端的相对路径）。
 * 浏览器只发 prompt / 时长 / 参考图键，密钥由中继在服务端补齐，前端连它的存在都不知道。
 * 这条约束由 `redline.ts` 的字段名扫描与 `config.test.ts` 的接口源码扫描共同钉住：
 * 谁往下面这个接口里加了 `api_key` / `token` / `authorization`，测试立刻变红。
 *
 * 同理，本文件**不读任何环境变量**（没有 `import.meta.env`，没有 `process.env`）。
 * 配置一律由调用方显式传入，默认值是不出网的桩件配置。
 */

/**
 * 出网端点配置。字段只描述「往哪发、等多久」，不描述「以谁的身份发」。
 *
 * 注意这里也**没有**时长上限字段：30s Cap 的唯一法源是 `domain/beats` 的
 * `MAX_BEAT_DURATION_SEC`，经 `generate/interceptors` 的 `durationInterceptor` 生效。
 * 端点配置里再抄一份就等于两个事实源，改一处漏一处。
 */
export interface SeedanceEndpointConfig {
  /** 中继前缀。同源相对路径，凭据在服务端补，前端不持有。 */
  readonly base_url: string;
  /** 提交一次生成的子路径。 */
  readonly submit_path: string;
  /** 查询任务状态的子路径；`{job_id}` 会被替换成任务 id。 */
  readonly poll_path: string;
  /** 单次请求超时（毫秒）。 */
  readonly request_timeout_ms: number;
  /** 轮询间隔（毫秒）。 */
  readonly poll_interval_ms: number;
  /** 轮询总时长上限（毫秒），超过即按接口异常收敛。 */
  readonly poll_max_wait_ms: number;
}

/** 配置字段的封闭清单，供守卫测试与评审复用；新增字段必须同步这里。 */
export const SEEDANCE_ENDPOINT_CONFIG_KEYS = Object.freeze([
  'base_url',
  'submit_path',
  'poll_path',
  'request_timeout_ms',
  'poll_interval_ms',
  'poll_max_wait_ms',
] as const);

export type SeedanceEndpointConfigKey = (typeof SEEDANCE_ENDPOINT_CONFIG_KEYS)[number];

/**
 * 默认配置：指向同源中继，**且默认传输层是桩件**（见 `transport.ts`），
 * 所以这些路径在 V1.0 里不会真的被访问到。写成相对路径而非完整域名，
 * 是为了让「跨域直连模型厂商」这条需要前端带密钥的路从一开始就不成立。
 */
export const DEFAULT_SEEDANCE_ENDPOINT_CONFIG: SeedanceEndpointConfig = Object.freeze({
  base_url: '/api/seedance',
  submit_path: '/beats',
  poll_path: '/jobs/{job_id}',
  request_timeout_ms: 30_000,
  poll_interval_ms: 2_000,
  poll_max_wait_ms: 300_000,
});

/** 补齐缺省项，产出冻结配置。传入的键即使拼错也不会被静默接受（类型层拦住）。 */
export function createSeedanceEndpointConfig(
  overrides: Partial<SeedanceEndpointConfig> = {},
): SeedanceEndpointConfig {
  return Object.freeze({ ...DEFAULT_SEEDANCE_ENDPOINT_CONFIG, ...overrides });
}

/** 拼出提交地址。 */
export function submitUrl(config: SeedanceEndpointConfig): string {
  return `${config.base_url}${config.submit_path}`;
}

/** 拼出轮询地址。 */
export function pollUrl(config: SeedanceEndpointConfig, jobId: string): string {
  return `${config.base_url}${config.poll_path.replace('{job_id}', encodeURIComponent(jobId))}`;
}
