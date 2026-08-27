/**
 * `useBeatFrameImages` 的回归（W4/IMAGE-STORE）。
 *
 * 两个容易出事又容易漏测的点在这里被钉死：
 *
 * 1. **object URL 的回收**：`createObjectURL` 不 revoke 就是内存泄漏，
 *    而"泄漏"在功能测试里完全无症状。这里用 `vitest.setup.ts` 里的 URL 登记表断言，
 *    切板 / 覆盖 / 卸载后旧 URL 必须已被 revoke。
 * 2. **重挂载后恢复**：卸载再挂载（等价于刷新页面重进编辑页）必须重新读到图片。
 *    这正是"存字节而不是只存 object URL"的意义。
 */

import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FrameImageStore,
  IndexedDbFrameImageDriver,
  MemoryFrameImageDriver,
  type FrameOrder,
} from '../adapters/images';
import { BEAT_COUNT, type BeatIndex } from '../domain/beats';
import { pngFile, renamedTextAsPng, textFile } from '../testing/imageFixtures';
import { fixedClock } from '../testing/harness';
import { FrameImagesProvider } from './FrameImagesProvider';
import { useBeatFrameImages } from './useBeatFrameImages';

/** `vitest.setup.ts` 里 object URL 补丁的登记表：URL → Blob，revoke 后条目消失。 */
const registry = (URL as unknown as { objectUrlRegistry: Map<string, Blob> }).objectUrlRegistry;

const projectId = 'prj_1';

function Harness({ beatIndex }: { beatIndex: BeatIndex }) {
  const { slots, state, error, usage, upload, remove } = useBeatFrameImages(projectId, beatIndex);

  return (
    <div>
      <p data-testid="state">{state}</p>
      <p data-testid="error">{error ?? ''}</p>
      <p data-testid="usage">{usage === null ? '' : `${usage.count}/${usage.bytes}`}</p>
      <ul>
        {slots.map((slot) => (
          <li key={slot.order}>
            <span data-testid={`slot-${slot.order}`}>
              {slot.image === null ? '空' : slot.image.name}
            </span>
            <span data-testid={`url-${slot.order}`}>{slot.url ?? ''}</span>
            <span data-testid={`busy-${slot.order}`}>{slot.busy ? '写入中' : ''}</span>
            <input
              type="file"
              aria-label={`选图 ${slot.order}`}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) {
                  void upload(slot.order, file);
                }
              }}
            />
            <button type="button" onClick={() => void remove(slot.order)}>
              移除 {slot.order}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

let store: FrameImageStore;

function renderHook(beatIndex: BeatIndex = 1, injected = store) {
  return render(
    <FrameImagesProvider store={injected}>
      <Harness beatIndex={beatIndex} />
    </FrameImagesProvider>,
  );
}

const ready = () => waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));

const urlOf = (order: FrameOrder) => screen.getByTestId(`url-${order}`).textContent ?? '';

beforeEach(() => {
  registry.clear();
  store = new FrameImageStore(new MemoryFrameImageDriver(), fixedClock(60));
});

describe('槽位由宫格锁推导', () => {
  it('B1 三格、B5 两格，组件不提供增删帧位的入口', async () => {
    const { unmount } = renderHook(1);
    await ready();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    unmount();

    renderHook(BEAT_COUNT);
    await ready();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('空库时每格都是空态，不报错', async () => {
    renderHook(2);
    await ready();

    expect(screen.getByTestId('slot-1')).toHaveTextContent('空');
    expect(screen.getByTestId('error')).toHaveTextContent('');
    expect(urlOf(1)).toBe('');
  });
});

describe('上传与移除', () => {
  it('选中图片后落库、拿到 object URL、占用量随之更新', async () => {
    const user = userEvent.setup();
    renderHook(1);
    await ready();

    await user.upload(screen.getByLabelText('选图 2'), pngFile('hook.png', 24));

    await waitFor(() => expect(screen.getByTestId('slot-2')).toHaveTextContent('hook.png'));
    expect(urlOf(2)).toMatch(/^blob:/);
    expect(registry.has(urlOf(2))).toBe(true);
    expect(screen.getByTestId('usage')).toHaveTextContent('1/32');

    // 真落到了仓里，不只是组件内存。
    expect(await store.getMeta({ projectId, beatIndex: 1, frameOrder: 2 })).not.toBeNull();
  });

  it('只影响被改的那一格，其他格的 URL 不被换掉', async () => {
    const user = userEvent.setup();
    await store.put({ projectId, beatIndex: 1, frameOrder: 1 }, pngFile('keep.png'));
    renderHook(1);
    await ready();

    const untouched = urlOf(1);
    await user.upload(screen.getByLabelText('选图 3'), pngFile('new.png'));
    await waitFor(() => expect(screen.getByTestId('slot-3')).toHaveTextContent('new.png'));

    expect(urlOf(1)).toBe(untouched);
    expect(registry.has(untouched)).toBe(true);
  });

  it('覆盖同一格时旧 URL 被 revoke（不留泄漏）', async () => {
    const user = userEvent.setup();
    await store.put({ projectId, beatIndex: 1, frameOrder: 1 }, pngFile('old.png'));
    renderHook(1);
    await ready();

    const oldUrl = urlOf(1);
    await user.upload(screen.getByLabelText('选图 1'), pngFile('new.png'));
    await waitFor(() => expect(screen.getByTestId('slot-1')).toHaveTextContent('new.png'));

    expect(urlOf(1)).not.toBe(oldUrl);
    expect(registry.has(oldUrl)).toBe(false);
  });

  it('移除后该格回到空态，URL 被 revoke，库里也没了', async () => {
    const user = userEvent.setup();
    await store.put({ projectId, beatIndex: 1, frameOrder: 1 }, pngFile('gone.png'));
    renderHook(1);
    await ready();
    const url = urlOf(1);

    await user.click(screen.getByRole('button', { name: '移除 1' }));

    await waitFor(() => expect(screen.getByTestId('slot-1')).toHaveTextContent('空'));
    expect(registry.has(url)).toBe(false);
    expect(await store.getMeta({ projectId, beatIndex: 1, frameOrder: 1 })).toBeNull();
  });
});

describe('校验失败的呈现', () => {
  it('非图片文件不抛异常，转为可读的错误文案，且不写库', async () => {
    const user = userEvent.setup();
    renderHook(1);
    await ready();

    await user.upload(screen.getByLabelText('选图 1'), textFile());

    await waitFor(() => expect(screen.getByTestId('error')).not.toHaveTextContent(''));
    expect(screen.getByTestId('slot-1')).toHaveTextContent('空');
    expect(screen.getByTestId('state')).toHaveTextContent('ready');
    expect(await store.listBeat(projectId, 1)).toEqual([]);
  });

  it('改名伪装的文件同样被拦住', async () => {
    const user = userEvent.setup();
    renderHook(1);
    await ready();

    await user.upload(screen.getByLabelText('选图 1'), renamedTextAsPng());

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent(/不是支持的图片格式|不符/));
    expect(await store.listBeat(projectId, 1)).toEqual([]);
  });

  it('下一次成功上传会清掉上一次的错误', async () => {
    const user = userEvent.setup();
    renderHook(1);
    await ready();

    await user.upload(screen.getByLabelText('选图 1'), textFile());
    await waitFor(() => expect(screen.getByTestId('error')).not.toHaveTextContent(''));

    await user.upload(screen.getByLabelText('选图 1'), pngFile('ok.png'));
    await waitFor(() => expect(screen.getByTestId('slot-1')).toHaveTextContent('ok.png'));
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });
});

describe('生命周期', () => {
  it('卸载时把该板所有 URL 都还回去', async () => {
    await store.put({ projectId, beatIndex: 1, frameOrder: 1 }, pngFile('a.png'));
    await store.put({ projectId, beatIndex: 1, frameOrder: 2 }, pngFile('b.png'));
    const { unmount } = renderHook(1);
    await ready();

    const urls = [urlOf(1), urlOf(2)];
    expect(urls.every((url) => registry.has(url))).toBe(true);

    await act(async () => void unmount());

    expect(urls.some((url) => registry.has(url))).toBe(false);
  });

  it('切到另一块板时上一块板的 URL 被回收', async () => {
    await store.put({ projectId, beatIndex: 1, frameOrder: 1 }, pngFile('b1.png'));
    await store.put({ projectId, beatIndex: 2, frameOrder: 1 }, pngFile('b2.png'));

    const view = renderHook(1);
    await ready();
    const firstUrl = urlOf(1);

    view.rerender(
      <FrameImagesProvider store={store}>
        <Harness beatIndex={2} />
      </FrameImagesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('slot-1')).toHaveTextContent('b2.png'));

    expect(registry.has(firstUrl)).toBe(false);
    expect(registry.has(urlOf(1))).toBe(true);
  });

  it('重新挂载（等价于刷新页面）后图片仍在，URL 是新建的', async () => {
    const persistent = new FrameImageStore(new IndexedDbFrameImageDriver(indexedDB), fixedClock(60));
    await persistent.clear();
    await persistent.put({ projectId, beatIndex: 1, frameOrder: 1 }, pngFile('survives.png', 40));

    const first = renderHook(1, persistent);
    await ready();
    const before = urlOf(1);
    await act(async () => void first.unmount());

    renderHook(1, persistent);
    await ready();

    expect(screen.getByTestId('slot-1')).toHaveTextContent('survives.png');
    expect(urlOf(1)).toMatch(/^blob:/);
    expect(urlOf(1)).not.toBe(before);
    expect(registry.has(urlOf(1))).toBe(true);
  });
});
