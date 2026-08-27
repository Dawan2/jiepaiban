# W8 / MERGE-GEN-PERSIST —— 生成结果落库通道并入模板合并线

**分支** `cursor/w8-merge-gen-persist-c99e`
**基底** `cursor/w7-merge-templates-9e75` @ `acab82b0ff0807a87c9600d3f65f9a1493286400`
**并入** `cursor/w7-gen-persist-9e0d` @ `4b9310b3e4087c942dd08eaf36809c973f5b5c71`
**合并基** `8ffe44ff36e421235989d646323f6b4a9ac3c86b`（W3 store/generate 集成线）
**合并提交** `569b4ed`

派单要求「若已存在更新的合并头（w8 feishu）就并到那个头上，别分叉」。
收工时远端**没有任何 w8 分支**，24 个远端分支里最新的合并头就是
`cursor/w7-merge-templates-9e75`，所以并到它上面——这就是不分叉的那个选择。

---

## 一、冲突裁决 —— 一处都没有

两侧相对合并基 `8ffe44f` 动的文件集**完全不相交**，`ort` 直接合上，没有需要人裁决的地方：

| 侧 | 动过的文件 |
| --- | --- |
| 基底（模板线） | `components/NewProjectForm.tsx`、`domain/{templates,transitions,index}`、`routes/ProjectsPage.tsx`、`store/{ProjectsProvider,projectFactory}`、`styles.css` |
| 并入（落库线） | `generate/{controller,queue,types}`、`routes/EditorPage.tsx`、`store/{generateResults,useProjectEditor}` |

文件不相交不等于语义不相交，真正的合并缝在下面第二节。

### 两条硬要求逐条对账

派单点名要保住的两件事，都在合并结果里原样活着：

**1. `onSettle` 的仓储写入 —— 保住。** 落库链路一环不缺：

```
任务进终态 → queue.onSettle → generateResults.settle() → 读库 → 合进那一板 → repository.save
                                                       → onPersisted → editor.patch()（不置未保存态）
```

- `generate/types.ts` 的 `isTerminalStatus()`（由状态迁移表推导，不另抄枚举）
- `generate/queue.ts` 在 `store.save` 之后触发 `options.onSettle?.(saved)`
- `generate/controller.ts` 把 `onSettle` 转给自建队列，注入外部队列时抛错拒绝改别人的接线
- `routes/EditorPage.tsx` 里 `useGenerateResultWriter({ repository, ... })` + `onSettle: results.settle`
- `store/useProjectEditor.ts` 的 `patch()`：只更新草稿，不置 `dirty`

**2. 模板起手路径 —— 保住。** 入口链路一环不缺：
`NewProjectForm` 的「起手内容」单选 → `ProjectsPage.handleCreate(input, templateId)` →
`ProjectsProvider.createProject(input, templateId?)` → `projectFactory.createTemplateProject()` →
`domain/templates.createProjectFromTemplate()`。默认仍是空白五板，套模板仍是显式选择。

**3. 测试 —— 一条没丢。** 见第三节的用例数对账。

---

## 二、合并缝：`beat.status` 的归属

两侧文件不重叠，但**共用 `beat_list` 的写盘和 `beat.status` 这一个字段**，而且各自赋予它不同含义：

- 模板路径靠 `status: 'filled'` 表达「这是一份可以逐字改写的起手稿，不是 5 块空板」——
  这正是该路径存在的理由。
- 落库通道要把同一个字段推到 `generated` / `failed`。

落库线为此改了 `EditorPage.withDrafts()`：原先把编辑态的 `status` 盖回落库结构，
改成保留库里那份（`beat.status = previous.status`）。理由是编辑态里的 `status` 是
**挂载那一刻的快照**、编辑区从不改它，拿它盖回去会把落库通道刚写下的 `generated` 退回。

这一改动**与模板路径相容**，不是让位：

- 全仓 `'filled'` 的写入点只有 `domain/templates.ts` 与两个测试脚手架
  （`testing/harness.tsx` / `testing/goldens.ts`），编辑路径从不翻转 `status`。
- 因此「编辑不会把 `empty` 翻成 `filled`」在改动前后都成立——改前用的是挂载快照，
  改后用的是库里那份，对未生成的板取值相同。
- 对模板项目，`previous.status` 就是 `filled`，起手稿的状态原样留住。

差别只出现在生成之后：改前，生成后再编辑一次会把 `generated` 退回挂载时的 `filled`；
改后不会。落库线的改法严格更正确。

**这条缝两边的原有用例都测不到**：模板侧的用例不跑生成，落库侧的用例不走模板路径。
谁盖掉谁，两个父分支的 500 / 474 例都照旧全绿。所以本槽位在这里补了 6 例
（`routes/EditorPage.test.tsx` 的「模板起手的项目跑生成（W8 合并缝）」suite），
外加脚手架 `makeTemplateProject()`——它走真实的 `createTemplateProject()`，
于是断言能区分「模板起手内容被保住了」和「测试自己填的占位文案」。

6 例覆盖：

1. 模板文案落库即可直接生成，不必先自己填满 5 块板（「生成本板」可点即前置校验过了）
2. 落库通道把 `status` 推到 `generated`，模板的情绪 / 节奏 / 剧情核心 / 帧描述一字不变，
   且顶部栏不跳「未保存」
3. 没生成的那 4 板留在 `filled`、`video_url` 仍为 `null`，不被连带改写
4. 模板项目点完生成就离页，结果照样落库（挂点在状态机上，不在编辑页）
5. 生成后改写模板起手稿再保存，成片地址与 `generated` 都不被盖回
6. 整集生成后 5 板全部落库，结构锁不变（宫格 3/3/3/3/2），
   模板文案进了 Prompt 快照而衔接手法进不去（AC-6.4）

### 这 6 例是不是真的钉住了东西 —— 反向验证

补完就跑一次「故意改坏，看它红不红」，避免写出永远绿的用例：

| 故意去掉 | 变红的用例 |
| --- | --- |
| `withDrafts` 里的 `beat.status = previous.status` | 落库侧 1 例 + 合并缝第 5 例 |
| `EditorPage` 里的 `onSettle: results.settle` | 落库侧「点完生成就离页」+ 合并缝第 4 例 |

第二行值得记一句：去掉 `onSettle` 只让**离页**用例变红，挂载状态下的用例仍绿——
因为 `EditorPage` 还留着一条补写 effect（`jobResultPending` → `results.settle`）兜底。
这是落库线的设计：`onSettle` 管「离页之后才跑完」，effect 管「上次写盘失败 / 换机导入的残留」。
所以 `onSettle` 这条线只能由离页用例守住，两个都在。

---

## 三、验证

`typecheck`（`tsc --noEmit`）、`lint:terms`、`test` 全绿。

| 阶段 | 测试文件 | 用例 |
| --- | --- | --- |
| 合并基 `8ffe44f` | 22 | 435 |
| 基底 `acab82b`（模板线，独立） | 23 | 500 |
| 并入 `4b9310b`（落库线，独立） | 23 | 474 |
| 合并后 `569b4ed` | 24 | 539 |
| 补合并缝用例后 | 24 | **545** |

四个数字都是实测（对两个父提交与合并基各起 worktree 跑了一遍 `vitest run`），不是抄来的。

**合并只增不减，而且严格可加**：`435 + 39 + 65 = 539`。
落库线相对合并基净增 39 例，模板线净增 65 例，两份增量在合并后一条不少、一条不重。
新增的第 24 个测试文件是落库线带来的 `store/generateResults.test.ts`（25 例）。

术语闸门 `node --test scripts/forbidden-terms.test.mjs` 17 例全绿：
合并缝用例引的是 `BANQUET_HOOK_TEMPLATE` 的模板文案，没有引入禁用词。

---

## 四、剩余合并清单

以本分支为基底，冲突面用 `git merge-tree --write-tree` 对**当前头**实测，不是沿用上一槽位的估计。

### 1. export + feishu —— 仍是一次合并

`cursor/wave2-w2-export-ca31` 已经是 `cursor/w4-feishu-export-925d`（`82f4845`）的祖先，
合 feishu 即把 export 带进来，不要再单独合 export。

- 体量：31 文件，+4528 / −58
- 冲突：**1 处** —— `routes/ExportPage.tsx`（两边都把成片页从占位换成真实实现）
- 本次合并没有扩大它：落库线没碰成片页
- 备注沿用上一槽位：`share/feishuMarkdown.ts` 把衔接写进给人读的飞书文档不违反 AC-6.4
  （红线是「不进 Prompt 与生成请求体」），但合完要确认它没有反向流回 `domain/prompt.ts`

### 2. a11y

- `cursor/w4-a11y-6861`（`d24127d`），12 文件，+946 / −49
- 冲突：**2 处**，都是依赖清单 —— `apps/web/package.json`、`package-lock.json`，取并集即可
- 本次合并没有扩大它

### 3. images —— 冲突面被本次合并**扩大了**，放最后

- `cursor/w4-image-store-8321`（`2390f80`），25 文件，+3058 / −50
- 冲突：**4 处** —— `README.md`、`routes/EditorPage.tsx`、
  `store/ProjectsProvider.tsx`、`testing/harness.tsx`

文件数与上一槽位相同，但其中两处的内容变重了，合的时候要一并守住三样东西：

- `store/ProjectsProvider.tsx`：`createProject(input, templateId?)` 的第二个参数不能被
  images 那侧的签名覆盖，否则套模板的入口会静默退回空板路径（上一槽位已标出的风险，仍在）。
  另外 images 那侧也用 `useProjects()`，注意别把 context 里的 `repository` 挤掉——
  落库通道靠它写盘。
- `routes/EditorPage.tsx`：本次合并把这个文件改了 80 行（落库通道的接线全在这里）。
  合并时 `useGenerateResultWriter` / `onSettle: results.settle` /
  `withDrafts` 里的 `beat.status = previous.status` 三处一个都不能丢，
  丢了对应的用例会红（见第二节的反向验证表）。
- `testing/harness.tsx`：本槽位在这里加了 `makeTemplateProject()`，
  images 那侧也改了同一个文件，取并集。

其余分支：`cursor/w6-cycle2-architecture-b5b9`（`f1dfe37`，4 文件 +1457）与
`cursor/verify-cycle-1-w5-4b54`（`24ffea7`，2 文件 +642）实测**零冲突**，都是纯文档，随时可并。
