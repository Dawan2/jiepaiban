/**
 * React 侧的接线：把 {@link createGenerateController} 挂到组件生命周期上。
 *
 * 视图状态走 `useSyncExternalStore`，控制器内部缓存快照引用，
 * 没有状态变化时返回同一个数组，不会把 React 拉进无限重渲染。
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Project } from '../domain/projects';
import {
  createGenerateController,
  type GenerateBoardState,
  type GenerateController,
  type GenerateControllerOptions,
} from './controller';

export type UseGenerateControllerOptions = Omit<GenerateControllerOptions, 'project'>;

export interface UseGenerateControllerResult {
  readonly controller: GenerateController;
  /** 5 个板位的视图状态，按板序。 */
  readonly states: readonly GenerateBoardState[];
}

export function useGenerateController(
  project: Project,
  options: UseGenerateControllerOptions = {},
): UseGenerateControllerResult {
  const controller = useMemo(
    () => createGenerateController({ project, ...options }),
    // 控制器与项目 1:1；options 只在首次挂载生效，避免每次渲染重建队列。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project],
  );

  useEffect(() => () => controller.dispose(), [controller]);

  const states = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );

  return { controller, states };
}
