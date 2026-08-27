/**
 * 节拍编辑页（路由 `/p/:id`，PRD 5.2）。
 *
 * 页面骨架（W1/WK1）：左侧固定 5 项节拍导航 + 中部编辑区 + 右侧 Prompt 面板占位。
 * 宫格编辑、字段自动保存与 Prompt 实时组装由 WK3 落地，此处不做。
 *
 * W2 在骨架上接了生成动作：板级「生成本板」与顶栏「生成全集」都走
 * `generate/` 的控制器，UI 只渲染控制器给出的状态文案与禁用原因。
 *
 * 红线：节拍数量固定 5、没有镜头级页面或入口、衔接字段绝不进入 Prompt（AC-6.1 / 6.4 / 6.8）。
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { BeatNav } from '../components/BeatNav';
import { findDemoProject } from '../data/demoProjects';
import { BEAT_COUNT, MAX_BEAT_DURATION_SEC, beatDef, type BeatIndex } from '../domain/beats';
import {
  BeatGenerateAction,
  GenerateEpisodeButton,
  pickBoardState,
} from '../generate/GenerateActions';
import { useGenerateController } from '../generate/useGenerateController';
import type { Project } from '../domain/projects';
import { ProjectMissing } from './ProjectMissing';

export function EditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  const project = findDemoProject(id);

  if (project === undefined) {
    return <ProjectMissing id={id} />;
  }

  return <EditorView project={project} />;
}

/**
 * 真正的编辑视图。
 *
 * 拆成两个组件是为了让「项目不存在」的兜底走在任何 Hook 之前——
 * 生成控制器与项目 1:1，必须在确定项目存在之后再建。
 */
function EditorView({ project }: { readonly project: Project }) {
  const [activeIndex, setActiveIndex] = useState<BeatIndex>(1);
  const { controller, states } = useGenerateController(project);

  const beat = project.beat_list.find((item) => item.index === activeIndex);
  const boardState = pickBoardState(states, activeIndex);

  return (
    <AppLayout
      title="节拍编辑"
      subtitle={project.name}
      nav={
        <>
          <p className="nav__caption">五节拍（固定 {BEAT_COUNT} 项）</p>
          <BeatNav
            beats={project.beat_list}
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
          <GenerateEpisodeButton controller={controller} states={states} />
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
              节拍{activeIndex}· {beat.title}
            </h2>
            <p className="panel__desc">{beatDef(beat.index).role}</p>
            <dl className="fields">
              <div>
                <dt>剧情核心</dt>
                <dd>{beat.plot_core === '' ? '未填' : beat.plot_core}</dd>
              </div>
              <div>
                <dt>本段情绪</dt>
                <dd>{beat.emotion === '' ? '未填' : beat.emotion}</dd>
              </div>
              <div>
                <dt>镜头节奏</dt>
                <dd>{beat.camera_rhythm === '' ? '未填' : beat.camera_rhythm}</dd>
              </div>
              <div>
                <dt>画面宫格</dt>
                <dd>{beat.frame_count} 宫格（按板序锁定）</dd>
              </div>
              <div>
                <dt>时长</dt>
                <dd>
                  {beat.duration_sec} 秒 · 时间位 {beat.time_start}–{beat.time_end}s（上限{' '}
                  {MAX_BEAT_DURATION_SEC} 秒）
                </dd>
              </div>
            </dl>
            <p className="panel__todo">
              宫格填写与字段编辑在 WK3 落地。宫格只写白话画面描述，不含景别 / 机位 / 运镜等专业字段。
            </p>
            {boardState !== undefined && (
              <BeatGenerateAction controller={controller} state={boardState} />
            )}
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
