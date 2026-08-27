# 就绪队列（Ready Queue）

> 槽位：Wave 1 / Cycle 1 / **P3**
> 状态：**v1.0 基线**，随每个架构波刷新
> 配套：[`wave-plan.md`](./wave-plan.md)（波次节律）、[`../architecture/`](../architecture/)（实现契约）

## 0. 队列语义

| 概念 | 定义 |
| --- | --- |
| **就绪（Ready）** | 三个条件同时满足：① 依赖项已完成或其接口已定稿；② 有明确的实现契约（架构文档段落号）；③ 文件归属已分配且无冲突 |
| **阻塞（Blocked）** | 依赖未就绪，或存在未决的外部知识（如 API spike）。阻塞项列出**解阻条件**与**解阻责任槽** |
| **属主槽（Owner）** | 唯一有权创建/修改该组文件的槽位。跨属主修改必须先在 `DISPATCH.md` 申请移交 |
| **优先级** | `P0` 阻塞他人 / `P1` 关键路径 / `P2` 可并行 / `P3` 可顺延 |

**取件规则**：从 §1 表格自上而下取第一个 `就绪` 且属主为本槽的项；同一波内不得跨槽取件；取件后在 `DISPATCH.md` 登记开工。

---

## 1. 就绪队列（按优先级排序）

### W2 波（当前可立即开工）

| # | 优先级 | 工作项 | 属主槽 | 状态 | 契约 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **P0** | 工程脚手架与 CI 五闸门 | `W2-P1` | **就绪** | `tech-stack.md` §1、§5 | — |
| 2 | **P0** | 领域类型与锁常量（`BeatTuple`、`FrameList`、锁表） | `W2-P2` | **就绪** | `data-model.md` §2–§4 | #1（tsconfig） |
| 3 | **P1** | 工厂 `createProject` + `assertLocks` + `readiness` | `W2-P3` | **就绪** | `data-model.md` §5–§6 | #2 |
| 4 | **P1** | L4 禁用词扫描脚本 + 反例测试 | `W2-P4` | **就绪** | `data-model.md` §8 | #1 |

> #1 是全队列唯一的真正瓶颈：它交付前，其余槽位只能写"纸面接口"。建议 #1 用最小配置**先合一次**（`package.json` + `tsconfig` + 空 `verify`），把 CI 细节留在同波次的第二个提交里，尽早解阻 #2–#4。

### W3 波

| # | 优先级 | 工作项 | 属主槽 | 状态 | 契约 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | **P0** | Prompt 组装引擎核心（前缀 + 片段 + 顺序） | `W3-P1` | 待 #2/#3 | `prompt-engine.md` §1–§4 | #2、#3 |
| 6 | **P0** | 红线断言 `assertNoRedline` + 六条红线测试 | `W3-P2` | 待 #5 接口 | `prompt-engine.md` §3、§7 | #5（接口先行可并行） |
| 7 | **P1** | 本地仓储 + 封套 + 迁移框架 | `W3-P3` | 待 #3 | `tech-stack.md` §2、`data-model.md` §7 | #3 |
| 8 | **P1** | Store + 命令 + 防抖自动保存 | `W3-P4` | 待 #7 签名 | `system-architecture.md` §3.2、§5 | #7（接口先行可并行） |

### W4 波

| # | 优先级 | 工作项 | 属主槽 | 状态 | 契约 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| 9 | **P1** | 应用外壳 + 三条路由 + 设计令牌 | `W4-P1` | 待 #1 | `system-architecture.md` §4 | #1 |
| 10 | **P1** | 左导航（固定 5 项）+ 节拍卡 | `W4-P2` | 待 #8、#9 | PRD §5.2、§11.2 | #8、#9 |
| 11 | **P2** | 宫格区 3/3/3/3/2 | `W4-P3` | 待 #9 | `data-model.md` §4.3 | #9 |
| 12 | **P1** | Prompt 实时面板（来源着色 + 复制） | `W4-P4` | 待 #5、#8 | `prompt-engine.md` §4 | #5、#8 |

### W5 波（验证）

| # | 优先级 | 工作项 | 属主槽 | 状态 | 契约 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| 13 | **P0** | E2E 主流程 + L4 全站扫描 + L7 文本一致性 | `W5-V1` | 待 W4 完成 | `wave-plan.md` §2 W5 | #9–#12 |
| 14 | **P1** | 性能测试（首屏 ≤2s、面板 ≤500ms）与迁移演练 | `W5-V2` | 待 W4 完成 | `tech-stack.md` §4 | #7、#12 |

---

## 2. 阻塞项与解阻条件

| 工作项 | 阻塞原因 | 解阻条件 | 解阻责任 | 目标波次 |
| --- | --- | --- | --- | --- |
| Seedance 适配器**填实**（网络调用） | API 端点、鉴权、任务字段、错误码未知 | 完成 API spike 并回填 `tech-stack.md` §3.3 映射表 | 对接槽 | Cycle 5（W21–25） |
| `MULTI_SHOT_JOINER` 定稿 | 多镜头提示语法未确认 | spike 验证 3 格切换效果，比较候选分隔符 | 对接槽 | Cycle 5 |
| 固定前缀最终文案 | "漫剧厚涂、8K、五官稳定"是否定稿待确认 | 源稿责任人确认 | 产品槽 | 不阻塞（当前值可用，改文案不改结构） |
| 宫格是否可节拍级切换 3↔2 | PRD 与 P1 架构口径不一 | 源稿责任人裁定 | 产品槽 | 不阻塞（见 §5 应对） |
| 单板 30s 是否为 API 硬上限 | 未验证 | API spike | 对接槽 | 不阻塞（30s 已作为硬锁） |

**这五项均不阻塞 W2–W4**：每一项都已在架构中被隔离为单点常量或可放松的不变量。`FakeProvider` 使 Cycle 2 的队列工作同样不受阻。

---

## 3. 文件归属表（防撞车）

**规则**：表中每一行的路径**只能由属主槽创建与修改**。同一波内不存在共享属主的路径。需要跨属主修改时，在 `DISPATCH.md` 提出移交并等待确认——**不得先改后说**。

### 3.1 W2 归属

| 路径 | 属主 | 备注 |
| --- | --- | --- |
| `package.json`、`pnpm-lock.yaml`、`tsconfig*.json`、`vite.config.ts`、`vitest.config.ts`、`playwright.config.ts` | `W2-P1` | **高频冲突区**：新增依赖一律经 W2-P1；其他槽把需求提在 `DISPATCH.md`，由 P1 批量落地 |
| `.eslintrc.cjs`、`.prettierrc`、`.nvmrc`、`.gitignore`、`.github/workflows/**` | `W2-P1` | |
| `index.html`、`src/main.tsx` | `W2-P1` | `src/App.tsx` 在 W2 为占位，**W4 起移交 `W4-P1`** |
| `src/domain/types.ts`、`src/domain/locks.ts`、`src/domain/ids.ts`、`src/domain/errors.ts` | `W2-P2` | 唯一事实源；**W3 起冻结**，变更需架构波批准 |
| `src/domain/factory.ts`、`src/domain/assert.ts`、`src/domain/readiness.ts` | `W2-P3` | |
| `scripts/check-forbidden-terms.mjs`、`tests/redlines/L4-*.test.ts` | `W2-P4` | |
| `tests/domain/**` | `W2-P2`（types 相关）/ `W2-P3`（factory 相关） | 按被测文件的属主划分，**测试跟随实现** |

### 3.2 W3 归属

| 路径 | 属主 | 备注 |
| --- | --- | --- |
| `src/prompt/assemble.ts`、`prefix.ts`、`segments.ts`、`constants.ts` | `W3-P1` | `constants.ts` 含 `MULTI_SHOT_JOINER` 等待定值 |
| `src/prompt/redlines.ts`、`tests/redlines/L1|L2|L3|L5|L7-*.test.ts` | `W3-P2` | L4 仍属 `W2-P4` |
| `tests/prompt/**` | `W3-P1` | 红线类测试除外（归 `W3-P2`） |
| `src/adapters/persistence/**` | `W3-P3` | 含端口 `repository.ts` |
| `src/state/**` | `W3-P4` | |
| `src/domain/**` | **冻结** | 如需改动：`DISPATCH.md` 申请 → 原属主执行 |

### 3.3 W4 归属

| 路径 | 属主 | 备注 |
| --- | --- | --- |
| `src/App.tsx`、`src/ui/routes/**`、`src/ui/layout/**`、`src/ui/styles/**` | `W4-P1` | 路由表是**三页锁**执行点 |
| `src/ui/components/BeatNav.tsx`、`BeatCard.tsx`、`MoodSelect.tsx`、`DurationInput.tsx` | `W4-P2` | |
| `src/ui/components/FrameGrid.tsx`、`FrameCell.tsx` | `W4-P3` | |
| `src/ui/components/PromptPanel.tsx`、`SegmentChip.tsx`、`src/ui/hooks/useAssembledPrompt.ts` | `W4-P4` | |
| `src/prompt/**`、`src/domain/**`、`src/state/**` | **冻结** | W4 是**纯 UI 波**；UI 若"需要改领域层"，几乎总是把业务规则写进了 UI —— 先复核设计 |

### 3.4 W5 归属

| 路径 | 属主 | 备注 |
| --- | --- | --- |
| `e2e/**` | `W5-V1` | |
| `tests/integration/**`、性能基线文件 | `W5-V2` | |
| 全仓（仅缺陷修复） | 验证槽 | 每次跨属主修复必须在 `DISPATCH.md` 登记：文件、原因、原属主 |

### 3.5 文档归属（长期有效）

| 路径 | 属主 |
| --- | --- |
| `docs/architecture/**` | 架构波槽位（W1、W6、W11…）；实现槽**只读** |
| `docs/backlog/**` | 架构波槽位 |
| `docs/prd/**` | 产品槽 |
| `docs/handoff/**` | 各槽自己的交接文件 |
| `docs/DISPATCH.md` | **分段共有**：每槽只改自己的段落，禁止改他人段落 |

---

## 4. 撞车高危区与预防

| 高危区 | 风险 | 预防 |
| --- | --- | --- |
| `package.json` | 多槽同时加依赖 → 锁文件冲突 | 依赖需求集中提给 `W2-P1` 批量落地；本波内其他槽**不动**该文件 |
| `src/domain/types.ts` | 人人都想加字段 | W2 后冻结；加字段必须经架构波，并同步 `data-model.md` |
| `src/prompt/constants.ts` | 待定值多，容易被"顺手改" | 值变更须同步更新快照测试基线并在 `DISPATCH.md` 记录 |
| `tests/redlines/**` | 修红线测试来"修复"失败 | **红线测试失败 = 实现有问题**；改红线测试须架构波批准，PR 描述需说明为何锁失效 |
| `docs/DISPATCH.md` | 并发追加冲突 | 分段落所有制；只追加不重排 |

> 最后一行是纪律要点：**红线测试是资产，不是障碍。** 出现"改测试让 CI 变绿"的提交时，应视为该 Cycle 的严重缺陷并在验收报告中记名。

---

## 5. 未决项的应对（不阻塞实现）

| 未决项 | 当前取值 | 若裁定相反的改动范围 |
| --- | --- | --- |
| 宫格可否节拍级切换 3↔2 | 固定 3/3/3/3/2 | `FRAME_COUNT_BY_INDEX` 由不变量降级为默认值 + 放松 `assertFrameShape` + 新增 `Beat.frame_draft`；**`FrameList` 类型不变**（本就是 3\|2 联合），组装器不变 |
| 多镜头连接符 | `' → '` | 改 `src/prompt/constants.ts` 一行 + 更新快照基线 |
| 固定前缀文案 | 源稿三要素 | 改项目级默认值，结构不变 |
| 30s 是否硬上限 | 硬锁 30s | 若更宽松则改 `MAX_BEAT_DURATION_SEC` 一个常量；若更严格同理 |
| 是否需要服务端 | 本地优先 | 换 `ProjectRepository` 实现 + 新增代理服务；领域层与组装器**零改动**（见 `system-architecture.md` §7） |

每一项的"改动范围"都被刻意压缩到**一个常量、一个实现或一个不变量**。这是本轮架构的核心交付价值：**在源稿与 API 均有不确定性的前提下，让实现波可以立即开工而不必等待裁定。**
