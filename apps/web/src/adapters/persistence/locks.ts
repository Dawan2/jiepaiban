/**
 * 落库前 / 读回后的结构锁断言（架构文档 tech-stack §2.2 读路径：迁移链 → `assertLocks` → 入 store）。
 *
 * 断言失败**不静默**：抛 {@link ProjectLockError}，由上层提示数据修复，绝不把违规结构写进库或喂给 UI。
 *
 * 锁不在这一层复述，而是**读回时由领域层重新铸造**：{@link normalizeProject} 经
 * `createBeat()` 取回锁死的板，再写入可编辑字段，最后过 `hydrateProject()` 的
 * `assertBeatListLocked`。库里的数据即便被手改过，宫格数、帧序、时间位、板序也一定回到 canon。
 *
 * 覆盖的产品红线：
 * - `RULE-2` / AC-6.1 五节拍锁：`beat_list` 长度恒为 5，序号恒为 1–5，不可增删改序。
 * - `RULE-3` / `FR-1-03` 宫格锁：B1–B4 = 3 宫格、B5 = 2 宫格，由板序推导。
 * - `RULE-4` 时长上限：单板 ≤ 30s。
 * - `RULE-7` / R4 帧序锁：帧位恒为左 → 右，无排序权重字段。
 * - `RULE-9` / AC-6.4 转场隔离：衔接手法与备注不得出现在 Prompt 快照里。
 * - `RULE-11` / AC-6.8 无镜头级拆解：节拍上不得出现任何镜头级字段。
 */

import {
  BEAT_COUNT,
  BEAT_INDEXES,
  createBeat,
  frameCountFor,
  isDurationWithinCap,
  MAX_BEAT_DURATION_SEC,
} from '../../domain/beats';
import { hydrateProject } from '../../domain/projects';
import { isTransitionRule } from '../../domain/transitions';
import type { StoredBeat, StoredProject } from './schema';

export class ProjectLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectLockError';
  }
}

/**
 * 镜头级字段黑名单（`RULE-11`、AC-6.8，PRD §8.4「禁止字段」）。
 * 出现即违规：这些概念在本产品被概念级禁止，不是「暂不支持」。
 */
export const FORBIDDEN_BEAT_FIELDS = [
  'shot',
  'shots',
  'shotList',
  'shot_list',
  'storyboard',
  'cutCount',
  'cut_count',
  'perShotDuration',
  'per_shot_duration',
  'intraTransition',
  'intra_transition',
  'camera',
  'cameraMove',
  'camera_json',
  'lens',
  'angle',
  'framing',
  'shotSize',
  'shot_size',
  'sortWeight',
  'order_weight',
] as const;

function fail(message: string): never {
  throw new ProjectLockError(message);
}

function assertNoForbiddenFields(beat: StoredBeat, projectId: string): void {
  const present = FORBIDDEN_BEAT_FIELDS.filter((field) => field in beat);
  if (present.length > 0) {
    fail(
      `项目 ${projectId} 节拍${beat.index}：出现被概念级禁止的镜头级字段 ${present.join('、')}（RULE-11、AC-6.8）`,
    );
  }
}

function assertBeatLocks(beat: StoredBeat, project: Pick<StoredProject, 'id'>): void {
  const at = `项目 ${project.id} 节拍${beat.index}`;

  const expected = frameCountFor(beat.index);
  if (beat.frame_count !== expected) {
    fail(`${at}：宫格锁被破坏，B${beat.index} 应为 ${expected} 宫格，实为 ${beat.frame_count}（RULE-3）`);
  }
  if (beat.frames.length !== expected) {
    fail(`${at}：节拍帧数恒为 ${expected}，实为 ${beat.frames.length}（RULE-3，不可增删宫格）`);
  }
  beat.frames.forEach((frame, i) => {
    if (frame.order !== i + 1) {
      fail(`${at}：帧序锁被破坏，第 ${i + 1} 格的 order 为 ${frame.order}（RULE-7，只按左 → 右读取）`);
    }
  });

  if (!isDurationWithinCap(beat.duration_sec)) {
    fail(`${at}：板时长 ${beat.duration_sec}s 超出上限 ${MAX_BEAT_DURATION_SEC}s（RULE-4）`);
  }

  if (!isTransitionRule(beat.transition_rule)) {
    fail(`${at}：组间衔接「${String(beat.transition_rule)}」不在封闭目录内（RULE-9）`);
  }

  assertNoForbiddenFields(beat, project.id);

  // 衔接与备注同属 Prompt 硬排除清单，落库时一并把关（AC-6.4）。
  if (beat.prompt_final === null) {
    return;
  }
  if (beat.prompt_final.includes(beat.transition_rule)) {
    fail(`${at}：衔接手法泄漏进 Prompt 快照（RULE-9、AC-6.4，转场永不进入 prompt）`);
  }
  const note = beat.note.trim();
  if (note !== '' && beat.prompt_final.includes(note)) {
    fail(`${at}：备注泄漏进 Prompt 快照（AC-6.4，备注永不进入 prompt）`);
  }
}

/** 校验一个项目是否满足全部结构锁；失败即抛，不返回布尔值以免调用方忽略。 */
export function assertProjectLocks(project: StoredProject): void {
  if (project.beat_list.length !== BEAT_COUNT) {
    fail(
      `项目 ${project.id}：五节拍锁被破坏，beat_list 长度恒为 ${BEAT_COUNT}，实为 ${project.beat_list.length}（RULE-2、AC-6.1）`,
    );
  }

  const indexes = project.beat_list.map((beat) => beat.index);
  if (indexes.join(',') !== BEAT_INDEXES.join(',')) {
    fail(`项目 ${project.id}：节拍序号恒为 1–5 且不可改序，实为 ${indexes.join(',')}（RULE-2）`);
  }

  project.beat_list.forEach((beat) => assertBeatLocks(beat, project));
}

/**
 * 由一条落库板重铸出带锁的板。
 *
 * 结构字段（板序、语义、时间位、宫格数、帧序）不从入参抄，而是由 `createBeat()`
 * 按板序重新铸出；只有可编辑字段与生成期字段从入参搬过来。
 * 复用项目（`store/projectFactory.ts`）也走这里，避免复制出共享引用的板。
 */
export function rebuildBeat(raw: StoredBeat): StoredBeat {
  const beat = createBeat(raw.index) as StoredBeat;
  beat.title = raw.title;
  beat.emotion = raw.emotion;
  beat.camera_rhythm = raw.camera_rhythm;
  beat.plot_core = raw.plot_core;
  beat.duration_sec = raw.duration_sec;
  beat.transition_rule = raw.transition_rule;
  beat.note = raw.note;
  beat.status = raw.status;
  beat.video_url = raw.video_url ?? null;
  beat.prompt_final = raw.prompt_final ?? null;

  const texts = raw.frames ?? [];
  beat.frames.forEach((frame) => {
    frame.text = texts.find((item) => item.order === frame.order)?.text ?? '';
  });

  return beat;
}

function normalizeBeat(raw: StoredBeat, projectId: string): StoredBeat {
  if (!BEAT_INDEXES.includes(raw.index)) {
    fail(`项目 ${projectId}：节拍序号 ${String(raw.index)} 越界，恒为 1–5（RULE-2）`);
  }
  return rebuildBeat(raw);
}

/**
 * 把可推导字段归一到锁定值后再断言。
 *
 * 归一只处理**派生值**（宫格数、帧序、时间位、板语义）——这些字段本就「由板序推导、
 * 用户不可改」（`FR-1-03`），读到旧数据里的偏差属于历史遗留而非用户意图。
 * 结构性违规（板数、序号、禁用字段、超上限时长）不归一，直接抛。
 */
export function normalizeProject(project: StoredProject): StoredProject {
  const { beat_list: raw, ...fields } = project;
  if (raw === undefined || raw.length !== BEAT_COUNT) {
    fail(
      `项目 ${project.id}：五节拍锁被破坏，beat_list 长度恒为 ${BEAT_COUNT}，实为 ${raw?.length ?? 0}（RULE-2、AC-6.1）`,
    );
  }

  // 禁用字段必须在重铸**之前**查：重铸出来的板是干净的，那时已经查不到痕迹了。
  raw.forEach((beat) => assertNoForbiddenFields(beat, project.id));

  const beats = raw.map((beat) => normalizeBeat(beat, project.id));
  let normalized: StoredProject;
  try {
    normalized = hydrateProject(
      {
        ...fields,
        archived: fields.archived ?? false,
        reused_from_id: fields.reused_from_id ?? null,
      },
      beats,
    );
  } catch (cause) {
    // 领域层的断言抛普通 Error；统一收敛成本层的错误类型，上层只需认一种。
    fail(`项目 ${project.id}：${cause instanceof Error ? cause.message : String(cause)}`);
  }

  assertProjectLocks(normalized);
  return normalized;
}
