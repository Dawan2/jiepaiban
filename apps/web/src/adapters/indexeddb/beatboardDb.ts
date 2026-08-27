/**
 * 单库 `beatboard` 的**唯一**打开点与 object store 清单（架构 tech-stack §2.1 存储布局）。
 *
 * 为什么必须集中：IndexedDB 的版本号是**库级**的，不是 store 级的。
 * 若项目驱动按 v1 打开、节拍帧图片仓按 v2 打开同一个库，后开的那一侧必然拿到
 * `VersionError`（或把先开的连接卡在 `blocked`）。所以库名、版本号、store 建表
 * 全部收在本文件，任何槽位要加 store 只改这里的 {@link DB_VERSION} 与 {@link upgrade}。
 *
 * 连接按 `IDBFactory` 实例缓存（{@link connections}）：同一个 factory 上的所有调用方
 * 共用一条连接，于是"一侧正在升级、另一侧被自己挡住"这种自锁死不可能发生。
 */

export const DB_NAME = 'beatboard';

/**
 * 库版本。
 *
 * | 版本 | 槽位 | 变更 |
 * | --- | --- | --- |
 * | 1 | W2/WK-STORE | 建 `projects`、`meta` |
 * | 2 | W4/IMAGE-STORE | 建 `frameImageMeta`（含两个索引）、`frameImageBytes` |
 */
export const DB_VERSION = 2;

/** 项目记录，主键 `id`，一条即完整结构（含 5 块板）。 */
export const PROJECT_STORE = 'projects';

/** 落库封套（`schemaVersion` / `savedAt`），固定键。 */
export const META_STORE = 'meta';

/** 节拍帧图片的元数据，主键为编码后的 `项目+板+帧` 复合键。 */
export const FRAME_IMAGE_META_STORE = 'frameImageMeta';

/** 节拍帧图片的字节，主键同上。与元数据分表，列清单时不必把图片字节读进内存。 */
export const FRAME_IMAGE_BYTES_STORE = 'frameImageBytes';

/** 按项目查图片（删项目、算配额）。 */
export const FRAME_IMAGE_BY_PROJECT_INDEX = 'byProject';

/** 按项目 + 板序查图片（编辑页一次读一块板的全部帧）。 */
export const FRAME_IMAGE_BY_BEAT_INDEX = 'byBeat';

export function toPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
  });
}

export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务被中止'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'));
  });
}

/**
 * 建表：每个 store 都先判存在再建，因此从 v1 老库升上来只补缺的那几个，
 * 已有数据一条不动（`onupgradeneeded` 里不做数据搬迁，故无需 `oldVersion` 分支）。
 */
function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(PROJECT_STORE)) {
    db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(META_STORE)) {
    db.createObjectStore(META_STORE);
  }
  if (!db.objectStoreNames.contains(FRAME_IMAGE_META_STORE)) {
    const store = db.createObjectStore(FRAME_IMAGE_META_STORE, { keyPath: 'key' });
    store.createIndex(FRAME_IMAGE_BY_PROJECT_INDEX, 'projectId');
    store.createIndex(FRAME_IMAGE_BY_BEAT_INDEX, ['projectId', 'beatIndex']);
  }
  if (!db.objectStoreNames.contains(FRAME_IMAGE_BYTES_STORE)) {
    db.createObjectStore(FRAME_IMAGE_BYTES_STORE, { keyPath: 'key' });
  }
}

const connections = new WeakMap<IDBFactory, Promise<IDBDatabase>>();

/** 打开（或复用）`beatboard` 连接。同一 factory 只会真正 open 一次。 */
export function openBeatboardDb(factory: IDBFactory): Promise<IDBDatabase> {
  const cached = connections.get(factory);
  if (cached !== undefined) {
    return cached;
  }

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打开 IndexedDB 失败'));
    // 旧标签页还持着低版本连接时升级会被挡住。宁可明确报错让用户去关标签页，
    // 也不要静默挂在那里等——挂住的表现是"整个应用读不出任何项目"。
    request.onblocked = () =>
      reject(new Error('本地数据库正在被其他标签页占用，请关闭本站的其他标签页后重试'));
  }).catch((cause: unknown) => {
    // 失败的连接不留在缓存里，否则一次瞬时失败会把整个会话钉死。
    connections.delete(factory);
    throw cause;
  });

  connections.set(factory, opening);
  return opening;
}

/** 测试用：丢弃缓存的连接（不删库）。 */
export function forgetBeatboardDb(factory: IDBFactory): void {
  connections.delete(factory);
}
