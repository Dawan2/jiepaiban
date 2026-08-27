# 交接文档：Wave 1 / Cycle 1 / P1（架构与方案）

> **分支**：`cursor/wave1-p1-architecture-35c5`（基线：`main` @ `09e11fd`）
> **日期**：2026-08-27（v1，源稿到达后修订；v0 为源稿缺失推导版）

---

## 1. 完成项

| # | 完成项 | 说明 |
| --- | --- | --- |
| 1 | 基线勘察（v0/v1 两次） | v0 时远端仅 `main`；v1 续工时再次 fetch，发现兄弟槽分支 P3（PRD backlog）与 WK3（数据/API 架构），均为源稿缺失期推导稿，本槽未重做其成果，冲突点见 §3。 |
| 2 | 架构文档 v0 | 源稿缺失路径下的推导架构（含显著缺失声明与 13 项核验清单）。 |
| 3 | **架构文档 v1（本次交付）** | 源稿全文要点到达后按红线修订：确立核心公式（1 Beat=1 镜头组=1 板=1 次 Seedance2.5 长段落生成）、单集固定 5 段（钩子/矛盾/打压/反转/断集）、宫格 3/3/3/3/2 左→右、组内 AI 运镜剪辑/组间人工衔接（5 种手法）、单板≤30s、成片 70–90s、系统五锁、三页面布局、数据锁七字段。**废除 v0 中与源稿冲突的设计**：自由节拍数、Scene/Shot 分层、拖拽排序、LLM 剧本拆解、审片间、时间线剪辑、六角色 RBAC。13 项核验清单已逐条登记处置结果（10 项已核、3 项待 PDF 原件）。 |
| 4 | Seedance 2.5 能力对齐 | 公开 API 的 4–30s 单任务时长与"单板≤30s"时长锁吻合，确认核心公式的能力基础成立；能力表保留在架构文档 §8，标注接入前须官方复核。 |

## 2. 证据

| 交付物 | 文件路径 | Commit |
| --- | --- | --- |
| 架构文档 v0（源稿缺失推导稿） | `docs/architecture/00-product-architecture.md` | `bb41c8d02e92a719e9f03006eb8e11d4509ce91b` |
| 交接文档 v0 | `docs/handoff/wave1-p1.md` | `c58d4e96822f9172cfeaf20d826af53a504d333b` |
| **架构文档 v1（按源稿红线修订）** | `docs/architecture/00-product-architecture.md` | `6c911e26e73ba9e7fee3965ff96c08f7fe4ee587` |
| 交接文档 v1（本文档） | `docs/handoff/wave1-p1.md` | 本文档所在提交（v1 架构提交的后一个 commit） |

## 3. 缺口与跨分支冲突警示

### 缺口

| # | 缺口 | 处置建议 |
| --- | --- | --- |
| 1 | 源稿 **PDF 原件仍未入库**（本次到达的是调度注入的全文要点） | 原件提交至 `docs/source/`，随后核验：PRD 第 11–13 章完整页面规范、5 段模板库具体文案、成品示例全文、产能指标数值、通用前缀完整措辞（清单见架构文档 §9） |
| 2 | 无代码基线 | W2-T2 脚手架 |
| 3 | 数据模型仅到实体/不变量级 | W2-T1 细化（**注意不要沿用 WK3 分支的旧模型**，见下） |
| 4 | Seedance 2.5 未实测 | W2-T4（需 Secrets 配置火山方舟凭证） |

### 跨分支冲突警示（W2 合并/引用他槽成果前必读）

兄弟槽成果产于源稿缺失期，以下假设**与源稿红线冲突**，引用时必须先按红线修正：

| 分支 | 冲突点 | 红线依据 |
| --- | --- | --- |
| `cursor/wave1-wk3-data-api-arch-bdfb`（数据/API） | ① `beats.order_key` fractional index 拖拽排序——**禁止改序**；② Project→Episode→Scene→Beat→Shot→Take 分层——**不存在 Scene/Shot，1 Beat=1 镜头组=1 次生成**；③ beats 可增删的 CRUD 端点——**结构锁禁止**；④ 无 Frame（宫格）、TransitionRule（组间衔接）、PromptFinal 实体 | 红线 1/2/3/9 |
| `cursor/wave1-p3-prd-backlog-162d`（PRD backlog） | ① 8 大模块含剧本编辑器、审核、协作、多格式时间线导出——超出 P0 五能力；② Beat/Shot 分层假设；③ 47 任务 backlog 的 P0 集合需按"5段模板库/可视化编辑/Prompt组装/节拍帧驱动生成/衔接管理"重排 | 红线 1/7 + PRD 能力 P0 |

其中 WK3 的**生成流水线设计（三队列/幂等/CAS/积分账本）与领域无关，可直接复用**；其 data-model 的 users/credits/jobs 骨架可保留，beats 相关表须按本文档架构 §7 重写。

## 4. 给 W2 工作槽的就绪任务列表

每条可独立领取。公共输入：`docs/architecture/00-product-architecture.md`（v1，下称「架构文档」），红线以其 §0 为准，任何任务不得违反五锁、不得降低验收标准。

### W2-T0：源稿 PDF 原件入库与残项核验（受外部输入阻塞，不占整槽）
- **做什么**：PDF 入 `docs/source/`；核验架构文档 §9"仍待原件核验"5 项；修订处标注依据，独立 commit。
- **验收**：§9 残项全部登记核验结果；如 PRD 第 11–13 章与要点有出入，同步修订 §3/§4 并通知已领取 T5 的槽位。

### W2-T1：数据模型与 API 契约（按五锁重写）
- **做什么**：基于架构文档 §7 产出 `docs/architecture/01-data-model.md`（Project/Beat/Frame/AiParam/PromptFinal/GenerationJob/TransitionRule/Template 完整字段、CHECK 约束、状态机转移表）+ Prisma schema + `docs/architecture/02-api-contract.md`（OpenAPI 3.1）。**端点集合本身必须体现结构锁：不存在增删板/增删格/换序端点**。可复用 WK3 分支 jobs/幂等设计，beats 相关按本槽模型重写。
- **验收**：`prisma validate` 通过；OpenAPI 过 spectral lint；五锁各自能指出对应的 schema 约束或端点缺省证明；状态机与架构文档 §7 不变量 3 一致。

### W2-T2：Monorepo 脚手架与 CI
- **做什么**：按架构文档 §6 初始化 pnpm workspaces + Turborepo：`apps/web`（Next.js+TS+Tailwind）、`apps/api`（NestJS）、`packages/shared`（五锁常量、Schema、错误三分类）、`packages/prompt-assembler`、`packages/seedance-client` 空壳；ESLint/Prettier/Vitest/tsconfig 基座；CI（lint+typecheck+test）；`infra/docker-compose.yml`（Postgres+Redis+MinIO）。
- **验收**：`pnpm install && pnpm turbo lint typecheck test` 全绿；CI push 触发且通过；不得跳过或弱化检查。

### W2-T3：Prompt 组装器实现规格与 Schema
- **做什么**：`packages/shared` 定义节拍板/节拍帧/AiParam JSON Schema（固定 5 板、3/3/3/3/2 宫格、时长≤30s 全部编码为 Schema 约束）；产出 `docs/architecture/03-prompt-assembler.md`：填充公式（固定前缀+情绪+时长+镜头节奏+剧情核心+逐格描述左→右）的逐段映射规则、固定前缀注入（漫剧厚涂/8K/五官稳定，项目级配置）、**组间衔接词表红线校验器**（词表 v0 至少覆盖：音频预接/螺口/卡点/硬切/BGM升调/黑屏/转场及其变体）、版本化与快照测试方案、≤200ms 的同构（前端预览/后端终校）执行方案。
- **验收**：Schema 附合法/非法样例各 ≥5 组测试（非法样例必须含"6 板""4 宫格""31s""换序"）；红线校验器附命中/放行用例各 ≥5 条；每条组装规则有输入/输出示例。

### W2-T4：Seedance 2.5 适配层实测与封装
- **做什么**：用真实凭证实测提交/轮询/回调/限流/错误码/计费；产出 `docs/architecture/04-seedance-integration.md`；错误码映射到 PRD **失败三类**（参数错误/模型拒绝/系统异常）；`packages/seedance-client` 类型化客户端 + mock。仅适配 Seedance 2.5，不做多模型抽象的产品化暴露。
- **验收**：含 ≥1 次真实任务请求/响应样本（脱敏）；三类错误映射表完整；mock 与真实客户端过同一接口测试套件。凭证缺失时按"官方文档接口定义+mock"降级交付并标注未实测项。

### W2-T5：编辑页前端（5 板×宫格可视化编辑）
- **软依赖**：W2-T2；可先用 mock 数据独立开发。
- **做什么**：实现三页面骨架（左导航+顶栏+主编辑区）与编辑页核心：5 块节拍板固定横排（无增删/排序交互）、每板职能标签+宫格区（3/3/3/3/2，格内图+文，无增删格交互）、情绪/时长/镜头节奏参数、Prompt 实时预览（调用组装器同构包）、自动保存、生成中锁编辑、失败三类提示、重置只清内容不动结构。
- **验收**：Playwright E2E 覆盖：新建项目自动出现 5 板且无增删入口、宫格填写与自动保存、生成中输入被禁用、重置后结构完整内容清空、Prompt 预览含固定前缀；组件测试覆盖时长>30s 拒绝。

### W2-T6：生成调度器与队列骨架
- **软依赖**：W2-T2、W2-T4（可先 mock）。
- **做什么**：产出 `docs/architecture/05-generation-scheduler.md` 并实现 BullMQ 骨架：板级独立任务（提交→轮询→MinIO 落盘→状态回写）、提交前校验（时长锁+5板合计 70–90s+红线校验通过）、生成中板级编辑锁、错误三分类回写。可复用 WK3 分支三队列/幂等设计（领域字段按本槽模型替换）。
- **验收**：集成测试覆盖：正常完成、失败三类各自的状态回写、单板重roll不影响他板、编辑锁生效四条路径。

### W2-T7：组间衔接管理与成片归档
- **做什么**：产出 `docs/architecture/06-transition-archive.md` 并实现：4 个接缝各选 5 种手法之一（音频预接/螺口/卡点硬切/BGM升调/黑屏断钩子）、操作要点备注、成片管理页的 5 段归档视图与交付包导出（5 视频+衔接清单）。**衔接数据与生成链路零交集**（AI 权限锁）。
- **验收**：接缝恒为 4 条不可增删（测试证明）；导出交付包含 5 段 video_url 与 4 条衔接规则；衔接字段不出现在任何生成请求中（针对性断言测试）。

### W2-T8：5 段模板库（P0 能力）
- **做什么**：产出 `docs/architecture/07-template-library.md` + 种子数据：模板 = 5 段剧情核心预填文案（首个种子用源稿成品示例：宴会—钻戒—打压—反转—断集，细节待 T0 原件核验后补全）；套用交互 = 只填内容不动结构。
- **验收**：模板 Schema 通过 W2-T3 校验（恒 5 段）；套用后项目结构校验通过；种子模板 ≥3 个（未核验处标注占位）。

> **领取建议**：T1、T2、T3 是依赖源头，优先领取；T5/T6/T7 依赖 T2 骨架但可 mock 先行；T0 等 PDF 原件到位随时插入；T4 凭证未就绪走降级路径。合并他槽成果时先过 §3 冲突表。
