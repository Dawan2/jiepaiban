/**
 * 节拍编辑页（路由 `/p/:id`，PRD 5.2）。
 *
 * 本槽位（W1/WK1）只落地页面骨架：左侧固定 5 项节拍导航 + 中部编辑区占位 + 右侧 Prompt 面板占位。
 * 宫格编辑、字段自动保存与 Prompt 实时组装由后续槽位（WK3）实现，此处不做。
 *
 * 红线：节拍数量固定 5、无分镜入口、衔接字段绝不进入 Prompt（AC-6.1 / 6.4 / 6.8）。
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { BeatNav } from '../components/BeatNav';
import { findDemoProject } from '../data/demoProjects';
import { BEAT_COUNT, type BeatIndex } from '../domain/beats';
import { ProjectMissing } from './ProjectMissing';

export function EditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  const project = findDemoProject(id);
  const [activeIndex, setActiveIndex] = useState<BeatIndex>(1);

  if (project === undefined) {
    return <ProjectMissing id={id} />;
  }

  const beat = project.beats.find((item) => item.index === activeIndex);

  return (
    <AppLayout
      title="节拍编辑"
      subtitle={project.name}
      nav={
        <>
          <p className="nav__caption">五节拍（固定 {BEAT_COUNT} 项）</p>
          <BeatNav
            beats={project.beats}
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
          <button type="button" className="btn" disabled>
            生成全集
          </button>
          <Link to={`/p/${project.id}/export`} className="btn btn--primary">
            成片
          </Link>
        </>
      }
    >
      {beat !== undefined && (
        <div className="editor">
          <section className="panel" aria-labelledby="beat-card-title">
            <h2 id="beat-card-title" className="panel__title">
              节拍{activeIndex}· {beat.name}
            </h2>
            <p className="panel__desc">{beat.role}</p>
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
                <dd>{beat.gridSize} 宫格</dd>
              </div>
              <div>
                <dt>时长</dt>
                <dd>{beat.durationSec === null ? '未填' : `${beat.durationSec} 秒`}</dd>
              </div>
            </dl>
            <p className="panel__todo">
              宫格填写与字段编辑在 WK3 落地。宫格只写白话画面描述，不含景别 / 机位 / 运镜等专业字段。
            </p>
          </section>

          <aside className="panel panel--prompt" aria-labelledby="prompt-title">
            <h2 id="prompt-title" className="panel__title">
              Prompt 面板
            </h2>
            <p className="panel__todo">实时组装在 WK3 落地。</p>
            <p className="panel__note">
              衔接、备注、节拍名称三个字段永不进入 Prompt 与生成请求（AC-6.4）。
            </p>
          </aside>
        </div>
      )}
    </AppLayout>
  );
}
