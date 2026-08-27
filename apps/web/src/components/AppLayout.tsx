/**
 * 全站骨架（PRD 锁定）：左侧导航 + 顶部栏 + 主区，三者结构固定。
 * 所有页面必须通过本组件渲染，不另开平行中枢（无剧本工作台、无镜头级清单页、无剪辑时间线）。
 */

import type { MouseEvent, ReactNode } from 'react';

/** 跳转链接的落点；`<main>` 带 tabIndex={-1} 才能接住焦点。 */
export const MAIN_CONTENT_ID = 'main-content';

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
  /**
   * 光靠 `href="#id"` 在部分浏览器里只滚动、不移焦点，跳过去之后按 Tab 又回到导航。
   * 显式 focus 一次，跳转链接才真的省下那几十次 Tab。
   */
  const skipToMain = (event: MouseEvent<HTMLAnchorElement>) => {
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (main !== null) {
      event.preventDefault();
      main.focus();
    }
  };

  return (
    <div className="layout">
      {/* Tab 序第一站：编辑页在主区之前有顶部栏 + 5 项左导航，绕过它们是刚需。 */}
      <a className="skiplink" href={`#${MAIN_CONTENT_ID}`} onClick={skipToMain}>
        跳到主内容
      </a>

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

      <main id={MAIN_CONTENT_ID} className="layout__main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
