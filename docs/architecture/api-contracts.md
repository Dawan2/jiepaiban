# API 契约草案（API Contracts）

> Wave 1 / WK3（数据与 API 架构）产出。
> 状态：**草案 v0.1**。字段与 `docs/architecture/data-model.md` 对齐；任务相关语义与 `docs/architecture/generation-pipeline.md` 对齐。

## 1. 技术选型：tRPC 为主，少量 REST

**推荐 tRPC**（假设前端为 Next.js + TypeScript 单仓）：

- 前后端同仓同语言，tRPC 提供端到端类型安全，Wave 1 迭代最快；
- 输入校验用 Zod，schema 即文档；
- 我们**没有第三方开放 API 需求**（Wave 1），不需要 REST 的通用性。

保留 **3 个 REST 端点**（tRPC 不适合的场景）：

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/webhooks/ark` | 供应商回调（若启用；方舟默认轮询，见 pipeline 文档 §4） |
| GET | `/api/healthz` | 存活探针（返回 `{ok, version}`） |
| GET | `/api/jobs/:id/events` | **SSE** 任务进度推送（tRPC subscription 的降级替代，Wave 1 用 SSE 或纯轮询皆可） |

> 若后续团队定为非 TS 后端，本文契约按"router.procedure → `POST /api/{router}/{procedure}`"直译成 REST 即可，错误码体系不变。

## 2. 通用约定

- **认证**：HttpOnly Session Cookie（NextAuth/Lucia 均可）；所有 procedure 默认需登录，标注 `public` 的除外。
- **ID**：对外一律前缀化公开 ID（`prj_/bt_/job_/tk_/ast_`）。
- **分页**：cursor 分页，入参 `{ cursor?: string, limit?: number (≤100, 默认 20) }`，出参 `{ items: T[], nextCursor: string | null }`。
- **幂等**：所有会产生扣费或外部副作用的 mutation（`generation.create`、`export.create`）必须传 `idempotencyKey`（客户端生成 UUID），语义见 data-model.md §2.10。
- **限频**：网关级 per-user 限频；命中返回 `E1005`。

## 3. tRPC Router 结构

```text
appRouter
├── auth        登录注册（略，Wave 1 用现成方案，仅列出形状）
├── user        当前用户 / 积分
├── project     项目 CRUD
├── beat        节拍 CRUD 与排序
├── asset       上传（预签名直传）
├── generation  生成任务
├── take        镜次管理
└── export      成片导出
```

### 3.1 `user`

| Procedure | 类型 | 入参 | 出参 |
|---|---|---|---|
| `user.me` | query | — | `{ id, nickname, avatarUrl, plan, creditBalance }` |
| `user.creditLedger` | query | `{ cursor?, limit? }` | `Page<{ id, delta, balanceAfter, reason, refType?, refId?, createdAt }>` |

### 3.2 `project`

| Procedure | 类型 | 入参 | 出参 / 错误 |
|---|---|---|---|
| `project.list` | query | `{ cursor?, limit?, status?: 'active'\|'archived' }` | `Page<ProjectCard>` |
| `project.get` | query | `{ projectId }` | `Project`（含 beats 概要）；`E2001` |
| `project.create` | mutation | `{ title, aspectRatio?, defaultResolution?, defaultModel?, stylePrompt? }` | `Project`；`E2101`（数量超限） |
| `project.update` | mutation | `{ projectId, patch: { title?, stylePrompt?, defaultModel?, defaultResolution? } }` | `Project`；`E2001/E2003` |
| `project.archive` / `project.unarchive` | mutation | `{ projectId }` | `{ ok }` |
| `project.delete` | mutation | `{ projectId }` | `{ ok }`（软删，30 天可恢复） |

> `aspectRatio` 创建后**不可修改**（已生成镜次会不一致），改则返回 `E2102`。

### 3.3 `beat`

| Procedure | 类型 | 入参 | 出参 / 错误 |
|---|---|---|---|
| `beat.listByProject` | query | `{ projectId }` | `Beat[]`（按 orderKey 升序，含 currentTake 概要；编辑器一次拉全量） |
| `beat.create` | mutation | `{ projectId, afterBeatId?: string, title?, prompt? }` | `Beat`；`E2201`（单项目节拍数超限） |
| `beat.update` | mutation | `{ beatId, patch: { title?, prompt?, negativePrompt?, durationSec?, cameraJson?, seed?, modelOverride?, resolutionOverride?, firstFrameAssetId?, lastFrameAssetId? } }` | `Beat`；`E2001/E2003/E2301`（引用资产非法） |
| `beat.reorder` | mutation | `{ beatId, afterBeatId: string \| null }` | `{ beatId, orderKey }`（服务端计算 fractional index） |
| `beat.delete` | mutation | `{ beatId }` | `{ ok }`（进行中任务将被请求取消） |
| `beat.setCurrentTake` | mutation | `{ beatId, takeId }` | `Beat`；`E2004`（take 不属于该 beat） |

### 3.4 `asset`（预签名直传三步）

| Procedure | 类型 | 入参 | 出参 / 错误 |
|---|---|---|---|
| `asset.createUpload` | mutation | `{ kind: 'image', mime, sizeBytes, sha256? }` | `{ assetId, uploadUrl, headers }`；`E2401`（类型/大小不允许，图片 ≤ 20MB） |
| `asset.confirmUpload` | mutation | `{ assetId }` | `Asset`（服务端 HEAD 校验对象存在与大小，提取宽高，置 `ready`）；`E2402`（对象缺失） |
| `asset.get` | query | `{ assetId }` | `Asset`（含短时效签名 `url`，默认 1h） |
| `asset.delete` | mutation | `{ assetId }` | `{ ok }`；`E2403`（仍被引用，409 语义） |

### 3.5 `generation`（核心）

| Procedure | 类型 | 入参 | 出参 / 错误 |
|---|---|---|---|
| `generation.create` | mutation | `{ beatId, idempotencyKey, paramsOverride?: { prompt?, seed?, durationSec?, resolution? } }` | `{ job: Job, dedup: boolean }` |
| `generation.get` | query | `{ jobId }` | `Job`（含 status/progress/errorCode/take 概要） |
| `generation.listByBeat` | query | `{ beatId, cursor?, limit? }` | `Page<Job>` |
| `generation.listActive` | query | — | `Job[]`（当前用户所有活跃任务，供全局任务栏） |
| `generation.cancel` | mutation | `{ jobId }` | `{ ok }`；`E4005`（已终态不可取消） |

`generation.create` 语义（与 pipeline 文档 §3 一致）：

1. 服务端将 Beat 当前配置 + `paramsOverride` 展开为**参数快照**并计算 `paramsHash`；
2. 命中 `idempotencyKey` → 原样重放首次响应（`dedup: true`）；
3. 命中"同 beat 同 paramsHash 活跃任务" → 返回**已有任务**（`dedup: true`），不重复扣费；
4. 校验积分（不足 `E3001`）与并发配额（超限 `E3002`）→ 冻结积分 → 入队 → 返回 `status: 'queued'` 的 Job。

`Job` 出参形状：

```ts
type Job = {
  id: string;                // job_xxx
  beatId: string;
  status: 'queued' | 'submitted' | 'running' | 'succeeded' | 'failed' | 'canceled';
  progress: number | null;   // 0-100，供应商提供时透传
  model: string;
  creditsHold: number;
  errorCode: string | null;  // 见 §5
  errorMessage: string | null;
  takeId: string | null;
  queuedAt: string; finishedAt: string | null;
};
```

**进度获取**：客户端优先订阅 SSE `/api/jobs/:id/events`（事件：`status`、`progress`、`done`、`error`）；SSE 不可用时降级为 `generation.get` 按 2s→5s 退避轮询。

### 3.6 `take`

| Procedure | 类型 | 入参 | 出参 |
|---|---|---|---|
| `take.listByBeat` | query | `{ beatId, cursor? }` | `Page<Take>`（含视频/封面短时效 URL） |
| `take.delete` | mutation | `{ takeId }` | `{ ok }` |

### 3.7 `export`

| Procedure | 类型 | 入参 | 出参 / 错误 |
|---|---|---|---|
| `export.create` | mutation | `{ projectId, idempotencyKey, options?: { watermark?: boolean } }` | `ExportJob`；`E2501`（存在无 currentTake 的节拍） |
| `export.get` | query | `{ exportJobId }` | `ExportJob`（成功含 `downloadUrl`） |
| `export.listByProject` | query | `{ projectId, cursor? }` | `Page<ExportJob>` |

## 4. REST 端点契约

### 4.1 `POST /api/webhooks/ark`（预留）

- 鉴权：`X-Signature` HMAC-SHA256（密钥来自环境变量），验签失败 401 且不落库；
- Body：透传供应商回调；处理逻辑=写 `provider_events`（dedup_key 去重）→ 触发对应 job 的状态推进（见 pipeline §4.3）；
- **必须幂等**：重复回调返回 200。

### 4.2 `GET /api/jobs/:id/events`（SSE）

- Cookie 鉴权 + job 属主校验；
- `Content-Type: text/event-stream`；事件 `status/progress/done/error`，data 为 JSON；
- 服务器每 25s 发 `: ping` 保活；连接断开客户端自动重连（`Last-Event-ID` 可忽略，状态以 `generation.get` 为准）。

## 5. 统一错误码

### 5.1 错误响应形状

tRPC 错误经 `errorFormatter` 附加 `data.appCode`；REST 错误统一：

```json
{
  "error": {
    "code": "E3001",
    "message": "积分不足，本次生成需要 10 积分",
    "details": { "required": 10, "balance": 3 },
    "requestId": "req_01H..."
  }
}
```

- `message` 一律**可直接展示给用户的中文**；日志中的技术细节挂 `requestId` 关联。
- `details` 为可选结构化上下文，供前端做精细 UI（如余额、重试倒计时）。

### 5.2 错误码表

| appCode | tRPC code | HTTP | 含义 | 前端建议行为 |
|---|---|---|---|---|
| **E1xxx 认证/权限** | | | | |
| E1001 | UNAUTHORIZED | 401 | 未登录 / 会话过期 | 跳登录 |
| E1002 | FORBIDDEN | 403 | 无权访问该资源（非属主） | 提示并返回列表页 |
| E1003 | FORBIDDEN | 403 | 账号被封禁 | 展示申诉入口 |
| E1005 | TOO_MANY_REQUESTS | 429 | 触发接口限频 | 按 `details.retryAfterMs` 退避 |
| **E2xxx 资源/校验** | | | | |
| E2001 | NOT_FOUND | 404 | 资源不存在或已删除 | |
| E2002 | BAD_REQUEST | 400 | 入参校验失败（Zod） | 表单标红，`details.issues` |
| E2003 | CONFLICT | 409 | 并发修改冲突 / 状态不允许该操作 | 刷新后重试 |
| E2004 | BAD_REQUEST | 400 | 关联关系非法（如 take 不属于 beat） | |
| E2101 | CONFLICT | 409 | 项目数量达上限 | 引导升级/清理 |
| E2102 | BAD_REQUEST | 400 | 画幅创建后不可修改 | |
| E2201 | CONFLICT | 409 | 单项目节拍数达上限 | |
| E2301 | BAD_REQUEST | 400 | 参考图资产非法（非本人/未 ready/类型不符） | |
| E2401 | BAD_REQUEST | 400 | 上传类型或大小不允许 | |
| E2402 | BAD_REQUEST | 400 | 上传未完成即 confirm | 重新上传 |
| E2403 | CONFLICT | 409 | 资产仍被引用，不能删除 | 展示引用位置 |
| E2501 | PRECONDITION_FAILED | 412 | 导出前置条件不满足（有节拍缺 currentTake） | 定位到缺失节拍 |
| **E3xxx 配额/积分** | | | | |
| E3001 | PRECONDITION_FAILED | 402 | 积分不足 | 充值/获取积分引导 |
| E3002 | TOO_MANY_REQUESTS | 429 | 并发生成任务数达上限 | 展示活跃任务，排队提示 |
| E3003 | PRECONDITION_FAILED | 403 | 计划不支持该能力（如 1080p 仅 pro） | 升级引导 |
| **E4xxx 生成任务**（多数出现在 `job.errorCode`，而非接口抛错） | | | | |
| E4001 | — | — | 供应商侧失败（可重试类耗尽重试后） | 提示重试 |
| E4002 | — | — | 内容安全拦截（提示词或产物违规） | 提示修改提示词，**不退重试**、退积分 |
| E4003 | — | — | 参数被供应商拒绝（模型/分辨率/时长组合非法） | 表单校正 |
| E4004 | — | — | 任务超时（watchdog 判定） | 已退积分，提示重试 |
| E4005 | CONFLICT | 409 | 任务已终态，不能取消 | 刷新状态 |
| E4006 | — | — | 产物下载/转存失败（重试耗尽） | 已退积分，提示重试 |
| **E5xxx 服务端** | | | | |
| E5000 | INTERNAL_SERVER_ERROR | 500 | 未分类内部错误 | 通用错误页 + requestId |
| E5001 | INTERNAL_SERVER_ERROR | 503 | 依赖不可用（DB/Redis/对象存储） | 稍后重试 |

### 5.3 约定

- **新增错误码只增不改语义**；错误码常量与消息文案集中在 `packages/shared/errors.ts`（单一事实源，前后端共用）。
- `E4xxx` 中标 `—` 的码是**任务失败原因**，通过 `Job.errorCode` 返回（接口本身 200），只有 E4005 会作为接口错误抛出。
- 供应商原始错误码 → 统一错误码的映射表维护在 pipeline 文档 §5.2。
