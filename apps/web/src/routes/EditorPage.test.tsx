/**
 * 编辑页的接线回归：读出 → 改动 → 落盘（`FR-2-11`），以及生成结果回写。
 *
 * 这一页是三条链路的汇合点，所以断言都跑在**真实的编辑区控件**上：
 * 改的是 WK3 的宫格 / 剧情核心 / 衔接要点，落的是持久化层的 5 板结构。
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BEAT_COUNT } from '../domain/beats';
import type { LocalRepository } from '../adapters/persistence';
import { makeProject, renderApp, seedRepository, withFilledBeats } from '../testing/harness';

let repository: LocalRepository;

beforeEach(async () => {
  repository = await seedRepository([makeProject('prj_1', { name: '第一集' })]);
});

const ready = () => waitFor(() => expect(screen.queryByText(/读取项目/)).toBeNull());

const saveButton = () => screen.getByRole('button', { name: '保存' });
const saveState = () => screen.getByRole('status', { name: /保存状态/ });

function gridCells() {
  return within(screen.getByRole('list', { name: /宫格/ })).getAllByRole('listitem');
}

describe('编辑页读取', () => {
  it('项目与 5 块板从本地仓储读出', async () => {
    renderApp('/p/prj_1', { repository });
    await ready();

    expect(screen.getByText('第一集')).toBeInTheDocument();
    const beatNav = screen.getByRole('list', { name: '五节拍导航' });
    expect(within(beatNav).getAllByRole('button')).toHaveLength(BEAT_COUNT);
  });

  it('板时长合计对齐 88 秒基准轴，不出现偏差提示', async () => {
    renderApp('/p/prj_1', { repository });
    await ready();

    expect(screen.getByText('88s / 88s')).toBeInTheDocument();
    expect(screen.queryByText(/偏离/)).toBeNull();
  });

  it('B1 渲染 3 格、B5 渲染 2 格（RULE-3）', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });
    await ready();

    expect(gridCells()).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: /断集留客/ }));
    expect(gridCells()).toHaveLength(2);
  });
});

describe('保存（FR-2-11）', () => {
  it('改剧情核心后点保存即落盘', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });
    await ready();

    await user.type(screen.getByLabelText('剧情核心'), '雨夜巷口，女主被堵');
    await user.click(saveButton());

    await waitFor(async () => {
      const stored = await repository.load('prj_1');
      expect(stored?.beat_list[0]?.plot_core).toBe('雨夜巷口，女主被堵');
    });
  });

  it('改宫格画面描述后点保存即落盘', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });
    await ready();

    const first = gridCells()[0];
    await user.type(within(first as HTMLElement).getByRole('textbox'), '铁门被踹开');
    await user.click(saveButton());

    await waitFor(async () => {
      const stored = await repository.load('prj_1');
      expect(stored?.beat_list[0]?.frames[0]?.text).toBe('铁门被踹开');
    });
  });

  it('衔接要点落到不进 Prompt 的备注位（AC-6.4）', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });
    await ready();

    await user.type(screen.getByLabelText(/操作要点/), '黑场后女主已在医院');
    await user.click(saveButton());

    await waitFor(async () => {
      const stored = await repository.load('prj_1');
      expect(stored?.beat_list[0]?.note).toBe('黑场后女主已在医院');
      // 备注入库，但绝不进 Prompt 快照。
      expect(stored?.beat_list[0]?.prompt_final).toBeNull();
    });
  });

  it('顶部栏保存态从未保存转为已保存', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });
    await ready();

    expect(saveState()).toHaveTextContent('已保存');

    await user.type(screen.getByLabelText('剧情核心'), '改一下');
    expect(saveState()).toHaveTextContent('未保存');

    await user.click(saveButton());
    await waitFor(() => expect(saveState()).toHaveTextContent('已保存'));
  });

  it('打开页面不算改动：没动过就不该显示未保存', async () => {
    renderApp('/p/prj_1', { repository });
    await ready();

    expect(saveState()).toHaveTextContent('已保存');
  });

  it('落盘不会破坏五节拍锁与宫格锁', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1', { repository });
    await ready();

    await user.type(screen.getByLabelText('剧情核心'), '随手记');
    await user.click(saveButton());

    await waitFor(async () => {
      const stored = await repository.load('prj_1');
      expect(stored?.beat_list).toHaveLength(BEAT_COUNT);
      expect(stored?.beat_list.map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
    });
  });
});

describe('生成结果回写（PRD §8.2 video_url）', () => {
  beforeEach(async () => {
    repository = await seedRepository([
      withFilledBeats(makeProject('prj_filled', { name: '填齐的一集' })),
    ]);
  });

  it('生成成功后 video_url 与 prompt_final 落库', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_filled', { repository });
    await ready();

    await user.click(screen.getByRole('button', { name: '生成本板' }));
    await user.click(saveButton());

    await waitFor(async () => {
      const stored = await repository.load('prj_filled');
      const first = stored?.beat_list[0];
      expect(first?.video_url).toMatch(/^stub:\/\/seedance-2\.5/);
      expect(first?.prompt_final).not.toBeNull();
      expect(first?.status).toBe('generated');
    });
  });

  it('落库的 Prompt 快照里没有衔接手法（AC-6.4）', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_filled', { repository });
    await ready();

    await user.click(screen.getByRole('button', { name: '生成全集' }));
    await user.click(saveButton());

    await waitFor(async () => {
      const stored = await repository.load('prj_filled');
      const snapshots = stored?.beat_list.map((beat) => beat.prompt_final) ?? [];
      expect(snapshots.every((snapshot) => snapshot !== null)).toBe(true);
      stored?.beat_list.forEach((beat) => {
        expect(beat.prompt_final ?? '').not.toContain(beat.transition_rule);
      });
    });
  });
});
