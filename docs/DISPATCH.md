# DISPATCH — 波次调度与交付回执

本文件按 **PLAN SLOT** 分节，每个槽位只写自己的小节，避免跨分支冲突。

---

## P2 — Wave 1/80 · Cycle W1 · PRD 基线

### 交付回执（Receipt）

| 项 | 值 |
| --- | --- |
| 波次 Wave | **1 / 80** |
| 槽位 Slot | **P2** |
| 周期 Cycle | **W1** |
| 模型 Model | `claude-opus-5-thinking-high` |
| 分支 Branch | `cursor/wave1-p2-prd-canon-ce77` |
| 基线 Base | `main` @ `09e11fd` |
| PRD 提交 SHA | `369180a`（五份 PRD 文档） |
| 引用修正 SHA | `642d583` |
| 回执提交 SHA | `592899e9fb0471f648deeb7d2e176a2f8f46ce50` |
| 上游 P1 方法论 | `cursor/wave1-p1-methodology-canon-94f3` @ `b2d57b607aa377bf4af36e03626253d97b6f83b5`（**未改动，仅引用**） |
| 状态 | **已完成（docs-only，无 PR，仅 commit + push）** |

### 交付文件（File List）

| 路径 | 编号 | 内容 | 状态 |
| --- | --- | --- | --- |
| `docs/prd/prd.md` | `PRD-001` | 产品定义（Seedance 2.5 独占 / 节拍驱动）、目标指标、角色场景、P0 六件套范围、12 条核心规则、六模块功能需求、关键流程、**§8 数据模型（beat 字段唯一来源）**、8 项 NFR、V1.0/1.1/1.2、红线映射、5 项开放项 | 新增 |
| `docs/prd/user-stories.md` | `PRD-002` | 7 个 Epic / **36 条用户故事**（33 条 P0），每条含 `Given/When/Then` 验收条件 + 故事到需求追溯表 | 新增 |
| `docs/prd/information-architecture.md` | `PRD-003` | 三区布局、三页三路由、导航模型、板内五层结构（板头/槽位/宫格/Prompt/板尾）、板状态机、实体页面映射、**IA 禁止清单 IA-X1–X7**、无障碍与断点 | 新增 |
| `docs/prd/acceptance-matrix.md` | `PRD-004` | **106 项 P0 验收 + 4 项 P1**：19 项红线一票否决、恒等式 1:1、六模块功能、生命周期、数据层、NFR、UI/IA、5 条 E2E，逐项给判定条件与验证方式 | 新增 |
| `docs/prd/ui-spec.md` | `PRD-005` | 布局骨架与语义色、三页详规、节拍板卡片五层规格、组件清单 19 项、文案表 22 条、交互规则 IX-1–IX-8、**UI 禁止清单 UI-X1–X12** | 新增 |
| `docs/DISPATCH.md` | — | 本回执（仅 P2 小节） | 新增 |

路径纪律：本槽位只写 `docs/prd/**` 与 `docs/DISPATCH.md` 的 P2 小节；**未触碰** `docs/methodology/**`，未触碰 `docs/architecture/**`、`docs/data/**`、`docs/spec/**`、`docs/ui/**` 等其他槽位路径。

### 已落定的需求基线（Baseline Locked）

1. **产品口径**：Seedance 2.5 独占、节拍驱动短剧工具；不做多模型抽象、不做时间线轨道编辑器。
2. **恒等式落地**：`1 Beat = 1 G = 1 节拍板 = 1 次 generate`；生成任务与板 1:1（`§8.7`），禁拆禁合。
3. **五节拍锁 + 宫格锁**：B1–B4 三宫格、B5 两宫格；`frame_count` 由板序推导且只读。
4. **时长口径**：单板 ≤30s 硬拦截（UI + 服务端双层）；整集 70–90s 为区间提示，越界不阻断编辑但阻断"可交付"。
5. **Prompt 公式**：`固定前缀 + 本段情绪 + 时长 + 镜头节奏 + 剧情核心`；组装器输入白名单仅 `emotion / duration / ai_param.camera_rhythm / ai_param.plot_core`；**转场永不进 prompt**，组装后二次扫描拦截。
6. **§8 数据模型（唯一字段来源）**：`project{project_id,name,total_duration,beat_list[5]}`；`beat{beat_id,group_id,beat_name,emotion,time_range,frame_list,ai_param,transition_rule,prompt_final,video_url}`；`duration / frame_count / beat_index` 为派生项；`frame{frame_id,index,semantic,content}`；`ai_param{camera_rhythm,plot_core,model,aspect_ratio,resolution}`；`transition_rule{codes[1–2],locked,stage=POST_COMPOSITE}`。
7. **禁止字段**：`shot_list`、`cut_count`、`per_shot_duration`、`intra_transition`；`frame` 下不得有时长/转场/排序权重字段。
8. **三页三区**：`/projects`、`/projects/:project_id/editor`、`/final`；板是页内单元，不设板级路由。
9. **新建与复用**：新建必产 5 块锁定板（`total_duration` 初始 88s）；复用 = 结构与参数继承 + 画面内容/prompt/视频/状态清空，原项目不变。
10. **NFR**：页面首屏可交互 ≤1s（P95）、单板 prompt 组装 ≤200ms（P95）、飞书导出字段完整、自动保存 ≤500ms。

### 与 P1 方法论的一致性自检（Canon Compliance）

| 法源检查项 | 落点 | 结论 |
| --- | --- | --- |
| 最小叙事单元为 beat | `PRD-001 §8`、`PRD-003 §5.2`（L3 之下无更细层级） | 通过 |
| beat 恒为 5、语义顺序不变 | `RULE-2`、`AC-R5-1/2/3` | 通过 |
| B1–B4 三宫格 / B5 两宫格 | `RULE-3`、`AC-R7-1/2` | 通过 |
| 帧序仅左→右 | `RULE-7`、`AC-R4-1/2`、`UI-X4` | 通过 |
| 单板 ≤30s 且自动拦截 | `RULE-4`、`AC-R3-1/2/3` | 通过 |
| 生成与板 1:1 | `RULE-10`、`AC-F0-1/2/3/4` | 通过 |
| Prompt 五槽位顺序不变 | `RULE-8`、`AC-F3-1/2` | 通过 |
| prompt 无转场描述 | `RULE-9`、`AC-R8-1/2/3/4` | 通过 |
| 组间衔接人工设定且枚举封闭 | `RULE-12`、`AC-R2-1`、`AC-F5-2` | 通过 |
| 无禁用词（清单声明处除外） | `NFR-7`、`AC-N-7`、`AC-R6-1` | 通过（仅在废弃项/禁用清单声明中出现，均显式标注） |

### 已知边界与留待确认项（Open Items）

| # | 事项 | 处理口径 | 归属 |
| --- | --- | --- | --- |
| `O-P2-1` | `METH-003 §8` 基准表 B3→B4 为"纯硬切"，未列入 `METH-002 §5` 五项封闭枚举 | **PRD 不自行扩枚举**：模板 B3 暂存字面值并标记 `pending_canon`，UI 与导出标注"待法源确认"（`AC-F5-9`）；法源裁定后二选一（补入枚举 / 改基准值）并回写模板 | 方法论槽位裁定 |
| `O-P2-2` | 固定前缀含省略号（受控扩展位） | 产品内整体只读注入，不拆解、不允许项目级改写 | 方法论槽位 |
| `O-P2-3` | 70–90s 伸缩算法 | V1.0 只做逐板时长人工编辑 + 区间提示，不做自动等比伸缩 | 编辑器实现槽位 |
| `O-P2-4` | 飞书导出载体（多维表格 / 文档） | V1.0 以字段完整可读为准，载体由实现槽位选定，字段集见 `NFR-5` | 集成实现槽位 |
| `O-P2-5` | `resolution` 档位与"高清8K"文本前缀的对应 | 取模型实际最高可用档，不作为创作决策暴露在 UI | 生成层实现槽位 |
| `O-P2-6` | `METH-001 §10.1` P0 列 5 项，本 PRD P0 列 6 项（含成片管理） | 成片管理与法源 `§10.2` 第三个页面一一对应，属页面级已批准能力；不新增页面、不新增叙事粒度，不构成法源冲突 | 已在 `PRD-001 §4.1` 记录 |

### 下一步实施任务（Implementer Tasks）

按**路径互斥、可并行**原则拆分。每条给出建议路径、依赖与验收锚点（`AC-*` 见 `PRD-004`）。

| 任务 ID | 任务 | 建议路径 | 依赖 | 验收锚点 | 可并行 |
| --- | --- | --- | --- | --- | --- |
| `I1` | **数据层与契约**：按 `PRD-001 §8` 建 `project` / `beat` / `frame` / `generate_task` 模型与接口契约；实现 `len(beat_list)==5`、`frame_count` 匹配、`duration<=30`、只读字段保护、乱序 `index` 拒绝 | `server/models/**`、`server/schema/**` | `PRD-001 §8` | `AC-D-1`–`AC-D-7`、`AC-R3-2`、`AC-R4-2`、`AC-R5-2/3`、`AC-R7-2` | 是 |
| `I2` | **模板库**：内置黄金五板骨架（时间位/时长/宫格数/预置衔接），新建即实例化 5 板；`frame_count` 服务端推导；B3 打 `pending_canon` | `server/templates/**` | `I1`、`METH-003` | `AC-F1-1`–`AC-F1-4`、`AC-F7-1`、`AC-F5-5/9` | 依赖 `I1` |
| `I3` | **Prompt 组装器**：五槽位固定顺序、只读前缀注入、**输入白名单**、转场词过滤与组装后扫描、缺槽位可解释、≤200ms | `server/prompt/**` 或 `shared/prompt/**` | `PRD-001 §6.3/§8.6` | `AC-F3-1`–`AC-F3-8`、`AC-R8-1/2/3`、`AC-N-2` | 是（可先于 `I1` 以纯函数实现） |
| `I4` | **组装器黄金回归用例**：以 `METH-003 §3–§7` 五板槽位为输入的快照测试 + 转场词命中用例集 | `tests/prompt/**` | `I3` | `AC-F3-2`、`AC-R8-2`、`AC-E2E-5` | 依赖 `I3` |
| `I5` | **生成引擎**：一板一次 Seedance 2.5 调用、前置四项校验、状态机、幂等键、失败重试、整集顺序触发 5 次独立调用 | `server/generate/**` | `I1`、`I3` | `AC-F0-1`–`AC-F0-5`、`AC-F4-1`–`AC-F4-7`、`AC-N-3` | 依赖 `I1`/`I3` |
| `I6` | **衔接管理器**：封闭枚举校验、最多 2 项叠加、挂上一块板、B5 锁定、`stage=POST_COMPOSITE` 与生成请求隔离、衔接总表输出 | `server/transition/**` | `I1` | `AC-F5-1`–`AC-F5-9`、`AC-R2-1`、`AC-R8-4` | 依赖 `I1` |
| `I7` | **应用骨架与三路由**：左侧导航 + 顶部栏 + 主编辑区；`/projects`、`/projects/:id/editor`、`/final`；无第四个一级路由 | `web/app/**`、`web/layout/**` | `PRD-003 §1/§2` | `AC-U-1`、`AC-U-2`、`AC-U-4`、`AC-U-8` | 是 |
| `I8` | **项目列表页**：列表字段、检索与倒序、新建弹层、复用弹层（继承/清空清单固定）、空态与骨架 | `web/pages/projects/**` | `I7`、`I2` | `AC-F7-1`–`AC-F7-8`、`AC-E2E-2` | 依赖 `I7` |
| `I9` | **节拍板编辑器**：五板纵向、板头（节拍名/组号只读 + 时长 ≤30s）、三板级槽位、宫格区（3/2 列、左→右、无重排）、完成度与自动保存、板状态机 | `web/pages/editor/**`、`web/components/board/**` | `I7`、`I1` | `AC-F2-1`–`AC-F2-11`、`AC-R3-1`、`AC-R4-1`、`AC-R7-1`、`AC-U-3`、`AC-U-6` | 依赖 `I7` |
| `I10` | **Prompt 面板 + 板尾**：只读分段着色面板、复制、命中词高亮拦截、衔接选择器（封闭枚举/最多 2 项/B5 只读）、生成按钮禁用原因 | `web/components/prompt/**`、`web/components/transition/**` | `I3`、`I6`、`I9` | `AC-F3-3/6/7`、`AC-F5-2/3/4/6`、`AC-F4-2`、`IX-3` | 依赖 `I9` |
| `I11` | **成片页**：列表态与详情态、分板预览下载、衔接总表、成片登记、缺片提示与交付闸门 | `web/pages/final/**` | `I7`、`I6` | `AC-F6-1`–`AC-F6-5`、`AC-E2E-1` | 依赖 `I7` |
| `I12` | **飞书导出**：项目名 + 总时长 + 5 板规格 + 各板 `prompt_final` + 衔接总表；成功链接与失败可解释 | `server/integrations/feishu/**` | `I1`、`I6` | `AC-F6-6/7`、`AC-N-5` | 依赖 `I1` |
| `I13` | **禁用词与禁止字段扫描**：CI 扫描禁用词与 `shot_list`/`cut_count`/`per_shot_duration`/`intra_transition`，允许清单声明文档白名单 | `tools/lint/**`、CI 配置 | `METH-002 §8`、`PRD-001 §8.4` | `AC-R1-2`、`AC-R6-1`、`AC-D-4`、`AC-N-7` | 是 |
| `I14` | **性能基线**：三页首屏 ≤1s、组装 ≤200ms、自动保存 ≤500ms 的埋点与基线测试 | `tools/perf/**`、`tests/perf/**` | `I7`、`I3` | `AC-N-1`、`AC-N-2`、`AC-N-8` | 依赖 `I7`/`I3` |
| `I15` | **E2E 用例**：单集闭环、同结构换题材、单板返工、违规拦截全链路、黄金样板复现 | `tests/e2e/**` | `I5`、`I9`、`I11` | `AC-E2E-1`–`AC-E2E-5` | 依赖前序 |
| `I16` | **UI 禁止清单核对清单化**：把 `UI-X1`–`UI-X12`、`IA-X1`–`IA-X7` 落成评审 checklist 项 | `docs/process/**`（P1 `T10` 同一路径，需与 P1 协调） | `PRD-005 §11`、`PRD-003 §9` | `AC-U-5`、`AC-U-7` | 是（注意路径协调） |

**并行建议**：`I1`、`I3`、`I7`、`I13` 可立即同时开工（无相互依赖）；`I2`/`I5`/`I6`/`I9`/`I11` 在其依赖就绪后展开；`I4`/`I14`/`I15` 作为质量闸门收口。

**阻塞项**：`I2`、`I6` 的 B3 衔接取值受 `O-P2-1` 影响 —— 按"暂存字面值 + `pending_canon` 标记"实现即可开工，法源裁定后只需改模板常量，不需返工结构。

### 冲突提示（Cross-branch Notes）

- 远端已存在 `cursor/wave1-p1-methodology-canon-94f3`（`docs/methodology/**` + DISPATCH 的 P1 小节）、`cursor/wave1-p1-architecture-35c5`、`cursor/wave1-p3-prd-backlog-162d`、`cursor/wave1-wk3-data-api-arch-bdfb`。
- 本分支基线为 `main`，`docs/DISPATCH.md` 在基线上不存在，故按调度要求**新建并只写 P2 小节**。与 P1 分支合并时，两侧均为"新增同名文件"，请按**小节追加**处理：保留同一份文件头，依次排列 P1、P2 小节，**不覆盖任何他人小节**。
- `cursor/wave1-p3-prd-backlog-162d` 若同样写 `docs/prd/**`，需注意文件名冲突：本槽位占用 `prd.md`、`user-stories.md`、`information-architecture.md`、`acceptance-matrix.md`、`ui-spec.md` 五个文件名。
- `I16` 建议路径 `docs/process/**` 与 P1 回执中的 `T10` 重叠，落地前需确认归属。

---

<!-- 后续槽位请在本行下方追加自己的小节，勿修改上方小节。 -->
