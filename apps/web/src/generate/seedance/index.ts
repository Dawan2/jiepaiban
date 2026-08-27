/**
 * Seedance 传输层 v2 出口（W7 槽位）。
 *
 * 本目录**只做传输**：端点配置、请求体形状、提交与轮询、以及出网口的红线断言。
 * 排队、状态机、持久化仍在上一层（`generate/queue.ts`、`generate/store.ts`），
 * 本槽位不改动既有 v1 通路——v1 仍是当前生产路径，v2 与它并存。
 *
 * 本出口**故意不存在**以下能力，新增即为红线违规：
 * 任何凭据字段（API Key / token / 签名）、从环境变量读密钥的通路、
 * 把组间衔接 / 节拍名称 / 备注送进请求体的通路、镜头级参数、第二份时长上限常量。
 */

export * from './config';
export * from './redline';
export * from './transport';
export * from './submitter';
