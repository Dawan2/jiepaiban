# W2 / INTEGRATE — WK1 + WK2 + WK3 整合

- 文档编号：`WORK-W2-INTEGRATE`
- 归属：Wave 2 / Slot W2-INTEGRATE
- 分支：`cursor/w2-integrate-7738`，基线为 `main` @ `09e11fd`

---

## 1. 合入范围

| 来源 | 分支 | SHA | 角色 |
| --- | --- | --- | --- |
| WK1 | `cursor/wave1-wk1-web-scaffold-08d2` | `a1e603a` | 工作区脚手架、布局壳、三条路由 |
| WK2 | `cursor/wave1-wk2-domain-core-7777` | `e030f04` | **领域字段名与结构锁的法源** |
| WK3 | `cursor/wave1-wk3-beat-board-ui-1516` | `523536d` | **编辑页 chrome 的法源** |
| P1 | `cursor/wave1-p1-methodology-canon-94f3` | `b2d57b6` | `docs/methodology/**` |
| P1 | `cursor/wave1-p1-architecture-35c5` | `1c3e454` | `docs/architecture/00-product-architecture.md`、`docs/handoff/**` |
| P2 | `cursor/wave1-p2-prd-canon-ce77` | `bc2a4cc` | `docs/prd/**`（5 份） |
| P3 | `cursor/wave1-p3-prd-backlog-162d` | `30ed9cf` | `docs/prd/prd-seedance-tool.md`、`backlog-and-acceptance.md`、`handoff/**` |
| P3 | `cursor/wave1-p3-architecture-backlog-344b` | `282ada4` | `docs/architecture/**`、`docs/backlog/**` |

WK2 与 WK3 都以 WK1 为基线，因此 WK1 是二者的共同祖先，代码整合实际上是 WK2 ⊕ WK3 的两路合并。

### 未合入

| 分支 | 原因 |
| --- | --- |
| `cursor/wave1-wk3-data-api-arch-bdfb` | 不在本槽位的 WK1/WK2/WK3 + P1/P2/P3 清单内；且它的 `docs/architecture/data-model.md` 与 P3 的同名文件是两份独立稿，合并需要人来裁定哪份是法源，不属于「straightforward」。 |
| `W2-store` / `W2-prompt-gen` | 远端不存在，按指令跳过。 |

---

## 2. 裁决原则

1. **领域字段名、结构锁、Prompt 公式 → WK2**。WK3 的领域改动是在 WK1 的临时模型上做的，WK2 落地 canon 之后即被取代。
2. **编辑页的视觉布局、DOM 结构、className、文案 → WK3**，逐字保留；只把它读写的字段名换成 WK2 的。
3. 两边都成立、互不矛盾的能力**取并集**，不做二选一。

---

## 3. 冲突清单与处置

### 3.1 `git merge` 报告的 6 个文件冲突

| 文件 | 冲突性质 | 处置 |
| --- | --- | --- |
| `domain/beats.ts` | WK2 重写为 canon 骨架（snake_case、运行时锁），WK3 在 WK1 模型上加了宫格位置锁与时间位 | 取 WK2 全文；WK3 的 UI 支撑项按 WK2 命名补入（见 3.2） |
| `domain/beats.test.ts` | 同上 | 取 WK2 全文；WK3 新增的 4 组断言按 WK2 命名移植（见 3.2） |
| `domain/transitions.ts` | add/add：WK2 是封闭目录（`code`/`rule`/`note`），WK3 是模板库（`id`/`label`/`hint`）+ 接缝助手 | 合成一份：WK2 的目录结构 + WK3 的 `hint` 与接缝助手（见 3.3） |
| `domain/transitions.test.ts` | add/add | 两套断言合并为一份，WK3 侧的符号名改为 WK2 命名 |
| `components/BeatNav.tsx` | WK2 直接吃 `Beat`，WK3 抽出了 `BeatNavItem` 视图接口并加了 `meta` 行 | 取 WK3（编辑页 chrome） |
| `routes/EditorPage.tsx` | WK2 是只读占位页，WK3 是装配好的编辑页 | 取 WK3，字段名改为 WK2 命名 |

### 3.2 `beats.ts`：WK3 能力按 WK2 命名移植

| WK3 符号 | 本分支符号 | 说明 |
| --- | --- | --- |
| `GRID_SIZE_BY_BEAT_INDEX` | `FRAME_COUNT_BY_BEAT_INDEX` | WK2 已有 `frameCountFor()`，这里补查表形式 |
| `TOTAL_GRID_CELL_COUNT` | `TOTAL_FRAME_COUNT` | 由 `BEAT_DEFS` 求和推出，不写字面量 14 |
| `CELL_ROLE_HINTS` / `cellRoleHint` | `FRAME_ROLE_HINTS` / `frameRoleHint` | B1 三项与 WK2 的 `frame_semantics`（impact/reaction/env）一一对应，有测试断言 |
| `beatTimeRanges` / `episodeTotalSec` | `BEAT_TIME_RANGES` / `beatTimeRange` / `sumBeatDurations` | **语义变更，见 4.1** |
| — | `createBeat(index)` | 新增。让编辑态回落时铸出单独一块锁死的板，不必建满 5 块再丢掉 4 块；板序越界抛错，不构成增删节拍入口 |

### 3.3 `transitions.ts`：合成一份封闭目录

- 目录项从 WK2 的 `{code, rule, note}` 扩为 `{code, rule, note, hint}`：`note` 是一句话释义（WK2），`hint` 是给做后期合成的人读的操作要点（WK3）。
- 枚举 id 统一用 WK2 的 `TransitionCode`（`BLACK_CUT_HOOK`），弃用 WK3 的 `TransitionMethodId`（`black_cut_hook`）。
- 保留 WK3 的接缝语义：`TRANSITION_SEAM_COUNT`、`hasTransitionSeam`、`seamOf`、`CANON_TRANSITION_BY_BEAT_INDEX`、`canonTransitionFor`。
- **循环依赖**：WK2 的 `beats.ts` 在运行时依赖 `transitions.ts` 的 `isTransitionRule`。WK3 的 `transitions.ts` 反过来 `import { BEAT_COUNT } from './beats'` 并在模块顶层求值 `BEAT_COUNT - 1`，两边一合就是 TDZ 死锁。处置：`transitions.ts` 对 `beats.ts` 只做 type-only 导入，`TRANSITION_SEAM_COUNT` 写字面量 `4`，并由 `transitions.test.ts` 断言它等于 `BEAT_COUNT - 1`、`CANON_TRANSITION_BY_BEAT_INDEX` 与 `BEAT_DEFS[i].transition_rule` 逐项一致。

### 3.4 桩组装器 → WK2 `assemblePrompt`

WK3 的 `src/prompt/assemble.ts` 是自带公式的桩实现（`ENGINE_VERSION = 'stub-w1-wk3'`）。本分支删掉它的组装逻辑，改为领域层 `domain/prompt.ts` 的**视图适配层**：

- 片段一律来自 `buildPromptSegments()`，本模块不再自己拼任何文案；
- 领域层把 5 板帧拼成一个片段，适配层按帧序拆回逐格片段（供面板着色），用的是同一份 `frames` 与同一个 ` → ` 连接符；
- 补片段尾部连接符，使 `text === segments.map(s => s.text).join('')`（L7 所见即所发）；
- 汇总 `missing` / `params` / `warnings` 供 UI 的「待填 / 就绪」与参数区使用。

**新增守卫**：`assemble(...).text` 必须与 `assemblePrompt(project, beat)` **逐字符相同**，5 块板逐一断言，另加一条字段残缺时的断言。适配层若哪天偷偷改了文案，测试立刻红。

`ENGINE_VERSION` 从 `'stub-w1-wk3'` 改为 `'domain-wk2-1'`。

WK3 的类型级排除（组装视图里根本没有被排除字段）予以保留，并**上移到领域层**：`domain/prompt.ts` 新增 `PromptProjectView` / `PromptBeatView` 两个 `Pick<>` 视图类型作为组装器入参。`Project` / `Beat` 都可直接赋值，WK2 原有调用与测试不受影响；但编辑层从此在类型上就递不进 `title` / `transition_rule` / `note`。

---

## 4. 语义级冲突（两边都自洽，必须选一个）

### 4.1 时间位：canon 规格 vs 时长派生

- WK3：`beatTimeRanges()` 由各拍 `durationSec` 累加得出，改时长即移动时间位；信息条标注「派生」。
- WK2：`time_start` / `time_end` 是 `BEAT_DEFS` 的 canon 值（0-8 / 8-25 / 25-45 / 45-70 / 70-88），且属于 `LOCKED_BEAT_FIELDS`，运行时不可写。

**裁决：WK2。** 时间位是 METH-003 §1 的规格列，不是派生值。信息条的标签从「派生」改为「锁定」，`duration_sec` 仍可编辑（≤30s），二者的偏差通过板头「整集 `N`s / 88s」显示，不回写时间位。

受影响的测试改为 canon 值（`0–8s` / `8–25s`），并新增一条「改时长不会移动 canon 时间位」。

### 4.2 时长是否进 Prompt 文本

- WK3：时长只走参数位，断言 `text` 不含 `'时长'`。
- WK2：`时长N秒` 进文本**且**进参数位，`prompt.test.ts` 有「时长按板序取 canon 值并进入文本」逐板断言。

**裁决：WK2**（METH-003 §2 组装样例进文本，PRD 5.3.2 要求参数位，两者不互斥）。WK3 侧两条相关断言改为「既进文本也进参数位」。这不是红线条目——AC-6.4 的硬排除清单是衔接 / 板名 / 备注，不含时长。

### 4.3 情绪基调：枚举 vs 自由文本

- WK3：`EmotionTone` 是 7 项联合类型，`TONE_PROMPT_TEXT` 把它映射成整句描写再进 Prompt。
- WK2：`emotion` 是自由文本，`EMOTION_PRESETS` 只是 UI 快速起手；组装器直接读 `emotion`。

**裁决：两者兼容，不必取舍。** WK2 的注释本就写明「METH-003 的组装样例用的是整句情绪描写；预设只作为 UI 的快速起手」。映射表下沉到编辑层（`editor/draft.ts` 的 `EMOTION_PRESET_TEXT`），选中预设即把整句写进 `emotion`——进 Prompt 的始终是 `emotion` 本身，不存在「预设值」与「Prompt 文案」两套东西。`emotionPresetOf()` 负责下拉回显。

### 4.4 红线自检：来源判据 vs 子串判据

- WK2 `assertPromptClean()`：被排除字段的内容只要作为子串出现在全文里就抛错。
- WK3 `assertNoRedline()`：判**来源**——被排除字段不得产生片段；子串命中降级为告警。

**裁决：两者并存，各管各的层。** 领域层保留 `assertPromptClean()` 原样（组装器自测用，`prompt.test.ts` 未改动）；编辑页用 `assertNoRedline()` 做阻断判据、`redlineWarnings()` 出告警。理由：用户完全可能把衔接标准词一字不差写进画面描述，此时内容合法、来源合法，子串判据在编辑页上是误报。告警文案改为覆盖全部三个被排除字段，警告码 `transition_text_in_cell` → `excluded_text_in_frame`。

### 4.5 衔接落到哪个字段

WK3 把「模板名：操作要点」拼成一段文本塞进 WK1 的 `beat.transition`。WK2 把它拆成 `transition_rule`（封闭枚举）与 `note`（自由文本），二者都在硬排除清单里。**裁决：WK2**，编辑态的 `transition_rule` / `transition_note` 分别回落到这两个字段。

### 4.6 编辑态回落的实现方式

WK3 的 `draftToBeat()` 手工拼一个 `Beat` 字面量，恒补齐 3 格。这在 WK2 下会绕过全部运行时锁。改为 `createBeat(draft.index)` 先铸出锁死的板、再写入可编辑字段：宫格数、帧序、时间位、板序全部带着 WK2 的运行时锁回来。新增测试「编辑态即便被篡改，回落时也拿不到第 3 格」。

---

## 5. 字段改名对照（编辑层）

| WK1/WK3 | 本分支 |
| --- | --- |
| `Beat.name` | `Beat.title` |
| `Beat.summary` | `Beat.plot_core` |
| `Beat.tone` | `Beat.emotion`（自由文本） |
| `Beat.durationSec` | `Beat.duration_sec` |
| `Beat.gridSize` | `Beat.frame_count` |
| `Beat.cells[].description` | `Beat.frames[].text` |
| `Beat.transition` | `Beat.transition_rule` + `Beat.note` |
| `Project.beats` | `Project.beat_list` |
| `Project.stylePrompt` / `aspectRatio` / `episodeDurationSec` | `style_prompt` / `aspect_ratio` / `total_duration_sec` |
| `CellDraft` / `CellImage` | `FrameDraft` / `FrameImage` |
| `updateCellDescription` / `updateCellImage` / `cellFillProgress` | `updateFrameText` / `updateFrameImage` / `frameFillProgress` |

编辑页新增了 `camera_rhythm`（镜头节奏）输入框——WK2 的 `isBeatReady()` 要求它，WK1/WK3 的模型里没有这个字段，UI 也就没有入口。它放在「剧情核心」面板内，仍是 textarea，不新增下拉框（`combobox` 数量断言仍为 1）。

---

## 6. 结果

| 项 | 值 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | **207 passed / 9 files** |
| `npm run build` | 通过 |

测试分布：`beats` 34、`locks` 24、`prompt`（领域）16、`projects` 12、`transitions` 16、`assemble`（适配层）43、`draft` 17、`BeatBoard` 33、`App` 12。

WK2 与 WK3 的红线测试全部保留：WK2 的 `locks.test.ts`（24 条反向解锁断言）与 `prompt.test.ts`（AC-6.4 自动化断言）**逐字未改**；WK3 的 `BeatBoard.test.tsx` 33 条 UI 红线除 4.1 / 4.2 两处语义裁决外全部保留原断言。

---

## 7. 剩余缺口

1. **持久化缺位**：`demoProjects` 仍是内存演示数据，编辑态改动刷新即丢。`useBeatBoard` 的 `useState` 初值只在挂载时读一次项目，编辑结果也没写回 `Project`。
2. **参考图只在内存里**：`FrameImage.preview_url` 是 object URL，未落任何存储，`reference_image_keys` 目前只是拼出来的字符串。
3. **生成链路未接**：「生成本拍」「生成全集」两个按钮是 `disabled`。领域层的 `buildGenerateRequest()` 已就绪但没有调用方。
4. **`data-model.md` 双稿未裁定**：P3 的 `docs/architecture/data-model.md` 与未合入的 `cursor/wave1-wk3-data-api-arch-bdfb` 同名文件是两份独立稿，需要人裁定法源归属；同理 `docs/prd/prd.md`（P2）与 `docs/prd/prd-seedance-tool.md`（P3）是两份 PRD，本次按各自路径并存，未做合稿。
5. **文档未回写整合结果**：`docs/work/w1-wk3-ui.md` 仍在描述桩组装器与 `gridSize` 等旧命名。本文件是整合记录，未按指令改写各槽位原始交付文档。
6. **`docs/DISPATCH.md` 无 W2 段**：本次只按三份原始回执的「小节追加」约定合并了 P1/P2/P3 三段，未替它们新增 W2 段落。
7. **无 lint**：仓库只有 `typecheck` / `test` / `build`，没有 ESLint 配置，CI 也没有 lint 步骤。
