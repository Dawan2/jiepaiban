/**
 * 保存引擎回归（`FR-2-11` 自动保存 + 手动保存 + 保存态可见）。
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewProjectInput } from '../domain/projects';
import type { StoredProject } from '../adapters/persistence';
import { CANON_TOTAL_DURATION_SEC, createEmptyProject } from './projectFactory';
import { SAVE_STATE_LABEL, useProjectEditor } from './useProjectEditor';

const input: NewProjectInput = {
  name: '第一集',
  genre: '末世·爽剧',
  aspect_ratio: '9:16',
  total_duration_sec: CANON_TOTAL_DURATION_SEC,
  style_prompt: '冷调赛博废土',
  protagonist: '短发女青年',
};

const project = (): StoredProject => createEmptyProject(input, 'prj_1', '2026-08-27T00:00:00.000Z');

const DEBOUNCE = 2000;

/** 显式标注入参类型，断言里才能读到 `save` 收到的项目。 */
const saveSpy = () => vi.fn<(project: StoredProject) => Promise<void>>(async () => {});

/** 极简宿主：只暴露"改一个字段"与保存态，便于断言引擎本身而非某个页面。 */
function Host({
  source,
  save,
}: {
  source: StoredProject | null;
  save: (project: StoredProject) => Promise<void>;
}) {
  const editor = useProjectEditor(source, { save, debounceMs: DEBOUNCE });
  return (
    <div>
      <span data-testid="state">{SAVE_STATE_LABEL[editor.saveState]}</span>
      <span data-testid="name">{editor.draft?.name ?? '—'}</span>
      <button type="button" onClick={() => editor.update((p) => ({ ...p, name: `${p.name}改` }))}>
        改名
      </button>
      <button type="button" onClick={() => void editor.saveNow()}>
        保存
      </button>
    </div>
  );
}

describe('自动保存（防抖 2 秒）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // 假定时器下不用 userEvent（它自带的 delay 会和假时钟互相等待），改用同步 fireEvent。
  const click = async (label: string) => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: label }));
    });
  };

  it('改动后进入未保存态，防抖窗口内不写盘', async () => {
    const save = saveSpy();
    render(<Host source={project()} save={save} />);

    await click('改名');
    expect(screen.getByTestId('state')).toHaveTextContent('未保存');

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE - 100);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('防抖到点后自动写盘一次，并回到已保存态', async () => {
    const save = saveSpy();
    render(<Host source={project()} save={save} />);

    await click('改名');
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toMatchObject({ id: 'prj_1', name: '第一集改' });
    expect(screen.getByTestId('state')).toHaveTextContent('已保存');
  });

  it('连续改动只在最后一次之后写盘一次（防抖而非节流）', async () => {
    const save = saveSpy();
    render(<Host source={project()} save={save} />);

    await click('改名');
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    await click('改名');
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    await click('改名');
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toMatchObject({ name: '第一集改改改' });
  });

  it('写盘失败时停在保存失败态，改动仍留在草稿里', async () => {
    const save = vi.fn(async () => {
      throw new Error('库满了');
    });
    render(<Host source={project()} save={save} />);

    await click('改名');
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });

    expect(screen.getByTestId('state')).toHaveTextContent('保存失败');
    expect(screen.getByTestId('name')).toHaveTextContent('第一集改');
  });

  it('保存失败后再次触发会重试，成功即回到已保存态', async () => {
    const save = vi
      .fn<(project: StoredProject) => Promise<void>>()
      .mockRejectedValueOnce(new Error('库满了'))
      .mockResolvedValue(undefined);
    render(<Host source={project()} save={save} />);

    await click('改名');
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE);
    });
    expect(screen.getByTestId('state')).toHaveTextContent('保存失败');

    await click('保存');
    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('state')).toHaveTextContent('已保存');
  });
});

describe('手动保存与强制 flush', () => {
  it('点保存立即写盘，不等防抖', async () => {
    const save = saveSpy();
    const user = userEvent.setup();
    render(<Host source={project()} save={save} />);

    await user.click(screen.getByRole('button', { name: '改名' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state')).toHaveTextContent('已保存');
  });

  it('卸载时把未保存的改动强制落盘（离开页面不丢数据）', async () => {
    const save = saveSpy();
    const user = userEvent.setup();
    const view = render(<Host source={project()} save={save} />);

    await user.click(screen.getByRole('button', { name: '改名' }));
    expect(save).not.toHaveBeenCalled();

    view.unmount();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toMatchObject({ name: '第一集改' });
  });

  it('保存后仓储重读（source 换了对象身份）不回滚正在输入的改动', async () => {
    const save = saveSpy();
    const user = userEvent.setup();
    const source = project();
    const view = render(<Host source={source} save={save} />);

    await user.click(screen.getByRole('button', { name: '改名' }));
    expect(screen.getByTestId('name')).toHaveTextContent('第一集改');

    // 仓储 refresh 后会产出一个内容相同、身份不同的新对象。
    view.rerender(<Host source={{ ...source }} save={save} />);

    expect(screen.getByTestId('name')).toHaveTextContent('第一集改');
    expect(screen.getByTestId('state')).toHaveTextContent('未保存');
  });

  it('切换到另一个项目时丢弃上一份草稿', async () => {
    const save = saveSpy();
    const user = userEvent.setup();
    const view = render(<Host source={project()} save={save} />);

    await user.click(screen.getByRole('button', { name: '改名' }));
    expect(screen.getByTestId('name')).toHaveTextContent('第一集改');

    view.rerender(<Host source={{ ...project(), id: 'prj_2', name: '第二集' }} save={save} />);

    expect(screen.getByTestId('name')).toHaveTextContent('第二集');
    expect(screen.getByTestId('state')).toHaveTextContent('已保存');
  });

  it('草稿尚未同步时的第一次输入不会被丢掉', async () => {
    const save = saveSpy();
    const user = userEvent.setup();
    const source = project();

    // 首屏 source 为 null（仍在读库），随后项目到位；此时同步草稿的 effect
    // 与用户的第一次输入可能落在同一帧里。
    const view = render(<Host source={null} save={save} />);
    view.rerender(<Host source={source} save={save} />);

    await user.click(screen.getByRole('button', { name: '改名' }));

    expect(screen.getByTestId('name')).toHaveTextContent('第一集改');
  });

  it('没有项目时不写盘，也不报错', async () => {
    const save = saveSpy();
    const user = userEvent.setup();
    render(<Host source={null} save={save} />);

    await user.click(screen.getByRole('button', { name: '改名' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(save).not.toHaveBeenCalled();
  });
});
