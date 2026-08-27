# DISPATCH（Cycle 2）—— 波次调度与交付回执

> **为什么是一个新文件。** 根目录的 [`docs/DISPATCH.md`](../DISPATCH.md) 已被 Wave 1 的
> P1 / P2 / P3 三个槽位分节写过，且当前有 **5 条未合流分支**（见
> [`risks.md`](./risks.md) §2）都可能带着自己的 DISPATCH 小节参与合并。
> 再往那个文件里追加第四节，等于给本已存在的合并面添一处冲突。
>
> 因此 Cycle 2 起的回执写在本文件，按 **PLAN SLOT** 分节，体例与根 DISPATCH 一致
> （每槽只写自己的小节，禁止改他人小节）。根 DISPATCH 的 Wave 1 小节**未被触碰**。

---

## W6 — Wave 6/80 · Cycle 2 架构波

### 交付回执（Receipt）

| 项 | 值 |
| --- | --- |
| 波次 Wave | **6 / 80** |
| 槽位 Slot | **W6**（`PLAN SLOT W6`） |
| 周期 Cycle | **2 architecture**（Cycle 2 = W6–W10） |
| 模型 Model | `claude-opus-5-thinking-high` |
| 分支 Branch | `cursor/w6-cycle2-architecture-b5b9` |
| 基线 Base | `main` @ `09e11fd` |
| 勘察对象 Surveyed | `cursor/w3-integrate-store-gen-c1f5` @ `8ffe44ff36e421235989d646323f6b4a9ac3c86b` |
| 架构文档提交 SHA | `4076c5166771d8b3042d7ee54479c8a338a76d05` |
| 回执提交 SHA | 本提交（见 §「提交链」） |
| 状态 | **已完成（docs-only，无 PR，仅 commit + push）** |

**基线选择说明**：本槽位基于 `main` 而非 `8ffe44f`。理由是路径互斥——
基于 `main` 时本分支只含 `docs/cycle2/**` 四个新增文件，与任何应用分支、任何
文档分支**零路径重叠**，合流时不可能冲突。文档内对 `docs/architecture/**`、
`docs/work/**`、`docs/backlog/**` 的相对链接在合入应用分支后即可解析
（Wave 1 的 P2 槽位采用了同一做法）。

### 交付文件（File List）

| 路径 | 编号 | 内容 | 状态 |
| --- | --- | --- | --- |
| [`docs/cycle2/architecture-delta.md`](./architecture-delta.md) | `ARCH-C2-DELTA` | 勘察结论（W5 缺席 / Cycle 2 主题重排 / 五分支库存与实测冲突面）+ 四条架构增量 + 明确不变项 + 待回写的架构文档清单 | 新增 |
| [`docs/cycle2/ready-queue.md`](./ready-queue.md) | `ARCH-C2-QUEUE` | W7–W9 共 12 个槽位任务（契约 / 路径归属 / 任务 / DoD / 依赖 / 不做）+ 三张文件归属表 + 撞车高危区 + 阻塞项 + 取件顺序图 | 新增 |
| [`docs/cycle2/risks.md`](./risks.md) | `ARCH-C2-RISKS` | 6 条风险，每条五段（现象 / 为什么危险 / 触发条件 / 处置 / 判据）+ 既有风险对账 | 新增 |
| `docs/cycle2/DISPATCH.md` | — | 本回执（仅 W6 小节） | 新增 |

**路径纪律**：本槽位只写 `docs/cycle2/**`。**未触碰** `docs/DISPATCH.md`、
`docs/architecture/**`、`docs/backlog/**`、`docs/prd/**`、`docs/methodology/**`、
`docs/work/**`，以及任何 `apps/` 下的应用代码。

### 勘察实测（Findings，全部可复核）

派单要求读 `8ffe44f` 与 W5 验证文档。实测结果：

| # | 发现 | 复核命令 |
| --- | --- | --- |
| F1 | **W5 验证波不存在**。远端 20 条分支无 W5 槽位分支，无 Cycle 1 验收报告 | `git branch -r` |
| F2 | **Cycle 2 原定主题（生成队列 / Fake Provider）已在 W2/W3 落地**（`generate/**` 87 条测试、状态机四态、幂等键、拦截链均在位），唯缺原判据中的「重启续跑」 | `git ls-tree -r 8ffe44f -- apps/web/src/generate` |
| F3 | **`w4-feishu-export-925d` 严格包含 `wave2-w2-export-ca31`**（线性后继，`export/**` 仅差 2 文件）→ 不单独合 ca31 | `git merge-base --is-ancestor origin/cursor/wave2-w2-export-ca31 origin/cursor/w4-feishu-export-925d` |
| F4 | **`w4-image-store-8321` 写在已被取代的 WK1 领域模型上**，但耦合面只有 `frameImageKey.ts` 的 `gridSizeForBeat`（3 处调用） | 逐文件符号扫描（见 `architecture-delta.md` §0.3） |
| F5 | **`export/**` 与 `share/**` 已在 WK2 规范模型上**（base `a8f6f26` 即 prompt-generate 槽位），无需重构 | 同上 |
| F6 | **925d 唯一真实断点是 `ExportPage.tsx` 读已被删除的 `data/demoProjects`** —— 类型断裂而非文本冲突 | 全分支 import 扫描 |
| F7 | **实测冲突面共 8 个文件**：925d(1) / templates(2) / a11y(2) / image-store(3) | 四次 `git merge --no-commit --no-ff` 试合后 `git diff --diff-filter=U` |
| F8 | **`image-store` 已把 `beatboard` 单库开库集中化**并把 `DB_VERSION` 升到 2，而 `SCHEMA_VERSION` 仍为 1 —— 两个版本号语义不同 | `git show origin/cursor/w4-image-store-8321:apps/web/src/adapters/indexeddb/beatboardDb.ts` |

> 试合仅用于**测量**冲突面，在临时 worktree 中进行，全部 `--abort` 并已 `git worktree remove`。
> 本槽位没有产生任何合并提交。

### 本波裁定（Rulings）

| # | 裁定 | 依据 |
| --- | --- | --- |
| D1 | **不追认 Cycle 1 完成**；W5 的六项验证债并入 W10 并**与 Cycle 2 分开记账** | `wave-plan.md` §0.1 第 2 条 |
| D2 | **Cycle 2 主题重排**为「收敛分叉 + 补齐落库链路 + 为真连准备接口」；原判据欠项「重启续跑」进 W8 | F2 |
| D3 | 生成成功经 **`GenerateResultSink` 端口直写仓储**；编辑页退出落库链路。字段所有权分离（可编辑字段归草稿 / 生成期字段归 sink），草稿落盘前重读生成期字段 | `delta` §1 |
| D4 | **`Frame.reference_image_key` 不进落库结构** —— 图片坐标可由五节拍锁与宫格锁完全推导，加字段会引入三种不一致态；**推论：Cycle 2 结束时 `SCHEMA_VERSION` 仍应为 1** | `delta` §2.3 |
| D5 | 备份封套**显式排除**图片字节，改为「数量 + 字节数」清单留痕 + 导入时明确提示；zip 导出推迟到 Cycle 6 | `delta` §2.4 |
| D6 | **合并顺序 M1→M4**（925d → templates → a11y → image-store）；**不单独合 ca31**；`styles.css` 的两个改动者相邻合并 | F3、F7 |
| D7 | 传输层拆为 **`submit` + `poll`**，保留单发形态并提供 `fromOneShot` 兼容层，使既有 87 条生成测试零改动 | `delta` §4.2 |
| D8 | **`SeedanceEndpointConfig` 无任何密钥字段**；适配器不读环境变量；`baseUrl` 空则回落桩件；**产物扫描**是唯一能兜住「图省事」的闸门 | `delta` §4.3 |
| D9 | **规约 C2-DB-1**：`beatboard` 的 `DB_VERSION` 与 store 清单只在 `adapters/indexeddb/beatboardDb.ts` 声明，禁止任何驱动自行 `factory.open()` | F8 |
| D10 | **规约 C2-DB-2**：改 `DB_VERSION` 不得顺手改 `SCHEMA_VERSION`，反之亦然；同时改必须分别说明理由 | `risks` §3 |
| D11 | **实现槽不得自行裁定法源**。`纯硬切` 的枚举归属由方法论槽位裁定；未达则执行降级（保留 `pending_canon` 并顺延） | `risks` §1 |

### 就绪队列摘要（Ready Queue Summary）

完整表（含契约段落号、DoD、不做项）见 [`ready-queue.md`](./ready-queue.md)。

**W7 — 收敛分叉 + 落库链路**

| 槽位 | 优先级 | 任务 | 路径归属（摘要） | 依赖 |
| --- | --- | --- | --- | --- |
| `W7-I1` | **P0 闸门** | 四次合并 M1→M4 | 8 个冲突文件 + 重定向点（**唯一允许跨路径的槽**） | 无，本波先行 |
| `W7-I2` | **P0** | 生成结果 sink + 启动对账 | `generate/resultSink.*`、`generate/reconcile.*`（新）；I1 后接管 `generate/queue.ts`、`localRepository.ts` | 新文件部分无依赖 |
| `W7-I3` | P1 | Seedance 传输层 v2 + 无密钥配置 | `generate/transport/**`、`generate/endpointConfig.ts`（新）；I1 后接管 `adapter.ts` | 新目录部分无依赖 |
| `W7-I4` | P1 | 无密钥源码扫描 + **产物扫描** | `scripts/scan-secrets.*`、`ci.yml`、根 `package.json` 的 `scripts` 段 | 无（**不得加依赖**） |

**W8 — 贯通三条断链**

| 槽位 | 优先级 | 任务 | 依赖 |
| --- | --- | --- | --- |
| `W8-I1` | **P0** | 队列接轮询 + 重启续跑 + 取值优先级（项目记录 > 任务表） | `W7-I2`、`W7-I3` |
| `W8-I2` | P1 | 成片页与飞书导出改读本地仓储；`pending_canon` 加待确认标注 | `W7-I1`(M1)、`W7-I2` |
| `W8-I3` | P1 | 模板套用进新建流程（骨架仍由 `BEAT_DEFS` 推导） | `W7-I1`(M2) |
| `W8-I4` | P2 | 参考图进提交体（只带坐标与哈希）+ 配额呈现 + 备份清单 | `W7-I1`(M4)、`W7-I3` |

**W9 — 补齐红线与法源缺口**

| 槽位 | 优先级 | 任务 | 依赖 |
| --- | --- | --- | --- |
| `W9-I1` | **P0** | `纯硬切` 法源归位（补入枚举 / 改基准值二选一） | **阻塞于方法论槽位裁定**；有降级方案 |
| `W9-I2` | P1 | RULE-5 整集时长阻断 + 项目级字段编辑入口 | `W7-I1` |
| `W9-I3` | P2 | 无障碍覆盖成片页与飞书面板；收窄禁用词豁免面 | `W8-I2` |
| `W9-I4` | P1 | 迁移链演练（让「拒绝静默丢数据」先被执行一次）+ 性能基线 | `W7-I1`(M4) |

**W10（验证波）**：两笔债分开记账 —— Cycle 1 的六项（E2E / L4 全站 / L7 逐字符 /
性能 / 迁移演练 / 覆盖率）与 Cycle 2 的五项（队列可靠性含重启续跑 / **L7 请求体比对补全** /
错误五类 / 无密钥产物扫描 / 图片容量降级）。只修不加。

### 风险摘要（Risk Summary）

| # | 风险 | 等级 | 关闭判据（**不是「会注意」，是可核查的东西**） |
| --- | --- | --- | --- |
| 1 | `纯硬切`：代码目录 6 项，`METH-002 §5` 法源 5 项 | **R-高** | 存在一条测试断言 `TRANSITION_CATALOG` 取值集合与 `METH-002 §5` **完全相等**。`pending_canon` 是记账，不是修复 |
| 2 | 分支分叉：约 9600 行成果分散在 3 个 merge-base 上 | **R-高** | 短期：无含未合流实现的分支。长期：新分支的 merge-base 必须是当前最好的应用分支（写进派单模板） |
| 3 | `SCHEMA_VERSION` 迁移链**从未执行过一次** | **R-高** | ① 缺口检测分支有测试**执行**过；② 有测试断言两个版本号互相独立；③ `schema.ts` 与 `beatboardDb.ts` 文件头互相指向 |
| 4 | 生成任务表在封套之外（`localStorage` 与 IndexedDB 不同寿） | R-中 | 清空 `localStorage` 后已生成项目仍显示「已生成」 |
| 5 | Cycle 1 验证波从未召开 | R-中 | W10 报告两张表分列，每项标注欠了几个波次 |
| 6 | 「先加个 Key 跑通」（`VITE_` 变量会进 bundle，泄漏不可逆） | R-中 | 产物扫描**有反例测试**（无反例测试的扫描器在正则写错时会永远静默通过） |

### 与其他分支的关系（Cross-branch Notes）

| 分支 | 关系 |
| --- | --- |
| `cursor/w3-integrate-store-gen-c1f5` @ `8ffe44f` | **勘察对象**。本波的全部增量以它为起点；其[遗留缺口 7 条](../work/w3-integrate-store-gen.md)被逐条指派（#1→`W7-I2`、#2→`W8-I2`、#3→`W7-I1`(M4)+`W8-I4`、#4/#5→`W9-I2`、#6→`W9-I4`、#7→保留运行时保护） |
| `cursor/w4-feishu-export-925d` @ `82f4845` | 合并 **M1**。严格包含 `wave2-w2-export-ca31` |
| `cursor/wave2-w2-export-ca31` @ `c92ce40` | **不单独合并**（被 M1 包含）。单独合会制造库存里本不存在的 `ExportView.tsx` 冲突 |
| `cursor/w3-templates-golden-library-e98c` @ `21ae263` | 合并 **M2**。其 `pending_canon` 设计被本波采纳为风险 #1 的记账手段 |
| `cursor/w4-a11y-6861` @ `d24127d` | 合并 **M3**。带入 `dom-accessibility-api` devDependency，lock 归 `W7-I1` |
| `cursor/w4-image-store-8321` @ `3d4b5af` | 合并 **M4**。其 blob 仓与单库集中开库结构被本波**整体采纳**并升格为规约 C2-DB-1 |
| 根 `docs/DISPATCH.md` | **未触碰**。Wave 1 的 P1/P2/P3 小节原样保留；Cycle 2 起的回执在本文件 |

### 提交链（Commit Chain）

| 提交 | 内容 |
| --- | --- |
| `4076c5166771d8b3042d7ee54479c8a338a76d05` | `architecture-delta.md` + `ready-queue.md` + `risks.md` |
| 本提交 | `docs/cycle2/DISPATCH.md`（W6 回执） |

### 下一步

- **W7 立即可开工**：`W7-I1` 是瓶颈（性质同 Cycle 1 的 `W2-P1` 脚手架），
  其余三槽的路径都刻意选成新增文件 / 新增目录，可与 I1 并行起步。
- **W11（下一个架构波）应处理**：把本 Cycle 的增量回写进 `docs/architecture/**`
  （清单见 [`architecture-delta.md`](./architecture-delta.md) §6）、Cycle 3 的成片页与交付包结构、
  以及 `W9-I1` 若顺延则重排法源裁定。
- **本波未做也不该做**：任何应用代码、任何 `docs/architecture/**` 回写
  （合流完成前改会制造第六个冲突面）、任何合并提交。

---

<!-- 后续槽位请在本行下方追加自己的小节，勿修改上方小节。 -->
