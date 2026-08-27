# Wave 1 / WK3 交接文档（数据与 API 架构）

- 槽位：Wave 1 / Cycle 1 / WK3
- 分支：`cursor/wave1-wk3-data-api-arch-bdfb`
- 日期：2026-08-27

## 1. 本槽交付物

| 文件 | 内容 |
|---|---|
| `docs/architecture/data-model.md` | 10 张核心表（users / projects / beats / assets / generation_jobs / takes / credit_ledger / export_jobs / provider_events / idempotency_keys）、关系图、一致性不变量（状态机 CAS、积分两阶段冻结-结算-退款、循环外键处理、软删级联、并发配额）、索引与演进预留 |
| `docs/architecture/api-contracts.md` | tRPC 为主 + 3 个 REST 端点（webhook / healthz / SSE）的接口草案；8 个 router 的 procedure 清单与入出参形状；统一错误码体系（E1xxx~E5xxx，含 tRPC/HTTP 映射与前端行为建议） |
| `docs/architecture/generation-pipeline.md` | Seedance（方舟异步任务 API）生成流水线：三队列架构（submit/poll/ingest）、四层幂等（idempotencyKey / params_hash / 提交防重 / 事件去重+CAS+ledger dedup）、分级重试与错误分类映射、限流熔断、watchdog 巡检、可观测性指标 |
| `docs/handoff/wave1-wk3.md` | 本文 |

## 2. 开工前核对结果

- 开工时仓库仅 1 个 Initial commit（`09e11fd`，只有 README），`docs/` 不存在，远端无其他分支——**无既有内容可复用，也无重做风险**；
- 未等待其他槽产出，按指令独立推进。

## 3. 关键决策（其他槽请知悉）

1. **技术栈假设**：Next.js + TypeScript 单仓、PostgreSQL（Prisma/Drizzle）、Redis + BullMQ、S3 兼容对象存储。若基建槽选型不同，data-model 的表结构与 pipeline 的语义可平移，api-contracts 的 tRPC 部分需按 §1 的直译规则转 REST。
2. **tRPC 优先**：Wave 1 无开放 API 需求，端到端类型安全收益最大；仅 webhook / healthz / SSE 走 REST。
3. **Postgres 为唯一事实源**：队列只做调度，不承载状态；所有状态迁移 CAS 化，使 at-least-once 队列与重复回调天然安全。
4. **积分两阶段**（冻结→结算/退款）+ append-only ledger + `dedup_key` UNIQUE：从 schema 层面杜绝重复扣费/退款。
5. **排序用 fractional index**（`beats.order_key`）：拖拽排序 O(1) 写入，避免批量重排事务。
6. **参数快照**：任务提交时把 Beat 配置固化进 `params_json`，Beat 后续编辑不影响进行中任务，也是幂等 hash 的输入。
7. **对外 ID 前缀化**（`prj_/bt_/job_/tk_/ast_`），内部 UUIDv7。

## 4. 产品假设（最需要 WK1/WK2 确认）

本槽在无产品规格的情况下假设产品为「AI 分镜视频创作工具」：项目 → 有序节拍（Beat）→ 每节拍多镜次（Take）生成 → 选片 → 导出成片。**如果产品方向不同（例如"街拍模板"或"音乐节拍卡点视频"），Beat/Take 的领域命名和 export 流程需要调整，但 jobs/assets/credits/pipeline 这套骨架不变。**

## 5. 待确认问题清单

| # | 问题 | 影响 | 建议责任槽 |
|---|---|---|---|
| 1 | 产品形态与领域命名是否如 §4 假设 | data-model §0、beats/takes 命名 | 产品槽 |
| 2 | 技术栈定稿（Next.js/tRPC/Prisma/BullMQ？） | api-contracts §1 | 基建槽 |
| 3 | 登录方式（手机号/微信/邮箱优先级） | users 表凭据字段 | 产品+基建 |
| 4 | 方舟账号配额、client_token 幂等支持、结果 URL 时效、回调能力、计费口径 | pipeline §8 全部 6 项 | 对接生成服务的实现槽 |
| 5 | 免费额度与积分定价（`estimateCost` 函数） | credit 体系参数 | 产品槽 |
| 6 | 是否 Wave 1 就要成片导出（export_jobs 可整体推迟） | 范围裁剪 | 产品槽 |

## 6. 给后续实现槽的落地顺序建议

1. 按 data-model.md 写迁移（可先跳过 `export_jobs`），建 `packages/shared/errors.ts` 错误码单一事实源；
2. 搭 tRPC 骨架 + `errorFormatter`（appCode 透传），实现 user/project/beat/asset 四个 router（纯 CRUD，无外部依赖）；
3. 实现 generation router + 三队列 worker，先用 **fake provider**（sleep + 返回样例 mp4）打通状态机/积分/幂等的集成测试；
4. 接真实方舟 API，回填 pipeline §8 的待验证项，补错误映射表；
5. 最后做 SSE 推送与 export。

## 7. 风险提示

- **提交防重（pipeline §3.3）是全链路最脆弱点**：若方舟不支持客户端幂等参数，必须实现"先记意图再提交 + 反查"路径，实现时需要针对"提交后崩溃"写故障注入测试；
- 积分对账指标（差异应恒为 0）建议从第一天就接告警，它是 ledger 实现正确性的哨兵；
- 文档中所有上限数值（并发数、超时阈值、配额）均为占位默认值，需配置化，勿硬编码。
