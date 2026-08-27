# jiepaiban 节拍板

Seedance2.5 专属的 AI 短剧节拍板工业化生产工具 —— **填五张节拍卡，出五段视频，组一集短剧**。

产品规格见 [`docs/prd/`](docs/prd)（由 P3 槽位维护），架构见 [`docs/architecture/`](docs/architecture)。

落地记录：

- Wave 1 前端脚手架 —— [`docs/work/w1-wk1-scaffold.md`](docs/work/w1-wk1-scaffold.md)
- Wave 1 领域核心（五节拍锁与 Prompt 规则）—— [`docs/work/w1-wk2-domain.md`](docs/work/w1-wk2-domain.md)
- Wave 1 节拍板编辑区 —— [`docs/work/w1-wk3-ui.md`](docs/work/w1-wk3-ui.md)
- Wave 2 本地持久化（替换演示数据）—— [`docs/work/w2-local-store.md`](docs/work/w2-local-store.md)
- Wave 2 Prompt 组装与生成引擎 —— [`docs/work/w2-prompt-generate.md`](docs/work/w2-prompt-generate.md)
- Wave 3 编辑区 + 本地库 + 生成三条链路合流 —— [`docs/work/w3-integrate-store-gen.md`](docs/work/w3-integrate-store-gen.md)

## 技术栈

- Vite 7 + React 19 + TypeScript（strict）
- react-router-dom 7
- Vitest 3 + Testing Library（jsdom），持久化层用 fake-indexeddb 跑真实驱动
- 零运行时依赖的本地存储：IndexedDB → localStorage → 内存，逐级回落

## 目录结构

```
apps/web/            前端应用（npm workspace: @jiepaiban/web）
  src/App.tsx        路由表（/ · /p/:id · /p/:id/export）
  src/components/    AppLayout（左导航 + 顶部栏 + 主区，PRD 锁定）、BeatNav、MainNav、NewProjectForm
  src/domain/        产品规则与类型：五节拍锁、宫格锁、衔接封闭目录、项目、Prompt 硬排除
  src/prompt/        Prompt 组装器（项目级 → 节拍级 → 宫格级三段）
  src/editor/        节拍板编辑区：信息条、画面宫格、组间衔接、Prompt 实时预览
  src/generate/      Seedance 2.5 生成引擎：拦截链 → 队列 → 适配器 → 控制器
  src/adapters/      persistence/：本地仓储、存储驱动、结构锁、版本化封套与迁移
  src/store/         应用编排：项目铸造（新建 / 复用）、上下文命令、保存引擎
  src/routes/        三个页面
  src/testing/       测试脚手架（内存仓储播种、Prompt 金样本）
scripts/             禁用词扫描（`npm run lint:terms`）
docs/work/           各工作槽位的落地记录
```

## 运行

需要 Node.js ≥ 20.19（推荐 22）。所有命令在仓库根目录执行。

```bash
npm install         # 安装依赖（npm workspaces）
npm run dev         # 开发服务器 http://localhost:5173
npm run build       # 类型检查 + 生产构建到 apps/web/dist
npm run preview     # 预览构建产物
```

## 测试

```bash
npm test            # 禁用词扫描 + Vitest 跑一遍全部单测
npm run test:watch  # 监听模式
npm run typecheck   # 仅 TypeScript 类型检查
npm run lint:terms  # 仅禁用词扫描（NFR-7）
```

也可以进入 `apps/web` 直接跑，例如单文件：

```bash
cd apps/web && npx vitest run src/domain/beats.test.ts
```

CI（`.github/workflows/ci.yml`）在 push / PR 上执行 `npm run typecheck`、`npm run lint:terms`、
`npm test`、`npm run build`。

## 产品红线（改代码前必读）

这些规则由类型与单元测试锁定，测试失败即为违反规格，**不要删测试来"修"它**：

1. **恒 5 个节拍**：项目创建即自动生成 5 板，不提供增删节拍的 UI / API / 导出函数（AC-6.1、`RULE-2`）。
2. **没有"分镜"**：节拍是唯一生成单元（一板 = 一次生成 = 一段视频）。画面由宫格的白话描述构成，
   不存在镜头级实体，也不得引入景别 / 机位 / 运镜等字段；全站 UI 文案与路由不得出现"分镜"入口（AC-6.3 / AC-6.8）。
3. **宫格数由板序推导**：B1–B4 = 3 格、B5 = 2 格，**用户不可改**，不提供切换入口（`RULE-3`、`FR-1-03`）。
4. **衔接不进 AI**：节拍的「衔接」「备注」「节拍名称」三字段永不进入 Prompt 与生成请求体（AC-6.4、`RULE-9`）。
5. **单板时长 ≤ 30 秒**，整集 70–90 秒，时间位（0-8 / 8-25 / 25-45 / 45-70 / 70-88）是规格而非派生值（`RULE-4`、`RULE-5`）。

锁分三处把关，各管一段，任何一处都不该被绕开：

| 位置 | 管什么 |
| --- | --- |
| `src/domain/beats.ts` | 结构在类型层与运行时同时锁死：`beat_list` 与 `frames` 冻结，结构字段不可写 |
| `src/adapters/persistence/locks.ts` | 落库前 / 读回后重铸并断言：违规不落库，历史偏差归一回 canon |
| `src/prompt/assemble.ts` + `src/generate/interceptors.ts` | Prompt 与生成请求体的硬排除：衔接 / 板名 / 备注够不着，不是拼完再删 |

对应断言位于 `apps/web/src/domain/beats.test.ts`、`apps/web/src/domain/locks.test.ts`、
`apps/web/src/editor/BeatBoard.test.tsx`、`apps/web/src/App.test.tsx`、
`apps/web/src/adapters/persistence/locks.test.ts` 与 `apps/web/src/store/projectFactory.test.ts`。
