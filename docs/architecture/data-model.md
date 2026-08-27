# 数据模型（Data Model）— TypeScript 实体定义

> 槽位：Wave 1 / Cycle 1 / **P3**
> 状态：**v1.0 基线**，是 `src/domain/types.ts` 的**规格来源**（实现须与本文逐字段一致）
> 上游锁：见 [`system-architecture.md` §1](./system-architecture.md#1-系统锁locks架构层面的不可协商约束)

本文档给出的不是数据库表，而是 **TypeScript 类型**。原因：本迭代为本地优先形态（见 `tech-stack.md`），类型系统就是 schema，**能被类型钉死的约束，绝不留给运行时校验**。

---

## 0. 建模总原则

1. **让非法状态不可表示**。`beat_list` 用 5 元组而非数组，`frame_list` 用 3 元组 \| 2 元组的联合而非 `Frame[]`——写不出 6 个节拍，因为类型不允许。
2. **形状用类型，内容用断言**。长度/位置/枚举归类型；"衔接不进 Prompt""时长 ≤30s"归 `assertLocks` 与组装器。
3. **快照不可变**。`PromptSnapshot` 与 `Segment` 一经写入永不修改（`readonly` + 无更新函数）。
4. **无分镜类型（L4）**。本文档定义的实体中**不存在** `Shot` / `Storyboard` / `Camera` / `ShotSize` / `CameraMove` 等类型与字段，禁用词表见 §8。
5. **ID 前缀化**：`prj_` / `bt_` / `fr_` / `job_` / `snap_` / `seg_` / `tr_`，便于日志辨识与错误定位。

---

## 1. 实体关系总览

```text
Project
 ├── beat_list         : [Beat, Beat, Beat, Beat, Beat]      // L1 恒 5，元组固定
 │     ├── frame_list  : [Frame×3] | [Frame×2]               // L2  B1–B4=3, B5=2（共 14）
 │     ├── ai_param    : AiParam                             // 情绪 / 时长(≤30s) / 镜头节奏
 │     ├── transition  : TransitionRule | null               // 指向"本板 → 下一板"的接缝；B5 为 null
 │     ├── jobs        : GenerationJob[]                     // 该板的生成任务历史
 │     └── current_segment_id : SegmentId | null             // 当前采用的成片段
 ├── style_prefix      : StylePrefix                         // 项目级固定前缀来源
 └── settings          : ProjectSettings

GenerationJob ──1:1──► PromptSnapshot   （提交时刻冻结，不可变）
GenerationJob ──1:0..1► Segment          （成功产出，含 video_url）
```

**接缝数 = 4**（B1|B2、B2|B3、B3|B4、B4|B5）。建模为 `Beat.transition`（"我与下一板的衔接"）而非独立数组，好处是删无可删、错位不可能——第 5 板的 `transition` 类型即为 `null`。

---

## 2. 基础类型与品牌 ID

```ts
// ─────────────────────────────────────────────────────────────
// src/domain/types.ts  —— 唯一事实源
// ─────────────────────────────────────────────────────────────

/** 品牌类型：防止 ProjectId 被误传给 BeatId 形参 */
type Brand<T, B extends string> = T & { readonly __brand: B };

export type ProjectId  = Brand<string, 'ProjectId'>;   // prj_...
export type BeatId     = Brand<string, 'BeatId'>;      // bt_...
export type FrameId    = Brand<string, 'FrameId'>;     // fr_...
export type JobId      = Brand<string, 'JobId'>;       // job_...
export type SnapshotId = Brand<string, 'SnapshotId'>;  // snap_...
export type SegmentId  = Brand<string, 'SegmentId'>;   // seg_...

/** ISO-8601 UTC 字符串。存字符串而非 Date：IndexedDB 往返稳定、快照可比对 */
export type IsoTimestamp = Brand<string, 'IsoTimestamp'>;

/** 秒。构造须经 makeDurationSec，保证 1..30（L3） */
export type DurationSec = Brand<number, 'DurationSec'>;
```

---

## 3. 锁常量（`src/domain/locks.ts`）

```ts
/** L1 结构锁 */
export const BEAT_COUNT = 5 as const;

/** L2 宫格锁：位置 → 格数。B1–B4 三格，B5 两格，全集 14 格 */
export const FRAME_COUNT_BY_INDEX = {
  1: 3, 2: 3, 3: 3, 4: 3, 5: 2,
} as const satisfies Record<BeatIndex, FrameCount>;

export const TOTAL_FRAME_COUNT = 14 as const;

/** L3 时长锁：单节拍上限（Seedance 2.5 单次长段落上限） */
export const MAX_BEAT_DURATION_SEC = 30 as const;

/** 软目标：全集时长建议区间（非锁，仅提示） */
export const EPISODE_DURATION_HINT_SEC = { min: 70, max: 90 } as const;

/** L5 衔接隔离锁：绝不进入 Prompt 与请求体的字段路径 */
export const PROMPT_EXCLUDED_FIELDS = [
  'beat.name',
  'beat.memo',
  'beat.transition',          // 含 method 与 note 全部子字段
] as const;

/** 接缝数 = 节拍数 - 1 */
export const TRANSITION_COUNT = BEAT_COUNT - 1; // 4
```

`satisfies Record<BeatIndex, FrameCount>` 的作用：**新增/漏写任一板位都会编译失败**。锁表本身受类型保护。

---

## 4. 核心实体

### 4.1 Project

```ts
export interface Project {
  readonly id: ProjectId;
  name: string;
  /** 题材，自由文本（V1.1 升级为模板选择） */
  genre: string;
  /** 画幅。竖屏短剧默认 9:16 */
  aspect_ratio: AspectRatio;
  /** 项目级固定前缀的构成要素，注入每一板的 Prompt（不可跳过） */
  style_prefix: StylePrefix;
  /** L1：恒 5 个节拍，元组类型，不可增删改序 */
  beat_list: BeatTuple;
  settings: ProjectSettings;
  readonly created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export type AspectRatio = '9:16' | '16:9' | '1:1';

export interface StylePrefix {
  /** 全局画风风格词，例：漫剧厚涂、8K */
  style_keywords: string;
  /** 主角形象描述（跨板主体稳定的关键） */
  protagonist_desc: string;
  /** 可选的画质/稳定性附加词，例：五官稳定 */
  quality_tokens: string;
}

export interface ProjectSettings {
  /** 单集目标时长（秒），用于按 /5 预填各板时长 */
  target_duration_sec: number;
  /** 生成并发上限，默认 2 */
  max_concurrency: number;
  /** 失败自动重试次数，默认 3 */
  max_retries: number;
}
```

### 4.2 Beat 与 `beat_list[5]`（L1）

```ts
export type BeatIndex = 1 | 2 | 3 | 4 | 5;

/** L1 的类型级固化：长度恒为 5 的元组 */
export type BeatTuple = readonly [Beat, Beat, Beat, Beat, Beat];

export interface Beat {
  readonly id: BeatId;
  /** 板位，1..5，与 beat_list 下标 +1 恒等；创建后不可变 */
  readonly index: BeatIndex;
  /** 叙事职能，由板位决定，创建后不可变 */
  readonly role: BeatRole;
  /** 节拍名称，可改。○ 不进 Prompt（L5） */
  name: string;
  /** 剧情核心 / 剧情概要，1–3 句。● 进 Prompt */
  synopsis: string;
  /** L2：3 格或 2 格，由 index 决定 */
  frame_list: FrameList;
  /** ● 进 Prompt（情绪、镜头节奏）+ 时长参数位 */
  ai_param: AiParam;
  /** ○ 绝不进 Prompt（L5）。第 5 板恒为 null（无下一板） */
  transition: TransitionRule | null;
  /** ○ 不进 Prompt（L5） */
  memo: string;
  /** 派生态，由 readiness() 与任务状态计算，持久化仅作缓存 */
  status: BeatStatus;
  /** 当前采用的成片段；重生成可切换，历史保留 */
  current_segment_id: SegmentId | null;
}

/** 板位 → 叙事职能，一一绑定，不可重排 */
export type BeatRole =
  | 'hook'        // B1 开篇钩子
  | 'conflict'    // B2 矛盾建立
  | 'escalation'  // B3 打压升级
  | 'twist'       // B4 反转蓄力
  | 'cliffhanger' // B5 断集留客
  ;

export const BEAT_ROLE_BY_INDEX = {
  1: 'hook', 2: 'conflict', 3: 'escalation', 4: 'twist', 5: 'cliffhanger',
} as const satisfies Record<BeatIndex, BeatRole>;

export type BeatStatus =
  | 'empty'      // 未填
  | 'filled'     // 已填（就绪，可提交）
  | 'generating' // 生成中（此时该板宫格与参数只读）
  | 'generated'  // 已生成
  | 'failed';    // 失败
```

> **为什么 `index` 与 `role` 是 `readonly`**：改序的唯一物理途径就是改 `index`。把它标为 `readonly` 后，"改序"在类型层面无法书写（L1）。

### 4.3 Frame 与 `frame_list`（L2）

```ts
export type FrameCount = 3 | 2;
export type FrameIndex = 1 | 2 | 3;

/** L2 的类型级固化：只有 3 元组或 2 元组两种形态 */
export type FrameList =
  | readonly [Frame, Frame, Frame]
  | readonly [Frame, Frame];

export interface Frame {
  readonly id: FrameId;
  /** 格序，1..3，左→右时序锁；创建后不可变 */
  readonly index: FrameIndex;
  /** 白话画面描述："这一格里发生什么、看到什么"。● 进 Prompt */
  description: string;
  /** 可选参考图（本地形态存 Blob 引用键；上云后为 URL） */
  reference_image_key: string | null;
}
```

**`Frame` 只有"描述 + 可选参考图"两个内容字段。** 这是 L4 在数据层的体现：没有景别、没有机位、没有运镜、没有时长切分。宫格是分镜的**替代物**，不是分镜的**简化版**——一旦加回任何专业镜头字段，产品就退化为分镜工具。

宫格数与板位的关系由类型守卫保证：

```ts
export function frameCountOf(beat: Beat): FrameCount {
  return beat.frame_list.length as FrameCount;
}

/** L2 位置不变量：B1–B4 必须 3 格，B5 必须 2 格 */
export function assertFrameShape(beat: Beat): void {
  const expected = FRAME_COUNT_BY_INDEX[beat.index];
  if (frameCountOf(beat) !== expected) {
    throw new LockViolation('L2', `beat ${beat.index} expects ${expected} frames, got ${frameCountOf(beat)}`);
  }
  beat.frame_list.forEach((f, i) => {
    if (f.index !== i + 1) throw new LockViolation('L2', `frame order broken at beat ${beat.index}`);
  });
}
```

> 若上游确认"宫格可节拍级切换 3↔2"（见 `system-architecture.md` §8 未决项 1），只需把 `FRAME_COUNT_BY_INDEX` 从**不变量**降级为**默认值**并放松 `assertFrameShape`——`FrameList` 类型本身不动，因为它本就是 `3 | 2` 的联合。届时第 3 格内容按 PRD §5.2.3 保留为草稿（存 `Beat.frame_draft: Frame | null`），**草稿不参与组装**。

### 4.4 AiParam

```ts
export interface AiParam {
  /** 情绪基调，单选。● 进 Prompt */
  mood: Mood;
  /** 本板时长，1..30 秒（L3）。作为 API 参数位，不拼入文本 */
  duration_sec: DurationSec;
  /** 镜头节奏档位 —— 组内节奏由 AI 执行，这里只给档位，不给分镜。● 进 Prompt */
  pace: Pace;
}

export type Mood = 'tense' | 'warm' | 'suspense' | 'comedic' | 'angry' | 'sad' | 'hype';

/** 注意：这是"节奏档位"，不是运镜参数。不得扩展为机位/景别枚举（L4） */
export type Pace = 'slow' | 'medium' | 'fast';

export function makeDurationSec(n: number): DurationSec {
  if (!Number.isInteger(n) || n < 1 || n > MAX_BEAT_DURATION_SEC) {
    throw new LockViolation('L3', `duration must be an integer in 1..${MAX_BEAT_DURATION_SEC}, got ${n}`);
  }
  return n as DurationSec;
}
```

### 4.5 TransitionRule（组间衔接，L5）

```ts
/**
 * 组间衔接 = 人工职责，AI 权限边界之外。
 * 本类型的任何内容都不得出现在 Prompt 与生成请求体中（L5）。
 */
export interface TransitionRule {
  /** 接缝标识："1-2" | "2-3" | "3-4" | "4-5" */
  readonly seam: TransitionSeam;
  /** 衔接手法，5 选 1 */
  method: TransitionMethod;
  /** 人读的操作要点，例："黑场后女主已在医院" */
  note: string;
}

export type TransitionSeam = '1-2' | '2-3' | '3-4' | '4-5';

export type TransitionMethod =
  | 'audio_pre_lap'   // 音频预接
  | 'match_cut'       // 螺口（同构承接）
  | 'beat_hard_cut'   // 卡点硬切
  | 'bgm_lift'        // BGM 升调
  | 'black_hook';     // 黑屏断钩子
```

`TransitionRule` 在类型层与 Prompt 相关类型**零交集**：组装器的输入类型 `AssembleInput` 根本不包含它（见 `prompt-engine.md` §3）。**排除不是过滤出来的，是类型上够不着。**

### 4.6 PromptSnapshot（不可变）

```ts
export interface PromptSnapshot {
  readonly id: SnapshotId;
  readonly job_id: JobId;
  readonly beat_id: BeatId;
  /** 提交时刻的 Prompt 全文 —— 与面板展示逐字符一致（L7） */
  readonly prompt_final: string;
  /** 带来源标注的片段序列，供快照只读视图还原着色 */
  readonly segments: readonly PromptSegment[];
  /** 非文本参数（时长、画幅、seed 等） */
  readonly params: Readonly<GenerationParams>;
  /** 组装规则版本号，规则演进后可解释历史差异 */
  readonly engine_version: string;
  readonly assembled_at: IsoTimestamp;
}

export interface PromptSegment {
  readonly source: SegmentSource;
  readonly label: string;   // 面板展示用，例："项目级·风格词"
  readonly text: string;
}

export type SegmentSource = 'project' | 'beat' | 'frame';
```

`PromptSegment.source` 只有三种来源——**没有 `transition` 这个来源**（L5 的又一层类型级保障）。

### 4.7 GenerationJob 与 Segment

```ts
export interface GenerationJob {
  readonly id: JobId;
  readonly beat_id: BeatId;
  readonly project_id: ProjectId;
  readonly snapshot_id: SnapshotId;
  state: JobState;
  attempt: number;
  readonly max_attempts: number;
  error: JobError | null;
  /** Provider 侧任务 ID，用于轮询与去重 */
  provider_task_id: string | null;
  cost_estimate: number | null;
  readonly created_at: IsoTimestamp;
  finished_at: IsoTimestamp | null;
  /** 成功后回填 */
  segment_id: SegmentId | null;
}

export type JobState =
  | 'queued' | 'submitted' | 'running'
  | 'retrying' | 'succeeded' | 'failed' | 'canceled';

export interface JobError {
  category: ErrorCategory;
  /** 面向用户的建议动作文案键 */
  advice_key: string;
  message: string;
  retryable: boolean;
}

export type ErrorCategory =
  | 'auth'             // 鉴权
  | 'rate_limit'       // 限流
  | 'content_rejected' // 内容拒绝
  | 'bad_param'        // 参数错误
  | 'server';          // 服务异常

/** 成功产出的视频段，不可变 */
export interface Segment {
  readonly id: SegmentId;
  readonly job_id: JobId;
  readonly beat_id: BeatId;
  readonly video_url: string;
  readonly thumb_url: string | null;
  readonly duration_sec: DurationSec;
  readonly created_at: IsoTimestamp;
}
```

Segment 不可变 + `Beat.current_segment_id` 可切换 = **重生成不销毁历史，回滚只是改指针**（PRD §5.4.6）。

### 4.8 生成参数（发往 Provider 的非文本部分）

```ts
export interface GenerationParams {
  readonly duration_sec: DurationSec;
  readonly aspect_ratio: AspectRatio;
  readonly seed: number | null;
  /** 参考图键列表，按格序；无图则为空数组 */
  readonly reference_image_keys: readonly string[];
}

/** 发往 Provider 的完整请求体：文本 + 参数，**别无其他** */
export interface GenerationRequest {
  readonly prompt: string;              // === snapshot.prompt_final（L7）
  readonly params: GenerationParams;
}
```

`GenerationRequest` 是**封闭类型**：它只有两个字段。任何"顺便把衔接也传过去"的意图，都无处安放（L5）。

---

## 5. 工厂：一次性铸造固定结构

```ts
export interface CreateProjectInput {
  name: string;
  genre: string;
  aspect_ratio: AspectRatio;
  target_duration_sec: number;
  style_keywords: string;
  protagonist_desc: string;
  quality_tokens?: string;
}

/**
 * 创建项目 = 铸造 1 个 Project + 5 个 Beat + 14 个 Frame + 4 条 TransitionRule。
 * 系统中不存在其他创建 Beat / Frame 的入口（L1、L2）。
 */
export function createProject(input: CreateProjectInput, ctx: DomainCtx): Project;
```

铸造规则：

| 项 | 规则 |
| --- | --- |
| 节拍数 | 恒 5（L1） |
| 节拍职能与默认名 | 由 `BEAT_ROLE_BY_INDEX` 决定，名称可改、职能不可改 |
| 宫格数 | 由 `FRAME_COUNT_BY_INDEX` 决定：3/3/3/3/2（L2） |
| 时长预填 | `min(round(target_duration_sec / 5), 30)`（L3 兜底） |
| 衔接 | B1–B4 各建 1 条，`method` 默认 `black_hook`，`note` 空；B5 恒 `null` |
| 状态 | 全部 `empty` |

**没有 `createBeat` / `deleteBeat` / `addFrame` / `removeFrame` / `reorderBeats` 导出。** 这些函数不是被禁用，是不存在——`ready-queue.md` 的评审项包含"确认这些标识符在全仓 0 命中"。

---

## 6. 不变量与就绪校验

```ts
/** 全量锁断言：写库前、读库后各调用一次 */
export function assertLocks(project: Project): void;
```

| 断言 | 锁 | 内容 |
| --- | --- | --- |
| `beat_list.length === 5` | L1 | 元组类型已保证，运行时兜底反序列化数据 |
| `beat_list[i].index === i + 1` | L1 | 板位与下标恒等 |
| `role === BEAT_ROLE_BY_INDEX[index]` | L1 | 职能绑定 |
| `assertFrameShape(beat)` | L2 | 格数 3/3/3/3/2、格序左→右 |
| Σ frames === 14 | L2 | 全集格数 |
| `1 ≤ duration_sec ≤ 30` | L3 | 单板时长 |
| `beat_list[4].transition === null` 且 B1–4 非 null，`seam` 与板位匹配 | — | 接缝完整性 |

就绪校验（决定"生成"按钮是否可点）：

```ts
export interface ReadinessResult {
  ready: boolean;
  /** 未就绪时列出缺失项，UI 直接展示 */
  missing: readonly MissingField[];
}
export type MissingField =
  | { kind: 'synopsis' }
  | { kind: 'frame'; index: FrameIndex }
  | { kind: 'mood' }
  | { kind: 'duration' };

export function readiness(beat: Beat): ReadinessResult;
```

**`transition` 与 `memo` 从不进入就绪校验**——它们对生成无影响，缺失不应阻断提交（PRD：衔接"建议填写"但非必填）。

---

## 7. 持久化封套与迁移

```ts
export const SCHEMA_VERSION = 1;

export interface PersistedEnvelope {
  readonly schema_version: number;
  readonly saved_at: IsoTimestamp;
  readonly projects: readonly Project[];
  readonly jobs: readonly GenerationJob[];
  readonly snapshots: readonly PromptSnapshot[];
  readonly segments: readonly Segment[];
}

export type Migration = (data: unknown) => unknown;
/** 索引 i 的迁移把 v(i) 升到 v(i+1)；缺口即 CI 失败 */
export const MIGRATIONS: readonly Migration[] = [];
```

规则：

1. 任何实体结构变更**必须**同时提交迁移函数 + 迁移单测（含一份旧版本样例数据）；
2. 读取后立即 `assertLocks`，**脏数据不进内存**；断言失败进入"数据修复"提示流而非静默丢弃；
3. 导入/导出使用同一封套格式，导入时走完整迁移链——这让"导出的 JSON"天然成为跨版本备份格式。

---

## 8. 禁用词表（L4，CI 强制）

`scripts/check-forbidden-terms.mjs` 扫描 `src/**` 与 `e2e/**`，命中任一即 CI 失败：

| 类别 | 禁用标识符 / 文案 |
| --- | --- |
| 实体 | `Shot`, `shot_list`, `Storyboard`, `storyboard`, `SubShot`, `Cut`（作为实体名） |
| 镜头字段 | `shot_size`, `shot_type`, `camera_angle`, `camera_move`, `camera_json`, `lens`, `focal_length` |
| 中文文案 | `分镜`, `故事板`, `景别`, `机位`, `运镜`（UI 文案、路由、注释一律禁止） |
| 结构操作 | `addBeat`, `deleteBeat`, `removeBeat`, `reorderBeats`, `addFrame`, `removeFrame` |

白名单：`docs/**`（架构文档需要论述"为什么不做分镜"）与 `scripts/check-forbidden-terms.mjs` 自身。

> 词表放在**数据模型文档**而非风格指南里，是刻意的：L4 的本质是数据建模决策，不是命名偏好。

---

## 9. 与 WK3 草案（`origin/cursor/wave1-wk3-data-api-arch-bdfb`）的关系

该分支的 `data-model.md` 成稿于源稿注入之前，其 `beats.order_key`（拖拽排序）、`camera_json`（运镜参数）、`takes`（一板多镜次）分别违反 L1、L4，与本文冲突。**合流时以本文为准**；其中仍可复用的部分：错误码体系、幂等 hash 思路、参数快照理念（本文的 `PromptSnapshot` 已吸收）。该差异已登记于 `system-architecture.md` §8 与 `docs/DISPATCH.md` 的 P3 段。
