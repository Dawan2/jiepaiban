/**
 * 路由表（V1.0 全站仅三个页面 + 兜底）。
 * 红线（AC-6.8）：不得新增镜头级页面或路由（METH-002 §8 禁用词表里的那个概念）。
 */

import { Route, Routes } from 'react-router-dom';
import { EditorPage } from './routes/EditorPage';
import { ExportPage } from './routes/ExportPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { ProjectsPage } from './routes/ProjectsPage';

export const ROUTES = {
  projects: '/',
  editor: '/p/:id',
  export: '/p/:id/export',
} as const;

export function App() {
  return (
    <Routes>
      <Route path={ROUTES.projects} element={<ProjectsPage />} />
      <Route path={ROUTES.editor} element={<EditorPage />} />
      <Route path={ROUTES.export} element={<ExportPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
