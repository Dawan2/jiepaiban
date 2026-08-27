/**
 * 编辑页的接线回归：读出 → 改动 → 落盘（`FR-2-11`），以及生成结果回写。
 *
 * 这一页是三条链路的汇合点，所以断言都跑在**真实的编辑区控件**上：
 * 改的是 WK3 的宫格 / 剧情核心 / 衔接要点，落的是持久化层的 5 板结构。
 */

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BEAT_COUNT } from '../domain/beats';
import { BANQUET_HOOK_TEMPLATE } from '../domain/templates';
import type { LocalRepository } from '../adapters/persistence';
import {
  makeProject,
  makeTemplateProject,
  renderApp,
  seedRepository,
  withFilledBeats,
} from '../testing/harness';

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

    await user.type(screen.getByRole('textbox', { name: '剧情核心' }), '雨夜巷口，女主被堵');
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

    await user.type(screen.getByRole('textbox', { name: '剧情核心' }), '改一下');
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

    await user.type(screen.getByRole('textbox', { name: '剧情核心' }), '随手记');
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

  it('不点保存、不等 2 秒防抖，成片地址就已经在库里', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_filled', { repository });
    await ready();

    await user.click(screen.getByRole('button', { name: '生成本板' }));

    await waitFor(async () => {
      const stored = await repository.load('prj_filled');
      expect(stored?.beat_list[0]?.video_url).toMatch(/^stub:\/\/seedance-2\.5/);
    });
    // 生成结果不是用户改动：落库通道独立，顶部栏不该跳成「未保存」。
    expect(saveState()).toHaveTextContent('已保存');
  });

  it('点完生成就离页（任务在卸载之后才收尾），成片地址照样落库', async () => {
    const view = renderApp('/p/prj_filled', { repository });
    await ready();

    // 故意不 await：click 之后一个微任务都不让出去，任务还停在「生成中」就把页面卸掉。
    // 于是这条断言只能由挂在状态机上的落库通道满足——编辑页已经没了。
    fireEvent.click(screen.getByRole('button', { name: '生成本板' }));
    view.unmount();

    await waitFor(async () => {
      const stored = await repository.load('prj_filled');
      expect(stored?.beat_list[0]?.video_url).toMatch(/^stub:\/\/seedance-2\.5/);
      expect(stored?.beat_list[0]?.prompt_final).not.toBeNull();
      expect(stored?.beat_list[0]?.status).toBe('generated');
    });
  });

  it('生成之后再编辑一次并保存，不会把成片地址与已生成态盖回空', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_filled', { repository });
    await ready();

    await user.click(screen.getByRole('button', { name: '生成本板' }));
    await waitFor(async () => {
      expect((await repository.load('prj_filled'))?.beat_list[0]?.video_url).not.toBeNull();
    });

    await user.type(screen.getByRole('textbox', { name: '剧情核心' }), '改一版');
    await user.click(saveButton());

    await waitFor(async () => {
      const stored = await repository.load('prj_filled');
      expect(stored?.beat_list[0]?.plot_core).toContain('改一版');
      expect(stored?.beat_list[0]?.video_url).toMatch(/^stub:\/\/seedance-2\.5/);
      expect(stored?.beat_list[0]?.status).toBe('generated');
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

/**
 * W8 合并缝：模板起手路径与生成结果落库通道在**同一块板**上碰面。
 *
 * 两边各自都测过，但它们共用 `beat_list` 的写盘与 `beat.status` 一个字段：
 * 模板路径靠 `status: 'filled'` 表达「这是一份可改写的起手稿」，落库通道则要把同一个
 * 字段推到 `generated`。谁盖掉谁都不会让两边原有的用例变红，所以在这里钉住。
 */
describe('模板起手的项目跑生成（W8 合并缝）', () => {
  const TEMPLATE_B1 = BANQUET_HOOK_TEMPLATE.beat_list[0];

  beforeEach(async () => {
    repository = await seedRepository([makeTemplateProject('prj_tpl', { name: '套模板的一集' })]);
  });

  it('模板文案落库即可直接生成，不必先自己填满 5 块板', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_tpl', { repository });
    await ready();

    // 「生成本板」可点，就是模板起手内容通过了生成前置校验。
    expect(screen.getByRole('button', { name: '生成本板' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '生成本板' }));

    await waitFor(async () => {
      const stored = await repository.load('prj_tpl');
      expect(stored?.beat_list[0]?.video_url).toMatch(/^stub:\/\/seedance-2\.5/);
    });
  });

  it('落库通道把 status 推到 generated，模板起手文案原样留着', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_tpl', { repository });
    await ready();

    await user.click(screen.getByRole('button', { name: '生成本板' }));

    await waitFor(async () => {
      const stored = await repository.load('prj_tpl');
      const first = stored?.beat_list[0];
      expect(first?.status).toBe('generated');
      // 生成只动生成期字段：模板给的情绪 / 节奏 / 剧情核心 / 帧描述一个字都不该变。
      expect(first?.plot_core).toBe(TEMPLATE_B1?.plot_core);
      expect(first?.emotion).toBe(TEMPLATE_B1?.emotion);
      expect(first?.camera_rhythm).toBe(TEMPLATE_B1?.camera_rhythm);
      expect(first?.frames.map((frame) => frame.text)).toEqual(TEMPLATE_B1?.frame_texts);
    });
    // 生成结果不是用户改动，模板项目也一样不该跳成「未保存」。
    expect(saveState()).toHaveTextContent('已保存');
  });

  it('没生成的那几板留在 filled，不被落库通道连带改写', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_tpl', { repository });
    await ready();

    await user.click(screen.getByRole('button', { name: '生成本板' }));
    await waitFor(async () => {
      expect((await repository.load('prj_tpl'))?.beat_list[0]?.status).toBe('generated');
    });

    const stored = await repository.load('prj_tpl');
    expect(stored?.beat_list.slice(1).map((beat) => beat.status)).toEqual([
      'filled',
      'filled',
      'filled',
      'filled',
    ]);
    expect(stored?.beat_list.slice(1).every((beat) => beat.video_url === null)).toBe(true);
  });

  it('模板项目点完生成就离页，结果照样落库（挂点在状态机上，不在编辑页）', async () => {
    const view = renderApp('/p/prj_tpl', { repository });
    await ready();

    // 同上：不 await，任务还停在「生成中」就卸掉页面，只有 onSettle 通道能满足断言。
    fireEvent.click(screen.getByRole('button', { name: '生成本板' }));
    view.unmount();

    await waitFor(async () => {
      const stored = await repository.load('prj_tpl');
      const first = stored?.beat_list[0];
      expect(first?.video_url).toMatch(/^stub:\/\/seedance-2\.5/);
      expect(first?.status).toBe('generated');
      expect(first?.plot_core).toBe(TEMPLATE_B1?.plot_core);
    });
  });

  it('生成后改写模板起手稿再保存，成片地址与已生成态都不被盖回', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_tpl', { repository });
    await ready();

    await user.click(screen.getByRole('button', { name: '生成本板' }));
    await waitFor(async () => {
      expect((await repository.load('prj_tpl'))?.beat_list[0]?.video_url).not.toBeNull();
    });

    // 模板起手稿的用法就是逐字改写：清掉再写一版，模拟真实改稿。
    const plot = screen.getByRole('textbox', { name: '剧情核心' });
    await user.clear(plot);
    await user.type(plot, '改写模板给的这一句');
    await user.click(saveButton());

    await waitFor(async () => {
      const stored = await repository.load('prj_tpl');
      const first = stored?.beat_list[0];
      expect(first?.plot_core).toBe('改写模板给的这一句');
      expect(first?.video_url).toMatch(/^stub:\/\/seedance-2\.5/);
      expect(first?.status).toBe('generated');
    });
  });

  it('整集生成后 5 块板全部落库，结构锁不变', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_tpl', { repository });
    await ready();

    await user.click(screen.getByRole('button', { name: '生成全集' }));

    await waitFor(async () => {
      const stored = await repository.load('prj_tpl');
      expect(stored?.beat_list.map((beat) => beat.status)).toEqual(
        Array.from({ length: BEAT_COUNT }, () => 'generated'),
      );
    });

    const stored = await repository.load('prj_tpl');
    expect(stored?.beat_list).toHaveLength(BEAT_COUNT);
    expect(stored?.beat_list.map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
    // 模板文案进了 Prompt 快照，衔接手法照旧进不去（AC-6.4）。
    stored?.beat_list.forEach((beat) => {
      expect(beat.prompt_final).not.toBeNull();
      expect(beat.prompt_final ?? '').not.toContain(beat.transition_rule);
    });
  });
});
