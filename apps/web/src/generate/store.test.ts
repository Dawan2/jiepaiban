/**
 * 任务持久化：内存实现 + 本地存储实现。
 *
 * 本槽位不引后端；接 WK3 数据层时换一个 {@link GenerateJobStore} 实现即可，
 * 队列与状态机不动。
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  GENERATE_JOBS_STORAGE_KEY,
  createLocalJobStore,
  createMemoryJobStore,
  latestJobFor,
  type GenerateJobStore,
  type WebStorageLike,
} from './store';
import { SEEDANCE_MODEL, type GenerateJob } from './types';

function job(overrides: Partial<GenerateJob> = {}): GenerateJob {
  return {
    id: 'job_1',
    project_id: 'prj_golden_beat1',
    beat_index: 1,
    model: SEEDANCE_MODEL,
    prompt_snapshot: '漫剧厚涂画风，高清8K，人物五官稳定无漂移。',
    params: { duration_sec: 8, aspect_ratio: '9:16', frame_count: 3, g_index: 'G1' },
    idempotency_key: 'idem_00000001',
    status: 'PENDING',
    attempt: 1,
    created_at: '2026-08-27T00:00:00.000Z',
    updated_at: '2026-08-27T00:00:00.000Z',
    video_url: null,
    failure: null,
    ...overrides,
  };
}

function fakeStorage(): WebStorageLike & { readonly dump: () => Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map),
  };
}

const cases: readonly (readonly [string, () => GenerateJobStore])[] = [
  ['内存实现', () => createMemoryJobStore()],
  ['本地存储实现', () => createLocalJobStore(fakeStorage())],
];

describe.each(cases)('%s', (_name, create) => {
  it('写入后可读回', () => {
    const store = create();
    store.save(job());
    expect(store.read('job_1')?.status).toBe('PENDING');
    expect(store.list()).toHaveLength(1);
  });

  it('同 id 覆盖而不是追加', () => {
    const store = create();
    store.save(job());
    store.save(job({ status: 'SUCCEEDED', video_url: 'stub://x.mp4' }));
    expect(store.list()).toHaveLength(1);
    expect(store.read('job_1')?.status).toBe('SUCCEEDED');
    expect(store.read('job_1')?.video_url).toBe('stub://x.mp4');
  });

  it('按板取最近一次任务', () => {
    const store = create();
    store.save(job({ id: 'job_1', beat_index: 1, status: 'FAILED' }));
    store.save(job({ id: 'job_2', beat_index: 1, status: 'SUCCEEDED' }));
    store.save(job({ id: 'job_3', beat_index: 3 }));

    expect(latestJobFor(store, 'prj_golden_beat1', 1)?.id).toBe('job_2');
    expect(latestJobFor(store, 'prj_golden_beat1', 3)?.id).toBe('job_3');
    expect(latestJobFor(store, 'prj_golden_beat1', 5)).toBeUndefined();
    expect(latestJobFor(store, 'prj_other', 1)).toBeUndefined();
  });

  it('删除与清空', () => {
    const store = create();
    store.save(job());
    store.save(job({ id: 'job_2' }));
    store.remove('job_1');
    expect(store.list().map((item) => item.id)).toEqual(['job_2']);
    store.clear();
    expect(store.list()).toHaveLength(0);
  });

  it('读回的任务是冻结快照', () => {
    const store = create();
    const saved = store.save(job());
    expect(Object.isFrozen(saved)).toBe(true);
  });
});

describe('本地存储实现的细节', () => {
  it('落在约定的 key 上，内容是 JSON 数组', () => {
    const storage = fakeStorage();
    createLocalJobStore(storage).save(job());
    const raw = storage.dump()[GENERATE_JOBS_STORAGE_KEY] ?? '';
    expect(JSON.parse(raw)).toHaveLength(1);
  });

  it('换一个实例仍读得到（跨会话持久化）', () => {
    const storage = fakeStorage();
    createLocalJobStore(storage).save(job({ status: 'SUCCEEDED' }));
    expect(createLocalJobStore(storage).read('job_1')?.status).toBe('SUCCEEDED');
  });

  it('坏数据按空表处理，不把页面卡死', () => {
    const storage = fakeStorage();
    storage.setItem(GENERATE_JOBS_STORAGE_KEY, '{不是 JSON');
    const store = createLocalJobStore(storage);
    expect(store.list()).toHaveLength(0);
    store.save(job());
    expect(store.list()).toHaveLength(1);
  });

  it('形状不对的记录会被丢掉', () => {
    const storage = fakeStorage();
    storage.setItem(GENERATE_JOBS_STORAGE_KEY, JSON.stringify([{ id: 'x' }, job()]));
    expect(createLocalJobStore(storage).list().map((item) => item.id)).toEqual(['job_1']);
  });
});

describe('浏览器 localStorage', () => {
  afterEach(() => {
    globalThis.localStorage?.clear();
  });

  it('jsdom 环境下真的写进了 localStorage', () => {
    const store = createLocalJobStore(globalThis.localStorage);
    store.save(job());
    expect(globalThis.localStorage.getItem(GENERATE_JOBS_STORAGE_KEY)).toContain('job_1');
    expect(store.list()).toHaveLength(1);
  });
});
