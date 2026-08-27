/**
 * 生成控制器与编辑页接线（PRD 5.4 生成状态呈现、IX-3 禁用必须给原因）。
 *
 * 控制器是给 UI 的唯一入口：WK3 换掉板体与宫格样式也不影响这里的行为契约。
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { demoProjects } from '../data/demoProjects';
import { beatAt } from '../domain/projects';
import { BEAT1_SAMPLE, createBeat1Sample, createFilledEpisode } from '../testing/goldens';
import { createScriptedTransport, createSeedanceAdapter, upstreamFailure } from './adapter';
import { createGenerateController } from './controller';
import { createGenerateQueue } from './queue';
import { createMemoryJobStore } from './store';

function controllerFor(
  project: ReturnType<typeof createFilledEpisode>,
  transport?: ReturnType<typeof createScriptedTransport>,
) {
  const queue = createGenerateQueue({
    adapter: createSeedanceAdapter(transport === undefined ? {} : { transport }),
    store: createMemoryJobStore(),
  });
  return createGenerateController({ project, queue, autoRun: false });
}

describe('控制器视图状态', () => {
  it('五个板位，默认全是「待生成」', () => {
    const controller = controllerFor(createFilledEpisode());
    const states = controller.snapshot();

    expect(states).toHaveLength(5);
    expect(states.map((state) => state.beat_index)).toEqual([1, 2, 3, 4, 5]);
    expect(states.every((state) => state.status_label === '待生成')).toBe(true);
    expect(states.every((state) => state.job === null)).toBe(true);
    expect(states.every((state) => state.action_label === '生成本板')).toBe(true);
  });

  it('槽位没填齐时不可生成，并给出可读原因', () => {
    const project = createFilledEpisode();
    beatAt(project, 2).plot_core = '';
    const controller = controllerFor(project);

    const second = controller.stateOf(2);
    expect(second.can_generate).toBe(false);
    expect(second.blocked_reason).toContain('剧情核心');
    expect(controller.stateOf(1).can_generate).toBe(true);
  });

  it('超 30 秒的板不可生成，原因点名时长上限', () => {
    const project = createFilledEpisode();
    beatAt(project, 4).duration_sec = 45;
    const controller = controllerFor(project);

    expect(controller.stateOf(4).can_generate).toBe(false);
    expect(controller.stateOf(4).blocked_reason).toContain('30 秒');
  });

  it('快照引用稳定：没变化时返回同一个数组', () => {
    const controller = controllerFor(createFilledEpisode());
    const before = controller.snapshot();
    expect(controller.snapshot()).toBe(before);

    controller.generateBeat(1);
    const after = controller.snapshot();
    expect(after).not.toBe(before);
    expect(controller.snapshot()).toBe(after);
  });

  it('生成本板：待生成 → 成功，文案随之变化', async () => {
    const { project } = createBeat1Sample();
    const controller = controllerFor(project);

    expect(controller.generateBeat(1).status).toBe('queued');
    expect(controller.stateOf(1).status_label).toBe('待生成');

    await controller.run();

    const state = controller.stateOf(1);
    expect(state.status_label).toBe('成功');
    expect(state.video_url).toContain('stub://');
    expect(state.action_label).toBe('重新生成');
    expect(state.failure).toBeNull();
  });

  it('接口异常后是「失败·接口异常」，按钮变重试', async () => {
    const project = createFilledEpisode();
    const controller = controllerFor(
      project,
      createScriptedTransport([{ ok: false, failure: upstreamFailure('网关超时') }]),
    );

    controller.generateBeat(1);
    await controller.run();

    const state = controller.stateOf(1);
    expect(state.status_label).toBe('失败');
    expect(state.failure?.label).toBe('接口异常');
    expect(state.action_label).toBe('重试');

    controller.retryBeat(1);
    await controller.run();
    expect(controller.stateOf(1).status_label).toBe('成功');
    expect(controller.stateOf(2).status_label).toBe('待生成');
  });

  it('生成全集：5 次独立调用，逐板可读', async () => {
    const controller = controllerFor(createFilledEpisode());
    const results = controller.generateEpisode();

    expect(results).toHaveLength(5);
    await controller.run();
    expect(controller.snapshot().map((state) => state.status_label)).toEqual([
      '成功',
      '成功',
      '成功',
      '成功',
      '成功',
    ]);
    expect(controller.jobs()).toHaveLength(5);
  });

  it('订阅者能收到状态变化', async () => {
    const controller = controllerFor(createFilledEpisode());
    let notified = 0;
    const unsubscribe = controller.subscribe(() => {
      notified += 1;
    });

    controller.generateBeat(1);
    await controller.run();
    unsubscribe();
    const seen = notified;
    controller.reset();

    expect(seen).toBeGreaterThan(0);
    expect(notified).toBe(seen);
  });
});

describe('编辑页接线', () => {
  const project = demoProjects[0];
  const projectId = project?.id ?? '';
  const snapshots = project?.beat_list.map((beat) => ({
    emotion: beat.emotion,
    camera_rhythm: beat.camera_rhythm,
    plot_core: beat.plot_core,
    frames: beat.frames.map((frame) => frame.text),
  }));

  beforeEach(() => {
    globalThis.localStorage?.clear();
    project?.beat_list.forEach((beat) => {
      beat.emotion = BEAT1_SAMPLE.beat.emotion;
      beat.camera_rhythm = BEAT1_SAMPLE.beat.camera_rhythm;
      beat.plot_core = BEAT1_SAMPLE.beat.plot_core;
      beat.frames.forEach((frame, i) => {
        frame.text = BEAT1_SAMPLE.beat.frames[i] ?? BEAT1_SAMPLE.beat.frames[0] ?? '';
      });
    });
  });

  afterEach(() => {
    globalThis.localStorage?.clear();
    project?.beat_list.forEach((beat, at) => {
      const snapshot = snapshots?.[at];
      if (snapshot === undefined) {
        return;
      }
      beat.emotion = snapshot.emotion;
      beat.camera_rhythm = snapshot.camera_rhythm;
      beat.plot_core = snapshot.plot_core;
      beat.frames.forEach((frame, i) => {
        frame.text = snapshot.frames[i] ?? '';
      });
    });
  });

  function renderEditor() {
    return render(
      <MemoryRouter initialEntries={[`/p/${projectId}`]}>
        <App />
      </MemoryRouter>,
    );
  }

  it('板级动作从「待生成」跑到「成功」，并显示成片地址', async () => {
    const { container } = renderEditor();
    const panel = container.querySelector('.generate');
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByText('待生成')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '生成本板' }));

    await waitFor(() => {
      expect(within(panel as HTMLElement).getByText('成功')).toBeInTheDocument();
    });
    expect(screen.getByText(/成片地址：stub:\/\/seedance-2\.5/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新生成' })).toBeInTheDocument();
  });

  it('槽位没填齐时按钮禁用，且 hover 出得来原因', async () => {
    const first = project?.beat_list[0];
    if (first !== undefined) {
      first.plot_core = '';
    }
    renderEditor();

    const button = screen.getByRole('button', { name: '生成本板' });
    expect(button).toBeDisabled();
    expect(button.getAttribute('title')).toContain('剧情核心');
    await Promise.resolve();
  });

  it('顶栏「生成全集」可用，点一次把五块板都跑完', async () => {
    renderEditor();
    const episodeButton = screen.getByRole('button', { name: '生成全集' });
    expect(episodeButton).toBeEnabled();
    expect(episodeButton.getAttribute('title')).toContain('Seedance 2.5');

    await userEvent.click(episodeButton);

    await waitFor(() => {
      expect(screen.getByText('成功')).toBeInTheDocument();
    });
  });

  it('生成动作的文案里没有禁用词，也没有增删节拍的入口', () => {
    const { container } = renderEditor();
    const text = container.textContent ?? '';
    expect(text).toContain('待生成');
    expect(text).not.toMatch(/(新增|添加|删除)节拍/);
    expect(text).not.toContain('模型选择');
  });
});
