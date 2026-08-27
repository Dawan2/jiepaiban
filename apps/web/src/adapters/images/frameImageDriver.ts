/**
 * 节拍帧图片的存储驱动端口与两个实现（与 `persistence/drivers.ts` 同一套端口化思路）。
 *
 * | 实现 | 介质 | 用途 |
 * | --- | --- | --- |
 * | {@link IndexedDbFrameImageDriver} | IndexedDB 单库 `beatboard` | 浏览器唯一可行选项：图片是二进制且体积大 |
 * | {@link MemoryFrameImageDriver} | 进程内 Map | 单测与页面测试，永不落盘 |
 *
 * **没有 localStorage 兜底**：`localStorage` 只能存字符串，图片得转 base64（体积 +33%），
 * 而它的配额通常只有 5 MB——一张参考图就能撑爆。IndexedDB 不可用时本槽位的正确行为是
 * 明确告诉用户"此环境不能存参考图"，而不是塞进一个必然写爆的地方（见 {@link selectFrameImageDriver}）。
 *
 * **元数据与字节分两个 store**：列一块板 / 一个项目的图片清单时只读元数据表，
 * 不必把每张图的字节都反序列化进内存（那是「点开编辑页就吃掉几十 MB」级别的差别）。
 * 两表的写入与删除都在**同一个事务**里完成，因此不会出现"有元数据没字节"的半条记录。
 *
 * **存 ArrayBuffer 而不是 Blob**：Blob 的结构化克隆在 Safari 的 IndexedDB 上历史上有坑，
 * 且 jsdom 的 Blob 过不了 `structuredClone`（单测根本跑不起来）。字节 + MIME 完全等价，
 * 读回时 `new Blob([bytes], { type })` 即可还原，代价是零。
 */

import {
  FRAME_IMAGE_BYTES_STORE,
  FRAME_IMAGE_BY_BEAT_INDEX,
  FRAME_IMAGE_BY_PROJECT_INDEX,
  FRAME_IMAGE_META_STORE,
  done,
  openBeatboardDb,
  toPromise,
} from '../indexeddb/beatboardDb';

import type { ImageBytes } from './validation';

export type FrameImageStorageKind = 'indexeddb' | 'memory';

/** 落库的图片元数据（不含字节）。 */
export interface StoredFrameImageMeta {
  /** {@link encodeFrameImageKey} 的产物，两个 store 共用同一个主键。 */
  readonly key: string;
  readonly projectId: string;
  readonly beatIndex: number;
  readonly frameOrder: number;
  /** 原始文件名，仅用于界面显示与"这是哪张图"的辨认。 */
  readonly name: string;
  /** **以字节签名为准**的 MIME（不是浏览器声明的那个）。 */
  readonly type: string;
  readonly size: number;
  readonly savedAt: string;
}

export interface FrameImageDriver {
  readonly kind: FrameImageStorageKind;
  /** 覆盖式写入：元数据与字节同事务落库。 */
  put(meta: StoredFrameImageMeta, bytes: ImageBytes): Promise<void>;
  getMeta(key: string): Promise<StoredFrameImageMeta | null>;
  getBytes(key: string): Promise<ImageBytes | null>;
  listByProject(projectId: string): Promise<readonly StoredFrameImageMeta[]>;
  listByBeat(projectId: string, beatIndex: number): Promise<readonly StoredFrameImageMeta[]>;
  remove(keys: readonly string[]): Promise<void>;
  clear(): Promise<void>;
}

/** 存储不可用（例如隐私模式关掉了 IndexedDB）时的替身：读空、写即报错，绝不假装存住了。 */
export class UnavailableFrameImageDriver implements FrameImageDriver {
  readonly kind = 'memory' as const;

  constructor(private readonly reason = '当前浏览器环境不支持本地存储参考图（IndexedDB 不可用）') {}

  async put(): Promise<void> {
    throw new Error(this.reason);
  }

  async getMeta(): Promise<StoredFrameImageMeta | null> {
    return null;
  }

  async getBytes(): Promise<ImageBytes | null> {
    return null;
  }

  async listByProject(): Promise<readonly StoredFrameImageMeta[]> {
    return [];
  }

  async listByBeat(): Promise<readonly StoredFrameImageMeta[]> {
    return [];
  }

  async remove(): Promise<void> {}

  async clear(): Promise<void> {}
}

/* ------------------------------------------------------------------ 内存 */

export class MemoryFrameImageDriver implements FrameImageDriver {
  readonly kind = 'memory' as const;
  private readonly metas = new Map<string, StoredFrameImageMeta>();
  private readonly bytes = new Map<string, ImageBytes>();

  async put(meta: StoredFrameImageMeta, bytes: ImageBytes): Promise<void> {
    this.metas.set(meta.key, { ...meta });
    // 复制一份：调用方之后改自己的 buffer 不该影响"已存进去"的内容。
    this.bytes.set(meta.key, new Uint8Array(bytes));
  }

  async getMeta(key: string): Promise<StoredFrameImageMeta | null> {
    const meta = this.metas.get(key);
    return meta === undefined ? null : { ...meta };
  }

  async getBytes(key: string): Promise<ImageBytes | null> {
    const bytes = this.bytes.get(key);
    return bytes === undefined ? null : new Uint8Array(bytes);
  }

  async listByProject(projectId: string): Promise<readonly StoredFrameImageMeta[]> {
    return [...this.metas.values()].filter((meta) => meta.projectId === projectId).map((meta) => ({ ...meta }));
  }

  async listByBeat(projectId: string, beatIndex: number): Promise<readonly StoredFrameImageMeta[]> {
    const inProject = await this.listByProject(projectId);
    return inProject.filter((meta) => meta.beatIndex === beatIndex);
  }

  async remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      this.metas.delete(key);
      this.bytes.delete(key);
    }
  }

  async clear(): Promise<void> {
    this.metas.clear();
    this.bytes.clear();
  }
}

/* ------------------------------------------------------------- IndexedDB */

/**
 * 结构化克隆可能跨 realm，读回的 buffer 不保证 `instanceof ArrayBuffer`（jsdom 里就不是），
 * 所以只按"有没有 byteLength / 是不是视图"取值，并一律拷进一段自己的 buffer。
 */
function toBytes(raw: unknown): ImageBytes | null {
  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(new Uint8Array(raw.buffer as ArrayBuffer, raw.byteOffset, raw.byteLength));
  }
  if (typeof raw === 'object' && raw !== null && 'byteLength' in raw) {
    return new Uint8Array(raw as ArrayBuffer);
  }
  return null;
}

export class IndexedDbFrameImageDriver implements FrameImageDriver {
  readonly kind = 'indexeddb' as const;

  constructor(private readonly factory: IDBFactory) {}

  private open(): Promise<IDBDatabase> {
    return openBeatboardDb(this.factory);
  }

  async put(meta: StoredFrameImageMeta, bytes: ImageBytes): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([FRAME_IMAGE_META_STORE, FRAME_IMAGE_BYTES_STORE], 'readwrite');
    tx.objectStore(FRAME_IMAGE_META_STORE).put({ ...meta });
    // `bytes.slice()` 交出一段独立 buffer：Uint8Array 可能是某个大 buffer 的视图，
    // 直接存会把整个 buffer 都克隆进库。
    tx.objectStore(FRAME_IMAGE_BYTES_STORE).put({ key: meta.key, bytes: bytes.slice() });
    await done(tx);
  }

  async getMeta(key: string): Promise<StoredFrameImageMeta | null> {
    const db = await this.open();
    const tx = db.transaction(FRAME_IMAGE_META_STORE, 'readonly');
    const meta = await toPromise(tx.objectStore(FRAME_IMAGE_META_STORE).get(key));
    return (meta as StoredFrameImageMeta | undefined) ?? null;
  }

  async getBytes(key: string): Promise<ImageBytes | null> {
    const db = await this.open();
    const tx = db.transaction(FRAME_IMAGE_BYTES_STORE, 'readonly');
    const record = await toPromise(tx.objectStore(FRAME_IMAGE_BYTES_STORE).get(key));
    if (record === undefined || record === null) {
      return null;
    }
    return toBytes((record as { bytes: unknown }).bytes);
  }

  private async listBy(index: string, query: IDBValidKey): Promise<readonly StoredFrameImageMeta[]> {
    const db = await this.open();
    const tx = db.transaction(FRAME_IMAGE_META_STORE, 'readonly');
    const metas = await toPromise(
      tx.objectStore(FRAME_IMAGE_META_STORE).index(index).getAll(IDBKeyRange.only(query)),
    );
    return metas as readonly StoredFrameImageMeta[];
  }

  async listByProject(projectId: string): Promise<readonly StoredFrameImageMeta[]> {
    return this.listBy(FRAME_IMAGE_BY_PROJECT_INDEX, projectId);
  }

  async listByBeat(projectId: string, beatIndex: number): Promise<readonly StoredFrameImageMeta[]> {
    return this.listBy(FRAME_IMAGE_BY_BEAT_INDEX, [projectId, beatIndex]);
  }

  async remove(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    const db = await this.open();
    const tx = db.transaction([FRAME_IMAGE_META_STORE, FRAME_IMAGE_BYTES_STORE], 'readwrite');
    const metaStore = tx.objectStore(FRAME_IMAGE_META_STORE);
    const bytesStore = tx.objectStore(FRAME_IMAGE_BYTES_STORE);
    for (const key of keys) {
      metaStore.delete(key);
      bytesStore.delete(key);
    }
    await done(tx);
  }

  async clear(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([FRAME_IMAGE_META_STORE, FRAME_IMAGE_BYTES_STORE], 'readwrite');
    tx.objectStore(FRAME_IMAGE_META_STORE).clear();
    tx.objectStore(FRAME_IMAGE_BYTES_STORE).clear();
    await done(tx);
  }
}

/** 有 IndexedDB 就用它，没有就用明确报错的替身（理由见文件头）。 */
export function selectFrameImageDriver(
  scope: Partial<Window> = globalThis as unknown as Window,
): FrameImageDriver {
  const factory = scope.indexedDB;
  if (factory !== undefined && factory !== null) {
    return new IndexedDbFrameImageDriver(factory);
  }
  return new UnavailableFrameImageDriver();
}
