/**
 * 全站骨架（PRD 锁定）：左侧导航 + 顶部栏 + 主区，三者结构固定。
 * 所有页面必须通过本组件渲染，不另开平行中枢（无剧本工作台 / 分镜表 / 剪辑时间线）。
 */

import type { ReactNode } from 'react';

interface AppLayoutProps {
  /** 顶部栏标题 */
  title: string;
  /** 顶部栏副标题（面包屑/项目名等） */
  subtitle?: string;
  /** 顶部栏右侧操作区 */
  actions?: ReactNode;
  /** 左侧导航内容 */
  nav: ReactNode;
  children: ReactNode;
}

export function AppLayout({ title, subtitle, actions, nav, children }: AppLayoutProps) {
  return (
    <div className="layout">
      <header className="layout__topbar">
        <div className="layout__brand">
          <span className="layout__logo" aria-hidden="true">
            ▌▌
          </span>
          <span>节拍板</span>
        </div>
        <div className="layout__titles">
          <h1 className="layout__title">{title}</h1>
          {subtitle !== undefined && <p className="layout__subtitle">{subtitle}</p>}
        </div>
        <div className="layout__actions">{actions}</div>
      </header>

      <nav className="layout__nav" aria-label="主导航">
        {nav}
      </nav>

      <main className="layout__main">{children}</main>
    </div>
  );
}
