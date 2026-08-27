# Cycle 1 / W5 独立验证报告

> 槽位：Wave 5 / 80 · Cycle 1 · **VERIFY**
> 模型：`claude-opus-5-thinking-high`
> 性质：**独立审计**。本槽位不实现产品功能、不开 PR、不动 CI、不删测试，只写 `docs/verify/**`。
> 被审对象：`github.com/Dawan2/jiepaiban` 全部 18 条远程分支（`main` 不是当前态，见 §2.1）
> 审计时间：2026-08-27
> 配套：[`branch-map.md`](./branch-map.md)（分支清单与建议合流顺序）

---

## 0. 一页结论

| 项 | 结论 |
| --- | --- |
| 最佳合成体 | `cursor/w3-integrate-store-gen-c1f5` @ `8ffe44ff36e421235989d646323f6b4a9ac3c86b` |
| 本地复跑 | `typecheck` / `lint:terms` / `test` / `build` **四闸门全绿**，452 条测试（Vitest 435 + node:test 17） |
| Cycle 1 出口判据 | **已达成**：浏览器实测走通「新建项目 → 自动 5 板 14 格 → 填字段 → 实时 Prompt → 生成 → 刷新不丢」 |
| P0 六件套加权成熟度 | **62 / 100**（M1 55 · M2 82 · M3 90 · M4 78 · M5 60 · M6 30 · 持久化 80） |
| 头号阻塞 | **分支碎片化**：4 条分支、约 8600 行已过 CI 的代码停在 `main` 之外未合流；`main` 仍是空仓 |
| 已被证伪的旧阻塞 | 「生成成功不回写仓储」——在 `8ffe44f` 上**已修复且有测试**，见 §4.1 |
| 新发现的阻塞 | 顶栏动作区渲染越界，`保存`/`生成全集`/`成片` 三个按钮被裁切（§4.2）；飞书导出分支仍接演示数据（§4.5） |

---

## 1. 成熟度（Maturity）

评分口径：以 `docs/prd/prd.md` §6 的 P0 需求条目为分母，逐条核到代码与测试。
**只有「有实现 + 有测试 + 在已合流分支上」三者齐备才计满分**；停在未合流分支上的实现按 50% 计。

| 模块 | 分数 | 状态 | 依据 |
| --- | --- | --- | --- |
| **M1 五节拍模板库** | **55** | 骨架锁完成，模板数据未合流 | 见 §1.1 |
| **M2 可视化节拍编辑器** | **82** | P0 十二条基本齐备 | 见 §1.2 |
| **M3 Prompt 组装器** | **90** | 本 Cycle 完成度最高的模块 | 见 §1.3 |
| **M4 生成引擎（桩）** | **78** | 状态机 / 幂等 / 回写齐备，传输层是桩 | 见 §1.4 |
| **M5 组间衔接管理器** | **60** | 单选可用，叠加与总表导出缺位 | 见 §1.5 |
| **M6 成片管理** | **30** | 集成分支只有只读占位页 | 见 §1.6 |
| **持久化（非 PRD 模块）** | **80** | IndexedDB 三级回落 + 结构锁 + 封套迁移 | 见 §1.7 |

加权总分 **62 / 100**（按 M1–M6 等权 + 持久化半权计）。

### 1.1 M1 五节拍模板库 —— 55

**已落地（集成分支）**：`apps/web/src/domain/beats.ts` 的 `BEAT_DEFS` 是 METH-003 §1 的
CANON 骨架，`createBeatList()` 铸出 5 块板并**在运行时冻结**——`index` / `beat_type` /
`g_index` / `time_start` / `time_end` / `frame_count` / `frames` 七个字段经
`Object.defineProperty` 定义为不可写，数组本身 `Object.freeze`，`push` / `splice` /
`reverse` 直接抛 `TypeError`。`FR-1-02` `FR-1-03` `FR-1-04` 满足，`FR-1-05` 的帧语义提示
由 `FRAME_ROLE_HINTS` 提供且已在 UI 上可见（截图见 §3.2）。

**缺口**：

1. `FR-1-01`（内置黄金五板模板）与 `FR-1-06`（示例文案作为 placeholder）**只在
   `cursor/w3-templates-golden-library-e98c` 上存在**（`domain/templates.ts`，431 行 +
   564 行测试），未合流。集成分支上「新建项目」产出的是**全空的 5 板**，用户拿不到
   METH-003 的样板文案。
2. 该分支同时携带 §4.4 的 `纯硬切` 待批标记，两者绑在一起，合流一次解决两个问题。

### 1.2 M2 可视化节拍编辑器 —— 82

逐条核对 `FR-2-01` … `FR-2-12`：

| 需求 | 状态 | 证据 |
| --- | --- | --- |
| `FR-2-01` 板头信息 | ✅ | `BeatInfoBar.tsx`；实测显示 `B1 · 开篇钩子 · 3 格 · 0–8s` |
| `FR-2-02` 宫格按板序渲染 | ✅ | `GridBoard.tsx`；实测 B1 = 3 格、B5 = 2 格 |
| `FR-2-03` 帧文本录入 | ✅ | `GridCellCard.tsx`，每格一个 textarea |
| `FR-2-04` 帧序只读左→右 | ✅ | 无拖拽控件；`BeatBoard.test.tsx` 断言无 `draggable` |
| `FR-2-05` … `FR-2-07` 板级字段 | ✅ | 情绪（select + 自由文本）/ 镜头节奏 / 剧情核心 |
| `FR-2-08` 时长 ≤30s 拦截 | ✅ | `isDurationWithinCap`；落库前 `assertProjectLocks` 再拦一次 |
| `FR-2-09` 整集时长汇总 | ✅ | 顶栏 `88s / 88s`；偏离基准轴时出警示条 |
| `FR-2-10` 完成度指示 | ✅ | 「节拍1还缺：…」实时列出缺失槽位 |
| `FR-2-11` 自动保存 | ✅ | `useProjectEditor`：2s 防抖 + 卸载强制 flush + 保存态可见 |
| `FR-2-12` 无废弃项入口 | ✅ | `lint:terms` + `App.test.tsx` / `BeatBoard.test.tsx` 双重守卫 |

**扣分项**：顶栏动作区渲染越界（§4.2），是集成引入的真实可见缺陷，非测试可捕获。

### 1.3 M3 Prompt 组装器 —— 90

本 Cycle 完成度最高的模块，且**红线是靠类型层保证的，不是靠拼完再删**：

- 唯一实现在 `domain/prompt.ts`，`prompt/assemble.ts` 只做面板投影，二者产出的全文
  **逐字符相同**（`L7` 一致性，有测试守卫）。
- 组装器的输入类型 `PromptBeatView` **不含** `title` / `transition_rule` / `note`——
  `src/prompt/**` 在架构上禁止 import `domain/transitions`，该约束本身有单元测试守卫。
- `FR-3-08` 黄金用例：`domain/prompt.golden.test.ts`（16 条）把 METH-003 Beat 1 的组装
  结果钉成手写字面量。
- 出网口再断言一次：`generate/adapter.ts` 的 `buildSubmission` 调 `assertPromptClean`。

**扣分项**：`FR-3-06` 的 ≤200ms 实时预览预算**没有性能断言**，只有功能测试。

### 1.4 M4 生成引擎 —— 78

`FR-4-01` … `FR-4-09` 除 `FR-4-10`（P1）外全部有实现与测试：状态机
`PENDING → RUNNING → SUCCEEDED / FAILED` 带非法流转抛错；幂等键取 prompt + params 的
FNV-1a 指纹；一板一任务、整集生成 = B1→B5 五次独立入队；失败按可重试性分流。

传输层是**明确声明的桩**（`createStubTransport`），不出网、不读任何 Key，产出
`stub://seedance-2.5/b1/idem_xxxx.mp4`。按 `wave-plan.md`，真连排在 Cycle 5（W21–25），
**此处按计划推迟，不计为缺陷**。

**扣分项**：见 §4.3，生成结果的回写只在编辑页挂载时发生。

### 1.5 M5 组间衔接管理器 —— 60

`FR-5-01`（挂上一块板）、`FR-5-02`（封闭枚举单选）、`FR-5-05`（不进生成请求）、
`FR-5-07`（组内无转场入口）已落地且有测试。`TransitionPanel.tsx` 在 B5 上正确显示
「本集不设衔接」。

**缺口**：

| 需求 | 状态 |
| --- | --- |
| `FR-5-03` 支持叠加（主手法 + 修饰，最多 2 项） | ❌ 未实现。`Beat.transition_rule` 是单值，B4 的「卡点硬切 + BGM 升调」被有损压成 `BGM升调截断` |
| `FR-5-04` B5 控件置为只读 | ⚠️ 以「不显示控件」代替「只读控件」，行为达标但形态与 PRD 措辞不一致 |
| `FR-5-06` 衔接总表导出 | ❌ 集成分支无实现；实现停在 `w4-feishu-export-925d` 的 `export/stitchPlan.ts` |

### 1.6 M6 成片管理 —— 30

集成分支的 `routes/ExportPage.tsx` 是**只读占位页**：5 张段卡、已生成 / 未生成状态、
「去编辑」跳转；`一键拼接（V1.1）` 与 `全部下载` 两个按钮硬编码 `disabled`。
`FR-6-02`（可预览可下载）、`FR-6-03`（衔接表）、`FR-6-04`（成片登记）、
`FR-6-05`（飞书导出）、`FR-6-06`（缺片提示）全部缺位。

这五条的实现**已经写完并过了 CI**，停在 `cursor/w4-feishu-export-925d`（约 4500 行，
含 `export/` 16 文件 + `share/` 8 文件）。M6 得分低不是因为没人做，是因为没合流。

### 1.7 持久化 —— 80

`adapters/persistence/` 是本仓最扎实的一层：IndexedDB → localStorage → 内存三级回落；
版本化封套 + 迁移框架；**落库前重铸并断言、读回后归一回 canon**（`locks.ts`）——
即历史脏数据不会把结构锁带偏。40 条 `localRepository` 测试跑在 `fake-indexeddb` 上，
是真驱动而非 mock。

**缺口**：参考图仍是内存态，见 §4.3。

---

## 2. 增量（相对空仓库）

### 2.1 `main` 的实际状态

```
$ git log --oneline origin/main
09e11fd Initial commit          # 只有一个 12 字节的 README.md
```

**`main` 至今零产品代码、零 CI。** 全部产出都挂在 17 条 `cursor/**` 分支上。
这一条本身就是本 Cycle 最大的交付风险，详见 §4.1。

### 2.2 集成分支相对空仓的增量

在 `cursor/w3-integrate-store-gen-c1f5` @ `8ffe44f` 上实测：

| 维度 | 数量 |
| --- | --- |
| 相对 `main` 的提交数 | 48 |
| 相对 `main` 变更的文件数 | 108 |
| `apps/**` 代码行数 | 12 922 |
| `docs/**` 文档行数 | 6 922 |
| 测试文件数 | 23（Vitest 22 + node:test 1） |
| 测试条数 | **452**（Vitest 435 + node:test 17） |
| 生产构建产物 | 296.58 kB JS（gzip 95.70 kB）+ 16.92 kB CSS |

### 2.3 从零长出的能力清单

1. **方法论法源三件套**（METH-001/002/003）：把「1 Beat = 1 G = 1 次 generate」的恒等式、
   废弃项、五节拍锁、Prompt 公式、衔接枚举写成可引用的条文，代码里每一处锁都回指条文号。
2. **PRD 与验收矩阵**：`docs/prd/` 六份文档，P0 六件套逐条编号（`FR-<模块>-<序号>`）。
3. **架构与 80 波计划**：`docs/architecture/` 五份 + `docs/backlog/` 两份。
4. **三处分层的红线锁**——本仓最有价值的设计：

   | 位置 | 管什么 |
   | --- | --- |
   | `domain/beats.ts` | 结构在类型层与运行时同时锁死 |
   | `adapters/persistence/locks.ts` | 落库前重铸断言，读回后归一 |
   | `prompt/assemble.ts` + `generate/interceptors.ts` | 排除字段在类型上够不着 |

5. **术语合规闸门**（`lint:terms`）：产品源码出现「分镜 / 故事板 / 单镜时长」即挂 CI，
   守卫测试的必要引用在 `scripts/forbidden-terms.json` 逐条登记理由。
6. **可运行的三页应用**：项目列表 / 节拍编辑 / 成片，实测可用（§3）。

---

## 3. 证据（Evidence）

### 3.1 命令与结果（本地复跑，非引用他人回执）

环境：Node v22.14.0 / npm 10.9.7。工作副本 = `origin/cursor/w3-integrate-store-gen-c1f5`
@ `8ffe44ff36e421235989d646323f6b4a9ac3c86b`。

| 命令 | 结果 | 关键输出 |
| --- | --- | --- |
| `npm ci` | ✅ | 0 vulnerabilities |
| `npm run typecheck` | ✅ | `tsc --noEmit` 无输出 |
| `npm run lint:terms` | ✅ | `扫了 103 个文件，产品源码无禁用词（法源文档与守卫测试的 120 处引用已豁免）` |
| `npm test` | ✅ | `Test Files 22 passed (22)` / `Tests 435 passed (435)`；node:test `# pass 17 / # fail 0` |
| `npm run build` | ✅ | `✓ 79 modules transformed` / `✓ built in 824ms` |

逐文件测试分布（Vitest 435 条）：

```
prompt/assemble.test.ts            43    domain/prompt.golden.test.ts     16
adapters/persistence/localRepo…    40    domain/prompt.test.ts            16
editor/BeatBoard.test.tsx          33    domain/transitions.test.ts       16
domain/beats.test.ts               34    adapters/persistence/locks…      17
store/projectFactory.test.ts       27    editor/draft.test.ts             17
domain/locks.test.ts               24    generate/adapter.test.ts         15
generate/interceptors.test.ts      24    generate/store.test.ts           15
generate/queue.test.ts             21    routes/ProjectsPage.test.tsx     15
App.test.tsx                       13    domain/projects.test.ts          12
generate/controller.test.tsx       12    routes/EditorPage.test.tsx       11
store/useProjectEditor.test.tsx    11    store/ProjectsProvider.test.tsx   3
```

### 3.2 UI 实测（真实浏览器，非 jsdom）

用 `vite preview` 起生产构建 + Chrome（Playwright 驱动）跑通完整主流程：

| # | 动作 | 结果 |
| --- | --- | --- |
| 1 | 打开 `/` | 空态提示「点右上『新建项目』，系统会自动落 5 块锁定节拍板」 |
| 2 | 新建项目（项目名 / 题材 / 画风 / 主角） | 落库成功，列表出现 `0/5 节拍已填` |
| 3 | 进入 `/p/:id` | 左导航 5 项固定、B1 渲染 3 格、顶栏 `88s / 88s`、Prompt 面板显示固定前缀 |
| 4 | 切到 B5 | 宫格数变 2，衔接面板显示「本集不设衔接」 |
| 5 | 填满 B1（情绪 / 节奏 / 剧情核心 / 3 格描述） | Prompt 面板实时重组，徽章由 `待补全` 转 `就绪`，`红线自检：通过` |
| 6 | 点「生成本板」 | 徽章转 `成功`，按钮转 `重新生成`，显示 `成片地址：stub://seedance-2.5/b1/idem_9784ba1f.mp4` |
| 7 | 点「保存」→ 进 `/p/:id/export` | 节拍 1 显示 `已生成`，其余四板 `未生成` |
| 8 | **刷新页面** | 节拍 1 仍为 `已生成` —— 证明 `video_url` 真的落进了 IndexedDB，不是内存态 |

控制台**零 JS 报错**（仅一条 favicon 404）。
无障碍抽查：`<html lang="zh-CN">`、页面唯一 `h1`、标题层级 H1→H2→H3 无跳级、
表单控件**全部**有 `label[for]` 或 `aria-label`（0 个未标注控件）、无缺 `alt` 的 `img`。

### 3.3 未合流分支的独立复跑

| 分支 | HEAD | typecheck | lint:terms | 测试 |
| --- | --- | --- | --- | --- |
| `cursor/w3-templates-golden-library-e98c` | `21ae2635` | ✅ | ✅ 54 文件 | 13 files / **245** |
| `cursor/w4-feishu-export-925d` | `82f4845f` | ✅ | ✅ 81 文件 | 21 files / **323** |
| `cursor/w4-image-store-8321` | `3d4b5af8` | ✅ | ❌ **脚本不存在** | 16 files / **265** |

### 3.4 CI（GitHub Actions，全部 success）

| 分支 | Run |
| --- | --- |
| `w3-integrate-store-gen-c1f5` @ `8ffe44ff36` | <https://github.com/Dawan2/jiepaiban/actions/runs/33086083917> |
| `w4-feishu-export-925d` @ `82f4845f35` | <https://github.com/Dawan2/jiepaiban/actions/runs/33085099680> |
| `w4-image-store-8321` @ `3d4b5af85e` | <https://github.com/Dawan2/jiepaiban/actions/runs/33085540982> |
| `w3-templates-golden-library-e98c` @ `21ae263599` | <https://github.com/Dawan2/jiepaiban/actions/runs/33083085638> |

历史上唯一一次红：run `33084856674`（`merge(w3): retarget local persistence…`），
在同分支后续提交 `eb50a1e` 上已修复并转绿。**当前无红 CI，无开放 PR。**

### 3.5 试合流冲突面（在临时 worktree 上实测，不落盘）

以 `8ffe44f` 为 base 逐个 `git merge --no-commit`：

| 分支 | 冲突文件 |
| --- | --- |
| `w3-templates-golden-library-e98c` | `domain/transitions.ts`、`domain/transitions.test.ts` |
| `w4-feishu-export-925d` | `routes/ExportPage.tsx` |
| `w4-image-store-8321` | `routes/EditorPage.tsx`、`store/ProjectsProvider.tsx`、`testing/harness.tsx` |

**文本冲突面很小，但不要被这个数字骗了**——真正的成本是 §4.5 与 §4.6 的语义返工。

---

## 4. 阻塞（Blockers）

### 4.1 【P0】分支碎片化：`main` 是空仓，四条分支各自为战

18 条远程分支，`main` 仍停在 `09e11fd`（只有 README）。已过 CI 但未进入任何集成分支的
代码约 **8 600 行**，分布在四条彼此不知道对方存在的分支上：

| 分支 | 未合流内容 | 基线问题 |
| --- | --- | --- |
| `w3-templates-golden-library-e98c` | 模板库 + `纯硬切` 待批标记 | 基线 `a8f6f26`，不含本地持久化 |
| `w4-feishu-export-925d` | 成片页全功能 + 飞书导出 | 基线 `a8f6f26`，**仍接演示数据**（§4.5） |
| `w4-image-store-8321` | 参考图字节落库 | 基线 `6a118af`，**不含 WK3 编辑区**（§4.6） |
| `wave2-w2-export-ca31` | 已被飞书分支完全包含 | 可直接废弃 |

三条 W3/W4 分支**都不是从最新集成分支切出来的**：两条切自 `a8f6f26`（W2 prompt/generate），
一条切自 `6a118af`（W2 local-store）。它们各自基于「当时的最好」，而那三个「当时」互不相同。
每多一波，返工成本按分支数乘积增长。

**这是本 Cycle 唯一的结构性风险，其余阻塞都是它的症状。**

### 4.2 【P0·新发现】顶栏动作区渲染越界，三个按钮被裁切

**这是本次审计新发现的、任何测试都抓不到的可见缺陷。**

`.layout` 把 topbar 行高硬编码为 `56px`，`.layout__topbar` 用 `align-items: center`
垂直居中。而 `EditorPage` 往 `.layout__actions` 里塞进了 `BeatGenerateAction`——
它是一个**多行块**（徽章+按钮一行、失败原因一行、`成片地址：stub://…` 又一行），
高度远超 56px。居中的结果是整个动作区**向上溢出到视口之外**。

实测（Chrome，生产构建）：

| 视口宽 | `保存` | `生成全集` | `成片` |
| --- | --- | --- | --- |
| 1560 px | `top: -17` | `top: -17` | `top: -17` |
| 1280 px | `top: -17` | `top: -17` | `top: -17` |

`top` 为负 = 元素上边缘在视口之上，**按钮上半截被裁掉**，两种宽度下都复现。
截图见 §3.2 步骤 6 的描述。

根因是槽位边界的错配：`GenerateActions.tsx` 的文件头写明「只做按钮 + 徽章 + 原因文案，
不碰编辑区布局」——它被设计成**板内**组件，而 W3 集成把它接进了**顶栏**。
修复不该是给 topbar 加 `overflow` 遮丑，而应把板级生成动作放回板头信息条，
顶栏只留 `保存` / `生成全集` / `成片` 三个单行按钮。

### 4.3 【P1】参考图仍是内存态，刷新即失效

`editor/draft.ts` 的 `FrameImage` 明确标注「本槽位存在内存里」，`GridCellCard.tsx` 用
`URL.createObjectURL(file)` 产出 `blob:` URL。`blob:` URL 的生命周期绑在当页文档上，
**刷新必然失效**，且这些字节从未进入任何仓储。

于是 `assemble()` 产出的 `params.reference_image_keys` 在刷新后恒为空数组——
图生视频这条路在集成分支上是断的。

修复代码已经写完，在 `w4-image-store-8321`：字节存 `ArrayBuffer` 进 IndexedDB 的独立
store（不塞进项目记录，避免 2s 自动保存搬运几 MB），展示时才 `createObjectURL` 并负责
revoke。设计是对的，但接线不对，见 §4.6。

### 4.4 【P1】`纯硬切` 的法源缺口：代码有、法条没有

三份法源自相矛盾：

| 出处 | 说法 |
| --- | --- |
| METH-002 §5「组间衔接」枚举表 | 只列 **5** 项，**不含**「纯硬切」 |
| METH-001 §8「共 5 种，枚举封闭」 | 同上，只列 5 项 |
| METH-003 §1 / §8【CANON】 | B3 → B4 **必须**是「纯硬切」 |
| METH-001 §6 基准板表 | B3 的组间衔接 = **纯硬切** |

集成分支的 `domain/transitions.ts` 直接发了 **6** 项，**没有任何标记**说明第 6 项欠一次
法源修订。这正是「差异悄悄沉进代码」的典型：读代码的人看到封闭枚举有 6 项，
读 METH-002 的人看到 5 项，谁都不会发现对方不一样。

`w3-templates-golden-library-e98c` 的处理是正确范式——照常可用，但打上
`pending_canon: true` + `pending_canon_reason` + `PENDING_CANON_TRANSITIONS` 待批清单，
「清空它的唯一正当方式是补法源，而不是把取值从目录里删掉」。

**根治动作在文档侧**：P1 方法论属主补录 METH-002 §5 与 METH-001 §8 的第 6 项，
然后把 `pending_canon` 改回 `false`。

顺带记两处更小的措辞漂移（不阻塞，合流时一并收）：METH-002 写「螺口顺滑」，
代码写「螺口顺滑过渡」；METH-002 写「BGM 升调截断」（带空格），代码写「BGM升调截断」。

### 4.5 【P0】飞书 / 成片分支仍接演示数据，合流是语义返工不是文本合并

`git merge` 只报 1 个冲突文件（`routes/ExportPage.tsx`），会让人误判为半小时的活。实际上：

```ts
// w4-feishu-export-925d : apps/web/src/routes/ExportPage.tsx
import { findDemoProject } from '../data/demoProjects';
const project = findDemoProject(id);
```

该分支的成片页读的是 **`data/demoProjects` 演示夹具**——而这个文件在集成分支上
**已被删除**（W2 的 `feat(store): replace demo fixture with local IndexedDB persistence`
把它换成了真仓储）。飞书分支从未 rebase 到持久化之后，所以它整条数据链都建在夹具上。

连带两处必须一起改：

1. `export/segments.ts` 的 `video_url` 取自 `GenerateBoardState`（**内存队列态**）。
   集成分支的判据是落库的 `hasVideo(beat)`。刷新之后只有后者还在，合流后必须以落库值
   为准、队列态为辅。
2. `export/projectExport.ts:127` 写的是 `prompt_final: assemblePrompt(project, beat)`
   ——**当场重新组装**，而不是读落库的 `prompt_final` 快照。用户生成后又改了字段的话，
   导出的 Prompt 和真正发出去的那一份就不是同一个。`FR-4-05` 要的是快照，这里得改成
   读 `beat.prompt_final`，缺失时才回落到重组。

好消息：该分支的红线守卫非常扎实（`feishuMarkdown.test.ts` 断言六种衔接取值只出现在
「后期」那一节，Prompt 段里连「衔接」「转场」「后期」三个词都不许出现），
这套测试合流后应原样保留。

### 4.6 【P1】参考图分支的基线错位：会长出两套图片 UI

`w4-image-store-8321` 切自 `6a118af`（W2 本地持久化），那条线上的 `EditorPage` 还是
**占位页**（正文写着「宫格填写在 WK3 落地」）。所以它把 `FrameImagePanel` 做成了
**板级独立面板**，按 `(projectId, beatIndex)` 取图。

而集成分支的编辑区是 WK3 的真节拍板，**每一格自带投放区**。直接合流的结果是
一个板上出现两套参考图入口：格内的（内存态、刷新即丢）+ 板级的（落库、能恢复）。

正确做法是**只保留格内入口**，把 `draft.ts` 的内存 `FrameImage` 换成
`frameImageStore` 的持久键。可行性没问题：该分支的 `frameImageKey` 已经编码到
帧序（`FrameOrder`、`framesForBeat`），坐标粒度是对的。

### 4.7 【P1】该分支的 CI 比别人弱一档，其新增代码从未过术语闸门

`w4-image-store-8321` 的基线早于 `ci(terms)` 提交（`3f9d98c`），因此：

- 它的 `package.json` **没有** `lint:terms` / `test:terms` 脚本；
- 它的 `.github/workflows/ci.yml` **只有 4 步**（typecheck / test / build），缺术语闸门；
- 它绿的那次 CI（run `33085540982`）跑的是**弱一档的闸门**。

本槽位把集成分支的 `scripts/` + `package.json` 覆盖到该分支上实跑，结果：
19 处命中，其中 **18 处**是它继承的旧注释（合流时由集成分支侧的干净版本胜出，自动消解），
**新增文件里只有 1 处**需要处理：

```
apps/web/src/components/FrameImagePanel.test.tsx:46  expect(text).not.toContain('分镜');
```

这是一条**正当的守卫测试**——必须写出禁用词才能断言 UI 上没有它。
处理方式是照既有惯例，在 `scripts/forbidden-terms.json` 的 `exceptions` 里登记该路径
并写明理由，**不是**改测试、更不是放宽扫描。

**合流硬约束：以集成分支的 `ci.yml` 与 `package.json` 为准，四闸门一步都不能少。**

### 4.8 【P2】生成结果的回写只发生在编辑页

回写逻辑（`EditorPage.tsx` 的 `pendingVideoUrls` effect）挂在编辑页组件上。用户点了
「生成全集」立刻切走，队列仍会跑完并把 job 写进 `localStorage`，但 `video_url` **不会**
当场进项目库——要等用户下次回到该项目的编辑页，控制器从 job store 重建状态后才补写。

后果：刚生成完直接进成片页，会看到「未生成」。数据不丢（可恢复），但状态呈现是错的。
根治要把回写从页面组件下沉到队列订阅层（应用级），不依赖某个页面在场。

### 4.9 【P2】性能预算无自动化闸门

`FR-3-06` 要求 Prompt 实时预览 ≤200ms、NFR 要求首屏 ≤2s，
`ready-queue.md` 的 W5 波第 14 项也列了性能测试。**目前一条性能断言都没有。**
本槽位实测主观流畅（生产构建 296 kB / gzip 96 kB），但没有会变红的守卫。

---

## 5. 下一目标（Wave 6–8）

排序原则：**先收敛分支，再补功能**。§4.1 不解决，后面每一波的返工都要乘以分支数。

### W6 —— 合流波（唯一目标：把四条分支收成一条，并让 `main` 第一次有代码）

| # | 任务 | 属主槽 | 路径归属 | 出口判据 |
| --- | --- | --- | --- | --- |
| 6-1 | 合模板库：解 `domain/transitions*` 冲突，保留 `pending_canon` 三字段与待批清单，模板库整体接入 | `W6-P1` | `apps/web/src/domain/**` | 6 项目录全在、`纯硬切` 被标记待批、templates 的 564 条测试全过 |
| 6-2 | 合成片 / 飞书：`ExportView` 数据源由 `findDemoProject` 改 `useProject(id)`；`segments.ts` 的 `video_url` 以落库值为准；`projectExport.ts` 改读 `beat.prompt_final` 快照 | `W6-P2` | `apps/web/src/export/**`、`src/share/**`、`routes/ExportPage.tsx` | 成片页读真仓储；刷新后 5 段状态不变；`feishuMarkdown` 全部红线测试原样保留并转绿 |
| 6-3 | 合参考图：删板级 `FrameImagePanel` 入口，把 `draft.ts` 的内存 `FrameImage` 换成 `frameImageStore` 持久键；在 `forbidden-terms.json` 登记 `FrameImagePanel.test.tsx` 豁免 | `W6-P3` | `apps/web/src/adapters/images/**`、`src/editor/draft.ts`、`src/editor/GridCellCard.tsx` | 上传参考图 → 刷新 → 图仍在；`reference_image_keys` 刷新后非空；`lint:terms` 绿 |
| 6-4 | **合流后把结果推上 `main`**，四闸门以集成分支版本为准，一步不减 | `W6-P4` | `.github/**`、`package.json`、`main` | `main` 上 `typecheck` / `lint:terms` / `test` / `build` 全绿；此后所有分支从 `main` 切 |

> 6-1 / 6-2 / 6-3 路径互斥，可并行；6-4 串在三者之后。

### W7 —— 缺陷波（只修不加，对应 §4.2 / §4.4 / §4.8）

| # | 任务 | 属主槽 | 路径归属 | 出口判据 |
| --- | --- | --- | --- | --- |
| 7-1 | 修顶栏越界：板级生成动作移回板头信息条，顶栏只留单行按钮 | `W7-P1` | `src/components/AppLayout.tsx`、`src/editor/BeatInfoBar.tsx`、`src/generate/GenerateActions.tsx`、`styles.css` | 1280 / 1440 / 1560 三档宽度下顶栏所有按钮 `top ≥ 0`；补一条布局回归断言 |
| 7-2 | 补法源：METH-002 §5 与 METH-001 §8 补录第 6 项「纯硬切」，顺带统一「螺口顺滑过渡」「BGM升调截断」措辞；随后 `pending_canon` 改回 `false` | `W7-P2` | `docs/methodology/**`（P1 属主）+ `domain/transitions.ts` 单行 | `PENDING_CANON_TRANSITIONS` 为空数组，且该断言写进测试 |
| 7-3 | 回写下沉：`video_url` / `prompt_final` 的回写从 `EditorPage` 移到应用级队列订阅 | `W7-P3` | `src/store/**`、`src/generate/**` | 新增测试：生成后**不经过**编辑页直接进成片页，状态为「已生成」 |
| 7-4 | 衔接叠加（`FR-5-03`）：`transition_rule` 扩为主 + 修饰最多 2 项，B4 恢复「卡点硬切 + BGM 升调」；`FR-5-04` 的 B5 改为只读控件形态 | `W7-P4` | `src/domain/transitions.ts`、`src/editor/TransitionPanel.tsx`、`adapters/persistence/schema.ts`（需一次封套迁移） | 叠加值可落库可读回；旧数据迁移有往返测试；**衔接仍不进 Prompt** 的既有断言不变 |

### W8 —— 闸门波（补 Cycle 1 欠的验证能力，对应 §4.9 与 `ready-queue.md` #13/#14）

| # | 任务 | 属主槽 | 路径归属 | 出口判据 |
| --- | --- | --- | --- | --- |
| 8-1 | E2E 主流程（真浏览器）：新建 → 填满 5 板 14 格 → 生成全集 → 成片页 5 段齐 → 刷新不丢 | `W8-P1` | `e2e/**`（新建目录）、`.github/workflows/ci.yml` | E2E 进 CI 成为第五道闸门；**只增不减既有四闸门** |
| 8-2 | 性能闸门：Prompt 重组 ≤200ms（`FR-3-06`）、首屏 ≤2s、构建产物体积上限 | `W8-P2` | `apps/web/src/**/*.perf.test.ts`、`vite.config.ts` | 超预算即红，不是只打印数字 |
| 8-3 | 迁移演练：封套 `schemaVersion` N-1 → N 往返；配合 7-4 的衔接叠加迁移 | `W8-P3` | `src/adapters/persistence/**` | 旧封套导入后结构锁归一，无数据丢失 |
| 8-4 | 无障碍与交互规范对账（PRD §12）：键盘导航贯通五板、焦点可见、禁用态必给原因 | `W8-P4` | `src/components/**`、`src/editor/**` | 键盘可完成主流程；`IX-3` 逐条对账 |

### 跨波纪律（建议写进 `DISPATCH.md`）

1. **一切分支从 `main` 切**，W6-4 之后不再允许以任何 `cursor/**` 分支为基线。
2. **实现波结束即合流**，不积压跨波分支——`w4-*` 两条分支的返工全部源于此。
3. **`.github/workflows/ci.yml` 与根 `package.json` 的 `scripts` 归属固定槽位**，
   任何分支不得下调闸门；基线过旧导致缺闸门，视同 CI 失败。

---

## 6. 审计边界声明

- 本报告全部结论来自本槽位**亲自复跑**：`npm ci` / `typecheck` / `lint:terms` / `test` /
  `build` 在 `8ffe44f` 工作副本上实跑；三条未合流分支各自 checkout 后实跑；
  试合流在临时 `git worktree` 中进行并全部 `--abort`，未落盘、未推送。
- UI 结论来自 `vite preview` + Chrome 的真实渲染与交互，非 jsdom 推断。
- 本槽位**未修改任何产品代码、未改 CI 配置、未删除任何测试**，只新增 `docs/verify/**`。
