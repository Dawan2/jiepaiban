/**
 * 图片仓上下文的契约，以及它与项目生命周期的接线（W4/IMAGE-STORE）。
 *
 * 「删项目要顺手删图片」不是可选的整洁：参考图不在项目记录里，
 * 项目一删，那些字节就再没有入口能找到它们，只会一直占着 IndexedDB 配额。
 */

import 'fake-indexeddb/auto';
import { useRef } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FrameImageStore } from '../adapters/images';
import { pngFile } from '../testing/imageFixtures';
import {
  makeProject,
  memoryFrameImages,
  renderApp,
  seedRepository,
  withVideos,
} from '../testing/harness';
import {
  FrameImagesProvider,
  useFrameImageStore,
  useOptionalFrameImageStore,
} from './FrameImagesProvider';

function StoreProbe() {
  const store = useFrameImageStore();
  const first = useRef(store);
  const renders = useRef(0);
  renders.current += 1;
  return (
    <div>
      <span data-testid="kind">{store.storageKind}</span>
      <span data-testid="stable">{store === first.current ? '稳定' : '被重建'}</span>
      <span data-testid="renders">{renders.current}</span>
    </div>
  );
}

function OptionalProbe() {
  const store = useOptionalFrameImageStore();
  return <span data-testid="optional">{store === null ? '无' : store.storageKind}</span>;
}

describe('上下文契约', () => {
  it('缺 Provider 时明确报错，而不是静默拿到一个空仓', () => {
    expect(() => render(<StoreProbe />)).toThrow(/必须在 <FrameImagesProvider> 内使用/);
  });

  it('可选读取在缺 Provider 时返回 null', () => {
    render(<OptionalProbe />);
    expect(screen.getByTestId('optional')).toHaveTextContent('无');
  });

  it('不传任何 prop（生产入口的用法）时用 IndexedDB，且重渲染不重建仓', async () => {
    const view = render(
      <FrameImagesProvider>
        <StoreProbe />
      </FrameImagesProvider>,
    );

    expect(screen.getByTestId('kind')).toHaveTextContent('indexeddb');

    view.rerender(
      <FrameImagesProvider>
        <StoreProbe />
      </FrameImagesProvider>,
    );

    // 默认时钟若写成内联箭头函数，这里就会显示"被重建"（W2 在 ProjectsProvider 上踩过）。
    expect(screen.getByTestId('stable')).toHaveTextContent('稳定');
    expect(Number(screen.getByTestId('renders').textContent)).toBeLessThan(5);
  });
});

describe('删项目连带清图片', () => {
  const ready = () => waitFor(() => expect(screen.queryByText(/读取本地项目库/)).toBeNull());

  function cardFor(name: string): HTMLElement {
    const card = screen.getByRole('link', { name: new RegExp(name) }).closest('li');
    if (card === null) {
      throw new Error(`找不到《${name}》的卡片`);
    }
    return card;
  }

  let frameImages: FrameImageStore;

  beforeEach(async () => {
    frameImages = memoryFrameImages();
    await frameImages.put({ projectId: 'prj_1', beatIndex: 1, frameOrder: 1 }, pngFile('a.png'));
    await frameImages.put({ projectId: 'prj_1', beatIndex: 5, frameOrder: 2 }, pngFile('b.png'));
    await frameImages.put({ projectId: 'prj_2', beatIndex: 1, frameOrder: 1 }, pngFile('other.png'));
  });

  it('删掉项目后它的参考图不再占用配额，其他项目的图不动', async () => {
    const repository = await seedRepository([
      makeProject('prj_1', { name: '第一集' }),
      makeProject('prj_2', { name: '第二集' }),
    ]);
    const user = userEvent.setup();
    renderApp('/', { repository, frameImages });
    await ready();

    await user.click(within(cardFor('第一集')).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(screen.queryByRole('link', { name: /第一集/ })).toBeNull());
    expect(await frameImages.listProject('prj_1')).toEqual([]);
    expect((await frameImages.usage('prj_1')).bytes).toBe(0);
    expect((await frameImages.listProject('prj_2')).map((meta) => meta.name)).toEqual(['other.png']);
  });

  it('二次确认里点取消，项目与图片都保留', async () => {
    const repository = await seedRepository([
      withVideos(makeProject('prj_1', { name: '第一集' }), 2),
    ]);
    const user = userEvent.setup();
    renderApp('/', { repository, frameImages });
    await ready();

    await user.click(within(cardFor('第一集')).getByRole('button', { name: '删除' }));
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(await repository.load('prj_1')).not.toBeNull();
    expect(await frameImages.listProject('prj_1')).toHaveLength(2);
  });

  it('复用项目不继承参考图（PRD §7.2 画面内容一律清空）', async () => {
    const repository = await seedRepository([makeProject('prj_1', { name: '第一集' })]);
    const user = userEvent.setup();
    renderApp('/', { repository, frameImages });
    await ready();

    await user.click(within(cardFor('第一集')).getByRole('button', { name: '复用' }));
    await screen.findByText(/画面文案已清空/);

    const summaries = await repository.list();
    const copyId = summaries.find((summary) => summary.reusedFromId === 'prj_1')?.id ?? '';
    expect(copyId).not.toBe('');
    expect(await frameImages.listProject(copyId)).toEqual([]);
    // 来源项目的图不受影响。
    expect(await frameImages.listProject('prj_1')).toHaveLength(2);
  });
});
