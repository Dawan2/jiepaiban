/**
 * 项目列表页（路由 `/`，PRD 5.1.3）。
 * 项目卡展示名称、题材、画幅、更新时间与五节拍完成度点阵（分母恒为 5）。
 */

import { Link } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { MainNav } from '../components/MainNav';
import { demoProjects } from '../data/demoProjects';
import { BEAT_INDEXES } from '../domain/beats';
import { beatCompletion } from '../domain/projects';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function ProjectsPage() {
  return (
    <AppLayout
      title="项目"
      subtitle="填五张节拍卡，出五段视频，组一集短剧"
      nav={<MainNav />}
      actions={
        <button type="button" className="btn btn--primary" disabled>
          新建项目
        </button>
      }
    >
      <ul className="cards">
        {demoProjects.map((project) => {
          const completion = beatCompletion(project);
          return (
            <li key={project.id} className="card">
              <Link to={`/p/${project.id}`} className="card__link">
                <h2 className="card__title">{project.name}</h2>
                <dl className="card__meta">
                  <div>
                    <dt>题材</dt>
                    <dd>{project.genre}</dd>
                  </div>
                  <div>
                    <dt>画幅</dt>
                    <dd>{project.aspectRatio}</dd>
                  </div>
                  <div>
                    <dt>更新</dt>
                    <dd>{formatDate(project.updatedAt)}</dd>
                  </div>
                </dl>
                <div className="card__footer">
                  <span className="dots" aria-label={`五节拍完成度 ${completion.filled}/${completion.total}`}>
                    {BEAT_INDEXES.map((index) => (
                      <span
                        key={index}
                        className={`dots__dot${index <= completion.filled ? ' dots__dot--on' : ''}`}
                      />
                    ))}
                  </span>
                  <span className="card__count">
                    {completion.filled}/{completion.total} 节拍已填
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </AppLayout>
  );
}
