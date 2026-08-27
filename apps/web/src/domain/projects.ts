/**
 * 项目（= 集）模型。
 *
 * 上游：METH-002 §1/§10（`beat_list` 长度恒为 5）、METH-003 §1（整集 88s 基准轴）、
 * PRD 5.1 与 §9.3（「Beat 行数由 Project 创建事务固定写入 5 行，无独立创建 / 删除 API」）。
 *
 * 项目级字段（画风风格词 / 主角形象 / 画幅）自动注入每个节拍的 Prompt，
 * 节拍卡内只读展示、不重复填写。
 */

import {
  BEAT_COUNT,
  BASELINE_EPISODE_DURATION_SEC,
  EPISODE_DURATION_RANGE_SEC,
  assertBeatStructureLocked,
  createBeatList,
  isBeatReady,
  validateBeatList,
  type Beat,
  type BeatList,
  type LockViolation,
} from './beats';

/** V1.0 画幅：竖屏优先，默认 9:16。 */
export type AspectRatio = '9:16' | '16:9' | '1:1';

export const DEFAULT_ASPECT_RATIO: AspectRatio = '9:16';

export interface Project {
  readonly id: string;
  name: string;
  /** 题材，自由文本（V1.1 升级为模板选择）。 */
  genre: string;
  aspect_ratio: AspectRatio;
  /** 整集时长（秒），区间 70–90，基准轴 88。 */
  total_duration_sec: number;
  /** 全局画风风格词，注入每拍 Prompt。 */
  style_prompt: string;
  /** 主角形象描述，注入每拍 Prompt。 */
  protagonist: string;
  updated_at: string;
  /** 节拍板列表，长度恒为 5；属性本身不可写，数组被冻结。 */
  readonly beat_list: BeatList;
}

export type NewProjectInput = Omit<
  Project,
  'id' | 'updated_at' | 'beat_list' | 'total_duration_sec'
> & {
  total_duration_sec?: number;
};

let sequence = 0;

function nextProjectId(): string {
  sequence += 1;
  return `prj_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

export interface CreateProjectOptions {
  readonly id?: string;
  readonly now?: string;
}

function attachBeatList(draft: Omit<Project, 'beat_list'>): Project {
  const project = draft as Project;
  // 属性不可写：`project.beat_list = []` 这类整表替换会抛 TypeError，
  // 数组自身也已冻结，增删改序同样抛错。
  Object.defineProperty(project, 'beat_list', {
    value: createBeatList(),
    enumerable: true,
  });
  return project;
}

/**
 * 用现成的 5 块板重装一个项目——持久化读回与编辑态回落的唯一入口。
 *
 * 板列表先过 {@link assertBeatStructureLocked}，再以不可写属性挂上、数组冻结：
 * 数据绕过 {@link createEmptyProject} 从库里回来，五节拍锁与宫格锁照样成立。
 * 泛型保留调用方的额外字段（持久化层的 `created_at` / `archived` 等）。
 *
 * 这里只拦**结构**违规。编辑态每敲一个字都会走这条路，取值越界（时长清空的那一瞬间）
 * 属于正常中间态，由落库前的 `assertProjectLocks` 拦住。
 */
export function hydrateProject<T extends Omit<Project, 'beat_list'>, B extends Beat>(
  fields: T,
  beatList: readonly B[],
): T & { readonly beat_list: readonly [B, B, B, B, B] } {
  assertBeatStructureLocked(beatList);
  const project = { ...fields } as T & { readonly beat_list: readonly [B, B, B, B, B] };
  Object.defineProperty(project, 'beat_list', {
    value: Object.freeze([...beatList]),
    enumerable: true,
  });
  return project;
}

/**
 * 只给项目名就能建出一个空项目：整集 88s 基准轴 + 锁死的 5 块板。
 * 返回的 `beat_list` 长度恒为 {@link BEAT_COUNT}，且不可增删改序。
 */
export function createEmptyProject(name: string, options: CreateProjectOptions = {}): Project {
  return attachBeatList({
    id: options.id ?? nextProjectId(),
    name,
    genre: '',
    aspect_ratio: DEFAULT_ASPECT_RATIO,
    total_duration_sec: BASELINE_EPISODE_DURATION_SEC,
    style_prompt: '',
    protagonist: '',
    updated_at: options.now ?? new Date().toISOString(),
  });
}

/** 强制字段齐备才可创建（PRD 5.1.1）。 */
export function isNewProjectValid(input: NewProjectInput): boolean {
  const total = input.total_duration_sec ?? BASELINE_EPISODE_DURATION_SEC;
  return (
    input.name.trim() !== '' &&
    input.genre.trim() !== '' &&
    input.style_prompt.trim() !== '' &&
    input.protagonist.trim() !== '' &&
    isEpisodeDurationValid(total)
  );
}

/** 带全部强制字段的创建入口；同样自动携带 5 块板（AC-6.1）。 */
export function createProject(input: NewProjectInput, options: CreateProjectOptions = {}): Project {
  const project = createEmptyProject(input.name, options);
  project.genre = input.genre;
  project.aspect_ratio = input.aspect_ratio;
  project.total_duration_sec = input.total_duration_sec ?? BASELINE_EPISODE_DURATION_SEC;
  project.style_prompt = input.style_prompt;
  project.protagonist = input.protagonist;
  return project;
}

export function isEpisodeDurationValid(totalDurationSec: number): boolean {
  return (
    Number.isFinite(totalDurationSec) &&
    totalDurationSec >= EPISODE_DURATION_RANGE_SEC.min &&
    totalDurationSec <= EPISODE_DURATION_RANGE_SEC.max
  );
}

/** 五块板的时长之和；应落在整集区间内。 */
export function episodeDuration(project: Project): number {
  return project.beat_list.reduce((sum, beat) => sum + beat.duration_sec, 0);
}

export function beatAt(project: Project, index: Beat['index']): Beat {
  const found = project.beat_list[index - 1];
  if (found === undefined) {
    throw new RangeError(`节拍序号越界：${index}；节拍数恒为 ${BEAT_COUNT}`);
  }
  return found;
}

/** 五节拍完成度（项目卡点阵用），分母恒为 5。 */
export function beatCompletion(project: Project): { filled: number; total: typeof BEAT_COUNT } {
  const filled = project.beat_list.filter((item) => item.status !== 'empty').length;
  return { filled, total: BEAT_COUNT };
}

/** 全部 5 块板就绪才可提交整集生成。 */
export function isProjectReady(project: Project): boolean {
  return project.beat_list.every(isBeatReady);
}

/** 项目级红线校验：结构锁 + 整集时长区间。 */
export function validateProject(project: Project): readonly LockViolation[] {
  return validateBeatList(project.beat_list);
}
