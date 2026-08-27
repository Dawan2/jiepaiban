# 波次计划（Wave Plan）— 80 波

> 槽位：Wave 1 / Cycle 1 / **P3**
> 状态：**v1.0 基线**，配套 [`ready-queue.md`](./ready-queue.md)（就绪队列与文件归属）
> 架构依据：[`../architecture/system-architecture.md`](../architecture/system-architecture.md)

## 0. 波次节律（Cadence）

80 个波次编为 **16 个 Cycle，每 Cycle 5 波**，按波号取模排布：

| 条件 | 波次类型 | 职责 | 产出物 |
| --- | --- | --- | --- |
| `Wn % 5 == 1` | **架构波（Arch）** | 定本 Cycle 的方案、契约、接口与拆解；更新受影响的架构文档；把未决项收敛为单点常量 | `docs/architecture/**` 增改、本 Cycle 的 ready-queue 刷新 |
| `Wn % 5 ∈ {2,3,4}` | **实现波（Impl）** | 按架构波的拆解并行实现，每波自带单测 | `src/**`、`tests/**` |
| `Wn % 5 == 0` | **验证波（Verify）** | 集成、E2E、红线闸门、性能与回归；只修不加 | `e2e/**`、缺陷修复、Cycle 验收报告 |

Cycle *c* 覆盖波次 `5c-4 … 5c`。例：Cycle 1 = W1–W5，Cycle 16 = W76–W80。

### 0.1 各类波次的硬性规则

1. **实现波不改架构**。发现架构缺陷时记入 `DISPATCH.md`，由下一个架构波处理；紧急情况允许"最小修补 + 立即登记"，但不得静默偏离。
2. **验证波不加新功能**。只做集成、测试、修缺陷。验证波结束时 `pnpm verify` 必须全绿，否则该 Cycle 不算完成，缺口顺延进下一 Cycle 的架构波重排。
3. **每个实现波自带测试**。"下一波补测试"是禁止项——验证波是**集成与红线**的场所，不是补单测的欠债窗口。
4. **红线闸门（L1–L7）在每个验证波全量跑**，不因 Cycle 主题无关而跳过。锁的价值在于它从不例外。

### 0.2 并行槽位与防撞车

每个实现波内并行 3–4 个槽位（`Wn-P1` … `Wn-P4`）。**槽位之间以文件归属划界**：同一波内任一文件只能有一个属主槽位，跨槽位的共享文件必须在架构波先行定稿。归属表见 [`ready-queue.md`](./ready-queue.md) §3。

---

## 1. 80 波总览

### V1.0：核心闭环与交付（Cycle 1–9，W1–W45）

| Cycle | 波次 | 主题 | Cycle 出口判据 |
| --- | --- | --- | --- |
| **1** | W1–W5 | **地基与领域内核**：工程脚手架、CI 闸门、领域类型与锁、Prompt 组装引擎、本地仓储、编辑页骨架 | 能创建项目→自动 5 板 14 格→填字段→看到实时 Prompt→刷新不丢；L1/L2/L3/L4/L5/L7 红线测试全绿 |
| **2** | W6–W10 | **生成队列（Fake Provider）**：Provider 端口、任务状态机、队列驱动、重试退避、快照冻结、状态回显 | 用 FakeProvider 跑通单发/批量/失败重试/重启续跑；队列集成测试全绿 |
| **3** | W11–W15 | **成片页与交付**：5 段卡、逐段下载、顺序连播、衔接清单、交付包导出 | 5 段全成功后成片页齐备、可播可下载；4 条衔接规则完整呈现 |
| **4** | W16–W20 | **项目页与生命周期**：项目列表、新建弹窗、重命名/删除、进度点阵、导入导出 JSON | 多项目管理闭环；导出再导入数据等价（往返测试） |
| **5** | W21–W25 | **Seedance 2.5 真连**：API spike 收敛、适配器填实、错误码映射、多镜头语法定稿、限流与并发调优 | 真实 API 端到端出片；五类错误归类可复现；`MULTI_SHOT_JOINER` 定稿 |
| **6** | W26–W30 | **资产与参考图**：宫格参考图上传、Blob 存储、缩略图、视频本地缓存、容量治理 | 图生视频路径可用；容量超限有明确降级策略 |
| **7** | W31–W35 | **历史·回滚·成本**：节拍生成历史、快照只读视图、设为当前段、成本估算与项目级汇总 | AC-6.9 可溯；回滚只改指针不丢历史；成本误差可度量 |
| **8** | W36–W40 | **打磨与无障碍**：引导与空态、错误条与建议动作、键盘导航、焦点联动高亮、文案统一 | 交互规范（PRD §12）逐条对账通过 |
| **9** | W41–W45 | **V1.0 加固与发布**：故障注入、性能达标、数据迁移演练、发布物与使用文档 | 全量 AC-6.1…6.9 通过；V1.0 可交付 |

### V1.1：题材模板与一键拼接（Cycle 10–12，W46–W60）

| Cycle | 波次 | 主题 | Cycle 出口判据 |
| --- | --- | --- | --- |
| **10** | W46–W50 | **题材模板库**：模板数据结构、套用即预填 5 板、模板管理 | 套用模板后 5 板剧情核心/风格词预填；**结构锁不受模板影响** |
| **11** | W51–W55 | **一键拼接**：拼接引擎、衔接手法到转场的映射、导出单支 MP4 | 成片页拼接按钮解锁；衔接字段**仅作转场参考，仍不进 Prompt**（L5 不变） |
| **12** | W56–W60 | **V1.1 加固与发布** | V1.1 全量回归；L1–L7 未被 V1.1 削弱 |

### V1.2：服务端演进与协作（Cycle 13–15，W61–W75）

| Cycle | 波次 | 主题 | Cycle 出口判据 |
| --- | --- | --- | --- |
| **13** | W61–W65 | **最小代理服务端**：Key 服务端保管、签名 URL、`ProjectRepository` HTTP 实现 | PRD NFR"Key 不落客户端"达成；**领域层与组装器零改动**（架构承诺兑现） |
| **14** | W66–W70 | **托管持久化与账号**：账号体系、云端项目、跨设备同步与冲突策略 | 换设备数据一致；本地形态仍可离线使用 |
| **15** | W71–W75 | **协作**：成员、角色权限、评论与通知 | 多人编辑同一项目不互相破坏 |

### 收尾（Cycle 16，W76–W80）

| Cycle | 波次 | 主题 | Cycle 出口判据 |
| --- | --- | --- | --- |
| **16** | W76–W80 | **全量回归、文档收口、技术债清偿、下一路线图** | 全部红线与 AC 回归通过；架构文档与实现零漂移 |

> **排布原则**：Cycle 1–2 先做**最高杠杆且零外部依赖**的部分（领域锁 + 组装器 + 队列跑在 Fake 上），把 Seedance 真连推迟到 Cycle 5。这样 API 不确定性不会阻塞前四个 Cycle 的产出，而真连时状态机、快照、错误处理的骨架已被充分测试过。

---

## 2. Cycle 1 详细计划

**Cycle 1 目标（一句话）**：从空仓库到"能创建项目、填满 5 板 14 格、看到实时组装的 Prompt、刷新不丢"，且六条红线已有自动化闸门。

**W1（架构波，已完成）**：本文档族 —— `system-architecture.md`、`data-model.md`、`tech-stack.md`、`prompt-engine.md`、`wave-plan.md`、`ready-queue.md`。

---

### W2（实现波）：工程地基与领域内核

> 主线：让"锁"从文档变成**可编译、可运行、可 CI 阻断**的代码。W2 结束时仓库还没有 UI，但已经无法写出 6 个节拍的代码。

#### W2-P1 · 工程脚手架与 CI 闸门

| 项 | 内容 |
| --- | --- |
| 文件归属 | `package.json`、`pnpm-lock.yaml`、`vite.config.ts`、`tsconfig.json`、`tsconfig.node.json`、`.eslintrc.cjs`、`.prettierrc`、`.nvmrc`、`.gitignore`、`playwright.config.ts`、`vitest.config.ts`、`.github/workflows/ci.yml`、`index.html`、`src/main.tsx`、`src/App.tsx`（占位） |
| 任务 | 1) `pnpm create vite` 骨架（react-ts）；2) `tsconfig` 开 `strict` + `noUncheckedIndexedAccess`；3) ESLint 加 `no-restricted-imports`：`src/domain/**` 与 `src/prompt/**` 禁 import react/存储/网络；4) 脚本 `dev/build/typecheck/lint/test/test:e2e/check:terms/verify`；5) CI 五道闸门串跑 `pnpm verify` |
| DoD | `pnpm verify` 在空实现下通过；CI 在 PR 上运行并可阻断；`src/domain` 误 import React 时 lint 报错（含反例测试） |
| 依赖 | 无（本波第一个开工项，其余槽位在其骨架上工作） |

#### W2-P2 · 领域类型与锁常量

| 项 | 内容 |
| --- | --- |
| 文件归属 | `src/domain/types.ts`、`src/domain/locks.ts`、`src/domain/ids.ts`、`src/domain/errors.ts` |
| 任务 | 严格按 [`data-model.md`](../architecture/data-model.md) §2–§4 落地：品牌 ID、`BeatTuple`、`FrameList`（3\|2 联合元组）、`FRAME_COUNT_BY_INDEX`（`satisfies` 保护）、`BEAT_ROLE_BY_INDEX`、`MAX_BEAT_DURATION_SEC`、`makeDurationSec`、`LockViolation` 错误类型、`PROMPT_EXCLUDED_FIELDS` |
| DoD | 类型层反例测试（`expectTypeOf` / `@ts-expect-error`）：写 6 元素 `beat_list`、写 4 格 `frame_list`、给 `index` 赋值——三者**均编译失败**；`makeDurationSec(31)` 抛 `LockViolation` |
| 依赖 | W2-P1 的 tsconfig |

#### W2-P3 · 工厂与锁断言

| 项 | 内容 |
| --- | --- |
| 文件归属 | `src/domain/factory.ts`、`src/domain/assert.ts`、`src/domain/readiness.ts` |
| 任务 | `createProject` 一次性铸造 1 项目 + 5 板 + 14 格 + 4 条衔接；时长按 `min(round(target/5), 30)` 预填；`assertLocks` 覆盖 `data-model.md` §6 全部断言；`readiness` 返回缺失项清单（**不含** transition/memo） |
| DoD | 单测：铸造结果 `beat_list.length===5`、Σ frames===14、B5 两格且 `transition===null`、B1–4 `seam` 与板位匹配；`assertLocks` 对每类畸形数据各有一个失败用例；`src/domain/**` 覆盖率 ≥95% |
| 依赖 | W2-P2 |

#### W2-P4 · L4 禁用词扫描

| 项 | 内容 |
| --- | --- |
| 文件归属 | `scripts/check-forbidden-terms.mjs`、`tests/redlines/L4-no-storyboard.test.ts` |
| 任务 | 按 [`data-model.md`](../architecture/data-model.md) §8 词表扫描 `src/**` 与 `e2e/**`；白名单 `docs/**` 与脚本自身；输出命中文件与行号；接入 `pnpm verify` |
| DoD | 植入一个含 `camera_move` 的临时文件时 CI 失败（反例测试自动化）；正常仓库 0 命中 |
| 依赖 | W2-P1 |

**W2 出口判据**：`pnpm verify` 全绿；结构锁 L1/L2、时长锁 L3、无分镜锁 L4 已有自动化闸门；仓库仍无 UI，但**非法结构已不可表示**。

---

### W3（实现波）：Prompt 组装引擎与本地持久化

> 主线：把最高杠杆模块（组装器）与"刷新不丢"（仓储）做完。二者互不依赖，可完全并行。

#### W3-P1 · 组装引擎核心

| 项 | 内容 |
| --- | --- |
| 文件归属 | `src/prompt/assemble.ts`、`src/prompt/prefix.ts`、`src/prompt/segments.ts`、`src/prompt/constants.ts` |
| 任务 | 按 [`prompt-engine.md`](../architecture/prompt-engine.md) §1–§4 实现：`BeatAssembleView`、`toAssembleView`（唯一投影点）、`buildPrefix`/`buildBeatSegments`/`buildFrameSegments`、`text = segments.join('')`、`MULTI_SHOT_JOINER` 单点常量、`MOOD_PROMPT_TEXT`/`PACE_PROMPT_TEXT`/`ASPECT_PROMPT_TEXT` 映射表、`engine_version = '1.0.0'` |
| DoD | 顺序快照测试；5 板前缀逐字符一致测试；B5 仅 2 个 frame 片段；空描述抛错；时长不出现在 `text`；`src/prompt/**` 覆盖率 ≥95% |
| 依赖 | W2-P2、W2-P3 |

#### W3-P2 · 红线断言与属性测试（L5 / L7）

| 项 | 内容 |
| --- | --- |
| 文件归属 | `src/prompt/redlines.ts`、`tests/redlines/L5-transition-excluded.test.ts`、`tests/redlines/L7-wysiwyg.test.ts`、`tests/redlines/L1-beat-count.test.ts`、`tests/redlines/L2-frame-shape.test.ts`、`tests/redlines/L3-duration.test.ts` |
| 任务 | `assertNoRedline`（主判据=来源、辅判据=子串降级告警，见 `prompt-engine.md` §3.3）；引入 `fast-check` 写属性测试：随机 `name`/`memo`/`transition`（含 unicode、超长、与描述同文）→ 无被排除来源片段 |
| DoD | 属性测试 ≥1000 次采样通过；同文冲突场景产出 `warning` 而非 `error`；六条红线测试全部接入 `pnpm verify` |
| 依赖 | W3-P1（接口先行约定，可与之并行开工） |

#### W3-P3 · 本地仓储与迁移框架

| 项 | 内容 |
| --- | --- |
| 文件归属 | `src/adapters/persistence/repository.ts`（端口）、`src/adapters/persistence/local.ts`、`src/adapters/persistence/envelope.ts`、`src/adapters/persistence/migrations.ts` |
| 任务 | IndexedDB（`idb`）建库与 7 个 store（`tech-stack.md` §2.1）；`PersistedEnvelope` + `SCHEMA_VERSION=1` + 空迁移链；读回后立即 `assertLocks`；`exportAll`/`importAll` |
| DoD | `fake-indexeddb` 下往返测试：save→load 深度相等；导出→清库→导入后数据等价；写入畸形数据被 `assertLocks` 拦截并进入修复流；迁移链缺口检测有单测 |
| 依赖 | W2-P3 |

#### W3-P4 · 应用状态骨架与自动保存

| 项 | 内容 |
| --- | --- |
| 文件归属 | `src/state/store.ts`、`src/state/commands.ts`、`src/state/autosave.ts`、`src/state/selectors.ts` |
| 任务 | Zustand store（`projects` / `activeProjectId` / `activeBeatIndex` / `ui`）；命令 `createProject`/`updateBeatField`/`updateFrame`/`setTransition`；2s 防抖自动保存 + 强制 flush（导航切换、`beforeunload`）；选择器 `selectAssembled`（`useMemo` 缓存） |
| DoD | 假时钟测试：连续变更只落一次库；flush 在切换前完成；保存失败阻断切换并置错误态；store 可在 Node 环境直接实例化（无 React 依赖） |
| 依赖 | W3-P3（端口签名，可先按接口开工） |

**W3 出口判据**：Prompt 可被组装且六条红线全部有闸门；数据能持久化并在读回时被锁校验；应用层命令可在无 UI 情况下被集成测试驱动。

---

### W4（实现波）：编辑页骨架

> 主线：把 W2/W3 的能力接上界面。UI **只渲染与调命令**，不含任何业务规则。

#### W4-P1 · 应用外壳与路由

| 项 | 内容 |
| --- | --- |
| 文件归属 | `src/App.tsx`、`src/ui/routes/router.tsx`、`src/ui/routes/EditorPage.tsx`、`src/ui/layout/AppShell.tsx`、`src/ui/styles/tokens.css` |
| 任务 | 三条路由（`/`、`/p/:id`、`/p/:id/delivery`，后两页本波仅编辑页有内容）；页面锁布局＝左导航 + 顶栏 + 主编辑区；设计令牌（色板/间距/字号）定义 |
| DoD | 路由表**仅三条**并有测试断言；最低视口 1280px 布局不破；`AppShell` 快照测试 |
| 依赖 | W2-P1 |

#### W4-P2 · 左导航（固定 5 项）与节拍卡

| 项 | 内容 |
| --- | --- |
| 文件归属 | `src/ui/components/BeatNav.tsx`、`src/ui/components/BeatCard.tsx`、`src/ui/components/MoodSelect.tsx`、`src/ui/components/DurationInput.tsx` |
| 任务 | 固定 5 项导航 + 五态状态点（未填/已填/生成中/已生成/失败）；`↑/↓` 键切换；切换前触发保存 flush；节拍卡字段（名称/剧情核心/情绪/节奏/时长/衔接/备注），衔接输入框旁常驻灰字 **"仅供人读，不进入 AI"** |
| DoD | 组件测试：导航恒 5 项且**无增删按钮**；切换触发 flush；时长输入 >30 即时报错（L3）；衔接提示文案存在 |
| 依赖 | W3-P4、W4-P1 |

#### W4-P3 · 宫格区（3/3/3/3/2）

| 项 | 内容 |
| --- | --- |
| 文件归属 | `src/ui/components/FrameGrid.tsx`、`src/ui/components/FrameCell.tsx` |
| 任务 | 按 `frame_list` 长度渲染 3 或 2 格，左→右固定序；每格一个白话描述输入 + 参考图占位（上传能力留到 Cycle 6）；**无任何增删格、拖拽、镜头字段** |
| DoD | 组件测试：B1–4 渲染 3 格、B5 渲染 2 格；DOM 中无拖拽属性、无增删控件；禁用词扫描对本目录 0 命中（L4） |
| 依赖 | W4-P1 |

#### W4-P4 · Prompt 实时面板

| 项 | 内容 |
| --- | --- |
| 文件归属 | `src/ui/components/PromptPanel.tsx`、`src/ui/components/SegmentChip.tsx`、`src/ui/hooks/useAssembledPrompt.ts` |
| 任务 | 渲染 `AssembleResult.segments`（三色来源标注）、复制全文按钮 + toast、字段获焦时对应片段高亮、`warnings` 展示（如"疑似衔接内容混入画面描述"） |
| DoD | 组件测试：面板**渲染 `segments`** 而非自行拼串；无 `transition` 来源片段；字段变更到面板更新 <500ms（性能测试）；复制内容 === `result.text`（L7） |
| 依赖 | W3-P1、W3-P4 |

**W4 出口判据**：可在浏览器里创建项目、在 5 板 14 格间切换、填写字段、看到带来源着色的实时 Prompt、刷新页面数据仍在。

---

### W5（验证波）：Cycle 1 集成与红线闸门

| 项 | 内容 |
| --- | --- |
| 文件归属 | `e2e/**`、`tests/integration/**`、缺陷修复（跨文件，需在 `DISPATCH.md` 登记） |
| 任务 | 1) E2E 主流程：新建项目→自动 5 板→填满 14 格→面板正确→刷新保持；2) **L4 全站扫描**：遍历三条路由的 DOM 文本 + 路由表，断言无分镜类文案与入口；3) **L7 端到端**：面板 DOM 文本与 `assemble()` 输出逐字符相等（本波尚无真实请求，Cycle 2 补请求体比对）；4) 性能：编辑页首屏可交互 ≤2s、面板刷新 ≤500ms；5) 迁移演练：v1 封套读写；6) 覆盖率与闸门核对 |
| DoD | `pnpm verify` 全绿；六条红线闸门在 CI 中生效；AC-6.1/6.2/6.3/6.5 通过；Cycle 1 验收报告写入 `DISPATCH.md` |
| 不做 | 任何新功能；队列与生成（Cycle 2） |

---

## 3. Cycle 2–3 前瞻（供实现槽预读，细化留给各自架构波）

- **W6（架构波）**：Provider 端口定稿、任务状态机迁移表、队列驱动与并发/退避策略、重启恢复语义（重放模型）；
- **W7–W9（实现波）**：`FakeProvider` + 队列驱动 + 快照冻结 / 单发与批量提交 + 就绪拦截 + 生成中锁编辑 / 队列页与状态回显；
- **W10（验证波）**：队列可靠性（AC-6.6）、重启续跑、**L7 请求体比对补全**、错误归类五类可复现；
- **W11（架构波）**：成片页与交付包结构、下载命名规则、衔接清单呈现。

---

## 4. 度量

每个验证波产出一份 Cycle 报告（写入 `DISPATCH.md`），固定包含：

| 指标 | 口径 |
| --- | --- |
| 红线闸门状态 | L1–L7 各自的测试通过情况（**任一失败 = Cycle 未完成**） |
| 覆盖率 | `src/domain/**`、`src/prompt/**` ≥95% 行覆盖；全仓 ≥80% |
| AC 对账 | 本 Cycle 涉及的 AC-6.x 逐条通过/未通过 |
| 架构漂移 | 实现与架构文档的差异条目数（**目标 0**，非 0 则列出并指派下一架构波处理） |
| 顺延项 | 未完成任务及其顺延目标波次 |
