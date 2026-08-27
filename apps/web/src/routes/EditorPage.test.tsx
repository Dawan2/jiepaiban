/**
 * 编辑页的持久化接线回归：读出 → 改动 → 落盘（`FR-2-11`）。
 * 宫格编辑器本身属 WK3，此处只验证保存链路对"不进 Prompt"字段已经通了。
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BEAT_COUNT } from '../domain/beats';
import type { LocalRepository } from '../adapters/persistence';
import { makeProject, renderApp, seedRepository } from '../testing/harness';

let repository: LocalRepository;

beforeEach(async () => {
  repository = await seedRepository([makeProject('prj_1', { name: '第一集' })]);
});

const ready = () => waitFor(() => expect(screen.queryByText(/读取项目/)).toBeNull());

describe('编辑页读取', () => {
  it('项目与 5 块板从本地仓储读出', async () => {
    renderApp('/p/prj_1', { repository });
    await ready();

    expect(screen.getByText('第一集')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /钩子|冲突|升级|反转/ }).length).toBeGreaterThanOrEqual(
      BEAT_COUNT - 1,
    );
  });

  it('顶部栏显示单集总时长（基准轴 88 秒）', async () => {
    renderApp('/p/prj_1', { repository });
    await ready();

    expect(screen.getByText(/单集总时长 88 秒/)).toBeInTheDocument();
  });

  it('B5 显示 2 宫格，B1 显示 3 宫格（RULE-3）', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });
    await ready();

    expect(screen.getByText(/3 宫格/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /悬念钩子/ }));
    expect(screen.getByText(/2 宫格/)).toBeInTheDocument();
  });
});

describe('保存（FR-2-11）', () => {
  it('改节拍名称后失焦即落盘', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });
    await ready();

    const input = screen.getByLabelText('节拍名称');
    await user.clear(input);
    await user.type(input, '开篇钩子');
    await user.tab();

    await waitFor(async () => {
      const stored = await repository.load('prj_1');
      expect(stored?.beats[0]?.name).toBe('开篇钩子');
    });
  });

  it('改备注后手动点保存立即落盘', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });
    await ready();

    await user.type(screen.getByLabelText('备注'), '记一句：这拍要更快');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(async () => {
      const stored = await repository.load('prj_1');
      expect(stored?.beats[0]?.note).toBe('记一句：这拍要更快');
    });
  });

  it('顶部栏保存态从未保存转为已保存', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });
    await ready();

    expect(screen.getByRole('status', { name: /保存状态/ })).toHaveTextContent('已保存');

    await user.type(screen.getByLabelText('备注'), '改一下');
    expect(screen.getByRole('status', { name: /保存状态/ })).toHaveTextContent('未保存');

    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /保存状态/ })).toHaveTextContent('已保存'),
    );
  });

  it('落盘不会破坏五节拍锁与宫格锁', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });
    await ready();

    await user.type(screen.getByLabelText('备注'), '随手记');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(async () => {
      const stored = await repository.load('prj_1');
      expect(stored?.beats).toHaveLength(BEAT_COUNT);
      expect(stored?.beats.map((beat) => beat.gridSize)).toEqual([3, 3, 3, 3, 2]);
    });
  });
});
