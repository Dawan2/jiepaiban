# Prompt 组装引擎（Prompt Engine）

> 槽位：Wave 1 / Cycle 1 / **P3**
> 状态：**v1.0 规格**，是 `src/prompt/**` 的实现契约
> 相关锁：**L5 衔接隔离**、**L7 所见即所发**、L3 时长、L6 模型锁

## 0. 定位

组装引擎是本产品**杠杆最高的模块**：

- 它是创作与生成之间的唯一通路——所有字段最终都经它变成一段文本；
- 它承载两条最难靠人工纪律保证的红线（L5 组间衔接绝不进 AI、L7 所见即所发）；
- 它是**零 I/O 纯函数**，因此可以被穷举测试、可以被属性测试、可以同构运行在面板渲染与提交路径。

工程判断：**把红线做成组装器的类型与结构，而不是做成"记得别拼进去"的纪律。** 本文的绝大部分设计都服务于这一点。

---

## 1. 组装公式

```
prompt_final =
    ① 固定前缀      [画风风格词] + [主角形象描述] + [画质稳定词] + [画幅指令]
  + ② 节拍语义      [情绪基调] + [镜头节奏] + [剧情核心]
  + ③ 宫格时序      [画面1描述] → [画面2描述] （→ [画面3描述]）      // 左→右，B5 仅两格
  ────────────────────────────────────────────────────────────────
    ④ 参数位（不入文本）  duration_sec / aspect_ratio / seed / reference_image_keys
```

三段的分工：

| 段 | 名称 | 来源 | 稳定性 | 作用 |
| --- | --- | --- | --- | --- |
| ① | **前缀（prefix）** | 项目级 | 跨 5 板完全一致 | 画风与主体稳定的锚——同一集内风格漂移的主因就是前缀不一致 |
| ② | **节拍语义** | 节拍级 | 每板不同 | 告诉模型"这一板演什么、什么情绪、什么节奏" |
| ③ | **宫格时序** | 宫格级 | 每格不同 | 用 Seedance 2.5 原生多镜头能力，在**一次生成**内完成画面切换 |

顺序固定，V1.0 不开放自定义模板。理由：组装顺序是可回归测试的工程资产，开放即失去基线。

### 1.1 关键设计：时长走参数位，不入文本

`duration_sec` 是 ④ 而非 ②。把时长写进文本既不可靠（模型不精确遵守）又污染语义。L3 的 ≤30s 在**就绪校验**与 **`makeDurationSec` 构造**两处强制，组装器只做兜底断言。

### 1.2 关键设计：宫格连接符单点化

```ts
export const MULTI_SHOT_JOINER = ' → ';   // 待 API spike 确认
```

Seedance 2.5 的多镜头语法尚未定稿（见 `system-architecture.md` §8 未决项 2）。全引擎**只有这一处**产生格间连接符，确认后改一行 + 更新快照基线。

---

## 2. 段落规格

### 2.1 ① 固定前缀

```ts
export interface PrefixInput {
  style_keywords: string;     // 例：漫剧厚涂、8K
  protagonist_desc: string;   // 主角形象描述
  quality_tokens: string;     // 例：五官稳定
  aspect_ratio: AspectRatio;  // 转为画幅指令文本
}

export function buildPrefix(input: PrefixInput): readonly PromptSegment[];
```

规则：

1. **不可跳过**：前缀缺失即视为项目未就绪，节拍不可提交。空白的风格词是跨板漂移的直接来源。
2. **五板同文**：同一项目的 5 段 Prompt 前缀**逐字符相同**——这是可测断言（`L5/L7` 测试之外另有 `prefix-consistency` 测试）。
3. **前缀在面板中可见（L7）**：系统性前缀属于"所发"，就必须属于"所见"。禁止任何"用户看不见但发出去了"的注入，哪怕它是系统固定文案。
4. 画幅指令由 `aspect_ratio` 映射为固定文案（`ASPECT_PROMPT_TEXT` 常量表），不是自由文本。

### 2.2 ② 节拍语义

```ts
export function buildBeatSegments(beat: BeatAssembleView): readonly PromptSegment[];
```

| 输入字段 | 进 Prompt | 说明 |
| --- | --- | --- |
| `ai_param.mood` | ● | 经 `MOOD_PROMPT_TEXT` 枚举映射为文案，非自由文本 |
| `ai_param.pace` | ● | 经 `PACE_PROMPT_TEXT` 映射；表达"组内节奏"，**不表达机位/景别**（L4） |
| `synopsis` | ● | 剧情核心，原样引用（仅做空白规范化） |
| `name` | ○ | **排除**（L5） |
| `memo` | ○ | **排除**（L5） |
| `transition` | ○ | **排除**（L5，且类型上不可见，见 §3） |

### 2.3 ③ 宫格时序

```ts
export function buildFrameSegments(frames: FrameList): readonly PromptSegment[];
```

规则：

1. 严格按 `index` 升序（左→右时序锁），**不排序、不去重、不重排**；
2. 每格产生一个 `PromptSegment`（`source: 'frame'`），格间以 `MULTI_SHOT_JOINER` 连接；
3. B5 只有两格 → 只产生两个片段（L2）；
4. 描述为空白时视为未就绪（就绪校验拦在前面），组装器遇空白**抛错**而非静默跳过——静默跳过会让"少一格"的 bug 无声通过。

---

## 3. 红线：结构性排除（L5）

### 3.1 核心手法——排除不是过滤，是"够不着"

多数系统把红线实现成"拼装后再删掉"，这类实现随着字段增加必然失效。本引擎的做法是**收窄输入类型**：

```ts
/**
 * 组装器能看到的节拍视图。
 * 注意此类型 **不包含** name / memo / transition —— 组装器在类型层面就够不着它们。
 */
export interface BeatAssembleView {
  readonly index: BeatIndex;
  readonly synopsis: string;
  readonly frame_list: FrameList;
  readonly ai_param: AiParam;
}

export interface AssembleInput {
  readonly prefix: PrefixInput;
  readonly beat: BeatAssembleView;
}

/** 唯一入口：面板渲染与提交路径共用（L7） */
export function assemble(input: AssembleInput): AssembleResult;
```

从 `Beat` 到 `BeatAssembleView` 的投影函数是**唯一**能接触被排除字段的地方：

```ts
/** 唯一投影点。新增字段若想进 Prompt，必须显式改这里 —— 默认即排除 */
export function toAssembleView(beat: Beat): BeatAssembleView {
  return {
    index: beat.index,
    synopsis: beat.synopsis,
    frame_list: beat.frame_list,
    ai_param: beat.ai_param,
  };
  // name / memo / transition 有意不投影（L5）
}
```

**这个设计的好处是默认安全**：将来给 `Beat` 加任何新字段，它默认不进 Prompt，除非有人明确修改投影函数——而那一行改动在代码评审中无处躲藏。

### 3.2 四层防御

| 层 | 机制 | 拦截时机 |
| --- | --- | --- |
| **L5-a 类型层** | `BeatAssembleView` 不含被排除字段 | 编译期 |
| **L5-b 投影层** | `toAssembleView` 是唯一投影点，默认不投影新字段 | 编译期 + 评审 |
| **L5-c 运行时断言** | 提交前 `assertNoRedline(result, beat)`：`segments` 中不存在来自被排除字段的片段，且文本不含其内容 | 运行期（生产路径也生效） |
| **L5-d 测试层** | 属性测试（随机内容）+ E2E 请求体拦截比对 | CI 闸门 |

```ts
export function assertNoRedline(result: AssembleResult, beat: Beat): void;
```

四层里，**L5-c 是唯一在生产环境也生效的**。红线不能只靠 CI——组装器被改坏时，用户的请求必须在发出前中止，而不是等下次 CI 发现。

### 3.3 同文冲突的处理

若用户把衔接内容一字不差地也写进了画面描述，纯子串检查会误报（内容确实在文本里，但来源合法）。断言实现采用**双判据**：

1. **主判据（来源）**：`result.segments` 中每个片段的 `source` ∈ `{project, beat, frame}`，且其 `text` 可追溯到合法字段——被排除字段永不产生片段；
2. **辅判据（子串）**：文本子串检查在**主判据通过**的前提下降级为**告警**而非错误，并在 UI 提示用户"衔接内容疑似被写入画面描述"（对应 PRD 风险 #5：引导而非强拦截）。

### 3.4 为什么衔接必须被排除（设计意图，非仅合规）

组间衔接（音频预接 / 螺口 / 卡点硬切 / BGM 升调 / 黑屏断钩子）描述的是**两段视频之间**的关系。把它塞进单段生成的 Prompt，模型只能在**段内**尝试表现它——结果是段尾出现莫名其妙的黑场或转场镜头，污染本该干净的素材，反而让人工衔接更难做。

这就是 AI 权限边界：**组内交给 AI，组间交给人。** 红线不是保守，是分工。

---

## 4. 输出与来源标注

```ts
export interface AssembleResult {
  /** Prompt 全文 —— 面板展示与 API 请求体用的是同一个字符串（L7） */
  readonly text: string;
  /** 带来源标注的片段序列，供面板着色与快照回放 */
  readonly segments: readonly PromptSegment[];
  /** 非文本参数 */
  readonly params: GenerationParams;
  /** 组装规则版本，随快照存档 */
  readonly engine_version: string;
  /** 非阻断提示，例：疑似衔接内容混入画面描述 */
  readonly warnings: readonly AssembleWarning[];
}
```

`text` 由 `segments` 拼接**派生**，不独立构造：

```ts
const text = segments.map(s => s.text).join('');
```

这保证了面板着色与最终文本**不可能不一致**——面板渲染 `segments`，请求发送 `text`，二者同源。若允许 `text` 独立拼一遍，L7 立刻退化为"靠自觉"。

### 4.1 来源标签

| `source` | 标签示例 | 面板着色 |
| --- | --- | --- |
| `project` | 项目级·风格词 / 项目级·主角 / 项目级·画幅 | 蓝 |
| `beat` | 节拍·情绪 / 节拍·节奏 / 节拍·剧情核心 | 绿 |
| `frame` | 宫格 1 / 宫格 2 / 宫格 3 | 橙 |

`SegmentSource` 只有这三个值——**没有 `transition` 来源**，面板上也就不可能出现衔接内容。

---

## 5. 性能

| 指标 | 要求 | 保障手段 |
| --- | --- | --- |
| 面板刷新 | ≤500ms（PRD AC-6.5），实测目标 ≤200ms（P1 NFR） | 纯同步函数，无 I/O，14 格量级下为微秒级；React 侧用 `useMemo` 按字段依赖缓存 |
| 组装调用频率 | 每次字段变更 | 输入规模恒定（≤14 格 + 固定字段），无需增量计算 |

性能在本模块不是风险项——**纯函数 + 恒定小规模输入**天然达标。把它列出来是为了明确：**不要为性能引入缓存复杂度**，那只会给 L7 制造"缓存不一致"的新破绽。

---

## 6. 快照（Snapshot）

提交生成时冻结：

```ts
export function freezeSnapshot(result: AssembleResult, ctx: DomainCtx): PromptSnapshot;
```

| 规则 | 说明 |
| --- | --- |
| 内容 | `prompt_final` + `segments` + `params` + `engine_version` + `assembled_at` |
| 不可变 | 写入后无更新路径（类型全 `readonly`，仓储无 update 方法） |
| 用途 | 历史可溯（AC-6.9）、失败复现、规则演进的差异解释 |
| 与请求体的关系 | `GenerationRequest.prompt === snapshot.prompt_final`，E2E 逐字符断言（L7） |

`engine_version` 的价值在规则演进时兑现：当组装顺序或前缀文案变更，历史快照仍能被正确解释——**"这条为什么和现在拼的不一样"有确定答案**。

---

## 7. 测试规格

| 测试 | 类型 | 断言要点 |
| --- | --- | --- |
| `prefix.test.ts` | 单元 | 前缀不可跳过；5 板前缀逐字符相同；画幅映射正确 |
| `order.test.ts` | 快照 | 三段顺序固定；宫格严格按 index 升序 |
| `frames.test.ts` | 单元 | B1–4 产生 3 个 frame 片段、B5 产生 2 个；空描述抛错 |
| `redline.property.test.ts` | 属性（fast-check） | 随机 `name`/`memo`/`transition` 内容（含 unicode、超长、与描述重合）→ 无 `transition` 来源片段；主判据恒成立 |
| `wysiwyg.test.ts` | 单元 | `text === segments.map(s=>s.text).join('')`；`GenerationRequest.prompt === result.text` |
| `snapshot-immutable.test.ts` | 单元 | 冻结后修改 Beat 字段，快照不变 |
| `duration.test.ts` | 单元 | 时长不出现在 `text` 中；>30s 构造抛错 |
| E2E `l7-request-match.spec.ts` | Playwright | 拦截提交请求，请求体 `prompt` 与面板 DOM 文本逐字符相等；请求体无被排除字段内容 |

覆盖率门槛：`src/prompt/**` 行覆盖 **≥95%**，分支 ≥90%。这是全仓最高要求——因为它是杠杆最高、回归代价最大的模块。

---

## 8. 演进约束

1. **组装顺序变更 = 破坏性变更**：必须递增 `engine_version`、更新快照基线、在 `DISPATCH.md` 记录；
2. **新增进 Prompt 的字段**：必须同时改 `BeatAssembleView`、`toAssembleView`、来源标签表与快照测试——四处齐改是刻意的摩擦，用来阻止随手往 Prompt 里加东西；
3. **永不新增**：`transition` / `memo` / `name` 进入 Prompt 的能力（L5，无例外条款）；
4. **自定义模板（若 V1.1 开放）**：模板只能重排**已有片段**、不能引入新来源，红线与来源枚举不变。
