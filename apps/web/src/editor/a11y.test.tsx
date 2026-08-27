/**
 * 编辑页无障碍与键盘操作测试（W4-A11Y）。
 *
 * 这一档守的是「不用鼠标、不看屏幕，这块编辑器还能不能作业」，具体四件事：
 *   1. 左侧 5 板全部键盘可达，当前板由 `aria-current` 单点标出（PRD 5.2.1 / AC-6.1）；
 *   2. 14 个宫格文本域各有唯一无障碍名——同名三份等于告诉屏幕阅读器用户"随便填一个"；
 *   3. 焦点顺序 = 作业顺序：信息条 → 宫格左→右 → 组间衔接 → Prompt 预览，
 *      其中衔接与预览是 complementary 地标，与主线内容分列（呼应 AC-6.4 的红线）；
 *   4. 主区里每个可操作控件都有非空无障碍名，一个都不许漏。
 *
 * 全程用 user-event 驱动真实键盘事件（Tab / 方向键 / Enter），不直接调 `focus()` 造状态。
 */

import { screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { computeAccessibleName } from 'dom-accessibility-api';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LocalRepository } from '../adapters/persistence';
import { MAIN_CONTENT_ID } from '../components/AppLayout';
import { BEAT_COUNT, FRAME_COUNT_BY_BEAT_INDEX, type BeatIndex } from '../domain/beats';
import { makeProject, renderApp, seedRepository } from '../testing/harness';

const projectId = 'prj_a11y_1';

const BEAT_TITLES = ['开篇钩子', '矛盾建立', '打压升级', '反转蓄力', '断集留客'] as const;

/** 可聚焦控件；`tabindex="-1"` 的成员在取 Tab 序时再单独排除。 */
const INTERACTIVE = 'a[href], button, input, select, textarea';

let repository: LocalRepository;

/** 项目从内存仓储读出来再渲染：无障碍树跑在真实的读库路径上，不是硬编码常量上。 */
async function renderEditor() {
  const result = renderApp(`/p/${projectId}`, { repository });
  await screen.findByRole('list', { name: '五节拍导航' });
  return result;
}

function beatNav() {
  return screen.getByRole('list', { name: '五节拍导航' });
}

function beatButtons() {
  return within(beatNav()).getAllByRole('button');
}

function mainRegion() {
  return screen.getByRole('main');
}

/** 按 Tab `steps` 次，记录每一步落到的元素。 */
async function tabTrail(user: UserEvent, steps: number): Promise<readonly Element[]> {
  const trail: Element[] = [];
  for (let i = 0; i < steps; i += 1) {
    await user.tab();
    if (document.activeElement !== null) {
      trail.push(document.activeElement);
    }
  }
  return trail;
}

/** 元素在 Tab 序里的首次出现位次；没出现就直接失败，避免 -1 参与比较后静默通过。 */
function tabIndexOf(trail: readonly Element[], element: Element, what: string): number {
  const at = trail.indexOf(element);
  if (at === -1) {
    throw new Error(`Tab 序中未出现「${what}」`);
  }
  return at;
}

/** a 在 DOM 中是否排在 b 前面。 */
function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function frameTextbox(order: number) {
  return screen.getByRole('textbox', { name: `节拍帧${order} 画面描述` });
}

async function selectBeat(user: UserEvent, index: BeatIndex) {
  const button = beatButtons()[index - 1];
  if (button === undefined) {
    throw new Error(`节拍导航缺少第 ${index} 项`);
  }
  await user.click(button);
}

beforeEach(async () => {
  repository = await seedRepository([makeProject(projectId)]);
  await renderEditor();
});

describe('左侧五板：键盘可达 + aria-current（PRD 5.2.1 / AC-6.1）', () => {
  it('5 块板全在 Tab 序里，且顺序即板序', async () => {
    const user = userEvent.setup();
    const buttons = beatButtons();
    expect(buttons).toHaveLength(BEAT_COUNT);

    // 从 body 起连按 Tab，5 块板必须逐一被 Tab 到，中间不插入别的落点。
    const trail = await tabTrail(user, 12);
    const positions = buttons.map((button, i) =>
      tabIndexOf(trail, button, `第 ${i + 1} 块板`),
    );

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    positions.slice(1).forEach((at, i) => {
      expect(at).toBe((positions[i] ?? -1) + 1);
    });
  });

  it('Tab 到某块板后按 Enter 即切板，无需鼠标', async () => {
    const user = userEvent.setup();
    const target = beatButtons()[2];
    if (target === undefined) {
      throw new Error('缺少第 3 块板');
    }

    const trail = await tabTrail(user, 12);
    tabIndexOf(trail, target, '第 3 块板');
    target.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('heading', { level: 2, name: /节拍3/ })).toBeInTheDocument();
  });

  it('空格键同样能切板（button 的默认语义没有被 onKeyDown 吃掉）', async () => {
    const user = userEvent.setup();
    const target = beatButtons()[4];
    if (target === undefined) {
      throw new Error('缺少第 5 块板');
    }

    target.focus();
    await user.keyboard(' ');

    expect(screen.getByRole('heading', { level: 2, name: /节拍5/ })).toBeInTheDocument();
  });

  it('方向键在 5 板之间移动焦点并同步切板', async () => {
    const user = userEvent.setup();
    beatButtons()[0]?.focus();

    for (const [step, index] of ([1, 2, 3, 4] as const).entries()) {
      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(beatButtons()[index]);
      expect(
        screen.getByRole('heading', { level: 2, name: new RegExp(`节拍${step + 2}`) }),
      ).toBeInTheDocument();
    }

    // ArrowRight / ArrowLeft 与上下等价：左导航是一列，但方向键不该挑剔轴向。
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(beatButtons()[3]);
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(beatButtons()[4]);
  });

  it('方向键在首尾回环，Home / End 直达首尾', async () => {
    const user = userEvent.setup();
    beatButtons()[0]?.focus();

    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(beatButtons()[BEAT_COUNT - 1]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(beatButtons()[0]);

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(beatButtons()[BEAT_COUNT - 1]);
    expect(screen.getByRole('heading', { level: 2, name: /节拍5/ })).toBeInTheDocument();

    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(beatButtons()[0]);
    expect(screen.getByRole('heading', { level: 2, name: /节拍1/ })).toBeInTheDocument();
  });

  it('aria-current 恒只有一个，且指向当前板', async () => {
    const user = userEvent.setup();

    for (const [i, title] of BEAT_TITLES.entries()) {
      const index = (i + 1) as BeatIndex;
      await selectBeat(user, index);

      const marked = beatButtons().filter((button) => button.hasAttribute('aria-current'));
      expect(marked).toHaveLength(1);
      expect(marked[0]).toHaveAttribute('aria-current', 'step');
      expect(marked[0]?.textContent).toContain(title);
      expect(marked[0]).toBe(beatButtons()[i]);
    }
  });

  it('节拍状态不只靠颜色传达：每块板都带可读状态文本（WCAG 1.4.1）', () => {
    beatButtons().forEach((button) => {
      expect(computeAccessibleName(button)).toMatch(/未填|已填|生成中|已生成|失败/);
    });
  });
});

describe('宫格文本域：逐格唯一命名（节拍帧1/2/3）', () => {
  it.each([1, 2, 3, 4, 5] as const)('B%i 每格文本域名为「节拍帧N 画面描述」且互不重名', async (index) => {
    const user = userEvent.setup();
    await selectBeat(user, index);

    const count = FRAME_COUNT_BY_BEAT_INDEX[index];
    const names = within(screen.getByRole('list', { name: /宫格/ }))
      .getAllByRole('textbox')
      .map((box) => computeAccessibleName(box));

    expect(names).toEqual(
      Array.from({ length: count }, (_, i) => `节拍帧${i + 1} 画面描述`),
    );
    expect(new Set(names).size).toBe(count);
  });

  it('可见标签「画面描述」是无障碍名的子串（WCAG 2.5.3 Label in Name）', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    within(screen.getByRole('list', { name: /宫格/ }))
      .getAllByRole('textbox')
      .forEach((box) => {
        expect(computeAccessibleName(box)).toContain('画面描述');
      });
  });

  it('按名字定位到某一格就能直接键入，写进的是那一格', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    await user.click(frameTextbox(2));
    await user.keyboard('新娘瞳孔骤缩');

    expect(frameTextbox(2)).toHaveValue('新娘瞳孔骤缩');
    expect(frameTextbox(1)).toHaveValue('');
    expect(frameTextbox(3)).toHaveValue('');
  });

  it('参考图入口同样按格命名，且视觉隐藏的 file input 不占 Tab 位', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    const trail = await tabTrail(user, 26);
    for (const order of [1, 2, 3] as const) {
      const trigger = screen.getByRole('button', { name: `为节拍帧${order}选择参考图` });
      tabIndexOf(trail, trigger, `节拍帧${order} 参考图按钮`);

      const fileInput = screen.getByLabelText(`节拍帧${order} 参考图`);
      expect(fileInput).toHaveAttribute('type', 'file');
      expect(fileInput).toHaveAttribute('tabindex', '-1');
      expect(trail).not.toContain(fileInput);
    }
  });
});

describe('焦点顺序：信息条 → 宫格左→右 → 组间衔接 → Prompt 预览', () => {
  it('Tab 序按作业顺序推进，宫格严格左→右', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    const trail = await tabTrail(user, 26);
    const at = (element: Element, what: string) => tabIndexOf(trail, element, what);

    const tone = at(screen.getByLabelText(/情绪基调/), '情绪基调');
    const duration = at(screen.getByLabelText(/本拍时长/), '本拍时长');
    const frames = ([1, 2, 3] as const).map((order) =>
      at(frameTextbox(order), `节拍帧${order}`),
    );
    const transitionNote = at(screen.getByLabelText(/操作要点/), '衔接操作要点');

    // 信息条在最前。
    expect(tone).toBeLessThan(duration);
    expect(duration).toBeLessThan(frames[0] ?? -1);
    // 宫格左 → 右，即时序；这是帧序锁在键盘上的样子。
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
    // 衔接在宫格之后。
    expect(frames[2] ?? -1).toBeLessThan(transitionNote);
  });

  it('衔接手法单选钮在 Tab 序里位于宫格之后、操作要点之前', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    const trail = await tabTrail(user, 26);
    const transition = screen.getByRole('complementary', { name: '组间衔接' });
    const radios = within(transition).getAllByRole('radio');
    // 单选组只留一个 Tab 位（组内用方向键），取被 Tab 到的那一个。
    const radioStop = radios.find((radio) => trail.includes(radio));
    expect(radioStop).toBeDefined();

    const lastFrame = tabIndexOf(trail, frameTextbox(3), '节拍帧3');
    const note = tabIndexOf(trail, screen.getByLabelText(/操作要点/), '衔接操作要点');
    const radioAt = tabIndexOf(trail, radioStop as Element, '衔接手法');

    expect(lastFrame).toBeLessThan(radioAt);
    expect(radioAt).toBeLessThan(note);
  });

  it('方向键可在封闭的 6 个衔接手法之间选择，不必逐个 Tab', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    const transition = screen.getByRole('complementary', { name: '组间衔接' });
    const radios = within(transition).getAllByRole('radio');
    const checkedAt = radios.findIndex((radio) => (radio as HTMLInputElement).checked);
    expect(checkedAt).toBeGreaterThanOrEqual(0);

    radios[checkedAt]?.focus();
    await user.keyboard('{ArrowDown}');

    const next = radios[(checkedAt + 1) % radios.length];
    expect(next).toBeChecked();
  });

  it('四个区块的 DOM 顺序与朗读顺序一致（Prompt 预览无控件，只能按 DOM 序校）', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    const infobar = screen.getByRole('region', { name: '节拍信息条' });
    const grid = screen.getByRole('list', { name: /宫格/ });
    const transition = screen.getByRole('complementary', { name: '组间衔接' });
    const preview = screen.getByRole('complementary', { name: 'Prompt 预览' });

    expect(precedes(infobar, grid)).toBe(true);
    expect(precedes(grid, transition)).toBe(true);
    expect(precedes(transition, preview)).toBe(true);
  });

  it('宫格列表项按帧序排列，每项自带格名', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    const cells = within(screen.getByRole('list', { name: /宫格/ })).getAllByRole('listitem');
    cells.forEach((cell, i) => {
      expect(computeAccessibleName(cell)).toContain(`格 ${i + 1}`);
      if (i > 0) {
        expect(precedes(cells[i - 1] as Element, cell)).toBe(true);
      }
    });
  });
});

describe('地标：衔接与预览是主线之外的旁支（AC-6.4）', () => {
  it('组间衔接与 Prompt 预览各为一个具名 complementary 地标', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    const asides = within(mainRegion()).getAllByRole('complementary');
    expect(asides.map((aside) => computeAccessibleName(aside))).toEqual([
      '组间衔接',
      'Prompt 预览',
    ]);
  });

  it('B5 无接缝时衔接地标仍在，只是内容改为"本集不设衔接"', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 5);

    const transition = screen.getByRole('complementary', { name: '组间衔接' });
    expect(within(transition).getByText(/本集不设衔接/)).toBeInTheDocument();
    expect(within(transition).queryAllByRole('radio')).toHaveLength(0);
  });

  it('Prompt 全文是有名字的分组，不是只挂了 aria-label 的裸 div', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    const body = screen.getByRole('group', { name: 'Prompt 全文' });
    expect(body).toBeInTheDocument();
  });

  it('就绪 / 待补全由 status 播报，键盘用户不必回头确认', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    const preview = screen.getByRole('complementary', { name: 'Prompt 预览' });
    expect(within(preview).getByRole('status')).toHaveTextContent('待补全');

    // 逐项都用无障碍名定位：这条路径本身就是键盘 / 屏幕阅读器用户补齐一板的走法。
    await user.selectOptions(screen.getByLabelText(/情绪基调/), '紧张');
    await user.click(screen.getByRole('textbox', { name: '剧情核心' }));
    await user.keyboard('雨夜巷口被堵');
    await user.click(screen.getByRole('textbox', { name: /镜头节奏/ }));
    await user.keyboard('极快切入');
    for (const order of [1, 2, 3] as const) {
      await user.click(frameTextbox(order));
      await user.keyboard('画面内容');
    }

    expect(within(preview).getByRole('status')).toHaveTextContent('就绪');
  });

  /**
   * W8 合并缝：本槽位原先断言「全页恰一个 `role="status"`」，那条断言防的是
   * 信息条的只读值借 `<output>` 的隐式 live region 抢播（见 §5）。落库线随后给顶部栏
   * 加了「未保存 / 已保存」徽标——它是**该**播报的，编辑即写盘的产品前提就靠它可听。
   * 所以现在断言的不是「只有一个」，而是「只有这两个，且各自具名」：
   * 只读值一旦漏回 live region，这条仍然红。
   */
  it('全页 live region 恰为两枚且各自具名：顶栏保存状态 + 预览就绪判定', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(2);

    const banner = within(screen.getByRole('banner')).getByRole('status');
    expect(computeAccessibleName(banner)).toMatch(/^保存状态：/);

    const preview = screen.getByRole('complementary', { name: 'Prompt 预览' });
    expect(within(preview).getByRole('status')).toHaveTextContent(/就绪|待补全/);

    // 信息条的只读值（板名 / 时间位 / 画幅 / 参考图数）不得是 live region。
    const infobar = screen.getByRole('region', { name: '节拍信息条' });
    expect(within(infobar).queryAllByRole('status')).toEqual([]);
    expect(infobar.querySelectorAll('output, [aria-live]')).toHaveLength(0);
  });
});

describe('跳转链接：越过顶部栏与 5 项左导航', () => {
  it('Tab 第一站是跳转链接', async () => {
    const user = userEvent.setup();
    await user.tab();

    expect(document.activeElement).toBe(screen.getByRole('link', { name: '跳到主内容' }));
  });

  it('回车后焦点落在主区，再按 Tab 即进入信息条', async () => {
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard('{Enter}');

    const main = mainRegion();
    expect(main).toHaveAttribute('id', MAIN_CONTENT_ID);
    expect(document.activeElement).toBe(main);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText(/情绪基调/));
  });
});

describe('主区无匿名控件', () => {
  it.each([1, 2, 3, 4, 5] as const)('B%i 每个可操作控件都有非空无障碍名', async (index) => {
    const user = userEvent.setup();
    await selectBeat(user, index);

    const anonymous = Array.from(mainRegion().querySelectorAll(INTERACTIVE))
      .filter((element) => computeAccessibleName(element).trim() === '')
      .map((element) => element.outerHTML.slice(0, 120));

    expect(anonymous).toEqual([]);
  });

  it('左导航与顶部栏的控件同样都有名字', () => {
    const chrome = [
      ...Array.from(screen.getByRole('navigation').querySelectorAll(INTERACTIVE)),
      ...Array.from(screen.getByRole('banner').querySelectorAll(INTERACTIVE)),
    ];

    expect(chrome.length).toBeGreaterThan(0);
    chrome.forEach((element) => {
      expect(computeAccessibleName(element).trim()).not.toBe('');
    });
  });

  it('每个 textarea / select / 数字输入框都有名字，且全页不重名', async () => {
    const user = userEvent.setup();
    await selectBeat(user, 1);

    const names = Array.from(
      mainRegion().querySelectorAll('textarea, select, input[type="number"]'),
    ).map((element) => computeAccessibleName(element).trim());

    expect(names.length).toBeGreaterThan(0);
    names.forEach((name) => expect(name).not.toBe(''));
    expect(new Set(names).size).toBe(names.length);
  });
});
