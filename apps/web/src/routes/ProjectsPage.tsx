/**
 * 项目列表页（路由 `/`，PRD 5.1.3）。
 *
 * 数据来自本地仓储（IndexedDB，不可用时回落 localStorage），不再有演示数据。
 * 卡片操作：复用（PRD §7.2 复制结构与参数、清空画面文案）、归档、删除。
 * 已生成视频的项目删除前必须二次确认——本地库删了就找不回来。
 */

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { MainNav } from '../components/MainNav';
import { NewProjectForm } from '../components/NewProjectForm';
import { BEAT_INDEXES } from '../domain/beats';
import type { NewProjectInput } from '../domain/projects';
import type { ProjectSummary } from '../adapters/persistence';
import { useProjects } from '../store/ProjectsProvider';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

interface CardProps {
  summary: ProjectSummary;
  busy: boolean;
  onReuse(): void;
  onArchive(): void;
  onDelete(): void;
}

function ProjectCard({ summary, busy, onReuse, onArchive, onDelete }: CardProps) {
  return (
    <li className={`card${summary.archived ? ' card--archived' : ''}`}>
      <Link to={`/p/${summary.id}`} className="card__link">
        <h2 className="card__title">{summary.name}</h2>
        <dl className="card__meta">
          <div>
            <dt>题材</dt>
            <dd>{summary.genre}</dd>
          </div>
          <div>
            <dt>画幅</dt>
            <dd>{summary.aspectRatio}</dd>
          </div>
          <div>
            <dt>更新</dt>
            <dd>{formatDate(summary.updatedAt)}</dd>
          </div>
        </dl>
        <div className="card__footer">
          <span
            className="dots"
            aria-label={`五节拍完成度 ${summary.filledBeats}/${summary.totalBeats}`}
          >
            {BEAT_INDEXES.map((index) => (
              <span
                key={index}
                className={`dots__dot${index <= summary.filledBeats ? ' dots__dot--on' : ''}`}
              />
            ))}
          </span>
          <span className="card__count">
            {summary.filledBeats}/{summary.totalBeats} 节拍已填
            {summary.videoCount > 0 && ` · ${summary.videoCount} 段已生成`}
          </span>
        </div>
      </Link>

      <div className="card__actions">
        <button type="button" className="btn btn--small" onClick={onReuse} disabled={busy}>
          复用
        </button>
        <button type="button" className="btn btn--small" onClick={onArchive} disabled={busy}>
          {summary.archived ? '取消归档' : '归档'}
        </button>
        <button type="button" className="btn btn--small btn--danger" onClick={onDelete} disabled={busy}>
          删除
        </button>
      </div>
    </li>
  );
}

/** 删除确认（仅当项目已有生成视频时出现，PRD 本地库不可恢复）。 */
function DeleteConfirm({
  summary,
  onConfirm,
  onCancel,
}: {
  summary: ProjectSummary;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <div className="panel panel--danger" role="alertdialog" aria-label="确认删除项目">
      <h2 className="panel__title">删除《{summary.name}》？</h2>
      <p className="panel__desc">
        该项目已有 {summary.videoCount} 段生成视频。删除后本地数据无法恢复，建议先导出备份。
      </p>
      <div className="form__actions">
        <button type="button" className="btn btn--danger" onClick={onConfirm}>
          确认删除
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const {
    summaries,
    state,
    error,
    createProject,
    reuse,
    archive,
    remove,
    exportArchive,
    importArchive,
  } = useProjects();

  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await task();
    } catch (cause) {
      setActionError(`${label}失败：${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = (input: NewProjectInput) =>
    void run('新建项目', async () => {
      await createProject(input);
      setCreating(false);
      setNotice(`已创建《${input.name}》，5 块节拍板已就位。`);
    });

  const handleDelete = (summary: ProjectSummary) => {
    // 有视频才二次确认；空项目直接删，不打扰用户。
    if (summary.videoCount > 0) {
      setPendingDelete(summary);
      return;
    }
    void run('删除项目', async () => {
      await remove(summary.id);
      setNotice(`已删除《${summary.name}》。`);
    });
  };

  const handleExport = () =>
    void run('导出备份', async () => {
      const { fileName, text } = await exportArchive();
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`已导出备份 ${fileName}。`);
    });

  const handleImport = (file: File) =>
    void run('导入备份', async () => {
      const count = await importArchive(await file.text());
      setNotice(`已从备份导入 ${count} 个项目。`);
    });

  const visible = summaries.filter((summary) => summary.archived === showArchived);
  const archivedCount = summaries.filter((summary) => summary.archived).length;

  return (
    <AppLayout
      title="项目"
      subtitle="填五张节拍卡，出五段视频，组一集短剧"
      nav={<MainNav />}
      actions={
        <>
          <button type="button" className="btn" onClick={handleExport} disabled={busy}>
            导出备份
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            导入备份
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            aria-label="导入备份文件"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file !== undefined) {
                handleImport(file);
              }
            }}
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setCreating(true)}
            disabled={busy}
          >
            新建项目
          </button>
        </>
      }
    >
      {state === 'loading' && <p className="empty">读取本地项目库…</p>}

      {state === 'error' && (
        <div className="panel panel--danger">
          <h2 className="panel__title">本地项目库读取失败</h2>
          <p className="panel__desc">{error}</p>
        </div>
      )}

      {actionError !== null && (
        <p className="notice notice--danger" role="alert">
          {actionError}
        </p>
      )}
      {notice !== null && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {creating && (
        <NewProjectForm onSubmit={handleCreate} onCancel={() => setCreating(false)} pending={busy} />
      )}

      {pendingDelete !== null && (
        <DeleteConfirm
          summary={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() =>
            void run('删除项目', async () => {
              await remove(pendingDelete.id);
              setNotice(`已删除《${pendingDelete.name}》。`);
              setPendingDelete(null);
            })
          }
        />
      )}

      {state === 'ready' && (
        <>
          {archivedCount > 0 && (
            <div className="toolbar">
              <button
                type="button"
                className="btn btn--small"
                onClick={() => setShowArchived((prev) => !prev)}
                aria-pressed={showArchived}
              >
                {showArchived ? `返回进行中项目` : `查看归档（${archivedCount}）`}
              </button>
            </div>
          )}

          {visible.length === 0 ? (
            <p className="empty">
              {showArchived
                ? '归档里还没有项目。'
                : '还没有项目。点右上「新建项目」，系统会自动落 5 块锁定节拍板。'}
            </p>
          ) : (
            <ul className="cards">
              {visible.map((summary) => (
                <ProjectCard
                  key={summary.id}
                  summary={summary}
                  busy={busy}
                  onReuse={() =>
                    void run('复用项目', async () => {
                      const copy = await reuse(summary.id);
                      setNotice(`已复用为《${copy.name}》：结构与参数已继承，画面文案已清空。`);
                    })
                  }
                  onArchive={() =>
                    void run('归档项目', async () => {
                      await archive(summary.id, !summary.archived);
                    })
                  }
                  onDelete={() => handleDelete(summary)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </AppLayout>
  );
}
