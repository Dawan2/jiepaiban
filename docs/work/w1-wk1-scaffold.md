# W1 / WK1 — 前端脚手架（基础层）

- 槽位：Wave 1 / WK1（foundation）
- 分支：`cursor/wave1-wk1-web-scaffold-08d2`
- 状态：已完成（typecheck / test / build 全绿）
- 依据：`docs/prd/prd-seedance-tool.md`（P3 槽位，正式版 v1.0）第 5.1 / 5.2 / 5.5 章与第 6 章验收

## 1. 本槽位交付了什么

| 交付物 | 位置 |
|---|---|
| Vite + React + TypeScript 应用（npm workspaces） | `apps/web`，根 `package.json` 转发脚本 |
| 三条路由 | `apps/web/src/App.tsx` |
| 全站骨架（左导航 + 顶部栏 + 主区） | `apps/web/src/components/AppLayout.tsx` |
| 五节拍导航（固定 5 项 + 状态点） | `apps/web/src/components/BeatNav.tsx` |
| 产品规则与类型 | `apps/web/src/domain/beats.ts`、`apps/web/src/domain/projects.ts` |
| Vitest + Testing Library 与 33 条单测 | `apps/web/src/**/*.test.ts(x)`、`apps/web/vitest.setup.ts` |
| CI（typecheck + test + build） | `.github/workflows/ci.yml` |
| 运行/测试说明 | `README.md` |

### 路由表

| 路径 | 页面 | 对应 PRD |
|---|---|---|
| `/` | 项目列表（项目卡 + 五节拍完成度点阵） | 5.1.3 |
| `/p/:id` | 节拍编辑（左侧固定 5 项节拍导航 + 编辑区 + Prompt 面板位） | 5.2 |
| `/p/:id/export` | 成片（固定 5 张段卡、一键拼接置灰标注 V1.1） | 5.5 |

兜底：未知项目 → `ProjectMissing`；未知路径 → `NotFoundPage`。二者同样走 `AppLayout`，骨架无例外。

### 布局锁定（PRD lock）

`AppLayout` 是唯一页面容器：顶部栏（`<header role=banner>`）、左导航（`<nav>`）、主区（`<main>`）
由 CSS Grid 固定为 `topbar / nav+main`。页面只能往这三个插槽填内容，不得另开平行中枢
（无剧本工作台、无分镜表、无剪辑时间线）。`App.test.tsx` 对三条路由逐一断言三个 landmark 同时存在。

## 2. 硬产品规则如何被锁住

规则写在类型与注释里，并由测试断言兜底（改坏即红，不允许删测试）：

- **恒 5 拍**：`BEAT_COUNT = 5`、`BeatIndex = 1|2|3|4|5`、`BEAT_PRESETS` 五项预填名称与叙事定位；
  `createDefaultBeats()` 恒返回 5 个节拍。`beats.ts` **不导出**任何 `add*/insert*/remove*/delete*` 函数，
  并有一条测试扫描模块导出名来防止后人加回来（AC-6.1）。
- **无分镜**：节拍模型只有宫格（`GridCell = { order, description }`），测试断言宫格字段集合恰为
  `{order, description}`、节拍字段集合与 PRD 5.2.2 表一致，且不含 `shot/storyboard/camera/lens/angle/framing`
  等镜头级字段；另有一条测试断言三条路由渲染出的文案不含"分镜""故事板"，也不含"新增/添加/删除节拍"（AC-6.3 / AC-6.8）。
- **衔接不进 AI**：`PROMPT_EXCLUDED_BEAT_FIELDS = ['name', 'transition', 'note']` 作为组装器（WK3）必须遵守的
  硬排除清单，本槽位断言清单内容；Prompt 全文与请求体级别的断言待组装器落地后由 WK3 补齐（AC-6.4）。
- **宫格 3/2 语义**：`activeCells()` 按 `gridSize` 截取，切到 2 格时第 3 格内容保留为草稿、不参与组装，
  切回 3 恢复；`isBeatReady()` 只校验生效格（AC-6.2 / AC-6.3）。

红线测试做过变异验证：临时给左导航加一个"分镜"菜单项后，AC-6.8 那条测试确实失败（已回滚），
说明断言不是空跑。

## 3. 明确不在本槽位范围内

- 宫格编辑器与节拍卡字段编辑、自动保存（PRD 5.2.3 / 5.2.5）→ WK3
- Prompt 实时组装与来源着色、快照（5.3）→ WK3
- 生成队列与状态机（5.4）、成片播放/下载（5.5.2–5.5.4）→ 后续槽位
- 后端、持久化、鉴权：当前项目数据为 `apps/web/src/data/demoProjects.ts` 的演示数据，接入
  WK3 的数据/API 层后整体替换
- 未新增 `docs/prd/**` 与 `docs/methodology/**` 下任何文件（属其他槽位）

## 4. 给下游槽位的接口约定

```ts
import { BEAT_COUNT, PROMPT_EXCLUDED_BEAT_FIELDS, activeCells, isBeatReady } from '@/domain/beats';
import type { Beat, BeatIndex, BeatStatus, EmotionTone, GridCell, GridSize } from '@/domain/beats';
import type { Project } from '@/domain/projects';
```

- Prompt 组装器请消费 `activeCells(beat)`（已处理 3→2 的草稿排除）与项目级 `stylePrompt / protagonist /
  aspectRatio`，并以 `PROMPT_EXCLUDED_BEAT_FIELDS` 为硬排除依据；`durationSec` 只作为 API 参数位，不拼入文本。
- 提交生成前请用 `isBeatReady(beat)` 做就绪校验，未就绪按钮置灰（AC-6.2）。
- 节拍状态点取 `Beat['status']`（`empty | filled | generating | generated | failed`），`BeatNav` 已按此渲染。
- 路径别名 `@/*` → `apps/web/src/*`（`tsconfig.json` 与 `vite.config.ts` 均已配置）。

## 5. 与 WK3 数据模型草案的冲突（需下游对齐）

`docs/architecture/data-model.md`（WK3 草案 v0.1）成稿时仓库尚无产品规格，其假设与正式版 PRD 冲突：
`beats` 表含 `camera_json`、节拍可拖拽排序（`order_key`）、节拍数量不固定、时长 CHECK IN (5,10)、
把 Beat 表述为"节拍 / 分镜"。按 PRD 正式版应改为：节拍数恒 5 且序号固定 1–5、无运镜字段、
新增宫格（3/2）与情绪基调、衔接字段标注为"绝不进入生成请求"。此项已在此留痕，供 WK3 修订时对齐。

## 6. 验证

```bash
npm install
npm run typecheck   # tsc --noEmit，无错误
npm test            # Vitest：3 个文件 / 33 条测试全部通过
npm run build       # 生产构建通过
```
