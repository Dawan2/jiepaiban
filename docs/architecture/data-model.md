# 数据模型设计（Data Model）

> Wave 1 / WK3（数据与 API 架构）产出。
> 状态：**草案 v0.1**，待产品规格（WK1/WK2）定稿后对齐修订。
> 存储选型假设：**PostgreSQL 15+**（主库，ORM 建议 Prisma 或 Drizzle）+ **Redis**（队列/缓存）+ **S3 兼容对象存储**（视频/图片资产，如火山引擎 TOS、Cloudflare R2）。

## 0. 产品假设（本文档的前提）

仓库当前没有产品规格文档，本设计基于以下假设（详见 `docs/handoff/wave1-wk3.md` 的"待确认问题"）：

「节拍板（jiepaiban）」是一个 **AI 分镜视频创作工具**：用户创建**项目（Project）**，把故事拆成有序的**节拍/分镜（Beat）**，为每个节拍编写提示词并调用 **Seedance**（火山引擎方舟 API）生成视频片段；每次生成产生一个**镜次（Take）**，用户挑选满意的镜次后可将整个项目**导出（Export）**为成片。生成消耗**积分（Credits）**。

## 1. 实体总览与关系（ER 概览）

```text
User 1──n Project 1──n Beat 1──n GenerationJob 1──0..1 Take
  │            │           │                            │
  │            │           └──── current_take_id ───────┘（同 Beat 内）
  │            └──1──n ExportJob
  ├──1──n Asset（上传的参考图 / 生成的视频与封面）
  ├──1──n CreditLedger（积分流水，append-only）
  └──1──n ApiKey（预留，开放 API 用）

GenerationJob n──1 Beat        （一个节拍可多次生成，产生多个镜次）
Take           n──1 Asset      （video_asset_id / thumb_asset_id）
ProviderEvent  n──1 GenerationJob（供应商回调/轮询事件，去重用）
IdempotencyKey n──1 User       （写接口幂等）
```

命名约定：表名 `snake_case` 复数；主键 `id`；所有表带 `created_at` / `updated_at`（`timestamptz`）；业务可见实体使用**前缀化公开 ID**（如 `prj_01H…`、`bt_…`、`job_…`、`tk_…`、`ast_…`），内部为 ULID/UUIDv7，保证按时间可排序。

## 2. 表定义

### 2.1 `users` — 用户

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid (v7) | PK | |
| email | citext | UNIQUE, NULL 允许 | 邮箱登录 |
| phone | text | UNIQUE, NULL 允许 | 手机号登录（国内主渠道） |
| auth_provider | text | NOT NULL | `password` / `wechat` / `github` / … |
| auth_subject | text | | 三方登录的 subject，`UNIQUE(auth_provider, auth_subject)` |
| nickname | text | NOT NULL | |
| avatar_asset_id | uuid | FK→assets, NULL | |
| plan | text | NOT NULL DEFAULT `free` | `free` / `pro` / `team`（Wave 1 只实现 free） |
| credit_balance | bigint | NOT NULL DEFAULT 0, CHECK ≥ 0 | **冗余余额**，与 `credit_ledger` 对账（见 §3.4） |
| status | text | NOT NULL DEFAULT `active` | `active` / `banned` / `deleted` |
| deleted_at | timestamptz | NULL | 软删除 |

> 约束：`CHECK (email IS NOT NULL OR phone IS NOT NULL OR auth_subject IS NOT NULL)`——至少一种登录凭据。

### 2.2 `projects` — 项目

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| owner_id | uuid | FK→users, NOT NULL, INDEX | Wave 1 仅单人所有；协作留到 members 表（暂不建） |
| title | text | NOT NULL, CHECK length ≤ 200 | |
| description | text | | |
| aspect_ratio | text | NOT NULL DEFAULT `16:9` | `16:9` / `9:16` / `1:1` / `4:3` / `21:9`，**项目级统一**，Beat 不可覆盖 |
| default_resolution | text | NOT NULL DEFAULT `720p` | `480p` / `720p` / `1080p` |
| default_model | text | NOT NULL | 如 `doubao-seedance-1-0-pro`，Beat 可覆盖 |
| style_prompt | text | | 项目级风格前缀，生成时拼接到 Beat 提示词前 |
| cover_asset_id | uuid | FK→assets, NULL | |
| beat_count | int | NOT NULL DEFAULT 0 | 冗余计数，触发器/事务内维护 |
| status | text | NOT NULL DEFAULT `active` | `active` / `archived` / `deleted` |
| deleted_at | timestamptz | NULL | 软删除；删除后 30 天物理清理（含级联资产） |

### 2.3 `beats` — 节拍 / 分镜

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| project_id | uuid | FK→projects, NOT NULL | |
| order_key | text | NOT NULL | **fractional index**（如 LexoRank/`fractional-indexing`），拖拽排序不需批量重排；`UNIQUE(project_id, order_key)` |
| title | text | | 节拍名，如"开场：雨夜街道" |
| prompt | text | NOT NULL DEFAULT '' | 正向提示词 |
| negative_prompt | text | | |
| duration_sec | int | NOT NULL DEFAULT 5, CHECK IN (5, 10) | 与 Seedance 支持时长对齐 |
| model_override | text | NULL | 覆盖项目默认模型 |
| resolution_override | text | NULL | 覆盖项目默认分辨率 |
| camera_json | jsonb | NOT NULL DEFAULT `{}` | 运镜参数（固定镜头/推拉摇移），schema 由前端与生成层共同约定 |
| seed | bigint | NULL | 为空则随机；记录用于复现 |
| first_frame_asset_id | uuid | FK→assets, NULL | 图生视频（i2v）首帧参考图 |
| last_frame_asset_id | uuid | FK→assets, NULL | 尾帧参考图（首尾帧模式） |
| current_take_id | uuid | FK→takes, NULL, **DEFERRABLE** | 当前选用镜次（循环外键，见 §3.2） |
| status | text | NOT NULL DEFAULT `draft` | `draft`（未生成过）/ `generating`（有进行中任务）/ `ready`（有选用镜次）|
| deleted_at | timestamptz | NULL | |

索引：`(project_id, order_key)`；`(project_id) WHERE deleted_at IS NULL`。

### 2.4 `assets` — 资产（图片 / 视频 / 音频）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| owner_id | uuid | FK→users, NOT NULL, INDEX | |
| kind | text | NOT NULL | `image` / `video` / `audio` |
| source | text | NOT NULL | `upload`（用户上传）/ `generated`（Seedance 产物）/ `export`（成片） |
| storage_key | text | NOT NULL, UNIQUE | 对象存储 key，规则：`{env}/u/{owner_id}/{asset_id}.{ext}` |
| mime | text | NOT NULL | 上传白名单：`image/jpeg,png,webp`；`video/mp4` |
| size_bytes | bigint | NOT NULL DEFAULT 0 | |
| width / height | int | NULL | |
| duration_ms | int | NULL | 视频/音频 |
| sha256 | text | NULL, INDEX | 上传完成后回填；同 owner 去重可选 |
| status | text | NOT NULL DEFAULT `pending` | `pending`（已发预签名，未确认）/ `ready` / `failed` |
| expires_at | timestamptz | NULL | `pending` 超过 24h 由清理任务回收 |
| deleted_at | timestamptz | NULL | |

> **不可变约束**：`status = ready` 后，`storage_key/mime/size/sha256` 不再修改；替换文件必须新建 asset。

### 2.5 `generation_jobs` — 生成任务（核心表，详见 generation-pipeline.md）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | 也用作队列 jobId 与日志 trace 关联键 |
| user_id | uuid | FK→users, NOT NULL, INDEX | |
| project_id | uuid | FK→projects, NOT NULL | 冗余，便于按项目查询 |
| beat_id | uuid | FK→beats, NOT NULL, INDEX | |
| kind | text | NOT NULL DEFAULT `t2v` | `t2v` / `i2v` / `flf2v`（首尾帧） |
| provider | text | NOT NULL DEFAULT `ark` | 供应商适配层标识（火山方舟） |
| model | text | NOT NULL | 快照：提交时实际使用的模型 |
| params_json | jsonb | NOT NULL | **参数快照**（拼接后的完整 prompt、分辨率、时长、seed、参考图 asset id 等），Beat 后续修改不影响已提交任务 |
| params_hash | text | NOT NULL, INDEX | `sha256(canonical_json(params_json))`，幂等判重 |
| idempotency_key | text | NULL | 客户端幂等键；`UNIQUE(user_id, idempotency_key)` |
| status | text | NOT NULL | `queued` / `submitted` / `running` / `succeeded` / `failed` / `canceled`（状态机见 §3.3） |
| provider_task_id | text | NULL | 方舟返回的任务 ID；`UNIQUE(provider, provider_task_id)` |
| attempt | int | NOT NULL DEFAULT 0 | 已尝试提交次数 |
| max_attempts | int | NOT NULL DEFAULT 3 | |
| error_code | text | NULL | 统一错误码（见 api-contracts.md §5） |
| error_message | text | NULL | 面向用户的失败原因 |
| credits_hold | int | NOT NULL DEFAULT 0 | 冻结积分数 |
| credits_charged | int | NOT NULL DEFAULT 0 | 实际扣除（成功后=hold；失败/取消=0） |
| queued_at / submitted_at / started_at / finished_at | timestamptz | NULL | 各阶段时间戳，供延迟指标 |
| take_id | uuid | FK→takes, NULL | 成功后回填产物镜次 |

部分唯一索引（**幂等关键**）：

```sql
-- 同一节拍同一参数，同时只允许一个"活跃"任务
CREATE UNIQUE INDEX uq_active_job_per_params
  ON generation_jobs (beat_id, params_hash)
  WHERE status IN ('queued', 'submitted', 'running');
```

### 2.6 `takes` — 镜次（生成结果）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| beat_id | uuid | FK→beats, NOT NULL, INDEX | |
| job_id | uuid | FK→generation_jobs, NOT NULL, **UNIQUE** | 一个成功任务恰好产出一个镜次 |
| video_asset_id | uuid | FK→assets, NOT NULL | |
| thumb_asset_id | uuid | FK→assets, NULL | 首帧封面图 |
| duration_ms / width / height | int | NOT NULL | 从产物元数据提取 |
| seed_used | bigint | NULL | 供应商实际使用的 seed（可复现） |
| deleted_at | timestamptz | NULL | |

### 2.7 `credit_ledger` — 积分流水（append-only）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | bigint | PK, IDENTITY | |
| user_id | uuid | FK→users, NOT NULL, INDEX | |
| delta | int | NOT NULL, CHECK ≠ 0 | 正=入账，负=扣除 |
| balance_after | bigint | NOT NULL, CHECK ≥ 0 | 该笔之后的余额快照 |
| reason | text | NOT NULL | `signup_grant` / `purchase` / `job_hold` / `job_settle` / `job_refund` / `admin_adjust` |
| ref_type / ref_id | text / text | NULL | 关联对象（如 `job` + job_id、`order` + 订单号） |
| dedup_key | text | NOT NULL, **UNIQUE** | 幂等键，如 `hold:{job_id}`、`refund:{job_id}`，天然防重复入账 |

> 本表**只插不改不删**；`users.credit_balance` 在同一事务内以 `UPDATE … SET credit_balance = credit_balance + delta` 方式维护，并由每日对账任务校验 `balance == SUM(delta)`。

### 2.8 `export_jobs` — 成片导出任务

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| user_id / project_id | uuid | FK, NOT NULL | |
| params_json | jsonb | NOT NULL | 快照：节拍顺序、各 beat 的 current_take、转场/水印设置 |
| params_hash | text | NOT NULL | 同 §2.5 幂等语义 |
| status | text | NOT NULL | 同 generation_jobs 状态机 |
| output_asset_id | uuid | FK→assets, NULL | 成片 mp4 |
| error_code / error_message | text | NULL | |

### 2.9 `provider_events` — 供应商事件（轮询/回调去重）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | bigint | PK, IDENTITY | |
| provider | text | NOT NULL | |
| provider_task_id | text | NOT NULL | |
| event_type | text | NOT NULL | `status_changed` / `callback_received` |
| dedup_key | text | NOT NULL, **UNIQUE** | 如 `{provider}:{task_id}:{status}`；同一状态事件只处理一次 |
| payload_json | jsonb | NOT NULL | 原始响应，排障与审计用 |

### 2.10 `idempotency_keys` — 写接口幂等（通用）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| key | text | | `PRIMARY KEY (user_id, key)` |
| user_id | uuid | FK→users | |
| endpoint | text | NOT NULL | 命中不同 endpoint 视为冲突（409） |
| request_hash | text | NOT NULL | 同 key 不同 body → 409 |
| response_snapshot | jsonb | NULL | 首次成功响应，重放时原样返回 |
| status | text | NOT NULL | `in_flight` / `done` |
| expires_at | timestamptz | NOT NULL | 默认 24h，过期清理 |

## 3. 一致性约束与不变量（Invariants）

### 3.1 权属链

- `beat.project_id → project.owner_id` 必须等于操作者（Wave 1 无协作）。
- `take.job_id → job.beat_id` 必须等于 `take.beat_id`（应用层校验 + 建 `UNIQUE(job_id)` 保证 1:1）。
- Beat 引用的参考图 asset（first/last frame）必须 `owner_id` 相同且 `status = ready`。

### 3.2 `beats.current_take_id` 循环外键

`beats → takes → beats` 存在循环引用。处理方式：

1. 外键声明为 `DEFERRABLE INITIALLY DEFERRED`，事务末校验；
2. 应用层不变量：**`current_take_id` 指向的 take 必须属于该 beat**（`SELECT 1 FROM takes WHERE id = ? AND beat_id = ?` 守卫，或触发器）；
3. 删除 take 时若为 current，需在同事务内将 `current_take_id` 置空或切换到最新镜次。

### 3.3 任务状态机（generation_jobs / export_jobs 通用）

```text
queued ──> submitted ──> running ──> succeeded
   │            │            │
   │            └────────────┴──> failed（attempt < max 时可回到 queued 重试）
   └──> canceled（仅 queued/submitted 可取消；running 尽力取消）
```

- 所有状态迁移必须用 **CAS 式 UPDATE**：`UPDATE … SET status = :next WHERE id = :id AND status = :expected`，影响行数为 0 即放弃（并发消费/重复回调天然安全）。
- 终态（`succeeded/failed/canceled`）不可再迁移。
- `succeeded` 必须同事务写入 `takes` 行并回填 `job.take_id`。

### 3.4 积分一致性（两阶段：冻结→结算/退款）

1. **创建任务**（同一事务）：校验 `credit_balance ≥ cost` → 扣余额 → 写 ledger（`job_hold`，`dedup_key = hold:{job_id}`）→ 插入 job（`credits_hold = cost`）。
2. **成功结算**：job 迁移到 `succeeded` 的同一事务写 ledger（`job_settle`，delta = 0 仅记账 或按实际用量多退少补）。
3. **失败/取消退款**：同一事务余额加回 + ledger（`job_refund`，`dedup_key = refund:{job_id}`）。
4. `dedup_key` UNIQUE 保证重试/重复回调**不会重复退款或重复扣费**。
5. `users.credit_balance CHECK (≥ 0)` 为最后防线；对账任务每日核对流水求和。

### 3.5 软删除级联规则

| 删除对象 | 行为 |
|---|---|
| Project | 软删；其 Beats/Takes 查询层过滤；30 天后后台物理删除并回收对象存储 |
| Beat | 软删；**进行中的 job 自动请求取消**；takes 保留 30 天 |
| Take | 软删；若为 current_take 需重选或置空；对应 asset 延迟回收 |
| Asset | 仅当无 ready 引用（beat 参考图 / take / 封面）时允许删除，否则 409 |
| User（注销） | 软删 + 匿名化 PII；资产与项目进入 30 天回收期 |

### 3.6 并发与配额

- 每用户**并发活跃生成任务上限**（free=2，配置化）：创建 job 事务内 `SELECT count(*) … WHERE status IN (active) FOR UPDATE` 或使用 Redis 令牌，超限返回 `E3002`。
- 同一 Beat 允许并发生成不同参数（多镜次探索），相同参数被 §2.5 的部分唯一索引挡住。

## 4. 索引与查询模式小结

| 场景 | 索引 |
|---|---|
| 项目列表（我的） | `projects(owner_id, updated_at DESC) WHERE deleted_at IS NULL` |
| 节拍列表（编辑器主查询） | `beats(project_id, order_key) WHERE deleted_at IS NULL` |
| 任务轮询（worker 侧） | `generation_jobs(status, submitted_at)`；`provider_task_id` 唯一索引 |
| 用户任务历史 | `generation_jobs(user_id, created_at DESC)` |
| 卡死任务巡检 | `generation_jobs(status) WHERE status IN ('submitted','running')` + `started_at` 过滤 |
| 积分对账 | `credit_ledger(user_id, id)` |

## 5. 迁移与演进说明

- 使用 ORM 自带迁移（Prisma Migrate / Drizzle Kit），迁移文件入库，CI 校验 schema drift。
- 预留但 Wave 1 **不建**的表：`project_members`（协作）、`api_keys`（开放 API）、`orders/payments`（支付，先用注册赠送积分跑通闭环）、`audio_tracks`（配乐）。
- `camera_json` / `params_json` 用 jsonb 承载快速演进的生成参数，稳定后再提列。
