# 术语表（Glossary）

- 文档编号：`METH-002`
- 版本：`v1.0`
- 状态：**CANON / 法条级**
- 归属：Wave 1 / Slot P1 / Cycle W1 architecture
- 上游：[`seedance-beatboard-system.md`](./seedance-beatboard-system.md)

> 本表是项目统一用语标准。**代码标识、API 字段、UI 文案、评审语言必须使用"标准词"，禁止使用"禁用词"。**
> 出现禁用词一律视为方法论违规，需改正后才能合并。

---

## 1. 核心实体（Core Entities）

| 标准词（中） | 标准词（英） | 代码标识建议 | 定义 |
| --- | --- | --- | --- |
| 剧情节拍 | Beat | `beat` | 叙事最小一等单元；一次完整情绪动作。一集恒为 5 个。 |
| 镜头组 | Shot Group / G | `group` / `g_index` | 与一个 beat 恒等的一组连续镜头；组内切分由 AI 决定。 |
| 节拍板 | BeatBoard | `board` | 编辑器中承载一个 beat 的可视化容器；装 2–3 个节拍帧。 |
| 节拍帧 | Beat Frame | `frame` | 节拍板内的一个宫格，描述该段内的一个关键画面信息点。 |
| 单次生成单元 | Single Generate Unit | `generate_unit` | 向 Seedance 2.5 发起的一次生成调用；与一块板 1:1。 |
| 集 | Episode | `episode` / `project` | 由 5 块节拍板构成的成片单位，总长 70–90s。 |

**恒等式**：`1 Beat = 1 G = 1 BeatBoard = 1 Seedance 2.5 generate`。四者在任何语境下可互指，但**代码中不得混用字段名**。

---

## 2. 五节拍（The Five Beats）

| 序号 | 标准词（中） | 标准词（英） | 枚举建议 | 时间位 | 宫格数 |
| --- | --- | --- | --- | --- | --- |
| 1 | 开篇钩子 | Opening Hook | `BEAT_HOOK` | 0–8s | 3 |
| 2 | 矛盾建立 | Conflict Setup | `BEAT_CONFLICT` | 8–25s | 3 |
| 3 | 打压升级 | Escalation | `BEAT_ESCALATION` | 25–45s | 3 |
| 4 | 反转蓄力 | Reversal Charge-up | `BEAT_CHARGEUP` | 45–70s | 3 |
| 5 | 断集留客 | Cliffhanger Cut | `BEAT_CLIFFHANGER` | 70–88s | 2 |

顺序、数量、语义均为**硬锁**，不可增删改序。

---

## 3. 节拍帧语义（Frame Semantics）

以 Beat 1 为样板定义的三类帧语义：

| 标准词（中） | 标准词（英） | 含义 |
| --- | --- | --- |
| 冲击帧 | Impact | 制造视觉/事件冲击的画面 |
| 反应帧 | Reaction | 人物对冲击的即时反应 |
| 环境帧 | Environment / Env | 交代场景与关系的环境信息 |

**帧序规则（Frame Order）**：帧一律按**左→右**顺序读取与提交（`frames L→R order only`）。
不提供拖拽重排、不提供倒序、不提供"主帧"概念。

---

## 4. Prompt 相关（Prompt Terms）

| 标准词（中） | 标准词（英） | 定义 |
| --- | --- | --- |
| 固定前缀 | Fixed Prefix | 系统注入的只读画风与一致性约束：`漫剧厚涂画风，高清8K... 人物五官稳定无漂移...` |
| 本段情绪 | Beat Emotion | 该 beat 的宏观情绪定调（人填） |
| 时长 | Duration | 该板时长，**≤ 30s** |
| 镜头节奏 | Camera Rhythm | 节奏形容，不含具体刀数与逐镜时长 |
| 剧情核心 | Plot Core | 一句话剧情推进 |
| Prompt 组装器 | Prompt Assembler | 按固定顺序拼装上述槽位的模块 |

**组装公式**：`固定前缀 + 本段情绪 + 时长 + 镜头节奏 + 剧情核心`。

**禁令**：转场（transition）**永不进入 prompt**。

---

## 5. 组间衔接（Inter-group Transition）

| 标准词（中） | 枚举建议 | 说明 |
| --- | --- | --- |
| 音频预接 | `AUDIO_PRELAP` | 下一段音频提前进入 |
| 螺口顺滑 | `SCREW_SMOOTH` | 画面元素咬合式顺滑过渡 |
| 卡点硬切 | `BEAT_SYNC_CUT` | 踩音乐点硬切 |
| BGM 升调截断 | `BGM_PITCH_CUT` | 升调推情绪并截断 |
| 黑屏断钩子 | `BLACK_CUT_HOOK` | 黑屏截断留悬念 |

- 枚举**封闭**，新增需修改方法论法源。
- 衔接值挂在**上一块板**，语义为"本板结束时如何进入下一板"。
- 只在**后期合成**阶段生效。

---

## 6. 工作流阶段（Workflow Stages）

| 标准词（中） | 标准词（英） | 阶段编号 |
| --- | --- | --- |
| 定节拍 | Set Beats | S1 |
| 定镜头组 | Set Shot Groups | S2 |
| 填节拍帧 | Fill Beat Frames | S3 |
| AI 生成 | AI Generate | S4 |
| 后期合成 | Post Composite | S5 |

---

## 7. 人机分工（Division of Labor）

| 标准词（中） | 标准词（英） | 含义 |
| --- | --- | --- |
| 组内 | Intra-group | 归 **AI**：运镜、剪辑点、时长微观分配 |
| 组间 | Inter-group | 归 **人**：衔接方式、宏观情绪与节奏 |

口诀：**AI 管组内，人管组间（AI intra / human inter）。**

---

## 8. 禁用词（Forbidden Terms）

以下词汇在本项目中**不存在对应概念**，禁止出现在任何产物中：

| 禁用词 | 英文 | 为何禁用 | 正确替代 |
| --- | --- | --- | --- |
| 分镜 | shot breakdown | 与节拍板互斥 | 节拍板 BeatBoard |
| 故事板 | storyboard | 与节拍板互斥 | 节拍板 BeatBoard |
| 单镜时长 | per-shot duration | 时长微观分配归 AI | 板时长（≤30s） |
| 单镜头 S / S1、S2… | single-shot S | 组内拆解归 AI | 镜头组 G |
| 逐镜转场 | per-shot transition | 转场只在组间且人工 | 组间衔接 |
| 镜头表 / 分镜表 | shot list | 属废弃项 | 节拍板列表 `beat_list[5]` |

**判定规则**：任何粒度小于 `beat` 的叙事字段或控件，均属禁用项。

---

## 9. 约束与锁（Constraints & Locks）

| 标准词 | 英文 | 值 |
| --- | --- | --- |
| 五节拍锁 | 5-Beat Lock | beat 数恒为 5，顺序与语义不可变 |
| 宫格锁 | Grid Lock | B1–B4 = 3 宫格，B5 = 2 宫格；顺序锁定 |
| 时长上限 | 30s Cap | 单板 ≤ 30s |
| 整集时长 | Episode Duration | 70–90s（基准轴 88s） |
| 帧序锁 | Frame Order Lock | 仅左→右 |
| 无故事板 | No Storyboard | 概念级禁止 |

---

## 10. 数据字段（Data Fields，项目级）

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `project_id` | id | 主键 |
| `name` | string | 项目名 |
| `total_duration` | number(seconds) | 70–90 |
| `beat_list` | array | **长度恒为 5** |

`beat` 内部字段以 **PRD §8** 为唯一来源；本表只锁定项目级字段与命名，避免双源冲突。

---

## 11. UI 术语（UI Terms）

| 标准词 | 说明 |
| --- | --- |
| 左侧导航 | 一级页面入口 |
| 顶部栏 | 项目上下文与全局动作 |
| 主编辑区 | 节拍板编辑区域 |
| 项目列表 | 页面 1 |
| 核心编辑器 | 页面 2 |
| 成片管理 | 页面 3 |

页面**只有三个**，不得新增未经方法论批准的页面概念。
