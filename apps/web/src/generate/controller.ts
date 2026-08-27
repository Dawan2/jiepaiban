/**
 * 生成控制器 —— 给 UI 用的唯一入口（PRD 5.2 板级动作、5.4 生成状态呈现）。
 *
 * 这层把「队列 + 状态机 + 拦截链」压成 5 个板位的视图状态：
 * 每块板一个徽章文案、一个按钮文案、一个禁用原因，UI 只管渲染，不做业务判断。
 *
 * **给 WK3 的约定**：编辑页的「生成本板 / 生成全集」按钮直接调
 * {@link createGenerateController} 返回的方法即可，不需要知道队列、幂等键与状态机；
 * 本模块不产出任何布局与宫格样式，UI 结构与 CSS 归 WK3。
 */

import { BEAT_COUNT, type BeatIndex } from '../domain/beats';
import { beatAt, type Project } from '../domain/projects';
import { isRetryable, type SeedanceAdapter } from './adapter';
import { createGenerateQueue, type EnqueueResult, type GenerateQueue } from './queue';
import type { GenerateJobStore } from './store';
import {
  GENERATE_STATUS_LABEL,
  SEEDANCE_MODEL,
  isActiveStatus,
  type GenerateFailure,
  type GenerateJob,
  type GenerateJobStatus,
} from './types';

/** 一块板的生成视图状态。 */
export interface GenerateBoardState {
  readonly beat_index: BeatIndex;
  readonly status: GenerateJobStatus;
  /** 待生成 / 生成中 / 成功 / 失败。 */
  readonly status_label: string;
  readonly job: GenerateJob | null;
  readonly video_url: string | null;
  /** 失败原因；`null` 表示没失败。 */
  readonly failure: GenerateFailure | null;
  /** 前置校验没过时的可读原因，用于禁用态 tooltip（IX-3：禁用必须给原因）。 */
  readonly blocked_reason: string | null;
  readonly can_generate: boolean;
  /** 按钮文案：生成本板 / 生成中… / 重新生成 / 重试。 */
  readonly action_label: string;
}

export interface GenerateController {
  readonly model: typeof SEEDANCE_MODEL;
  readonly project_id: string;
  /** 生成本板。 */
  readonly generateBeat: (beatIndex: BeatIndex) => EnqueueResult;
  /** 生成全集：按 B1 → B5 依次发起 5 次独立调用。 */
  readonly generateEpisode: () => readonly EnqueueResult[];
  /** 重试 / 重新生成本板，只影响本板。 */
  readonly retryBeat: (beatIndex: BeatIndex) => EnqueueResult;
  readonly stateOf: (beatIndex: BeatIndex) => GenerateBoardState;
  /**
   * 换上同一个项目的新快照（编辑态每次改动都会产出新对象）。
   * 只接受同 id 的项目——控制器与项目 1:1，换项目必须换控制器。
   */
  readonly syncProject: (next: Project) => void;
  /** 5 个板位的视图状态，引用稳定：没变化时返回同一个数组。 */
  readonly snapshot: () => readonly GenerateBoardState[];
  readonly jobs: () => readonly GenerateJob[];
  readonly subscribe: (listener: () => void) => () => void;
  /** 手动把队列跑干（`autoRun: false` 时使用，测试里最常用）。 */
  readonly run: () => Promise<readonly GenerateJob[]>;
  /** 槽位内容改了以后刷新视图状态。 */
  readonly refresh: () => void;
  readonly reset: () => void;
  /** 解绑队列订阅，组件卸载时调用。 */
  readonly dispose: () => void;
}

export interface GenerateControllerOptions {
  readonly project: Project;
  readonly queue?: GenerateQueue;
  readonly adapter?: SeedanceAdapter;
  readonly store?: GenerateJobStore;
  /** 入队后自动开跑，默认 `true`；测试里设 `false` 手动步进。 */
  readonly autoRun?: boolean;
  /** 自动开跑时的异常回调；默认吞掉，避免未处理的 rejection。 */
  readonly onRunError?: (error: unknown) => void;
}

function actionLabel(status: GenerateJobStatus, job: GenerateJob | null): string {
  switch (status) {
    case 'PENDING':
      return job === null ? '生成本板' : '待生成…';
    case 'RUNNING':
      return '生成中…';
    case 'SUCCEEDED':
      return '重新生成';
    case 'FAILED':
      return job !== null && isRetryable(job) ? '重试' : '重新生成';
  }
}

export function createGenerateController(
  options: GenerateControllerOptions,
): GenerateController {
  let project = options.project;
  const queue =
    options.queue ??
    createGenerateQueue({
      ...(options.adapter === undefined ? {} : { adapter: options.adapter }),
      ...(options.store === undefined ? {} : { store: options.store }),
    });
  const autoRun = options.autoRun ?? true;
  const listeners = new Set<() => void>();
  let cached: readonly GenerateBoardState[] | null = null;

  const unsubscribeQueue = queue.subscribe(() => {
    invalidate();
  });

  function invalidate(): void {
    cached = null;
    listeners.forEach((listener) => listener());
  }

  function stateOf(beatIndex: BeatIndex): GenerateBoardState {
    const beat = beatAt(project, beatIndex);
    const job = queue.jobFor(project.id, beatIndex) ?? null;
    const status: GenerateJobStatus = job?.status ?? 'PENDING';
    const blocked = queue.precheck(project, beat);
    const busy = job !== null && isActiveStatus(job.status);

    return Object.freeze({
      beat_index: beat.index,
      status,
      status_label: GENERATE_STATUS_LABEL[status],
      job,
      video_url: job?.video_url ?? null,
      failure: job?.failure ?? null,
      blocked_reason: blocked?.message ?? null,
      can_generate: blocked === null && !busy,
      action_label: actionLabel(status, job),
    });
  }

  function snapshot(): readonly GenerateBoardState[] {
    if (cached === null) {
      cached = Object.freeze(
        Array.from({ length: BEAT_COUNT }, (_, i) => stateOf((i + 1) as BeatIndex)),
      );
    }
    return cached;
  }

  function kick(): void {
    if (!autoRun) {
      return;
    }
    void queue.drain().catch((error: unknown) => {
      options.onRunError?.(error);
    });
  }

  function generateBeat(beatIndex: BeatIndex): EnqueueResult {
    const result = queue.enqueue(project, beatAt(project, beatIndex));
    invalidate();
    if (result.status === 'queued') {
      kick();
    }
    return result;
  }

  function syncProject(next: Project): void {
    if (next.id !== project.id) {
      throw new Error(
        `生成控制器与项目 1:1：不能把 ${project.id} 的控制器换到 ${next.id} 上`,
      );
    }
    if (next === project) {
      return;
    }
    project = next;
    invalidate();
  }

  const controller: GenerateController = {
    model: SEEDANCE_MODEL,
    project_id: project.id,
    generateBeat,
    generateEpisode() {
      const results = queue.enqueueEpisode(project);
      invalidate();
      if (results.some((result) => result.status === 'queued')) {
        kick();
      }
      return results;
    },
    retryBeat(beatIndex) {
      const result = queue.retry(project, beatAt(project, beatIndex));
      invalidate();
      if (result.status === 'queued') {
        kick();
      }
      return result;
    },
    stateOf,
    syncProject,
    snapshot,
    jobs: () => queue.jobs(),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    run: () => queue.drain(),
    refresh: invalidate,
    reset() {
      queue.reset();
      invalidate();
    },
    dispose() {
      unsubscribeQueue();
      listeners.clear();
    },
  };

  return Object.freeze(controller);
}
