# jiepaiban 节拍板

Seedance2.5 专属的 AI 短剧节拍板工业化生产工具 —— **填五张节拍卡，出五段视频，组一集短剧**。

产品规格见 [`docs/prd/`](docs/prd)（由 P3 槽位维护），架构见 [`docs/architecture/`](docs/architecture)。
本仓库当前阶段为 Wave 1 前端脚手架，落地记录见 [`docs/work/w1-wk1-scaffold.md`](docs/work/w1-wk1-scaffold.md)。

## 技术栈

- Vite 7 + React 19 + TypeScript（strict）
- react-router-dom 7
- Vitest 3 + Testing Library（jsdom）

## 目录结构

```
apps/web/            前端应用（npm workspace: @jiepaiban/web）
  src/App.tsx        路由表（/ · /p/:id · /p/:id/export）
  src/components/    AppLayout（左导航 + 顶部栏 + 主区，PRD 锁定）、BeatNav、MainNav
  src/domain/        产品规则与类型（五节拍、宫格、项目）
  src/routes/        三个页面
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
npm test            # Vitest 跑一遍全部单测
npm run test:watch  # 监听模式
npm run typecheck   # 仅 TypeScript 类型检查
```

也可以进入 `apps/web` 直接跑，例如单文件：

```bash
cd apps/web && npx vitest run src/domain/beats.test.ts
```

CI（`.github/workflows/ci.yml`）在 push / PR 上执行 `npm run typecheck`、`npm test`、`npm run build`。

## 产品红线（改代码前必读）

这些规则由类型与单元测试锁定，测试失败即为违反规格，**不要删测试来"修"它**：

1. **恒 5 个节拍**：项目创建即自动生成 5 拍，不提供增删节拍的 UI / API / 导出函数（AC-6.1）。
2. **没有"分镜"**：节拍是唯一生成单元（一拍 = 一次生成 = 一段视频）。画面由 **3 或 2 格宫格**的白话描述构成，
   不存在镜头级实体，也不得引入景别 / 机位 / 运镜等字段；全站 UI 文案与路由不得出现"分镜"入口（AC-6.3 / AC-6.8）。
3. **衔接不进 AI**：节拍的「衔接」「备注」「节拍名称」三字段永不进入 Prompt 与生成请求体（AC-6.4）。

对应断言位于 `apps/web/src/domain/beats.test.ts` 与 `apps/web/src/App.test.tsx`。
