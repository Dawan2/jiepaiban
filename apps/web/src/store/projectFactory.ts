/**
 * 项目铸造：新建与复用（PRD V1.0 §7.1 / §7.2）。
 *
 * 两条路径都只产出**5 块锁定板**的结构：本文件不导出任何增删板的能力，
 * 也不接受"板数"参数——五节拍锁是结构常量，不是配置项（`RULE-2`、AC-6.1）。
 *
 * 与 WK1 领域层的分工：结构与校验复用 `src/domain/`（`createProject` / `createDefaultBeats`），
 * 本文件只负责补齐持久化层字段、按基准表落时长与预置衔接。Prompt 组装不在此处（WK2 负责）。
 */

import { BEAT_COUNT } from '../domain/beats';
import { createProject, type NewProjectInput } from '../domain/projects';
import type { StoredBeat, StoredProject } from '../adapters/persistence';

/**
 * 五节拍基准表时长（PRD §5.1 CANON）：B1 8s / B2 17s / B3 20s / B4 25s / B5 18s。
 * 合计 88s，即 `RULE-5` 的基准轴。
 */
export const CANON_BEAT_DURATIONS: readonly number[] = [8, 17, 20, 25, 18];

/** 基准轴总时长（秒）。 */
export const CANON_TOTAL_DURATION_SEC = 88;

/** 单板时长硬上限（`RULE-4`，>30s 硬拦截）。 */
export const MAX_BEAT_DURATION_SEC = 30;

/**
 * 预置组间衔接（PRD §5.1「组间衔接」列，§7.1 约束 3）。
 * 纯人读信息，用于后期合成阶段；**永不进入 Prompt 与生成请求体**（`RULE-9`、AC-6.4）。
 */
export const CANON_TRANSITIONS: readonly string[] = [
  '音频预接',
  '卡点硬切',
  '纯硬切',
  '卡点硬切 + BGM 升调',
  '无转场，黑屏截断',
];

/** id 生成端口：测试注入固定实现，断言才稳定（architecture §5「确定性」）。 */
export type IdGen = () => string;

export const randomProjectId: IdGen = () =>
  `prj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const sum = (values: readonly number[]): number => values.reduce((total, v) => total + v, 0);

/**
 * 按基准表的时长比例摊到目标总时长，保持"B4 最长、B1 最短"的节奏形状。
 *
 * 单板一律夹在 1–{@link MAX_BEAT_DURATION_SEC} 秒内（`RULE-4` 硬上限）。当目标总时长
 * 超出基准轴太多、夹紧后凑不满时，返回值之和会小于 `totalSec`——此时整集时长落在
 * `RULE-5` 的警示区，由编辑页顶部栏提示，不在此处静默改写用户输入。
 */
export function canonBeatDurations(totalSec: number): number[] {
  const durations = CANON_BEAT_DURATIONS.map((seconds) =>
    clamp(Math.round((seconds / CANON_TOTAL_DURATION_SEC) * totalSec), 1, MAX_BEAT_DURATION_SEC),
  );

  // 四舍五入会产生 ±几秒的漂移，按"基准表里最长的板优先"补回，保证总和精确等于目标值。
  const byLengthDesc = CANON_BEAT_DURATIONS.map((seconds, index) => ({ seconds, index }))
    .sort((a, b) => b.seconds - a.seconds)
    .map((entry) => entry.index);

  let drift = totalSec - sum(durations);
  while (drift !== 0) {
    const step = drift > 0 ? 1 : -1;
    const target = byLengthDesc.find((index) => {
      const next = (durations[index] ?? 0) + step;
      return next >= 1 && next <= MAX_BEAT_DURATION_SEC;
    });
    if (target === undefined) {
      break;
    }
    durations[target] = (durations[target] ?? 0) + step;
    drift -= step;
  }

  return durations;
}

/**
 * 新建项目（PRD §7.1）：必然产生 5 块板，不存在"空项目"或"自选板数"。
 * 板序、语义、宫格数由模板锁定；时长按基准表摊到目标总时长；衔接按 §5.1 预置。
 */
export function createEmptyProject(
  input: NewProjectInput,
  id: string,
  now: string,
): StoredProject {
  const base = createProject(input, id, now);
  const durations = canonBeatDurations(input.episodeDurationSec);

  const beats: StoredBeat[] = base.beats.map((beat, i) => ({
    ...beat,
    durationSec: durations[i] ?? null,
    transition: CANON_TRANSITIONS[i] ?? '',
    videoUrl: null,
    promptFinal: null,
  }));

  if (beats.length !== BEAT_COUNT) {
    throw new Error(`新建项目必须恰好 ${BEAT_COUNT} 块板，实为 ${beats.length}（RULE-2）`);
  }

  return {
    ...base,
    beats,
    createdAt: now,
    updatedAt: now,
    archived: false,
    reusedFromId: null,
  };
}

/** 复用时被清空的节拍字段（PRD §7.2「清空」列）。 */
export const REUSE_CLEARED_BEAT_FIELDS = ['cells', 'promptFinal', 'videoUrl', 'status'] as const;

/**
 * 复用项目（PRD §7.2）：**结构与参数的复制 + 内容的清空**，不是"另存副本"。
 *
 * | | 字段 |
 * | --- | --- |
 * | 继承 | 板序与语义（`index` / `role` / `name`）、宫格数、时长、衔接、板级情绪与剧情概要、项目级参数（题材 / 画幅 / 画风 / 主角 / 目标时长） |
 * | 清空 | 节拍帧画面文案（`cells`）、`promptFinal`、`videoUrl`、生成状态（`status` 回 `empty`） |
 *
 * 清空项一律回到空态，不保留上一集残留内容；产物仍是 5 板锁定结构。
 */
export function reuseProject(
  source: StoredProject,
  id: string,
  now: string,
  name = `${source.name} · 复用`,
): StoredProject {
  return {
    ...source,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    archived: false,
    reusedFromId: source.id,
    beats: source.beats.map((beat) => ({
      ...beat,
      cells: [
        { order: 1 as const, description: '' },
        { order: 2 as const, description: '' },
        { order: 3 as const, description: '' },
      ],
      promptFinal: null,
      videoUrl: null,
      status: 'empty' as const,
    })),
  };
}

/** 归档 / 取消归档（列表页把归档项目收起，数据保留）。 */
export function setArchived(project: StoredProject, archived: boolean, now: string): StoredProject {
  return { ...project, archived, updatedAt: now };
}
