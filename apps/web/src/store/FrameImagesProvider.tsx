/**
 * 把 {@link FrameImageStore} 包成上下文，供编辑页（及后续的成片页）共用一个实例。
 *
 * 为什么要单例：图片仓持有 IndexedDB 连接与配额视图，每个组件各建一个不但浪费，
 * 还会让"A 组件刚存的图 B 组件的配额还没看见"这类不一致有机会出现。
 *
 * 上下文缺失时 {@link useFrameImageStore} 直接抛错，而 {@link useOptionalFrameImageStore}
 * 返回 `null`——后者给 `ProjectsProvider` 用：它需要在删项目时顺手清图片，
 * 但**不应该**强制所有既有测试都套一层图片 Provider。
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createFrameImageStore, type FrameImageStore } from '../adapters/images';

const FrameImagesContext = createContext<FrameImageStore | null>(null);

/**
 * 默认时钟必须是模块级常量：写成默认参数里的内联箭头函数，每次渲染都是新身份，
 * 下面的 `useMemo` 会跟着重建 store，连接与状态被反复丢弃
 * （W2 槽位在 `ProjectsProvider` 上踩过这个坑，见 docs/work/w2-local-store.md §7）。
 */
const defaultNow = (): string => new Date().toISOString();

interface FrameImagesProviderProps {
  children: ReactNode;
  /** 测试注入内存图片仓；生产走 IndexedDB。 */
  store?: FrameImageStore;
  now?: () => string;
}

export function FrameImagesProvider({
  children,
  store: injected,
  now = defaultNow,
}: FrameImagesProviderProps) {
  const store = useMemo(() => injected ?? createFrameImageStore(now), [injected, now]);
  return <FrameImagesContext.Provider value={store}>{children}</FrameImagesContext.Provider>;
}

export function useFrameImageStore(): FrameImageStore {
  const store = useContext(FrameImagesContext);
  if (store === null) {
    throw new Error('useFrameImageStore 必须在 <FrameImagesProvider> 内使用');
  }
  return store;
}

/** 没有 Provider 时返回 `null`，调用方自行决定是否降级。 */
export function useOptionalFrameImageStore(): FrameImageStore | null {
  return useContext(FrameImagesContext);
}
