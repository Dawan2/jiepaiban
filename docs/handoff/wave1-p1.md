# 交接文档：Wave 1 / Cycle 1 / P1（架构与方案）

> **分支**：`cursor/wave1-p1-architecture-35c5`（基线：`main` @ `09e11fd`，Initial commit）
> **日期**：2026-08-27

---

## 1. 完成项

| # | 完成项 | 说明 |
| --- | --- | --- |
| 1 | 基线勘察 | 已 `git fetch` 并全仓搜索：远端仅 `main` 一个分支、一个初始提交，仓库内无 docs、无代码、无源稿 PDF。确认无他人已提交成果，无重复劳动风险。 |
| 2 | 源稿缺失处置 | 两份源稿 PDF 均不在仓库。已在架构文档头部以显著声明标注「源稿缺失」，并将所有依赖源稿的细节集中为 13 条待核验清单（架构文档 §9）。 |
| 3 | 产品架构文档 | 产出 `docs/architecture/00-product-architecture.md`，覆盖：产品愿景、6 类用户角色、7 阶段核心工作流（含各阶段完成判据）、模块图（mermaid，8 个后端模块 + 前端 6 界面 + 基础设施）、技术栈建议（TypeScript 全栈 monorepo）、目录结构建议、14 个关键实体与 ER 图、Seedance 2.5 公开能力边界表、待核验清单、分期建议（M0/M1/M2）。 |
| 4 | Seedance 2.5 能力调研 | 基于 2026-08 公开资料确认：火山方舟异步任务接口、模型 ID `doubao-seedance-2-5-260628`、480p/720p、4–30 秒整数时长、最多 30 参考图/10 参考视频/10 参考音频、首尾帧、generate/edit/extend 三种任务类型、同步音频。已整理为架构约束表（架构文档 §8），并标注须以官方文档复核。 |

## 2. 证据

| 交付物 | 文件路径 | Commit |
| --- | --- | --- |
| 产品架构文档 | `docs/architecture/00-product-architecture.md` | `bb41c8d02e92a719e9f03006eb8e11d4509ce91b` |
| 本交接文档 | `docs/handoff/wave1-p1.md` | 见本文档所在提交（架构文档提交的后一个 commit） |

## 3. 缺口

| # | 缺口 | 影响 | 建议处置 |
| --- | --- | --- | --- |
| 1 | **两份源稿 PDF 缺失**（极简节拍板体系稿 + PRD 稿） | 节拍卡字段、时长规范、角色分工、质检标准、产能指标、功能范围等 13 项只能以 v0 提案占位（详见架构文档 §9 核验表） | 请源稿持有者将 PDF 提交至 `docs/source/`；随后领取下方任务 W2-T0 逐项核验 |
| 2 | 无任何代码基线 | 仓库为空，脚手架尚未搭建 | 由 W2-T2 建立 monorepo 脚手架 |
| 3 | 数据模型仅到实体/关系级 | 字段、索引、迁移脚本未定义 | 由 W2-T1 细化 |
| 4 | Seedance 2.5 参数为公开二手资料 | 直连火山方舟的鉴权方式、限流配额、回调格式未实测 | 由 W2-T4 用真实 API Key 核验（需在 Secrets 配置凭证） |
| 5 | 未定义 API 契约 | 前后端并行开发缺少接口约定 | 由 W2-T1 一并产出 OpenAPI 草案 |

## 4. 给 W2 工作槽的就绪任务列表

每条任务可独立领取、互不阻塞（标注了软依赖的除外）。所有任务的公共输入是 `docs/architecture/00-product-architecture.md`（下称「架构文档」）。

### W2-T0：源稿入库与核验（最高优先，依赖外部提供 PDF）
- **做什么**：将两份源稿 PDF 放入 `docs/source/`；逐条核对架构文档 §9 的 13 项核验表，更新表中「状态」列；对不符项修订架构文档相应章节，并在修订处标注依据。
- **验收**：§9 核验表全部条目状态为 ✅ 或标注「源稿未覆盖」；修订以独立 commit 提交。

### W2-T1：数据模型与 API 契约
- **做什么**：基于架构文档 §7 实体表，产出 `docs/architecture/01-data-model.md`（完整字段、类型、索引、状态机转移表）+ Prisma schema 草案 + `docs/architecture/02-api-contract.md`（REST 资源与 OpenAPI 3.1 草案，覆盖七阶段工作流所需接口）。
- **验收**：Prisma schema 可 `prisma validate` 通过；OpenAPI 文件可通过 lint（如 spectral）；状态机转移表与架构文档 §3③ 一致。

### W2-T2：Monorepo 脚手架与 CI
- **做什么**：按架构文档 §6 目录结构初始化 pnpm workspaces + Turborepo；建 `apps/web`（Next.js + TS + Tailwind）、`apps/api`（NestJS）、`packages/shared`、`packages/prompt-compiler`、`packages/seedance-client` 空壳；配置 ESLint、Prettier、Vitest、tsconfig 共享基座；`.github/workflows` 建 CI（lint + typecheck + test 三关卡，任一失败即红）。附 `infra/docker-compose.yml`（Postgres + Redis + MinIO）。
- **验收**：`pnpm install && pnpm turbo lint typecheck test` 本地全绿；CI 在 push 时自动运行且通过；不得跳过或弱化任何检查。

### W2-T3：节拍卡 JSON Schema 与 Prompt 编译器规格
- **做什么**：在 `packages/shared` 定义节拍卡、角色卡、场景卡、风格锚点包的 JSON Schema（以架构文档 §3③ 字段表为 v0，预留源稿核验后的修订空间）；产出 `docs/architecture/03-prompt-compiler.md`：编译规则（字段→提示词段落的映射、参考素材注入顺序与上限裁剪策略、负面清单合并规则、override 机制）、版本化方案、快照测试方案。
- **验收**：Schema 附至少 5 个合法样例 + 5 个非法样例的校验测试；编译器规格中每条规则均有输入/输出示例。

### W2-T4：Seedance 2.5 适配层实测与封装规格
- **做什么**：用真实凭证（需用户在 Cursor Dashboard Secrets 配置火山方舟 API Key）实测：任务提交、轮询、回调、限流行为、错误码、计费口径；将实测结果写入 `docs/architecture/04-seedance-integration.md`，修订架构文档 §8 表格中与实测不符项；在 `packages/seedance-client` 定义类型化客户端接口（含 mock 实现供其他槽位测试用）。
- **验收**：文档含至少一次真实任务的请求/响应样本（脱敏）；mock 客户端通过与真实客户端相同的接口测试套件。凭证缺失时可先交付「基于官方文档的接口定义 + mock」，并在文档标注未实测项。

### W2-T5：节拍板工作台前端原型
- **软依赖**：W2-T2（脚手架）；可先在独立目录用 mock 数据开发后并入。
- **做什么**：实现看板视图（场次为列、节拍卡拖拽排序，dnd-kit）+ 表格视图（批量编辑）双视图切换；卡片渲染架构文档 §3③ 全部字段与状态徽标；数据先走本地 mock（W2-T3 的 Schema 样例）。
- **验收**：Playwright E2E 覆盖：新建卡、拖拽排序、双视图切换、状态流转展示；组件测试覆盖卡片必填校验。

### W2-T6：生成调度器设计与队列骨架
- **软依赖**：W2-T2（脚手架）、W2-T4（客户端接口，可先用 mock）。
- **做什么**：产出 `docs/architecture/05-generation-scheduler.md`（任务生命周期、并发/限流/退避参数、成本熔断算法、Take 存储流）；在 `apps/api` 实现 BullMQ 队列骨架：提交→轮询→落盘（MinIO）→状态回写，对接 mock 客户端。
- **验收**：集成测试（testcontainers 或 docker-compose 起 Redis/Postgres/MinIO）覆盖：正常完成、失败重试、超预算熔断三条路径。

### W2-T7：审片质检工作流设计
- **做什么**：产出 `docs/architecture/06-review-qc.md`：审片间交互流程、判卡三态（通过/返修/重拆）与卡片状态机的联动、返修原因标签体系 v0、标签统计如何回流模板迭代；给出质检清单模板（短剧版/漫剧版各一，标注待源稿核验项）。
- **验收**：状态机联动与 W2-T1 的转移表一致（如 T1 未完成，先自洽并标注）；每个返修标签附判定示例。

### W2-T8：LLM 剧本拆解服务规格
- **做什么**：产出 `docs/architecture/07-breakdown-service.md`：输入格式（纯文本/Markdown 剧本）、拆解提示词模板 v0、输出为节拍卡草稿数组（符合 W2-T3 Schema）、人工校对交互、失败与幻觉防护（时长合计校验、角色名对齐资产库）；附 3 个真实风格的剧本样例与期望输出。
- **验收**：样例输出通过 W2-T3 Schema 校验；提示词模板含防幻觉约束说明。

> **领取规则建议**：T0 优先级最高但受外部输入阻塞，不应占用整槽；T1、T2、T3 是其余任务的软依赖源头，建议 W2 前三个槽位优先领取；T4 若凭证未就绪按降级路径交付。所有任务不得降低验收标准。
