# W1 / WK3 — 节拍板编辑 UI

- 槽位：Wave 1 / WK3（Beat Board UI）
- 分支：`cursor/wave1-wk3-beat-board-ui-1516`
- 基线：W1/WK1 脚手架 `cursor/wave1-wk1-web-scaffold-08d2` @ `a1e603ac1226ed3b6ab85c332dc8f8fcddbfcf44`
- 状态：已完成（typecheck / test / build 全绿，121 条测试）
- 依据：PRD V1.0 第 5.2 / 5.3 章与第 6 章验收；方法论 `docs/methodology/golden-5-beats.md`（METH-003）；
  架构 `docs/architecture/prompt-engine.md`、`docs/architecture/data-model.md`

## 1. 本槽位交付了什么

| 交付物 | 位置 |
|---|---|
| 节拍板编辑区（信息条 + 剧情核心 + 宫格 + 衔接 + 预览的装配） | `apps/web/src/editor/BeatBoard.tsx` |
| 编辑工作态（含参考图与结构化衔接） | `apps/web/src/editor/draft.ts` |
| 节拍信息条 | `apps/web/src/editor/BeatInfoBar.tsx` |
| 画面宫格区与单格卡（参考图投放区 + 描述） | `apps/web/src/editor/GridBoard.tsx`、`GridCellCard.tsx` |
| 组间衔接模块（6 模板 + 操作要点） | `apps/web/src/editor/TransitionPanel.tsx` |
| Prompt 实时预览（来源着色 + 待填清单 + 参数位 + 红线自检） | `apps/web/src/editor/PromptPreview.tsx` |
| 衔接模板库（封闭枚举 + 接缝规则） | `apps/web/src/domain/transitions.ts` |
| Prompt 组装器（**桩实现**，WK2 替换） | `apps/web/src/prompt/assemble.ts` |
| 格数位置锁、时间位派生、格位语义 | `apps/web/src/domain/beats.ts`（在 WK1 基础上增补） |
| 工业内业视觉（直角、分隔线、等宽数字） | `apps/web/src/styles.css` |
| 88 条新增测试 | `apps/web/src/editor/*.test.*`、`src/prompt/assemble.test.ts`、`src/domain/transitions.test.ts` |

页面结构（路由 `/p/:id`，仍在 WK1 的 `AppLayout` 三插槽里，未另开平行中枢）：

```
左导航            主区
┌──────────┐  ┌──────────────────────────────┬─────────────┐
│ B1 开篇钩子│  │ 板头（B1 · 板名 · 规格条）        │             │
│ B2 矛盾建立│  │ 信息条（板名/情绪/时间位/参数位）    │  PROMPT     │
│ B3 打压升级│  │ 剧情核心                       │  预览        │
│ B4 反转蓄力│  │ 画面宫格（3 格 / B5 两格）        │  （来源着色） │
│ B5 断集留客│  │ 组间衔接（6 模板，不参与 AI 生成）   │             │
└──────────┘  └──────────────────────────────┴─────────────┘
```

## 2. 与 WK1 的衔接（复用，未推翻）

沿用：`AppLayout` 三插槽、`BeatNav`、`Beat` / `Project` 类型、`activeCells` / `isBeatReady`、
`PROMPT_EXCLUDED_BEAT_FIELDS`、CI 与演示数据。

在 WK1 基础上补齐三处，均属 WK1 注释里明确留给 WK3 的部分：

| 改动 | 原因 |
|---|---|
| `BEAT_PRESETS` 板名改为方法论标准板名（开篇钩子 / 矛盾建立 / 打压升级 / 反转蓄力 / 断集留客） | WK1 用的是简写（钩子 / 冲突 / …）。METH-003 §1 的板名是**规格用词**，UI 与后期交接单必须同词。同步更新了引用旧名的两条断言 |
| 新增 `GRID_SIZE_BY_BEAT_INDEX` / `gridSizeForBeatIndex`，`createDefaultBeats` 按板位预填格数 | METH-003 §1：格数由板位决定（B1–B4 三格、B5 两格、全集 14 格），不由用户改 |
| 新增 `beatTimeRanges` / `episodeTotalSec` / `CELL_ROLE_HINTS` | 信息条要显示时间位，宫格要显示格位语义 |

`Beat` 与 `GridCell` 的字段集合**一字未改**，WK1 钉住字段集合的两条断言原样通过。因此：

- 参考图（架构文档的 `Frame.reference_image_key`）与结构化衔接（模板 id + 要点）暂存在
  `editor/draft.ts` 的编辑态里，随持久化槽位落库；
- `GridSize` 字段本身仍是可变的 `3 | 2`，与架构文档 §4.3 "若上游确认宫格可切换则把位置锁降级为默认值"
  的留口一致。**但 UI 不提供切换入口**，位置锁在界面上是硬的。

## 3. 硬产品规则如何被锁住

### 3.1 恒 5 板、无增删改序（AC-6.1）

左导航固定 5 项，板名以 `<output>` 只读呈现并带"锁定"标记——不是禁用的输入框，是没有输入框。
测试逐板扫描：所有按钮文案不含"新增/添加/增加/删除/上移/下移/插入/排序"，且全页无
`draggable="true"`；`editor/draft.ts` 不导出任何 `add*/insert*/remove*/delete*/reorder*/move*`。

### 3.2 格数由板位锁定（AC-6.3）

`GridBoard` 按 `gridSizeForBeatIndex(index)` 渲染，B1–B4 三格、B5 两格。
测试逐板断言格数为 `[3,3,3,3,2]`、合计 14，并断言**全页唯一的下拉是情绪基调、唯一的单选组是衔接手法**
——这条断言的作用是：任何人将来加一个"格数切换"控件都会立刻红。

每格只有两样东西：参考图投放区（可选）与白话画面描述（必填）。测试断言每格恰有 1 个文本框、
1 个 `type=file`，且占位文案恰为「这一格里发生什么、看到什么」。

### 3.3 界面无分场类专业词（AC-6.8）

逐板断言主区 `textContent` 不含 `分镜 / 故事板 / 景别 / 机位 / 运镜`，
且 `innerHTML` 不含 `storyboard / shot_list / camera_json / shot_size / focal_length` 等标识符
（属性、class、name 一并覆盖，防止"文案干净但 DOM 里带着"）。

### 3.4 衔接绝不进 AI（AC-6.4，L5）

四层，其中前两层是**结构性**的：

1. **类型层**：组装器的输入 `BeatAssembleView` 只有 `index / summary / tone / durationSec / cells /
   referenceImageKeys`。`name / transition / note` 不在里面，组装器够不着。
2. **投影层**：`toAssembleView` 是唯一投影点，默认不投影新字段。将来给 `Beat` 加字段，默认不进 Prompt。
3. **运行时**：`assertNoRedline` 校验片段来源只有 `project | beat | frame`、全文与片段一致、
   被排除字段未产生同文片段。编辑页每次组装都跑，结果显示为面板上的"红线自检"。
4. **测试层**：选中模板 + 填写要点后断言预览文本既不含模板名也不含要点；伪造 `transition` 来源的片段
   与篡改全文都被断言拦下；另有一条断言 `assemble.ts` **不 import 衔接模块**。

同文冲突按架构文档 §3.3 处理：用户把衔接原文也写进画面描述时，主判据（来源）仍通过，
只由 `redlineWarnings` 出一条告警提示，不拦提交——引导而非强拦截。

衔接模块界面上明示「不参与 AI 生成」，并标注 B5 无接缝（接缝挂在上一板，第 5 板之后是下一集）。

### 3.5 所见即所发（AC-6.7，L7）

`result.text` 由 `result.segments` 拼接派生，不独立构造。面板渲染 `segments`、提交发送 `text`，
同源即不可能不一致。系统注入的画质稳定词也在面板里可见——不存在"用户看不见却发出去"的内容。

## 4. 组间衔接模板库

| 模板 | id | 操作要点 |
|---|---|---|
| 音频预接 | `audio_prelap` | 下一段的声音提前 0.3–0.5 秒进入，画面还没切 |
| 螺口顺滑过渡 | `screw_smooth` | 前后画面找同构元素咬合，位置与运动方向对齐 |
| 卡点硬切 | `beat_sync_cut` | 踩在音乐重音上硬切，前后各留 1 帧余量 |
| BGM升调截断 | `bgm_pitch_cut` | BGM 升调把情绪推上去，到顶点直接截断 |
| 黑屏断钩子 | `black_cut_hook` | 黑场 2–4 帧截断，悬念留在黑屏之后 |
| 纯硬切 | `pure_hard_cut` | 不做任何修饰，画面与声音同时切换 |

枚举封闭，模块不导出任何 `add*/register*/create*`。接缝数 = 4，`seamOf(5) === null`。

默认值取 METH-003 §8：B1 音频预接、B2 卡点硬切、B3 纯硬切、B4 BGM升调截断。
方法论原文 B4→B5 为"卡点硬切 + BGM 升调"，在封闭枚举内取 `bgm_pitch_cut`（升调推情绪并截断）。

## 5. Prompt 组装器是桩实现（交接面）

`apps/web/src/prompt/assemble.ts`，`ENGINE_VERSION = 'stub-w1-wk3'`。签名即交接面，WK2 替换实现即可，
编辑页不需要改动：

```ts
export function toAssembleView(beat: Beat, referenceImageKeys?: readonly string[]): BeatAssembleView;
export function toPrefixInput(project: Project): PrefixInput;
export function assemble(input: AssembleInput): AssembleResult;
export function assertNoRedline(result: AssembleResult, beat: Beat): void;
export function redlineWarnings(result: AssembleResult, beat: Beat): readonly AssembleWarning[];
```

已实现：三段顺序（固定前缀 → 节拍语义 → 宫格时序）、来源标注与着色、`MULTI_SHOT_JOINER` 单点化、
情绪与画幅的枚举→文案映射、参数位（时长 / 画幅 / seed / 参考图键）与文本分离、红线断言。

与正式引擎的**已知差异**，请 WK2 收口：

1. **空字段不抛错**。桩实现把空字段计入 `missing` 让面板能边填边看；架构文档要求组装器遇空描述抛错。
   建议 WK2 保留 `missing` 用于预览，另给一个提交前的严格入口。
2. **缺 `pace`（镜头节奏）槽位**。架构文档的 `AiParam` 有 `mood / duration_sec / pace`，WK1 的 `Beat`
   只有 `tone / durationSec`。加 `pace` 会改动被 WK1 断言钉住的字段集合，本槽位不擅自改，
   留给数据模型对齐时一并处理。届时 ② 段补一个 `节拍·节奏` 片段即可。
3. **`MULTI_SHOT_JOINER = ' → '` 待 API spike 确认**（架构文档 §1.2 未决项）。全引擎只此一处。
4. **无快照**。`freezeSnapshot` 属生成提交路径，本槽位未涉及。

## 6. 视觉：工业内业控制台

刻意不做落地页观感：直角（`--radius: 2px`）、细分隔线、石墨/钢灰调、单点强调色、
大写小字号栏目标签、等宽等宽数字（时长/时间位/字数），无渐变、无光晕、无胶囊按钮、无大字标语。
字段权限用方形标签直接标在字段上——`进 PROMPT`（绿）/ `参数位`（蓝）/ `不参与 AI 生成`（琥珀）/ `锁定`，
Prompt 面板的三色（项目蓝 / 节拍绿 / 宫格橙）与架构文档 §4.1 的来源着色表一致。
判断依据很简单：这是给人一天用八小时的作业界面，字段权限必须一眼可读，密度比留白重要。

## 7. 明确不在本槽位范围内

- 正式 Prompt 引擎与快照（`engine_version` 递增、`freezeSnapshot`）→ WK2
- 持久化与自动保存（PRD 5.2.5）：编辑态目前是内存态，刷新即丢；参考图存 object URL → 数据/API 槽位
- 生成队列与状态机（5.4）、成片播放/下载（5.5.2–5.5.4）→ 后续槽位
- 项目创建/编辑表单（5.1.1）→ 未涉及，仍用 `data/demoProjects.ts`
- `pace` 字段与 `Beat` 字段集合对齐 → 见 §5.2
- 本槽位只新增 `docs/work/w1-wk3-ui.md` 一个文档，未改动 `docs/prd/**`、`docs/methodology/**`、
  `docs/architecture/**`；未改动 CI 配置；未删除或放宽任何既有测试

## 8. 验证

```bash
npm ci
npm run typecheck   # tsc --noEmit，无错误
npm test            # Vitest：7 个文件 / 121 条测试全部通过（WK1 基线 33 条全部保留并通过）
npm run build       # 生产构建通过
```

测试分布：

| 文件 | 条数 | 关注点 |
|---|---|---|
| `src/editor/BeatBoard.test.tsx` | 32 | 格数锁、无增删改序、无分场词、情绪可改、衔接不进预览、实时组装 |
| `src/prompt/assemble.test.ts` | 29 | 三段顺序、前缀一致、参数位不入文本、衔接隔离四层、未填清单 |
| `src/domain/beats.test.ts` | 25 | WK1 原有 18 条 + 格数位置锁、时间位、格位语义 |
| `src/editor/draft.test.ts` | 11 | 铸造格数、编辑不越界、回落领域模型不渗字段 |
| `src/domain/transitions.test.ts` | 9 | 6 模板封闭枚举、接缝规则、方法论默认值 |
| `src/App.test.tsx` | 12 | WK1 原有（板名断言随标准板名更新） |
| `src/domain/projects.test.ts` | 3 | WK1 原有 |
