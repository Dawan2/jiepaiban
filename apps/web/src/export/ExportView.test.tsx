/**
 * 成片管理页（PRD 5.5 / 11.4、AC-6.7 / AC-6.4）。
 *
 * 页面级守卫，三条主张：
 * 1. **卡序锁**：DOM 里恒 5 张段卡，顺序 1 → 5，页面不提供任何改序 / 增删入口；
 * 2. **衔接可见但不外传**：卡上与两张表里都有衔接文案，重投时请求体里一个字都没有；
 * 3. **一键拼接置灰**：V1.0 只出拼接计划与交付清单（PRD 5.5.5）。
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BEAT_COUNT } from '../domain/beats';
import { beatAt } from '../domain/projects';
import { TRANSITION_RULES } from '../domain/transitions';
import type { DownloadFile } from './download';
import { ExportView } from './ExportView';
import { createGeneratedEpisode } from './fixtures';

const NOW = '2026-08-27T10:00:00.000Z';

async function renderExport(generated?: readonly (1 | 2 | 3 | 4 | 5)[]) {
  const fixture = await createGeneratedEpisode(generated === undefined ? {} : { generated });
  const downloads: DownloadFile[] = [];

  const view = render(
    <MemoryRouter initialEntries={[`/p/${fixture.project.id}/export`]}>
      <ExportView
        project={fixture.project}
        controllerOptions={{ queue: fixture.queue }}
        downloadFile={(file) => downloads.push(file)}
        now={() => NOW}
      />
    </MemoryRouter>,
  );

  return { ...fixture, downloads, view };
}

function segmentCards(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(container.querySelectorAll('li.segment'));
}

describe('五张段卡与顺序锁', () => {
  it('恒 5 张卡，data-beat 与标题顺序都是 1 → 5', async () => {
    const { view } = await renderExport();
    const cards = segmentCards(view.container);

    expect(cards).toHaveLength(BEAT_COUNT);
    expect(cards.map((card) => card.dataset.beat)).toEqual(['1', '2', '3', '4', '5']);
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(
      expect.arrayContaining([
        '节拍1· 开篇钩子',
        '节拍2· 矛盾建立',
        '节拍3· 打压升级',
        '节拍4· 反转蓄力',
        '节拍5· 断集留客',
      ]),
    );
  });

  it('每张卡都有预览位、时长、生成完成时间与衔接', async () => {
    const { view } = await renderExport();
    const first = segmentCards(view.container)[0] as HTMLElement;

    expect(first.querySelector('.segment__preview')).not.toBeNull();
    expect(within(first).getByText('时长')).toBeInTheDocument();
    expect(within(first).getByText('8 秒')).toBeInTheDocument();
    expect(within(first).getByText('生成完成时间')).toBeInTheDocument();
    expect(within(first).getByText('2026-08-27 09:12:00 UTC')).toBeInTheDocument();
    expect(within(first).getByText('组间衔接')).toBeInTheDocument();
    expect(within(first).getByText(/节拍1 → 节拍2：音频预接/)).toBeInTheDocument();
    expect(within(first).getByText(/仅后期合成生效/)).toBeInTheDocument();
  });

  it('已生成的卡给逐段下载，命名为 `项目名_序号_节拍名.mp4`', async () => {
    const { view } = await renderExport();
    const links = segmentCards(view.container).map((card) =>
      within(card).getByRole('link', { name: '下载本段' }),
    );

    expect(links).toHaveLength(BEAT_COUNT);
    expect(links[0]?.getAttribute('download')).toBe('婚宴反转_1_开篇钩子.mp4');
    expect(links[4]?.getAttribute('download')).toBe('婚宴反转_5_断集留客.mp4');
    expect(links[0]?.getAttribute('href')).toContain('stub://seedance-2.5/b1/');
  });

  it('未生成的卡显示占位与「去编辑」，下载与重投都禁用且给原因', async () => {
    const { view } = await renderExport([1, 2, 3]);
    const fourth = segmentCards(view.container)[3] as HTMLElement;

    expect(within(fourth).getByText('未生成')).toBeInTheDocument();
    expect(within(fourth).getByRole('link', { name: '去编辑' })).toBeInTheDocument();
    expect(within(fourth).getByRole('button', { name: '下载本段' })).toBeDisabled();

    const regenerate = within(fourth).getByRole('button', { name: '重新生成' });
    expect(regenerate).toBeDisabled();
    expect(regenerate.getAttribute('title')).toContain('先回编辑页');
  });

  it('页面不提供增删段卡或改序的入口（R3 / R7）', async () => {
    const { view } = await renderExport();
    const text = view.container.textContent ?? '';

    expect(text).not.toMatch(/(新增|添加|删除)(节拍|段)/);
    expect(text).not.toMatch(/(上移|下移|拖动排序|重排)/);
    expect(text).not.toMatch(/(裁剪|轨道|时间线)/);
  });
});

describe('重新生成（PRD 5.5.4 / 12.6）', () => {
  it('二次确认后只重投本段，其余四段不动', async () => {
    const { view, submissions, controller } = await renderExport();
    const third = segmentCards(view.container)[2] as HTMLElement;
    const before = submissions.length;
    const others = controller.snapshot().filter((state) => state.beat_index !== 3);

    await userEvent.click(within(third).getByRole('button', { name: '重新生成' }));
    expect(screen.getByText(/新结果将替换当前段/)).toBeInTheDocument();
    expect(submissions).toHaveLength(before);

    await userEvent.click(within(third).getByRole('button', { name: '确认重投' }));

    await waitFor(() => {
      expect(submissions).toHaveLength(before + 1);
    });
    expect(submissions[before]?.beat_index).toBe(3);
    others.forEach((state) => {
      expect(controller.stateOf(state.beat_index).video_url).toBe(state.video_url);
      expect(controller.stateOf(state.beat_index).job?.attempt).toBe(state.job?.attempt);
    });
    expect(controller.stateOf(3).job?.attempt).toBe(2);
  });

  it('取消二次确认不发任何请求', async () => {
    const { view, submissions } = await renderExport();
    const third = segmentCards(view.container)[2] as HTMLElement;
    const before = submissions.length;

    await userEvent.click(within(third).getByRole('button', { name: '重新生成' }));
    await userEvent.click(within(third).getByRole('button', { name: '取消' }));

    expect(submissions).toHaveLength(before);
    expect(within(third).getByRole('button', { name: '重新生成' })).toBeEnabled();
  });

  it('页面上看得见衔接，重投的请求体里一个字都没有（AC-6.4）', async () => {
    const { view, submissions, project } = await renderExport();
    beatAt(project, 3).transition_rule = '螺口顺滑过渡';
    const third = segmentCards(view.container)[2] as HTMLElement;
    const before = submissions.length;

    await userEvent.click(within(third).getByRole('button', { name: '重新生成' }));
    await userEvent.click(within(third).getByRole('button', { name: '确认重投' }));

    await waitFor(() => {
      expect(submissions).toHaveLength(before + 1);
    });

    // 卡上与两张表里都有衔接文案……
    expect(screen.getAllByText(/节拍3 → 节拍4/).length).toBeGreaterThanOrEqual(2);
    // ……但请求体里一条都不含。
    submissions.forEach((submission) => {
      const body = JSON.stringify(submission);
      TRANSITION_RULES.forEach((rule) => {
        expect(body).not.toContain(rule);
      });
      expect(body).not.toContain('转场');
    });
  });
});

describe('底部：拼接计划 / 衔接总表 / 交付导出', () => {
  it('拼接计划恒 5 行，带时间位与合计时长', async () => {
    const { view } = await renderExport();
    const panel = view.container.querySelector('[aria-labelledby="stitch-plan-title"]');
    const rows = Array.from(panel?.querySelectorAll('[data-stitch-row]') ?? []);

    expect(rows).toHaveLength(BEAT_COUNT);
    expect(rows.map((row) => row.getAttribute('data-stitch-row'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(within(rows[0] as HTMLElement).getByText('00:00 – 00:08')).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText('88 秒')).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText(/已齐 5\/5 段/)).toBeInTheDocument();
  });

  it('衔接总表恒 5 行，逐行标注后期合成生效', async () => {
    const { view } = await renderExport();
    const panel = view.container.querySelector(
      '[aria-labelledby="transition-summary-title"]',
    ) as HTMLElement;
    const rows = Array.from(panel.querySelectorAll('[data-transition-row]'));

    expect(rows).toHaveLength(BEAT_COUNT);
    expect(within(rows[0] as HTMLElement).getByText('音频预接')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('AUDIO_PRELAP')).toBeInTheDocument();
    expect(within(rows[4] as HTMLElement).getByText('节拍5 → 下一集')).toBeInTheDocument();
    expect(panel.querySelectorAll('[data-transition-row] td:nth-child(4)')).toHaveLength(
      BEAT_COUNT,
    );
    expect(within(panel).getAllByText('后期合成')).toHaveLength(BEAT_COUNT);
    expect(within(panel).getByText(/永不进入 Prompt/)).toBeInTheDocument();
  });

  it('导出项目 JSON：含项目 + 5 板 + Prompt + 衔接总表', async () => {
    const { downloads } = await renderExport();

    await userEvent.click(screen.getByRole('button', { name: '导出项目 JSON' }));

    expect(downloads).toHaveLength(1);
    const file = downloads[0] as DownloadFile;
    expect(file.file_name).toBe('婚宴反转_节拍板项目.json');
    const payload = JSON.parse(file.text) as {
      exported_at: string;
      beats: readonly { prompt_final: string; transition_rule: string }[];
      transitions: readonly unknown[];
    };
    expect(payload.exported_at).toBe(NOW);
    expect(payload.beats).toHaveLength(BEAT_COUNT);
    expect(payload.transitions).toHaveLength(BEAT_COUNT);
    expect(payload.beats[0]?.transition_rule).toBe('音频预接');
    expect(payload.beats[0]?.prompt_final).not.toContain('音频预接');
    expect(screen.getByText('已导出 婚宴反转_节拍板项目.json')).toBeInTheDocument();
  });

  it('导出交付包清单：5 段 + 项目 JSON，zip 名可读', async () => {
    const { downloads } = await renderExport();

    await userEvent.click(screen.getByRole('button', { name: '导出交付包清单' }));

    const file = downloads[0] as DownloadFile;
    expect(file.file_name).toBe('婚宴反转_成片交付包_清单.json');
    const manifest = JSON.parse(file.text) as {
      zip_file_name: string;
      segment_count: number;
      entries: readonly { path: string }[];
    };
    expect(manifest.zip_file_name).toBe('婚宴反转_成片交付包.zip');
    expect(manifest.segment_count).toBe(BEAT_COUNT);
    expect(manifest.entries).toHaveLength(BEAT_COUNT + 1);
  });

  it('缺片时「全部下载」与「导出交付包清单」禁用并说明缺哪几段', async () => {
    await renderExport([1, 2, 3]);

    const all = screen.getByRole('button', { name: '全部下载' });
    const manifest = screen.getByRole('button', { name: '导出交付包清单' });

    expect(all).toBeDisabled();
    expect(all.getAttribute('title')).toContain('节拍4');
    expect(manifest).toBeDisabled();
    expect(manifest.getAttribute('title')).toContain('节拍5');
    // 项目 JSON 随时可导，缺片不阻断档案导出。
    expect(screen.getByRole('button', { name: '导出项目 JSON' })).toBeEnabled();
  });

  it('五段齐备时「全部下载」可用，导出的是交付包清单', async () => {
    const { downloads } = await renderExport();

    const all = screen.getByRole('button', { name: '全部下载' });
    expect(all).toBeEnabled();
    await userEvent.click(all);

    expect(downloads[0]?.file_name).toBe('婚宴反转_成片交付包_清单.json');
  });
});

describe('版本纪律：一键拼接留位（PRD 5.5.5）', () => {
  it('按钮置灰并标注 V1.1', async () => {
    await renderExport();

    const stitch = screen.getByRole('button', { name: '一键拼接（V1.1）' });
    expect(stitch).toBeDisabled();
    expect(stitch.getAttribute('title')).toContain('V1.1');
  });

  it('顺序连播在桩件阶段禁用，并说明原因', async () => {
    await renderExport();

    const playback = screen.getByRole('button', { name: '顺序连播' });
    expect(playback).toBeDisabled();
    expect(playback.getAttribute('title')).toContain('不可播放');
  });
});
