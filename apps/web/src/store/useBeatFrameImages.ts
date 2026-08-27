/**
 * 编辑页读写一块板参考图的 hook（W4/IMAGE-STORE 对下游槽位的接口）。
 *
 * 分工与 `useProjectEditor` 一致：本 hook 只管**图片的读写与 object URL 生命周期**，
 * 不认识宫格 UI 的任何布局。WK3 做宫格编辑器时把 `slots[i].url` 挂到 `<img>`、
 * 把文件交给 `upload(order, file)` 即可，不要再写第二套图片读写。
 *
 * 关于 object URL：`URL.createObjectURL` 每次调用都会让文档持有一份 Blob 引用，
 * **不 revoke 就是内存泄漏**（切板、切项目各泄一批）。所以 URL 由本 hook 独占创建，
 * 并在覆盖 / 移除 / 切板 / 卸载四个时机全部回收；调用方只读 `url`，不要自己再造。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BeatIndex } from '../domain/beats';
import {
  framesForBeat,
  type FrameImageMeta,
  type FrameImageUsage,
  type FrameOrder,
} from '../adapters/images';
import { useFrameImageStore } from './FrameImagesProvider';

export type FrameImagesState = 'loading' | 'ready' | 'error';

export interface FrameImageSlot {
  /** 帧序（左→右 1–3，`RULE-7`）。 */
  readonly order: FrameOrder;
  /** 该帧位已有的参考图，未配图为 `null`。 */
  readonly image: FrameImageMeta | null;
  /** 可直接给 `<img src>` 的 object URL；由本 hook 负责回收。 */
  readonly url: string | null;
  /** 该帧位正在写盘 / 删除。 */
  readonly busy: boolean;
}

export interface BeatFrameImages {
  /** 长度 = 该板宫格数（B1–B4 = 3、B5 = 2），顺序恒为 1→3。 */
  readonly slots: readonly FrameImageSlot[];
  readonly state: FrameImagesState;
  /** 最近一次失败的人读原因（校验不通过 / 写盘失败）；成功后清空。 */
  readonly error: string | null;
  readonly usage: FrameImageUsage | null;
  /**
   * 存一张图（同帧位覆盖）。校验失败不抛，转为 {@link BeatFrameImages.error}，
   * 因为它的正常触发者是"用户选了个 PDF"这类可恢复的操作，不是程序缺陷。
   */
  upload(order: FrameOrder, file: File | Blob): Promise<void>;
  remove(order: FrameOrder): Promise<void>;
  reload(): Promise<void>;
}

interface Entry {
  readonly meta: FrameImageMeta;
  readonly url: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const hasObjectUrls = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

function createUrl(blob: Blob): string {
  // 没有 createObjectURL 的环境（老内核、部分测试环境）仍应能读到元数据，
  // 只是显示不了缩略图——不能因为缺个 API 就让整块板读取失败。
  return hasObjectUrls ? URL.createObjectURL(blob) : '';
}

function revokeUrl(url: string): void {
  if (url !== '' && hasObjectUrls) {
    URL.revokeObjectURL(url);
  }
}

export function useBeatFrameImages(projectId: string, beatIndex: BeatIndex): BeatFrameImages {
  const store = useFrameImageStore();
  const [entries, setEntries] = useState<ReadonlyMap<FrameOrder, Entry>>(new Map());
  const [state, setState] = useState<FrameImagesState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<FrameImageUsage | null>(null);
  const [busy, setBusy] = useState<readonly FrameOrder[]>([]);

  // 真实持有中的 URL 只认这一份：state 是异步的，回收时机（卸载、覆盖）等不了渲染。
  const urls = useRef(new Map<FrameOrder, string>());
  const alive = useRef(true);

  const trackUrl = useCallback((order: FrameOrder, url: string) => {
    const previous = urls.current.get(order);
    if (previous !== undefined && previous !== url) {
      revokeUrl(previous);
    }
    if (url === '') {
      urls.current.delete(order);
    } else {
      urls.current.set(order, url);
    }
  }, []);

  const revokeAll = useCallback(() => {
    for (const url of urls.current.values()) {
      revokeUrl(url);
    }
    urls.current.clear();
  }, []);

  const readSlot = useCallback(
    async (order: FrameOrder): Promise<Entry | null> => {
      const image = await store.get({ projectId, beatIndex, frameOrder: order });
      if (image === null) {
        return null;
      }
      const { blob, ...meta } = image;
      return { meta, url: createUrl(blob) };
    },
    [store, projectId, beatIndex],
  );

  const load = useCallback(async () => {
    setState((current) => (current === 'error' ? 'loading' : current));
    try {
      const metas = await store.listBeat(projectId, beatIndex);
      const loaded = await Promise.all(metas.map((meta) => readSlot(meta.frameOrder)));
      const next = new Map<FrameOrder, Entry>();
      metas.forEach((meta, i) => {
        const entry = loaded[i];
        if (entry !== undefined && entry !== null) {
          next.set(meta.frameOrder, entry);
        }
      });

      if (!alive.current) {
        // 已经卸载：刚建的 URL 没人会用，立刻还掉，别等 GC（它不会来）。
        for (const entry of next.values()) {
          revokeUrl(entry.url);
        }
        return;
      }

      revokeAll();
      for (const [order, entry] of next) {
        urls.current.set(order, entry.url);
      }
      setEntries(next);
      setUsage(await store.usage(projectId));
      setState('ready');
    } catch (cause) {
      if (alive.current) {
        setState('error');
        setError(message(cause));
      }
    }
  }, [store, projectId, beatIndex, readSlot, revokeAll]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      revokeAll();
    };
  }, [load, revokeAll]);

  const withBusy = useCallback(async (order: FrameOrder, run: () => Promise<void>) => {
    setBusy((current) => (current.includes(order) ? current : [...current, order]));
    try {
      await run();
      if (alive.current) {
        setError(null);
      }
    } catch (cause) {
      if (alive.current) {
        setError(message(cause));
      }
    } finally {
      if (alive.current) {
        setBusy((current) => current.filter((item) => item !== order));
      }
    }
  }, []);

  /** 只刷新一个帧位：整块板重读会把其他格子的 URL 也换掉，缩略图会无谓地闪一下。 */
  const refreshSlot = useCallback(
    async (order: FrameOrder) => {
      const entry = await readSlot(order);
      if (!alive.current) {
        if (entry !== null) {
          revokeUrl(entry.url);
        }
        return;
      }
      trackUrl(order, entry?.url ?? '');
      setEntries((current) => {
        const next = new Map(current);
        if (entry === null) {
          next.delete(order);
        } else {
          next.set(order, entry);
        }
        return next;
      });
      const nextUsage = await store.usage(projectId);
      if (alive.current) {
        setUsage(nextUsage);
      }
    },
    [readSlot, store, projectId, trackUrl],
  );

  const upload = useCallback(
    async (order: FrameOrder, file: File | Blob) => {
      await withBusy(order, async () => {
        await store.put({ projectId, beatIndex, frameOrder: order }, file);
        await refreshSlot(order);
      });
    },
    [withBusy, store, projectId, beatIndex, refreshSlot],
  );

  const remove = useCallback(
    async (order: FrameOrder) => {
      await withBusy(order, async () => {
        await store.remove({ projectId, beatIndex, frameOrder: order });
        await refreshSlot(order);
      });
    },
    [withBusy, store, projectId, beatIndex, refreshSlot],
  );

  const slots = useMemo<readonly FrameImageSlot[]>(
    () =>
      framesForBeat(beatIndex).map((order) => {
        const entry = entries.get(order);
        return {
          order,
          image: entry?.meta ?? null,
          url: entry === undefined || entry.url === '' ? null : entry.url,
          busy: busy.includes(order),
        };
      }),
    [beatIndex, entries, busy],
  );

  return { slots, state, error, usage, upload, remove, reload: load };
}
