# Cycle 2 就绪队列（W7–W9 实现任务）

- 文档编号：`ARCH-C2-QUEUE`
- 槽位：**Wave 6 / 80 · Cycle 2 架构波 · PLAN SLOT W6**
- 依据：[`architecture-delta.md`](./architecture-delta.md)（本队列每条任务的实现契约）、[`risks.md`](./risks.md)
- 承接：[`../backlog/ready-queue.md`](../backlog/ready-queue.md)（Cycle 1 基线：队列语义、属主制、撞车高危区）

> 队列语义、属主制、取件规则**沿用 Cycle 1 基线**，不重述。
> 一条补充：本 Cycle 有一个**闸门槽**（`W7-I1`），它不遵守路径互斥——见 §0.2。

> **链接说明**：本文引用的 `../work/w3-template-library.md` 与 `../work/w4-a11y.md`
> 目前只存在于待合并分支上（分别随 **M2**、**M3** 到位），在合流完成前是预期的悬空链接。
> 其余相对链接在 `8ffe44f` 上均可解析。

---

## 0. 本 Cycle 的排布

### 0.1 三个实现波的主题

| 波次 | 主题 | 一句话出口判据 |
| --- | --- | --- |
| **W7** | **收敛分叉 + 落库链路** | 五条分支合成一条；生成成功即落库，不依赖编辑页挂载 |
| **W8** | **贯通三条断链** | 成片页读真数据；模板可套用；队列能重启续跑 |
| **W9** | **补齐红线与法源缺口** | `纯硬切` 法源归位；RULE-5 有阻断；迁移链有演练 |
| W10（验证波） | Cycle 1 + Cycle 2 合并验收 | 见 §4 |

### 0.2 闸门槽：`W7-I1` 是本 Cycle 唯一允许跨路径的槽位

合并本质上不可路径互斥——它要动的正是别人也想动的文件。因此：

- `W7-I1` 持有 §3.1 表中**全部**「合并冲突面」路径，其他槽位在 W7 期间**一律不得触碰**；
- `W7-I1` 交付后，这些路径按 §3.2 / §3.3 的表移交给对应槽位；
- **`W7-I1` 是本 Cycle 的瓶颈**，与 Cycle 1 的 `W2-P1`（脚手架）同性质。
  它交付前，`W7-I2` / `I3` / `I4` 只能在**全新文件**上工作（三者的路径都刻意选成新增目录）。

`W7-I1` 的纪律（重复一遍，因为这是最容易破的）：**合并槽不做功能改动。**
允许的动作只有解冲突、符号重定向、补挂载点、跑闸门。

---

## 1. W7 —— 收敛分叉 + 落库链路

### `W7-I1` · 分支合流（闸门，P0）

| 项 | 内容 |
| --- | --- |
| **契约** | [`architecture-delta.md`](./architecture-delta.md) §3 全节（含 §3.2 逐条重定向、§3.2 末的闸门与用例数基线） |
| **路径归属** | `routes/ExportPage.tsx`、`routes/EditorPage.tsx`、`store/ProjectsProvider.tsx`、`testing/harness.tsx`、`domain/transitions.ts`、`domain/transitions.test.ts`、`apps/web/package.json`、`package-lock.json`、`adapters/images/frameImageKey.ts`、`apps/web/src/styles.css`、`vitest.setup.ts`、`adapters/persistence/drivers.ts` |
| **任务** | 按 **M1 → M2 → M3 → M4** 顺序合并四条分支（`w4-feishu-export-925d` @ `82f4845` → `w3-templates-golden-library-e98c` @ `21ae263` → `w4-a11y-6861` @ `d24127d` → `w4-image-store-8321` @ `3d4b5af`）。**不单独合 `wave2-w2-export-ca31`**——它被 925d 严格包含（§3 关键发现 1） |
| **DoD** | ① 四次合并各一个提交，提交信息逐条写明「取哪侧、为什么」；② 每次合并后 `typecheck` / `lint:terms` / `test` / `build` 四闸门全绿；③ 逐文件用例数 ≥ 两侧最高值，写成对账表（体例照 [`w3-integrate-store-gen.md`](../work/w3-integrate-store-gen.md) §4）；④ `data/demoProjects` 未被复活；⑤ `纯硬切` 仍通过 `isTransitionRule` 且 B3 衔接值不变；⑥ 合并后 `dist/` 可构建、三条路由可跑 |
| **依赖** | 无。**本波第一个开工项** |
| **不做** | 任何功能改动、任何测试期望的放宽、任何架构文档回写 |

> 若某次合并的闸门无法在合理成本内转绿，**停在那一次**、把该分支记入
> [`DISPATCH.md`](./DISPATCH.md) 并顺延，而不是放宽闸门让它过。
> 已合并的前序不回退——顺序设计成 M1→M4 就是为了让「停在中途」也是一个可交付状态。

### `W7-I2` · 生成结果落库 sink（P0，可与 I1 并行开工）

| 项 | 内容 |
| --- | --- |
| **契约** | [`architecture-delta.md`](./architecture-delta.md) §1 全节 |
| **路径归属** | **新增**：`generate/resultSink.ts`、`generate/resultSink.test.ts`、`generate/reconcile.ts`、`generate/reconcile.test.ts`。**I1 交付后接管**：`generate/queue.ts`、`generate/queue.test.ts`、`adapters/persistence/localRepository.ts`、`adapters/persistence/localRepository.test.ts` |
| **任务** | ① 定义 `GenerateResultSink` 端口与 `NULL_SINK`；② 仓储加窄写入 `applyGenerateResult(projectId, beatIndex, patch)`，内部走 `rebuildBeat` 重铸（§1.3 (b)）；③ 队列在 `transition(SUCCEEDED/FAILED)` 后调 sink；④ 写启动对账纯函数（§1.4 五种情形表），含「`RUNNING` 判为中断 → 可重试失败」；⑤ 落盘前重读生成期字段的合并（§1.3 (c)） |
| **DoD** | ① 生成成功后**不等防抖、不需编辑页挂载**即可从 `repository.load` 读到 `video_url`；② 生成跑完前离开编辑页，成片页仍显示「已生成」；③ 假时钟构造「编辑草稿落盘」与「sink 写库」交错，两组字段互不覆盖；④ `RUNNING` 中刷新 → 对账后提交入口解锁；⑤ **既有 87 条生成测试一条不改**（`NULL_SINK` 下行为等同） |
| **依赖** | 端口与对账函数无依赖，可立即开工。③④⑤ 的接线需 `W7-I1` 交付 |

> 开工顺序建议：先写 `reconcile.ts`（纯函数、零依赖、可完整单测），
> 再写端口，最后接线。这样 I1 还没交付时本槽也有实打实的产出。

### `W7-I3` · Seedance 传输层 v2（P1）

| 项 | 内容 |
| --- | --- |
| **契约** | [`architecture-delta.md`](./architecture-delta.md) §4.2、§4.3、§4.4 |
| **路径归属** | **新增**：`generate/transport/` 整目录（`types.ts`、`stub.ts`、`fromOneShot.ts`、`backoff.ts` 与各自测试）、`generate/endpointConfig.ts`。**I1 交付后接管**：`generate/adapter.ts`、`generate/adapter.test.ts` |
| **任务** | ① `SeedanceTransportV2`（`submit` / `poll` / 可选 `cancel`）；② `fromOneShot()` 兼容层，保证既有单发桩件与全部既有测试不变；③ 桩件的两段实现（可注入假时钟，`poll` 按脚本推进）；④ 退避策略（首次 2s、×1.5、封顶 15s、总上限 `max(120s, duration_sec × 20)`）；⑤ `SeedanceEndpointConfig`（**无密钥字段**）+ `baseUrl` 空则回落桩件 |
| **DoD** | ① `fromOneShot` 包住现有桩件后，`adapter.test.ts` / `queue.test.ts` 期望零改动；② 轮询与超时在假时钟下有确定性测试；③ `POLL_TIMEOUT` 归 `API_ERROR` 且可重试；④ `SeedanceEndpointConfig` 类型层**没有任何字段可以放密钥**；⑤ `generate/**` 内 `import.meta.env` / `process.env` 零命中 |
| **依赖** | ①–④ 无依赖。⑤ 的组装根注入需 `W7-I1`（`main.tsx` 被 image-store 改过） |
| **不做** | 任何真实网络请求；任何队列层改动（队列侧接轮询是 `W8-I1`） |

### `W7-I4` · 无密钥闸门与 CI 守卫（P1）

| 项 | 内容 |
| --- | --- |
| **契约** | [`architecture-delta.md`](./architecture-delta.md) §4.3 的四条守卫表 |
| **路径归属** | `scripts/scan-secrets.mjs`（新增）、`scripts/scan-secrets.test.mjs`（新增）、`scripts/forbidden-terms.json`、`.github/workflows/ci.yml`、根 `package.json` 的 `scripts` 段 |
| **任务** | ① 源码扫描：`generate/**`、`domain/**`、`adapters/**` 内 `import.meta.env` / `process.env` 零命中；② **构建产物扫描**：`build` 之后扫 `dist/**` 的 `sk-` / `api_key` / `apiKey` / `secret` / `authorization` 等模式；③ 两项接入 `verify`；④ 反例测试（植入一个含密钥模式的临时文件 → CI 必须失败），体例照现有 `scripts/forbidden-terms.test.mjs` |
| **DoD** | ① 反例测试自动化（不靠人工验证"我试过了"）；② 正常仓库零命中；③ 产物扫描在 `build` 之后运行且能阻断；④ 扫描器自身与 `docs/**` 在白名单内 |
| **依赖** | 无。与 I1 完全不重叠（根 `package.json` 与 `apps/web/package.json` 是两个文件；a11y 改的是后者） |
| **不做** | **不新增任何依赖**。lock 文件是 `W7-I1` 的，本槽加依赖会立刻撞车 |

**W7 出口判据**：一条分支承载全部已完成工作；生成成功即落库且不依赖 UI 挂载；
传输层能表达「提交 + 轮询」；「客户端不含密钥」由产物扫描保证而非纪律保证。

---

## 2. W8 —— 贯通三条断链

### `W8-I1` · 队列接轮询 + 重启续跑（P0）

| 项 | 内容 |
| --- | --- |
| **契约** | [`architecture-delta.md`](./architecture-delta.md) §0.2（重启续跑是 Cycle 2 原判据的欠项）、§1.4、§4.2 |
| **路径归属** | `generate/queue.ts`、`generate/store.ts`、`generate/useGenerateController.ts`、`generate/controller.ts` 及各自测试 |
| **任务** | ① 队列改用 `SeedanceTransportV2`：`submit` 拿 `remote_task_id` → 按退避 `poll` → 终态；② `GenerateJob` 增 `remote_task_id` / `progress`（可选，缺省 null）；③ 启动时跑 `W7-I2` 的对账，接续 `PENDING`、中断 `RUNNING`；④ `controller.stateOf` 的取值优先级固定为**项目记录 > 任务表**（§1.3 (d)）；⑤ `progress` 回显到板级徽章 |
| **DoD** | ① 桩件 + 假时钟下，「提交 → 三次轮询 → 出片」有确定性测试；② 刷新页面后 `PENDING` 任务继续跑、`RUNNING` 任务变为可重试失败；③ 「库里已生成但任务表被清」时板显示「已生成」而非「未生成」；④ 单发/批量/失败重试/重启续跑四条 Cycle 2 原判据全部有集成测试 |
| **依赖** | `W7-I2`、`W7-I3` |

### `W8-I2` · 成片页接真数据（P1）

| 项 | 内容 |
| --- | --- |
| **契约** | [`architecture-delta.md`](./architecture-delta.md) §3.2 M1、§1.3 (d) |
| **路径归属** | `export/` 整目录、`share/` 整目录、`routes/ExportPage.tsx`（自 `W7-I1` 移交） |
| **任务** | ① 成片页与飞书导出的数据源从夹具改为本地仓储（段卡的「已生成」读落库 `video_url`）；② `export/fixtures.ts` 保持为**测试专用**且不从 `index.ts` 导出（原分支的这条约束要保住）；③ 飞书导出的衔接总表读合并后的衔接目录，`pending_canon` 取值在导出里**明确标注「待法源确认」**（PRD `AC-F5-9`）；④ 逐段下载接落库地址 |
| **DoD** | ① 新建项目 → 生成 → 刷新 → 成片页 5 张段卡状态正确；② 飞书导出字段完整（项目名 / 总时长 / 5 板规格 / 各板 `prompt_final` / 衔接总表）；③ 导出内容**不含**任何镜头级字段与密钥；④ `pending_canon` 取值在导出文本里有待确认标注 |
| **依赖** | `W7-I1`（M1）、`W7-I2`（`video_url` 真的会落库） |

### `W8-I3` · 模板套用进新建流程（P1）

| 项 | 内容 |
| --- | --- |
| **契约** | [`w3-template-library.md`](../work/w3-template-library.md) §2（骨架不在模板里重新声明）、PRD §7.1 新建 / §7.2 复用 |
| **路径归属** | `domain/templates.ts`（自 `W7-I1` 移交）、`components/NewProjectForm.tsx`、`store/projectFactory.ts`、`routes/ProjectsPage.tsx` 及各自测试 |
| **任务** | ① 新建弹层加「套用模板」入口，套用后 5 板【示例】文案预填；② 骨架字段**一律不从模板取**，仍由 `BEAT_DEFS` 推导（模板只提供文案）；③ 复用（PRD §7.2）沿用 W3 的重铸实现，不退回浅拷 |
| **DoD** | ① 套用模板后 5 板剧情核心 / 情绪 / 节奏 / 帧描述预填，且 `isNewProjectValid` 为真；② **结构锁不受模板影响**：模板里若被手改出 4 格或 6 板，`validateTemplate` 与落库断言双双拒绝；③ B1 套用后组装出的 Prompt 与 `BEAT1_GOLDEN_PROMPT` 逐字相等 |
| **依赖** | `W7-I1`（M2） |

### `W8-I4` · 参考图接生成请求 + 配额呈现（P2）

| 项 | 内容 |
| --- | --- |
| **契约** | [`architecture-delta.md`](./architecture-delta.md) §2.5、§2.4 |
| **路径归属** | `adapters/images/` 整目录（自 `W7-I1` 移交 `frameImageKey.ts`）、`components/FrameImagePanel.tsx`、`store/useBeatFrameImages.ts`、`store/FrameImagesProvider.tsx`、`generate/adapter.ts`（自 `W7-I3` 移交） |
| **任务** | ① `SeedanceSubmission` 增可选 `reference_images`（只带坐标与内容哈希，**不带字节、不带 object URL**）；② 注入点在**适配器层**，`domain/prompt.ts` 与 `buildGenerateRequest` 不变；③ 配额呈现「已用 x / 上限 y」；④ 备份封套的参考图清单（数量 + 字节数）与导入时的明确提示（§2.4） |
| **DoD** | ① 提交体深度遍历后仍零命中 `FORBIDDEN_SUBMISSION_KEYS`（含 `reference_images` 内部）；② 领域层文件 diff 为空；③ 导入不含图片的备份时 UI 明确提示「N 张需重新上传」，不静默；④ `SCHEMA_VERSION` 仍为 1（清单缺失按 0 处理） |
| **依赖** | `W7-I1`（M4）、`W7-I3`（`adapter.ts` 移交） |

**W8 出口判据**：队列能重启续跑并显示进度；成片页与飞书导出读真数据；
模板可套用且结构锁不被绕过；参考图进请求体而领域层零改动。

---

## 3. W9 —— 补齐红线与法源缺口

### `W9-I1` · `纯硬切` 法源归位（P0，含外部裁定）

| 项 | 内容 |
| --- | --- |
| **契约** | [`risks.md`](./risks.md) §1 全节 |
| **路径归属** | `docs/methodology/glossary.md`（**需方法论槽位授权**）、`domain/transitions.ts`、`domain/templates.ts` 及测试 |
| **任务** | 二选一执行，**取决于法源裁定**：**(A) 补入枚举** —— `METH-002 §5` 收录 `纯硬切`，代码侧清掉 `pending_canon` 标记与待批清单；**(B) 改基准值** —— B3 → B4 改用已收录取值，`HARD_CUT` 从目录移除，并**补 `SCHEMA_VERSION` v1 → v2 迁移**把库里的 `纯硬切` 改写掉 |
| **DoD** | ① 代码目录与 `METH-002 §5` 的取值集合**完全一致**，且有一条测试断言这件事（从此不可能再漂移）；② 若走 (B)：迁移函数 + 迁移单测就位，老库读得回来；③ 飞书导出与成片页不再出现「待法源确认」标注 |
| **依赖** | **阻塞于方法论槽位的裁定**。解阻条件与降级见下 |

> **解阻与降级**：本项是本 Cycle 唯一有外部依赖的任务。若 W9 开工时裁定仍未下达，
> **执行降级方案**：保留 `pending_canon` 现状（`纯硬切` 可用、标记在、导出有标注），
> 把本项顺延到下一个架构波重排，并在 [`DISPATCH.md`](./DISPATCH.md) 记明「顺延原因＝外部裁定未达」。
> **不得**由实现槽自行裁定法源——那正是这条风险的成因（见 [`risks.md`](./risks.md) §1）。

### `W9-I2` · RULE-5 阻断与项目级字段编辑（P1）

| 项 | 内容 |
| --- | --- |
| **契约** | W3 遗留缺口第 4、5 条；PRD `RULE-5`（整集 70–90s）、`AC-F2-*` |
| **路径归属** | `components/ProjectParamsPanel.tsx`（新增）、`store/useProjectEditor.ts`、`domain/projects.ts`、`routes/EditorPage.tsx`（自 `W7-I1` 移交）及各自测试 |
| **任务** | ① 整集时长偏离 70–90s 时**阻断「可交付」**（按 PRD 口径：不阻断编辑、阻断交付），成片页给出明确原因；② 编辑页加项目级字段入口（题材 / 画幅 / 画风 / 主角）——这些字段注入每板 Prompt，改动后 5 板 Prompt 预览必须同步刷新；③ `useProjectEditor` 认识项目级字段 |
| **DoD** | ① 编辑到 60s 时仍可编辑，但成片页与交付入口给出「整集时长越界」的可读拦截原因；② 改项目级字段后 5 板 Prompt 预览同步更新，且落盘；③ 单板 ≤30s 硬锁行为不变 |
| **依赖** | `W7-I1` |

### `W9-I3` · 无障碍覆盖成片页与飞书面板（P2）

| 项 | 内容 |
| --- | --- |
| **契约** | [`w4-a11y.md`](../work/w4-a11y.md) 的既有口径（Tab 序不做 roving、`aria-current="step"`、状态不只靠颜色、统一焦点环） |
| **路径归属** | `export/` 与 `share/` 的组件与 a11y 测试（自 `W8-I2` 移交）、`apps/web/src/styles.css`、`scripts/forbidden-terms.json` |
| **任务** | ① 把 a11y 槽位在编辑页建立的口径套到成片页与飞书面板（键盘可达、具名地标、状态播报、焦点环）；② 清理 W3 登记的两条禁用词扫描豁免（`BeatBoard.test.tsx`、`ProjectsPage.test.tsx`）——改为把待断言的禁用词集中到一处测试夹具，让豁免面从两个文件收到一个 |
| **DoD** | ① 成片页与飞书面板全键盘可作业；② 焦点环样式与编辑页一致（同一 `--focus`）；③ 豁免清单条目数**减少**，且每条仍写明理由；④ 既有 33 条 a11y 测试零回归 |
| **依赖** | `W8-I2` |

### `W9-I4` · 迁移链演练与性能基线（P1）

| 项 | 内容 |
| --- | --- |
| **契约** | [`risks.md`](./risks.md) §3；[`tech-stack.md`](../architecture/tech-stack.md) §4；Cycle 1 W5 未执行的「迁移演练」与「性能基线」 |
| **路径归属** | `adapters/persistence/envelope.ts`、`adapters/persistence/envelope.test.ts`、`adapters/persistence/migrations/`（新增目录）、`tests/perf/`（新增） |
| **任务** | ① **迁移链演练**：在 `MIGRATIONS` 仍为空表的前提下，构造一个假的 v1→v2 迁移跑通全链（写入 v1 备份 → 注册假迁移 → 读回 → 过锁），把「缺口检测」与「版本高于当前程序则拒绝」两条既有分支都覆盖上；② 两个版本号的语义区分写成测试（改 `DB_VERSION` 不影响封套版本，反之亦然）；③ 性能基线：首屏可交互、Prompt 组装、自动保存三项埋点与基线断言 |
| **DoD** | ① 迁移链在有条目时确实被调用、缺条目时确实拒绝且不静默丢数据；② `SCHEMA_VERSION` 与 `DB_VERSION` 各自的升级路径都有测试；③ 三项性能基线有数字、有阈值、能在 CI 跑 |
| **依赖** | `W7-I1`（M4 带来 `DB_VERSION = 2`） |

**W9 出口判据**：代码的衔接目录与方法论法源零漂移（或已明确顺延且降级在位）；
RULE-5 有阻断点；迁移链被真正跑过一次而不是「有框架但从未执行」。

---

## 4. W10（验证波）—— 两个 Cycle 的合并验收

W10 要还两笔债，**必须分开记账**：

| 债主 | 内容 | 出处 |
| --- | --- | --- |
| **Cycle 1**（W5 从未召开） | E2E 主流程、L4 全站扫描、L7 面板与 `assemble()` 逐字符比对、首屏 ≤2s / 面板 ≤500ms、v1 封套迁移演练、覆盖率闸门 | [`wave-plan.md`](../backlog/wave-plan.md) §2 W5 |
| **Cycle 2** | 队列可靠性（单发 / 批量 / 失败重试 / **重启续跑**）、**L7 请求体比对补全**（Cycle 1 时无请求体，现已有）、错误五类可复现、无密钥产物扫描、图片仓容量降级 | [`wave-plan.md`](../backlog/wave-plan.md) §3 W10 + 本文档 |

分开记账的理由：混记之后，「Cycle 1 的 E2E 一直没跑」这件事会在两轮内变成查不出来的历史。
W10 的验收报告要能回答「哪一轮欠的、欠了多久」。

W10 仍遵守验证波硬规则：**只修不加**，`verify` 不全绿则 Cycle 2 不算完成，缺口顺延进下一个架构波重排。

---

## 5. 文件归属总表（防撞车）

**规则沿用 Cycle 1**：表中每一行的路径只能由属主槽创建与修改；跨属主修改先在
[`DISPATCH.md`](./DISPATCH.md) 申请移交，**不得先改后说**。

### 5.1 W7 归属

| 路径 | 属主 | 备注 |
| --- | --- | --- |
| `routes/ExportPage.tsx`、`routes/EditorPage.tsx`、`store/ProjectsProvider.tsx`、`testing/harness.tsx`、`domain/transitions.ts(.test)`、`apps/web/package.json`、`package-lock.json`、`adapters/images/frameImageKey.ts`、`src/styles.css`、`vitest.setup.ts`、`adapters/persistence/drivers.ts` | `W7-I1` | **合并冲突面**。W7 期间其他槽位零触碰 |
| `generate/resultSink.ts(.test)`、`generate/reconcile.ts(.test)` | `W7-I2` | 全新文件，可与 I1 并行 |
| `generate/queue.ts(.test)`、`adapters/persistence/localRepository.ts(.test)` | `W7-I2`（I1 交付后） | 五条分支都未触碰这两个文件，故移交无冲突 |
| `generate/transport/**`、`generate/endpointConfig.ts` | `W7-I3` | 全新目录 |
| `generate/adapter.ts(.test)` | `W7-I3`（I1 交付后） | |
| `scripts/scan-secrets.mjs(.test)`、`.github/workflows/ci.yml`、根 `package.json` 的 `scripts` 段、`scripts/forbidden-terms.json` | `W7-I4` | **注意**：根 `package.json` ≠ `apps/web/package.json`。本槽**不得新增依赖** |
| `domain/**`（除 `transitions.ts`） | **冻结** | 需改动：`DISPATCH.md` 申请 → 架构波裁定 |

### 5.2 W8 归属

| 路径 | 属主 | 备注 |
| --- | --- | --- |
| `generate/queue.ts`、`generate/store.ts`、`generate/controller.ts`、`generate/useGenerateController.ts` | `W8-I1` | 自 `W7-I2` 移交 |
| `export/**`、`share/**`、`routes/ExportPage.tsx` | `W8-I2` | 自 `W7-I1` 移交 |
| `domain/templates.ts`、`components/NewProjectForm.tsx`、`store/projectFactory.ts`、`routes/ProjectsPage.tsx` | `W8-I3` | |
| `adapters/images/**`、`components/FrameImagePanel.tsx`、`store/useBeatFrameImages.ts`、`store/FrameImagesProvider.tsx`、`generate/adapter.ts` | `W8-I4` | `adapter.ts` 自 `W7-I3` 移交 |
| `domain/prompt.ts`、`prompt/**` | **冻结** | 参考图在适配器层注入，组装器不该有任何 diff |

### 5.3 W9 归属

| 路径 | 属主 | 备注 |
| --- | --- | --- |
| `docs/methodology/glossary.md`、`domain/transitions.ts`、`domain/templates.ts` | `W9-I1` | 文档侧**需方法论槽位授权**；未授权则走降级方案 |
| `components/ProjectParamsPanel.tsx`、`store/useProjectEditor.ts`、`domain/projects.ts`、`routes/EditorPage.tsx` | `W9-I2` | |
| `export/**` 与 `share/**` 的组件与 a11y 测试、`src/styles.css`、`scripts/forbidden-terms.json` | `W9-I3` | 自 `W8-I2` 移交 |
| `adapters/persistence/envelope.ts(.test)`、`adapters/persistence/migrations/**`、`tests/perf/**` | `W9-I4` | |
| `adapters/indexeddb/beatboardDb.ts` | **规约 C2-DB-1 管辖** | 任何槽位改它都必须同时改版本表并说明；见 [`architecture-delta.md`](./architecture-delta.md) §2.1 |

### 5.4 本 Cycle 的撞车高危区（新增三条）

| 高危区 | 风险 | 预防 |
| --- | --- | --- |
| `apps/web/src/styles.css` | a11y（+66）与 image-store（+92）都改它，两者**互相之间**未验证过 | 合并顺序把 M3、M4 排相邻（`W7-I1`）；W9 只让 `W9-I3` 碰它 |
| `package-lock.json` | 多槽加依赖 → lock 冲突。Cycle 1 已列此项，本 Cycle 因 a11y 带了新 devDependency 而实际发生 | 依赖需求集中提给 `W7-I1`；`W7-I4` 明令不加依赖 |
| `adapters/indexeddb/beatboardDb.ts` | IndexedDB 版本号是**库级**的，两处开库必然 `VersionError` | 规约 C2-DB-1：唯一开库点；禁止任何驱动自行 `factory.open()` |

---

## 6. 阻塞项与解阻条件

| 工作项 | 阻塞原因 | 解阻条件 | 责任 | 目标波次 |
| --- | --- | --- | --- | --- |
| `W9-I1`（`纯硬切` 法源归位） | `METH-002 §5` 只列 5 项，代码目录有 6 项；差异需法源裁定 | 方法论槽位在 `METH-002 §5` 二选一裁定（补入枚举 / 改 B3 基准值） | 方法论槽位 | W9；未达则降级顺延 |
| Seedance 适配器**填实** | API 端点、鉴权、任务字段、错误码未知 | 完成 API spike 并回填 [`tech-stack.md`](../architecture/tech-stack.md) §3.3 | 对接槽 | Cycle 5（W21–25）。**Cycle 2 不受阻**：`W7-I3` 只交接口与桩件 |
| `MULTI_SHOT_JOINER` 定稿 | 多镜头提示语法未确认 | spike 验证 3 格切换效果 | 对接槽 | Cycle 5。不阻塞 |
| 客户端持有 API Key | **结构性禁止**，非未决项 | 代理服务端（Cycle 13） | — | 在代理就绪前真连**本就不该可用**，见 [`architecture-delta.md`](./architecture-delta.md) §4.3 |
| 备份包含参考图字节 | JSON 封套装不下字节 | zip 导出（要引压缩依赖，改导入导出全部签名） | 架构波 | Cycle 6。Cycle 2 走「显式排除 + 清单留痕」 |

**除 `W9-I1` 外，本 Cycle 无任务阻塞于外部裁定。** 这是 Cycle 1 架构承诺的延续：
未决项收敛为单点常量或单点实现，使实现波可以立即开工。

---

## 7. 取件顺序（给实现槽的一页速查）

```
W7:  I1 ──────────────────────────► （闸门，先行；交付后向 I2/I3 移交路径）
     I2 ─── 新文件先行 ──┐
     I3 ─── 新目录先行 ──┼─► 等 I1 交付后接线
     I4 ─── 全程独立 ────┘

W8:  I1 ← 依赖 W7-I2 + W7-I3
     I2 ← 依赖 W7-I1(M1) + W7-I2
     I3 ← 依赖 W7-I1(M2)
     I4 ← 依赖 W7-I1(M4) + W7-I3

W9:  I1 ← 阻塞于法源裁定（有降级方案）
     I2 ← 依赖 W7-I1
     I3 ← 依赖 W8-I2
     I4 ← 依赖 W7-I1(M4)

W10: 验证波，只修不加，两笔债分开记账
```
