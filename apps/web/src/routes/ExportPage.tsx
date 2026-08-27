/**
 * 成片页路由壳（路由 `/p/:id/export`，PRD 5.5）。
 *
 * 这里只做两件事：取项目、兜底「项目不存在」。页面本体在 `export/ExportView.tsx`，
 * 拆开是为了让兜底走在任何 Hook 之前——生成控制器与项目 1:1，必须先确认项目存在。
 */

import { useParams } from 'react-router-dom';
import { ExportView } from '../export/ExportView';
import { ProjectMissing } from './ProjectMissing';
import { findDemoProject } from '../data/demoProjects';

export function ExportPage() {
  const { id = '' } = useParams<{ id: string }>();
  const project = findDemoProject(id);

  if (project === undefined) {
    return <ProjectMissing id={id} />;
  }

  return <ExportView project={project} />;
}
