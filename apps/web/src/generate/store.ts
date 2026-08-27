/**
 * 生成任务的持久化（本槽位只做内存与本地存储两种实现）。
 *
 * 真正的落库归 WK3 的数据 / API 层：新增一个实现 {@link GenerateJobStore} 的对象即可，
 * 队列与控制器不感知存储介质。
 */

import type { BeatIndex } from '../domain/beats';
import { isGenerateJobStatus, type GenerateJob } from './types';

export interface GenerateJobStore {
  /** 按创建时间升序返回全部任务。 */
  readonly list: () => readonly GenerateJob[];
  readonly read: (id: string) => GenerateJob | undefined;
  /** 写入或覆盖；返回落库后的快照。 */
  readonly save: (job: GenerateJob) => GenerateJob;
  readonly remove: (id: string) => void;
  readonly clear: () => void;
}

/** 取某块板最近一次任务。 */
export function latestJobFor(
  store: GenerateJobStore,
  projectId: string,
  beatIndex: BeatIndex,
): GenerateJob | undefined {
  const matched = store
    .list()
    .filter((job) => job.project_id === projectId && job.beat_index === beatIndex);
  return matched[matched.length - 1];
}

export function createMemoryJobStore(seed: readonly GenerateJob[] = []): GenerateJobStore {
  const jobs = new Map<string, GenerateJob>();
  seed.forEach((job) => jobs.set(job.id, Object.freeze({ ...job })));

  const store: GenerateJobStore = {
    list: () => Object.freeze([...jobs.values()]),
    read: (id) => jobs.get(id),
    save(job) {
      const stored = Object.freeze({ ...job });
      jobs.set(stored.id, stored);
      return stored;
    },
    remove(id) {
      jobs.delete(id);
    },
    clear() {
      jobs.clear();
    },
  };

  return Object.freeze(store);
}

/** `localStorage` 的最小接口，方便测试注入假实现。 */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const GENERATE_JOBS_STORAGE_KEY = 'jiepaiban.generate.jobs.v1';

function isJobShape(value: unknown): value is GenerateJob {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const job = value as Partial<GenerateJob>;
  return (
    typeof job.id === 'string' &&
    typeof job.project_id === 'string' &&
    typeof job.beat_index === 'number' &&
    typeof job.prompt_snapshot === 'string' &&
    isGenerateJobStatus(job.status)
  );
}

/**
 * 本地存储实现：每次操作整表读写 JSON。
 *
 * 任务量恒为「项目数 × 5」量级，整表读写足够；
 * 解析失败按空表处理并覆盖回写，坏数据不会把编辑页卡死。
 */
export function createLocalJobStore(
  storage: WebStorageLike,
  key: string = GENERATE_JOBS_STORAGE_KEY,
): GenerateJobStore {
  function readAll(): GenerateJob[] {
    const raw = storage.getItem(key);
    if (raw === null || raw === '') {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(isJobShape).map((job) => Object.freeze({ ...job }));
    } catch {
      return [];
    }
  }

  function writeAll(jobs: readonly GenerateJob[]): void {
    storage.setItem(key, JSON.stringify(jobs));
  }

  const store: GenerateJobStore = {
    list: () => Object.freeze(readAll()),
    read: (id) => readAll().find((job) => job.id === id),
    save(job) {
      const stored = Object.freeze({ ...job });
      const jobs = readAll();
      const at = jobs.findIndex((item) => item.id === stored.id);
      if (at >= 0) {
        jobs[at] = stored;
      } else {
        jobs.push(stored);
      }
      writeAll(jobs);
      return stored;
    },
    remove(id) {
      writeAll(readAll().filter((job) => job.id !== id));
    },
    clear() {
      storage.removeItem(key);
    },
  };

  return Object.freeze(store);
}

/** 浏览器里可用就用 `localStorage`，否则回落到内存（SSR / 测试环境）。 */
export function createDefaultJobStore(): GenerateJobStore {
  try {
    const storage = globalThis.localStorage as WebStorageLike | undefined;
    if (storage !== undefined && storage !== null) {
      return createLocalJobStore(storage);
    }
  } catch {
    // 隐私模式等场景下访问 localStorage 会抛错，直接回落内存。
  }
  return createMemoryJobStore();
}
