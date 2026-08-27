/**
 * 飞书 Markdown 渲染（W4/FEISHU-EXPORT）。
 *
 * 目标很窄：把 {@link buildFeishuDoc} 的载荷渲染成**一段可以直接粘进飞书文档**的
 * Markdown。飞书的 Markdown 粘贴支持标题、表格、列表、引用与代码块，
 * 不支持 HTML、嵌套表格与表格内换行——所以本渲染器只用那五种块级元素，
 * 表格单元格里的 `|` 转义、换行压成空格。
 *
 * ## 分节即契约
 *
 * 文档由固定的六节组成，节名就是二级标题文案（{@link FEISHU_SECTIONS}）。
 * 分节不只是排版，它是红线 AC-6.4 在本槽位的**可检验形式**——
 *
 * - 组间衔接只出现在「组间衔接总表（后期合成）」一节；
 * - 「Prompt 全文」一节里没有任何衔接取值，连「后期」「衔接」两个词都不出现。
 *
 * {@link splitMarkdownSections} 把渲染结果按二级标题切开，测试逐节复查上面两条。
 * 切分器认二级标题、跳过代码块内部的 `#`，所以 Prompt 正文里出现什么都不会串节。
 */

import type { Project } from '../domain/projects';
import { TRANSITION_STAGE } from '../domain/transitions';
import type { DownloadFile } from '../export/download';
import { sanitizeFileNamePart } from '../export/naming';
import {
  buildFeishuDoc,
  FEISHU_EMPTY,
  type FeishuBeatSection,
  type FeishuDoc,
  type FeishuDocOptions,
} from './feishuDoc';

export const FEISHU_MARKDOWN_MIME = 'text/markdown;charset=utf-8' as const;
export const FEISHU_JSON_MIME = 'application/json;charset=utf-8' as const;

/**
 * 六节的标题文案，同时是 {@link splitMarkdownSections} 的键。
 *
 * 「组间衔接总表」的标题里带着 {@link TRANSITION_STAGE}，
 * 于是「衔接只在后期生效」这句话在目录层就已经写明，不必等读者读到表尾。
 */
export const FEISHU_SECTIONS = Object.freeze({
  project: '项目信息',
  overview: '五节拍总览',
  beats: '节拍明细',
  prompts: 'Prompt 全文（所见即所发）',
  transitions: `组间衔接总表（${TRANSITION_STAGE}）`,
  delivery: '成片交付状态',
} as const);

export type FeishuSectionKey = keyof typeof FEISHU_SECTIONS;

const HEADING_2 = /^##[ \t]+(.+?)[ \t]*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;

/** 表格单元格净化：转义竖线、换行压成空格、空值给破折号。 */
export function cell(value: string | number): string {
  const text = String(value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
  return text === '' ? FEISHU_EMPTY : text;
}

function table(header: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  return [
    `| ${header.map(cell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

/**
 * 给一段文本挑一个不会被它自己截断的代码围栏。
 * Prompt 全文是用户自由文本，里面理论上可以出现反引号，围栏长度按需增长。
 */
export function fenceFor(text: string): string {
  let fence = '```';
  while (text.includes(fence)) {
    fence += '`';
  }
  return fence;
}

function codeBlock(text: string): string {
  const fence = fenceFor(text);
  return `${fence}text\n${text}\n${fence}`;
}

/** 一节 = 二级标题 + 若干段落，段落之间恒一个空行。 */
function section(title: string, blocks: readonly string[]): string {
  return [`## ${title}`, ...blocks].join('\n\n');
}

/**
 * 节拍明细里的一段。
 *
 * 这一段**不含**组间衔接与 Prompt 全文：前者归「组间衔接总表」，后者归「Prompt 全文」。
 * 分开不是为了好看，是为了让「衔接只在后期那一节」这句话可以被逐节验证。
 */
function beatDetail(beat: FeishuBeatSection): string {
  return [
    `### ${beat.heading}`,
    [
      `- **情绪**：${beat.emotion}`,
      `- **时间位**：${beat.time_range}`,
      `- **板时长**：${beat.duration_label}`,
      `- **镜头节奏**：${beat.camera_rhythm}`,
      `- **剧情核心**：${beat.plot_core}`,
      `- **节拍帧（左 → 右，共 ${beat.frame_count} 格）**：${beat.frames_label_text}`,
      `- **备注**：${beat.note}`,
    ].join('\n'),
  ].join('\n\n');
}

function beatPrompt(beat: FeishuBeatSection): string {
  return [`### ${beat.heading}`, codeBlock(beat.prompt_final)].join('\n\n');
}

/**
 * 渲染整份文档。节序固定：
 * 项目信息 → 五节拍总览 → 节拍明细 → Prompt 全文 → 组间衔接总表 →（成片交付状态）。
 * 末节只在提供了段状态时出现。
 */
export function renderFeishuMarkdown(doc: FeishuDoc): string {
  const blocks: string[] = [
    `# ${doc.doc_title}`,
    `> 集名 **${doc.episode_title}** · 画幅 ${doc.project.aspect_ratio} · ` +
      `节拍数 ${doc.project.beat_count}（恒定） · 板时长合计 ${doc.project.beat_duration_sum_sec} 秒 · ` +
      `导出时间 ${doc.generated_at}`,

    section(FEISHU_SECTIONS.project, [
      table(
        ['字段', '内容'],
        [
          ['集名', doc.episode_title],
          ['题材', doc.project.genre],
          ['画幅', doc.project.aspect_ratio],
          ['整集时长', `${doc.project.total_duration_sec} 秒`],
          ['板时长合计', `${doc.project.beat_duration_sum_sec} 秒`],
          ['全局画风风格词', doc.project.style_prompt],
          ['主角形象描述', doc.project.protagonist],
          ['节拍数', `${doc.project.beat_count}（恒定，不可增减）`],
          ['更新时间', doc.project.updated_at],
        ],
      ),
    ]),

    section(FEISHU_SECTIONS.overview, [
      table(
        ['节拍', '名称', '情绪', '时间位', '板时长', '宫格数'],
        doc.beats.map((beat) => [
          `节拍${beat.index}`,
          beat.beat_name,
          beat.emotion,
          beat.time_range,
          beat.duration_label,
          beat.frame_count,
        ]),
      ),
    ]),

    section(FEISHU_SECTIONS.beats, doc.beats.map(beatDetail)),

    section(FEISHU_SECTIONS.prompts, [
      '> 以下为提交给模型的 Prompt 全文，逐字即请求体内容（R5 所见即所发）。',
      ...doc.beats.map(beatPrompt),
    ]),

    section(FEISHU_SECTIONS.transitions, [
      `> 组间衔接只在${doc.transition_stage}阶段生效，永不进入 Prompt 与生成请求体（AC-6.4）；` +
        '衔接挂在上一块板上，末拍指向下一集。',
      table(
        ['衔接点', '手法', '枚举码', '生效阶段', '说明'],
        doc.transitions.map((transition) => [
          transition.point_label,
          transition.rule,
          transition.code,
          transition.stage,
          transition.note,
        ]),
      ),
    ]),
  ];

  if (doc.delivery !== null) {
    blocks.push(
      section(FEISHU_SECTIONS.delivery, [
        `> ${doc.delivery.summary}`,
        table(
          ['节拍', '状态', '成片地址'],
          doc.beats.map((beat) => [
            `节拍${beat.index}`,
            beat.status_label,
            beat.video_url ?? FEISHU_EMPTY,
          ]),
        ),
      ]),
    );
  }

  return `${blocks.join('\n\n')}\n`;
}

/**
 * 按二级标题把 Markdown 切成 `节名 → 正文`。
 *
 * 代码块内部的行原样归属当前节，不参与标题识别——
 * Prompt 全文是用户自由文本，里面出现 `## ` 也不能把文档切错。
 */
export function splitMarkdownSections(markdown: string): ReadonlyMap<string, string> {
  const sections = new Map<string, string>();
  let title: string | null = null;
  let buffer: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (title !== null) {
      sections.set(title, buffer.join('\n').trim());
    }
  };

  for (const line of markdown.split('\n')) {
    const marker = FENCE.exec(line)?.[1];
    if (marker !== undefined) {
      if (fence === null) {
        fence = marker;
      } else if (marker.startsWith(fence.slice(0, 1)) && marker.length >= fence.length) {
        fence = null;
      }
      buffer.push(line);
      continue;
    }

    const heading = fence === null ? HEADING_2.exec(line)?.[1] : undefined;
    if (heading !== undefined) {
      flush();
      title = heading.trim();
      buffer = [];
      continue;
    }

    buffer.push(line);
  }

  flush();
  return sections;
}

/** 取某一节的正文；节不存在时抛错，避免测试对着 `undefined` 断言出假绿。 */
export function feishuSection(markdown: string, key: FeishuSectionKey): string {
  const title = FEISHU_SECTIONS[key];
  const body = splitMarkdownSections(markdown).get(title);
  if (body === undefined) {
    throw new RangeError(`飞书文档缺少「${title}」一节`);
  }
  return body;
}

export function feishuMarkdownFileName(project: Project): string {
  return `${sanitizeFileNamePart(project.name)}_节拍板_飞书.md`;
}

export function feishuJsonFileName(project: Project): string {
  return `${sanitizeFileNamePart(project.name)}_节拍板_飞书.json`;
}

export function buildFeishuMarkdown(project: Project, options: FeishuDocOptions = {}): string {
  return renderFeishuMarkdown(buildFeishuDoc(project, options));
}

export function feishuJsonText(doc: FeishuDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function buildFeishuMarkdownFile(
  project: Project,
  options: FeishuDocOptions = {},
): DownloadFile {
  return buildFeishuExport(project, options).markdown_file;
}

export function buildFeishuJsonFile(project: Project, options: FeishuDocOptions = {}): DownloadFile {
  return buildFeishuExport(project, options).json_file;
}

/** 一次拿到载荷、Markdown 正文与两个可下载文件；面板要同时用到字数与文件名。 */
export interface FeishuExportBundle {
  readonly doc: FeishuDoc;
  readonly markdown: string;
  readonly markdown_file: DownloadFile;
  readonly json_file: DownloadFile;
}

export function buildFeishuExport(
  project: Project,
  options: FeishuDocOptions = {},
): FeishuExportBundle {
  const doc = buildFeishuDoc(project, options);
  const markdown = renderFeishuMarkdown(doc);

  return Object.freeze({
    doc,
    markdown,
    markdown_file: Object.freeze({
      file_name: feishuMarkdownFileName(project),
      text: markdown,
      mime: FEISHU_MARKDOWN_MIME,
    }),
    json_file: Object.freeze({
      file_name: feishuJsonFileName(project),
      text: feishuJsonText(doc),
      mime: FEISHU_JSON_MIME,
    }),
  });
}
