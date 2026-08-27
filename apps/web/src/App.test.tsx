import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BEAT_COUNT } from './domain/beats';
import type { LocalRepository } from './adapters/persistence';
import { makeProject, renderApp, seedRepository, withVideos } from './testing/harness';

const projectId = 'prj_seed_1';
const projectName = '重生之我在末世卖煎饼';

let repository: LocalRepository;

beforeEach(async () => {
  repository = await seedRepository([
    withVideos(makeProject(projectId, { name: projectName }, '2026-08-26T09:12:00.000Z'), 1),
    makeProject('prj_seed_2', { name: '总裁的隐婚小娇妻' }, '2026-08-25T14:03:00.000Z'),
  ]);
});

const render = (path: string) => renderApp(path, { repository });

describe('布局骨架（PRD 锁定：左导航 + 顶部栏 + 主区）', () => {
  it.each([['/'], [`/p/${projectId}`], [`/p/${projectId}/export`]])(
    '%s 同时渲染顶部栏、左导航与主区',
    async (path) => {
      const { container } = render(path);
      await waitFor(() => expect(screen.queryByText(/读取/)).toBeNull());

      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(container.querySelector('.layout__topbar')).not.toBeNull();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    },
  );
});

describe('路由', () => {
  it('/ 渲染项目列表，数据来自本地仓储', async () => {
    render('/');
    expect(screen.getByRole('heading', { level: 1, name: '项目' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: new RegExp(projectName) })).toBeInTheDocument();
  });

  it('/p/:id 渲染编辑页，左侧为固定 5 项节拍导航', async () => {
    render(`/p/${projectId}`);
    expect(screen.getByRole('heading', { level: 1, name: '节拍编辑' })).toBeInTheDocument();

    const beatNav = await screen.findByRole('list', { name: '五节拍导航' });
    expect(within(beatNav).getAllByRole('button')).toHaveLength(BEAT_COUNT);
  });

  it('/p/:id 点击导航切换到对应节拍', async () => {
    render(`/p/${projectId}`);
    const beatNav = await screen.findByRole('list', { name: '五节拍导航' });

    await userEvent.click(within(beatNav).getByRole('button', { name: /反转\/高潮/ }));

    expect(screen.getByRole('heading', { level: 2, name: /节拍4/ })).toBeInTheDocument();
  });

  it('/p/:id/export 渲染成片页，固定 5 张段卡', async () => {
    render(`/p/${projectId}/export`);
    expect(screen.getByRole('heading', { level: 1, name: '成片' })).toBeInTheDocument();

    await screen.findByRole('heading', { level: 2, name: /节拍1/ });
    expect(screen.getAllByRole('listitem').filter((li) => li.className === 'segment')).toHaveLength(
      BEAT_COUNT,
    );
  });

  it('未知项目与未知路径走兜底页', async () => {
    render('/p/prj_missing');
    expect(await screen.findByRole('heading', { level: 1, name: '项目不存在' })).toBeInTheDocument();

    render('/nope');
    expect(screen.getByRole('heading', { level: 1, name: '页面不存在' })).toBeInTheDocument();
  });
});

describe('产品红线：全站无“分镜”入口（AC-6.8）', () => {
  it.each([['/'], [`/p/${projectId}`], [`/p/${projectId}/export`]])(
    '%s 的 UI 文案不含“分镜”，也无镜头级增删入口',
    async (path) => {
      const { container } = render(path);
      // 等加载占位消失后再扫，确保扫的是仓储读出的真实内容。
      await waitFor(() => expect(screen.queryByText(/读取/)).toBeNull());

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
