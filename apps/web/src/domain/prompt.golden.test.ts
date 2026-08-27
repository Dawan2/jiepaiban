/**
 * Prompt 组装器的黄金回归用例（FR-3-08、AC-F3-1、AC-6.4）。
 *
 * 与 `prompt.test.ts` 的分工：那边测组装规则的行为，这边把 Beat 1 样例
 * （婚宴 · 戒指砸地 / 女主震惊 / 宾客围观）的**全文期望值**钉死成字面量，
 * 任何对公式、槽位顺序、分隔符、固定前缀的改动都会在这里第一时间变红。
 *
 * 最硬的一条：**组间衔接文本永远不出现在 Prompt 里**，
 * 六种衔接取值 × 五块板全排列后组装结果逐字节相同。
 */

import { describe, expect, it } from 'vitest';
import {
  FIXED_PREFIX,
  assemblePrompt,
  assertPromptClean,
  buildGenerateRequest,
  buildPromptSegments,
  findExcludedFieldLeaks,
} from './prompt';
import { TRANSITION_RULES } from './transitions';
import { beatAt } from './projects';
import {
  BEAT1_GOLDEN_PROMPT,
  BEAT1_GOLDEN_SLOTS,
  BEAT1_SAMPLE,
  createBeat1Sample,
  createFilledEpisode,
} from '../testing/goldens';

/**
 * PRD 5.3「转场词拦截清单（最小集）」。组装结果命中任一即为红线违规。
 * 注意这里不含「分镜」类禁用词——那由 `npm run lint:terms` 的术语扫描负责。
 */
const TRANSITION_WORDS: readonly string[] = Object.freeze([
  '音频预接',
  '螺口顺滑',
  '卡点硬切',
  '硬切',
  'BGM升调',
  'BGM 升调',
  '升调截断',
  '黑屏断钩子',
  '黑屏截断',
  '转场',
  '过渡',
]);

describe('黄金用例：Beat 1（婚宴 · 戒指砸地）', () => {
  it('固定前缀就是方法论钉死的那一句', () => {
    expect(FIXED_PREFIX.startsWith('漫剧厚涂画风')).toBe(true);
    expect(FIXED_PREFIX).toContain('高清8K');
    expect(FIXED_PREFIX).toContain('人物五官稳定无漂移');
  });

  it('组装全文逐字节等于黄金值', () => {
    const { project, beat } = createBeat1Sample();
    expect(assemblePrompt(project, beat)).toBe(BEAT1_GOLDEN_PROMPT);
  });

  it('黄金值以固定前缀开头、以句号收尾，且不含空槽位痕迹', () => {
    expect(BEAT1_GOLDEN_PROMPT.startsWith(FIXED_PREFIX)).toBe(true);
    expect(BEAT1_GOLDEN_PROMPT.endsWith('。')).toBe(true);
    expect(BEAT1_GOLDEN_PROMPT).not.toContain('undefined');
    expect(BEAT1_GOLDEN_PROMPT).not.toContain('null');
    expect(BEAT1_GOLDEN_PROMPT).not.toContain('，，');
  });

  it('槽位顺序与来源标签等于黄金值', () => {
    const { project, beat } = createBeat1Sample();
    const segments = buildPromptSegments(project, beat);
    expect(segments.map((segment) => segment.slot)).toEqual([...BEAT1_GOLDEN_SLOTS]);
    expect(segments.map((segment) => segment.source)).toEqual([
      'project',
      'project',
      'project',
      'project',
      'beat',
      'beat',
      'beat',
      'beat',
      'frame',
    ]);
  });

  it('三格按左 → 右拼接：戒指砸地 → 女主震惊 → 宾客围观', () => {
    const { project, beat } = createBeat1Sample();
    const prompt = assemblePrompt(project, beat);
    const [impact, reaction, env] = BEAT1_SAMPLE.beat.frames;

    expect(beat.frames.map((frame) => frame.semantic)).toEqual(['impact', 'reaction', 'env']);
    expect(prompt).toContain(`${impact} → ${reaction} → ${env}`);
    expect(prompt.indexOf(impact ?? '')).toBeLessThan(prompt.indexOf(reaction ?? ''));
    expect(prompt.indexOf(reaction ?? '')).toBeLessThan(prompt.indexOf(env ?? ''));
  });

  it('时长取板序 canon 值 8 秒，且同时进文本与参数位', () => {
    const { project, beat } = createBeat1Sample();
    expect(assemblePrompt(project, beat)).toContain('时长8秒');
    expect(buildGenerateRequest(project, beat).params.duration_sec).toBe(8);
  });

  it('重复组装稳定：同一输入永远得到同一字符串', () => {
    const { project, beat } = createBeat1Sample();
    const runs = Array.from({ length: 5 }, () => assemblePrompt(project, beat));
    expect(new Set(runs).size).toBe(1);
    expect(runs[0]).toBe(BEAT1_GOLDEN_PROMPT);
  });

  it('生成请求体等于黄金值：只有 prompt 与四个参数位', () => {
    const { project, beat } = createBeat1Sample();
    expect(buildGenerateRequest(project, beat)).toEqual({
      beat_index: 1,
      prompt: BEAT1_GOLDEN_PROMPT,
      params: { duration_sec: 8, aspect_ratio: '9:16', frame_count: 3, g_index: 'G1' },
    });
  });
});

describe('黄金用例红线：衔接文本永不进入 Prompt', () => {
  it('黄金值本身不含任何衔接取值', () => {
    TRANSITION_RULES.forEach((rule) => {
      expect(BEAT1_GOLDEN_PROMPT).not.toContain(rule);
    });
  });

  it('黄金值不含转场词拦截清单里的任何一个词', () => {
    TRANSITION_WORDS.forEach((word) => {
      expect(BEAT1_GOLDEN_PROMPT).not.toContain(word);
    });
  });

  it('六种衔接取值下，组装结果逐字节相同', () => {
    const { project, beat } = createBeat1Sample();
    const results = TRANSITION_RULES.map((rule) => {
      beat.transition_rule = rule;
      return assemblePrompt(project, beat);
    });
    expect(new Set(results)).toEqual(new Set([BEAT1_GOLDEN_PROMPT]));
  });

  it('五块板 × 六种衔接全排列，衔接文本一次都不出现', () => {
    const project = createFilledEpisode();
    project.beat_list.forEach((beat) => {
      TRANSITION_RULES.forEach((rule) => {
        beat.transition_rule = rule;
        const prompt = assemblePrompt(project, beat);
        TRANSITION_WORDS.forEach((word) => {
          expect(prompt).not.toContain(word);
        });
        expect(findExcludedFieldLeaks(beat, prompt)).toEqual([]);
        expect(() => assertPromptClean(beat, prompt)).not.toThrow();
      });
    });
  });

  it('节拍名称与备注同样不出现，且改写它们不影响黄金值', () => {
    const { project, beat } = createBeat1Sample();
    expect(BEAT1_GOLDEN_PROMPT).not.toContain(BEAT1_SAMPLE.beat.title);
    expect(BEAT1_GOLDEN_PROMPT).not.toContain(BEAT1_SAMPLE.beat.note);

    beat.title = '哨兵节拍名不该出现';
    beat.note = '哨兵备注不该出现';
    const prompt = assemblePrompt(project, beat);
    expect(prompt).toBe(BEAT1_GOLDEN_PROMPT);
    expect(prompt).not.toContain('哨兵');
  });

  it('把衔接塞进 Prompt 会被 assertPromptClean 当场抓住', () => {
    const { project, beat } = createBeat1Sample();
    const tampered = `${assemblePrompt(project, beat)}衔接方式：${beat.transition_rule}`;
    expect(findExcludedFieldLeaks(beat, tampered)).toContain('transition_rule');
    expect(() => assertPromptClean(beat, tampered)).toThrow(/AC-6\.4/);
  });

  it('生成请求体的 JSON 里没有衔接、名称、备注，也没有镜头级结构', () => {
    const project = createFilledEpisode();
    project.beat_list.forEach((beat) => {
      const body = JSON.stringify(buildGenerateRequest(project, beat));
      expect(body).not.toContain(beat.transition_rule);
      expect(body).not.toContain(beat.title);
      expect(body).not.toContain(beat.note);
      expect(body).not.toMatch(/transition|title|note|shot|storyboard|camera_json|lens/i);
    });
  });

  it('整集五板的时长与宫格数按板序锁定，衔接互不影响', () => {
    const project = createFilledEpisode();
    const specs = project.beat_list.map((beat) => {
      const request = buildGenerateRequest(project, beatAt(project, beat.index));
      return [request.params.duration_sec, request.params.frame_count, request.params.g_index];
    });
    expect(specs).toEqual([
      [8, 3, 'G1'],
      [17, 3, 'G2'],
      [20, 3, 'G3'],
      [25, 3, 'G4'],
      [18, 2, 'G5'],
    ]);
  });
});
