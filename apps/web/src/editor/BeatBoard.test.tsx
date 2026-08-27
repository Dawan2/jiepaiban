/**
 * 编辑页 UI 红线测试（W1/WK3）。
 *
 * 三件事必须被自动化守住，因为它们是产品定义、不是偏好：
 *   1. 宫格数由板位锁定：B1–B4 三格、B5 两格，全集 14 格（AC-6.3）；
 *   2. 界面上不存在增删改序入口——不是禁用，是**没有**（AC-6.1）；
 *   3. 界面上不出现分场类专业词，衔接也不进 Prompt 面板（AC-6.4 / AC-6.8）。
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { demoProjects } from '../data/demoProjects';
import {
  BEAT_COUNT,
  GRID_SIZE_BY_BEAT_INDEX,
  TOTAL_GRID_CELL_COUNT,
  type BeatIndex,
} from '../domain/beats';
import { TRANSITION_TEMPLATES } from '../domain/transitions';

const projectId = demoProjects[0]?.id ?? '';

/** UI 文案与 DOM 属性都不得出现的分场类专业词（数据模型文档 §8 禁用词表）。 */
const FORBIDDEN_TERMS = ['分镜', '故事板', '景别', '机位', '运镜'] as const;

const FORBIDDEN_ATTR_TERMS = [
  'storyboard',
  'shot_list',
  'shotList',
  'camera_json',
  'cameraMove',
  'shot_size',
  'focal_length',
] as const;

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={[`/p/${projectId}`]}>
      <App />
    </MemoryRouter>,
  );
}

function beatNav() {
  return screen.getByRole('list', { name: '五节拍导航' });
}

async function selectBeat(index: BeatIndex) {
  const buttons = within(beatNav()).getAllByRole('button');
  const button = buttons[index - 1];
  if (button === undefined) {
    throw new Error(`节拍导航缺少第 ${index} 项`);
  }
  await userEvent.click(button);
}

function gridCells() {
  return within(screen.getByRole('list', { name: /宫格/ })).getAllByRole('listitem');
}

function promptText() {
  return screen.getByLabelText('Prompt 全文').textContent ?? '';
}

beforeEach(() => {
  renderEditor();
});

describe('左侧五板：名称锁定、板序固定（AC-6.1）', () => {
  it('恒 5 项，且为方法论标准板名', () => {
    const items = within(beatNav()).getAllByRole('button');
    expect(items).toHaveLength(BEAT_COUNT);
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('开篇钩子'),
      expect.stringContaining('矛盾建立'),
      expect.stringContaining('打压升级'),
      expect.stringContaining('反转蓄力'),
      expect.stringContaining('断集留客'),
    ]);
  });

  it('板名只读：没有可编辑的板名控件，值以只读形式呈现', async () => {
    await selectBeat(1);

    expect(screen.queryByLabelText('板名')).toBeNull();
    expect(screen.getByText('板名').textContent).toContain('锁定');

    // 任何输入控件都不得承载板名——排除"看着是标签、其实是输入框"的情况。
    const editable = [
      ...screen.queryAllByRole('textbox'),
      ...screen.queryAllByRole('combobox'),
      ...screen.queryAllByRole('spinbutton'),
    ];
    editable.forEach((control) => {
      expect((control as HTMLInputElement).value).not.toBe('开篇钩子');
    });
  });
});

describe('画面宫格：格数由板位锁定（AC-6.3）', () => {
  it.each<[BeatIndex, number]>([
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 2],
  ])('B%i 恒渲染 %i 格', async (index, expected) => {
    await selectBeat(index);

    expect(GRID_SIZE_BY_BEAT_INDEX[index]).toBe(expected);
    expect(gridCells()).toHaveLength(expected);
  });

  it('五板格数合计 14', async () => {
    let total = 0;
    for (const index of [1, 2, 3, 4, 5] as const) {
      await selectBeat(index);
      total += gridCells().length;
    }
    expect(total).toBe(TOTAL_GRID_CELL_COUNT);
  });

  it('每格恰有一个参考图投放区与一个画面描述框', async () => {
    await selectBeat(2);

    gridCells().forEach((cell, i) => {
      const order = i + 1;
      expect(within(cell).getAllByRole('textbox')).toHaveLength(1);
      expect(within(cell).getByLabelText(`格 ${order} 参考图`)).toHaveAttribute('type', 'file');
    });
  });

  it('没有切换格数的入口：唯一下拉是情绪基调，唯一单选组是衔接手法', async () => {
    await selectBeat(1);

    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(1);
    expect(selects[0]).toHaveAccessibleName(/情绪基调/);

    screen.getAllByRole('radio').forEach((radio) => {
      expect(radio).toHaveAttribute('name', 'transition-method');
    });
  });
});

describe('无增删改序入口（AC-6.1 / AC-6.8）', () => {
  it.each([1, 2, 3, 4, 5] as const)('B%i 无增删节拍 / 增删格 / 拖拽换序控件', async (index) => {
    await selectBeat(index);

    screen.getAllByRole('button').forEach((button) => {
      expect(button.textContent ?? '').not.toMatch(
        /新增|添加|增加|删除|上移|下移|插入|复制本|排序/,
      );
    });

    // 拖拽换序会留下 draggable 痕迹；参考图投放区用的是文件拖放，不是元素拖拽。
    expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(0);
  });
});

describe('界面不出现分场类专业词（AC-6.8）', () => {
  it.each([1, 2, 3, 4, 5] as const)('B%i 的文案与 DOM 属性均无禁用词', async (index) => {
    await selectBeat(index);
    const root = screen.getByRole('main');

    FORBIDDEN_TERMS.forEach((term) => {
      expect(root.textContent ?? '').not.toContain(term);
    });
    FORBIDDEN_ATTR_TERMS.forEach((term) => {
      expect(root.innerHTML).not.toContain(term);
    });
  });

  it('每格只提供参考图与白话描述，没有镜头级字段输入', async () => {
    await selectBeat(1);

    gridCells().forEach((cell) => {
      const labels = within(cell)
        .getAllByRole('textbox')
        .map((box) => box.getAttribute('placeholder') ?? '');
      expect(labels).toEqual(['这一格里发生什么、看到什么']);
    });
  });
});

describe('信息条：情绪可改、时间位派生、参数位不入文本', () => {
  it('改情绪基调立刻反映到 Prompt 预览', async () => {
    await selectBeat(1);
    expect(promptText()).not.toContain('紧张压迫的情绪');

    await userEvent.selectOptions(screen.getByLabelText(/情绪基调/), '紧张');

    expect(promptText()).toContain('紧张压迫的情绪');
  });

  it('时间位由各拍时长累加派生，只读呈现', async () => {
    await selectBeat(1);
    const infobar = () => within(screen.getByRole('region', { name: '节拍信息条' }));
    // 演示项目单集 120 秒 → 每拍 24 秒 → B1 占 0–24s。
    expect(infobar().getByText('时间位').textContent).toContain('派生');
    expect(infobar().getByText('0–24s')).toBeInTheDocument();

    await selectBeat(2);
    expect(infobar().getByText('24–48s')).toBeInTheDocument();
  });

  it('时长可改且走参数位，不拼进 Prompt 文本', async () => {
    await selectBeat(1);
    const duration = screen.getByLabelText(/本拍时长/);

    await userEvent.clear(duration);
    await userEvent.type(duration, '18');

    expect(duration).toHaveValue(18);
    expect(promptText()).not.toContain('18');
    expect(within(screen.getByLabelText('参数位')).getByText('18s')).toBeInTheDocument();
  });
});

describe('组间衔接：模板齐备，且不参与 AI 生成（AC-6.4）', () => {
  it('B1–B4 提供 6 个衔接模板，并明示不参与 AI 生成', async () => {
    await selectBeat(1);
    const panel = screen.getByRole('region', { name: '组间衔接' });

    expect(within(panel).getByText('不参与 AI 生成')).toBeInTheDocument();
    expect(TRANSITION_TEMPLATES).toHaveLength(6);
    TRANSITION_TEMPLATES.forEach((template) => {
      expect(within(panel).getByText(template.label)).toBeInTheDocument();
    });
    expect(within(panel).getAllByRole('radio')).toHaveLength(6);
  });

  it('模板文案与方法论封闭枚举一致', () => {
    expect(TRANSITION_TEMPLATES.map((template) => template.label)).toEqual([
      '音频预接',
      '螺口顺滑过渡',
      '卡点硬切',
      'BGM升调截断',
      '黑屏断钩子',
      '纯硬切',
    ]);
  });

  it('选中模板与填写要点都不会进入 Prompt 面板', async () => {
    await selectBeat(1);

    await userEvent.click(screen.getByRole('radio', { name: /黑屏断钩子/ }));
    await userEvent.type(screen.getByLabelText(/操作要点/), '黑场后女主已在医院');

    const prompt = promptText();
    expect(prompt).not.toContain('黑屏断钩子');
    expect(prompt).not.toContain('黑场后女主已在医院');
    // 面板里也不该出现"衔接"来源的片段图例。
    expect(screen.getByLabelText('Prompt 全文').innerHTML).not.toContain('transition');
  });

  it('B5 没有接缝，不提供衔接模板', async () => {
    await selectBeat(5);
    const panel = screen.getByRole('region', { name: '组间衔接' });

    expect(within(panel).queryAllByRole('radio')).toHaveLength(0);
    expect(within(panel).getByText(/本集不设衔接/)).toBeInTheDocument();
  });
});

describe('Prompt 实时预览（AC-6.5 / AC-6.7）', () => {
  it('填写画面描述即时组装，且标注来源', async () => {
    await selectBeat(1);

    await userEvent.type(
      within(gridCells()[0] as HTMLElement).getByRole('textbox'),
      '雨夜巷口',
    );

    expect(promptText()).toContain('雨夜巷口');
    expect(document.querySelectorAll('.seg--frame').length).toBeGreaterThan(0);
  });

  it('固定前缀在面板中可见：不存在用户看不见却发出去的注入', async () => {
    await selectBeat(1);
    const project = demoProjects[0];

    expect(promptText()).toContain(project?.stylePrompt ?? '');
    expect(promptText()).toContain(project?.protagonist ?? '');
  });

  it('未填项以待填清单呈现，补齐后转为就绪', async () => {
    await selectBeat(1);
    expect(screen.getByText(/待填/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/情绪基调/), '紧张');
    for (const cell of gridCells()) {
      await userEvent.type(within(cell as HTMLElement).getByRole('textbox'), '画面内容');
    }

    expect(screen.getByText('就绪')).toBeInTheDocument();
  });

  it('红线自检在面板上明示通过', async () => {
    await selectBeat(3);
    expect(screen.getByText(/红线自检/).textContent).toContain('通过');
  });
});
