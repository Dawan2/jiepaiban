/**
 * 落库前 / 读回后的结构锁断言（架构文档 tech-stack §2.2 读路径：迁移链 → `assertLocks` → 入 store）。
 *
 * 断言失败**不静默**：抛 {@link ProjectLockError}，由上层提示数据修复，绝不把违规结构写进库或喂给 UI。
 *
 * 覆盖的产品红线：
 * - `RULE-2` / AC-6.1 五节拍锁：`beats` 长度恒为 5，序号恒为 1–5，不可增删改序。
 * - `RULE-3` / `FR-1-03` 宫格锁：B1–B4 = 3 宫格、B5 = 2 宫格，由板序推导。
 * - `RULE-7` / R4 帧序锁：帧位恒为左→右 1–3，无排序权重字段。
 * - `RULE-9` / AC-6.4 转场隔离：衔接文案不得出现在 Prompt 快照里。
 * - `RULE-11` / AC-6.8 无故事板：节拍上不得出现任何分镜 / 镜头级字段。
 */

import { BEAT_COUNT, BEAT_INDEXES, gridSizeForBeat } from '../../domain/beats';
import type { StoredBeat, StoredProject } from './schema';

export class ProjectLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectLockError';
  }
}

/**
 * 分镜 / 镜头级字段黑名单（`RULE-11`、AC-6.8，PRD §8.4「禁止字段」）。
 * 出现即违规：这些概念在本产品被概念级禁止，不是"暂不支持"。
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
  'lens',
  'angle',
  'framing',
  'shotSize',
  'sortWeight',
  'order_weight',
] as const;

function fail(message: string): never {
  throw new ProjectLockError(message);
}

function assertBeatLocks(beat: StoredBeat, project: StoredProject): void {
  const at = `项目 ${project.id} 节拍${beat.index}`;

  const expectedGrid = gridSizeForBeat(beat.index);
  if (beat.gridSize !== expectedGrid) {
    fail(`${at}：宫格锁被破坏，B${beat.index} 应为 ${expectedGrid} 宫格，实为 ${beat.gridSize}（RULE-3）`);
  }

  if (beat.cells.length !== 3) {
    fail(`${at}：节拍帧槽位恒为 3 个（B5 只组装前 2 格），实为 ${beat.cells.length}`);
  }
  beat.cells.forEach((cell, i) => {
    if (cell.order !== i + 1) {
      fail(`${at}：帧序锁被破坏，第 ${i + 1} 格的 order 为 ${cell.order}（RULE-7，只按左→右读取）`);
    }
  });

  const present = FORBIDDEN_BEAT_FIELDS.filter((field) => field in beat);
  if (present.length > 0) {
    fail(`${at}：出现被概念级禁止的分镜 / 镜头级字段 ${present.join('、')}（RULE-11、AC-6.8）`);
  }

  const transition = beat.transition.trim();
  if (transition !== '' && beat.promptFinal !== null && beat.promptFinal.includes(transition)) {
    fail(`${at}：衔接文案泄漏进 Prompt 快照（RULE-9、AC-6.4，转场永不进入 prompt）`);
  }
}

/** 校验一个项目是否满足全部结构锁；失败即抛，不返回布尔值以免调用方忽略。 */
export function assertProjectLocks(project: StoredProject): void {
  if (project.beats.length !== BEAT_COUNT) {
    fail(
      `项目 ${project.id}：五节拍锁被破坏，beats 长度恒为 ${BEAT_COUNT}，实为 ${project.beats.length}（RULE-2、AC-6.1）`,
    );
  }

  const indexes = project.beats.map((beat) => beat.index);
  if (indexes.join(',') !== BEAT_INDEXES.join(',')) {
    fail(`项目 ${project.id}：节拍序号恒为 1–5 且不可改序，实为 ${indexes.join(',')}（RULE-2）`);
  }

  project.beats.forEach((beat) => assertBeatLocks(beat, project));
}

/**
 * 把可推导字段归一到锁定值后再断言。
 *
 * 归一只处理**派生值**（宫格数、帧序）——这些字段本就"由板序推导、用户不可改"（`FR-1-03`），
 * 读到旧数据里的偏差属于历史遗留而非用户意图。结构性违规（板数、序号、禁用字段）不归一，直接抛。
 */
export function normalizeProject(project: StoredProject): StoredProject {
  const normalized: StoredProject = {
    ...project,
    beats: project.beats.map((beat) => {
      const [first, second, third] = beat.cells;
      if (first === undefined || second === undefined || third === undefined) {
        fail(`项目 ${project.id} 节拍${beat.index}：节拍帧槽位缺失，恒为 3 个（B5 只组装前 2 格）`);
      }
      return {
        ...beat,
        gridSize: gridSizeForBeat(beat.index),
        cells: [
          { ...first, order: 1 },
          { ...second, order: 2 },
          { ...third, order: 3 },
        ] as StoredBeat['cells'],
      };
    }),
  };

  assertProjectLocks(normalized);
  return normalized;
}
