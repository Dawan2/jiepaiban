/**
 * 组装器测试（桩实现，契约见 `docs/architecture/prompt-engine.md`）。
 *
 * 重点不是"文案拼得好不好看"，而是两条最难靠人工纪律保证的红线：
 *   L5 衔接隔离：`transition` / `name` / `note` 永不进入 Prompt；
 *   L7 所见即所发：`text` 由 `segments` 派生，二者不可能不一致。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BEAT_INDEXES,
  createDefaultBeats,
  gridSizeForBeatIndex,
  type Beat,
  type BeatIndex,
} from '../domain/beats';
import { createProject, type Project } from '../domain/projects';
import {
  ENGINE_VERSION,
  RedlineViolation,
  assemble,
  assertNoRedline,
  redlineWarnings,
  toAssembleView,
  toPrefixInput,
  type AssembleResult,
} from './assemble';

function project(): Project {
  return createProject(
    {
      name: '测试项目',
      genre: '都市·爽剧',
      aspectRatio: '9:16',
      episodeDurationSec: 120,
      stylePrompt: '冷调赛博废土，胶片颗粒',
      protagonist: '短发女青年，机能风冲锋衣',
    },
    'prj_test',
    '2026-08-27T00:00:00Z',
  );
}

/** 字段齐备的一拍。 */
function filledBeat(index: BeatIndex): Beat {
  const beat = createDefaultBeats(120).find((item) => item.index === index);
  if (beat === undefined) {
    throw new Error(`缺少节拍 ${index}`);
  }
  beat.summary = '女主在雨夜被追债人堵在巷口';
  beat.tone = '紧张';
  beat.cells[0].description = '巷口积水映出霓虹';
  beat.cells[1].description = '三双皮鞋踩进水洼';
  beat.cells[2].description = '女主抬头攥紧铁铲';
  return beat;
}

function run(beat: Beat, imageKeys: readonly string[] = []): AssembleResult {
  return assemble({ prefix: toPrefixInput(project()), beat: toAssembleView(beat, imageKeys) });
}

describe('组装结构', () => {
  it('三段顺序固定：项目级 → 节拍级 → 宫格级', () => {
    const sources = run(filledBeat(1)).segments.map((segment) => segment.source);
    const firstBeat = sources.indexOf('beat');
    const firstFrame = sources.indexOf('frame');

    expect(sources.lastIndexOf('project')).toBeLessThan(firstBeat);
    expect(firstBeat).toBeLessThan(firstFrame);
    expect(new Set(sources)).toEqual(new Set(['project', 'beat', 'frame']));
  });

  it.each(BEAT_INDEXES.map((index) => [index, gridSizeForBeatIndex(index)] as const))(
    'B%i 产生 %i 个宫格片段',
    (index, expected) => {
      const frames = run(filledBeat(index)).segments.filter(
        (segment) => segment.source === 'frame',
      );
      expect(frames).toHaveLength(expected);
    },
  );

  it('宫格严格按格序，不排序、不去重、不重排', () => {
    const beat = filledBeat(1);
    const frames = run(beat).segments.filter((segment) => segment.source === 'frame');

    expect(frames.map((frame) => frame.label)).toEqual(['宫格 1', '宫格 2', '宫格 3']);
    expect(frames[0]?.text).toContain('巷口积水映出霓虹');
    expect(frames[2]?.text).toContain('女主抬头攥紧铁铲');
  });

  it('5 板的固定前缀逐字符相同', () => {
    const prefixes = BEAT_INDEXES.map((index) =>
      run(filledBeat(index))
        .segments.filter((segment) => segment.source === 'project')
        .map((segment) => segment.text)
        .join(''),
    );

    expect(new Set(prefixes).size).toBe(1);
  });

  it('前缀缺失即计入未填：空白风格词是跨板漂移的直接来源', () => {
    const blank = { ...toPrefixInput(project()), stylePrompt: '   ' };
    const result = assemble({ prefix: blank, beat: toAssembleView(filledBeat(1)) });

    expect(result.missing).toContainEqual({ kind: 'stylePrompt' });
  });
});

describe('所见即所发（L7）', () => {
  it('全文由片段派生', () => {
    const result = run(filledBeat(1));
    expect(result.text).toBe(result.segments.map((segment) => segment.text).join(''));
  });

  it('系统注入的画质词在片段里可见，不做隐形注入', () => {
    const result = run(filledBeat(1));
    const quality = result.segments.find((segment) => segment.label === '项目级·画质');

    expect(quality).toBeDefined();
    expect(result.text).toContain(quality?.text.replace(/[，。]$/u, '') ?? '');
  });

  it('片段来源只有三种，没有衔接来源', () => {
    const sources = new Set(run(filledBeat(1)).segments.map((segment) => segment.source));
    expect([...sources].every((source) => ['project', 'beat', 'frame'].includes(source))).toBe(true);
  });
});

describe('参数位不入文本', () => {
  it('时长只出现在参数里', () => {
    const beat = filledBeat(1);
    beat.durationSec = 24;
    const result = run(beat);

    expect(result.params.durationSec).toBe(24);
    expect(result.text).not.toContain('24');
    expect(result.text).not.toContain('时长');
  });

  it('画幅与参考图键走参数位', () => {
    const result = run(filledBeat(1), ['img_b1_c1_a.png', 'img_b1_c2_b.png']);

    expect(result.params.aspectRatio).toBe('9:16');
    expect(result.params.referenceImageKeys).toEqual(['img_b1_c1_a.png', 'img_b1_c2_b.png']);
    expect(result.text).not.toContain('img_b1_c1_a.png');
  });
});

describe('衔接隔离（L5）', () => {
  it('组装视图在类型与运行时都不含被排除字段', () => {
    const view = toAssembleView(filledBeat(1));
    expect(Object.keys(view).sort()).toEqual([
      'cells',
      'durationSec',
      'index',
      'referenceImageKeys',
      'summary',
      'tone',
    ]);
  });

  it.each([
    ['普通文案', '卡点硬切，踩鼓点'],
    ['含 unicode', '黑屏断钩子 ⏎🎬 断在最高点'],
    ['超长', '螺口顺滑过渡'.repeat(200)],
    ['与画面描述重合', '巷口积水映出霓虹'],
  ])('%s 的衔接内容不产生任何片段', (_label, transition) => {
    const beat = filledBeat(1);
    beat.transition = transition;
    beat.name = `名称-${transition}`;
    beat.note = `备注-${transition}`;

    const result = run(beat);

    expect(
      result.segments.some((segment) => segment.text.includes(`名称-${transition}`)),
    ).toBe(false);
    expect(
      result.segments.some((segment) => segment.text.includes(`备注-${transition}`)),
    ).toBe(false);
    expect(() => assertNoRedline(result, beat)).not.toThrow();
  });

  it('衔接与画面描述同文时，主判据仍通过，只降级为告警', () => {
    const beat = filledBeat(1);
    beat.transition = '巷口积水映出霓虹';

    const result = run(beat);

    expect(() => assertNoRedline(result, beat)).not.toThrow();
    expect(redlineWarnings(result, beat)).toEqual([
      expect.objectContaining({ code: 'transition_text_in_cell' }),
    ]);
  });

  it('衔接与画面描述无关时不产生告警', () => {
    const beat = filledBeat(1);
    beat.transition = '音频预接';
    expect(redlineWarnings(run(beat), beat)).toEqual([]);
  });

  it('伪造来源的片段被运行时断言拦下', () => {
    const beat = filledBeat(1);
    const result = run(beat);
    const forged: AssembleResult = {
      ...result,
      segments: [
        ...result.segments,
        { source: 'transition' as never, label: '衔接', text: '黑屏断钩子。' },
      ],
    };

    expect(() => assertNoRedline(forged, beat)).toThrow(RedlineViolation);
  });

  it('全文与片段不一致时被运行时断言拦下', () => {
    const beat = filledBeat(1);
    const result = run(beat);

    expect(() => assertNoRedline({ ...result, text: `${result.text}偷加一句` }, beat)).toThrow(
      RedlineViolation,
    );
  });

  it('被排除字段若产生了同文片段，断言拦下', () => {
    const beat = filledBeat(1);
    beat.name = '独一无二的板名';
    const result = run(beat);
    const leaked: AssembleResult = {
      ...result,
      segments: [{ source: 'beat', label: '节拍·剧情核心', text: '独一无二的板名' }],
      text: '独一无二的板名',
    };

    expect(() => assertNoRedline(leaked, beat)).toThrow(RedlineViolation);
  });

  it('组装器模块不引入衔接模块：排除是"够不着"，不是"拼完再删"', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/prompt/assemble.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+'.*transitions'/);
  });
});

describe('未填清单', () => {
  it('空白宫格描述计入未填，不静默跳过', () => {
    const beat = filledBeat(1);
    beat.cells[1].description = '   ';
    const result = run(beat);

    expect(result.missing).toContainEqual({ kind: 'cell', order: 2 });
    expect(result.segments.filter((segment) => segment.source === 'frame')).toHaveLength(2);
  });

  it('字段齐备时未填清单为空', () => {
    expect(run(filledBeat(1)).missing).toEqual([]);
  });

  it('B5 只需两格即可齐备', () => {
    const beat = filledBeat(5);
    beat.cells[2].description = '';
    expect(run(beat).missing).toEqual([]);
  });

  it('组装器版本随结果返回，供快照解释历史差异', () => {
    expect(run(filledBeat(1)).engineVersion).toBe(ENGINE_VERSION);
  });
});
