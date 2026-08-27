/**
 * 成片页（路由 `/p/:id/export`，PRD 5.5）。
 *
 * 路由壳只做三件事：从本地库取项目、兜底「项目不存在」、把生成结果写回库。
 * 页面本体在 `export/ExportView.tsx`——拆开是为了让兜底走在任何 Hook 之前，
 * 生成控制器与项目 1:1，必须先确认项目存在。
 *
 * 数据来自本地库而非内存夹具：段卡的「已生成 / 未生成」以落库的 `video_url` 为准，
 * 刷新页面后状态仍在；本页重投成功后同样把 `video_url` / `prompt_final` 落回库，
 * 与编辑页共用 `store/generated.ts` 的那一份判据。
 */

import { useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { MainNav } from '../components/MainNav';
import type { StoredProject } from '../adapters/persistence';
import { ExportView } from '../export/ExportView';
import { pendingGeneratedStates, withGeneratedResults } from '../store/generated';
import { useProject, useProjects } from '../store/ProjectsProvider';
import { useProjectEditor } from '../store/useProjectEditor';
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

  // 生成控制器以项目为单位：换项目必须整块重建，故用 key 而非 prop 更新。
  return <ExportBoard key={project.id} project={project} />;
}

function ExportBoard({ project }: { readonly project: StoredProject }) {
  const { save } = useProjects();
  // 复用编辑页那套保存引擎（防抖 + 离页强制 flush），本页只用它写生成结果。
  const editor = useProjectEditor(project, { save });
  const draft = editor.draft ?? project;

  return (
    <ExportView
      project={draft}
      onStatesChange={(states) => {
        const pending = pendingGeneratedStates(draft, states);
        if (pending.length === 0) {
          return;
        }
        editor.update((current) => withGeneratedResults(current, pending));
      }}
    />
  );
}
