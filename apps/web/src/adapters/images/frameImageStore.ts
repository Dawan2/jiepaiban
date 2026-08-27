/**
 * `FrameImageStore` —— 节拍帧参考图的唯一入口（W4/IMAGE-STORE）。
 *
 * 职责：坐标编码 + 准入校验 + 配额，然后把字节交给 {@link FrameImageDriver}。
 * 与 `LocalRepository` 的关系是"平行的两个仓"：项目结构走 `projects` store，
 * 图片字节走 `frameImage*` store，**图片不进项目记录**。这不是洁癖：
 *
 * - 项目记录每次字段改动都要整条重写（自动保存 2s 一次），把几 MB 的图片焊在里面，
 *   等于每敲几个字就搬一遍所有图片；
 * - 导出备份是 JSON，图片留在项目记录里就得 base64 进文本，一个项目的备份能到几十 MB。
 *
 * **落库的是字节，不是 object URL**。`blob:` URL 的生命周期绑在当页文档上，
 * 刷新即失效——存 URL 等于存了一条刷新后必然 404 的引用。所以本仓存 `ArrayBuffer`，
 * 由读取方在需要展示时才 `URL.createObjectURL`（并负责 revoke，见 `useBeatFrameImages`）。
 */

import type { BeatIndex } from '../../domain/beats';
import type { Clock } from '../persistence';
import {
  MemoryFrameImageDriver,
  selectFrameImageDriver,
  type FrameImageDriver,
  type FrameImageStorageKind,
  type StoredFrameImageMeta,
} from './frameImageDriver';
import {
  assertFrameImageKey,
  decodeFrameImageKey,
  encodeFrameImageKey,
  framesForBeat,
  type FrameImageKey,
  type FrameOrder,
} from './frameImageKey';
import {
  MAX_PROJECT_IMAGE_BYTES,
  assertProjectQuota,
  readBytes,
  validateImageBytes,
  type AllowedImageType,
} from './validation';

/** 一张已入库参考图的元信息（坐标 + 文件信息），不含字节。 */
export interface FrameImageMeta extends FrameImageKey {
  readonly name: string;
  /** 以字节签名判定的真实 MIME。 */
  readonly type: AllowedImageType;
  readonly size: number;
  readonly savedAt: string;
}

/** 元信息 + 可直接喂给 `<img>` / `createObjectURL` 的 Blob。 */
export interface FrameImage extends FrameImageMeta {
  readonly blob: Blob;
}

/** 项目图片占用情况（UI 展示"已用 x / 上限 y"）。 */
export interface FrameImageUsage {
  readonly count: number;
  readonly bytes: number;
  readonly limitBytes: number;
  readonly remainingBytes: number;
}

const systemClock: Clock = () => new Date().toISOString();

/** 落库元数据 → 公开元信息；坐标不合法的脏记录返回 `null` 由调用方跳过。 */
function toMeta(stored: StoredFrameImageMeta): FrameImageMeta | null {
  const key = decodeFrameImageKey(stored.key);
  if (key === null) {
    return null;
  }
  return {
    ...key,
    name: stored.name,
    type: stored.type as AllowedImageType,
    size: stored.size,
    savedAt: stored.savedAt,
  };
}

const byFrameOrder = (a: FrameImageMeta, b: FrameImageMeta): number => a.frameOrder - b.frameOrder;

export class FrameImageStore {
  constructor(
    private readonly driver: FrameImageDriver,
    private readonly now: Clock = systemClock,
  ) {}

  get storageKind(): FrameImageStorageKind {
    return this.driver.kind;
  }

  /**
   * 存一张参考图（同坐标覆盖）。
   *
   * @param file 用户选中的 `File`（或任意 Blob；无 `name` 时按坐标生成一个）。
   * @throws {FrameImageError} 坐标非法 / 非图片 / 超单图上限 / 超项目配额。原图不会被落库。
   */
  async put(key: FrameImageKey, file: Blob & { readonly name?: string }): Promise<FrameImageMeta> {
    const encoded = encodeFrameImageKey(key);
    const bytes = await readBytes(file);
    const type = validateImageBytes(bytes, file.type);

    const [usage, existing] = await Promise.all([this.usage(key.projectId), this.driver.getMeta(encoded)]);
    assertProjectQuota(usage.bytes, existing?.size ?? 0, bytes.length);

    const stored: StoredFrameImageMeta = {
      key: encoded,
      projectId: key.projectId,
      beatIndex: key.beatIndex,
      frameOrder: key.frameOrder,
      name: file.name ?? `B${key.beatIndex}-F${key.frameOrder}`,
      type,
      size: bytes.length,
      savedAt: this.now(),
    };
    await this.driver.put(stored, bytes);

    const meta = toMeta(stored);
    if (meta === null) {
      throw new Error(`帧图元数据自校验失败：${encoded}`);
    }
    return meta;
  }

  async getMeta(key: FrameImageKey): Promise<FrameImageMeta | null> {
    const stored = await this.driver.getMeta(encodeFrameImageKey(key));
    return stored === null ? null : toMeta(stored);
  }

  /** 读出图片本体。字节在库里，因此**刷新后照样读得到**——这正是本槽位的重点。 */
  async get(key: FrameImageKey): Promise<FrameImage | null> {
    const encoded = encodeFrameImageKey(key);
    const [stored, bytes] = await Promise.all([
      this.driver.getMeta(encoded),
      this.driver.getBytes(encoded),
    ]);
    if (stored === null || bytes === null) {
      return null;
    }
    const meta = toMeta(stored);
    if (meta === null) {
      return null;
    }
    return { ...meta, blob: new Blob([bytes], { type: meta.type }) };
  }

  /** 一块板的参考图清单，按帧序升序；只读元数据表，不加载图片字节。 */
  async listBeat(projectId: string, beatIndex: BeatIndex): Promise<readonly FrameImageMeta[]> {
    const stored = await this.driver.listByBeat(projectId, beatIndex);
    return stored
      .map((item) => toMeta(item))
      .filter((meta): meta is FrameImageMeta => meta !== null)
      .sort(byFrameOrder);
  }

  /** 整个项目的参考图清单（按板序、帧序升序）。 */
  async listProject(projectId: string): Promise<readonly FrameImageMeta[]> {
    const stored = await this.driver.listByProject(projectId);
    return stored
      .map((item) => toMeta(item))
      .filter((meta): meta is FrameImageMeta => meta !== null)
      .sort((a, b) => a.beatIndex - b.beatIndex || byFrameOrder(a, b));
  }

  async remove(key: FrameImageKey): Promise<void> {
    await this.driver.remove([encodeFrameImageKey(key)]);
  }

  /** 清掉一块板的全部参考图（清空该板画面时用）。 */
  async removeBeat(projectId: string, beatIndex: BeatIndex): Promise<void> {
    const stored = await this.driver.listByBeat(projectId, beatIndex);
    await this.driver.remove(stored.map((item) => item.key));
  }

  /**
   * 清掉一个项目的全部参考图。
   * 删项目时必须调用：图片不在项目记录里，删记录带不走它们，留下就是白占配额的孤儿。
   */
  async removeProject(projectId: string): Promise<void> {
    const stored = await this.driver.listByProject(projectId);
    await this.driver.remove(stored.map((item) => item.key));
  }

  async usage(projectId: string): Promise<FrameImageUsage> {
    const stored = await this.driver.listByProject(projectId);
    const bytes = stored.reduce((total, item) => total + item.size, 0);
    return {
      count: stored.length,
      bytes,
      limitBytes: MAX_PROJECT_IMAGE_BYTES,
      remainingBytes: Math.max(0, MAX_PROJECT_IMAGE_BYTES - bytes),
    };
  }

  async clear(): Promise<void> {
    await this.driver.clear();
  }

  /** 该板的帧位清单（宫格锁推导：B1–B4 三格、B5 两格）。 */
  framesFor(beatIndex: BeatIndex): readonly FrameOrder[] {
    return framesForBeat(beatIndex);
  }

  /** 坐标自检，供调用方在构造 UI 槽位时提前拦住越界帧。 */
  assertKey(key: FrameImageKey): FrameImageKey {
    return assertFrameImageKey(key);
  }
}

/** 浏览器环境下的默认图片仓（IndexedDB；不可用时写入即明确报错）。 */
export function createFrameImageStore(now: Clock = systemClock): FrameImageStore {
  return new FrameImageStore(selectFrameImageDriver(), now);
}

/** 测试与页面测试用的内存图片仓。 */
export function createMemoryFrameImageStore(now: Clock = systemClock): FrameImageStore {
  return new FrameImageStore(new MemoryFrameImageDriver(), now);
}
