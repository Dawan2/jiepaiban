# W1 / WK2 — 领域层：黄金五板的代码法源

- 文档编号：`WORK-W1-WK2`
- 归属：Wave 1 / Slot WK2 / domain
- 分支：`cursor/wave1-wk2-domain-core-7777`，基线为 WK1 脚手架 `a1e603a`
- 上游法源：[`docs/methodology/glossary.md`](../methodology/glossary.md)（METH-002）、
  [`docs/methodology/golden-5-beats.md`](../methodology/golden-5-beats.md)（METH-003）、
  [`docs/prd/prd-seedance-tool.md`](../prd/prd-seedance-tool.md)

---

## 1. 交付物

领域层落在 `apps/web/src/domain/`（沿用 WK1 已有目录，不另开 `packages/domain`，避免同一模型两处实现）：

| 文件 | 职责 |
| --- | --- |
| `beats.ts` | 五板骨架 `BEAT_DEFS`、`Beat` / `BeatFrame` 模型、结构锁、时长上限、结构校验器 |
| `transitions.ts` | 组间衔接封闭目录（6 项） |
| `prompt.ts` | Prompt 组装器、生成请求体、硬排除清单与泄漏断言 |
| `projects.ts` | `Project` 模型、`createEmptyProject(name)`、完成度与就绪判定 |
| `index.ts` | 领域层唯一出口 |

测试：`beats.test.ts` / `locks.test.ts` / `transitions.test.ts` / `prompt.test.ts` / `projects.test.ts`。

---

## 2. 五板骨架（BEAT_DEFS）

| 板 | 节拍 | 镜头组 | 时间位 | 时长 | 宫格数 | 组间衔接 |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | 开篇钩子 | G1 | 0–8s | 8s | 3 | 音频预接 |
| B2 | 矛盾建立 | G2 | 8–25s | 17s | 3 | 卡点硬切 |
| B3 | 打压升级 | G3 | 25–45s | 20s | 3 | 纯硬切 |
| B4 | 反转蓄力 | G4 | 45–70s | 25s | 3 | BGM升调截断 |
| B5 | 断集留客 | G5 | 70–88s | 18s | 2 | 黑屏断钩子 |

- 总时长 88s（整集区间 70–90s），最长单板 25s，满足 ≤ 30s 上限。
- 时间位首尾相接、无缝无叠，`duration_sec === time_end - time_start`，均有测试断言。
- B4 在 METH-003 记作「卡点硬切 + BGM 升调」，落到封闭枚举取 `BGM升调截断`。
- B1 带 canon 帧语义 `impact / reaction / env`；其余板的帧语义为 `null`（METH-002 §3 只以 B1 为样板）。

`createEmptyProject(name)` 只需项目名即可建出整集：默认画幅 9:16、整集 88s 基准轴，
`beat_list` 长度恒为 5 且按上表预填名称、时长与衔接。

---

## 3. 四条锁怎么锁的

红线不能只靠类型：`as` 断言、`JSON.parse` 回填、以后的 API 反序列化都能绕过编译期。
因此每条锁都是**类型层 + 运行时**双层：

| 锁 | 类型层 | 运行时 |
| --- | --- | --- |
| 五节拍锁 | `BeatList = readonly [Beat × 5]`，出口不含任何增删函数 | `beat_list` 数组 `Object.freeze`，且在 `Project` 上以不可写属性定义 |
| 宫格锁 | `frame_count` 为 `readonly`，类型 `3 \| 2` | `frame_count` / `frames` 以不可写属性定义，帧数组 `Object.freeze` |
| 帧序锁 | `frames` 为 `readonly BeatFrame[]`，`order` 为 `readonly` | 帧数组冻结 + `order` 不可写；`validateBeatList` 另查帧序是否严格 1..n |
| 时长上限 | —— | `isDurationWithinCap` 与 `validateBeatList` 双查，上限 30s |

于是 `push` / `pop` / `splice` / `reverse` / `sort` / 下标赋值在严格模式下一律抛 `TypeError`。
**冻结只到数组一层**：帧对象本身不冻结，`frame.text` 仍可编辑——锁的是结构，不是内容。

一个易踩的坑记在这里：`Object.defineProperty` 重定义**已存在**的属性时，未显式给出的
特性会沿用原值。所以帧的 `order` / `semantic` 不能先写在对象字面量里再 `defineProperties`，
否则 `writable` 保持 `true`，锁形同虚设。实现里这两个属性只经 `defineProperties` 定义。

除了硬锁，`validateBeatList` 还返回可读的违规清单（`BEAT_COUNT_NOT_5` /
`FRAME_COUNT_NOT_LOCKED` / `FRAME_ORDER_NOT_LTR` / `DURATION_OVER_CAP` 等），
供 WK3 的数据层与 API 层在写入前做守卫；`assertBeatListLocked` 是它的抛错版。

---

## 4. Prompt 组装与硬排除

组装顺序固定，V1.0 不开放自定义模板：

```
固定前缀 + 全局画风风格词 + 主角形象描述 + 画幅指令
+ 本段情绪 + 时长 + 镜头节奏 + 剧情核心
+ 节拍帧（左 → 右，用 “ → ” 连接）
```

- 空字段直接缺省，不产生占位文本。
- `buildPromptSegments` 额外给每个片段带 `project / beat / frame` 来源标签，供编辑页
  「来源可辨」着色（PRD 5.3.3）直接消费。
- `buildGenerateRequest` 的请求体只有 `beat_index` / `prompt` / `params`，
  `params` 只有 `duration_sec` / `aspect_ratio` / `frame_count` / `g_index`。

**硬排除清单**：`title`（节拍名称）、`transition_rule`（组间衔接）、`note`（备注）。
组装器只读白名单字段，`findExcludedFieldLeaks` / `assertPromptClean` 再做一次事后断言。
测试遍历「5 块板 × 6 种衔接取值」共 30 种组合，断言 Prompt 全文与请求体 JSON 都不含衔接内容。

组间衔接封闭目录（6 项，只在后期合成阶段生效）：
`音频预接` / `螺口顺滑过渡` / `卡点硬切` / `BGM升调截断` / `黑屏断钩子` / `纯硬切`。
枚举封闭，新增取值必须先改方法论法源；目录在运行时冻结，`push` 会抛错。

---

## 5. 测试：反向断言与突变验证

`locks.test.ts` 的每条断言都是反向的——放开任何一条锁，它就必须变红。
为确认这些测试不是摆设，做了四次突变验证（改坏实现后跑测试，随后全部还原）：

| 突变 | 变红的测试数 |
| --- | --- |
| 去掉 `beat_list` 冻结与数量校验（允许第 6 个节拍） | 7 |
| 去掉帧数组冻结、`order` 改为可写、去掉帧序校验 | 5 |
| 把 `transition_rule` 拼进 Prompt | 6 |
| 把单板时长上限从 30s 放到 999s | 2 |

全量：6 个测试文件、99 条测试，`typecheck` / `test` / `build` 三条 CI 步骤均通过。

---

## 6. 与既有产物的差异及取舍

### 6.1 与 WK1 脚手架

WK1 已建好目录、类型与固定 5 项导航，本槽位在其上**原地升级为 canon**，而不是新建
第二套模型——同一个 `Beat` 有两处定义，红线迟早从缝里漏出去。具体改动：

| WK1 | WK2 | 原因 |
| --- | --- | --- |
| `BEAT_PRESETS`（钩子 / 冲突 / 升级 / 反转-高潮 / 悬念钩子） | `BEAT_DEFS`（开篇钩子 / 矛盾建立 / 打压升级 / 反转蓄力 / 断集留客） | METH-002 §2 标准词 |
| `project.beats` | `project.beat_list` | METH-002 §10 锁定项目级字段名 |
| `gridSize` 可切 3/2 | `frame_count` 按板序锁定 3/3/3/3/2 | 见 6.2 |
| `cells[].description` | `frames[].text` | METH-002 §1「节拍帧 / frame」 |
| `summary` / `tone` | `plot_core` / `emotion`，另加 `camera_rhythm` | METH-002 §4 四槽位 |
| `transition`（自由文本） | `transition_rule`（封闭枚举） | METH-002 §5 枚举封闭 |
| 无时间位、无时长上限、无衔接目录、无组装器 | 全部补齐 | 本槽位范围 |

WK1 的测试同步迁到新字段名，断言意图逐条保留，条数由基线的 33 条增至 99 条
（基线在 WK1 分支上实测为 3 个文件 / 33 条）。
被替换掉的只有一条：「宫格从 3 切 2、切回 3 恢复草稿」——该行为与宫格锁互斥，见 6.2。

命名上取一条统一规则：**数据字段一律 snake_case**（对齐 METH-002 §10 与 PRD §9.2 的字段
法源，WK3 可直接序列化），函数与类型名沿用 TS 惯例。

### 6.2 与 PRD 的两处冲突（已按方法论法源裁决）

PRD 是骨架转写稿，有两处与 METH-002/003 相左。本槽位按方法论法源实现，在此留痕：

1. **宫格数可否由用户切换。** PRD 5.2.3 写「3 宫格或 2 宫格，节拍级切换……从 3 切 2 第 3 格
   保留为草稿」；METH-003 §9.2 写「`frame_count` 由板序决定：B1–B4 = 3，B5 = 2，**不可由用户
   修改**」。取后者：宫格数是骨架的一部分，可切换就等于把结构决定权交回用户，
   「不可变结构」这条产品价值随之失效。因此 B5 恒 2 格，其余恒 3 格，不存在草稿态第 3 格。
2. **时长进不进 Prompt 文本。** PRD 5.3.2 把时长标为「API 参数位，不拼入文本」；
   METH-003 的组装样例里「时长8秒」明确在 Prompt 文本内。取两者并集：时长既进文本，
   也作为 `params.duration_sec` 下发，两边都不缺。

另有一处是取值形态而非冲突：PRD 5.2.2 的情绪基调是 7 项单选，METH-003 的样例是整句情绪
描写。实现取 `emotion: string`（自由文本），7 项以 `EMOTION_PRESETS` 保留为 UI 快捷起手，
不构成取值约束。

### 6.3 明确废弃的草案

以下东西在本槽位**不存在**，出现即视为红线违规：Beat/Shot 双层模型、`camera_json`、
可拖拽 / 可增删的节拍、不固定的节拍数或宫格数、景别 / 机位 / 运镜 / 逐镜时长等任何
小于 `beat` 粒度的字段。`locks.test.ts` 有两条测试扫描领域层出口与节拍字段名，
新增上述任一概念即变红。

---

## 7. 交给下一槽位（WK3 数据 / API 层）

1. 建项目走 `createEmptyProject` / `createProject`，**不要**自己拼 `beat_list`；
   Beat 行数由创建事务固定写入 5 行，不提供独立的创建 / 删除 API（PRD §9.3）。
2. 反序列化（`JSON.parse`、DB 回填、API 入参）之后必须过 `assertBeatListLocked`——
   运行时锁只在经构造函数产出的对象上生效，绕开构造函数的数据要靠校验器兜住。
3. 提交生成用 `buildGenerateRequest`，不要自行拼装 Prompt；如需在别处组装，
   提交前用 `assertPromptClean` 兜一道。
4. 领域层不碰持久化、不碰网络、不引 React：`domain/` 里没有任何 UI 或 IO 依赖，
   保持这一点，测试才能一直是纯函数级的。
5. 编辑页的宫格填写、字段自动保存与 Prompt 面板实时刷新仍在 WK3：本槽位只把 UI 迁到
   新字段名并只读展示，没有新增编辑能力。
