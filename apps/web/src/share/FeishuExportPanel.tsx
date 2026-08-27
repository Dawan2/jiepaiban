/**
 * 飞书导出面板（成片页底部，PRD 5.5.2 的「导出」一族）。
 *
 * 三个出口，都不依赖后端：
 *
 * | 动作 | 产物 | 用途 |
 * | --- | --- | --- |
 * | 复制飞书 Markdown | 剪贴板纯文本 | 直接粘进飞书文档，标题 / 表格 / 代码块自动成形 |
 * | 下载 Markdown | `项目名_节拍板_飞书.md` | 存档、走审批流、丢进 IM |
 * | 下载飞书 JSON | `项目名_节拍板_飞书.json` | 给飞书多维表格 / 自动化脚本吃 |
 *
 * 复制与下载都走可注入的实现（{@link ClipboardWriter} / `FileDownloader`），
 * 环境不支持时按钮仍在，点下去给一句可读原因（IX-3：禁用与失败都要给原因）。
 *
 * 面板本身不组装任何生成请求体，也没有写回节拍的通路：
 * 它读 `project` 与段状态，产出文本，仅此而已。
 */

import { useMemo, useState } from 'react';
import type { Project } from '../domain/projects';
import {
  createBrowserDownloader,
  type DownloadFile,
  type FileDownloader,
} from '../export/download';
import {
  copyFailureMessage,
  createBrowserClipboard,
  type ClipboardWriter,
} from './clipboard';
import type { FeishuDeliveryInput } from './feishuDoc';
import { buildFeishuExport, FEISHU_SECTIONS } from './feishuMarkdown';
import './share.css';

export interface FeishuExportPanelProps {
  readonly project: Project;
  /** 各段成片状态；缺省时文档不出「成片交付状态」一节。 */
  readonly cards?: readonly FeishuDeliveryInput[];
  /** 注入导出时间戳，默认取当前时刻。 */
  readonly now?: () => string;
  /** 注入下载实现，默认走浏览器 Blob 下载。 */
  readonly downloadFile?: FileDownloader;
  /** 注入剪贴板实现，默认走 `navigator.clipboard`。 */
  readonly copyToClipboard?: ClipboardWriter;
}

type Feedback = { readonly kind: 'ok' | 'err'; readonly message: string };

export function FeishuExportPanel({
  project,
  cards,
  now,
  downloadFile,
  copyToClipboard,
}: FeishuExportPanelProps) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const download = useMemo(() => downloadFile ?? createBrowserDownloader(), [downloadFile]);
  const copy = useMemo(() => copyToClipboard ?? createBrowserClipboard(), [copyToClipboard]);
  const timestamp = useMemo(() => now ?? (() => new Date().toISOString()), [now]);

  // 预览用的这一份带固定时间戳，重新渲染不会让预览文本抖动；
  // 真正导出时另取一次 `timestamp()`，保证文件里的时间是点击那一刻。
  const preview = useMemo(
    () => buildFeishuExport(project, { now: timestamp(), ...(cards === undefined ? {} : { cards }) }),
    [project, cards, timestamp],
  );

  function bundle() {
    return buildFeishuExport(project, {
      now: timestamp(),
      ...(cards === undefined ? {} : { cards }),
    });
  }

  async function onCopy() {
    try {
      await copy(bundle().markdown);
      setFeedback({ kind: 'ok', message: '已复制飞书 Markdown，粘进飞书文档即可' });
    } catch (error) {
      setFeedback({ kind: 'err', message: copyFailureMessage(error) });
    }
  }

  function exportFile(file: DownloadFile) {
    download(file);
    setFeedback({ kind: 'ok', message: `已导出 ${file.file_name}` });
  }

  return (
    <section className="panel share-panel" aria-labelledby="feishu-export-title">
      <h2 id="feishu-export-title" className="panel__title">
        飞书文档导出
      </h2>
      <p className="panel__desc">
        一集一份，{preview.doc.project.beat_count} 拍逐段列开：情绪 / 时间位 / 节拍帧 /{' '}
        {FEISHU_SECTIONS.prompts}；组间衔接单独成节，标注只在{preview.doc.transition_stage}生效。
      </p>

      <div className="export-card__actions">
        <button type="button" className="btn btn--primary" onClick={() => void onCopy()}>
          复制飞书 Markdown
        </button>
        <button
          type="button"
          className="btn"
          title={`下载 ${preview.markdown_file.file_name}`}
          onClick={() => exportFile(bundle().markdown_file)}
        >
          下载 Markdown
        </button>
        <button
          type="button"
          className="btn"
          title={`下载 ${preview.json_file.file_name}`}
          onClick={() => exportFile(bundle().json_file)}
        >
          下载飞书 JSON
        </button>
      </div>

      <dl className="share-panel__facts">
        <div>
          <dt>Markdown 文件名</dt>
          <dd>{preview.markdown_file.file_name}</dd>
        </div>
        <div>
          <dt>JSON 文件名</dt>
          <dd>{preview.json_file.file_name}</dd>
        </div>
        <div>
          <dt>正文字数</dt>
          <dd>{preview.markdown.length} 字</dd>
        </div>
      </dl>

      {feedback !== null && (
        <p
          className={`share-panel__feedback share-panel__feedback--${feedback.kind}`}
          role="status"
        >
          {feedback.message}
        </p>
      )}

      <details className="share-panel__preview">
        <summary>飞书 Markdown 预览</summary>
        <pre className="share-panel__code">{preview.markdown}</pre>
      </details>
    </section>
  );
}
