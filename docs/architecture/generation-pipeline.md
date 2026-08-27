# 视频生成流水线（Generation Pipeline）

> Wave 1 / WK3（数据与 API 架构）产出。
> 状态：**草案 v0.1**。表结构见 `data-model.md` §2.5/§2.6/§2.9；对外接口见 `api-contracts.md` §3.5。
> 供应商假设：**Seedance 系列模型，经火山引擎方舟（Ark）内容生成任务 API 调用**（异步任务制：创建任务 → 轮询查询）。具体模型名、参数上限**以官方文档为准**，本文以适配层隔离差异。

## 1. 总体架构

```text
                 ┌──────────────────────────────────────────────────────┐
                 │                        API 层                         │
 client ──tRPC──▶│ generation.create：校验→冻结积分→落库(queued)→enqueue │
   ▲             └───────────────┬──────────────────────────────────────┘
   │ SSE/轮询                     │ BullMQ (Redis)
   │             ┌───────────────▼──────────────────────────────────────┐
   │             │                   Worker（可水平扩展）                │
   │             │ submit: 调方舟创建任务 → 记 provider_task_id          │
   │             │ poll:   定时查任务状态 → 写 provider_events(去重)     │
   │             │ ingest: 下载产物 → 转存对象存储 → 建 take → 结算积分  │
   │             └───────────────┬──────────────────────────────────────┘
   │                             │
   └── notify（Redis pub/sub）◀──┘        Postgres = 唯一事实源（job 状态机）
```

要点：

- **Postgres 是唯一事实源**。队列（BullMQ/Redis）只负责"催促执行"，任何队列消息丢失/重复都不影响正确性——worker 每一步都以 DB 中 job 状态的 CAS 更新为准。
- **队列拆分为三个**：`gen:submit`（提交）、`gen:poll`（轮询，延迟任务）、`gen:ingest`（产物转存）。阶段隔离，重试策略互不影响。
- Worker 与 API 同仓部署为独立进程（Node.js），可按队列水平扩展。

## 2. 任务生命周期（与状态机对应）

| 阶段 | 触发 | 动作 | 状态迁移 |
|---|---|---|---|
| ① 创建 | `generation.create` | 事务：幂等检查→冻结积分→INSERT job→事务提交后 enqueue `gen:submit` | → `queued` |
| ② 提交 | submit worker | 调方舟"创建任务"API，拿到 `provider_task_id` | `queued → submitted` |
| ③ 运行 | poll worker（首查发现 running） | 记录 `started_at`，透传进度 | `submitted → running` |
| ④-a 成功 | poll 查到 succeeded | enqueue `gen:ingest`；下载产物→转存→建 take→结算积分 | `running → succeeded` |
| ④-b 失败 | poll 查到 failed / 提交报错 | 错误分类（§5）：可重试→退避后回 `queued`；不可重试→退款收尾 | `→ failed` 或 `→ queued` |
| ⑤ 取消 | `generation.cancel` | `queued/submitted`：直接取消+退款；`running`：调方舟取消 API（尽力），以下次轮询结果为准 | `→ canceled` |

> `enqueue` 必须在**事务提交之后**执行（避免消息先于数据可见）。补偿：巡检任务（§6.3）会捞起"已 queued 但长时间无人认领"的 job 重新入队，因此"提交后 enqueue 失败"只影响延迟、不影响正确性。

## 3. 幂等设计（四层）

重复的来源：用户双击、客户端重试、队列 at-least-once 重投、轮询/回调重复。逐层拦截：

### 3.1 API 层：`idempotencyKey`

客户端为每次"点击生成"生成 UUID。服务端在 `idempotency_keys` 表 `INSERT … ON CONFLICT` 抢占：

- 首次：正常执行，完成后回填 `response_snapshot`；
- 重复且 `done`：直接重放首次响应；
- 重复且 `in_flight`：返回 `E2003`（客户端稍后用同 key 重试）；
- 同 key 不同 `request_hash`：`E2003` 冲突。

### 3.2 业务层：`params_hash` 活跃任务唯一

`sha256(canonical_json(参数快照))`，靠部分唯一索引（data-model.md §2.5）保证**同一 Beat 同一参数最多一个活跃任务**。撞索引时不报错，改为返回已存在的活跃 job（`dedup: true`），不重复扣费。用户显式"再来一次"时由客户端加随机 seed 使 hash 不同。

### 3.3 提交层：防"提交成功但本地没记下来"

最危险的窗口：调方舟创建任务成功，但写回 `provider_task_id` 前进程崩溃 → 重试会**重复付费生成**。对策（按优先级）：

1. **先记意图再提交**：提交前先 CAS `queued → submitted`（此时 `provider_task_id` 仍为空）并持久化"本次尝试 ID"；
2. 供应商支持客户端幂等参数（如 `client_token`）则传 `job_id:attempt`，重复提交返回同一任务【待验证，见 §8】；
3. 若不支持：重试提交前先按"attempt 记录"反查（方舟支持按任务列表/ID 查询时），查不到才重新提交；
4. 兜底：`UNIQUE(provider, provider_task_id)` 保证同一供应商任务不会被两个 job 认领。

### 3.4 结果层：事件去重 + 状态 CAS + ledger dedup_key

- 每次轮询/回调结果先 `INSERT provider_events (dedup_key = provider:task_id:status) ON CONFLICT DO NOTHING`，插入失败（已处理过）直接返回；
- 状态推进一律 CAS（`WHERE status = expected`），并发轮询/重复回调影响行数为 0，安全跳过；
- 积分结算/退款靠 `credit_ledger.dedup_key` UNIQUE（`settle:{job_id}` / `refund:{job_id}`），**天然不可能重复退款**；
- ingest 转存以固定 `storage_key`（含 job_id）写对象存储，重复执行为覆盖写同一 key，幂等。

## 4. 状态获取：轮询为主，回调为辅

### 4.1 轮询（Wave 1 默认，方舟标准方式）

- 提交成功后 enqueue 延迟任务到 `gen:poll`，首查延迟 5s；
- 后续按 `5s → 8s → 12s → 20s → 30s（封顶）` 退避，仍在跑就再入队一个延迟任务；
- 全局轮询并发受 worker 并发数与供应商 QPS 限流器约束（§6.1）。

### 4.2 进度透传

方舟若返回进度/预计时长则写入 job 缓存字段并 `PUBLISH job:{id}`，SSE 网关订阅后推给前端；不提供进度时前端按平均耗时做伪进度。

### 4.3 回调（预留）

若供应商或自建中转支持回调：`POST /api/webhooks/ark` 验签后仅做两件事——写 `provider_events` + enqueue 一次**立即轮询**（回调只当"催促信号"，**不直接信任回调体的状态**，一切以主动查询结果为准）。这样回调丢失/重复/乱序都无影响。

## 5. 重试策略与错误分类

### 5.1 分级重试

| 层 | 重试什么 | 策略 |
|---|---|---|
| HTTP 客户端层 | 单次 API 调用的网络错误/超时 | 最多 2 次，指数退避 500ms 起 + 抖动；仅对幂等调用（查询）自动重试，创建任务不在此层盲重试 |
| 任务层（submit） | 提交失败（可重试类） | `attempt < max_attempts(3)`：退避 `30s * 2^attempt` + 抖动，CAS 回 `queued` 再入队；耗尽 → `failed` + 退款 |
| 任务层（ingest） | 产物下载/转存失败 | 独立重试 5 次（产物 URL 有时效，尽快抢救）；耗尽 → `failed(E4006)` + 退款 |
| 队列层 | worker 崩溃 | BullMQ stalled 检测重投；因所有步骤幂等（§3），重投安全 |
| 人工层 | 进 DLQ 的任务 | 死信队列 + 告警，人工/脚本修复后可重新入队 |

### 5.2 错误分类 → 统一错误码映射

| 供应商错误特征 | 分类 | 统一码 | 处理 |
|---|---|---|---|
| 429 / QPS 超限 | 可重试 | — | 不计入 attempt，纯退避（并调低限流器） |
| 5xx / 网络超时 / 任务 internal error | 可重试 | E4001（耗尽后） | 计 attempt，退避重试 |
| 内容安全拦截（提示词/产物违规） | **不可重试** | E4002 | 立即 `failed`，退款，提示改词 |
| 参数非法（模型不支持的分辨率/时长组合） | **不可重试** | E4003 | 立即 `failed`，退款；同时是我们校验层的 bug 信号 |
| 鉴权失败（API Key 失效） | 不可重试+全局 | E5001 | 熔断整个 provider（§6.2），任务留在队列，**不**判死 |
| watchdog 超时（§6.3） | 终止 | E4004 | 标记 `failed`，退款，尽力调取消 API |

> 映射表实现为适配层的纯函数 `classifyProviderError(raw) → { retryable, appCode, throttle? }`，新错误码默认按"可重试"处理并告警，人工确认后补充映射。

### 5.3 退款规则（与 data-model.md §3.4 一致）

- `failed` / `canceled` 收尾事务内：余额加回 + ledger `refund:{job_id}`；
- E4002（内容违规）同样退积分（Wave 1 从宽；若滥用再改为部分退款——只需改这一处策略函数）；
- `succeeded` 收尾事务内：ledger `settle:{job_id}`（`credits_charged = credits_hold`）。

## 6. 流控、超时与巡检

### 6.1 限流与并发

- **供应商侧**：Redis 令牌桶限制"创建任务 QPS"与"活跃任务总数"（方舟有并发任务上限），submit worker 取不到令牌就延迟重入队；
- **用户侧**：活跃任务数 free=2 / pro=5（配置化），创建时校验（`E3002`）；
- worker 并发：`gen:submit` 低并发（受供应商限制），`gen:poll` 中并发，`gen:ingest` 受出口带宽约束单独调。

### 6.2 熔断

连续 N 次鉴权失败或 5xx 比例超阈值 → 熔断 provider 60s（半开试探恢复），期间任务保持在队列不判死，只延迟。

### 6.3 Watchdog 巡检（每分钟，唯一实例跑，用分布式锁）

| 症状 | 判定 | 动作 |
|---|---|---|
| `queued` 超 10min 且队列中无对应消息 | enqueue 丢失 | 重新入队 |
| `submitted` 超 5min 未拿到 task_id | 提交悬挂 | 按 §3.3 反查/重试 |
| `running` 超 30min（约模型 P99 的 3 倍，配置化） | 任务卡死 | 置 `failed(E4004)` + 退款 + 尽力取消 |
| `idempotency_keys` `in_flight` 超 15min | 请求悬挂 | 清理，允许客户端重试 |
| `assets` `pending` 超 24h | 上传弃单 | 删除记录与半成品对象 |

## 7. 可观测性

- **结构化日志**：全链路携带 `job_id / user_id / provider_task_id / request_id`；
- **指标**（Prometheus 语义）：`gen_jobs_total{status}`、`gen_job_duration_seconds{stage=queue|provider|ingest}`、`gen_retry_total{reason}`、`provider_qps_throttled_total`、DLQ 深度、积分对账差异（应恒为 0）；
- **告警**：失败率 > 10%（5min 窗）、DLQ 非空、熔断触发、watchdog 修复次数突增、对账差异非 0。

## 8. 待验证事项（对接方舟时确认）

1. Seedance 各模型（pro / lite-t2v / lite-i2v）支持的分辨率×时长×画幅组合，用于我们的参数校验层与 `E4003` 预防；
2. 创建任务是否支持客户端幂等参数（`client_token` 类），决定 §3.3 采用方案 2 还是 3；
3. 任务结果 URL 的有效期（决定 ingest 重试窗口）与是否提供进度字段；
4. 是否提供回调能力；没有则 §4.3 保持预留；
5. 账号级并发任务上限与 QPS 配额，回填 §6.1 限流参数；
6. 计费口径（按秒/按任务/按分辨率），决定积分定价函数 `estimateCost(params)`。
