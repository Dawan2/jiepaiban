# 分支地图与建议合流顺序

> 槽位：Wave 5 / 80 · Cycle 1 · **VERIFY**
> 快照时间：2026-08-27（`git fetch --all --prune` 后实测）
> 配套：[`cycle-1-w5.md`](./cycle-1-w5.md)（成熟度 / 阻塞 / 下一目标）

---

## 0. 一句话

**`main` 是空仓（`09e11fd`，只有一个 README），18 条分支里有 4 条携带未合流的产品代码。**
建议合流顺序：`w3-integrate-store-gen` → templates → feishu/export → image-store → **推 `main`**。

---

## 1. 全量分支清单（18 条）

「合流态」列以 `cursor/w3-integrate-store-gen-c1f5` @ `8ffe44f`（当前最佳合成体）为参照系。

### 1.1 集成分支

| 分支 | HEAD | 最后提交 | 领先 main | 合流态 |
| --- | --- | --- | --- | --- |
| `cursor/w3-integrate-store-gen-c1f5` | `8ffe44ff36e421235989d646323f6b4a9ac3c86b` | 15:07 | 48 commits / 108 files | **当前最佳合成体** |
| `cursor/w2-integrate-7738` | `a3aed39a227352f10689cc446087fcdf092d8586` | 14:28 | 36 / 68 | 已被 w3 完全包含 → **可归档** |

### 1.2 待合流（携带未进入集成分支的产品代码）

| 分支 | HEAD | 领先 main | 独有提交 | 内容 | 与 `8ffe44f` 的冲突文件 |
| --- | --- | --- | --- | --- | --- |
| `cursor/w3-templates-golden-library-e98c` | `21ae263599a3` | 14 / 59 | 3 | 黄金五板模板库（`domain/templates.ts` 431 行 + 564 行测试）、`纯硬切` 待批标记 | `domain/transitions.ts`、`domain/transitions.test.ts` |
| `cursor/w4-feishu-export-925d` | `82f4845f35ba` | 17 / 86 | 6 | 成片页全功能（`export/` 16 文件）+ 飞书导出（`share/` 8 文件），约 4500 行 | `routes/ExportPage.tsx` |
| `cursor/w4-image-store-8321` | `3d4b5af85eae` | 10 / 62 | 3 | 参考图字节落 IndexedDB（`adapters/images/`），约 2800 行 | `routes/EditorPage.tsx`、`store/ProjectsProvider.tsx`、`testing/harness.tsx` |
| `cursor/wave1-wk3-data-api-arch-bdfb` | `e045664c4d3e` | 1 / 4 | 1 | 纯文档：API 契约、生成流水线、WK3 交接 | `docs/architecture/data-model.md`（275 行 vs 集成侧 521 行） |

### 1.3 已被完全包含（`git merge-base --is-ancestor` 判定，可归档）

| 分支 | HEAD | 内容 |
| --- | --- | --- |
| `cursor/wave1-p1-methodology-canon-94f3` | `b2d57b607aa3` | METH-001/002/003 方法论法源 |
| `cursor/wave1-p1-architecture-35c5` | `1c3e454e8d67` | 产品架构文档 v1 |
| `cursor/wave1-p2-prd-canon-ce77` | `bc2a4ccc974b` | PRD / 用户故事 / 信息架构 / 验收矩阵 / UI 规格 |
| `cursor/wave1-p3-architecture-backlog-344b` | `282ada4721e2` | 架构基线 + 80 波计划 + 就绪队列 |
| `cursor/wave1-p3-prd-backlog-162d` | `30ed9cf1ae35` | PRD 转写与 P0 backlog |
| `cursor/wave1-wk1-web-scaffold-08d2` | `a1e603ac1226` | Vite + React 19 + TS 脚手架 |
| `cursor/wave1-wk2-domain-core-7777` | `e030f04e017f` | 领域核心：五节拍锁、Prompt 规则 |
| `cursor/wave1-wk3-beat-board-ui-1516` | `523536d9ec0f` | 节拍板编辑区 UI |
| `cursor/wave2-w2-prompt-generate-c608` | `a8f6f26d508b` | Prompt 组装 + 生成引擎桩 + 术语闸门 |
| `cursor/wave2-wk-store-local-persistence-7ecb` | `6a118af0d0db` | 本地 IndexedDB 持久化 |
| `cursor/wave2-w2-export-ca31` | `c92ce40eadad` | **已被 `w4-feishu-export-925d` 严格包含**，勿单独合 |

### 1.4 基线

| 分支 | HEAD | 内容 |
| --- | --- | --- |
| `main` | `09e11fdf4ce4` | 仅 `README.md`（12 字节）。**零产品代码、零 CI。** |

---

## 2. 血缘：三条待合流分支各自切自不同的「当时最好」

```
main 09e11fd
 └─ … wave1 (p1/p2/p3/wk1/wk2/wk3) ─┐
                                     ├─ w2-integrate a3aed39
                                     │
     wave2-w2-prompt-generate a8f6f26 ┤◄── templates 与 feishu 的共同基线
       │                              │
       │  ┌── w3-templates-golden-library ── 21ae263  (未合流)
       │  └── wave2-w2-export ── w4-feishu-export ── 82f4845  (未合流)
       │
       └─ w3-integrate ── ec12592 (折入 prompt/generate)
                       └─ 99b6d40 (折入 local-persistence 6a118af)
                                └─ 8ffe44f  ◄── 当前最佳合成体
     wave2-wk-store-local-persistence 6a118af ◄── image-store 的基线
       └── w4-image-store ── 3d4b5af  (未合流)
```

**关键事实**：`templates` 与 `feishu` 切自 `a8f6f26`（不含本地持久化），
`image-store` 切自 `6a118af`（不含 WK3 编辑区）。三者都不是从 `8ffe44f` 切出来的，
所以文本冲突面虽小（1–3 个文件），语义返工才是真成本
（见 `cycle-1-w5.md` §4.5 / §4.6）。

---

## 3. 建议合流顺序

排序依据：**先动领域层、再动页面层、最后动跨层的存储**；每一步都要求四闸门全绿才进下一步。

### 第 0 步 —— 立基线

以 `cursor/w3-integrate-store-gen-c1f5` @ `8ffe44f` 开一条 `cursor/w6-integrate-*` 集成分支。
`w2-integrate-7738` 与 §1.3 全部分支就地归档，不再作为任何人的基线。

### 第 1 步 —— `w3-templates-golden-library-e98c`（领域层，风险最低）

| 项 | 内容 |
| --- | --- |
| 冲突 | `domain/transitions.ts`、`domain/transitions.test.ts` |
| 解法 | 取模板分支版本（是集成侧的严格超集：多了 `canon_source` / `pending_canon` / `pending_canon_reason` 三个字段与 `PENDING_CANON_TRANSITIONS` 待批清单），把集成侧独有的 `hint` 字段与 `CANON_TRANSITION_BY_BEAT_INDEX` 补进去 |
| 出口 | 6 项目录齐全、`纯硬切` 标记为待批、templates 的 564 行测试全过、四闸门绿 |
| 为何第一 | 只碰 `domain/**`，与后两条分支路径零重叠；先合可让后面两条在合流时就拿到模板数据 |

### 第 2 步 —— `w4-feishu-export-925d`（页面层，返工最重）

| 项 | 内容 |
| --- | --- |
| 冲突 | `routes/ExportPage.tsx`（**1 个文件，但这是假象**） |
| 必做返工 | ① `ExportView` 数据源 `findDemoProject` → `useProject(id)`（`data/demoProjects.ts` 在集成侧已删除）；② `export/segments.ts` 的 `video_url` 以落库 `beat.video_url` 为准、队列态为辅；③ `export/projectExport.ts:127` 由当场 `assemblePrompt(...)` 改读落库的 `beat.prompt_final` 快照 |
| 必须保留 | `share/feishuMarkdown.test.ts` 与 `share/feishuDoc.test.ts` 的 AC-6.4 红线断言，一条不删 |
| 出口 | 成片页读真仓储；刷新后 5 段状态不变；`FR-6-02…06` 打开 |
| 顺带 | `wave2-w2-export-ca31` 随之归档（已被本分支严格包含） |

### 第 3 步 —— `w4-image-store-8321`（跨层，需先降 CI 差）

| 项 | 内容 |
| --- | --- |
| 冲突 | `routes/EditorPage.tsx`、`store/ProjectsProvider.tsx`、`testing/harness.tsx` |
| 前置 | 该分支 CI 缺术语闸门（无 `lint:terms` / `test:terms`）。**合流后以集成侧的 `ci.yml` + `package.json` 为准，四闸门一步不减** |
| 必做返工 | ① 删板级 `FrameImagePanel` 入口，只保留格内投放区；② `editor/draft.ts` 的内存 `FrameImage` 换成 `frameImageStore` 持久键；③ 在 `scripts/forbidden-terms.json` 登记 `apps/web/src/components/FrameImagePanel.test.tsx` 豁免并写明理由 |
| 出口 | 上传参考图 → 刷新 → 图仍在；`reference_image_keys` 刷新后非空；`lint:terms` 绿 |
| 为何最后 | 同时改编辑页、Provider 与测试脚手架，前两步的改动都会落在它的冲突面上 |

### 第 4 步 —— `wave1-wk3-data-api-arch-bdfb`（纯文档，可与 1–3 并行）

| 项 | 内容 |
| --- | --- |
| 冲突 | `docs/architecture/data-model.md`（该分支 275 行 vs 集成侧 521 行） |
| 解法 | **保留集成侧的 `data-model.md`**（更新更全），只取该分支独有的三份：`api-contracts.md`、`generation-pipeline.md`、`handoff/wave1-wk3.md` |
| 出口 | 三份文档入库，`data-model.md` 不倒退 |

### 第 5 步 —— 推 `main`

四闸门（`typecheck` / `lint:terms` / `test` / `build`）在合流分支上全绿后推 `main`。
**此后所有新分支一律从 `main` 切**，`cursor/**` 不再互为基线。

---

## 4. 合流红线（三条，不可协商）

1. **CI 只增不减。** 以集成侧的 `.github/workflows/ci.yml` 与根 `package.json` 为准；
   任何分支因基线过旧而缺闸门，视同 CI 失败，不得因「它自己是绿的」而放行。
2. **不删测试。** 冲突里遇到测试文件，合并两侧断言，不做二选一。
   守卫测试需要引用禁用词时，走 `scripts/forbidden-terms.json` 的 `exceptions` 登记，
   不改测试、不放宽扫描。
3. **红线锁三处齐全。** `domain/beats.ts`（结构锁）、`adapters/persistence/locks.ts`
   （落库锁）、`prompt/assemble.ts` + `generate/interceptors.ts`（Prompt 硬排除）——
   合流后三处必须同时在位，任何一处被绕开即回退该次合并。

---

## 5. 归档建议

合流完成后，下列分支可删或标记只读，避免再被当作基线：

`w2-integrate-7738`、`wave2-w2-export-ca31`、`wave1-p1-methodology-canon-94f3`、
`wave1-p1-architecture-35c5`、`wave1-p2-prd-canon-ce77`、`wave1-p3-architecture-backlog-344b`、
`wave1-p3-prd-backlog-162d`、`wave1-wk1-web-scaffold-08d2`、`wave1-wk2-domain-core-7777`、
`wave1-wk3-beat-board-ui-1516`、`wave2-w2-prompt-generate-c608`、
`wave2-wk-store-local-persistence-7ecb`

（本槽位只给建议，**不执行任何删除**。）
