import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { demoProjects } from './data/demoProjects';
import { BEAT_COUNT } from './domain/beats';

const projectId = demoProjects[0]?.id ?? '';
const projectName = demoProjects[0]?.name ?? '';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('布局骨架（PRD 锁定：左导航 + 顶部栏 + 主区）', () => {
  it.each([['/'], [`/p/${projectId}`], [`/p/${projectId}/export`]])(
    '%s 同时渲染顶部栏、左导航与主区',
    (path) => {
      const { container } = renderAt(path);
      expect(container.querySelector('.layout__topbar')).not.toBeNull();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    },
  );
});

describe('路由', () => {
  it('/ 渲染项目列表', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: '项目' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(projectName) })).toBeInTheDocument();
  });

  it('/p/:id 渲染编辑页，左侧为固定 5 项节拍导航', () => {
    renderAt(`/p/${projectId}`);
    expect(screen.getByRole('heading', { level: 1, name: '节拍编辑' })).toBeInTheDocument();

    const beatNav = screen.getByRole('list', { name: '五节拍导航' });
    expect(within(beatNav).getAllByRole('button')).toHaveLength(BEAT_COUNT);
  });

  it('/p/:id 点击导航切换到对应节拍', async () => {
    renderAt(`/p/${projectId}`);
    const beatNav = screen.getByRole('list', { name: '五节拍导航' });

    await userEvent.click(within(beatNav).getByRole('button', { name: /反转\/高潮/ }));

    expect(screen.getByRole('heading', { level: 2, name: /节拍4/ })).toBeInTheDocument();
  });

  it('/p/:id/export 渲染成片页，固定 5 张段卡', () => {
    renderAt(`/p/${projectId}/export`);
    expect(screen.getByRole('heading', { level: 1, name: '成片' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((li) => li.className === 'segment')).toHaveLength(
      BEAT_COUNT,
    );
  });

  it('未知项目与未知路径走兜底页', () => {
    renderAt('/p/prj_missing');
    expect(screen.getByRole('heading', { level: 1, name: '项目不存在' })).toBeInTheDocument();

    renderAt('/nope');
    expect(screen.getByRole('heading', { level: 1, name: '页面不存在' })).toBeInTheDocument();
  });
});

describe('产品红线：全站无“分镜”入口（AC-6.8）', () => {
  it.each([['/'], [`/p/${projectId}`], [`/p/${projectId}/export`]])(
    '%s 的 UI 文案不含“分镜”，也无镜头级增删入口',
    (path) => {
      const { container } = renderAt(path);
      const text = container.textContent ?? '';
      expect(text).not.toContain('分镜');
      expect(text).not.toContain('故事板');
      expect(text).not.toMatch(/(新增|添加|删除)节拍/);
    },
  );

  it('路由表只有项目 / 编辑 / 成片三个页面', async () => {
    const { ROUTES } = await import('./App');
    expect(Object.values(ROUTES)).toEqual(['/', '/p/:id', '/p/:id/export']);
  });
});
