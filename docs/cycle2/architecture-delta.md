# Cycle 2 架构增量（Architecture Delta）

- 文档编号：`ARCH-C2-DELTA`
- 槽位：**Wave 6 / 80 · Cycle 2 架构波 · PLAN SLOT W6**
- 分支：`cursor/w6-cycle2-architecture-b5b9`（基线 `main` @ `09e11fd`，**docs-only**）
- 勘察对象：`cursor/w3-integrate-store-gen-c1f5` @ `8ffe44ff36e421235989d646323f6b4a9ac3c86b`
- 配套：[`ready-queue.md`](./ready-queue.md)（W7–W9 任务与属主）、[`risks.md`](./risks.md)（风险台账）、[`DISPATCH.md`](./DISPATCH.md)（本槽回执）

> **本文档只写增量。** Cycle 1 已落定的口径（五节拍锁、宫格锁、30s 上限、衔接不进
> Prompt、Seedance 独占、本地优先）一律不重述、不改动。本文只回答一个问题：
> **从 `8ffe44f` 这个状态出发，下一步的结构该长什么样。**

---

## 0. 勘察结论：起点与库存

### 0.1 W5 验证波不存在

调度指令要求参考「W5 verify 文档如果存在」。**实测不存在**：远端 20 条分支中没有任何
W5 槽位分支，`docs/` 下也没有 Cycle 1 验收报告。

这件事本身是一条架构事实，不是文书缺失：按 [`wave-plan.md`](../backlog/wave-plan.md) §0
的节律，`Wn % 5 == 0` 是验证波，且**验证波结束时 `verify` 必须全绿，否则该 Cycle 不算完成**。
Cycle 1 因此处于「实现波已越过、验证波未召开」的状态。本波的处理口径：

- **不追认 Cycle 1 完成**。Cycle 1 的出口判据（E2E 主流程、L4 全站扫描、L7 逐字符比对、
  性能基线、迁移演练）没有任何一条被执行过；`8ffe44f` 上跑绿的是 435 条单测 + 17 条
  node:test，那是实现波自带的测试，不是集成闸门。
- **把 Cycle 1 的验证债并入 Cycle 2 的验证波（W10）**，并在 [`ready-queue.md`](./ready-queue.md) §4
  单列，不与 Cycle 2 自身的验证项混记。混记会让「哪一轮欠的债」在两轮之后就查不出来。

### 0.2 Cycle 2 的原定主题已被实现波提前吃掉

[`wave-plan.md`](../backlog/wave-plan.md) §1 给 Cycle 2（W6–W10）的主题是
「生成队列（Fake Provider）：Provider 端口、任务状态机、队列驱动、重试退避、快照冻结、状态回显」，
出口判据是「用 FakeProvider 跑通单发/批量/失败重试/重启续跑」。

**这批能力在 W2/W3 已经落地了**：`generate/` 目录下 queue（21 测）、interceptors（24）、
adapter（15）、store（15）、controller（12）共 87 条测试，状态机四态与合法迁移表、
幂等键、桩件传输层、拦截链、板级/整集入口全部在位。

所以 Cycle 2 的真实主题必须重排。本波的裁定：

| | 原定 Cycle 2 | **重排后的 Cycle 2** |
| --- | --- | --- |
| 主题 | 生成队列（Fake Provider） | **收敛分叉 + 补齐落库链路 + 为真连准备接口** |
| 理由 | — | 队列已在位；当前最大的结构风险不是「缺功能」，而是**五条未合流分支**与**生成结果不落库** |

重排不是放弃原判据。W2/W3 落地的队列**缺一条原判据**：「重启续跑」。任务表在
`localStorage`（`GENERATE_JOBS_STORAGE_KEY`），`RUNNING` 状态的任务在刷新后既不会继续跑、
也不会被标记失败，会永久占住那块板的提交入口（`isActiveStatus` 判 `busy`）。
这一项进 W8（见 [`ready-queue.md`](./ready-queue.md) §2）。

### 0.3 未合流分支库存（实测）

五条分支，三个不同的 merge-base。**merge-base 不同是本轮全部合并成本的根源**：

| 分支 | HEAD | merge-base 与 `8ffe44f` | 内容 | 与 `8ffe44f` 的实测冲突文件数 |
| --- | --- | --- | --- | --- |
| `cursor/wave2-w2-export-ca31` | `c92ce40` | `a8f6f26`（prompt-generate） | 成片页视图模型、段卡、拼接计划、下载命名 | — **见下：已被 925d 完全包含** |
| `cursor/w4-feishu-export-925d` | `82f4845` | `a8f6f26`（prompt-generate） | 上者 **+** 飞书导出（`share/**`：Markdown / 文档结构 / 剪贴板 / 面板） | **1** |
| `cursor/w3-templates-golden-library-e98c` | `21ae263` | `a8f6f26`（prompt-generate） | 黄金五板模板库（数据层）、衔接目录补 `pending_canon` | **2** |
| `cursor/w4-a11y-6861` | `d24127d` | `a3aed39`（w2-integrate） | 编辑器无障碍与键盘作业、33 条 a11y 测试 | **2** |
| `cursor/w4-image-store-8321` | `3d4b5af` | `6a118af`（store-local-persistence） | 节拍帧参考图 blob 仓、配额、`beatboard` 单库集中开库 | **3** |

**关键发现 1：`w4-feishu-export-925d` 严格包含 `wave2-w2-export-ca31`。**
`git merge-base --is-ancestor` 判定为真，925d 的历史是 `c92ce40 → 7b95490 → ac4c95c → 82f4845`
线性后继。两者在 `export/**` 上的差异只有 2 个文件（`ExportView.tsx` +21 行、
`ExportView.test.tsx` +46 行，飞书面板挂载点）。

> **裁定：合 925d 即等于合 ca31，不单独合 ca31。** 单独合会制造一次无谓的三方合并，
> 且两侧对 `ExportView.tsx` 的改动会变成人工冲突——而这个冲突在库存里本来不存在。

**关键发现 2：`w4-image-store-8321` 写在已被取代的领域模型上。**
它的 merge-base `6a118af` 是 store 槽位，用的是 WK1 模型（`gridSizeForBeat` / `GridSize` /
`GridCell` / `EmotionTone`）；W3 已整体取 WK2 规范模型（`frameCountFor` / `FrameCount` /
`BeatFrame` / `frames`），理由见 [`w3-integrate-store-gen.md`](../work/w3-integrate-store-gen.md) §1.1。

好消息是**耦合面极窄**：逐文件扫描后，整个 `adapters/images/**` 只有
`frameImageKey.ts` 一处依赖旧模型（`gridSizeForBeat`，3 处调用），其余文件只 type-only
导入 `BeatIndex`。这是因为图片仓的坐标只需要「这块板有几格」这一个事实。

**关键发现 3：`export/**` 与 `share/**` 已经写在规范模型上，无需重构。**
它们的 merge-base `a8f6f26` 是 prompt-generate 槽位，而该槽位本身就建立在
WK2 规范模型上（`orderedFrames` / `beatDef` / `frame_count`）。粗扫时命中的
「旧模型符号」全是假阳性（`card.transition` 是导出层自有的视图模型字段，
`doc.beats` 是飞书文档的段落集合，与领域 `beat_list` 无关）。

**关键发现 4：`ExportPage.tsx` 是 925d 唯一的真实断点。**
925d 的成片页路由壳读 `findDemoProject`（`data/demoProjects`），而 W3 已按派单
**删除**了该演示夹具、三页改读本地仓储。合并后该 import 指向不存在的模块——
这不是文本冲突，是**类型断裂**：文本冲突 Git 会报，类型断裂只有 `typecheck` 会报。
全分支扫描确认，`export/**` 与 `share/**` 内部**没有**任何文件依赖 `demoProjects`，
唯一依赖点就是这个已冲突的路由壳。

---

## 1. 增量一：生成成功必须立刻写仓储

### 1.1 现状与它为什么是错的

现状链路（`routes/EditorPage.tsx`）：

```
队列成功 → controller 快照更新 → 编辑页 useEffect 发现 video_url 不一致
        → editor.update(把 video_url 盖进草稿)
        → useProjectEditor 2s 防抖
        → repository.save
```

三个独立的失效条件，任意一个成立就丢成片地址：

1. **用户在 2s 内离开编辑页**（点「成片」、按返回、关标签页）。防抖窗口没到，
   `video_url` 只存在于内存与任务表，项目记录里没有。
2. **用户根本不在编辑页**。生成是异步的，队列 `drain()` 在后台跑；只要成片地址回来时
   编辑页已卸载，那个 `useEffect` 就永远不会执行。
3. **`localStorage` 与 IndexedDB 不同寿**。任务表在 `localStorage`，项目在 IndexedDB。
   清理站点数据、隐私模式配额回收、跨浏览器配置差异都会让两边不同步——
   而任务表是那一刻**唯一**持有 `video_url` 的地方。

这条链路的根本错误在**依赖方向**：生成结果的持久化取决于「某个 UI 组件此刻是否挂载」。
[`system-architecture.md`](../architecture/system-architecture.md) 的四层依赖方向里，
UI 是最外层；把落库挂在最外层，等于把一条数据完整性约束交给渲染生命周期去保证。

W3 自己也把这条记成了遗留缺口第 1 条，并给出了方向：「让生成队列成功回调直接写仓储，
不经编辑页的草稿」。本波把它定成结构。

### 1.2 目标结构：`GenerateResultSink` 端口

新增一个**窄端口**，队列在状态流转成功时经它写库；编辑页彻底退出这条链路。

```
队列 runNext() → transition(SUCCEEDED) → sink.onSucceeded(job) → repository 立刻写
                                       ↘ notify() → UI 只订阅、只渲染
```

端口签名（放 `apps/web/src/generate/resultSink.ts`）：

```ts
/** 生成结果的落库出口。队列只认这个接口，不认仓储、不认项目结构。 */
export interface GenerateResultSink {
  /** 成功：把 video_url 与 prompt_final 写进该板，状态置 generated。 */
  onSucceeded(job: GenerateJob): Promise<void>;
  /** 失败：只落状态与失败原因，不动 video_url。 */
  onFailed(job: GenerateJob): Promise<void>;
}

/** 空实现：纯队列单测用，不需要仓储在场。 */
export const NULL_SINK: GenerateResultSink;
```

仓储侧的实现要落到**一个新的窄写入方法**，而不是复用 `save(project)`：

```ts
// adapters/persistence/localRepository.ts
/**
 * 只改一块板的生成期字段（video_url / prompt_final / status）。
 * 读-改-写在仓储内部完成，调用方不需要持有整个项目。
 */
applyGenerateResult(
  projectId: string,
  beatIndex: BeatIndex,
  patch: { video_url: string | null; prompt_final: string | null; status: BeatStatus },
): Promise<void>;
```

### 1.3 四条设计约束（都是踩过的坑的反面）

**(a) 不要让队列持有 `Project`。** 队列已经有 `project_id` 与 `beat_index`，那就是完整坐标。
让队列持有项目对象会立刻复现 W3 修过的那个 bug：编辑态每敲一个字产出新项目对象，
持有者要么跟着重建（丢队列），要么持有过期快照（写回旧数据）。**坐标而非对象**是这条边的规矩。

**(b) 写入必须走 `rebuildBeat` 重铸，不能浅拷。** 仓储里那份板是普通 JSON（IndexedDB
回来的），直接 `{...beat, video_url}` 会产出一块**没有结构锁**的板，然后被
`normalizeProject` 重铸——结果正确但绕了一圈；更糟的是 `frames` 引用共享，
W3 在「复用」上踩过完全同一个坑（`projectFactory` 那条：清空副本会连带清掉上一集）。
`applyGenerateResult` 内部按 `rebuildBeat(previous)` 取回带锁的板，只搬生成期字段。

**(c) 编辑期的自动保存与生成期的写入必须不打架。** 两条写路径打同一条项目记录，
存在「读-改-写」交错：用户正在打字（草稿在内存，2s 后落盘），此时生成成功写库，
2s 后草稿落盘会把刚写进去的 `video_url` **盖掉**。

裁定：**字段所有权分离 + 草稿以库为准合并**。

| 字段组 | 唯一写者 | 另一方的义务 |
| --- | --- | --- |
| 可编辑字段（`emotion` / `camera_rhythm` / `plot_core` / `frames[].content` / `duration_sec` / `transition_rule`） | 编辑页草稿 | sink 只改生成期字段，不碰这些 |
| 生成期字段（`video_url` / `prompt_final` / `status`） | sink | 草稿落盘前**重读**库里的生成期字段再合并 |

W3 已经有这个合并逻辑的雏形（`withDrafts` 里「`video_url` / `prompt_final` 取库里那份」），
但它取的是 React 状态里那份 `project`，可能已经过期。改为**落盘前重读**，
交错窗口就从「2s」压到「一次 IndexedDB 读的时间」。

**(d) 任务表不再是成片地址的事实源。** 落库成功后，`video_url` 的事实源是项目记录。
任务表只保留「这块板最近一次任务的状态与失败原因」，用于重试判定与幂等。
读取优先级由此固定为：**项目记录 > 任务表**。这条要写进 `controller.stateOf`
的取值顺序，否则「库里已生成、任务表被清掉」的用户会看到「未生成」。

### 1.4 启动时的对账（reconcile）

加了 sink 之后仍有一个窗口：任务成功、sink 写库前进程被杀。所以需要一次启动对账，
放在仓储读出项目之后、UI 渲染之前：

| 库里 `video_url` | 任务表最近任务 | 处置 |
| --- | --- | --- |
| 有 | `SUCCEEDED` 同 `idempotency_key` | 一致，无动作 |
| 无 | `SUCCEEDED` 有 `video_url` | **补写库**（就是被杀掉的那次 sink） |
| 有 | 无任务（任务表被清） | 以库为准，板显示「已生成」 |
| 无 | `RUNNING` | **判定为中断**：置 `FAILED` + `API_ERROR/INTERRUPTED`（可重试）。这同时修掉 §0.2 那条「`RUNNING` 永久占住提交入口」 |
| 无 | `PENDING` | 保留，启动后由 `drain()` 接着跑 |

对账是纯函数（输入两份快照、输出补写动作清单），可脱离浏览器单测。

### 1.5 本增量的验收锚点

1. 生成成功后**立即**（不等防抖、不需编辑页挂载）能从 `repository.load` 读到 `video_url`；
2. 生成跑完前离开编辑页，成片页仍显示「已生成」；
3. 生成写库与编辑草稿落盘交错时，两组字段互不覆盖（假时钟构造交错）；
4. `RUNNING` 中被刷新的任务在启动对账后变为可重试的失败，提交入口解锁；
5. 队列单测在 `NULL_SINK` 下**一条不改**——端口引入不得改动既有 87 条生成测试的期望。

---

## 2. 增量二：blob 图片仓

### 2.1 采纳 `w4-image-store-8321` 的结构，不重做

W3 遗留缺口第 3 条是「宫格参考图只在内存里，object URL 刷新即失效」。
`cursor/w4-image-store-8321` 已经把这件事做完了，而且做对了三个最容易做错的地方。
本波的裁定是**采纳其结构**，不另起设计：

1. **落字节，不落 object URL。** `blob:` URL 的生命周期绑在当页文档上，刷新即失效；
   存 URL 等于存一条刷新后必然 404 的引用。图片仓存 `ArrayBuffer`，
   由读取方在展示时 `createObjectURL` 并负责 revoke。
2. **图片与项目记录平行两仓，图片不进项目记录。** 项目记录每次字段改动整条重写
   （自动保存 2s 一次），把几 MB 字节焊在里面等于每敲几个字搬一遍所有图片；
   而且备份是 JSON，图片留在记录里就得 base64 进文本。
3. **`beatboard` 单库集中开库**（`adapters/indexeddb/beatboardDb.ts`）。
   IndexedDB 的版本号是**库级**的：项目驱动按 v1 打开、图片仓按 v2 打开同一个库，
   后开的一侧必然 `VersionError`，或把先开的连接卡在 `blocked`。库名、版本号、建表
   全部收在一个文件，连接按 `IDBFactory` 缓存。

第 3 点是本波要**升格为规约**的：

> **规约 C2-DB-1**：`beatboard` 库的 `DB_VERSION` 与 object store 清单只允许在
> `adapters/indexeddb/beatboardDb.ts` 声明。任何槽位新增 store，改这一个文件的
> `DB_VERSION` 与 `upgrade()`，并在版本表追加一行。**禁止**在任何驱动里再调
> `factory.open()`。

### 2.2 两个版本号，两套语义，不要混

这是本增量最容易埋雷的地方。合并后仓库里会有**两个互不相干的版本号**：

| | `DB_VERSION`（`beatboardDb.ts`） | `SCHEMA_VERSION`（`persistence/schema.ts`） |
| --- | --- | --- |
| 管什么 | IndexedDB 的**物理布局**：有哪些 object store、哪些索引 | 落库**记录的字段结构**（导出封套也带它） |
| 谁读它 | 浏览器（`onupgradeneeded`） | `envelope.ts` 的迁移链 |
| 加图片仓要不要 +1 | **要**：新增 2 个 store + 2 个索引 → 1 → 2 | **不要**：项目记录字段一个没变 |
| 迁移写在哪 | `upgrade()`，判存在再建，不搬数据 | `MIGRATIONS[n]`，纯函数升一级 |
| 跨设备可见 | 否（本机物理布局） | **是**（备份文件带着它走） |

> **规约 C2-DB-2**：改 `DB_VERSION` **不得**顺手改 `SCHEMA_VERSION`，反之亦然。
> 两者同时改的提交必须在提交信息里分别说明理由——绝大多数情况下这是把两件事混了。

### 2.3 裁定：`Frame.reference_image_key` 不进落库结构

[`data-model.md`](../architecture/data-model.md) 曾规划 `Frame.reference_image_key`，
W3 遗留缺口第 3 条也提到「架构文档的 `reference_image_key` 还没进落库结构」。

**本波裁定：不加这个字段。** 理由不是省事，是**避免第二个事实源**：

图片的坐标是 `(projectId, beatIndex, frameOrder)`，这三者**全部可从项目结构推导**——
板序由五节拍锁固定、帧序由宫格锁固定。图片仓的主键就是这个坐标的编码
（`encodeFrameImageKey`）。所以「这一格有没有图」是一次**按坐标的存在性查询**，
不需要项目记录里存一份键。

如果加了这个字段，立刻多出三个必须处理的不一致态：字段有值但字节不在（图被清了）、
字节在但字段为空（写字段失败）、字段指向另一格的键（写错坐标）。三者都要检测、
都要修复流程。而不加字段，这三态在结构上不可表示。

代价说清楚：列「这个项目哪些格有图」需要查图片仓的 `byProject` 索引，
而不是读项目记录一条。该索引在 `beatboardDb.ts` 里已经建好了，代价是一次索引查询。

**推论（重要）**：因为不加字段，**加图片仓不需要 `SCHEMA_VERSION` +1，`MIGRATIONS` 仍为空表**。
Cycle 2 结束时 `SCHEMA_VERSION` 应当仍是 1。见 [`risks.md`](./risks.md) §3。

### 2.4 备份封套与图片：显式排除，不静默

`PersistedEnvelope` 是 JSON，图片是字节。三个选项与裁定：

| 选项 | 结论 |
| --- | --- |
| base64 进 JSON | **否**。一个项目 14 格图能把备份推到几十 MB，且 base64 膨胀 33%；`serializeEnvelope` 还带 2 空格缩进 |
| 导出 zip（JSON + 字节目录） | **推迟**。要引入压缩依赖，改导入导出的全部签名；Cycle 6「资产与参考图」再议 |
| **JSON 只导结构，图片显式排除 + 清单留痕** | **采纳** |

采纳方案的具体形态：封套新增一个**只读清单**（不是数据，是留痕）——
每个项目记下「有几张参考图、共多少字节」，导入时若清单非空而本机无对应字节，
UI 明确提示「本备份不含参考图，N 张需重新上传」。

关键是**不静默**：用户导出备份、换机导入、发现图没了，这件事必须在导入那一刻就说出来，
而不是等他打开编辑页看见空格子。清单字段是纯附加信息，不参与锁断言，
因此仍**不触发** `SCHEMA_VERSION` +1（读旧备份时该字段缺失按 0 处理）。

### 2.5 参考图接入生成请求：接口已通，缺的是取字节

W3 记了「生成请求里参考图键是按格序发的，链路已通」。合并后要补的是：
`buildSubmission` 需要拿到该板各格**是否有图**，而不是 object URL。

裁定：**`GenerateRequest` 不变，`SeedanceSubmission` 增一个可选字段。**
`domain/prompt.ts` 的 `buildGenerateRequest` 属领域层，不该知道图片仓的存在
（领域层禁止依赖 adapters，见 [`system-architecture.md`](../architecture/system-architecture.md) 的依赖方向）。
参考图在**适配器层**注入：

```ts
export interface SeedanceSubmission {
  // ...现有五个字段不变
  /** 按帧序排列的参考图，长度 0 或等于 frame_count。适配器层注入，领域层不知情。 */
  readonly reference_images?: readonly ReferenceImageRef[];
}
```

`ReferenceImageRef` 只带坐标与内容哈希，**不带字节、不带 object URL**——
字节由传输层在真正发请求时按坐标取，避免把几 MB 挂在一个会被反复
`Object.freeze` 和结构化克隆的对象上。

同时 `FORBIDDEN_SUBMISSION_KEYS` 要保持有效：参考图字段里**不得**出现
任何镜头级键名（L4），这条要加进 `adapter.test.ts` 的守卫。

---

## 3. 增量三：遗留分支的合并顺序

### 3.1 排序依据

四次合并（ca31 被 925d 包含，不单独合）。排序不按「谁先写完」，按三条：

1. **先合语义断裂需要人工重定向的，后合纯附加的。** 断裂的合并要跑 `typecheck` 才知道
   对不对；纯附加的合并 Git 说干净就基本是干净的。把需要动脑的放前面，
   是因为后面的合并会把前面的错误埋进更大的 diff 里。
2. **`styles.css` 只让一条分支碰。** a11y 与 image-store 都改 `styles.css`（+66 / +92）。
   实测两者与 `8ffe44f` 都不冲突（改的是不同区段），但**两者之间**没被验证过。
   让它们相邻合并，一旦冲突立刻定位。
3. **依赖在先。** image-store 要用 `frameCountFor`（W3 已有），templates 要改
   `transitions.ts`（feishu 的导出层会读衔接目录）。

### 3.2 合并顺序与逐条工作量

| # | 分支 | 冲突文件（实测） | 冲突性质 | 必做的重定向 |
| --- | --- | --- | --- | --- |
| **M1** | `cursor/w4-feishu-export-925d` @ `82f4845` | `routes/ExportPage.tsx` | 双方重写同一路由壳 | **取 925d 的壳**（拆出 `ExportView` 的做法对：兜底走在任何 Hook 之前），但把 `findDemoProject(id)` 换成 `useProject(id)` + `loading` 分支。`data/demoProjects` 已删，**不要为了让它编译而把夹具加回来** |
| **M2** | `cursor/w3-templates-golden-library-e98c` @ `21ae263` | `domain/transitions.ts`、`domain/transitions.test.ts` | 两侧各自扩了同一个目录 | 取**并集**：W3 侧的 6 项目录与 `CANON_TRANSITION_BY_BEAT_INDEX` 保留，templates 侧的 `canon_source` / `pending_canon` / `pending_canon_reason` 三字段与 `CANON_TRANSITION_RULES` / `PENDING_CANON_TRANSITIONS` / `isPendingCanonTransition` 附加上去。测试同理取并集（16 + 6）。**判据：合并后 `纯硬切` 仍通过 `isTransitionRule`，B3 的衔接值不变** |
| **M3** | `cursor/w4-a11y-6861` @ `d24127d` | `apps/web/package.json`、`package-lock.json` | 依赖增删 | 取并集，保留 `dom-accessibility-api ^0.7.1`（devDependency），重跑 `npm install` 让 lock 自洽。**不要手改 lock 文件**。`BeatBoard.test.tsx` Git 判干净，但 W3 改过它的数据源（改为内存仓储播种）、a11y 改过它的断言，**必须跑一遍确认 33 条 a11y 测试与 W3 的 BeatBoard 测试同时绿** |
| **M4** | `cursor/w4-image-store-8321` @ `3d4b5af` | `routes/EditorPage.tsx`、`store/ProjectsProvider.tsx`、`testing/harness.tsx` | 三方都被 W3 重写过 | ① `frameImageKey.ts` 把 `gridSizeForBeat` → `frameCountFor`（3 处），`GridSize` → `FrameCount`；② `FrameOrder` 与 W3 `domain/beats.ts` 的同名导出**重名**，改为从领域层导入而非自己声明；③ `EditorPage.tsx` 取 W3 的编辑区 + 生成接线，把 image-store 那 5 行面板挂载补上；④ `ProjectsProvider.tsx` / `harness.tsx` 取 W3 结构，附加 `FrameImagesProvider` 的注入 |

**每次合并后的固定闸门**（一条不过就不进下一次合并）：

```
npm run typecheck   # 语义断裂只有这里会报
npm run lint:terms  # L4：新进来的 export/share/images 目录都是新扫描面
npm test            # 用例数必须 ≥ 两侧最高值
npm run build
```

用例数基线（供对账）：`8ffe44f` = 435 vitest + 17 node:test。
M1 后应 ≥ 435 + 约 2100 行测试所含用例；M2 后 templates 的 37 + 衔接 6；
M3 后 a11y 的 33；M4 后 images 的约 1240 行测试所含用例。
**任一文件的用例数低于它在两侧的最高值 = 有测试被删，立刻回退。**

### 3.3 合并的属主与纪律

- 四次合并是**一个属主槽**的活（`W7-I1`，见 [`ready-queue.md`](./ready-queue.md) §1）。
  合并本质上不可路径互斥——它要动的正是别人也想动的文件。让两个槽位并行合流是
  制造第二轮冲突。
- **合并槽不做功能改动。** 允许的动作只有：解冲突、符号重定向、补挂载点、跑闸门。
  发现缺陷记入 [`DISPATCH.md`](./DISPATCH.md)，不在合并提交里顺手修——
  合并 diff 里混着功能改动，出问题时二分定位会失效。
- **每次合并一个提交，提交信息写明「取哪侧、为什么」**，沿用 W3 的
  `merge(w7): ...` 体例。W3 的 [`w3-integrate-store-gen.md`](../work/w3-integrate-store-gen.md)
  是这件事的范本：逐条冲突记裁决与理由。

### 3.4 合并完成后的状态

合流后 `apps/web/src/` 的模块版图（新增部分粗体）：

```
domain/          五节拍锁、Prompt 组装、衔接目录、**模板库**
prompt/          组装器
generate/        队列、状态机、拦截链、桩件适配器、**结果 sink**
adapters/
  persistence/   项目仓储、封套、迁移链、结构锁归一
  **images/**    参考图 blob 仓、坐标、配额、准入
  **indexeddb/** 单库集中开库
store/           项目 Provider、编辑器、工厂、**图片 Provider**
editor/          节拍板编辑区（**+ 无障碍**）
**export/**      成片页视图模型、段卡、拼接计划、下载命名
**share/**       飞书导出
routes/          三页
components/      外壳、导航、表单、**参考图面板**
```

---

## 4. 增量四：Seedance 真实适配器接口（不含任何密钥）

### 4.1 现有的缝是对的，别动它

`adapter.ts` 的传输层注入已经把边界划对了：

```ts
export type SeedanceTransport = (submission: SeedanceSubmission) => Promise<SeedanceTransportResult>;
```

适配器只做三件事（组请求体、跑前置校验、把提交交给传输层），排队与状态流转在队列层。
`SeedanceSubmission` 只有五个字段，**没有** API Key、没有账号信息、没有衔接/名称/备注、
没有任何镜头级结构，且 `FORBIDDEN_SUBMISSION_KEYS` 把这条写成了可测断言。

**本波不改这个缝。** 增量只补两处：传输层的**形状**不足以表达真实 API，
以及**配置从哪来**必须结构性地不可能带上密钥。

### 4.2 缺口一：单发 Promise 表达不了「提交 + 轮询」

现有传输层是「一次调用返回终态」。视频生成的真实形态几乎必然是
**提交拿任务 id → 轮询直到出片**（生成一段 8–25s 的视频不可能在一个 HTTP 往返内完成）。
把轮询塞进 `transport` 内部会有三个后果：超时无法配置、进度无法回显、
取消无法实现——而这三件事都得由队列管，不该埋在一个闭包里。

裁定：**传输层拆成两段，桩件同时实现两段。**

```ts
/** 提交结果：拿到上游任务号，或直接失败。 */
export type SeedanceSubmitResult =
  | { readonly ok: true; readonly remote_task_id: string }
  | { readonly ok: false; readonly failure: GenerateFailure };

/** 轮询结果：还在跑 / 出片 / 失败。 */
export type SeedancePollResult =
  | { readonly state: 'running'; readonly progress?: number }
  | { readonly state: 'succeeded'; readonly video_url: string }
  | { readonly state: 'failed'; readonly failure: GenerateFailure };

export interface SeedanceTransportV2 {
  submit(submission: SeedanceSubmission): Promise<SeedanceSubmitResult>;
  poll(remoteTaskId: string): Promise<SeedancePollResult>;
  /** 可选：上游支持取消时实现；不支持则不实现，队列据此决定要不要给取消按钮。 */
  cancel?(remoteTaskId: string): Promise<void>;
}
```

**兼容性**：保留现有的单发 `SeedanceTransport` 作为「一步到底」的特例，
提供 `fromOneShot(transport): SeedanceTransportV2` 适配（`submit` 立刻返回一个本地
任务号并缓存结果，`poll` 直接吐出）。这样 87 条既有生成测试**一条不用改**。

`GenerateJob` 相应增两个可选字段：`remote_task_id`（对账用）与 `progress`（回显用）。
两者可选、缺省 `null`/`undefined`，**不触发 `SCHEMA_VERSION` +1**（任务表不在
`PersistedEnvelope` 里；这件事本身是一条风险，见 [`risks.md`](./risks.md) §4）。

轮询策略（退避）也在本层定，不进适配器：首次 2s，之后 ×1.5 封顶 15s，
总时长上限按 `params.duration_sec` 推导（`max(120s, duration_sec × 20)`）。
超时归 `API_ERROR / POLL_TIMEOUT`，可重试。

### 4.3 缺口二：配置怎么进来，且结构性地不可能带密钥

三条硬约束，按「让违规不可表示」的顺序排：

**约束 1：适配器不读环境变量。** 现在 `adapter.ts` 文件头已经写明「不读任何
API Key / 环境变量」。把这句话变成结构：配置以**参数**注入，模块内部没有任何
`import.meta.env` / `process.env` 的读取点。CI 加一条扫描：
`generate/**` 与 `domain/**` 出现 `import.meta.env` 或 `process.env` 即失败。
读环境变量的地方只有一处——应用组装根（`main.tsx`）。

**约束 2：客户端配置里没有「密钥」这个概念。** 真实适配器的配置**只有**：

```ts
export interface SeedanceEndpointConfig {
  /** 代理服务的基地址。空串 = 不启用真连，回落桩件。 */
  readonly baseUrl: string;
  /** 单次请求超时（毫秒）。 */
  readonly timeoutMs: number;
  /** 轮询上限，防止上游卡死时无限轮询。 */
  readonly maxPollMs: number;
}
```

**没有 `apiKey` 字段，没有 `token` 字段，没有 `Authorization` 头的拼装点。**
鉴权由代理服务端完成（PRD NFR「Key 不落客户端」，
[`wave-plan.md`](../backlog/wave-plan.md) Cycle 13 的「最小代理服务端」）。
前端能配的只有「代理在哪」。

这不是把问题推给未来：**在代理存在之前，真连就是不可用的**，而这恰好是正确的产品状态。
`baseUrl` 为空时回落桩件，本地开发与全部测试照常跑。用「加个 `VITE_SEEDANCE_API_KEY`
先跑通」来提前解锁真连，等于把密钥打进客户端 bundle——那是不可逆的泄漏，
构建产物在谁手里都能读。

**约束 3：把「不含密钥」做成测试与扫描，不做成纪律。**

| 守卫 | 位置 | 判据 |
| --- | --- | --- |
| 提交体键名 | `adapter.test.ts` | `FORBIDDEN_SUBMISSION_KEYS` 扩充 `authorization` / `bearer` / `credential` / `api_secret`；深度遍历提交体（含 `reference_images`）逐键断言 |
| 类型层 | `SeedanceEndpointConfig` | 无密钥字段可填 → 想传也没地方传 |
| 源码扫描 | CI，随 `lint:terms` 一道 | `generate/**`、`domain/**`、`adapters/**` 内 `import.meta.env` / `process.env` 零命中 |
| 构建产物扫描 | CI，`build` 之后 | `dist/**` 内 `sk-` / `api_key` / `apiKey` / `secret` 等模式零命中。**这一条是唯一能兜住"某人图省事"的闸门**，因为它检查的是产物，不是意图 |

### 4.4 错误映射：三类封闭不变

`GENERATE_ERROR_CLASSES` 是封闭三项（参数缺失 / 接口异常 / 内容违规），
细分走 `code`。真连时**不新增类目**，只补 `code`。预留映射表（真连槽位按实测回填）：

| 上游情形 | `error_class` | `code` | `retryable` |
| --- | --- | --- | --- |
| 网络不可达 / 5xx | `API_ERROR` | `UPSTREAM_ERROR` | 是 |
| 限流 429 | `API_ERROR` | `RATE_LIMITED` | 是（退避后） |
| 轮询超时 | `API_ERROR` | `POLL_TIMEOUT` | 是 |
| 代理未配置（`baseUrl` 空而调用方要求真连） | `API_ERROR` | `ENDPOINT_UNCONFIGURED` | 否（要改配置） |
| 鉴权失败（代理回 401/403） | `API_ERROR` | `UPSTREAM_UNAUTHORIZED` | 否。**注意归 `API_ERROR` 而非新类目**，且消息里不得回显任何凭据片段 |
| 内容审核拒绝 | `CONTENT_VIOLATION` | `MODERATION_REJECTED` | 否 |
| 请求体校验失败（上游说字段不对） | `PARAM_MISSING` | `UPSTREAM_SCHEMA_REJECTED` | 否 |

### 4.5 本增量在 Cycle 2 的交付边界

Cycle 2 **不做真连**（真连是 Cycle 5 / W21–25）。本增量在 Cycle 2 的交付是：

1. `SeedanceTransportV2` 接口 + `fromOneShot` 兼容层 + 桩件的两段实现；
2. 轮询与退避跑在桩件上（可注入假时钟），队列层的超时/取消语义有测试；
3. `SeedanceEndpointConfig`（无密钥字段）+ 组装根注入 + `baseUrl` 空则回落桩件；
4. 四条守卫（提交体键名、类型层、源码扫描、产物扫描）全部接入 CI。

到 Cycle 5 时，「填实」应当只需要写一个 `SeedanceTransportV2` 的 HTTP 实现，
队列、状态机、拦截链、错误类目、sink、对账**一行不动**。这是本增量的价值判据：
**真连是加一个文件，不是改一片文件。**

---

## 5. 明确不变的部分

避免下游槽位过度解读，逐条列出本波**没有**动的口径：

| 口径 | 状态 |
| --- | --- |
| 五节拍锁（恒 5 板、序与语义不可变） | 不变 |
| 宫格锁（B1–B4 = 3、B5 = 2，帧序左→右） | 不变 |
| 单板 ≤ 30s 硬锁；整集 70–90s 软区间 | 不变（区间的阻断改进在 W9，见 ready-queue） |
| 衔接永不进 Prompt 与请求体 | 不变。图片仓与 sink 都不经过组装器 |
| Seedance 2.5 独占，无模型选择器 | 不变 |
| 本地优先，无服务端 | 不变。代理服务仍是 Cycle 13 |
| 锁分层（结构锁在编辑路径每帧断言 / 取值锁在落库前断言） | 不变。`applyGenerateResult` 走落库前全量断言 |
| 三页三路由 | 不变。图片面板与飞书面板都是页内单元 |
| `SCHEMA_VERSION = 1`、`MIGRATIONS` 空表 | **不变**，且本波裁定 Cycle 2 结束时仍应为 1（见 §2.3） |

---

## 6. 增量与既有架构文档的关系

本文是增量，不是替代。合流后需要回写的架构文档（**由 W11 架构波执行，实现波只读**）：

| 文档 | 需回写的点 |
| --- | --- |
| [`system-architecture.md`](../architecture/system-architecture.md) | 数据流补「生成结果 → sink → 仓储」这一条；四层图里 `adapters/images` 与 `adapters/indexeddb` 归位 |
| [`data-model.md`](../architecture/data-model.md) | 删除 `Frame.reference_image_key` 的规划（§2.3 裁定不加）；`GenerateJob` 补 `remote_task_id` / `progress` |
| [`tech-stack.md`](../architecture/tech-stack.md) | §2.1 存储布局补图片两表与索引；§3.3 适配器映射表按 §4.4 预填；补两个版本号的语义区分 |
| [`prompt-engine.md`](../architecture/prompt-engine.md) | 无需改动（参考图在适配器层注入，组装器不知情） |
| [`ready-queue.md`](../backlog/ready-queue.md) §3 | 文件归属表补 `export/**`、`share/**`、`adapters/images/**`、`adapters/indexeddb/**` |

**本波不改这些文件**：路径归属上它们属架构波，但同时被多条未合流分支间接依赖，
在合流完成前改会制造第六个冲突面。这是本波选择写 `docs/cycle2/**` 新目录的原因。
