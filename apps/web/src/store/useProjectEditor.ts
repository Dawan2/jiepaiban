/**
 * 编辑页的保存引擎（architecture §5「自动保存」：字段变更 2s 防抖；页面卸载强制 flush；
 * 保存失败阻断并提示）。PRD `FR-2-11`：字段失焦即保存，保存态在顶部栏可见。
 *
 * 本 hook 只管**草稿态与写盘时机**，不认识任何具体字段：调用方通过 {@link ProjectEditor.update}
 * 传入一个纯函数来改草稿。这样宫格编辑（WK3）与项目参数编辑可以共用同一套保存链路，
 * 互不侵入对方的组件。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoredProject } from '../adapters/persistence';

export type SaveState =
  /** 与库内一致，无待存改动。 */
  | 'saved'
  /** 有改动，防抖计时中。 */
  | 'dirty'
  /** 正在写盘。 */
  | 'saving'
  /** 写盘失败，改动仍在内存里。 */
  | 'error';

/** 默认防抖窗口（毫秒）。 */
export const AUTOSAVE_DEBOUNCE_MS = 2000;

export interface ProjectEditor {
  readonly draft: StoredProject | null;
  readonly saveState: SaveState;
  readonly error: string | null;
  /** 改草稿：传入纯函数，返回新项目。改完进入 `dirty` 并重启防抖。 */
  update(mutate: (project: StoredProject) => StoredProject): void;
  /**
   * 收下**已经由别的通道落库**的改动（生成结果回写，见 `store/generateResults.ts`）：
   * 只更新草稿，不置 `dirty`、不触发保存。
   *
   * 草稿必须跟上，否则用户随后的任意一次编辑都会把草稿里的旧值（`video_url: null`）
   * 写回库里，把刚落库的成片地址盖掉。但它不是用户的改动，保存态不该变成「未保存」。
   */
  patch(mutate: (project: StoredProject) => StoredProject): void;
  /** 手动保存（顶部栏「保存」按钮）：立即写盘，不等防抖。 */
  saveNow(): Promise<void>;
}

interface Options {
  debounceMs?: number;
  /** 写盘实现，通常是 `useProjects().save`。 */
  save(project: StoredProject): Promise<void>;
}

export function useProjectEditor(
  source: StoredProject | null,
  { save, debounceMs = AUTOSAVE_DEBOUNCE_MS }: Options,
): ProjectEditor {
  const [draft, setDraft] = useState<StoredProject | null>(source);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState<string | null>(null);

  // 用 ref 持有最新草稿与写盘实现，卸载/关页时的强制 flush 才能拿到最新值，
  // 也避免把 save 的函数身份变化牵进防抖 effect 里反复重启计时。
  const draftRef = useRef<StoredProject | null>(source);
  const dirtyRef = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // 只在**切换项目**时重置草稿，不跟着 source 的对象身份走：
  // 每次保存后仓储都会重读并产生新对象，若也跟着重置，正在输入的改动会被回滚。
  const sourceId = source?.id ?? null;
  useEffect(() => {
    setDraft(sourceRef.current);
    draftRef.current = sourceRef.current;
    dirtyRef.current = false;
    setSaveState('saved');
    setError(null);
  }, [sourceId]);

  const flush = useCallback(async () => {
    const pending = draftRef.current;
    if (pending === null || !dirtyRef.current) {
      return;
    }
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      await saveRef.current(pending);
      setSaveState('saved');
      setError(null);
    } catch (cause) {
      // 失败时把 dirty 放回去：改动还在内存里，下一次输入或手动保存会重试。
      dirtyRef.current = true;
      setSaveState('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const update = useCallback((mutate: (project: StoredProject) => StoredProject) => {
    // 草稿的同步发生在 effect 里，可能还没跑；此时直接以仓储读到的项目为基准，
    // 否则"页面已显示内容但草稿仍为 null"的那一帧里，用户的第一次输入会被静默丢掉。
    const current = draftRef.current ?? sourceRef.current;
    if (current === null) {
      return;
    }
    const next = mutate(current);
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    setSaveState('dirty');
  }, []);

  const patch = useCallback((mutate: (project: StoredProject) => StoredProject) => {
    const current = draftRef.current ?? sourceRef.current;
    if (current === null) {
      return;
    }
    const next = mutate(current);
    if (next === current) {
      return;
    }
    // 有意不动 dirtyRef 与 saveState：这份值已经在库里了。
    // 若此刻本就是 dirty（用户正在输入），那份 dirty 也要原样留着。
    draftRef.current = next;
    setDraft(next);
  }, []);

  // 防抖自动保存。
  useEffect(() => {
    if (saveState !== 'dirty') {
      return;
    }
    const timer = setTimeout(() => void flush(), debounceMs);
    return () => clearTimeout(timer);
  }, [saveState, draft, debounceMs, flush]);

  // 关页与卸载（含路由切换）时强制 flush，避免"改完就走"丢数据。
  useEffect(() => {
    const onBeforeUnload = () => void flush();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      void flush();
    };
  }, [flush]);

  const saveNow = useCallback(async () => {
    // 手动保存即使草稿"看起来干净"也照写，用户点了就该有确定的结果。
    dirtyRef.current = draftRef.current !== null;
    await flush();
  }, [flush]);

  // 草稿尚未同步时对外呈现仓储读到的项目，调用方无需再自己兜一层 null。
  return { draft: draft ?? source, saveState, error, update, patch, saveNow };
}

/** 顶部栏保存态文案（`FR-2-11`：保存态可见）。 */
export const SAVE_STATE_LABEL: Record<SaveState, string> = {
  saved: '已保存',
  dirty: '未保存',
  saving: '保存中…',
  error: '保存失败',
};
