/**
 * 成片页（路由 `/p/:id/export`，PRD 5.5）。
 * 固定 5 张段卡，按节拍顺序展示；未生成的节拍显示占位卡与“去编辑”入口。
 * 逐段下载 / 连播 / 一键拼接（V1.1 置灰）在后续槽位落地。
 */

import { Link, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { MainNav } from '../components/MainNav';
import { BEAT_COUNT } from '../domain/beats';
import { useProject } from '../store/ProjectsProvider';
import { ProjectMissing } from './ProjectMissing';

export function ExportPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { project, state } = useProject(id);

  if (state === 'loading') {
    return (
      <AppLayout title="成片" nav={<MainNav />}>
        <p className="empty">读取项目…</p>
      </AppLayout>
    );
  }

  if (project === null) {
    return <ProjectMissing id={id} />;
  }

  return (
    <AppLayout
      title="成片"
      subtitle={project.name}
      nav={
        <>
          <MainNav
            items={[
              { to: `/p/${project.id}`, label: '节拍编辑', hint: '五节拍卡与 Prompt', end: true },
              { to: `/p/${project.id}/export`, label: '成片', hint: `${BEAT_COUNT} 段卡片与下载` },
            ]}
          />
          <Link to="/" className="nav__back">
            返回项目列表
          </Link>
        </>
      }
      actions={
        <>
          <button type="button" className="btn" disabled title="V1.1 开放">
            一键拼接（V1.1）
          </button>
          <button type="button" className="btn" disabled>
            全部下载
          </button>
        </>
      }
    >
      <ol className="segments">
        {project.beats.map((beat) => {
          const generated = beat.videoUrl !== null && beat.videoUrl !== '';
          return (
            <li key={beat.index} className="segment">
              <div className="segment__preview" aria-hidden="true">
                {generated ? '已生成' : '未生成'}
              </div>
              <div className="segment__body">
                <h2 className="segment__title">
                  节拍{beat.index}· {beat.name}
                </h2>
                <p className="segment__meta">
                  {beat.durationSec === null ? '时长未填' : `${beat.durationSec} 秒`} · 状态：
                  {generated ? '已生成' : '未生成'}
                </p>
                <Link to={`/p/${project.id}`} className="segment__action">
                  去编辑
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </AppLayout>
  );
}
