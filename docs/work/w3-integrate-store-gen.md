# W3 / INTEGRATE-STORE-GEN —— 编辑区 + 本地库 + 生成三条链路合流

**分支** `cursor/w3-integrate-store-gen-c1f5`
**输入** 三个 Wave 2 槽位的产物：

| 来源分支 | SHA | 带来什么 |
| --- | --- | --- |
| `cursor/w2-integrate-7738` | `a3aed39a227352f10689cc446087fcdf092d8586` | WK1 脚手架 + WK2 领域核心 + WK3 节拍板编辑区（本次的基底） |
| `cursor/wave2-w2-prompt-generate-c608` | `a8f6f26d508b10662aa3c1c4a374841535a1f2b1` | Prompt 金样本、Seedance 2.5 生成引擎、禁用词扫描 |
| `cursor/wave2-wk-store-local-persistence-7ecb` | `6a118af0d0db0c01d1e99d17055bf1ab69a90b9c` | 本地持久化（IndexedDB → localStorage → 内存）、项目 CRUD、自动保存 |

合流后：一个项目从**新建 → 填五张节拍卡 → 实时看 Prompt → 逐板生成 → 成片页看结果**
全程走的是同一条数据链，且刷新页面不丢。

---

## 一、冲突裁决

派单给的优先级照单执行，逐条记下裁决与理由。

### 1. 领域锁与 Prompt 组装 —— 取 WK2 / prompt-gen

`apps/web/src/domain/beats.ts` 有实质冲突：store 槽位是在 **WK1** 的领域模型上写的
（`beats` / `gridSize` / `summary` / `tone` / `cells` / `transition`），
而 WK2 的规范模型是 `beat_list` / `frame_count` / `plot_core` / `emotion` / `camera_rhythm` /
`frames` / `transition_rule`，并且把结构锁做到了运行时（`defineProperty` + `Object.freeze`）。

裁决：**领域层整体取 WK2**，store 的那一套字段名不保留。理由不是"新的更好"，而是
两套字段名并存等于两个事实源——落库结构与 Prompt 组装器一旦对不上同一个 `Beat`，
「衔接不进 Prompt」这条红线就没有单一可验证的位置了。

prompt-gen 对 `beats.ts` 的改动（把注释里的禁用词换成「无镜头级拆解」）自动合入，未丢。

### 2. 编辑区 chrome —— 取 w2-integrate

`routes/EditorPage.tsx` 三方都改过。保留 integrate 的编辑区：信息条 + 剧情核心 /
镜头节奏 + 画面宫格 + 组间衔接 + Prompt 实时预览（`editor/BeatBoard`）。
store 与 prompt-gen 各自的编辑区都是占位骨架（面板上写着「宫格填写在 WK3 落地」），
按优先级弃用。

`styles.css` 的两个新增块（生成动作、表单/提示/保存态）互不重叠，取并集。

### 3. 持久化 —— 取 store 槽位，但**重定向到规范模型**

这是本槽位的主要工作量。演示数据 `data/demoProjects.ts` 按派单删除，
三个页面都改成从本地仓储读。持久化层的重定向不是加一层字段翻译，而是把落库结构
直接定义在领域模型之上：

```
StoredBeat    = 领域 Beat    + video_url / prompt_final          （PRD §8.2 生成期字段）
StoredProject = 领域 Project + created_at / archived / reused_from_id
```

投影类型 `ProjectSummary` 一并转 snake_case，与领域层的字段法源（METH-002 §10 /
PRD §9.2）对齐。

新增 `domain/projects.hydrateProject()`：**用现成的 5 块板重装项目的唯一入口**。
它先断言结构锁，再以不可写属性挂 `beat_list`、冻结数组。于是「数据从 IndexedDB
以普通 JSON 回来」和「编辑态兜一圈回来」这两条路，出口处的锁与
`createEmptyProject()` 完全一致。

`persistence/locks.ts` 的归一从「浅拷 + 改派生字段」改成 **重铸**：
`rebuildBeat()` 按板序调 `createBeat()` 取回带锁的板，只把可编辑字段与生成期字段
搬过去。库里被手改过的宫格数、帧序、时间位、板语义一律回到 canon，改不动。

> 有个坑值得记：禁用字段（`shot` / `camera_json` / …）必须在**重铸之前**查。
> 重铸出来的板是干净的，那时已经查不到痕迹——顺序写错就等于静默接受脏数据。
> `locks.test.ts` 里对每个禁用字段都同时断言 `assertProjectLocks` 与
> `normalizeProject` 都抛，把这个顺序钉住了。

`projectFactory` 的两处收敛：

- canon 时长表改为直接取 `BEAT_DEFS`，不再另抄一份 `[8,17,20,25,18]`；
- 衔接改用领域层的封闭目录。store 原来预置的是自由文本（`'卡点硬切 + BGM 升调'`、
  `'无转场，黑屏截断'`），不在 6 选 1 的封闭枚举内，落库会被 `RULE-9` 拒绝。
- 复用（PRD §7.2）改为重铸而非浅拷。原实现 `{...beat, cells: [...]}` 会共享
  `frames` 引用，清空副本的画面文案会连带清掉**上一集**——「复用」变成「改上一集」。

### 4. 生成 —— prompt-gen 的控制器接到编辑区的按钮上

integrate 的顶栏原本是两个 `disabled` 按钮（标题写着「生成接入在后续槽位」）。
现在换成 `BeatGenerateAction`（板级，带状态徽章与禁用原因）与
`GenerateEpisodeButton`（整集，按 B1 → B5 依次发起 5 次独立调用）。

接线上有三个必须解决的问题：

**(a) 生成前置校验读哪份数据。** 控制器吃 `Project`，而用户刚填的内容在编辑态
（`editor/draft.ts` 的 `BeatDraft[]`）里。若读库里那份，用户填完宫格按钮仍是禁用，
且提示「还缺第 1 格画面描述」——明显是错的。
新增 `draft.projectWithDrafts()` 把编辑态整体回落成项目（内部走 `hydrateProject`，
锁跟着回来），控制器读的是它。填完即可点生成，不必等落盘。

**(b) 控制器不能跟着项目对象身份重建。** `useGenerateController` 原来
`useMemo(..., [project])`。编辑态每敲一个字都会产出新的项目对象，于是每个按键都会
重建队列、丢掉已入队的任务。改成按 `project.id` 挂载，新快照经
`controller.syncProject()` 送进去（同 id 校验，换项目仍必须换控制器）。

配合 `useMemo` 让 `liveProject` 的引用只随编辑态变化，这条链是收敛的：
编辑态变 → 新 liveProject → effect 调 syncProject → 快照失效 → 重渲染 →
liveProject 引用不变 → effect 不再触发。

**(c) 生成结果要落库。** 生成成功后把 `video_url` 与 `prompt_final` 回写到项目，
状态置 `generated`。成片页的「已生成 / 未生成」读的就是落库的 `video_url`，
刷新页面状态仍在。回写只在库里那份与队列不一致时发生，否则保存态会反复抖动。

### 5. CI —— 保留 prompt-gen 的 `lint:terms`

`.github/workflows/ci.yml` 与 `package.json` 的 `lint:terms` / `pretest` 原样保留。
合并后有两个 WK3 / store 的守卫测试命中扫描（它们必须写出禁用词才能断言 UI 上找不到
这些词），按既有惯例登记豁免并写明理由，而不是改测试或放宽扫描：

- `apps/web/src/editor/BeatBoard.test.tsx`
- `apps/web/src/routes/ProjectsPage.test.tsx`

---

## 二、编辑态 → 持久化的接线

`useBeatBoard` 新增 `onDraftsChange`：编辑态**只经这一条路**流向外部。

```
宫格 / 字段编辑
  → useBeatBoard.setDrafts
  → onDraftsChange(drafts)
  → useProjectEditor.update(withDrafts)      2s 防抖 + 离页强制落盘
  → repository.save                          结构锁断言，违规不落库
```

三点设计约束：

1. **通知放在 `setState` 之外。** 写在更新函数里，StrictMode 下会被调用两次，
   一次编辑触发两次保存。用 ref 持有当前编辑态，先算出 next 再通知。
2. **首次挂载不通知。** 否则页面一打开就显示「未保存」。
   `EditorPage.test.tsx` 里有一条用例专门钉这个。
3. **`withDrafts` 保留生成期字段。** 编辑不该抹掉已生成的成片地址，
   `video_url` / `prompt_final` 取库里那份，其余取编辑态。

## 三、锁分层（本槽位唯一一处"放宽"，实为归位）

合并后出现一个真问题：`hydrateProject` 在编辑路径上每次改动都会跑一遍，
而它原来断言全部违规码——用户清空时长输入框的那一瞬间值为 0，
`DURATION_OVER_CAP` 直接把整页崩掉。

裁决：把违规码分成两类，**锁一条没少，只是各就各位**。

| 类别 | 违规码 | 谁来拦 |
| --- | --- | --- |
| 结构锁（用户改不了） | `BEAT_COUNT_NOT_5` / `BEAT_INDEX_OUT_OF_ORDER` / `BEAT_TYPE_MISMATCH` / `G_INDEX_MISMATCH` / `TIME_RANGE_MISMATCH` / `FRAME_COUNT_MISMATCH` / `FRAME_COUNT_NOT_LOCKED` / `FRAME_ORDER_NOT_LTR` | `hydrateProject`（编辑态每一帧）+ 落库前 |
| 取值锁（用户填得出中间态） | `DURATION_OVER_CAP` / `TRANSITION_RULE_UNKNOWN` | 落库前的 `assertProjectLocks` |

`assertBeatListLocked`（全量）保持原样对外导出，编辑路径改用
`assertBeatStructureLocked`。取值越界仍然进不了库：
`localRepository.save` → `normalizeProject` → `assertProjectLocks` 一条都不放过，
`adapters/persistence/locks.test.ts` 里有「单板超 30s 即拒绝，不静默夹紧」
与「封闭目录外的衔接手法即拒绝」两条用例守着。

---

## 四、测试对账

| 文件 | 本槽位 | integrate | store | prompt-gen | 说明 |
| --- | --- | --- | --- | --- | --- |
| `domain/beats.test.ts` | 34 | 34 | 18 | 27 | 取 integrate（WK2 规范模型的超集） |
| `domain/locks.test.ts` | 24 | 24 | — | 24 | 原样 |
| `domain/projects.test.ts` | 12 | 12 | 3 | 12 | 原样 |
| `domain/transitions.test.ts` | 16 | 16 | — | 8 | 取 integrate |
| `domain/prompt.test.ts` | 16 | 16 | — | 16 | 原样 |
| `domain/prompt.golden.test.ts` | 16 | — | — | 16 | 原样 |
| `prompt/assemble.test.ts` | 43 | 43 | — | — | 原样 |
| `editor/draft.test.ts` | 17 | 17 | — | — | 原样 |
| `editor/BeatBoard.test.tsx` | 33 | 33 | — | — | 数量不变，数据源改为内存仓储播种 |
| `generate/*.test.*` | 87 | — | — | 87 | queue 21 / interceptors 24 / adapter 15 / store 15 / controller 12 |
| `adapters/persistence/localRepository.test.ts` | 40 | — | 40 | — | 数量不变，字段与断言转规范模型 |
| `adapters/persistence/locks.test.ts` | 17 | — | 5 | — | **+12**：补宫格锁 / 五节拍锁 / 时长上限 / 转场隔离 / 运行时不可写 |
| `store/projectFactory.test.ts` | 27 | — | 19 | — | **+8**：canon 取自 BEAT_DEFS、时间位不随时长移动、生成期字段空位、归档 |
| `store/ProjectsProvider.test.tsx` | 3 | — | 3 | — | 原样 |
| `store/useProjectEditor.test.tsx` | 11 | — | 11 | — | 原样 |
| `routes/ProjectsPage.test.tsx` | 15 | — | 15 | — | 原样 |
| `routes/EditorPage.test.tsx` | 11 | — | 7 | — | **+4**：宫格落盘、打开页面不算改动、生成结果回写、快照无衔接 |
| `App.test.tsx` | 13 | 12 | 13 | 12 | 取 store（多一条「数据来自本地仓储」） |
| **合计** | **435** | 207 | 134 | 202 | |

外加 `scripts/forbidden-terms.test.mjs` 的 17 个 node:test 用例（`pretest` 阶段跑）。

**没有删除任何红线测试**：每个文件的用例数都 ≥ 它在三个来源分支里的最高值。
新增的 24 条全部是收紧方向（多断言一处锁），没有一条放宽既有期望。

三条测试改动值得单独说明，因为都改到了期望值：

1. `BeatBoard.test.tsx` 的「补齐后转为就绪」原来只填情绪与三格画面就通过——
   因为演示数据里 `camera_rhythm` / `plot_core` 是预填的。改从空项目播种后
   必须把两项也填上。**就绪判定规则本身没动**（`isBeatReady` 未改），
   是测试原来靠夹具走了捷径。
2. `EditorPage.test.tsx` 与 `ProjectsProvider.test.tsx` 里改的字段从
   store 的「节拍名称 / 备注」换成编辑区真实存在的「剧情核心 / 衔接要点」——
   板名在规范模型里是只读规格，没有可编辑控件。断言的行为（改动 → 落盘、
   保存后输入框不被卸载）不变。
3. `controller.test.tsx` 的编辑页接线改为从内存仓储播种一个填齐的项目，
   替掉原来「就地改演示数据再改回来」的写法。

另有一处测试基建修正：生成任务表与仓储的 localStorage 兜底共用同一个 storage，
不清库时上一个用例的任务会让下一个用例的按钮直接是「重新生成」。
在 `vitest.setup.ts` 里统一清，而不是让每个用例各记一次。

---

## 五、验收

```
npm run typecheck   ✓
npm run lint:terms  ✓  扫了 102 个文件，产品源码无禁用词
npm test            ✓  17 node:test + 435 vitest（22 个文件）
npm run build       ✓
```

## 六、遗留缺口

按影响排序，供后续槽位接手。

1. **生成结果没有独立的落库通道。** 现在靠编辑页的 effect 把 `video_url`
   回写进项目草稿，再走 2s 防抖保存。用户在生成跑完之前离开编辑页，
   成片地址就只在内存的任务表（localStorage）里，项目里没有。
   正确的做法是让生成队列成功回调直接写仓储，不经编辑页的草稿。
2. **成片页只显示「已生成 / 未生成」**，没有播放器、逐段下载与连播。
   一键拼接按 PRD 是 V1.1，仍置灰。
3. **宫格参考图只在内存里。** `editor/draft.ts` 的 `FrameImage` 持有
   object URL，刷新即失效；架构文档的 `Frame.reference_image_key` 还没进落库结构，
   也没有 blob 存储。生成请求里参考图键是按格序发的，链路已通，缺的是持久化。
4. **整集时长偏差只提示不阻断。** 编辑页在五板时长之和偏离 88s 时给提示；
   `RULE-5` 的 70–90s 区间目前只在新建表单上用 `min` / `max` 拦，
   编辑过程中改到区间外不会阻断保存。
5. **`useProjectEditor` 不认识项目级字段。** 题材 / 画幅 / 画风 / 主角只能在
   新建时填，编辑页没有改项目参数的入口（这些字段会注入每板 Prompt，
   改起来影响面大，需要先定 UI）。
6. **迁移链是空表。** `SCHEMA_VERSION = 1`，`MIGRATIONS` 里没有条目。
   本槽位改了落库字段名（camelCase → snake_case），但 store 槽位从未发布，
   库里不存在旧格式数据，所以没有补 v1 → v2。**下一次改落库结构必须
   同时 +1 版本号并补迁移函数**，否则老用户的库读不回来。
7. **控制器与「换项目」的边界靠断言而非类型。** `syncProject` 在 id 不一致时抛错；
   编辑页用 `key={project.id}` 保证不会发生。这条约束目前只有运行时保护。
