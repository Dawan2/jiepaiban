/**
 * 编辑页里的节拍帧参考图接线（W4/IMAGE-STORE）。
 *
 * 这里的图片仓走**真 IndexedDB 语义**（`fake-indexeddb`），因此
 * "卸载整个应用再重新挂载后图片还在"这条断言就是刷新页面的等价物——
 * 而它恰好是只存 object URL 的实现必然做不到的事。
 */

import 'fake-indexeddb/auto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FrameImageStore, IndexedDbFrameImageDriver, MAX_FRAME_IMAGE_BYTES } from '../adapters/images';
import type { LocalRepository } from '../adapters/persistence';
import { BEAT_COUNT } from '../domain/beats';
import { oversizedPngFile, pngFile, renamedTextAsPng, textFile } from '../testing/imageFixtures';
import { fixedClock, makeProject, renderApp, seedRepository } from '../testing/harness';

let repository: LocalRepository;
let frameImages: FrameImageStore;

const ready = () => waitFor(() => expect(screen.queryByText(/读取项目/)).toBeNull());

const panel = () => screen.getByRole('region', { name: /帧参考图/ });

beforeEach(async () => {
  repository = await seedRepository([makeProject('prj_1', { name: '第一集' })]);
  frameImages = new FrameImageStore(new IndexedDbFrameImageDriver(indexedDB), fixedClock(60));
  await frameImages.clear();
});

describe('帧位数由宫格锁推导', () => {
  it('B1 三格、B5 两格，且没有增删帧位的入口', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository, frameImages });
    await ready();

    expect(within(panel()).getAllByRole('listitem')).toHaveLength(3);
    expect(within(panel()).getByText('帧参考图（3 格）')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /悬念钩子/ }));
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(2);

    const text = panel().textContent ?? '';
    expect(text).not.toMatch(/(新增|添加|删除)(帧|格|节拍)/);
    expect(text).not.toContain('分镜');
  });
});

describe('配图与移除', () => {
  it('选图后缩略图出现，且字节真的进了图片仓', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository, frameImages });
    await ready();

    await user.upload(within(panel()).getByLabelText('第 1 格参考图文件'), pngFile('雨夜巷口.png', 40));

    const thumb = await within(panel()).findByAltText('第 1 格参考图');
    expect(thumb).toHaveAttribute('src', expect.stringMatching(/^blob:/));
    expect(within(panel()).getByText(/雨夜巷口\.png/)).toBeInTheDocument();

    const stored = await frameImages.get({ projectId: 'prj_1', beatIndex: 1, frameOrder: 1 });
    expect(stored?.size).toBe(48);
    expect(stored?.type).toBe('image/png');
  });

  it('移除后回到未配图，库里也没了', async () => {
    const user = userEvent.setup();
    await frameImages.put({ projectId: 'prj_1', beatIndex: 1, frameOrder: 2 }, pngFile('删我.png'));
    renderApp('/p/prj_1', { repository, frameImages });
    await ready();

    await within(panel()).findByAltText('第 2 格参考图');
    await user.click(within(panel()).getByRole('button', { name: '移除第 2 格图片' }));

    await waitFor(() => expect(within(panel()).queryByAltText('第 2 格参考图')).toBeNull());
    expect(await frameImages.getMeta({ projectId: 'prj_1', beatIndex: 1, frameOrder: 2 })).toBeNull();
  });

  it('切板只显示该板自己的图', async () => {
    const user = userEvent.setup();
    await frameImages.put({ projectId: 'prj_1', beatIndex: 1, frameOrder: 1 }, pngFile('b1.png'));
    await frameImages.put({ projectId: 'prj_1', beatIndex: BEAT_COUNT, frameOrder: 1 }, pngFile('b5.png'));
    renderApp('/p/prj_1', { repository, frameImages });
    await ready();

    expect(await within(panel()).findByText(/b1\.png/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /悬念钩子/ }));
    expect(await within(panel()).findByText(/b5\.png/)).toBeInTheDocument();
    expect(within(panel()).queryByText(/b1\.png/)).toBeNull();
  });

  it('本项目占用量显示在面板里', async () => {
    await frameImages.put({ projectId: 'prj_1', beatIndex: 1, frameOrder: 1 }, pngFile('a.png', 1016));
    renderApp('/p/prj_1', { repository, frameImages });
    await ready();

    expect(await within(panel()).findByText(/本项目参考图 1 张 · 1 KB \/ 64 MB/)).toBeInTheDocument();
  });
});

describe('刷新后仍在（本槽位的核心承诺）', () => {
  it('卸载整个应用再挂载，图片仍从 IndexedDB 读回', async () => {
    const user = userEvent.setup();
    const first = renderApp('/p/prj_1', { repository, frameImages });
    await ready();

    await user.upload(within(panel()).getByLabelText('第 3 格参考图文件'), pngFile('留下来.png', 64));
    const before = (await within(panel()).findByAltText('第 3 格参考图')).getAttribute('src');

    first.unmount();

    // 新的 store 实例 + 新的驱动实例：进程里没有任何残留，只有 IndexedDB 是同一个。
    renderApp('/p/prj_1', {
      repository,
      frameImages: new FrameImageStore(new IndexedDbFrameImageDriver(indexedDB), fixedClock(90)),
    });
    await ready();

    expect(await within(panel()).findByText(/留下来\.png/)).toBeInTheDocument();
    const after = (await within(panel()).findByAltText('第 3 格参考图')).getAttribute('src');
    expect(after).toMatch(/^blob:/);
    // URL 是重新生成的：blob: URL 的寿命只有一次会话，落库的是字节。
    expect(after).not.toBe(before);
  });
});

describe('拒收时的用户提示', () => {
  it('文件选择器按 accept 过滤，非图片扩展名根本传不进来', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository, frameImages });
    await ready();

    const input = within(panel()).getByLabelText('第 1 格参考图文件');
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp,image/gif,image/avif');

    // accept 只是第一道门（用户可以在系统对话框里选"所有文件"），所以下一条用例
    // 用改名伪装的文件证明真正的把关在字节签名上。
    await user.upload(input, textFile('剧本.txt'));
    expect(await frameImages.listBeat('prj_1', 1)).toEqual([]);
  });

  it('改名伪装成 .png 的非图片被拦住并给出可读原因，页面不崩', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository, frameImages });
    await ready();

    await user.upload(within(panel()).getByLabelText('第 1 格参考图文件'), renamedTextAsPng('假图.png'));

    expect(await within(panel()).findByRole('alert')).toHaveTextContent(/只支持 image\/png/);
    expect(within(panel()).queryByAltText('第 1 格参考图')).toBeNull();
    expect(await frameImages.listBeat('prj_1', 1)).toEqual([]);
  });

  it('超大图片给出体积上限与"先压缩"的建议', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository, frameImages });
    await ready();

    await user.upload(
      within(panel()).getByLabelText('第 1 格参考图文件'),
      oversizedPngFile(MAX_FRAME_IMAGE_BYTES),
    );

    expect(await within(panel()).findByRole('alert')).toHaveTextContent(/超过单张上限 8 MB.*压缩/);
  });

  it('面板把支持的格式与上限写在明处', async () => {
    renderApp('/p/prj_1', { repository, frameImages });
    await ready();

    expect(within(panel()).getByText(/png \/ jpeg \/ webp \/ gif \/ avif/)).toBeInTheDocument();
    expect(within(panel()).getByText(/单张不超过 8 MB/)).toBeInTheDocument();
    expect(within(panel()).getByText(/刷新后仍在/)).toBeInTheDocument();
  });
});
