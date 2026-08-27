/**
 * 生成任务队列（FR-4-01…08、AC-F4-2/4/5/6）。
 *
 * 规则：
 * - **一板一任务**：同一块板同一时刻最多一个在途任务；提交入口只锁本板，其余四板照常编辑（IX-4）。
 * - **幂等**：同板同入参重复提交复用原任务；改动任一槽位后 `idempotency_key` 变化，视为新任务。
 * - **前置校验阻断**：拦截链命中即返回 `blocked`，**不建任务、不提交上游**。
 * - **顺序**：先进先出；整集生成按 B1 → B5 依次入队，仍是 5 次独立调用。
 */

import { BEAT_COUNT, type Beat, type BeatIndex } from '../domain/beats';
import { beatAt, type Project } from '../domain/projects';
import {
  createSeedanceAdapter,
  isRetryable,
  type SeedanceAdapter,
  type SeedanceSubmission,
} from './adapter';
import { createDefaultJobStore, latestJobFor, type GenerateJobStore } from './store';
import {
  SEEDANCE_MODEL,
  canTransition,
  isActiveStatus,
  type GenerateFailure,
  type GenerateJob,
  type GenerateJobStatus,
} from './types';

export type EnqueueResult =
  /** 新任务已入队，状态「待生成」。 */
  | { readonly status: 'queued'; readonly job: GenerateJob }
  /** 同板同入参已有任务，直接复用，不产生重复任务。 */
  | { readonly status: 'reused'; readonly job: GenerateJob }
  /** 本板有在途任务占着提交入口。 */
  | { readonly status: 'busy'; readonly job: GenerateJob }
  /** 前置校验未过，已阻断提交。 */
  | { readonly status: 'blocked'; readonly failure: GenerateFailure };

export interface EnqueueOptions {
  /** 重新生成：即便同入参已经成功过，也强制建新任务。 */
  readonly force?: boolean;
}

export interface GenerateQueue {
  readonly model: typeof SEEDANCE_MODEL;
  /** 纯前置校验，无副作用：通过返回 `null`，用于按钮禁用态与原因提示。 */
  readonly precheck: (project: Project, beat: Beat) => GenerateFailure | null;
  readonly enqueue: (project: Project, beat: Beat, options?: EnqueueOptions) => EnqueueResult;
  /** 按 B1 → B5 依次入队，返回 5 个结果，逐板可读。 */
  readonly enqueueEpisode: (project: Project) => readonly EnqueueResult[];
  /** 重试 / 重新生成本板；不影响其他板。 */
  readonly retry: (project: Project, beat: Beat) => EnqueueResult;
  readonly jobFor: (projectId: string, beatIndex: BeatIndex) => GenerateJob | undefined;
  readonly jobs: () => readonly GenerateJob[];
  readonly pending: () => readonly GenerateJob[];
  /** 取队首「待生成」任务跑一轮；队列为空返回 `null`。 */
  readonly runNext: () => Promise<GenerateJob | null>;
  /** 一直跑到没有待生成任务为止。 */
  readonly drain: () => Promise<readonly GenerateJob[]>;
  readonly subscribe: (listener: (jobs: readonly GenerateJob[]) => void) => () => void;
  readonly reset: () => void;
}

export interface GenerateQueueOptions {
  readonly adapter?: SeedanceAdapter;
  readonly store?: GenerateJobStore;
  readonly now?: () => string;
  readonly newId?: () => string;
}

let idSequence = 0;

function defaultNewId(): string {
  idSequence += 1;
  return `job_${Date.now().toString(36)}_${idSequence.toString(36)}`;
}

export function createGenerateQueue(options: GenerateQueueOptions = {}): GenerateQueue {
  const adapter = options.adapter ?? createSeedanceAdapter();
  const store = options.store ?? createDefaultJobStore();
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? defaultNewId;
  const listeners = new Set<(jobs: readonly GenerateJob[]) => void>();
  let draining: Promise<readonly GenerateJob[]> | null = null;

  function notify(): void {
    const snapshot = store.list();
    listeners.forEach((listener) => listener(snapshot));
  }

  function transition(
    job: GenerateJob,
    status: GenerateJobStatus,
    patch: Partial<Pick<GenerateJob, 'video_url' | 'failure'>> = {},
  ): GenerateJob {
    if (!canTransition(job.status, status)) {
      throw new Error(`非法状态流转：${job.status} → ${status}（任务 ${job.id}）`);
    }
    const next: GenerateJob = {
      ...job,
      ...patch,
      status,
      updated_at: now(),
    };
    const saved = store.save(next);
    notify();
    return saved;
  }

  function createJob(project: Project, beat: Beat, submission: SeedanceSubmission): GenerateJob {
    const timestamp = now();
    const previous = latestJobFor(store, project.id, beat.index);
    return {
      id: newId(),
      project_id: project.id,
      beat_index: beat.index,
      model: SEEDANCE_MODEL,
      prompt_snapshot: submission.prompt,
      params: submission.params,
      idempotency_key: submission.idempotency_key,
      status: 'PENDING',
      attempt: previous === undefined ? 1 : previous.attempt + 1,
      created_at: timestamp,
      updated_at: timestamp,
      video_url: null,
      failure: null,
    };
  }

  function enqueue(project: Project, beat: Beat, enqueueOptions: EnqueueOptions = {}): EnqueueResult {
    const failure = adapter.precheck(project, beat);
    if (failure !== null) {
      return { status: 'blocked', failure };
    }

    const submission = adapter.buildSubmission(project, beat);
    const existing = latestJobFor(store, project.id, beat.index);

    if (existing !== undefined) {
      if (isActiveStatus(existing.status)) {
        return existing.idempotency_key === submission.idempotency_key
          ? { status: 'reused', job: existing }
          : { status: 'busy', job: existing };
      }
      if (
        existing.status === 'SUCCEEDED' &&
        existing.idempotency_key === submission.idempotency_key &&
        enqueueOptions.force !== true
      ) {
        return { status: 'reused', job: existing };
      }
    }

    const job = store.save(createJob(project, beat, submission));
    notify();
    return { status: 'queued', job };
  }

  function pending(): readonly GenerateJob[] {
    return store.list().filter((job) => job.status === 'PENDING');
  }

  async function runNext(): Promise<GenerateJob | null> {
    const next = pending()[0];
    if (next === undefined) {
      return null;
    }

    const running = transition(next, 'RUNNING');
    const submission: SeedanceSubmission = Object.freeze({
      model: running.model,
      beat_index: running.beat_index,
      prompt: running.prompt_snapshot,
      params: running.params,
      idempotency_key: running.idempotency_key,
    });

    const result = await adapter.submit(submission);
    if (result.ok) {
      return transition(running, 'SUCCEEDED', { video_url: result.video_url, failure: null });
    }
    return transition(running, 'FAILED', { failure: result.failure, video_url: null });
  }

  async function drain(): Promise<readonly GenerateJob[]> {
    if (draining !== null) {
      return draining;
    }
    draining = (async () => {
      const done: GenerateJob[] = [];
      // 上限保护：单集最多 5 块板，跑满 BEAT_COUNT 轮还有剩余说明有环，直接停。
      let guard = BEAT_COUNT * 2;
      for (;;) {
        const job = await runNext();
        if (job === null) {
          break;
        }
        done.push(job);
        guard -= 1;
        if (guard <= 0) {
          break;
        }
      }
      return Object.freeze(done);
    })();

    try {
      return await draining;
    } finally {
      draining = null;
    }
  }

  const queue: GenerateQueue = {
    model: SEEDANCE_MODEL,
    precheck: (project, beat) => adapter.precheck(project, beat),
    enqueue,
    enqueueEpisode(project) {
      return Object.freeze(
        project.beat_list.map((beat) => enqueue(project, beatAt(project, beat.index))),
      );
    },
    retry(project, beat) {
      const existing = latestJobFor(store, project.id, beat.index);
      const stuck =
        existing !== undefined &&
        existing.status === 'FAILED' &&
        existing.failure !== null &&
        !isRetryable(existing);

      if (stuck) {
        const failure = adapter.precheck(project, beat);
        if (failure !== null) {
          return { status: 'blocked', failure };
        }
        // 参数 / 内容类失败不能原样重投：入参没变就还是同一个结果，直接把原因回给用户。
        if (adapter.buildSubmission(project, beat).idempotency_key === existing.idempotency_key) {
          return { status: 'blocked', failure: existing.failure };
        }
      }
      return enqueue(project, beat, { force: true });
    },
    jobFor: (projectId, beatIndex) => latestJobFor(store, projectId, beatIndex),
    jobs: () => store.list(),
    pending,
    runNext,
    drain,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      store.clear();
      notify();
    },
  };

  return Object.freeze(queue);
}
