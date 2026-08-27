# W2 / WK-STORE — 本地持久化（替换演示数据）

- 槽位：Wave 2 / WK-STORE
- 分支：`cursor/wave2-wk-store-local-persistence-7ecb`（起点 `cursor/wave1-wk1-web-scaffold-08d2` @ `a1e603a`）
- 状态：已完成（typecheck / test / build 全绿，131 条测试）
- 法源：PRD（P2 槽位）§5.1 基准表、§7.1 新建、§7.2 复用、§8 数据模型；
  架构（P3 槽位）`tech-stack.md` §2 本地持久化优先、`system-architecture.md` §5 横切关注点

## 1. 本槽位交付了什么

| 交付物 | 位置 |
|---|---|
| 存储驱动端口 + 三实现（IndexedDB / localStorage / 内存） | `apps/web/src/adapters/persistence/drivers.ts` |
| 仓储（`ProjectRepository` 端口的唯一实现） | `apps/web/src/adapters/persistence/localRepository.ts` |
| 落库结构与列表投影 | `apps/web/src/adapters/persistence/schema.ts` |
| 结构锁断言（读写两侧把关） | `apps/web/src/adapters/persistence/locks.ts` |
| 版本化封套、迁移链、JSON 备份序列化 | `apps/web/src/adapters/persistence/envelope.ts` |
| 项目铸造：新建 / 复用 / 归档 | `apps/web/src/store/projectFactory.ts` |
| React 上下文与命令编排 | `apps/web/src/store/ProjectsProvider.tsx` |
| 保存引擎（防抖自动保存 + 手动保存 + 卸载 flush） | `apps/web/src/store/useProjectEditor.ts` |
| 新建项目表单 | `apps/web/src/components/NewProjectForm.tsx` |
| 页面接线：列表 / 编辑 / 成片 | `apps/web/src/routes/*.tsx` |
| 测试脚手架（内存仓储播种） | `apps/web/src/testing/harness.tsx` |

**演示数据 `apps/web/src/data/demoProjects.ts` 已删除。** 首次进入是空库空态，
项目全部来自本地存储。页面测试改为向内存仓储播种，断言因此跑在"真的读写了一次"的路径上。

## 2. 分层与端口

```
路由页（ProjectsPage / EditorPage / ExportPage）
   └── src/store/            ProjectsProvider（命令编排）、useProjectEditor（保存时机）、projectFactory（铸造）
         └── src/adapters/persistence/   LocalRepository ── StorageDriver ──┬── IndexedDbDriver
                                                                            ├── LocalStorageDriver
                                                                            └── MemoryDriver
```

页面**只**调用 `useProjects()` 暴露的命令，不碰 IndexedDB，也不自己拼落库结构。
仓储只依赖 `StorageDriver` 这一个窄接口，因此「换存储介质」与「换业务规则」互不影响。
仓储签名沿用架构文档 `tech-stack.md` §2.2 定义的端口：

```ts
export interface ProjectRepository {
  list(): Promise<readonly ProjectSummary[]>;
  load(id: string): Promise<StoredProject | null>;
  save(project: StoredProject): Promise<void>;
  remove(id: string): Promise<void>;
  exportAll(): Promise<PersistedEnvelope>;
  importAll(envelope: PersistedEnvelope, mode?: 'merge' | 'replace'): Promise<void>;
}
```

演进到服务端时（架构 §7 阶段 3）换实现即可，UI 与领域层不动。

### 驱动选择

`selectDriver()` 按 IndexedDB → localStorage → 内存的顺序做能力探测。
IndexedDB 单库 `beatboard`，两个 object store：`projects`（主键 `id`，一条即完整结构，含 5 块板）
与 `meta`（键 `envelope`，存 `schemaVersion` / `savedAt`）。
localStorage 兜底用前缀键 `jiepaiban:project:<id>`。

**与架构文档的一处偏离**：文档建议用 `idb` 薄封装 IndexedDB，这里用了约 40 行本地 promisify 代替，
目的是把运行时依赖保持为零。因为调用方只看 `StorageDriver`，日后换成 `idb` 只需替换
`drivers.ts` 里的一个实现，不牵动任何业务代码。

## 3. 结构锁：读写两侧把关，失败不静默

写路径：`assertProjectLocks` → 驱动写入 → 刷新 `meta`。违规结构**不落库**。
读路径：驱动读出 → 迁移链 → 归一派生字段 → `assertProjectLocks` → 交给 UI。
断言失败抛 `ProjectLockError`，列表页停在错误态并显示原因，不把违规数据喂进界面。

| 锁 | 断言内容 | 法源 |
|---|---|---|
| 五节拍锁 | `beats` 长度恒为 5；序号恒为 `1,2,3,4,5` 且不可改序 | `RULE-2`、AC-6.1 |
| 宫格锁 | B1–B4 = 3 宫格、B5 = 2 宫格，由板序推导 | `RULE-3`、`FR-1-03` |
| 帧序锁 | 帧位恒为左→右 1–3，无排序权重字段 | `RULE-7`、R4 |
| 转场隔离 | 衔接文案不得出现在 `promptFinal` 快照里 | `RULE-9`、AC-6.4 |
| 无故事板 | 节拍上不得出现 `shot*` / `storyboard` / `camera` / `lens` / `angle` / `framing` / `cutCount` / `perShotDuration` / `intraTransition` / 排序权重等字段 | `RULE-11`、AC-6.8 |

**归一只处理派生值**（宫格数、帧位标号）——这些字段本就"由板序推导、用户不可改"，
读到旧数据里的偏差属历史遗留而非用户意图。结构性违规（板数、序号、禁用字段）不归一，直接抛。

## 4. 与 WK1 领域层的两点关系

**一处按法源修正**：WK1 的 `createDefaultBeats()` 给 5 块板都发 3 宫格，与 `RULE-3`
（B1–B4 = 3、**B5 = 2**）冲突。已在 `domain/beats.ts` 新增 `gridSizeForBeat(index)` 并由它推导，
持久化层每次读写都按它归一。WK1 原有的 `activeCells` / `isBeatReady` 行为与测试均未改动。

> 遗留待对齐：WK1 把 `gridSize` 建成可写字段（注释描述"用户可切 3↔2"），
> 而 `RULE-3` 明确"用户不可改"。本槽位选择在持久化层强制归一，UI 也不提供切换入口。
> 若 WK3 要做宫格切换控件，须先改方法论文档，不能只改代码。

**两个字段加在持久化层**：PRD §8.2 的 `video_url` 与 `prompt_final` 落在
`StoredBeat`（`schema.ts`）而非 `domain/beats.ts`，以免与 WK2 的领域建模抢同一文件；
WK1 那条"节拍字段集合与 PRD 5.2.2 一致"的断言因此仍然成立。待 WK2 的规范 beat 模型落地后，
`StoredBeat` 可直接收敛过去——收敛时记得同步 `SCHEMA_VERSION` 与迁移链。

## 5. 新建与复用

**新建（PRD §7.1）**：`createEmptyProject()` 恒产 5 块锁定板，不接受"板数"参数，
表单里也没有这一项。时长按 §5.1 基准表 `8 / 17 / 20 / 25 / 18`（合计 88s）落值；
目标时长变化时按基准比例摊分并保证总和精确等于目标值，单板一律夹在 1–30s 内（`RULE-4` 硬上限）。
衔接按基准表预置（B5 = 无转场，黑屏截断），纯人读信息，永不进 Prompt。

**复用（PRD §7.2）**：复制**结构与参数** + 清空**内容**，不是"另存副本"。

| | 字段 |
|---|---|
| 继承 | 板序与语义（`index` / `role` / `name`）、宫格数、时长、衔接、板级情绪与剧情概要、项目级参数（题材 / 画幅 / 画风 / 主角 / 目标时长） |
| 清空 | 节拍帧画面文案（`cells`）、`promptFinal`、`videoUrl`、生成状态（回 `empty`） |

复用产物记 `reusedFromId` 便于追溯，且仍是合法的 5 板锁定结构（有测试断言）。

## 6. 列表页操作

- **新建**：表单必填校验走 `domain/projects.isNewProjectValid`，未填齐按钮置灰。
- **复用**：每张卡一个入口，落库后提示"结构与参数已继承，画面文案已清空"。
- **归档**：从进行中列表收起，数据保留；可切到归档视图取消归档。
- **删除**：**已有生成视频时强制二次确认**（对话框写明有几段视频、提示先导出备份）；
  没有视频的空项目直接删，不打扰用户。本地库删了找不回来，所以确认只加在真会丢东西的场景。
- **导出 / 导入备份**：导出全库为 `jiepaiban-backup-YYYYMMDD-HHmm.json`；
  导入默认 `merge`（同 id 覆盖、其余保留），另有 `replace`（清库后整体写入）。
  导入**整批过锁后才落任何一条**，宁可整批拒绝也不留下一半导入的库。

## 7. 保存（`FR-2-11`）

`useProjectEditor` 只管草稿态与写盘时机，不认识任何具体字段：调用方传一个纯函数改草稿。

- 字段变更 → `dirty` → 2s 防抖 → 写盘（连续输入只在最后一次之后写一次）。
- 顶部栏「保存」按钮立即写盘，输入框失焦亦即时保存。
- 组件卸载（含路由切换）与 `beforeunload` 强制 flush。
- 写盘失败停在 `保存失败` 态，改动仍留在内存，下次输入或手动保存会重试。
- 保存态常驻顶部栏：`已保存 / 未保存 / 保存中… / 保存失败`。

开发中修掉四处真实缺陷，均已补回归测试（其中两条做过变异验证：把修复回退后测试确实转红）：

1. 草稿同步发生在 effect 里，页面首帧可能"已显示内容但草稿仍为 null"，
   此时用户的第一次输入会被静默丢弃。改为 `update()` 在草稿缺失时以仓储读到的项目为基准。
2. 每次保存后仓储会重读并产出新对象，原先的重置 effect 跟着对象身份走，
   会把正在输入的改动回滚。改为只在**项目 id 变化**时重置草稿。
3. **`ProjectsProvider` 读库死循环**：`now` 的默认值原本写成默认参数里的内联箭头函数，
   每次渲染都是新身份，`repository` / `refresh` 随之重建，`refresh` 的 effect 反复触发，
   形成"读库 → setState → 重渲染 → 又读库"的死循环。默认时钟已改为模块级常量。
   注意这条**单测全绿也照样存在**：测试一直显式注入 `repository` 与 `now`，
   恰好绕开了生产入口（`main.tsx` 不传任何 prop）的用法，只有真实浏览器暴露出来
   （编辑区被无限卸载重建，输入框根本打不上字）。已补一条"不传任何 prop"的用例钉死。
4. **保存后编辑区重建**：`useProject` 原先依赖上下文里的 `load`，
   而该函数每次列表刷新都换身份，于是每次保存都把 `useProject` 打回 loading 态、
   整片卸载重建（输入框失焦、光标丢失）。改为依赖身份稳定的 `repository`。

第 3 条是本槽位最值得记的一课：**纯单测无法覆盖"生产入口怎么用这个组件"**。
新增依赖注入型 Provider 时，请务必留一条"按生产方式（不传可选 prop）渲染"的用例。

## 8. 明确不在本槽位范围内

- 宫格（节拍帧）编辑器组件 → WK3。只需把改动交给 `editor.update()`，
  即自动共享防抖、保存态与落盘链路，**不要再写一套保存逻辑**。
- Prompt 组装（`assemblePrompt`）→ WK2。本槽位不实现、不复制任何组装逻辑，
  只在落库时断言"衔接文案没进 `promptFinal`"。
- 生成队列与状态机、成片播放 / 下载 / 拼接 → 后续槽位。
  `jobs` / `snapshots` / `segments` / `blobs` / `settings` 等 object store 尚未创建，
  由对应槽位在 `DB_VERSION` +1 的 `onupgradeneeded` 里补建。
- 服务端、鉴权、跨设备同步：V1.0 无服务端，跨设备以导入 / 导出 JSON 兜底。

## 9. 给下游槽位的接口约定

```ts
import { useProject, useProjects } from '@/store/ProjectsProvider';
import { useProjectEditor } from '@/store/useProjectEditor';
import type { ProjectSummary, StoredBeat, StoredProject } from '@/adapters/persistence';

// 编辑页里改任意字段（宫格、情绪、时长…）都走这一条路径：
const { project } = useProject(id);
const { save } = useProjects();
const editor = useProjectEditor(project, { save });

editor.update((current) => ({
  ...current,
  beats: current.beats.map((beat) =>
    beat.index === 1
      ? { ...beat, cells: [{ order: 1, description: '雨夜巷口' }, beat.cells[1], beat.cells[2]] }
      : beat,
  ),
}));
```

- 不要绕过仓储直接写存储：结构锁只在仓储与 `projectFactory` 两处把关，绕过去等于绕过红线。
- 落库结构变更**必须**同步 `SCHEMA_VERSION` +1 并在 `MIGRATIONS` 里补迁移函数与迁移单测，
  否则老用户的库读不回来。
- 测试请用 `src/testing/harness.tsx` 的 `seedRepository` / `renderApp`（内存驱动 + 固定时钟与 id）。

## 10. 验证

```bash
npm install
npm run typecheck   # tsc --noEmit，无错误
npm test            # Vitest：10 个文件 / 134 条测试全部通过
npm run build       # 生产构建通过
```

测试分布：

| 文件 | 覆盖 |
|---|---|
| `store/projectFactory.test.ts`（19） | 五节拍锁、无第 6 块板、改序拒绝、宫格锁、基准表时长、复用清空与继承 |
| `adapters/persistence/localRepository.test.ts`（40） | 同一批断言跑在三种驱动上：CRUD、列表投影、归档、导入导出往返、merge/replace、违规拒绝、转场泄漏拦截、封套版本与迁移 |
| `adapters/persistence/locks.test.ts`（5） | 帧序锁归一、帧槽位缺失、分镜字段黑名单逐项 |
| `store/useProjectEditor.test.tsx`（11） | 防抖、手动保存、卸载 flush、失败重试、缺陷 1 / 2 的回归 |
| `store/ProjectsProvider.test.tsx`（3） | 上下文稳定性：不传 prop 时不死循环、列表刷新不重读项目（缺陷 3 / 4 的回归） |
| `routes/ProjectsPage.test.tsx`（15） | 空态、新建落 5 板、复用、归档、删除二次确认、导入导出 |
| `routes/EditorPage.test.tsx`（7） | 从仓储读出、B5 两宫格、失焦保存、手动保存、保存态、落盘后锁完好 |
| `App.test.tsx`（13） | WK1 原有的骨架 / 路由 / 红线断言，改为向内存仓储播种 |
| `domain/*.test.ts`（21） | WK1 原有断言，未改动 |

### 真实浏览器验证

`fake-indexeddb` 只能证明驱动逻辑，证明不了真实 IndexedDB 的事务与 keyPath 行为，
因此额外在 Chrome（Playwright 驱动）上跑了一遍端到端，确认：

- 空库空态 → 新建 → 直接读 IndexedDB 核对：`beatboard` 库含 `projects` / `meta` 两个 store，
  项目恰 5 块板、宫格 `[3,3,3,3,2]`、时长 `[8,17,20,25,18]`、衔接为基准表五项。
- 刷新页面后项目仍在（真持久化，不是内存态）。
- 编辑页改备注 → 保存态 `未保存 → 已保存` → 刷新后内容仍在（防抖自动保存真的落了盘）。
- B5 显示"2 宫格"。
- 复用产物 5 块板、宫格数保留、全部节拍帧为空、`reusedFromId` 指向来源。
- 删除无视频项目直接生效。

缺陷 3 / 4 就是这一步发现的。
