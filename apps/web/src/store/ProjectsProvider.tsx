/**
 * 应用层编排：把仓储包成 React 上下文，供三个路由页共用（architecture §4 `state/`）。
 *
 * 页面只调用这里的命令（新建 / 复用 / 归档 / 删除 / 导入导出 / 保存），
 * 不直接碰 IndexedDB，也不自己拼落库结构——结构锁只在仓储与 `projectFactory` 两处把关。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  archiveFileName,
  createLocalRepository,
  importFromText,
  serializeEnvelope,
  type ImportMode,
  type ProjectRepository,
  type ProjectSummary,
  type StoredProject,
} from '../adapters/persistence';
import {
  createEmptyProject,
  randomProjectId,
  reuseProject,
  setArchived,
  type IdGen,
} from './projectFactory';
import { useOptionalFrameImageStore } from './FrameImagesProvider';
import type { NewProjectInput } from '../domain/projects';

export type LoadState = 'loading' | 'ready' | 'error';

interface ProjectsContextValue {
  readonly summaries: readonly ProjectSummary[];
  readonly state: LoadState;
  readonly error: string | null;
  readonly repository: ProjectRepository;
  /** 强制重读列表（导入后、跨页返回时用）。 */
  refresh(): Promise<void>;
  createProject(input: NewProjectInput): Promise<StoredProject>;
  /** 复用（PRD §7.2）：复制结构与参数、清空画面文案与生成结果。 */
  reuse(id: string): Promise<StoredProject>;
  archive(id: string, archived: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  load(id: string): Promise<StoredProject | null>;
  save(project: StoredProject): Promise<void>;
  /** 导出全部项目为 JSON 备份文本。 */
  exportArchive(): Promise<{ fileName: string; text: string }>;
  /** 从 JSON 备份文本导入，返回导入的项目数。 */
  importArchive(text: string, mode?: ImportMode): Promise<number>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 默认时钟必须是模块级常量：写成默认参数里的内联箭头函数，每次渲染都是新身份，
 * 会让下面的 `repository` / `refresh` 跟着重建，`refresh` 的 effect 于是反复触发，
 * 形成"读库 → setState → 重渲染 → 又读库"的死循环（生产环境不传这些 prop，正好踩中）。
 */
const defaultNow = (): string => new Date().toISOString();

interface ProjectsProviderProps {
  children: ReactNode;
  /** 测试注入内存仓储；生产走 IndexedDB → localStorage 兜底。 */
  repository?: ProjectRepository;
  now?: () => string;
  newId?: IdGen;
}

export function ProjectsProvider({
  children,
  repository: injected,
  now = defaultNow,
  newId = randomProjectId,
}: ProjectsProviderProps) {
  const repository = useMemo(() => injected ?? createLocalRepository(now), [injected, now]);
  // 参考图与项目分两个仓（图片不进项目记录），删项目时必须顺手清图片，否则留下孤儿字节。
  // 没有 <FrameImagesProvider> 时为 null：既有测试不必为此套一层 Provider。
  const frameImages = useOptionalFrameImageStore();
  const [summaries, setSummaries] = useState<readonly ProjectSummary[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await repository.list();
      setSummaries(next);
      setState('ready');
      setError(null);
    } catch (cause) {
      // 结构锁断言失败不静默：停在错误态并提示，避免把违规数据喂进 UI。
      setState('error');
      setError(message(cause));
    }
  }, [repository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<ProjectsContextValue>(() => {
    const save = async (project: StoredProject) => {
      await repository.save({ ...project, updatedAt: now() });
      await refresh();
    };

    return {
      summaries,
      state,
      error,
      repository,
      refresh,
      load: (id) => repository.load(id),
      save,

      async createProject(input) {
        const project = createEmptyProject(input, newId(), now());
        await repository.save(project);
        await refresh();
        return project;
      },

      async reuse(id) {
        const source = await repository.load(id);
        if (source === null) {
          throw new Error(`要复用的项目不存在：${id}`);
        }
        const copy = reuseProject(source, newId(), now());
        await repository.save(copy);
        await refresh();
        return copy;
      },

      async archive(id, archived) {
        const project = await repository.load(id);
        if (project === null) {
          throw new Error(`要归档的项目不存在：${id}`);
        }
        await repository.save(setArchived(project, archived, now()));
        await refresh();
      },

      async remove(id) {
        // 先清图片再删项目：反过来一旦图片清理失败，项目记录已经没了，
        // 那些字节就再也没有入口能找到它们。这个顺序下失败是"整件事没做成"，用户可重试。
        await frameImages?.removeProject(id);
        await repository.remove(id);
        await refresh();
      },

      async exportArchive() {
        const envelope = await repository.exportAll();
        return { fileName: archiveFileName(envelope.savedAt), text: serializeEnvelope(envelope) };
      },

      async importArchive(text, mode: ImportMode = 'merge') {
        const count = await importFromText(repository, text, mode);
        await refresh();
        return count;
      },
    };
  }, [summaries, state, error, repository, refresh, now, newId, frameImages]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsContextValue {
  const context = useContext(ProjectsContext);
  if (context === null) {
    throw new Error('useProjects 必须在 <ProjectsProvider> 内使用');
  }
  return context;
}

/** 单个项目的读取态，供编辑页与成片页共用。 */
export interface ProjectResource {
  readonly project: StoredProject | null;
  readonly state: LoadState;
  readonly error: string | null;
  reload(): Promise<void>;
}

export function useProject(id: string): ProjectResource {
  // 直接依赖 repository（身份稳定），而不是上下文里的 load：
  // 后者每次列表刷新都换身份，会让本 hook 重新进入 loading 态，
  // 从而在每次保存后把整个编辑区卸载重建（输入框失焦、光标丢失）。
  const { repository } = useProjects();
  const [project, setProject] = useState<StoredProject | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setState('loading');
    try {
      const found = await repository.load(id);
      if (!alive.current) {
        return;
      }
      setProject(found);
      setState('ready');
      setError(null);
    } catch (cause) {
      if (!alive.current) {
        return;
      }
      setState('error');
      setError(message(cause));
    }
  }, [id, repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { project, state, error, reload };
}
