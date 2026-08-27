# W8 / MERGE-FEISHU —— 成片页与飞书导出并入集成线，并接到落库项目上

**分支** `cursor/w8-merge-feishu-45d1`
**基底** `cursor/w7-merge-templates-9e75` @ `acab82b0ff0807a87c9600d3f65f9a1493286400`
**并入** `cursor/w4-feishu-export-925d` @ `82f4845f35ba006dd842146a3df70d9319214f61`
**合并基** `a8f6f26d508b10662aa3c1c4a374841535a1f2b1`（W2 prompt/generate 槽位）

两件事：把成片页与飞书导出合进集成线（合并本身），
再把成片页接到**落库的项目**上——它原来读的是已经删掉的演示夹具（本槽位的实质工作）。

W7 的清单说得对：`cursor/wave2-w2-export-ca31`（`c92ce40`）**已经是**
feishu 分支的祖先，合 feishu 即把成片页导出一并带进来，没有单独合 export 这一步。

---

## 一、冲突裁决

feishu 分支相对合并基动了 31 个文件，其中 29 个是新增（`src/export/**`、`src/share/**`、
两份槽位文档），与基底重叠的只有一个：

| 文件 | 情况 | 裁决 |
| --- | --- | --- |
| `src/export/**`（18 文件） | 基底没有 | 直接落地 |
| `src/share/**`（9 文件） | 基底没有 | 直接落地，飞书面板原样保留 |
| `docs/work/w2-export-page.md` / `w4-feishu-export.md` | 基底没有 | 直接落地 |
| `routes/ExportPage.tsx` | **冲突** | 取基底的数据源 + feishu 的页面本体，见下 |

12 个测试文件两侧同名，但**feishu 侧那 12 份与合并基逐字节相同**（该分支没动过它们），
所以基底演进后的版本原样带过，没有一条断言被并集吃掉。已逐文件核对：
`domain/beats` / `transitions` / `locks` / `projects` / `prompt` / `prompt.golden`、
`generate/queue` / `controller` / `adapter` / `interceptors` / `store`、`App`。

### 唯一的冲突：`routes/ExportPage.tsx`

两侧都把成片页从占位换成了真实实现，但换的是**不同的两半**：

| | 基底（集成线） | feishu 分支 |
| --- | --- | --- |
| 取项目 | IndexedDB，`useProject(id)`，带 loading / 不存在两态 | `findDemoProject(id)`（演示夹具） |
| 页面本体 | 就地渲染的简版段卡 | `export/ExportView.tsx`（段卡 + 拼接计划 + 衔接总表 + 交付导出 + 飞书面板） |

裁决：**数据源取基底，页面本体取 feishu**。
`data/demoProjects.ts` 已随 W2 删除，合并时 git 也没有把它带回来（一侧删除、另一侧未动），
所以 feishu 那半个 import 不是「二选一」的选项，而是根本没有落点。

---

## 二、把成片页接到落库项目上（本槽位新增）

把两半拼起来还不够。`ExportView` 的段卡状态**只读内存里的生成队列**
（`buildSegmentCards(project, controller.snapshot())`），而生成控制器是随页面新建的——
刚打开成片页时队列必然是空的。在演示夹具那个世界里这没问题（反正也没有落库的成片），
接上真实的库之后它就是个错：

> 库里明明存着五段已交付的成片，成片页却一齐显示「未生成」，
> 「全部下载」与「导出交付包清单」被判为缺片而禁用，
> 五张卡的重投按钮还都带着「本段还没生成过，先回编辑页填字段并生成」。

### 两个来源，落库那份是底

`export/segments.ts` 改成合流两个来源，规则写在 `resolveGeneration()` 里：

| 本板情形 | 徽章 / 状态 | 成片地址与 Prompt 快照 |
| --- | --- | --- |
| 本次会话没有任务 | 有落库地址即「成功」，否则照旧「待生成」 | 落库那份 |
| 有任务且成功 | 跟任务 | 任务那份（更新，覆盖落库） |
| 有任务但在途 | 跟任务（「生成中」看得见） | **回落到落库那份** |
| 有任务但失败 | 跟任务（失败原因看得见） | **回落到落库那份** |

后两行是刻意的：**重投失败或还在跑，不该把上一段已经交付的成片从页面上抹掉**。
后期合成的人手里那一版还在，页面就该还能下载它。

段卡因此多两个字段：`state_source`（`live` / `stored`，把上面这张表变成可断言的）
与 `prompt_snapshot`（实际提交过的 Prompt 全文）。

`regenerateGate()` 跟着改两处：落库有地址即算「生成过」，可以重投；
以及**没有任务时的 `PENDING` 表示「从未提交」而不是「排队中」**，不能当在途拦下来——
原来那条 `state.status === 'PENDING'` 会把所有落库的段判成「正在生成」。

读落库字段用的是结构式声明（`StoredGeneration`）而不是 import 持久化层的 `StoredBeat`：
成片页只需要「板上**可能**带这两个字段」这件事，不需要认识 IndexedDB，
领域项目与落库项目都能直接传进来。空串与 `null` 一样算未生成，判据与 `hasVideo()` 一致。

### Prompt 快照可溯（AC-6.9）

`export/projectExport.ts` 与 `share/feishuDoc.ts` 原来都是现算 `assemblePrompt(project, beat)`。
现在优先取段卡上的提交快照，只有从未生成过的板才现算，并在项目 JSON 里加一个
`prompt_is_snapshot` 说明取的是哪一条路。

理由：生成之后又改了文案时，档案里该记的是**当时真的发出去的那份**。
现算的一份会跟着当前字段漂移，那就不叫快照了。

### 落库：成片页重投的结果也要写回

编辑页早就在写回 `video_url` / `prompt_final` 了。成片页有「重新生成」，同样得写，
否则本页重投完一刷新就退回上一版。判据与写法提取成 `store/generated.ts`
（`pendingGeneratedStates` / `withGeneratedResults`），编辑页改为调用它，两处不再各写一套。

分工上，`ExportView` 不认识仓储：它只把队列状态经 `onStatesChange` 报上去，
落库由路由壳 `ExportBoard` 用编辑页那套保存引擎（`useProjectEditor`：2s 防抖 + 离页强制 flush）完成。
「库内已一致就一个字都不写」这条必须在，否则只是打开成片页就会被记成一次保存。

### 红线：`assemblePrompt` 的衔接排除一个字没动

- `domain/prompt.ts` 与 `prompt/assemble.ts` 本次合并**未被触碰**。
  排除仍是类型层的：`title` / `transition_rule` / `note` 不在 `PromptBeatView` 里，
  组装器够不着。
- 落库的 `prompt_final` 出自任务的 `prompt_snapshot`，而快照出自同一个白名单组装器，
  所以「优先取快照」这条新路**不构成新的泄漏面**——它取的仍是组装器产物。
  这一点在 `projectExport` / `feishuDoc` / `store/generated` 三处各有一条断言。
- `share/feishuMarkdown.ts` 会把衔接写进给人读的飞书文档，**保留**。
  AC-6.4 的红线是「不进 Prompt 与生成请求体」，不是「不给人看」。
  逐节检查后确认它没有反向流回组装路径：飞书文档里衔接只出现在
  「组间衔接总表（后期合成）」那一节，该节之前的正文（含 Prompt 全文那一节）
  一个衔接取值都没有，新增的页面级断言按标题切开正文逐段复查。

---

## 三、验证

CI 四道闸门全绿（`typecheck` / `lint:terms` / `test` / `build`）。

| 阶段 | 测试文件 | 用例 |
| --- | --- | --- |
| 基底 `acab82b` | 23 | 500 |
| feishu 分支 `82f4845`（独立） | 21 | 323 |
| 合并后 | 32 | 621 |
| 接上落库项目后 | 34 | **656** |

合并只增不减，逐文件对账：

- feishu 独有的 9 个测试文件 **121 例原样带入**：
  `share/feishuMarkdown` 27、`share/feishuDoc` 17、`export/ExportView` 19、
  `share/FeishuExportPanel` 10、`export/segments` 12、`export/projectExport` 13、
  `export/stitchPlan` 9、`share/clipboard` 7、`export/naming` 7。
- 两侧同名的 12 个测试文件全部保留基底版本（feishu 侧未动过它们），用例数不变。
- 500 + 121 = 621，与实测一致，没有缺口。

新增 35 例：

- `routes/ExportPage.test.tsx` **12 例（新文件）**。这一页是本次合并唯一的冲突点，
  也是唯一可能悄悄退回演示夹具的地方，所以断言跑在真实路由树 + 内存仓储上：
  项目名与 5 张段卡来自仓储、演示夹具的项目名不再出现在任何页面上、
  **队列为空时五张落库的卡照旧是已生成**（下载链接指向落库地址、重投按钮可用）、
  只落库三段时缺片提示点名节拍 4/5、项目不存在时兜底且不渲染段卡、
  本页重投后新地址与新快照写进仓储且其余四段不动、落库快照里没有衔接、
  只是打开页面不写库、飞书面板三个出口都在、
  以及飞书 Markdown 按「组间衔接总表」标题切开后前半段不含任何衔接取值。
- `export/segments.test.ts` 12 → 20。覆盖上面那张两源合流表的每一行：
  空队列读落库、落库的段可直接重投、落库快照上卡、落库态没有完成时刻就写占位符、
  新结果盖掉落库那份且来源标 `live`、重投失败仍可下载旧片、在途重投徽章走队列而旧片仍可下载、
  空串地址不算成片。
- `store/generated.test.ts` **8 例（新文件）**。库内已一致时返回空（保存态不该被推成 dirty）、
  换了新地址算新结果、没地址的状态一律不算、写回后结构锁仍在、只动点到的那块板、
  任务缺快照时保留库里那份、落库快照里没有衔接与备注（用真正的组装器出快照，不是拿常量凑）。
- `export/projectExport.test.ts` 13 → 17、`share/feishuDoc.test.ts` 17 → 20。
  已生成的板取落库快照、事后改文案不让快照漂移、从未生成过的板现算并标明不是快照、
  走快照这条路衔接 / 名称 / 备注照旧一个字不在、落库的成片进得了交付清单。

原有断言一条未改。

夹具补了两个，都刻意与生产路径同形：`export/fixtures.withStoredGeneration()`
就地补落库字段（写法与 `toStoredBeat` 一致），`prompt_final` 由组装器现算；
`testing/harness.withVideos()` 也一并写 `prompt_final`，
让「快照可溯」的断言跑在真实形状而不是手捏的字符串上。

---

## 四、剩余合并清单

以本分支为基底，冲突面是 `git merge-tree` 实测。

### 1. a11y

- 分支 `cursor/w4-a11y-6861`（`d24127d`），12 文件，+946 行，含 `editor/a11y.test.tsx` 445 行
- 冲突：**2 处**，都是依赖清单 —— `apps/web/package.json` 与 `package-lock.json`
  （a11y 加了一个 devDependency）。取并集即可，不涉及语义裁决。
- `AppLayout.tsx` / `BeatNav.tsx` / `BeatBoard.test.tsx` / `styles.css` 都能自动合并。
- 本槽位没动这四个文件，W7 给出的判断不变。

### 2. images

- 分支 `cursor/w4-image-store-8321`（`2390f80`），25 文件，+3058 行
  （`adapters/images/**` 参考图存储、`FrameImagePanel`、`FrameImagesProvider`）
- 冲突：**4 处** —— `README.md`、`routes/EditorPage.tsx`、
  `store/ProjectsProvider.tsx`、`testing/harness.tsx`（数量与 W7 的实测一致）
- W7 已经点出的那条仍然要小心：`ProjectsProvider.createProject(input, templateId?)`
  的第二个参数不能被 images 那侧的签名覆盖，否则套模板的入口会静默退回空板路径。
- **本槽位新增两条注意**，都落在上面那 4 个冲突文件里：
  - `routes/EditorPage.tsx`：生成结果回写已经提取成 `store/generated.ts` 的两个函数，
    页内不再有 `pendingVideoUrls` 与那段就地拼装的 `hydrateProject`。
    images 那侧对本文件只加了 5 行（挂 `FrameImagePanel`），
    合并时取并集即可，但**不要把已经删掉的那段回写代码带回来**——
    带回来会与新模块两处各写一遍，且成片页那条路不会跟着走。
  - `testing/harness.tsx`：`withVideos()` 现在还会写 `prompt_final`（由组装器现算），
    `makeProject` / `withFilledBeats` / `seedRepository` / `renderApp` 未变。
    images 那侧改的是同一个文件的另一处（+43 行，加参考图夹具与 provider 接线），
    取并集时保留 `withVideos` 里那行 `copy.prompt_final = assemblePrompt(...)`，
    否则成片页与导出侧的「快照可溯」断言会失去被测对象而空转。
- `styles.css` 与 `vitest.setup.ts` 能自动合并；`routes/ExportPage.tsx` 不在 images 的改动面内。

两条不含彼此的祖先关系，顺序可调；建议先 a11y（只有依赖清单要并），
把需要人工裁决的 images 放最后。
