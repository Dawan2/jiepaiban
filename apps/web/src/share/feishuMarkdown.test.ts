/**
 * 飞书 Markdown 渲染（W4/FEISHU-EXPORT）。
 *
 * 本文件是本槽位最硬的守卫，两条主张：
 *
 * 1. **恒 5 拍**：总览表 5 行、明细 5 段、Prompt 5 段、衔接总表 5 行，
 *    段序恒为节拍序，任何脏输入都改不动。
 * 2. **衔接只在后期那一节**（AC-6.4）：六种衔接取值只出现在
 *    「组间衔接总表（后期合成）」一节里；「Prompt 全文」一节里一个字都没有，
 *    连「后期」「衔接」两个词都不出现。断言方式是把渲染结果按二级标题切开逐节复查，
 *    不是对着整篇文本做一次模糊匹配。
 */

import { describe, expect, it } from 'vitest';
import { BEAT_COUNT, type BeatIndex } from '../domain/beats';
import { assemblePrompt } from '../domain/prompt';
import { beatAt } from '../domain/projects';
import { TRANSITION_RULES, TRANSITION_STAGE } from '../domain/transitions';
import { createGeneratedEpisode } from '../export/fixtures';
import { buildSegmentCards } from '../export/segments';
import { createFilledEpisode } from '../testing/goldens';
import { buildFeishuDoc } from './feishuDoc';
import {
  buildFeishuExport,
  buildFeishuJsonFile,
  buildFeishuMarkdown,
  buildFeishuMarkdownFile,
  cell,
  FEISHU_JSON_MIME,
  FEISHU_MARKDOWN_MIME,
  FEISHU_SECTIONS,
  feishuSection,
  fenceFor,
  renderFeishuMarkdown,
  splitMarkdownSections,
} from './feishuMarkdown';

const NOW = '2026-08-27T10:00:00.000Z';

function markdownOf(): string {
  return buildFeishuMarkdown(createFilledEpisode(), { now: NOW });
}

async function markdownWithCards(generated?: readonly BeatIndex[]) {
  const fixture = await createGeneratedEpisode(generated === undefined ? {} : { generated });
  const cards = buildSegmentCards(fixture.project, fixture.controller.snapshot());
  return {
    ...fixture,
    cards,
    markdown: buildFeishuMarkdown(fixture.project, { now: NOW, cards }),
  };
}

/** 数出某段文本里 `### ` 三级标题的条数。 */
function countBeatHeadings(body: string): number {
  return body.split('\n').filter((line) => line.startsWith('### 节拍')).length;
}

/** 数出某段文本里的表格数据行（表头与分隔行不算）。 */
function tableRows(body: string): readonly string[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('| ') && !/^\|( -{3} \|)+$/.test(line.trim()))
    .slice(1);
}

describe('文档骨架与分节', () => {
  it('一级标题带集名，导语给画幅 / 节拍数 / 合计时长 / 导出时间', () => {
    const markdown = markdownOf();
    const [title, blank, lead] = markdown.split('\n');

    expect(title).toBe('# 婚宴反转 · 节拍板导出');
    expect(blank).toBe('');
    expect(lead).toContain('集名 **婚宴反转**');
    expect(lead).toContain('画幅 9:16');
    expect(lead).toContain(`节拍数 ${BEAT_COUNT}（恒定）`);
    expect(lead).toContain('板时长合计 88 秒');
    expect(lead).toContain(`导出时间 ${NOW}`);
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('六节齐备，节序固定', async () => {
    const { markdown } = await markdownWithCards();
    const titles = [...splitMarkdownSections(markdown).keys()];

    expect(titles).toEqual([
      FEISHU_SECTIONS.project,
      FEISHU_SECTIONS.overview,
      FEISHU_SECTIONS.beats,
      FEISHU_SECTIONS.prompts,
      FEISHU_SECTIONS.transitions,
      FEISHU_SECTIONS.delivery,
    ]);
  });

  it('没有段状态时不出「成片交付状态」一节', () => {
    const titles = [...splitMarkdownSections(markdownOf()).keys()];

    expect(titles).not.toContain(FEISHU_SECTIONS.delivery);
    expect(titles).toHaveLength(5);
    expect(() => feishuSection(markdownOf(), 'delivery')).toThrow(RangeError);
  });

  it('项目信息一节列出集名 / 题材 / 画幅 / 画风 / 主角 / 恒定节拍数', () => {
    const body = feishuSection(markdownOf(), 'project');

    expect(body).toContain('| 集名 | 婚宴反转 |');
    expect(body).toContain('| 题材 | 都市·复仇 |');
    expect(body).toContain('| 画幅 | 9:16 |');
    expect(body).toContain('| 全局画风风格词 | 冷调高对比，胶片颗粒质感，强逆光 |');
    expect(body).toContain(`| 节拍数 | ${BEAT_COUNT}（恒定，不可增减） |`);
  });

  it('只用飞书粘贴支持的块级元素：无 HTML 标签、无嵌套表格', () => {
    const markdown = markdownOf();

    expect(markdown).not.toMatch(/<\/?[a-zA-Z]/);
    expect(markdown).not.toContain('||');
  });
});

describe('恒 5 拍（R3 / AC-6.7）', () => {
  it('五节拍总览恰 5 行，逐行带情绪与时间位', () => {
    const rows = tableRows(feishuSection(markdownOf(), 'overview'));

    expect(rows).toHaveLength(BEAT_COUNT);
    expect(rows.map((row) => row.split(' | ')[0])).toEqual([
      '| 节拍1',
      '| 节拍2',
      '| 节拍3',
      '| 节拍4',
      '| 节拍5',
    ]);
    expect(rows[0]).toContain('开篇钩子');
    expect(rows[0]).toContain('0-8s');
    expect(rows[0]).toContain('8 秒');
    expect(rows[4]).toContain('70-88s');
    expect(rows.every((row) => row.includes('骤然炸裂的震惊'))).toBe(true);
  });

  it('节拍明细恰 5 段，每段带情绪 / 时间位 / 节拍帧', () => {
    const body = feishuSection(markdownOf(), 'beats');

    expect(countBeatHeadings(body)).toBe(BEAT_COUNT);
    expect(body).toContain('### 节拍1 · 开篇钩子');
    expect(body).toContain('### 节拍5 · 断集留客');
    expect(body.split('- **情绪**：')).toHaveLength(BEAT_COUNT + 1);
    expect(body.split('- **时间位**：')).toHaveLength(BEAT_COUNT + 1);
    expect(body).toContain('- **时间位**：0-8s');
    expect(body).toContain('- **节拍帧（左 → 右，共 3 格）**：冲击｜');
    expect(body).toContain('- **节拍帧（左 → 右，共 2 格）**：');
  });

  it('Prompt 全文恰 5 段，逐段与组装器逐字一致', () => {
    const project = createFilledEpisode();
    const markdown = buildFeishuMarkdown(project, { now: NOW });
    const body = feishuSection(markdown, 'prompts');

    expect(countBeatHeadings(body)).toBe(BEAT_COUNT);
    [1, 2, 3, 4, 5].forEach((index) => {
      expect(body).toContain(assemblePrompt(project, beatAt(project, index as BeatIndex)));
    });
  });

  it('衔接总表恰 5 行，末行指向下一集', () => {
    const rows = tableRows(feishuSection(markdownOf(), 'transitions'));

    expect(rows).toHaveLength(BEAT_COUNT);
    expect(rows[0]).toContain('节拍1 → 节拍2');
    expect(rows[0]).toContain('音频预接');
    expect(rows[0]).toContain('AUDIO_PRELAP');
    expect(rows[4]).toContain('节拍5 → 下一集');
    expect(rows[4]).toContain('黑屏断钩子');
  });

  it('段状态倒序或缺项都改不动段序', async () => {
    const { project, cards } = await markdownWithCards();
    const reversed = buildFeishuMarkdown(project, { now: NOW, cards: [...cards].reverse() });
    const rows = tableRows(feishuSection(reversed, 'delivery'));

    expect(rows).toHaveLength(BEAT_COUNT);
    expect(rows.map((row) => row.split(' | ')[0])).toEqual([
      '| 节拍1',
      '| 节拍2',
      '| 节拍3',
      '| 节拍4',
      '| 节拍5',
    ]);
  });
});

describe('组间衔接只在后期那一节（AC-6.4）', () => {
  it('六种衔接取值只出现在「组间衔接总表（后期合成）」一节', async () => {
    const { markdown } = await markdownWithCards();
    const sections = splitMarkdownSections(markdown);

    expect(FEISHU_SECTIONS.transitions).toContain(TRANSITION_STAGE);

    const transitions = sections.get(FEISHU_SECTIONS.transitions) ?? '';
    const elsewhere = [...sections.entries()]
      .filter(([title]) => title !== FEISHU_SECTIONS.transitions)
      .map(([, body]) => body)
      .join('\n');

    TRANSITION_RULES.forEach((rule) => {
      expect(elsewhere).not.toContain(rule);
    });
    ['音频预接', '卡点硬切', '纯硬切', 'BGM升调截断', '黑屏断钩子'].forEach((rule) => {
      expect(transitions).toContain(rule);
    });
  });

  it('Prompt 一节里没有衔接取值，连「后期」「衔接」两个词都不出现', async () => {
    const { markdown } = await markdownWithCards();
    const prompts = feishuSection(markdown, 'prompts');

    TRANSITION_RULES.forEach((rule) => {
      expect(prompts).not.toContain(rule);
    });
    expect(prompts).not.toContain(TRANSITION_STAGE);
    expect(prompts).not.toContain('后期');
    expect(prompts).not.toContain('衔接');
    expect(prompts).not.toContain('转场');
  });

  it('节拍明细一节也不带衔接：衔接归后期那一节，明细只讲画面', async () => {
    const { markdown } = await markdownWithCards();
    const beats = feishuSection(markdown, 'beats');

    TRANSITION_RULES.forEach((rule) => {
      expect(beats).not.toContain(rule);
    });
    expect(beats).not.toContain('衔接');
    expect(beats).not.toContain(TRANSITION_STAGE);
  });

  it('后期那一节逐行标注生效阶段，并复述 AC-6.4 的口径', () => {
    const body = feishuSection(markdownOf(), 'transitions');

    expect(body.split(TRANSITION_STAGE)).toHaveLength(BEAT_COUNT + 2);
    expect(body).toContain('永不进入 Prompt 与生成请求体（AC-6.4）');
    expect(body).toContain('| 生效阶段 |');
  });

  it('把衔接改成别的取值，也只在后期那一节露面', async () => {
    const fixture = await createGeneratedEpisode();
    beatAt(fixture.project, 2).transition_rule = '螺口顺滑过渡';
    const cards = buildSegmentCards(fixture.project, fixture.controller.snapshot());
    const markdown = buildFeishuMarkdown(fixture.project, { now: NOW, cards });
    const sections = splitMarkdownSections(markdown);

    expect(sections.get(FEISHU_SECTIONS.transitions)).toContain('螺口顺滑过渡');
    [FEISHU_SECTIONS.project, FEISHU_SECTIONS.overview, FEISHU_SECTIONS.beats, FEISHU_SECTIONS.prompts, FEISHU_SECTIONS.delivery].forEach(
      (title) => {
        expect(sections.get(title)).not.toContain('螺口顺滑过渡');
      },
    );
  });

  it('衔接的四个表头也只在后期那一节', async () => {
    const { markdown } = await markdownWithCards();
    const sections = splitMarkdownSections(markdown);
    const elsewhere = [
      FEISHU_SECTIONS.project,
      FEISHU_SECTIONS.overview,
      FEISHU_SECTIONS.beats,
      FEISHU_SECTIONS.prompts,
      FEISHU_SECTIONS.delivery,
    ];

    ['衔接点', '手法', '枚举码', '生效阶段'].forEach((header) => {
      expect(sections.get(FEISHU_SECTIONS.transitions)).toContain(`| ${header} |`);
      elsewhere.forEach((title) => {
        expect(sections.get(title)).not.toContain(header);
      });
    });
  });
});

describe('分节切分器', () => {
  it('认二级标题，不认三级标题', () => {
    const sections = splitMarkdownSections('# 标题\n\n## 甲\n\n正文甲\n\n### 子\n\n## 乙\n\n正文乙\n');

    expect([...sections.keys()]).toEqual(['甲', '乙']);
    expect(sections.get('甲')).toContain('### 子');
    expect(sections.get('乙')).toBe('正文乙');
  });

  it('代码块里的 `## ` 不切节', () => {
    const sections = splitMarkdownSections('## 甲\n\n```text\n## 假标题\n```\n\n## 乙\n\n正文乙\n');

    expect([...sections.keys()]).toEqual(['甲', '乙']);
    expect(sections.get('甲')).toContain('## 假标题');
  });

  it('Prompt 正文里出现 `## ` 也不串节', () => {
    const project = createFilledEpisode();
    beatAt(project, 4).plot_core = '## 这不是标题';
    const sections = splitMarkdownSections(buildFeishuMarkdown(project, { now: NOW }));

    expect([...sections.keys()]).toEqual([
      FEISHU_SECTIONS.project,
      FEISHU_SECTIONS.overview,
      FEISHU_SECTIONS.beats,
      FEISHU_SECTIONS.prompts,
      FEISHU_SECTIONS.transitions,
    ]);
    expect(sections.get(FEISHU_SECTIONS.prompts)).toContain('## 这不是标题');
  });
});

describe('单元格净化与围栏', () => {
  it('竖线转义、换行压平、空值给破折号', () => {
    expect(cell('甲|乙')).toBe('甲\\|乙');
    expect(cell('甲\n乙')).toBe('甲 乙');
    expect(cell('   ')).toBe('—');
    expect(cell(8)).toBe('8');
  });

  it('剧情核心里带竖线也不会把表格撑破', () => {
    const project = createFilledEpisode();
    beatAt(project, 1).emotion = '紧张|压迫';
    const rows = tableRows(
      feishuSection(buildFeishuMarkdown(project, { now: NOW }), 'overview'),
    );

    expect(rows).toHaveLength(BEAT_COUNT);
    expect(rows[0]?.split(' | ')).toHaveLength(6);
    expect(rows[0]).toContain('紧张\\|压迫');
  });

  it('围栏按内容加长，Prompt 里带反引号也截不断', () => {
    expect(fenceFor('普通文本')).toBe('```');
    expect(fenceFor('包含 ``` 的文本')).toBe('````');

    const project = createFilledEpisode();
    beatAt(project, 1).plot_core = '剧情里带 ``` 三个反引号';
    const prompts = feishuSection(buildFeishuMarkdown(project, { now: NOW }), 'prompts');

    expect(prompts).toContain('````text');
    expect(splitMarkdownSections(buildFeishuMarkdown(project, { now: NOW })).size).toBe(5);
  });
});

describe('可下载文件', () => {
  it('Markdown 文件名取项目名，扩展名为 .md', () => {
    const file = buildFeishuMarkdownFile(createFilledEpisode(), { now: NOW });

    expect(file.file_name).toBe('婚宴反转_节拍板_飞书.md');
    expect(file.file_name.endsWith('.md')).toBe(true);
    expect(file.mime).toBe(FEISHU_MARKDOWN_MIME);
    expect(file.mime).toContain('text/markdown');
    expect(file.text).toBe(buildFeishuMarkdown(createFilledEpisode(), { now: NOW }));
  });

  it('JSON 文件与载荷同源，末尾带换行', () => {
    const project = createFilledEpisode();
    const file = buildFeishuJsonFile(project, { now: NOW });

    expect(file.file_name).toBe('婚宴反转_节拍板_飞书.json');
    expect(file.mime).toBe(FEISHU_JSON_MIME);
    expect(file.text.endsWith('\n')).toBe(true);
    expect(JSON.parse(file.text)).toEqual(
      JSON.parse(JSON.stringify(buildFeishuDoc(project, { now: NOW }))),
    );
  });

  it('文件名里的路径分隔符被净化，中文原样保留', () => {
    const project = createFilledEpisode();
    project.name = '婚宴/反转:第一集';

    expect(buildFeishuMarkdownFile(project, { now: NOW }).file_name).toBe(
      '婚宴_反转_第一集_节拍板_飞书.md',
    );
  });

  it('一次拿到载荷 / 正文 / 两个文件，三者同源', () => {
    const project = createFilledEpisode();
    const bundle = buildFeishuExport(project, { now: NOW });

    expect(bundle.markdown).toBe(renderFeishuMarkdown(bundle.doc));
    expect(bundle.markdown_file.text).toBe(bundle.markdown);
    expect(JSON.parse(bundle.json_file.text)).toEqual(JSON.parse(JSON.stringify(bundle.doc)));
    expect(Object.isFrozen(bundle)).toBe(true);
  });

  it('导出载荷里没有任何生成侧的密钥字段', () => {
    const text = buildFeishuJsonFile(createFilledEpisode(), { now: NOW }).text;

    ['api_key', 'apiKey', 'token', 'secret'].forEach((key) => {
      expect(text).not.toContain(key);
    });
  });
});
