# W3 / TEMPLATES — 黄金五板模板库（数据层）

- 文档编号：`WORK-W3-TEMPLATES`
- 归属：Wave 3 / Slot TEMPLATES / cycle W3 impl
- 分支：`cursor/w3-templates-golden-library-e98c`
- 基线：`cursor/wave2-w2-prompt-generate-c608` @ `a8f6f26`
  （该分支是 `cursor/wave1-wk2-domain-core-7777` @ `e030f04` 的严格后继，
  取它是因为「Prompt 不含衔接」这条验收需要 W2 的组装器与生成请求体已在位）
- 上游法源：[`docs/methodology/golden-5-beats.md`](../methodology/golden-5-beats.md)（METH-003
  §0 标注约定、§1 整集总览、§3–§7 五板样板、§8 组间衔接总表、§9 模板库落地要求）、
  [`docs/methodology/glossary.md`](../methodology/glossary.md)（METH-002 §5 组间衔接枚举）

---

## 1. 交付物

本槽位交的是**数据，不是 UI**。没有新增页面、组件或样式——编辑页 CSS 有在飞的整合任务，
本槽位一行没碰。

| 文件 | 职责 |
| --- | --- |
| `apps/web/src/domain/templates.ts` | 模板库数据、`createProjectFromTemplate`、模板自检 |
| `apps/web/src/domain/templates.test.ts` | 37 条测试（88s 窗口 / 宫格数 / 衔接不进 Prompt / 文案 GOLDEN） |
| `apps/web/src/domain/transitions.ts` | 目录项新增 `canon_source` / `pending_canon` / `pending_canon_reason` |
| `apps/web/src/domain/transitions.test.ts` | 新增 6 条待批取值测试（8 → 14 条） |
| `apps/web/src/domain/index.ts` | 领域层出口加挂 `./templates` |

全量：13 个测试文件、245 条测试（基线 202 条，本槽位 +43），
`typecheck` / `test` / `test:terms` / `lint:terms` / `build` 全过。

---

## 2. 分层：CANON 骨架不在模板里重新声明

METH-003 §0 把该文档明确切成两类，**权重不同**：【CANON】规格（时间位 / 时长 / 宫格数 /
帧语义 / 组间衔接）与【示例】文案（情绪 / 节奏 / 剧情核心 / 帧描述）。模板库照这条线分层：

- **骨架层不落在本模块。** 模板板的 `index` / `beat_type` / `g_index` / `name` /
  `time_start` / `time_end` / `duration_sec` / `frame_count` / `transition_rule`
  一律由 `beatDef()` 从 `BEAT_DEFS` 读出来，模板数据里只写【示例】文案。
- 模板对象上仍**带着**这些骨架字段，但它们是**冗余副本**（让模板数据自解释、便于 WK3 直接
  序列化给 API），`validateTemplate` 逐字段断言副本与 `BEAT_DEFS` 相等。

这一条是本槽位最重要的设计决定。模板库天然是「结构锁的后门」——一旦模板自己声明
`frame_count: 3`、自己声明时间位，产品就有了第二个骨架法源，两处迟早不一致，
而不一致的那一天，红线是从模板这边漏的。所以模板库**没有能力**定义骨架，只能复述骨架，
复述错了立刻变红。

---

## 3. 模板内容：宴会钻戒故事

标识 `banquet-hook`，一套，`DEFAULT_TEMPLATE_ID` 指向它。

| 板 | 节拍 | G | 时间位 | 时长 | 宫格 | 组间衔接（枚举值） | METH-003 §8 原文 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | 开篇钩子 | G1 | 0–8s | 8s | 3 | `音频预接` | 音频预接 |
| B2 | 矛盾建立 | G2 | 8–25s | 17s | 3 | `卡点硬切` | 卡点硬切 |
| B3 | 打压升级 | G3 | 25–45s | 20s | 3 | `纯硬切` | 纯硬切 |
| B4 | 反转蓄力 | G4 | 45–70s | 25s | 3 | `BGM升调截断` | 卡点硬切 + BGM 升调 |
| B5 | 断集留客 | G5 | 70–88s | 18s | 2 | `黑屏断钩子` | 无转场，黑屏截断 |

整集 88s（落在 70–90s 区间），最长单板 25s（≤ 30s 上限），帧描述共 14 条。

项目级默认值：项目名 `婚宴钻戒反转`、题材 `都市·复仇`、画幅 `9:16`、整集 88s、
画风 `冷调高对比，胶片颗粒质感，强逆光`、主角 `长发女主，米白抹胸礼服，左颊有疤`。
这几项是 PRD 5.1.1 的强制字段，模板一次性给齐，套用后 `isNewProjectValid` 直接为真。

### 3.1 故事口径：钻戒，不是鉴定报告

METH-003 §3–§7 的【示例】文案里，砸在主桌上的东西是「亲子鉴定报告」。本槽位统一改写为
**母亲遗物钻戒**，理由是本仓库既有的黄金回归用例（`apps/web/src/testing/goldens.ts`
的 `BEAT1_SAMPLE`，W2 槽位落地）已经采了钻戒写法，其备注还写明「戒指是女主母亲的遗物，
第四板要回收」。两处若各讲一个故事，谁是样板就说不清了。

因此本模板的 B1 文案与 `BEAT1_SAMPLE` **逐字一致**，B2–B5 沿用 METH-003 的
情绪 / 节奏 / 帧描述骨干，只把故事支点换成钻戒并按备注在 B4 收回：

- B4「势能积累」= 母亲遗物钻戒的原主证明与录音在手
- B5「抛出悬念」= 当众亮出钻戒原主证明

`templates.test.ts` 有一条断言把 B1 的 Prompt 全文钉成手写字面量，与
`prompt.golden.test.ts` 的 `BEAT1_GOLDEN_PROMPT` 同字；两边任一被改动都会变红。

### 3.2 衔接原文一并留痕

B4 与 B5 的映射**有损**：METH-003 §8 记 B4 为复合手法「卡点硬切 + BGM 升调」，
记 B5 为否定说法「无转场，黑屏截断」，落到封闭枚举各自只能取一个值
（`BGM升调截断` / `黑屏断钩子`）。丢掉的信息不该无声消失，所以模板板上并列两个字段：

- `transition_rule`：封闭枚举值，落库与后期合成用
- `transition_label`：METH-003 §8 原文，只作留痕

有损在哪里、损了什么，读数据就能看到，不用回头翻方法论。

---

## 4. `pending_canon`：目录有、法源还没有

任务书要求「若枚举缺 `纯硬切` 则标 `pending_canon`」。实测情况是**两边都对了一半**：

- `transitions.ts` 的目录**已经有** `纯硬切`（`HARD_CUT`），是 W1/WK2 槽位加的，B3 在用；
- 但封闭枚举的法源 **METH-002 §5 只列了 5 项**，不含此值。要求它的是 METH-003 §1/§8
  的 B3 → B4 衔接点。

即：代码目录比法源多一项，差异一直存在，只是没人记下来。所以本槽位不新增取值（已存在），
而是把**差异本身变成数据**。目录项新增三个字段：

| 字段 | 含义 |
| --- | --- |
| `canon_source` | 授予该取值的法源条目 |
| `pending_canon` | 该取值尚未被 METH-002 §5 收录 |
| `pending_canon_reason` | 待批原因与需求出处；`pending_canon` 为 false 时恒为 null |

配套出口：`CANON_TRANSITION_RULES`（已收录的 5 项）、`PENDING_CANON_TRANSITIONS`（待批清单）、
`isPendingCanonTransition(rule)`。

两条口径写在测试里，避免以后被「顺手清理」：

1. **待批 ≠ 不可用。** `纯硬切` 照旧通过 `isTransitionRule`、照旧是 B3 的衔接值。
   下游（模板库、UI 下拉、导出）不需要区别对待。
2. **清空待批清单的唯一正当方式是补法源**，即修订 METH-002 §5 后把 `pending_canon`
   改回 `false`；**不是**把取值从目录里删掉——删掉会直接违反 METH-003 §8。

给方法论槽位的动作项：**METH-002 §5 补录第 6 项 `纯硬切` / `HARD_CUT`**，
补录后本仓库只需改一处布尔值，`transitions.test.ts` 会立即提示预期清单要同步更新。

---

## 5. `createProjectFromTemplate('banquet-hook')`

```ts
const project = createProjectFromTemplate('banquet-hook', { id, now, name });
```

- 结构照旧走 `createProject`：`beat_list` 由创建事务写死 5 项、数组冻结、
  宫格数按板序锁定。**套用模板不是解锁通道**，有测试专门断言这一点。
- 模板只写 ● 进 Prompt 的四类槽位（`emotion` / `camera_rhythm` / `plot_core` /
  `frames[].text`），衔接沿用骨架值，`status` 置 `filled`。
- 返回的项目 `isProjectReady` 为真、`validateProject` 为空，可直接提交整集生成。
- 每次调用返回全新对象，模板常量本身被冻结（含 `beat_list` 与每块板的 `frame_texts`），
  改项目改不到模板，两次调用之间互不串味。

返回前两道守卫：

1. `assertTemplateValid(template)` — 骨架副本、文案齐备、时长上限、整集时长自洽；
2. 对 5 块板逐一 `assertPromptClean(beat, assemblePrompt(...))` — 模板文案里若写进了
   衔接词 / 节拍名 / 备注，**建项目当场抛错**，而不是等它漏进生成请求体。

第 2 道是给「以后新增模板」准备的。模板文案是数据，数据是人写的，写文案的人不一定记得
红线；把断言放在创建路径上，写错的成本就从「线上生成结果不对」降到「本地建项目就炸」。

另有 `templatePromptPreview(id)` 返回五板 Prompt 全文，供「套用前先看一眼」，
走的是同一条组装路径，因此不会出现预览与实际不一致。

模板自检违规码：`TEMPLATE_BEAT_COUNT_NOT_5` / `TEMPLATE_SKELETON_MISMATCH` /
`TEMPLATE_FRAME_TEXT_COUNT_MISMATCH` / `TEMPLATE_FRAME_TEXT_EMPTY` /
`TEMPLATE_SLOT_EMPTY` / `TEMPLATE_DURATION_OVER_CAP` / `TEMPLATE_TOTAL_DURATION_MISMATCH`。

---

## 6. 测试

`templates.test.ts` 37 条，三条硬断言对应验收口径：

| 验收项 | 断言内容 |
| --- | --- |
| **88s 窗口** | 五板时长 `[8,17,20,25,18]` 之和恒为 88；时间位 `[0,8]…[70,88]` 首尾相接铺满 0–88、无缝无叠；88 落在 70–90s 区间；最长单板 25s ≤ 30s；套用后的项目 `episodeDuration` 同为 88 |
| **宫格数 3,3,3,3,2** | 模板声明的 `frame_count` 与帧描述条数均为 `[3,3,3,3,2]`（共 14 条、无空文案）；套用后的项目 `frame_count` 与 `frames.length` 同样是 `[3,3,3,3,2]`，第五板只有 2 格 |
| **Prompt 不含衔接** | 五板 Prompt 全文与生成请求体 JSON 均不含任何衔接词——不只查封闭枚举的 6 个取值，还查 METH-003 §8 的原文写法（`BGM 升调` / `无转场` / `黑屏截断` / `转场` 等）；另断言请求体字段只有 `beat_index` / `prompt` / `params`，`params` 只有四个参数位 |

另有：模板骨架逐字段等于 `BEAT_DEFS`；五板文案 GOLDEN 逐字钉死（情绪 / 节奏 / 剧情核心 /
14 条帧描述各一条）；B1 与 B5 的 Prompt 全文钉成手写字面量；结构锁在套用后依旧生效。

**期望值一律手写字面量，不由实现反推。**

### 6.1 突变验证

为确认上述测试不是摆设，做了六次突变（改坏实现后跑测试，随后全部还原）：

| 突变 | 变红的测试数 |
| --- | --- |
| `BEAT_DEFS` 里 B4 时长 25s → 28s（整集变 91s） | 18 |
| `BEAT_DEFS` 里 B5 宫格 2 → 3 | 18 |
| 把 `transition_rule` 拼进 Prompt 组装 | 14（全量 61） |
| 把 `纯硬切` 的 `pending_canon` 抹成 `false` | 3 |
| 改动一条模板帧描述文案 | 3 |
| 在模板 `plot_core` 里写进衔接词「纯硬切」 | 15（创建守卫当场抛错） |

前两次突变的连带变红面较大，是因为 `assertTemplateValid` 在
`createProjectFromTemplate` 的入口挡下了骨架不一致——守卫是承重的，不是装饰。

---

## 7. 交给下一槽位

1. **UI 侧**（模板选择器 / 新建项目弹窗）直接消费 `PROJECT_TEMPLATES`：
   `title` 作标题、`summary` 作副标题、`templatePromptPreview(id)` 作预览。
   本槽位没做任何 UI，编辑页 CSS 未触碰。
2. **新增模板**：在 `PROJECT_TEMPLATES` 里加一项，只写【示例】文案，骨架字段一律经
   `beatDef()` 取；加完先跑 `validateTemplate`，再补一份文案 GOLDEN 测试。
   不要在模板里自定义时间位或宫格数——`validateTemplate` 会挡下来。
3. **数据 / API 层**：模板产出的项目与 `createProject` 的产物同构，反序列化后照旧要过
   `assertBeatListLocked`。`transition_label` 是留痕字段，**不要**下发给生成 API。
4. **方法论槽位**：METH-002 §5 补录 `纯硬切` / `HARD_CUT`（见 §4）。
   补录前 `PENDING_CANON_TRANSITIONS` 应保持非空——它是待办的载体，清空它需要先改法源。
