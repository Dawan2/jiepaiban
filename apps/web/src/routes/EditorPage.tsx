/**
 * 节拍编辑页（路由 `/p/:id`，PRD 5.2 / 5.3）。
 *
 * 左侧固定 5 板导航，中部信息条 + 剧情核心 + 画面宫格 + 组间衔接，右侧 Prompt 实时预览。
 *
 * 红线（AC-6.1 / 6.4 / 6.8）：板数恒 5 且无增删改序入口；格数由板位锁定；
 * 衔接、板名、备注绝不进入 Prompt 与生成请求体。
 */

import { Link, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { BeatNav } from '../components/BeatNav';
import { findDemoProject } from '../data/demoProjects';
import { BEAT_COUNT, TOTAL_FRAME_COUNT, type BeatIndex } from '../domain/beats';
import { BeatBoardBody, useBeatBoard } from '../editor/BeatBoard';
import type { Project } from '../domain/projects';
import { ProjectMissing } from './ProjectMissing';

function Editor({ project }: { project: Project }) {
  const board = useBeatBoard(project);

  return (
    <AppLayout
      title="节拍编辑"
      subtitle={project.name}
      nav={
        <>
          <p className="nav__caption">
            五节拍（固定 {BEAT_COUNT} 板 · 恒 {TOTAL_FRAME_COUNT} 格）
          </p>
          <BeatNav
            beats={board.navItems}
            activeIndex={board.activeIndex}
            onSelect={(index) => board.setActiveIndex(index as BeatIndex)}
          />
          <p className="nav__lock">板序与板名为规格，不可改序、不可改名。</p>
          <Link to="/" className="nav__back">
            返回项目列表
          </Link>
        </>
      }
      actions={
        <>
          <button type="button" className="btn" disabled title="生成接入在后续槽位">
            生成本拍
          </button>
          <button type="button" className="btn" disabled title="生成接入在后续槽位">
            生成全集
          </button>
          <Link to={`/p/${project.id}/export`} className="btn btn--primary">
            成片
          </Link>
        </>
      }
    >
      <BeatBoardBody project={project} board={board} />
    </AppLayout>
  );
}

export function EditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  const project = findDemoProject(id);

  if (project === undefined) {
    return <ProjectMissing id={id} />;
  }

  return <Editor project={project} />;
}
