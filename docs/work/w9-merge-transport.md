# W9 / MERGE-TRANSPORT —— Seedance 传输层 v2 并入飞书/导出集成线

**分支** `cursor/w9-merge-transport-52e7`
**基底** `cursor/w8-merge-feishu-45d1` @ `2285a79a52d08c65f4eb69516d30fd2f870ebe11`
**并入** `cursor/w7-seedance-transport-e7ab` @ `02bf258cd3d64bef30ce47dd8a3e737239d7e5b8`
**合并基** `8ffe44ff36e421235989d646323f6b4a9ac3c86b`（W3 store/generate 集成槽位）
**合并提交** `aba7a15`（`--no-ff`）

本槽位只做合并，**零冲突、零裁决**：传输层 v2 相对合并基是纯新增
（11 文件 / +1642 行 / 0 删除），改动面全部落在 `apps/web/src/generate/seedance/**`
与一份槽位文档；基底相对同一合并基动的 51 个文件里，**没有一个**与之相交。

---

## 一、目标分支的选定

槽位说明给了一条改道条件：若 `origin/cursor/w8-merge-a11y-*` 存在且是**更新的合并头**，
则并入那一支。该分支确实存在，实测后仍按原定的 feishu 分支为基底：

| 候选合并头 | 提交数 | 头提交时间 | 判定 |
| --- | --- | --- | --- |
| `cursor/w8-merge-feishu-45d1` `2285a79` | 64 | 16:08:28 | **取本支** |
| `cursor/w8-merge-a11y-aef8` `e559ea4` | 64 | 16:04:54 | 不更新 |

两支提交数相同，且**不是**祖先/后代关系——它们在
`acab82b`（W7 模板库合并头）上分叉，是并行的兄弟支：feishu 那侧带的是成片页与飞书导出，
a11y 那侧带的是 a11y/键盘与生成结果落库通道。既然 a11y 支的头更旧、也不包含 feishu 支的内容，
「更新的合并头」这条不成立，改道条件未触发。

顺带记一笔给下游：这两支迟早要合，而 a11y 支已经把 a11y 与 gen-persist **两个**槽位
都折进去了，所以下游合它一次即可覆盖两者（见第四节）。

---

## 二、为什么这次没有冲突

不是运气，是两侧改动面本来就不重叠。逐项核过：

| 改动面 | 传输层 v2 | 基底（飞书/导出线） |
| --- | --- | --- |
| `src/generate/seedance/**`（10 文件） | 全部新增 | 目录不存在 |
| `docs/work/w7-seedance-transport.md` | 新增 | 不存在 |
| `src/export/**`、`src/share/**`、`src/store/**` | 一行未改 | 本槽位主体 |
| `src/domain/templates.ts`、`transitions.ts`、`index.ts` | 一行未改 | 有改动 |
| `src/routes/**`、`src/components/**` | 一行未改 | 有改动 |

`git merge` 报 0 冲突，11 个文件全是 `create mode`。

### 传输层依赖的上游一个字节都没变

真正要担心的不是文本冲突，而是**语义漂移**：传输层跨目录 import 了六个模块，
若基底改过其中任何一个，合并可以干净但行为会变。逐个比对
合并基与合并后的 blob 哈希，六个全部逐字节相同：

```
generate/adapter.ts      generate/interceptors.ts   generate/types.ts
domain/beats.ts          domain/prompt.ts           domain/projects.ts
```

这条比「测试全绿」更强：它证明传输层看到的世界与它被写出来时**完全一致**，
所以 W7 那 92 条断言验的还是同一个对象，不是碰巧还能过。

特别地：

- `generate/interceptors.ts` 未变 → 30s Cap 的拦截链原样，
  W7 那条「摘掉 `durationInterceptor` 后 31 秒就过得去」的反证仍然成立。
- `generate/adapter.ts` 未变 → `FORBIDDEN_SUBMISSION_KEYS` 原样，
  `FORBIDDEN_BEAT_REQUEST_KEYS` 的**超集断言**不会因基底加词而失衡。
- `domain/prompt.ts` 未变 → 组间衔接的排除仍是类型层的（`PromptBeatView` 里没有那三个字段）。

### v1 生产路径未被触碰

传输层 v2 与 v1 并存，`generate/queue.ts` / `controller.ts` 仍走 v1。
本次合并没有把 v2 接进队列（那是 W7 遗留缺口 #2，属于下游槽位），
所以基底的生成/落库行为一条没动——飞书线新加的 `store/generated.ts` 回写通道
读的仍是 v1 队列的状态。

---

## 三、两条必须保住的红线

槽位说明点名的两条，合并后都逐项复验过。

### 1. 飞书线的 ExportView / store 接线保留

分工原样：`ExportView` 不认识仓储，只经 `onStatesChange` 把队列状态报上去，
落库由路由壳 `ExportBoard` 用 `useProjectEditor`（2s 防抖 + 离页强制 flush）完成。

```
routes/ExportPage.tsx  useProject(id) / useProjects().save / useProjectEditor
                       pendingGeneratedStates / withGeneratedResults  ← store/generated.ts
export/ExportView.tsx  FeishuExportPanel + 段卡 + 拼接计划 + 衔接总表 + 交付导出
```

`routes/ExportPage.test.tsx` 12 例、`export/ExportView.test.tsx` 19 例、
`store/generated.test.ts` 8 例全绿，其中「队列为空时五张落库的卡照旧是已生成」
与「只是打开页面不写库」是这条接线最容易悄悄退化的两点。

### 2. 无凭据配置保留

`SeedanceEndpointConfig` 合并后仍是恰好六个字段，一个都不是凭据字段：

```
base_url  submit_path  poll_path
request_timeout_ms  poll_interval_ms  poll_max_wait_ms
```

- 目录内**没有**任何 `import.meta.env` / `process.env` / `VITE_*` 的真实引用。
  `rg` 扫出的命中全部落在两类地方：文档注释里解释「为什么禁」，
  以及守卫测试里当反例字符串（`redline.test.ts` 拿 `VITE_SEEDANCE_KEY` 做正例断言）。
  `config.test.ts` 的源码扫描**先剥注释再断言**，所以注释里的这些词不会让守卫失效，
  也不会让它误报。
- 接口体里同样**没有**时长上限字段（断言不含 `duration|cap|max_beat`）：
  30s Cap 的唯一法源仍是 `domain/beats` 的 `MAX_BEAT_DURATION_SEC`。
  全仓扫描确认只有一处 `export const` 定义（`domain/beats.ts:27`），
  其余 12 个提及它的文件全是 import 或注释引用，没有第二份上限常量。
- 默认传输层仍是不出网的桩件，用例里 `fetch` 一次都没被调用。

`seedance/config.test.ts` 11 例 + `seedance/redline.test.ts` 45 例全绿，
包含守卫的自测（接口改名必须抛错、混入 `api_key` 必须被抓出、`base_url` 不能被误判）。

---

## 四、验证

CI 四道闸门全绿，与工作流同序执行：

```
npm run typecheck   ✓
npm run lint:terms  ✓  扫了 152 个文件，产品源码无禁用词（法源文档与守卫测试的 120 处引用已豁免）
npm test            ✓  17 node:test + 748 vitest（38 个文件）
npm run build       ✓  97 modules，dist 328.38 kB（gzip 105.91 kB）
```

### 测试对账：只增不减，加法闭合

| 阶段 | 测试文件 | 用例 |
| --- | --- | --- |
| 合并基 `8ffe44f` | 22 | 435 |
| 传输层分支 `02bf258`（独立） | 26 | 527 |
| 基底 `2285a79`（飞书线） | 34 | 656 |
| **合并后** | **38** | **748** |

传输层相对合并基是 +4 文件 / +92 例（`config` 11、`redline` 45、`transport` 17、`submitter` 19）。
基底 656 + 92 = **748**，与实测逐一相符，**没有缺口**。

这个加法能严丝合缝闭合，正是第二节那件事的推论：传输层分支相对合并基
**没有修改任何既有文件**，所以两侧的用例集是不相交的并集，
不存在「同名测试文件被一侧的版本吃掉」这类静默丢断言的可能
（这是 W8 合并飞书时需要逐文件核对 12 个同名测试文件的情形，本槽位不存在）。

原有断言一条未改、未删、未放宽。

---

## 五、剩余合并清单

以本分支为基底，冲突面由 `git merge-tree --write-tree` 实测。

### 1. a11y + gen-persist（一次合两个槽位）

- 分支 `cursor/w8-merge-a11y-aef8`（`e559ea4`），相对合并基 25 文件 / +2434 行
- 该支已含 **a11y**（`12fd831` 键盘可达的节拍导航、逐帧标签、地标焦点序）
  与 **gen-persist**（`1ca00f3` 生成结果直接落库、`93046cc` +39 例）两个槽位，
  合它一次即可，不必再单独合 `cursor/w4-a11y-6861` 与 `cursor/w7-gen-persist-9e0d`
- 冲突：**2 处** —— `routes/EditorPage.tsx`、`testing/harness.tsx`
- 注意：两侧都改过生成结果的回写。本支（经 W8）已把它提成
  `store/generated.ts` 的 `pendingGeneratedStates` / `withGeneratedResults`，
  页内不再有 `pendingVideoUrls` 与就地拼装的 `hydrateProject`；
  a11y 支那侧是另一套写法。**取本支的模块化版本**，
  不要把已删掉的页内回写代码带回来——带回来会两处各写一遍，
  且成片页那条路不会跟着走
- `apps/web/package.json` / `package-lock.json` 的 devDependency 已在该支内并过，本次不再冲突

### 2. images

- 分支 `cursor/w4-image-store-8321`（`2390f80`），25 文件 / +3058 行
  （`adapters/images/**` 参考图存储、`FrameImagePanel`、`FrameImagesProvider`）
- 冲突：**4 处** —— `README.md`、`routes/EditorPage.tsx`、
  `store/ProjectsProvider.tsx`、`testing/harness.tsx`
- W8 已点出的两条仍然要小心，本槽位未改动这些文件，判断不变：
  - `ProjectsProvider.createProject(input, templateId?)` 的第二个参数不能被 images 那侧的签名覆盖，
    否则套模板的入口会静默退回空板路径
  - `testing/harness.tsx` 的 `withVideos()` 里那行
    `copy.prompt_final = assemblePrompt(...)` 必须保留，
    否则「快照可溯」的断言会失去被测对象而空转
- **本槽位新增一条**：images 落地后应回填 W7 遗留缺口 #3 ——
  传输层已把参考图键的口径定成**不透明存储键**
  （`validateReferenceImageKeys()` 拒绝 `blob:` / `data:` / 含 `://` 的取值），
  而 `editor/draft.ts` 的 `FrameImage` 目前只持有 object URL。
  两者对接时产键的责任在 images 侧，不要为了让接口过而放宽传输层的校验

### 3. 其它

- `cursor/w8-topbar-layout-224e`（`d7fcbe5`）与
  `cursor/w6-cycle2-architecture-b5b9`（`f1dfe37`）实测**零冲突**，可随时并入
- 建议顺序：零冲突的两支 → a11y 合并支（2 处冲突，语义已在上面裁决）→ images（4 处，需人工裁决）

### 4. 传输层自身的遗留缺口（未因合并改变）

W7 的四条原样存续，本槽位刻意不动：无真实中继客户端、v2 未接进队列、
参考图键未落库、轮询超时只有常量没有循环实现。
其中「v2 接进队列」需要队列理解「提交 → 轮询」两段式
（`PENDING → RUNNING` 的时机从本地置位变成轮询回报，且刷新后要用 job id 续接），
是独立槽位的活。
