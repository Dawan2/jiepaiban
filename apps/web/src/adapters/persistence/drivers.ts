/**
 * 存储驱动端口与三个实现（架构文档 tech-stack §2.1 存储布局）。
 *
 * 仓储（`./localRepository.ts`）只依赖 {@link StorageDriver} 这一个窄接口，
 * 于是「换存储介质」与「换业务规则」互不影响：
 *
 * | 实现 | 介质 | 用途 |
 * | --- | --- | --- |
 * | {@link IndexedDbDriver} | IndexedDB 单库 `beatboard` | 浏览器首选：容量大、异步不阻塞主线程 |
 * | {@link LocalStorageDriver} | `localStorage` 前缀键 | IndexedDB 不可用时兜底（隐私模式 / 旧内核） |
 * | {@link MemoryDriver} | 进程内 Map | 单测与 SSR 占位，永不落盘 |
 *
 * 说明：架构文档建议用 `idb` 薄封装 IndexedDB，此处以 ~40 行本地 promisify 代替，
 * 目的是把运行时依赖保持为零；因为调用方只看 {@link StorageDriver}，
 * 日后换成 `idb` 只需替换本文件的一个实现，不牵动任何业务代码。
 */

import {
  META_STORE,
  PROJECT_STORE,
  done,
  openBeatboardDb,
  toPromise,
} from '../indexeddb/beatboardDb';

export {
  DB_NAME,
  DB_VERSION,
  META_STORE,
  PROJECT_STORE,
} from '../indexeddb/beatboardDb';

export type StorageKind = 'indexeddb' | 'localstorage' | 'memory';

/**
 * 文档式键值驱动：一条记录 = 一个项目（含 `beat_list[5]`），外加一条 `meta` 封套。
 * 驱动层只搬运不透明载荷，不认识业务字段，也不做任何业务校验。
 */
export interface StorageDriver {
  readonly kind: StorageKind;
  /** 读出全部项目记录，顺序不保证。 */
  getAll(): Promise<readonly unknown[]>;
  put(id: string, record: unknown): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  getMeta(): Promise<unknown | null>;
  setMeta(meta: unknown): Promise<void>;
}

/** 结构化克隆，隔离调用方与库内引用，避免"改了内存对象库里也跟着变"。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* ------------------------------------------------------------------ 内存 */

export class MemoryDriver implements StorageDriver {
  readonly kind = 'memory' as const;
  private readonly records = new Map<string, unknown>();
  private meta: unknown = null;

  async getAll(): Promise<readonly unknown[]> {
    return [...this.records.values()].map((record) => clone(record));
  }

  async put(id: string, record: unknown): Promise<void> {
    this.records.set(id, clone(record));
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }

  async clear(): Promise<void> {
    this.records.clear();
    this.meta = null;
  }

  async getMeta(): Promise<unknown | null> {
    return this.meta === null ? null : clone(this.meta);
  }

  async setMeta(meta: unknown): Promise<void> {
    this.meta = clone(meta);
  }
}

/* ---------------------------------------------------------- localStorage */

export const LOCAL_STORAGE_PREFIX = 'jiepaiban:project:';
export const LOCAL_STORAGE_META_KEY = 'jiepaiban:meta';

export class LocalStorageDriver implements StorageDriver {
  readonly kind = 'localstorage' as const;

  constructor(private readonly storage: Storage) {}

  private keys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i += 1) {
      const key = this.storage.key(i);
      if (key !== null && key.startsWith(LOCAL_STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
    return keys;
  }

  async getAll(): Promise<readonly unknown[]> {
    const records: unknown[] = [];
    for (const key of this.keys()) {
      const raw = this.storage.getItem(key);
      if (raw === null) {
        continue;
      }
      // 单条损坏不应让整库读不出来：跳过并留给上层的锁断言/修复流程。
      try {
        records.push(JSON.parse(raw));
      } catch {
        continue;
      }
    }
    return records;
  }

  async put(id: string, record: unknown): Promise<void> {
    this.storage.setItem(`${LOCAL_STORAGE_PREFIX}${id}`, JSON.stringify(record));
  }

  async remove(id: string): Promise<void> {
    this.storage.removeItem(`${LOCAL_STORAGE_PREFIX}${id}`);
  }

  async clear(): Promise<void> {
    for (const key of this.keys()) {
      this.storage.removeItem(key);
    }
    this.storage.removeItem(LOCAL_STORAGE_META_KEY);
  }

  async getMeta(): Promise<unknown | null> {
    const raw = this.storage.getItem(LOCAL_STORAGE_META_KEY);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async setMeta(meta: unknown): Promise<void> {
    this.storage.setItem(LOCAL_STORAGE_META_KEY, JSON.stringify(meta));
  }
}

/* ------------------------------------------------------------- IndexedDB */

const META_KEY = 'envelope';

export class IndexedDbDriver implements StorageDriver {
  readonly kind = 'indexeddb' as const;

  constructor(private readonly factory: IDBFactory) {}

  /**
   * 库名 / 版本 / 建表都在 `adapters/indexeddb/beatboardDb.ts`：
   * 版本号是库级的，多个 store 的拥有者各开一次必然撞版本（详见该文件顶部注释）。
   */
  private open(): Promise<IDBDatabase> {
    return openBeatboardDb(this.factory);
  }

  private async write(store: string, run: (objectStore: IDBObjectStore) => void): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(store, 'readwrite');
    run(tx.objectStore(store));
    await done(tx);
  }

  async getAll(): Promise<readonly unknown[]> {
    const db = await this.open();
    const tx = db.transaction(PROJECT_STORE, 'readonly');
    const records = await toPromise(tx.objectStore(PROJECT_STORE).getAll());
    return records as readonly unknown[];
  }

  async put(id: string, record: unknown): Promise<void> {
    // keyPath 为 'id'，落库记录自带 id，无需显式传键。
    await this.write(PROJECT_STORE, (store) => void store.put({ ...(record as object), id }));
  }

  async remove(id: string): Promise<void> {
    await this.write(PROJECT_STORE, (store) => void store.delete(id));
  }

  async clear(): Promise<void> {
    await this.write(PROJECT_STORE, (store) => void store.clear());
    await this.write(META_STORE, (store) => void store.clear());
  }

  async getMeta(): Promise<unknown | null> {
    const db = await this.open();
    const tx = db.transaction(META_STORE, 'readonly');
    const meta = await toPromise(tx.objectStore(META_STORE).get(META_KEY));
    return meta ?? null;
  }

  async setMeta(meta: unknown): Promise<void> {
    await this.write(META_STORE, (store) => void store.put(meta, META_KEY));
  }
}

/* --------------------------------------------------------------- 选择器 */

/**
 * 按 IndexedDB → localStorage → 内存的顺序挑选可用驱动。
 * 只做能力探测，不做写入探测；真正的写失败由仓储层向上报，UI 提示"本次未保存"。
 */
export function selectDriver(scope: Partial<Window> = globalThis as unknown as Window): StorageDriver {
  const factory = scope.indexedDB;
  if (factory !== undefined && factory !== null) {
    return new IndexedDbDriver(factory);
  }

  const storage = scope.localStorage;
  if (storage !== undefined && storage !== null) {
    return new LocalStorageDriver(storage);
  }

  return new MemoryDriver();
}
