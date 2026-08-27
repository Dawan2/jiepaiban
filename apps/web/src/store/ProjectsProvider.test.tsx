/**
 * 上下文的稳定性回归。
 *
 * 这两条用例针对的是真实缺陷：`ProjectsProvider` 的 `now` 默认值曾写成默认参数里的
 * 内联箭头函数，每次渲染都是新身份，导致 `repository` / `refresh` 重建、
 * `refresh` 的 effect 反复触发，形成读库死循环。生产入口正好不传这些 prop，
 * 所以只有真实浏览器（编辑区被无限卸载重建）才暴露出来；这里把它钉死在单测里。
 */

import { useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectRepository } from '../adapters/persistence';
import { ProjectsProvider, useProject, useProjects } from './ProjectsProvider';
import { makeProject, renderApp, seedRepository } from '../testing/harness';

function RenderCounter() {
  const count = useRef(0);
  count.current += 1;
  const { state, summaries } = useProjects();
  return (
    <div>
      <span data-testid="renders">{count.current}</span>
      <span data-testid="state">{state}</span>
      <span data-testid="count">{summaries.length}</span>
    </div>
  );
}

function ProjectName({ id }: { id: string }) {
  const { project } = useProject(id);
  return <span data-testid="name">{project?.name ?? '—'}</span>;
}

/**
 * 数 `load` 被调用了几次。
 * 每一次重读都会先把 `useProject` 打回 loading 态，编辑区随之卸载重建
 * （输入框失焦、光标丢失），所以"列表刷新后不再重读"是可观测的行为契约。
 */
function countingRepository(inner: ProjectRepository) {
  const calls = { load: 0 };
  const wrapped: ProjectRepository = {
    list: () => inner.list(),
    load: (id) => {
      calls.load += 1;
      return inner.load(id);
    },
    save: (project) => inner.save(project),
    remove: (id) => inner.remove(id),
    exportAll: () => inner.exportAll(),
    importAll: (envelope, mode) => inner.importAll(envelope, mode),
  };
  return { wrapped, calls };
}

describe('不传任何 prop（生产入口的用法）', () => {
  beforeEach(() => window.localStorage.clear());

  it('不会陷入读库死循环，渲染次数收敛', async () => {
    // 不注入 repository：走 selectDriver()，jsdom 下回落 localStorage。
    render(
      <ProjectsProvider>
        <RenderCounter />
      </ProjectsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));

    const settled = Number(screen.getByTestId('renders').textContent);
    // 给死循环足够的时间暴露自己。
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(Number(screen.getByTestId('renders').textContent)).toBe(settled);
    expect(settled).toBeLessThan(10);
  });
});

describe('保存后不重建编辑区', () => {
  it('列表刷新不会让 useProject 重读项目', async () => {
    const seeded = await seedRepository([makeProject('prj_1', { name: '第一集' })]);
    const { wrapped, calls } = countingRepository(seeded);
    const user = userEvent.setup();

    function Harness() {
      const { archive } = useProjects();
      return (
        <div>
          <ProjectName id="prj_1" />
          <button type="button" onClick={() => void archive('prj_1', true)}>
            触发列表刷新
          </button>
        </div>
      );
    }

    render(
      <MemoryRouter>
        <ProjectsProvider repository={wrapped}>
          <Harness />
        </ProjectsProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('第一集'));
    // useProject 首读 1 次；归档命令自身还会读 1 次以取出待改项目。
    const before = calls.load;

    await user.click(screen.getByRole('button', { name: '触发列表刷新' }));
    await waitFor(async () => {
      expect((await seeded.list())[0]?.archived).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 归档命令读的那一次算进来，但 useProject 不得因列表刷新再读。
    expect(calls.load).toBe(before + 1);
  });

  it('编辑页保存后输入框不被卸载（保持焦点）', async () => {
    const repository = await seedRepository([makeProject('prj_1', { name: '第一集' })]);
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });

    await waitFor(() => expect(screen.queryByText(/读取项目/)).toBeNull());

    const note = screen.getByLabelText('备注');
    note.focus();
    await user.type(note, '记一笔');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(async () => {
      expect((await repository.load('prj_1'))?.beats[0]?.note).toBe('记一笔');
    });

    // 同一个 DOM 节点仍在文档里，说明没有整片重建。
    expect(screen.getByLabelText('备注')).toBe(note);
    expect(note).toBeInTheDocument();
  });
});
