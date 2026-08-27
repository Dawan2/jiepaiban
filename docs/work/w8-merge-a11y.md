# W8 / MERGE-A11Y —— 无障碍与键盘作业并入持久化store线

**分支** `cursor/w8-merge-a11y-aef8`
**基底** `cursor/w8-merge-gen-persist-c99e` @ `85e669b704e85a3845e594799b4dedc6406e5348`
**并入** `cursor/w4-a11y-6861` @ `d24127d2a5f3937bc61d1aabf6e268f94bd4688e`
**合并基** `a3aed39a227352f10689cc446087fcdf092d8586`（W2 集成线）
**合并提交** `e559ea4`

## 零、INTO 的选择：为什么不是 feishu 头

派单说「若存在更新的 feishu 合并头，改用它作 INTO」。远端确实有
`cursor/w8-merge-feishu-45d1` @ `f0fc0f0`，但它**不更新**，两条都查过：

| 判据 | `w8-merge-feishu-45d1` | `w8-merge-gen-persist-c99e` |
| --- | --- | --- |
| 提交时间 | 15:55:03 | **15:56:52** |
| 含对方的头 | 否 | 否 |
| 含落库通道（`onSettle`） | **否** | 是 |
| 含模板起手路径 | 是 | 是 |

两个 W8 头是从同一个 `acab82b`（W7 模板合并线）**并行**分叉的，互不包含。
feishu 头比 gen-persist 头早 109 秒，且**没有** `onSettle` 落库通道——
拿它作 INTO 就直接违背派单同一句里的「保住 onSettle persist」。
所以 INTO 仍是 `c99e`。feishu 归入剩余清单，第四节给出它的合并裁决规则。

---

## 一、冲突裁决

`ort` 报了 2 处，实际要处理的是 3 处——第三处 git 报不出来。

### 1.1 依赖清单两处：取并集

| 文件 | HEAD 侧 | a11y 侧 | 结果 |
| --- | --- | --- | --- |
| `apps/web/package.json` | `fake-indexeddb ^6.2.5` | `dom-accessibility-api ^0.7.1` | 两个都留 |
| `package-lock.json` | 同上 | 同上 | 同上 |

两侧改的是 `devDependencies` 里相邻的同一行区间，语义上毫无关系：
`fake-indexeddb` 是落库线跑 IndexedDB 用的，`dom-accessibility-api` 是 a11y 线
算无障碍名用的（原本只是 `@testing-library/dom` 的传递依赖，a11y 槽位把它提为显式声明）。
并集后 `npm install` 未改写锁文件，无版本漂移。

### 1.2 第三处：`data/demoProjects` 已被删除，git 不报

`editor/a11y.test.tsx` 是 a11y 侧**新增**文件，它 `import { demoProjects } from '../data/demoProjects'`。
而 `apps/web/src/data/demoProjects.ts` 在 W2 集成时**已删除**（页面测试改为自己播种仓储）。

这是一个「一侧删文件、另一侧新增了引用它的文件」的组合：a11y 侧从未修改
`demoProjects.ts` 本身，所以 `ort` 认为删除方无争议、直接采纳删除，**不报冲突**。
合并结果因此是文本上干净、类型上必错的状态：

```
src/editor/a11y.test.tsx(21,30): error TS2307: Cannot find module '../data/demoProjects'
```

**这类冲突只有 typecheck 能抓到，`git merge` 的冲突数不是合并完成度的度量。**

裁决：改走落库线的仓储播种脚手架，与同目录的 `BeatBoard.test.tsx` 一致——

```ts
let repository: LocalRepository;

beforeEach(async () => {
  repository = await seedRepository([makeProject(projectId)]);
  await renderEditor();   // renderApp(`/p/${projectId}`, { repository }) + findByRole 等读库完成
});
```

不是降级适配，是升级：断言从此跑在「真的从仓储读出来」的路径上，
而不是一个硬编码常量上。无障碍树的形状与数据来源无关，33 条断言一条未改判定强度。

派生的一处修正：旧演示数据给 B1–B3 预填了情绪 / 镜头节奏 / 剧情核心，
`makeProject()` 是**全空**的五板。因此「就绪 / 待补全」那条用例原先只填情绪 + 3 格就能翻到就绪，
现在必须把 `剧情核心` / `镜头节奏` 也补上（与 `BeatBoard.test.tsx` 里同一件事的既有配方一致）。
仍全程按无障碍名定位控件——这条路径本身就是键盘用户补齐一板的走法。

---

## 二、合并缝：`role="status"` 不再全页唯一

两侧改的文件集不相交（a11y 侧碰的 `AppLayout` / `BeatNav` / `BeatInfoBar` /
`GridCellCard` / `PromptPreview` / `TransitionPanel` / `styles.css` 全部自动合上），
但**语义相交于「谁有资格播报」这一个问题**。

a11y 槽位 §5 做了一件事：把信息条的只读值（板名 / 时间位 / 画幅 / 参考图数）
从 `<output>` 改成 `<span>`。`<output>` 的隐含角色是 `status`、自带 `aria-live="polite"`，
切板时这四个只读值会各自抢播一遍，把「切到了哪一板」淹掉。改完的收益之一是
**全页 `role="status"` 恢复唯一**，于是那条用例直接写了 `screen.getByRole('status')`。

落库线随后给顶部栏加了保存态徽标：

```tsx
<span className={`savestate savestate--${editor.saveState}`}
      role="status"
      aria-label={`保存状态：${SAVE_STATE_LABEL[editor.saveState]}`}>
```

于是 `getByRole('status')` 命中两个，用例红。

### 裁决：两枚都留，断言换度量方式

这不是「谁让位」的问题——**两枚都是该播报的**：

- 保存态是落库线的产品前提（编辑即写盘）在无障碍树里的对应物。
  键盘 / 屏幕阅读器用户看不到徽标颜色变化，不播报就等于没有这个功能。
  它已经带 `aria-label="保存状态：…"`，命名是完备的。
- 就绪 / 待补全是编辑过程中唯一会自己变化的判定结论，a11y 槽位加它正是为了
  让键盘用户不必反复 Tab 回预览面板确认。

a11y 那条断言的**本意**不是「数量必须是 1」，而是「只读值不许漏回 live region」。
数量只是当时恰好等价的代理指标。落库线加了一枚合法的 live region 之后，
代理指标失效，但本意仍然成立。所以：

1. 就绪 / 待补全那条改为按地标取——`within(getByRole('complementary', { name: 'Prompt 预览' })).getByRole('status')`。
   这比原来的全页 `getByRole` **更**精确：顺带钉住了这枚徽标必须在预览面板里。
2. 补一条用例把本意直接写出来（第 34 条）：

```
全页 live region 恰为两枚且各自具名：顶栏保存状态 + 预览就绪判定
  - getAllByRole('status') 恰 2 枚
  - banner 内那枚的无障碍名匹配 /^保存状态：/
  - 预览地标内那枚文本为 就绪|待补全
  - 信息条内 0 枚 status、0 个 <output>、0 个 [aria-live]
```

第 4 行是原断言真正想防的东西，现在写成了它自己的形式，不再借数量代理。

### 反向验证：故意改坏，看它红不红

| 故意改动 | 第 34 条 |
| --- | --- |
| 信息条板名从 `<span>` 退回 `<output>` | **红** |
| 顶栏保存态徽标去掉 `role="status"` | **红** |

两条都实测过，改回后全绿。

---

## 三、两条硬要求与 a11y 命名逐条对账

### 3.1 `onSettle` 落库 —— 保住

`routes/EditorPage.tsx` 三处接线一处未动（a11y 侧根本没碰这个文件）：

```
useGenerateResultWriter({ repository, onPersisted, onError })   :107
useGenerateController(liveProject, { onSettle: results.settle }) :123
withDrafts() 里 beat.status = previous.status                    :67
```

### 3.2 模板起手路径 —— 保住

`store/ProjectsProvider.tsx` 的 `createProject(input, templateId?)` 双参签名在位，
`templateId === null` 走空白五板、给出标识则走 `createTemplateProject()`。
上一槽位补的 6 条合并缝用例（模板起手 × 落库通道）全绿。

### 3.3 a11y 命名 `节拍帧N` —— 保住

`editor/GridCellCard.tsx:53` 的 `const frameName = \`节拍帧${frame.order}\`` 原样在位，
派生出的四个名字（`节拍帧1 画面描述` / `为节拍帧1选择参考图` / `节拍帧1 参考图` /
`移除节拍帧1的参考图`）全部保留。

顺带一个合并后才看得见的一致性收益：模板线的 `NewProjectForm.tsx:128` 文案
本来就用「节拍帧」这个术语表标准词（glossary §1），两条线的用词天然对齐，无需调和。

### 3.4 a11y 覆盖面因合并而**扩大**了

a11y 槽位的「顶部栏与左导航控件都有名字」是一条全站扫描（`computeAccessibleName`
逐个算，空名即报）。基线时顶栏只有「成片」一个按钮；合并后顶栏多了落库线与生成线的
`保存` / `生成本板` / `生成全集` / 保存态徽标——**这条扫描现在也管着它们**。

实测确认它不是空转：把 `生成全集` 的可见文本与 `title` 同时去掉，该用例变红。
（只去掉可见文本时仍绿——`title` 是合法的无障碍名来源，`computeAccessibleName` 会取它。
这是正确行为，记在这里免得下次误判成漏网。）

---

## 四、验证

`typecheck`（`tsc --noEmit`）、`lint:terms`、`test:terms`、`test`、`build` 全绿。
CI 配置未动（`.github/**` 零改动）。

### 用例数对账 —— 四个数字都是实测

对合并基与两个父提交各起 worktree 实跑 `vitest run`，不抄文档：

| 阶段 | 提交 | 测试文件 | 用例 |
| --- | --- | --- | --- |
| 合并基 | `a3aed39` | 9 | 207 |
| 基底（落库+模板线，独立） | `85e669b` | 24 | 545 |
| 并入（a11y 线，独立） | `d24127d` | 10 | 240 |
| **合并后** | `e559ea4` | **25** | **579** |

**合并只增不减，且严格可加**：

```
用例  207 + 338(基底净增) + 33(a11y 净增) = 578，+1(本槽位合并缝) = 579  ✓
文件  9 + 15(基底净增) + 1(a11y 净增) = 25                              ✓
```

a11y 线净增的 33 条一条不少（`a11y.test.tsx` 现 34 条 = 33 + 合并缝 1 条），
基底的 545 条一条未动、判定强度未降。第 25 个测试文件就是 `editor/a11y.test.tsx`。

术语闸门 `node --test scripts/forbidden-terms.test.mjs` 17 例全绿；
`scan-forbidden-terms` 扫 113 个文件（a11y 带来的新文件已在扫描面内），产品源码无禁用词。

---

## 五、剩余合并清单

以本分支头为基底，用 `git merge-tree --write-tree` 对**当前头**实测冲突面。

**本次 a11y 合并没有扩大任何一条的冲突面**（a11y 只碰组件层与样式，
未碰 `EditorPage` / `ProjectsProvider` / `harness` / `ExportPage` / `README`）。

### 1. seedance transport —— 零冲突，建议下一个合

- `cursor/w7-seedance-transport-e7ab` @ `02bf258`，11 文件 +1642，**冲突 0**
- 全部是 `generate/seedance/**` 下的新文件（`config` / `redline` / `submitter` /
  `transport` + 各自的测试）+ 一份工作文档，与现有文件零重叠
- 文本零冲突 ≠ 语义零缝：它与既有的 `generate/adapter.ts` 是**同一件事的两套实现**。
  合完要回答「控制器实际走哪一个提交器」这个接线问题——这是一次显式选择，
  不是合并能替你做的决定。合并本身安全，接线要另立判断并补用例。

### 2. feishu（含 export）—— 1 处冲突，但**换文件了**，务必按新的裁决规则

`cursor/wave2-w2-export-ca31` 已是 `cursor/w4-feishu-export-925d` 的祖先，合 feishu 即带上 export，
不要再单独合 export。这里有两条路径，冲突数都是 1，但**风险差别很大**：

| 合并对象 | 冲突文件 | 评价 |
| --- | --- | --- |
| `w4-feishu-export-925d` @ `82f4845`（原始槽位） | `routes/ExportPage.tsx` | **推荐** |
| `w8-merge-feishu-45d1` @ `f0fc0f0`（并行 W8 头） | `routes/EditorPage.tsx` | 风险高，见下 |

合并那个并行 W8 头看起来更省事（ExportPage 的裁决已经做过一次），实际不然：
`f0fc0f0` 顺手把成片地址回写**从 `EditorPage` 抽到了 `store/generated.ts`**
（`pendingGeneratedStates` / `withGeneratedResults`），而落库线是把同一段代码
**整体换成了** `useGenerateResultWriter` + `onSettle`。两侧改的是同一段已被替换的逻辑，
冲突正好落在承载落库接线的那个文件上。

裁决规则（若选并行头）：`routes/EditorPage.tsx` **整体取本线（HEAD）**，
落库通道的三处接线一处不能丢；但 `store/generated.ts` 这个文件**要保留**——
feishu 侧的 `routes/ExportPage.tsx` 也 import 它（成片页共用同一份落库判据），
删了会连带打断成片页。即「弃用它在编辑页的那一处调用，保留文件本身」。

另沿用上一槽位的备注：`share/feishuMarkdown.ts` 把衔接写进给人读的飞书文档
不违反 AC-6.4（红线是「不进 Prompt 与生成请求体」），但合完要确认它没有反向流回
`domain/prompt.ts`。

### 3. images —— 4 处冲突，放最后

- `cursor/w4-image-store-8321` @ `2390f80`，25 文件 +3058 −50
- 冲突 4 处：`README.md`、`routes/EditorPage.tsx`、`store/ProjectsProvider.tsx`、
  `testing/harness.tsx`（与上一槽位实测一致，本次未扩大）
- 三样必须守住的东西沿用上一槽位，逐条仍然有效：
  - `store/ProjectsProvider.tsx`：`createProject(input, templateId?)` 的第二个参数不能被
    images 侧签名覆盖，否则套模板入口静默退回空板路径；context 里的 `repository` 不能被挤掉
  - `routes/EditorPage.tsx`：`useGenerateResultWriter` / `onSettle: results.settle` /
    `withDrafts` 里的 `beat.status = previous.status` 三处一个都不能丢
  - `testing/harness.tsx`：上一槽位的 `makeTemplateProject()` 与 images 侧改动取并集
- 新增一条本槽位的提醒：images 会给宫格加真实的参考图上传 UI。a11y 线在
  `GridCellCard.tsx` 定了四个按格命名（`为节拍帧N选择参考图` / `节拍帧N 参考图` /
  `移除节拍帧N的参考图`）并断言隐藏 file input 为 `tabIndex={-1}`、不占 Tab 位。
  images 侧若重写这个组件，这四个名字与那条 Tab 序断言都会红——**红了要改 images 侧去对齐命名，
  不是放宽断言**。`a11y.test.tsx` 的「宫格文本域逐格唯一命名」与「参考图入口按格命名」
  两组共 9 条用例就是这条约束的守卫。

### 4. 纯文档，零冲突，随时可并

- `cursor/w6-cycle2-architecture-b5b9` @ `f1dfe37`，4 文件 +1457
- `cursor/verify-cycle-1-w5-4b54` @ `24ffea7`，2 文件 +642

---

## 六、本槽位明确未做

- 未碰 `src/domain/**`、未碰 CI 配置、未删除或放宽任何既有断言
- 未合并任何其它分支（feishu / images / seedance 均只做冲突面实测，未动手）
- a11y 槽位 §8 列出的范围外事项（自动化 axe 接入、`forced-colors`、
  `prefers-reduced-motion`、中文屏幕阅读器实机走查）仍在范围外
- 编辑页之外的页面（项目列表 / 成片页 / 新建表单）的逐项无障碍审查仍未做。
  合并后这些页面已被「顶栏与左导航命名扫描」覆盖到骨架层面，但页面**内容**未逐项审——
  成片页尤其值得在 feishu 合并后补一轮，因为那时它才第一次有真实内容。
