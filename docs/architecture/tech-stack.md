# 技术栈（Tech Stack）

> 槽位：Wave 1 / Cycle 1 / **P3**
> 状态：**v1.0 选型定稿（V1.0 迭代范围内）**

## 0. 仓库现状勘察（选型前置）

选型前对仓库做了实际勘察，结论直接决定了"绿地选型"而非"迁就存量"：

| 勘察项 | 结果 |
| --- | --- |
| 提交历史 | 仅 `09e11fd Initial commit` |
| 根目录文件 | 仅 `README.md`（12 字节） |
| 包管理/构建配置 | **无** `package.json`、无锁文件、无 `tsconfig.json`、无 CI 配置 |
| 既有源码 | **无** `src/`，无任何运行时代码 |
| 既有文档 | 仅其他槽位分支上的 `docs/`（PRD、P1 架构、WK3 数据草案），均为文档，无代码约束 |

**结论：绿地项目，零存量包袱。** 因此按调度指令的默认偏好选型：**Vite + React + TypeScript + Vitest + Playwright，本地持久化优先，Seedance API 适配器先做桩。**

---

## 1. 选型总表

| 层 | 选型 | 版本策略 | 理由 |
| --- | --- | --- | --- |
| 构建 | **Vite 5+** | 主版本锁定，次版本跟随 | 冷启动与 HMR 最快；`vite build` 产物即静态文件，本地优先形态零部署成本；`vitest` 与之共享配置与转译管线 |
| 框架 | **React 18+** | 主版本锁定 | 编辑页是"5 板 × 宫格 + 实时面板"的重交互表单，组件化收益明确；生态成熟度最高 |
| 语言 | **TypeScript 5+，`strict: true`** | — | **锁靠类型系统落地**（见 `data-model.md`），非严格模式下元组与品牌类型形同虚设 |
| 路由 | **React Router 6**（`createBrowserRouter`） | — | 只有三条业务路由，够用即可；不引入框架级路由 |
| 状态 | **Zustand + Immer** | — | 单人本地工具无服务端状态同步问题，不需要 TanStack Query；Zustand 的 store 就是应用层，体积小、可在测试中直接实例化 |
| 样式 | **CSS Modules + 设计令牌（CSS 变量）** | — | 无设计系统需求；避免 Tailwind 的类名噪声干扰"UI 文案禁用词扫描"（L4） |
| 持久化 | **IndexedDB（经 `idb` 薄封装）** | — | 需存视频/参考图 Blob 与较大 JSON，`localStorage` 的 5MB 与同步阻塞不可接受 |
| 单测 | **Vitest** | — | 与 Vite 同构；领域层与组装器是纯函数，单测是本项目的主力测试形态 |
| 组件测试 | **@testing-library/react + jsdom** | — | 覆盖交互规则（导航切换保存、按钮置灰） |
| E2E | **Playwright** | — | 覆盖 L4/L7 的"全站级"断言（无分镜入口、面板文本 === 请求体文本），这类断言只有 E2E 能做 |
| 校验 | **ESLint + typescript-eslint + Prettier** | — | 外加自定义禁用词扫描脚本（L4） |
| 包管理 | **pnpm** | 锁文件入库 | 快、磁盘友好；单包结构，暂不上 workspace |
| CI | **GitHub Actions** | — | `typecheck → lint → forbidden-terms → unit → e2e` 五道闸门 |

### 1.1 明确不引入（及原因）

| 技术 | 不引入的原因 |
| --- | --- |
| Next.js / SSR | 无 SEO 需求、无服务端；SSR 只会给本地优先形态增加复杂度。P1 架构提出 Next.js 是基于"有后端"前提，本迭代形态不同（见 `system-architecture.md` §2.1） |
| PostgreSQL / Prisma / Redis / BullMQ | V1.0 无服务端。队列用领域层状态机 + IndexedDB 持久化实现即可满足"重启不丢"（重放恢复） |
| tRPC / GraphQL | 无网络 API 层可契约化 |
| TanStack Query | 无远端服务端状态 |
| Tailwind | 见样式行；且大量原子类会污染 L4 文案扫描 |
| dnd-kit 等拖拽库 | 结构锁 L1/L2 下**没有任何可排序对象**。引入即信号错误 |
| FFmpeg / 剪辑相关 | R7 不做剪辑器；组间衔接是人工职责 |
| 多模型 SDK 抽象层 | L6 模型锁 |

> 表格第二列比选型本身更重要：**"不引入什么"是锁在依赖清单上的投影。** 依赖评审时，任何 PR 引入上表中的包都需要在描述中说明为何锁不再适用。

---

## 2. 本地持久化优先

### 2.1 存储布局（IndexedDB 单库 `beatboard`）

| Object Store | 主键 | 内容 | 备注 |
| --- | --- | --- | --- |
| `meta` | `'envelope'` | `schema_version` / `saved_at` | 迁移入口 |
| `projects` | `id` | `Project`（含 `beat_list[5]`） | 单条即完整结构 |
| `jobs` | `id` | `GenerationJob` | 索引 `by_beat`、`by_state` |
| `snapshots` | `id` | `PromptSnapshot`（不可变） | 只增不改 |
| `segments` | `id` | `Segment` | 只增不改 |
| `blobs` | `key` | 参考图 / 视频缓存 Blob | 与 `assets` 语义等价 |
| `settings` | `key` | API Key、并发上限等 | Key 单独存放，便于一键清除 |

### 2.2 持久化规则

1. **写路径**：命令 → 领域层校验 → store 更新 → 2s 防抖 → `repository.save()`；导航切换与 `beforeunload` 强制 flush。
2. **读路径**：读出 → 迁移链 → `assertLocks` → 入 store。断言失败**不静默**，进入数据修复提示。
3. **端口化**：UI 与应用层只依赖 `ProjectRepository` 接口，`LocalRepository` 是其唯一实现。演进到服务端时换实现即可（`system-architecture.md` §7）。

```ts
export interface ProjectRepository {
  list(): Promise<readonly ProjectSummary[]>;
  load(id: ProjectId): Promise<Project | null>;
  save(project: Project): Promise<void>;
  remove(id: ProjectId): Promise<void>;
  exportAll(): Promise<PersistedEnvelope>;   // 跨设备兜底
  importAll(env: PersistedEnvelope): Promise<void>;
}
```

### 2.3 已知弱点

- **API Key 存于客户端**，无法满足 PRD NFR"Key 仅存服务端且加密"。V1.0 定位单人自持工具，接受该取舍；日志一律经 `redact()`，UI 只显示尾 4 位。演进阶段 2 的最小代理服务端专为解决此项。
- **无跨设备同步**：以导入/导出 JSON 兜底（W3 任务）。
- **浏览器清数据即丢失**：首次进入编辑页的一次性引导中明确告知并建议定期导出。

---

## 3. Seedance API 适配器（先桩后真）

### 3.1 端口定义

```ts
export interface GenerationProvider {
  readonly name: 'seedance-2.5' | 'fake';
  submit(req: GenerationRequest, opts: SubmitOptions): Promise<ProviderTaskRef>;
  poll(ref: ProviderTaskRef): Promise<ProviderTaskStatus>;
  cancel(ref: ProviderTaskRef): Promise<void>;
}

export interface ProviderTaskRef { readonly task_id: string; }

export type ProviderTaskStatus =
  | { kind: 'pending' }
  | { kind: 'running'; progress?: number }
  | { kind: 'succeeded'; video_url: string; thumb_url?: string; duration_sec: number; cost?: number }
  | { kind: 'failed'; error: JobError };
```

**端口只有三个方法**，且入参是 `GenerationRequest`（封闭类型：`prompt` + `params`）。适配器**在类型上无法**读到 `transition`、`memo`、`name`——L5 在依赖注入边界上再获一层保障。

### 3.2 两个实现

| 实现 | 文件 | 用途 |
| --- | --- | --- |
| `SeedanceProvider` | `src/adapters/generation/seedance.ts` | **W2 交付为桩**：完整的请求构造、错误码映射、轮询骨架，但网络调用点标注 `TODO(api-spike)` 并由配置开关短路。待 API spike（W2 任务）确认端点/字段后填实 |
| `FakeProvider` | `src/adapters/generation/fake.ts` | 确定性实现：按 `prompt` 的 hash 决定成功/失败/延迟，返回内置样例 mp4。**队列、状态机、快照、重试的集成测试全部跑在它上面**，不消耗额度、不依赖网络 |

`FakeProvider` 不是"测试替身"这么简单——它让 W2–W4 三个实现波次**完全不被 API 可用性阻塞**，是本迭代排期能够并行的关键。它同时支撑离线演示。

### 3.3 错误映射（`ErrorCategory` 五类）

| Provider 侧信号 | 归类 | 可重试 | 建议动作 |
| --- | --- | --- | --- |
| 401/403、Key 无效 | `auth` | 否 | 检查 API Key 配置 |
| 429、配额耗尽 | `rate_limit` | 是（指数退避） | 稍后自动重试；可下调并发 |
| 内容审核拒绝 | `content_rejected` | 否 | 改写剧情概要或画面描述（**不做自动改写规避**） |
| 400、参数越界 | `bad_param` | 否 | 本地修正（多为时长/画幅） |
| 5xx、超时、网络中断 | `server` | 是 | 自动重试，3 次后置失败 |

映射表是**数据而非分支代码**（`ERROR_MAP` 常量），便于 API spike 后按真实错误码增补，且可被单测穷举。

### 3.4 多镜头语法的单点隔离

Seedance 2.5 的多镜头（宫格逐格切换）提示语法尚未确认。它被隔离为组装器中的**一个常量**：

```ts
export const MULTI_SHOT_JOINER = ' → ';   // 待 API spike 确认（system-architecture.md §8 未决项 2）
```

确认后改这一行 + 更新快照测试基线即可，无需触碰任何调用方。**未决的外部知识必须收敛到单点常量**——这是本项目应对"源稿/API 不确定性"的通用手法。

---

## 4. 测试策略

| 层级 | 工具 | 覆盖对象 | 门槛 |
| --- | --- | --- | --- |
| 单元 | Vitest | 领域层（工厂/锁/就绪/状态机）、组装器（前缀/顺序/红线/快照） | `src/domain/**` 与 `src/prompt/**` 行覆盖 **≥95%**，分支 ≥90% |
| 组件 | Vitest + Testing Library | 左导航切换保存、就绪置灰与缺失项、宫格渲染数、面板来源着色 | 关键交互全覆盖 |
| 集成 | Vitest（Node 环境 + FakeProvider + fake-indexeddb） | 队列并发、重试退避、重启续跑、快照落库 | 状态机全路径 |
| E2E | Playwright | 三页主流程；**L4 全站无分镜入口**；**L7 面板文本 === 请求体文本**（拦截请求比对） | 红线用例为**必过闸门** |

### 4.1 红线测试（CI 必跑，失败即阻断合并）

```
tests/redlines/
├── L1-beat-count.test.ts           # 结构恒 5；无增删导出符号
├── L2-frame-shape.test.ts          # 3/3/3/3/2 与 14 格；格序左→右
├── L3-duration.test.ts             # 越界构造抛错；就绪校验拦截
├── L4-no-storyboard.test.ts        # 禁用词扫描 + 类型层无相关实体
├── L5-transition-excluded.test.ts  # 属性测试：任意衔接/备注/名称内容不出现在 prompt 与请求体
└── L7-wysiwyg.test.ts              # 面板文本与 GenerationRequest.prompt 逐字符相等
```

L5 用**属性测试**（`fast-check`）而非样例测试：随机生成衔接/备注/名称内容（含与画面描述重合的字符串），断言其不出现在输出中。样例测试挡不住"某些内容恰好被拼进去"的回归。

> 唯一例外须显式处理：当衔接内容与画面描述**完全同文**时，子串检查会误报。断言实现改为**基于片段来源**（`segments` 中不存在来自被排除字段的片段）+ 子串检查双轨，前者为主判据。

---

## 5. 工程约定

| 项 | 约定 |
| --- | --- |
| Node | ≥ 20 LTS（`.nvmrc` 入库） |
| 脚本 | `dev` / `build` / `preview` / `typecheck` / `lint` / `test` / `test:e2e` / `check:terms` / `verify`（= 全部闸门串跑） |
| 提交前 | 至少跑 `pnpm verify`；CI 复跑同一条命令，本地与 CI 无差异 |
| 目录 | 见 `system-architecture.md` §4；`src/domain` 与 `src/prompt` **禁止 import** React / 存储 / 网络（ESLint `no-restricted-imports` 强制） |
| 依赖新增 | 需在 PR 描述中对照 §1.1 说明必要性 |
| 类型 | 禁 `any`；`as` 断言仅允许用于品牌类型构造函数内部 |

---

## 6. 选型复审触发条件

以下任一成立时，本文档须重新评审（而非默默偏离）：

1. API Key 安全从"接受取舍"变为硬需求 → 引入最小代理服务端（阶段 2）；
2. 出现跨设备/多人需求 → 引入托管持久化（阶段 3）；
3. Seedance 2.5 要求服务端签名或回调 → 必须有服务端；
4. 单项目数据量超出 IndexedDB 舒适区（经验阈值：单项目 > 50MB Blob）→ 改为仅存元数据 + 远端资产。
