/**
 * 飞书导出面板（W4/FEISHU-EXPORT）。
 *
 * 三条主张：
 * 1. 一键复制把 Markdown 全文交给剪贴板，成功与失败都给一句可读回执；
 * 2. 下载 `.md` 与下载 JSON 各出一份文件，文件名取项目名；
 * 3. 预览里恒 5 拍，衔接只在后期那一节 —— 页面上看得见的和文件里的是同一份文本。
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BEAT_COUNT } from '../domain/beats';
import { TRANSITION_RULES, TRANSITION_STAGE } from '../domain/transitions';
import type { DownloadFile } from '../export/download';
import { buildSegmentCards } from '../export/segments';
import { createGeneratedEpisode } from '../export/fixtures';
import { createFilledEpisode } from '../testing/goldens';
import { CLIPBOARD_UNSUPPORTED_MESSAGE, type ClipboardWriter } from './clipboard';
import { FeishuExportPanel } from './FeishuExportPanel';
import { FEISHU_SECTIONS, feishuSection, splitMarkdownSections } from './feishuMarkdown';

const NOW = '2026-08-27T10:00:00.000Z';

interface PanelHarness {
  readonly downloads: readonly DownloadFile[];
  readonly copied: readonly string[];
  readonly panel: HTMLElement;
}

function renderPanel(options: { readonly clipboard?: ClipboardWriter } = {}): PanelHarness {
  const project = createFilledEpisode();
  const downloads: DownloadFile[] = [];
  const copied: string[] = [];

  render(
    <FeishuExportPanel
      project={project}
      now={() => NOW}
      downloadFile={(file) => downloads.push(file)}
      copyToClipboard={
        options.clipboard ??
        ((text) => {
          copied.push(text);
          return Promise.resolve();
        })
      }
    />,
  );

  return {
    downloads,
    copied,
    panel: screen.getByRole('region', { name: '飞书文档导出' }),
  };
}

function previewText(panel: HTMLElement): string {
  return panel.querySelector('.share-panel__code')?.textContent ?? '';
}

describe('面板骨架', () => {
  it('标题、说明与三个出口都在', () => {
    const { panel } = renderPanel();

    expect(within(panel).getByRole('heading', { level: 2, name: '飞书文档导出' })).toBeVisible();
    expect(within(panel).getByText(new RegExp(`${BEAT_COUNT} 拍逐段列开`))).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '复制飞书 Markdown' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: '下载 Markdown' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: '下载飞书 JSON' })).toBeEnabled();
  });

  it('给出两个文件名与正文字数', () => {
    const { panel } = renderPanel();

    expect(within(panel).getByText('婚宴反转_节拍板_飞书.md')).toBeInTheDocument();
    expect(within(panel).getByText('婚宴反转_节拍板_飞书.json')).toBeInTheDocument();
    expect(within(panel).getByText(/^\d+ 字$/)).toBeInTheDocument();
  });

  it('预览恒 5 拍，且衔接只在后期那一节', () => {
    const { panel } = renderPanel();
    const markdown = previewText(panel);
    const sections = splitMarkdownSections(markdown);

    expect(markdown.startsWith('# 婚宴反转 · 节拍板导出')).toBe(true);
    expect(markdown.split('### 节拍').length - 1).toBe(BEAT_COUNT * 2);
    expect(feishuSection(markdown, 'transitions')).toContain(TRANSITION_STAGE);
    TRANSITION_RULES.forEach((rule) => {
      expect(sections.get(FEISHU_SECTIONS.prompts)).not.toContain(rule);
      expect(sections.get(FEISHU_SECTIONS.beats)).not.toContain(rule);
    });
  });
});

describe('复制到剪贴板', () => {
  it('把 Markdown 全文交给剪贴板，并给成功回执', async () => {
    const { panel, copied } = renderPanel();

    await userEvent.click(within(panel).getByRole('button', { name: '复制飞书 Markdown' }));

    expect(copied).toHaveLength(1);
    expect(copied[0]).toBe(previewText(panel));
    expect(copied[0]).toContain('# 婚宴反转 · 节拍板导出');
    expect(within(panel).getByRole('status')).toHaveTextContent('已复制飞书 Markdown');
  });

  it('复制失败时把原因显示出来，不静默', async () => {
    const clipboard = vi.fn(() => Promise.reject(new Error(CLIPBOARD_UNSUPPORTED_MESSAGE)));
    const { panel } = renderPanel({ clipboard });

    await userEvent.click(within(panel).getByRole('button', { name: '复制飞书 Markdown' }));

    expect(clipboard).toHaveBeenCalledOnce();
    expect(within(panel).getByRole('status')).toHaveTextContent(CLIPBOARD_UNSUPPORTED_MESSAGE);
    expect(panel.querySelector('.share-panel__feedback--err')).not.toBeNull();
  });
});

describe('下载', () => {
  it('下载 Markdown：文件名以 .md 结尾，正文与预览一致', async () => {
    const { panel, downloads } = renderPanel();

    await userEvent.click(within(panel).getByRole('button', { name: '下载 Markdown' }));

    expect(downloads).toHaveLength(1);
    const file = downloads[0] as DownloadFile;
    expect(file.file_name).toBe('婚宴反转_节拍板_飞书.md');
    expect(file.mime).toContain('text/markdown');
    expect(file.text).toBe(previewText(panel));
    expect(within(panel).getByRole('status')).toHaveTextContent('已导出 婚宴反转_节拍板_飞书.md');
  });

  it('下载 JSON：恰 5 段，每段带情绪 / 时间位 / 帧正文 / 衔接 / Prompt 全文', async () => {
    const { panel, downloads } = renderPanel();

    await userEvent.click(within(panel).getByRole('button', { name: '下载飞书 JSON' }));

    const file = downloads[0] as DownloadFile;
    expect(file.file_name).toBe('婚宴反转_节拍板_飞书.json');
    const doc = JSON.parse(file.text) as {
      episode_title: string;
      beats: readonly {
        emotion: string;
        time_range: string;
        frames_text: string;
        prompt_final: string;
        transition: { rule: string; stage: string };
      }[];
    };

    expect(doc.episode_title).toBe('婚宴反转');
    expect(doc.beats).toHaveLength(BEAT_COUNT);
    doc.beats.forEach((beat) => {
      expect(beat.emotion).not.toBe('');
      expect(beat.time_range).toMatch(/^\d+-\d+s$/);
      expect(beat.frames_text).not.toBe('');
      expect(beat.prompt_final).toContain('漫剧厚涂画风');
      expect(beat.transition.stage).toBe(TRANSITION_STAGE);
      expect(beat.prompt_final).not.toContain(beat.transition.rule);
    });
  });

  it('两次下载各出一份文件，互不覆盖', async () => {
    const { panel, downloads } = renderPanel();

    await userEvent.click(within(panel).getByRole('button', { name: '下载 Markdown' }));
    await userEvent.click(within(panel).getByRole('button', { name: '下载飞书 JSON' }));

    expect(downloads.map((file) => file.file_name)).toEqual([
      '婚宴反转_节拍板_飞书.md',
      '婚宴反转_节拍板_飞书.json',
    ]);
  });
});

describe('带成片状态时多出「成片交付状态」一节', () => {
  it('五段齐备时点清 5/5 并列出成片地址', async () => {
    const fixture = await createGeneratedEpisode();
    const cards = buildSegmentCards(fixture.project, fixture.controller.snapshot());
    const downloads: DownloadFile[] = [];

    render(
      <FeishuExportPanel
        project={fixture.project}
        cards={cards}
        now={() => NOW}
        downloadFile={(file) => downloads.push(file)}
        copyToClipboard={() => Promise.resolve()}
      />,
    );

    const panel = screen.getByRole('region', { name: '飞书文档导出' });
    const markdown = previewText(panel);

    expect([...splitMarkdownSections(markdown).keys()]).toContain(FEISHU_SECTIONS.delivery);
    expect(feishuSection(markdown, 'delivery')).toContain(`已齐 ${BEAT_COUNT}/${BEAT_COUNT} 段`);
    expect(feishuSection(markdown, 'delivery')).toContain('stub://seedance-2.5/b1/');
  });

  it('缺片时点名缺哪几段，但导出不被阻断', async () => {
    const fixture = await createGeneratedEpisode({ generated: [1, 2, 3] });
    const cards = buildSegmentCards(fixture.project, fixture.controller.snapshot());
    const downloads: DownloadFile[] = [];

    render(
      <FeishuExportPanel
        project={fixture.project}
        cards={cards}
        now={() => NOW}
        downloadFile={(file) => downloads.push(file)}
        copyToClipboard={() => Promise.resolve()}
      />,
    );

    const panel = screen.getByRole('region', { name: '飞书文档导出' });
    expect(feishuSection(previewText(panel), 'delivery')).toContain('还缺 节拍4、节拍5');

    const markdownButton = within(panel).getByRole('button', { name: '下载 Markdown' });
    expect(markdownButton).toBeEnabled();
    await userEvent.click(markdownButton);
    expect(downloads).toHaveLength(1);
  });
});
