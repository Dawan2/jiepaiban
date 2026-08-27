/**
 * Prompt 组装器（METH-002 §4、METH-003 §2、PRD 5.3.2 / 5.3.6 / AC-6.4）。
 *
 * 本文件承担 AC-6.4 要求的自动化断言：衔接、节拍名称、备注三个字段的内容
 * 既不出现在 Prompt 全文里，也不出现在生成 API 请求体里。
 */

import { describe, expect, it } from 'vitest';
import { createBeatList, type Beat } from './beats';
import {
  FIXED_PREFIX,
  PROMPT_BEAT_FIELDS,
  PROMPT_EXCLUDED_BEAT_FIELDS,
  assemblePrompt,
  assertPromptClean,
  buildGenerateRequest,
  buildPromptSegments,
  findExcludedFieldLeaks,
} from './prompt';
import { TRANSITION_RULES } from './transitions';
import { createProject, type Project } from './projects';

const EMOTION = '骤然炸裂的震惊，压迫感在三秒内拉满';
const RHYTHM = '极快切入，冲击—反应—环境三段递进';
const PLOT = '婚宴上被当众甩出亲子鉴定，新娘身份瞬间坍塌';
const FRAMES = ['一份亲子鉴定报告被砸在主桌上', '新娘瞳孔骤缩，笑意冻在脸上', '全场宾客哗然，长辈起身'];

/** 三个被硬排除的字段都填成一眼可辨的哨兵值。 */
const SENTINEL_TITLE = '哨兵节拍名不该出现';
const SENTINEL_NOTE = '哨兵备注不该出现';

function filledProject(): Project {
  return createProject(
    {
      name: '婚宴反转',
      genre: '都市·复仇',
      aspect_ratio: '9:16',
      style_prompt: '冷调高对比，胶片颗粒',
      protagonist: '长发女主，米白礼服，左颊有疤',
    },
    { id: 'prj_test', now: '2026-08-27T00:00:00Z' },
  );
}

function fillBeat(beat: Beat): Beat {
  beat.title = SENTINEL_TITLE;
  beat.note = SENTINEL_NOTE;
  beat.emotion = EMOTION;
  beat.camera_rhythm = RHYTHM;
  beat.plot_core = PLOT;
  beat.frames.forEach((frame, i) => {
    frame.text = FRAMES[i] ?? `第 ${i + 1} 格`;
  });
  return beat;
}

function filled(): { project: Project; beat: Beat } {
  const project = filledProject();
  const beat = project.beat_list[0];
  fillBeat(beat);
  return { project, beat };
}

describe('组装公式：前缀 + 情绪 + 时长 + 节奏 + 剧情核心 + 节拍帧', () => {
  it('以固定前缀开头', () => {
    const { project, beat } = filled();
    expect(assemblePrompt(project, beat).startsWith(FIXED_PREFIX)).toBe(true);
  });

  it('五个槽位齐备且顺序固定', () => {
    const { project, beat } = filled();
    const prompt = assemblePrompt(project, beat);
    const positions = [FIXED_PREFIX, EMOTION, '时长8秒', RHYTHM, PLOT, FRAMES[0] ?? ''].map((part) =>
      prompt.indexOf(part),
    );
    positions.forEach((position) => {
      expect(position).toBeGreaterThanOrEqual(0);
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('项目级字段注入在前缀之后、节拍字段之前', () => {
    const { project, beat } = filled();
    const prompt = assemblePrompt(project, beat);
    expect(prompt.indexOf(project.style_prompt)).toBeGreaterThan(prompt.indexOf(FIXED_PREFIX));
    expect(prompt.indexOf(project.protagonist)).toBeLessThan(prompt.indexOf(EMOTION));
    expect(prompt).toContain('画幅9:16');
  });

  it('时长按板序取 canon 值并进入文本', () => {
    const project = filledProject();
    const durations = project.beat_list.map((beat) => assemblePrompt(project, fillBeat(beat)));
    expect(durations[0]).toContain('时长8秒');
    expect(durations[1]).toContain('时长17秒');
    expect(durations[2]).toContain('时长20秒');
    expect(durations[3]).toContain('时长25秒');
    expect(durations[4]).toContain('时长18秒');
  });

  it('帧文案按左 → 右拼接，用箭头连接', () => {
    const { project, beat } = filled();
    const prompt = assemblePrompt(project, beat);
    expect(prompt).toContain(`${FRAMES[0]} → ${FRAMES[1]} → ${FRAMES[2]}`);
  });

  it('第五板只拼 2 格', () => {
    const project = filledProject();
    const fifth = fillBeat(project.beat_list[4]);
    const prompt = assemblePrompt(project, fifth);
    expect(fifth.frames).toHaveLength(2);
    expect(prompt).toContain(`${FRAMES[0]} → ${FRAMES[1]}`);
    expect(prompt).not.toContain(FRAMES[2] ?? '');
  });

  it('空字段直接缺省，不产生占位文本', () => {
    const project = filledProject();
    const beat = project.beat_list[0];
    const prompt = assemblePrompt(project, beat);
    expect(prompt).toBe(
      `${FIXED_PREFIX}，${project.style_prompt}，${project.protagonist}，画幅9:16，时长8秒。`,
    );
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
    expect(prompt).not.toContain('，，');
  });

  it('片段带来源标签，供编辑页着色（PRD 5.3.3）', () => {
    const { project, beat } = filled();
    const segments = buildPromptSegments(project, beat);
    expect(segments.map((segment) => segment.slot)).toEqual([
      '固定前缀',
      '全局画风风格词',
      '主角形象描述',
      '画幅指令',
      '本段情绪',
      '时长',
      '镜头节奏',
      '剧情核心',
      '节拍帧',
    ]);
    expect(new Set(segments.map((segment) => segment.source))).toEqual(
      new Set(['project', 'beat', 'frame']),
    );
  });

  it('白名单只有五类进 Prompt 的字段', () => {
    expect([...PROMPT_BEAT_FIELDS]).toEqual([
      'emotion',
      'duration_sec',
      'camera_rhythm',
      'plot_core',
      'frames',
    ]);
  });
});

describe('红线：衔接绝不进入 Prompt（AC-6.4）', () => {
  it('硬排除清单为衔接、节拍名称、备注', () => {
    expect([...PROMPT_EXCLUDED_BEAT_FIELDS].sort()).toEqual(['note', 'title', 'transition_rule']);
  });

  it('Prompt 全文不含衔接、节拍名称、备注的内容', () => {
    const { project, beat } = filled();
    const prompt = assemblePrompt(project, beat);
    expect(prompt).not.toContain(beat.transition_rule);
    expect(prompt).not.toContain(SENTINEL_TITLE);
    expect(prompt).not.toContain(SENTINEL_NOTE);
    expect(findExcludedFieldLeaks(beat, prompt)).toEqual([]);
    expect(() => assertPromptClean(beat, prompt)).not.toThrow();
  });

  it('对任意节拍、任意衔接取值都不泄漏', () => {
    const project = filledProject();
    project.beat_list.forEach((beat) => {
      fillBeat(beat);
      TRANSITION_RULES.forEach((rule) => {
        beat.transition_rule = rule;
        const prompt = assemblePrompt(project, beat);
        expect(prompt).not.toContain(rule);
        expect(findExcludedFieldLeaks(beat, prompt)).toEqual([]);
      });
    });
  });

  it('默认预填的衔接（音频预接 / 卡点硬切 / 纯硬切 / BGM升调截断 / 黑屏断钩子）都不出现', () => {
    const project = filledProject();
    const prompts = project.beat_list.map((beat) => assemblePrompt(project, fillBeat(beat)));
    const wholeText = prompts.join('\n');
    createBeatList().forEach((beat) => {
      expect(wholeText).not.toContain(beat.transition_rule);
    });
  });

  it('生成请求体里不含衔接、节拍名称、备注，也不含分镜结构', () => {
    const { project, beat } = filled();
    const request = buildGenerateRequest(project, beat);
    const body = JSON.stringify(request);

    expect(body).not.toContain(beat.transition_rule);
    expect(body).not.toContain(SENTINEL_TITLE);
    expect(body).not.toContain(SENTINEL_NOTE);
    expect(body).not.toContain('transition');
    expect(body).not.toContain('title');
    expect(body).not.toContain('note');
    expect(body).not.toMatch(/shot|storyboard|camera_json|lens/i);
  });

  it('请求体的参数位只有时长、画幅、宫格数与镜头组', () => {
    const { project, beat } = filled();
    const request = buildGenerateRequest(project, beat);
    expect(Object.keys(request).sort()).toEqual(['beat_index', 'params', 'prompt']);
    expect(Object.keys(request.params).sort()).toEqual([
      'aspect_ratio',
      'duration_sec',
      'frame_count',
      'g_index',
    ]);
    expect(request.params.duration_sec).toBe(8);
    expect(request.params.frame_count).toBe(3);
    expect(request.params.g_index).toBe('G1');
  });

  it('泄漏时 findExcludedFieldLeaks 报点、assertPromptClean 抛错', () => {
    const { beat } = filled();
    const dirty = `某段文本，${SENTINEL_TITLE}，${beat.transition_rule}，${SENTINEL_NOTE}`;
    expect([...findExcludedFieldLeaks(beat, dirty)].sort()).toEqual([
      'note',
      'title',
      'transition_rule',
    ]);
    expect(() => assertPromptClean(beat, dirty)).toThrow(/AC-6\.4/);
  });
});
