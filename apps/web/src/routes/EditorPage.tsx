/**
 * 节拍编辑页（路由 `/p/:id`，PRD 5.2）。
 *
 * 本槽位（W2/WK-STORE）接的是**持久化**：项目从本地库读出，字段改动经 2s 防抖自动保存，
 * 顶部栏常驻保存态与手动「保存」按钮，离开页面/关闭标签前强制落盘（`FR-2-11`）。
 *
 * 边界：宫格（节拍帧）编辑器与 Prompt 实时组装**不在本槽位**（分别属 WK3 / WK2）。
 * 那两块只需把改动交给 `editor.update()`，就自动共享这里的防抖、保存态与落盘链路，
 * 无需再写一套保存逻辑。下面已编辑的两个字段（节拍名称 / 备注）均为「不进 Prompt」字段。
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { BeatNav } from '../components/BeatNav';
import { FrameImagePanel } from '../components/FrameImagePanel';
import { BEAT_COUNT, activeCells, type BeatIndex } from '../domain/beats';
import { useProject, useProjects } from '../store/ProjectsProvider';
import { SAVE_STATE_LABEL, useProjectEditor } from '../store/useProjectEditor';
import type { StoredProject } from '../adapters/persistence';
import { ProjectMissing } from './ProjectMissing';

/** 单集总时长 = 5 板之和（`FR-2-09`：落在 70–90s 内为正常态，超出为警示态）。 */
function totalDuration(project: StoredProject): number {
  return project.beats.reduce((total, beat) => total + (beat.durationSec ?? 0), 0);
}

export function EditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { project, state } = useProject(id);
  const { save } = useProjects();
  const editor = useProjectEditor(project, { save });
  const [activeIndex, setActiveIndex] = useState<BeatIndex>(1);

  if (state === 'loading') {
    return (
      <AppLayout title="节拍编辑" nav={<p className="nav__caption">读取中…</p>}>
        <p className="empty">读取项目…</p>
      </AppLayout>
    );
  }

  const draft = editor.draft;
  if (project === null || draft === null) {
    return <ProjectMissing id={id} />;
  }

  const beat = draft.beats.find((item) => item.index === activeIndex);
  const total = totalDuration(draft);
  const durationWarning = total < 70 || total > 90;

  const updateBeat = (mutate: (beat: StoredProject['beats'][number]) => StoredProject['beats'][number]) =>
    editor.update((current) => ({
      ...current,
      beats: current.beats.map((item) => (item.index === activeIndex ? mutate(item) : item)),
    }));

  return (
    <AppLayout
      title="节拍编辑"
      subtitle={draft.name}
      nav={
        <>
          <p className="nav__caption">五节拍（固定 {BEAT_COUNT} 项）</p>
          <BeatNav
            beats={draft.beats}
            activeIndex={activeIndex}
            onSelect={(index) => setActiveIndex(index as BeatIndex)}
          />
          <Link to="/" className="nav__back">
            返回项目列表
          </Link>
        </>
      }
      actions={
        <>
          <span
            className={`savestate savestate--${editor.saveState}`}
            role="status"
            aria-label={`保存状态：${SAVE_STATE_LABEL[editor.saveState]}`}
          >
            {SAVE_STATE_LABEL[editor.saveState]}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => void editor.saveNow()}
            disabled={editor.saveState === 'saving'}
          >
            保存
          </button>
          <Link to={`/p/${draft.id}/export`} className="btn btn--primary">
            成片
          </Link>
        </>
      }
    >
      {editor.error !== null && (
        <p className="notice notice--danger" role="alert">
          保存失败：{editor.error}（改动仍在本页，请重试）
        </p>
      )}

      <p className={`notice${durationWarning ? ' notice--warn' : ''}`}>
        单集总时长 {total} 秒 · {BEAT_COUNT} 板
        {durationWarning ? '（建议 70–90 秒）' : ''}
      </p>

      {beat !== undefined && (
        <div className="editor">
          <section className="panel" aria-labelledby="beat-card-title">
            <h2 id="beat-card-title" className="panel__title">
              节拍{activeIndex}· {beat.name}
            </h2>
            <p className="panel__desc">{beat.role}</p>

            <div className="field">
              <label className="field__label" htmlFor="beat-name">
                节拍名称
              </label>
              <input
                id="beat-name"
                className="field__input"
                aria-describedby="beat-name-hint"
                value={beat.name}
                onChange={(event) => updateBeat((item) => ({ ...item, name: event.target.value }))}
                onBlur={() => void editor.saveNow()}
              />
              <span id="beat-name-hint" className="field__hint">
                仅用于导航标识，不进 Prompt
              </span>
            </div>

            <dl className="fields">
              <div>
                <dt>剧情概要</dt>
                <dd>{beat.summary === '' ? '未填' : beat.summary}</dd>
              </div>
              <div>
                <dt>情绪基调</dt>
                <dd>{beat.tone ?? '未选'}</dd>
              </div>
              <div>
                <dt>画面宫格</dt>
                <dd>
                  {beat.gridSize} 宫格（已填 {activeCells(beat).filter((cell) => cell.description.trim() !== '').length}
                  /{beat.gridSize}）
                </dd>
              </div>
              <div>
                <dt>时长</dt>
                <dd>{beat.durationSec === null ? '未填' : `${beat.durationSec} 秒`}</dd>
              </div>
              <div>
                <dt>衔接（不进 Prompt）</dt>
                <dd>{beat.transition === '' ? '未填' : beat.transition}</dd>
              </div>
            </dl>

            <div className="field">
              <label className="field__label" htmlFor="beat-note">
                备注
              </label>
              <textarea
                id="beat-note"
                className="field__input"
                aria-describedby="beat-note-hint"
                rows={2}
                value={beat.note}
                onChange={(event) => updateBeat((item) => ({ ...item, note: event.target.value }))}
                onBlur={() => void editor.saveNow()}
              />
              <span id="beat-note-hint" className="field__hint">
                自由备忘，不进 Prompt
              </span>
            </div>

            {/* 参考图与项目结构分两个仓：图片字节走 IndexedDB 的 frameImage* store，
                不进项目记录，因此不参与 2s 防抖的自动保存（详见 docs/work/w4-image-store.md）。 */}
            <FrameImagePanel projectId={draft.id} beatIndex={activeIndex} />

            <p className="panel__todo">
              宫格填写在 WK3 落地：只写白话画面描述，不含景别 / 机位 / 运镜等专业字段，
              改动交给同一套自动保存链路。
            </p>
          </section>

          <aside className="panel panel--prompt" aria-labelledby="prompt-title">
            <h2 id="prompt-title" className="panel__title">
              Prompt 面板
            </h2>
            <p className="panel__todo">实时组装在 WK2 落地。</p>
            <p className="panel__note">
              衔接、备注、节拍名称三个字段永不进入 Prompt 与生成请求（AC-6.4）；
              持久化层在落库时会断言 Prompt 快照里不含衔接文案。
            </p>
          </aside>
        </div>
      )}
    </AppLayout>
  );
}
