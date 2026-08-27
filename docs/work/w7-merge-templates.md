# W7 / MERGE-TEMPLATES —— 模板库并入集成线，并接上新建入口

**分支** `cursor/w7-merge-templates-9e75`
**基底** `cursor/w3-integrate-store-gen-c1f5` @ `8ffe44ff36e421235989d646323f6b4a9ac3c86b`
**并入** `cursor/w3-templates-golden-library-e98c` @ `21ae263599a33140a59b50b9b6b803df7b578abc`
**合并基** `a8f6f26d508b10662aa3c1c4a374841535a1f2b1`（W2 prompt/generate 槽位）

两件事：把 W3 的黄金五板模板库合进集成线（合并本身），
再把它接到新建项目上——**空板不再是唯一的起手路径**（本槽位新增的功能）。

---

## 一、冲突裁决

模板分支相对合并基只动了 6 个文件，与基底重叠的只有组间衔接目录两处：

| 文件 | 情况 | 裁决 |
| --- | --- | --- |
| `domain/templates.ts` | 基底没有 | 直接落地 |
| `domain/templates.test.ts` | 基底没有 | 直接落地，37 例原样保留 |
| `domain/index.ts` | 只有模板分支动过 | 自动合入（多一行 `export * from './templates'`） |
| `docs/work/w3-template-library.md` | 基底没有 | 直接落地 |
| `domain/transitions.ts` | **冲突** | 取并集，见下 |
| `domain/transitions.test.ts` | **冲突** | 取并集，见下 |

### 组间衔接目录 —— 取并集，两边都不丢

两侧都在扩 `TransitionEntry`，但扩的是**不同维度**，没有一侧需要让位：

- 基底（集成线）加的是**给人用的信息与接缝拓扑**：`hint`（后期合成的操作要点）、
  `transitionEntryByCode()`、接缝三件套（`TRANSITION_SEAM_COUNT` / `hasTransitionSeam()` /
  `seamOf()`）、`CANON_TRANSITION_BY_BEAT_INDEX` + `canonTransitionFor()`，
  以及对 `./beats` 的 **type-only** 导入（反向加运行时依赖会与 `beats` 形成 TDZ 死锁，
  文件头有注释说明，保留）。
- 模板分支加的是**法源对账**：`canon_source` / `pending_canon` / `pending_canon_reason`
  三个字段，加上 `CANON_TRANSITION_RULES` / `PENDING_CANON_TRANSITIONS` /
  `isPendingCanonTransition()`。

合并后的 `TransitionEntry` 同时带 7 个字段，目录仍是封闭的 6 项。

**`纯硬切` 的 `pending_canon: true` 原样保留**，这是本次合并的硬要求。
它的处境没变：METH-003 §1/§8 把 B3 → B4 定为「纯硬切」，而 METH-002 §5 的封闭枚举
只列了 5 项、不含此值。差异必须留在目录里可见——待批不等于不可用，
`纯硬切` 照旧是合法取值、照旧被 B3 使用、照旧能落库；
清空待批清单的唯一正当方式是补法源，而不是把取值从目录里删掉。

测试文件的三处冲突同理并成一份：导入取并集；两边同名的目录自检合成一条，
同时断言 `note` / `hint` / `canon_source` 三者非空。基底的「接缝」suite 与
模板分支的「待批取值（pending_canon）」suite 都完整保留。

---

## 二、新建项目接上模板（本槽位新增）

模板库合进来之后是**能用但没有入口**的状态：`createProjectFromTemplate()` 已经在
领域层备好，新建项目却仍然只会产出 5 块空板。本槽位把这条路接上。

### 分层：模板只填文案，不碰结构

新增 `store/projectFactory.createTemplateProject()`。它与 `createEmptyProject()`
的差别**只在板上的文案**：

| | 由谁决定 |
| --- | --- |
| 板序 / 语义 / 宫格数 / 时间位 / canon 衔接 | 领域层锁死，模板碰不到 |
| 板级【示例】文案（情绪 / 镜头节奏 / 剧情核心 / 节拍帧） | 模板填，用户可逐字改写 |
| 项目级参数（题材 / 画幅 / 目标时长 / 画风 / 主角） | **以用户表单为准**，模板不劫持 |

函数不接受任何结构参数，也没有「板数」入口，因此模板不是绕开五节拍锁的后门
（`RULE-2`、AC-6.1）——产出物照样过 `assertProjectLocks()`。
板级文案由领域层的 `createProjectFromTemplate()` 填好，并在那里逐板过
`assertPromptClean()`：模板文案里若写进了衔接词 / 板名 / 备注，建项目当场抛错。

两条新建路径共用的尾巴（按目标总时长摊板时长 + 补落库字段）提取成
`toStoredProject()`，避免两处各摊一次时长而漂移。

落库后 5 块板的 `status` 是 `filled` 而非 `empty`，这正是本路径存在的意义：
用户拿到一份可以逐字改写的起手稿。

### UI：默认仍是空白，套模板是显式选择

`NewProjectForm` 加「起手内容」单选：**空白五板**（默认）/ **宴会钻戒反转（黄金五板样板）**。

默认保持空白是刻意的：原有那条「5 块空板」路径是既有红线测试的断言对象
（`落库即带 5 块锁定板` 断言 `status === 'empty'`），把默认改成套模板会把它推翻。
派单要求的是「空板不是唯一路径」，不是「空板不再是默认」，所以按可选项处理。

选中模板会把项目级参数代填成模板取值，让用户可以直接创建；
项目名只在用户还没填时代填，**已经输入的名字不被覆盖**。切回空白会把代填的参数清掉。

发现性：列表页空态补一句「起手内容可以留空自己写，也可以直接套用黄金五板样板」；
创建成功的提示里点明套了哪套模板。

---

## 三、验证

CI 四道闸门全绿（`typecheck` / `lint:terms` / `test` / `build`）。

| 阶段 | 测试文件 | 用例 |
| --- | --- | --- |
| 基底 `8ffe44f` | 22 | 435 |
| 模板分支 `21ae263`（独立） | 13 | 245 |
| 合并后 | 23 | 478 |
| 接上新建入口后 | 23 | **500** |

合并只增不减，逐文件对账：

- `templates.test.ts` 37 例原样带入。
- `transitions.test.ts` 由基底 16 例 / 模板分支 14 例并成 **22 例**——
  两边的断言都在，没有一条被并集吃掉。
- 其余 21 个文件未被本次合并触碰，用例数不变。

新增 22 例：

- `store/projectFactory.test.ts` 27 → 42。覆盖：结构与空白路径完全一致、
  产物过结构锁、板列表仍拒绝增删改序、5 块板已填满且 `isBeatReady` 全真、
  文案逐字取自模板、默认模板即 `banquet-hook`、项目级参数不被模板劫持、
  时长摊分与时间位不动、B3 的 `纯硬切` 原样落库、生成期字段仍是空位、
  以及 AC-6.4：模板文案组出的 Prompt 里没有衔接 / 板名 / 备注。
- `routes/ProjectsPage.test.tsx` 15 → 22。覆盖：默认是空白五板、模板选项可见并说明后果、
  选中后参数代填、已填的项目名不被覆盖、套模板落库的 5 块板真的已填满（14 格无一为空）、
  套模板不松结构锁（宫格 3/3/3/3/2、B3 仍是 `纯硬切`）、切回空白仍出 5 块空板。

原有断言一条未改。

手动验证：起了 dev server 走真实浏览器跑完「新建 → 选模板 → 创建 → 进编辑页」，
5 块板的情绪 / 镜头节奏 / 剧情核心 / 三格画面都已填好，
Prompt 预览里的红线自检显示「通过 —— 衔接 / 板名 / 备注 无一进入 Prompt」。

---

## 四、与 W7-GEN-PERSIST 的关系

派单交代「若 W7-GEN-PERSIST 先落在别的分支上就不要重复修」。
本槽位收工时远端没有任何 W7 分支（只有已是祖先的
`cursor/wave2-wk-store-local-persistence-7ecb`），因此**没有可跳过的东西**；
同时生成态持久化不属于本槽位，这里也**没有动**它，不存在重复修的风险。

---

## 五、剩余合并清单

以本分支为基底的后续合并，按冲突面从小到大排。冲突面是 `git merge-tree` 实测，不是估计。

### 1. export + feishu —— **是一次合并，不是两次**

`cursor/wave2-w2-export-ca31`（`c92ce40`）**已经是**
`cursor/w4-feishu-export-925d`（`82f4845`）的祖先：feishu 分支里已经包含成片页导出的
全部文件与 `docs/work/w2-export-page.md`。合 feishu 即把 export 一并带进来，
不要再单独合 export。

- 体量：31 文件，+4528 行（`src/export/**` 导出与拼接计划、`src/share/**` 飞书文档与剪贴板）
- 冲突：**1 处** —— `routes/ExportPage.tsx`（两边都把成片页从占位换成真实实现）
- 备注：`share/feishuMarkdown.ts` 会把衔接写进给人读的飞书文档。
  这不违反 AC-6.4（红线是「不进 Prompt 与生成请求体」，不是「不给人看」），
  但合完要确认它没有反向流回 `domain/prompt.ts` 的组装路径。

### 2. a11y

- 分支 `cursor/w4-a11y-6861`（`d24127d`），12 文件，+946 行，含 `editor/a11y.test.tsx` 445 行
- 冲突：**2 处**，都是依赖清单 —— `apps/web/package.json` 与 `package-lock.json`
  （a11y 加了一个 devDependency）。取并集即可，不涉及语义裁决。
- `styles.css` / `AppLayout.tsx` / `BeatNav.tsx` / `BeatBoard.test.tsx` 都能自动合并；
  我在 `styles.css` 末尾加的「起手内容单选」样式块与 a11y 的改动不重叠。

### 3. images

- 分支 `cursor/w4-image-store-8321`（`2390f80`），25 文件，+3058 行
  （`adapters/images/**` 参考图存储、`FrameImagePanel`、`FrameImagesProvider`）
- 冲突：**4 处** —— `README.md`、`routes/EditorPage.tsx`、
  `store/ProjectsProvider.tsx`、`testing/harness.tsx`
- 注意：`ProjectsProvider.tsx` 与 `harness.tsx` 我在本槽位都改过
  （前者的 `createProject` 多了 `templateId` 参数，后者是模板分支带来的既有内容），
  合并时要保证 `createProject(input, templateId?)` 的第二个参数不被 images 那侧的
  签名覆盖掉，否则套模板的入口会静默退回空板路径。这是本清单里唯一需要小心的语义冲突。

三条都不含彼此的祖先关系，顺序可调；建议按上面的顺序做，把最需要人工裁决的 images 放最后。
