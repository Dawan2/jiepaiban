# DISPATCH — 槽位调度台账

> **分段所有制**：每个槽位只维护自己的段落，**不得修改他人段落**；段落内只追加、不重排。
> 本文件由 Wave 1 / P3 创建，创建时仅写入 P3 段。其他槽位请在文末追加自己的段落。

---

## P3 — 架构与 Backlog（Wave 1 / Cycle 1）

- **分支**：`cursor/wave1-p3-architecture-backlog-344b`
- **日期**：2026-08-27
- **状态**：已完成

### 1. 交付物

| 文件 | 内容 |
| --- | --- |
| `docs/architecture/system-architecture.md` | 系统锁 L1–L7 与其固化手段、四层架构与依赖方向、五条核心数据流、目录结构、已知取舍、四阶段演进路径、口径对齐 |
| `docs/architecture/data-model.md` | TypeScript 实体规格：`BeatTuple`（5 元组）、`FrameList`（3\|2 联合元组）、`Frame`/`AiParam`/`TransitionRule`/`PromptSnapshot`/`GenerationJob`/`Segment`、工厂铸造规则、不变量与就绪校验、持久化封套与迁移、L4 禁用词表 |
| `docs/architecture/tech-stack.md` | 仓库勘察结论（绿地）与选型定稿：Vite + React + TS + Vitest + Playwright；本地持久化（IndexedDB）优先；Seedance 适配器桩 + FakeProvider；错误映射五类；测试策略与覆盖率门槛 |
| `docs/architecture/prompt-engine.md` | 组装公式（前缀 + 节拍语义 + 宫格时序，时长走参数位）、结构性排除的四层防御、来源标注、快照冻结、测试规格、演进约束 |
| `docs/backlog/wave-plan.md` | 80 波 / 16 Cycle 排布；W2–W4 的 12 个具名槽位任务（含文件归属、DoD、依赖） |
| `docs/backlog/ready-queue.md` | 14 项优先级就绪队列、阻塞项与解阻条件、四张文件归属表、撞车高危区、未决项应对 |

### 2. 编码进架构的锁

| 锁 | 内容 | 固化手段 |
| --- | --- | --- |
| **L1** | `beat_list` 恒 5，不可增删改序 | 5 元组类型 + `readonly index/role` + 无增删导出符号 + `assertLocks` |
| **L2** | `frame_list` 长度 3\|2；**B1–B4 = 3，B5 = 2**（共 14 格），左→右时序 | `FrameList` 联合元组 + `FRAME_COUNT_BY_INDEX`（`satisfies` 保护）+ `assertFrameShape` |
| **L3** | 单节拍 **≤ 30s** | `makeDurationSec` 构造校验 + 就绪校验 + 组装器兜底 |
| **L4** | **schema 中无分镜类型** | 实体层无 `Shot`/`Camera`/`Storyboard` 等；`Frame` 仅"描述 + 可选参考图"；CI 禁用词扫描（含中文 `分镜/景别/机位/运镜`） |
| **L5** | 衔接（及备注、节拍名）**绝不进 Prompt 与请求体** | `BeatAssembleView` 类型层够不着 + `toAssembleView` 唯一投影点 + 运行时 `assertNoRedline` + 属性测试 |
| **L6** | Seedance 2.5 专属 | 单 Provider + Fake；UI 无模型选择器 |
| **L7** | 所见即所发 | `text` 由 `segments` 派生；面板与提交共用同一纯函数；E2E 请求体比对 |

### 3. 关键决策（其他槽请知悉）

1. **本地优先形态**：V1.0 为纯前端 SPA + IndexedDB + 适配器桩，不引入 PG/Redis/BullMQ。理由与代价见 `system-architecture.md` §2.1、§6；服务端演进被压缩为"换 `ProjectRepository` 实现 + 加代理服务"，领域层与组装器零改动。
2. **红线做成类型，不做成纪律**：L5 的主手法是**收窄组装器输入类型**（`BeatAssembleView` 不含被排除字段），"默认不进 Prompt"，新增字段必须显式改唯一投影点。
3. **`FakeProvider` 先行**：队列、状态机、快照、重试的集成测试全部先跑在 Fake 上，使 Cycle 1–4 不被 Seedance API 不确定性阻塞，真连推迟到 Cycle 5。
4. **未决项收敛为单点常量**：多镜头连接符、前缀文案、时长上限、宫格是否可切换，各自的改动范围均被压到一个常量或一个不变量（`ready-queue.md` §5）。
5. **文件归属制**：同一波内任一路径只有一个属主槽，`package.json` 与 `src/domain/types.ts` 为高危区，须集中变更。

### 4. 口径裁决与未决项

已裁决（本文档族采纳口径）：

| 事项 | 采纳 | 依据 |
| --- | --- | --- |
| 宫格数 | **B1–4 = 3、B5 = 2**（P1 口径），类型仍为 3\|2 联合 | 调度指令锁；PRD 的"节拍级可切换"若被裁定，只需放松不变量 |
| 单板时长 | `≤30s` 为硬锁，`70–90s` 全集为软提示 | PRD 与 P1 兼容处理 |
| 衔接结构 | 4 条 `TransitionRule`（接缝制，手法枚举 + 自由备注） | P1 口径 |

待上游确认（**均不阻塞 W2–W4**）：

1. 宫格是否允许节拍级切换 3↔2 —— 责任：产品槽；
2. Seedance 2.5 多镜头 Prompt 的确切语法 —— 责任：对接槽，Cycle 5；
3. 单板 30s 是否为 API 硬上限，时长是参数位还是需入文本 —— 责任：对接槽，Cycle 5；
4. 固定前缀最终文案（"漫剧厚涂、8K、五官稳定"是否定稿）—— 责任：产品槽。

### 5. 与其他分支的关系

| 分支 | 关系 |
| --- | --- |
| `cursor/wave1-p3-prd-backlog-162d` | **上游依据**。本文档族的产品口径以其 PRD 转写为准 |
| `cursor/wave1-p1-architecture-35c5` | **上游依据**。源稿红线（5 板 / 3·3·3·3·2 / ≤30s / 组间人工）以其为准；本文档族是其工程化展开 |
| `cursor/wave1-wk3-data-api-arch-bdfb` | **部分取代**。其 `docs/architecture/data-model.md` 成稿于源稿注入前，含 `order_key` 拖拽排序、`camera_json` 运镜参数、一板多镜次，违反 L1/L2/L4。**合流时以本分支的 `data-model.md` 为准**；其错误码体系、幂等 hash、参数快照理念可复用（`PromptSnapshot` 已吸收）。合流冲突点：`docs/architecture/data-model.md` 同名文件 |

### 6. 下一步

- **W2 立即可开工项**：`ready-queue.md` §1 的 #1–#4；瓶颈是 #1（脚手架），建议以最小配置先合一次以尽早解阻其余槽位。
- **W6（下一个架构波）应处理**：Provider 端口定稿、任务状态机迁移表、队列并发与退避策略、重启恢复语义。
- **验证波产出**：每个 Cycle 的验收报告追加到本段（红线状态 / 覆盖率 / AC 对账 / 架构漂移条目数 / 顺延项）。
