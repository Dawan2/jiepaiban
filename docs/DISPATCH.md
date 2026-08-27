# DISPATCH — 波次调度与交付回执

本文件按 **PLAN SLOT** 分节，每个槽位只写自己的小节，避免跨分支冲突。

---

## P1 — Wave 1/80 · Cycle W1 architecture

### 交付回执（Receipt）

| 项 | 值 |
| --- | --- |
| 波次 Wave | **1 / 80** |
| 槽位 Slot | **P1** |
| 周期 Cycle | **W1 architecture** |
| 模型 Model | `claude-opus-5-thinking-high` |
| 分支 Branch | `cursor/wave1-p1-methodology-canon-94f3` |
| 基线 Base | `main` @ `09e11fd` |
| 方法论提交 SHA | `341ade1d71b3392244a4c41b16410b01edceb544` |
| 回执提交 SHA | `50e22fe583e1df30394a0dba91370c137e3b0b6f` |
| 法源修订 SHA | `9f201c5d1f19d58402050dbd0cf8a46191afef35`（清除正文禁用词用法） |
| 状态 | **已完成（docs-only，无 PR，仅 commit + push）** |

### 交付文件（File List）

| 路径 | 编号 | 内容 | 状态 |
| --- | --- | --- | --- |
| `docs/methodology/seedance-beatboard-system.md` | `METH-001` | 方法论法源：核心公式、人机分工、废弃项、五节拍锁、工作流、基准板表、Prompt 组装法、组间衔接、红线清单、PRD 对齐、评审清单 | 新增 |
| `docs/methodology/glossary.md` | `METH-002` | 术语表：核心实体、五节拍枚举、帧语义、Prompt 槽位、衔接枚举、工作流阶段、**禁用词**、约束锁、项目级数据字段、UI 术语 | 新增 |
| `docs/methodology/golden-5-beats.md` | `METH-003` | 黄金五板完整样板 Beat1–Beat5：逐板规格【CANON】+ 逐帧文案【示例】+ 组装后 prompt + 逐板红线自检 + 衔接总表 + P0 落地要求 | 新增 |
| `docs/DISPATCH.md` | — | 本回执（仅 P1 小节） | 新增 |

路径纪律：本槽位只写 `docs/methodology/**` 与 `docs/DISPATCH.md` 的 P1 小节，未触碰 `docs/architecture/**`、`docs/prd/**` 等其他槽位路径。

### 已锁定的法条（Canon Locked）

1. 恒等式 `1 Beat = 1 G = 1 BeatBoard = 1 Seedance 2.5 generate`。
2. 人机分工：**AI 管组内（运镜/剪辑点/时长微观），人管组间（衔接/宏观情绪节奏）**。
3. 废弃项四条：单镜头 S 拆解、分镜/故事板、单镜时长、逐镜手动转场。
4. 五节拍锁：开篇钩子 → 矛盾建立 → 打压升级 → 反转蓄力 → 断集留客；整集 70–90s。
5. 工作流五段：定节拍 → 定镜头组 → 填节拍帧 → AI 生成 → 后期合成。
6. 基准板表：B1 `0–8s/3帧/音频预接`、B2 `8–25s/3帧/卡点硬切`、B3 `25–45s/3帧/纯硬切`、B4 `45–70s/3帧/卡点硬切+BGM升调`、B5 `70–88s/2帧/无转场黑屏截断`。
7. Prompt 公式：`固定前缀 + 本段情绪 + 时长 + 镜头节奏 + 剧情核心`；固定前缀 `漫剧厚涂画风，高清8K... 人物五官稳定无漂移...`；**转场永不进 prompt**。
8. 红线 R1–R8 与硬锁 L1–L5（5 板不可变 / 无故事板 / 宫格顺序锁 / AI 组内人管组间 / 30s 上限）。

### 已知边界与留待确认项（Open Items）

| # | 事项 | 处理方式 |
| --- | --- | --- |
| O1 | 固定前缀源稿含省略号 `...`，存在受控扩展位 | 已标注为"方法论层统一维护"，待原文补全后回写 `METH-001 §7.1` |
| O2 | `beat` 内部字段清单归 **PRD §8** | 方法论文档不复制，避免双源；由 P3/PRD 槽位落定 |
| O3 | 整集 70–90s 与基准轴 88s 的伸缩规则 | 已明确"可整体伸缩，节拍数与顺序恒定"；具体伸缩算法留给编辑器实现槽位 |
| O4 | `golden-5-beats.md` 中剧情文案为【示例】 | 规格字段为 CANON，文案可替换；模板库以骨架为准 |

### 下一步就绪任务（Ready Tasks for Work Slots）

按可并行、路径互斥原则拆分，每条注明**建议路径**与**依赖**。

| 任务 ID | 任务 | 建议路径 | 依赖 | 可并行 |
| --- | --- | --- | --- | --- |
| T1 | 数据模型定稿：`project` 与 `beat` 表/接口（`project_id`、`name`、`total_duration`、`beat_list[5]`；beat 字段按 PRD §8） | `docs/data/**` | METH-001 §10.3、PRD §8 | 是 |
| T2 | 五节拍模板库规格：模板 JSON 骨架、`frame_count` 由板序推导、`transition_out` 封闭枚举 | `docs/spec/template-library.md` | METH-003 §9 | 是 |
| T3 | Prompt 组装器规格：槽位顺序、只读前缀注入、**转场过滤器**、组装单测用例（可直接取 METH-003 五板组装结果作黄金用例） | `docs/spec/prompt-assembler.md` | METH-001 §7 | 是 |
| T4 | 可视化节拍编辑器 UI 规格：B1–B4 三宫格 / B5 两宫格、帧序左→右只读顺序、无分镜/单镜时长入口 | `docs/ui/beat-editor.md` | METH-001 §6/§10.2 | 是 |
| T5 | 组间衔接管理器规格：5 种手法参数、挂载在上一板、仅后期合成阶段生效 | `docs/spec/transition-manager.md` | METH-001 §8、GLOSSARY §5 | 是 |
| T6 | Seedance 生成层规格：一板一次调用、≤30s 拦截、失败重试与幂等 | `docs/spec/generate-service.md` | METH-001 §1/§9 R3 | 是 |
| T7 | 校验器（Validator）规格与用例：`len(beat_list)==5`、`duration<=30`、宫格数匹配、prompt 无转场词 | `docs/spec/validator.md` | 红线 R3/R5/R7/R8 | 是 |
| T8 | 三页信息架构与导航规格：项目列表 / 核心编辑器 / 成片管理，左侧导航 + 顶部栏 + 主编辑区 | `docs/ui/information-architecture.md` | METH-001 §10.2 | 是 |
| T9 | 禁用词 CI 检查：对仓库文本扫描"分镜/故事板/单镜时长/S1-S3/镜头表" | `docs/spec/lint-forbidden-terms.md` | GLOSSARY §8 | 是 |
| T10 | 评审清单落地为 PR 模板 checklist（METH-001 §11 十项） | `docs/process/review-checklist.md` | METH-001 §11 | 是 |

阻塞关系：T1 需等 PRD §8 字段清单落定（O2）；其余 T2–T10 可立即并行开工。

### 冲突提示（Cross-branch Notes）

- 远端已存在 `cursor/wave1-p1-architecture-35c5`（写 `docs/architecture/**`、`docs/handoff/**`）与 `cursor/wave1-p3-prd-backlog-162d`、`cursor/wave1-wk3-data-api-arch-bdfb`。
- 本分支路径与上述分支**无重叠**；`docs/DISPATCH.md` 若被其他槽位同时创建，合并时按**小节追加**处理，不覆盖他人小节。

---

<!-- 后续槽位请在本行下方追加自己的小节，勿修改上方 P1 小节。 -->
