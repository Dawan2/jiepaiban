/**
 * 生成结果的独立落库通道（PRD §8.2 `video_url` / `prompt_final`）。
 *
 * 在这一层之前，生成结果是靠编辑页的 effect 写进草稿、再等 2 秒防抖落盘的。
 * 于是「点生成 → 立刻离页」会丢结果：成片地址只留在内存的任务表里，项目里没有。
 * 这里把落库改成挂在**状态机的终态**上：
 *
 * ```
 * 任务进终态（成功 / 失败）
 *   → queue.onSettle
 *   → 本模块 settle()        读库 → 合进那一板 → repository.save
 *   → onPersisted            把已落库的值对齐进编辑页草稿（不置未保存态）
 * ```
 *
 * 三条性质是这个模块存在的理由：
 *
 * 1. **不经编辑态。** 写盘的输入是仓储里那份项目，不是草稿；也不碰防抖计时。
 * 2. **不随组件卸载消失。** 挂点在队列上，离页之后才跑完的任务照样落库。
 * 3. **串行。** 整集生成会连着报 5 个终态，每次都是「读库 → 改一板 → 写回」，
 *    并发跑会互相盖掉（后写的那份读到的是没有前一板结果的旧快照）。
 *
 * 红线不在这里放宽：写盘仍走 `repository.save` → `normalizeProject` →
 * `assertProjectLocks`，衔接手法泄漏进 `prompt_final` 的快照一样进不了库（AC-6.4）。
 */

import { useMemo, useRef } from 'react';
import type { BeatStatus } from '../domain/beats';
import { hydrateProject } from '../domain/projects';
import { rebuildBeat, type StoredBeat, type StoredProject } from '../adapters/persistence';
import { isTerminalStatus, type GenerateJob } from '../generate/types';

/** 终态任务应当在板上留下的痕迹；`undefined` 表示这个字段不动。 */
interface BeatResult {
  readonly status: BeatStatus;
  readonly video_url?: string | null;
  readonly prompt_final?: string | null;
}

/**
 * 终态任务 → 板上字段。非终态返回 `null`（在途状态不落库：板上的「生成中」
 * 是视图状态，落进库里只会在下次打开时变成一条永远不动的假在途）。
 *
 * 失败只落 `status`：
 * - `video_url` 保留。上一次成功产出的成片是真实存在的产物，重试失败不该把它抹掉。
 * - `prompt_final` 保留。失败任务的 prompt 快照没有落库价值，而「内容违规」类失败
 *   的快照恰恰是可能带着违规内容的那一份，落库会被 AC-6.4 的锁拒收（连带整次写盘失败）。
 */
function resultFor(job: GenerateJob): BeatResult | null {
  if (!isTerminalStatus(job.status)) {
    return null;
  }
  if (job.status === 'SUCCEEDED') {
    return { status: 'generated', video_url: job.video_url, prompt_final: job.prompt_snapshot };
  }
  return { status: 'failed' };
}

function differs(beat: StoredBeat, result: BeatResult): boolean {
  if (beat.status !== result.status) {
    return true;
  }
  if (result.video_url !== undefined && beat.video_url !== result.video_url) {
    return true;
  }
  return result.prompt_final !== undefined && beat.prompt_final !== result.prompt_final;
}

/** 库里（或草稿里）那份项目是否还没跟上这个任务的结果。 */
export function jobResultPending(project: StoredProject, job: GenerateJob): boolean {
  const result = resultFor(job);
  if (result === null) {
    return false;
  }
  const beat = project.beat_list.find((item) => item.index === job.beat_index);
  return beat !== undefined && differs(beat, result);
}

/**
 * 把一个终态任务的结果合进项目，返回新项目；无需改动时返回 `null`。
 *
 * 只动命中的那一板，其余四板原样重铸。返回 `null` 而不是原对象，是为了让调用方
 * 能据此跳过写盘——否则同一个成功任务每次订阅通知都会写一次库，保存态跟着抖。
 */
export function applyJobResult(project: StoredProject, job: GenerateJob): StoredProject | null {
  const result = resultFor(job);
  if (result === null || !jobResultPending(project, job)) {
    return null;
  }

  const { beat_list: stored, ...fields } = project;
  const beats = stored.map((beat) => {
    const next = rebuildBeat(beat);
    if (beat.index !== job.beat_index) {
      return next;
    }
    next.status = result.status;
    if (result.video_url !== undefined) {
      next.video_url = result.video_url;
    }
    if (result.prompt_final !== undefined) {
      next.prompt_final = result.prompt_final;
    }
    return next;
  });
  return hydrateProject(fields, beats);
}

/** 落库只需要读写单个项目，不必把整个仓储接口拖进生成链路。 */
export interface GenerateResultRepository {
  load(id: string): Promise<StoredProject | null>;
  save(project: StoredProject): Promise<void>;
}

export interface GenerateResultWriterOptions {
  readonly repository: GenerateResultRepository;
  /** 落库成功后回调，带上已落库的项目；编辑页据此对齐草稿。 */
  readonly onPersisted?: (job: GenerateJob, project: StoredProject) => void;
  /** 落库失败后回调。这条通道不抛错——它跑在状态机的调用栈上。 */
  readonly onError?: (error: unknown, job: GenerateJob) => void;
}

export interface GenerateResultWriter {
  /**
   * 收下一个任务的终态并落库；非终态任务直接忽略。
   * 返回的 promise 在**本次**写盘（含其前面排队的写盘）结束后 resolve。
   */
  readonly settle: (job: GenerateJob) => Promise<void>;
  /** 等在途写盘跑干（离页 flush 与测试用）。 */
  readonly idle: () => Promise<void>;
}

export function createGenerateResultWriter(
  options: GenerateResultWriterOptions,
): GenerateResultWriter {
  let tail: Promise<void> = Promise.resolve();

  async function write(job: GenerateJob): Promise<void> {
    const stored = await options.repository.load(job.project_id);
    if (stored === null) {
      // 项目已被删除：任务表里的残留结果无处可落，静默丢掉即可。
      return;
    }
    const next = applyJobResult(stored, job);
    if (next === null) {
      return;
    }
    await options.repository.save(next);
    options.onPersisted?.(job, next);
  }

  function settle(job: GenerateJob): Promise<void> {
    if (resultFor(job) === null) {
      return tail;
    }
    tail = tail
      .then(() => write(job))
      .catch((error: unknown) => {
        options.onError?.(error, job);
      });
    return tail;
  }

  return Object.freeze({ settle, idle: () => tail });
}

export type UseGenerateResultWriterOptions = GenerateResultWriterOptions;

/**
 * 组件里的写入器：**身份只随仓储变化**。
 *
 * 稳定身份是硬要求——`settle` 会被交给生成队列，而队列只在挂载时接一次线。
 * 回调因此走 ref 转发，调用方不必自己 `useCallback`。
 */
export function useGenerateResultWriter({
  repository,
  onPersisted,
  onError,
}: UseGenerateResultWriterOptions): GenerateResultWriter {
  const persistedRef = useRef(onPersisted);
  persistedRef.current = onPersisted;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  return useMemo(
    () =>
      createGenerateResultWriter({
        repository,
        onPersisted: (job, project) => persistedRef.current?.(job, project),
        onError: (error, job) => errorRef.current?.(error, job),
      }),
    [repository],
  );
}
