/**
 * 顶部栏布局回归（W5 审计 P0）。
 *
 * 事故复盘：顶部栏是恒 56px 的单行带，`.layout` 却把板级生成动作（徽章 + 按钮 +
 * 禁用原因 + 成片地址，四行）塞进了动作区，于是「保存 / 生成全集 / 成片」被居中对齐
 * 顶到视口外，`getBoundingClientRect().top` 量出 -17：按钮画在屏幕上方，点不着。
 *
 * jsdom 不排版，量不出这件事，所以这里用 `testing/layoutProbe` 按**产品样式表**还原
 * 纵向盒模型。三道锁一起上：
 *   1. 几何锁：三个页面顶部栏里的动作控件，`top` 不得为负、`bottom` 不得越出行高；
 *   2. 单行锁：动作区外盒高度不得超过 56px 设计带——多行块进来就会破；
 *   3. 结构锁：板级生成动作必须在节拍信息条里，不得回到 `.layout__actions`。
 *
 * 探针自身能不能量出负偏移？第一个用例就是反证：把 W5 那版结构与固定行高原样搭回来，
 * 探针必须报负。
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LocalRepository } from '../adapters/persistence';
import { createGenerateController, type GenerateBoardState } from '../generate/controller';
import { BeatGenerateAction } from '../generate/GenerateActions';
import { probeTopbar, readAppStyles } from '../testing/layoutProbe';
import { makeProject, renderApp, seedRepository, withFilledBeats } from '../testing/harness';

/** 顶部栏设计带宽（PRD 锁定的骨架行高）。 */
const TOPBAR_BAND_PX = 56;

const APP_STYLES = readAppStyles();

/**
 * W5 那版顶部栏 CSS：行高写死 56px，动作区又没定交叉轴对齐（默认 stretch）。
 * 于是多行块把动作区整体顶出行外，带着同排的单行按钮一起画到视口上方。
 */
const W5_TOPBAR_STYLES = [
  APP_STYLES,
  '.layout { grid-template-rows: 56px minmax(0, 1fr); }',
  '.layout__actions { align-items: stretch; }',
].join('\n');

const projectId = 'prj_layout';
/** 空项目：五板都没填齐，板级动作会多出一行禁用原因。 */
const emptyProjectId = 'prj_layout_empty';

let repository: LocalRepository;
let restore: (() => void) | null = null;

beforeEach(async () => {
  repository = await seedRepository([
    withFilledBeats(makeProject(projectId, { name: '顶部栏回归用例' })),
    makeProject(emptyProjectId, { name: '还没填的一集' }),
  ]);
});

afterEach(() => {
  restore?.();
  restore = null;
});

/** 量顶部栏，并登记还原钩子。 */
function probe(container: HTMLElement, styles?: string) {
  const result = probeTopbar(container, styles === undefined ? {} : { styles });
  restore = result.restore;
  return result;
}

function topbarActions(container: HTMLElement): HTMLElement {
  const actions = container.querySelector('.layout__actions');
  expect(actions).not.toBeNull();
  return actions as HTMLElement;
}

/** 顶部栏里所有可点的东西（按钮 + 链接）。 */
function actionControls(container: HTMLElement): HTMLElement[] {
  const actions = topbarActions(container);
  return [...within(actions).queryAllByRole('button'), ...within(actions).queryAllByRole('link')];
}

/** 节拍信息条末位的本板动作位。 */
function beatActionField(container: HTMLElement): HTMLElement {
  const field = container.querySelector('.infobar .infobar__field--action');
  expect(field).not.toBeNull();
  return field as HTMLElement;
}

const ready = () => waitFor(() => expect(screen.queryByText(/读取/)).toBeNull());

describe('探针自检：W5 那版结构确实会被裁', () => {
  it('板级生成动作放进 56px 固定行高的动作区，按钮 top 为负', () => {
    const controller = createGenerateController({
      project: makeProject(projectId),
      autoRun: false,
    });
    // 审计里量到的那块板：已出成片，但改动后又有未填项，四行内容全在。
    const state: GenerateBoardState = {
      beat_index: 1,
      status: 'SUCCEEDED',
      status_label: '成功',
      job: null,
      video_url: `stub://seedance-2.5/${projectId}/1`,
      failure: null,
      blocked_reason: '节拍1还缺：第3格画面描述；补齐后才能生成',
      can_generate: false,
      action_label: '重新生成',
    };

    const { container } = render(
      <div className="layout">
        <header className="layout__topbar">
          <div className="layout__titles">
            <h1 className="layout__title">节拍编辑</h1>
          </div>
          <div className="layout__actions">
            <button type="button" className="btn">
              保存
            </button>
            <BeatGenerateAction controller={controller} state={state} />
          </div>
        </header>
        <main className="layout__main" />
      </div>,
    );

    const measured = probe(container, W5_TOPBAR_STYLES);
    expect(measured.trackHeight).toBe(TOPBAR_BAND_PX);
    expect(measured.actionsHeight).toBeGreaterThan(TOPBAR_BAND_PX);

    const controls = actionControls(container);
    expect(controls).toHaveLength(2);
    for (const control of controls) {
      // 审计量到的是 top:-17；模型只算纵向，量级对得上就够了。
      expect(control.getBoundingClientRect().top).toBeLessThan(-10);
    }
  });
});

describe('几何锁：顶部栏动作控件不越出行高', () => {
  it.each([['/'], [`/p/${projectId}`], [`/p/${projectId}/export`]])(
    '%s 的动作控件 top 不为负、bottom 不越界',
    async (path) => {
      const { container } = renderApp(path, { repository });
      await ready();

      const measured = probe(container);
      const controls = actionControls(container);
      expect(controls.length).toBeGreaterThan(0);

      for (const control of controls) {
        const rect = control.getBoundingClientRect();
        expect(rect.top).toBeGreaterThanOrEqual(0);
        expect(rect.bottom).toBeLessThanOrEqual(measured.trackHeight);
      }
    },
  );

  it.each([['/'], [`/p/${projectId}`], [`/p/${projectId}/export`]])(
    '%s 的顶部栏保持单行：动作区不超过 56px 设计带',
    async (path) => {
      const { container } = renderApp(path, { repository });
      await ready();

      const measured = probe(container);
      expect(measured.actionsHeight).toBeLessThanOrEqual(TOPBAR_BAND_PX);
      expect(measured.trackHeight).toBe(TOPBAR_BAND_PX);
    },
  );

  /*
   * 上面三条走的是「板级动作最矮」的那一刻。真正撑破 56px 的是它长出第二、三行的时候：
   * 未填齐会多一行禁用原因，生成成功会多一行成片地址——所以两种状态都要量。
   */
  it('未填齐的板：多出的禁用原因不进顶部栏', async () => {
    const { container } = renderApp(`/p/${emptyProjectId}`, { repository });
    await ready();

    // 禁用原因确实在渲染（否则这条用例量的是空气），但它长在板体里。
    expect(within(beatActionField(container)).getByText(/补齐后才能生成/)).toBeInTheDocument();

    const measured = probe(container);
    expect(measured.actionsHeight).toBeLessThanOrEqual(TOPBAR_BAND_PX);
  });

  it('生成成功的板：多出的成片地址不进顶部栏', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(`/p/${projectId}`, { repository });
    await ready();

    const field = beatActionField(container);
    await user.click(within(field).getByRole('button', { name: '生成本板' }));
    expect(await within(field).findByText(/成片地址：/)).toBeInTheDocument();

    const measured = probe(container);
    expect(measured.actionsHeight).toBeLessThanOrEqual(TOPBAR_BAND_PX);
  });
});

describe('结构锁：板级动作归板体，顶部栏只留全站级动作', () => {
  it('顶部栏动作区里没有板级生成动作块', async () => {
    const { container } = renderApp(`/p/${projectId}`, { repository });
    await ready();

    const actions = topbarActions(container);
    expect(actions.querySelector('.generate')).toBeNull();
    expect(within(actions).queryByRole('button', { name: '生成本板' })).toBeNull();
  });

  it('板级生成动作落在节拍信息条的动作位上', async () => {
    const { container } = renderApp(`/p/${projectId}`, { repository });
    await ready();

    const field = beatActionField(container);
    expect(field.querySelector('.generate')).not.toBeNull();
    expect(within(field).getByRole('button', { name: '生成本板' })).toBeInTheDocument();
  });

  it('编辑页顶部栏只有保存 / 生成全集 / 成片', async () => {
    const { container } = renderApp(`/p/${projectId}`, { repository });
    await ready();

    expect(actionControls(container).map((control) => control.textContent)).toEqual([
      '保存',
      '生成全集',
      '成片',
    ]);
  });
});

describe('CSS 守卫：行高只是设计带，不是裁刀', () => {
  it('顶部栏行轨道写成 minmax(56px, auto)，内容超高时长高而不裁切', () => {
    const layoutRule = /\.layout \{([^}]*)\}/.exec(APP_STYLES)?.[1] ?? '';
    expect(layoutRule).toMatch(/grid-template-rows:\s*minmax\(56px,\s*auto\)/);
  });

  it('顶部栏没有 overflow: hidden，撑出去的内容不会被切', () => {
    const topbarRule = /\.layout__topbar \{([^}]*)\}/.exec(APP_STYLES)?.[1] ?? '';
    expect(topbarRule).not.toMatch(/overflow/);
  });
});
