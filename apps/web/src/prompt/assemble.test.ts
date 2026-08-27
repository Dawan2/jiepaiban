/**
 * 编辑页组装适配器测试。
 *
 * 组装公式本身由 `../domain/prompt.test.ts` 守卫；这里守的是适配层特有的三件事：
 *   L5 衔接隔离：`transition_rule` / `title` / `note` 永不进入 Prompt；
 *   L7 所见即所发：`text` 由 `segments` 派生，且与领域层 `assemblePrompt` 逐字符相同；
 *   未填清单：空字段不静默跳过，而是挡住提交。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BEAT_INDEXES,
  createBeat,
  frameCountFor,
  type Beat,
  type BeatIndex,
} from '../domain/beats';
import { assemblePrompt } from '../domain/prompt';
import { createProject, type Project } from '../domain/projects';
import { TRANSITION_RULES } from '../domain/transitions';
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

const FRAMES = ['巷口积水映出霓虹', '三双皮鞋踩进水洼', '女主抬头攥紧铁铲'];

function project(): Project {
  return createProject(
    {
      name: '测试项目',
      genre: '都市·爽剧',
      aspect_ratio: '9:16',
      style_prompt: '冷调赛博废土，胶片颗粒',
      protagonist: '短发女青年，机能风冲锋衣',
    },
    { id: 'prj_test', now: '2026-08-27T00:00:00Z' },
  );
}

/** 字段齐备的一拍。 */
function filledBeat(index: BeatIndex): Beat {
  const beat = createBeat(index);
  beat.emotion = '紧张压迫的情绪，压迫感持续收紧';
  beat.camera_rhythm = '极快切入，三段递进';
  beat.plot_core = '女主在雨夜被追债人堵在巷口';
  beat.frames.forEach((frame, i) => {
    frame.text = FRAMES[i] ?? `第 ${i + 1} 格`;
  });
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

  it.each(BEAT_INDEXES.map((index) => [index, frameCountFor(index)] as const))(
    'B%i 产生 %i 个宫格片段',
    (index, expected) => {
      const frames = run(filledBeat(index)).segments.filter(
        (segment) => segment.source === 'frame',
      );
      expect(frames).toHaveLength(expected);
    },
  );

  it('宫格严格按格序，不排序、不去重、不重排', () => {
    const frames = run(filledBeat(1)).segments.filter((segment) => segment.source === 'frame');

    expect(frames.map((frame) => frame.label)).toEqual(['宫格 1', '宫格 2', '宫格 3']);
    expect(frames[0]?.text).toContain(FRAMES[0] ?? '');
    expect(frames[2]?.text).toContain(FRAMES[2] ?? '');
  });

  it('空格被跳过时，剩余片段仍带真实格序', () => {
    const beat = filledBeat(1);
    beat.frames[1]!.text = '   ';
    const frames = run(beat).segments.filter((segment) => segment.source === 'frame');

    expect(frames.map((frame) => frame.label)).toEqual(['宫格 1', '宫格 3']);
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
    const blank = { ...toPrefixInput(project()), style_prompt: '   ' };
    const result = assemble({ prefix: blank, beat: toAssembleView(filledBeat(1)) });

    expect(result.missing).toContainEqual({ kind: 'style_prompt' });
  });
});

describe('所见即所发（L7）', () => {
  it('全文由片段派生', () => {
    const result = run(filledBeat(1));
    expect(result.text).toBe(result.segments.map((segment) => segment.text).join(''));
  });

  it.each(BEAT_INDEXES)('B%i 的面板全文与领域组装器逐字符相同', (index) => {
    const beat = filledBeat(index);
    expect(run(beat).text).toBe(assemblePrompt(project(), beat));
  });

  it('字段残缺时也与领域组装器一致：适配层不补占位、不吞片段', () => {
    const beat = createBeat(1);
    beat.plot_core = '只填了剧情核心';
    expect(run(beat).text).toBe(assemblePrompt(project(), beat));
  });

  it('系统注入的固定前缀在片段里可见，不做隐形注入', () => {
    const result = run(filledBeat(1));
    const prefix = result.segments.find((segment) => segment.label === '项目级·固定前缀');

    expect(prefix).toBeDefined();
    expect(result.text).toContain(prefix?.text.replace(/[，。]$/u, '') ?? '');
  });

  it('片段来源只有三种，没有衔接来源', () => {
    const sources = new Set(run(filledBeat(1)).segments.map((segment) => segment.source));
    expect([...sources].every((source) => ['project', 'beat', 'frame'].includes(source))).toBe(true);
  });
});

describe('参数位', () => {
  it('时长既进文本也进参数位（METH-003 §2 / PRD 5.3.2）', () => {
    const beat = filledBeat(1);
    beat.duration_sec = 24;
    const result = run(beat);

    expect(result.params.duration_sec).toBe(24);
    expect(result.text).toContain('时长24秒');
  });

  it('画幅与宫格数进参数位，参考图键只进参数位', () => {
    const result = run(filledBeat(1), ['img_b1_c1_a.png', 'img_b1_c2_b.png']);

    expect(result.params.aspect_ratio).toBe('9:16');
    expect(result.params.frame_count).toBe(3);
    expect(result.params.reference_image_keys).toEqual([
      'img_b1_c1_a.png',
      'img_b1_c2_b.png',
    ]);
    expect(result.text).not.toContain('img_b1_c1_a.png');
  });
});

describe('衔接隔离（L5）', () => {
  it('组装视图在类型与运行时都不含被排除字段', () => {
    const view = toAssembleView(filledBeat(1));
    expect(Object.keys(view).sort()).toEqual([
      'camera_rhythm',
      'duration_sec',
      'emotion',
      'frames',
      'index',
      'plot_core',
      'reference_image_keys',
    ]);
  });

  it.each(TRANSITION_RULES)('衔接取值「%s」不产生任何片段', (rule) => {
    const beat = filledBeat(1);
    beat.transition_rule = rule;
    beat.title = `名称-${rule}`;
    beat.note = `备注-${rule}`;

    const result = run(beat);

    expect(result.text).not.toContain(rule);
    expect(result.segments.some((segment) => segment.text.includes(`名称-${rule}`))).toBe(false);
    expect(result.segments.some((segment) => segment.text.includes(`备注-${rule}`))).toBe(false);
    expect(() => assertNoRedline(result, beat)).not.toThrow();
  });

  it.each([
    ['普通文案', '踩鼓点，前后各留一帧'],
    ['含 unicode', '断在最高点 ⏎🎬'],
    ['超长', '黑场之后女主已经在医院'.repeat(200)],
    ['与画面描述重合', FRAMES[0] ?? ''],
  ])('%s 的操作要点不产生任何片段', (_label, note) => {
    const beat = filledBeat(1);
    // 加哨兵前缀，这样「与画面描述重合」一行判的是**来源**而非字面重合：
    // 画面描述里本来就有那段文字，但它不该带上备注的哨兵。
    const sentinel = `备注-${note}`;
    beat.note = sentinel;

    const result = run(beat);

    expect(result.segments.some((segment) => segment.text.includes(sentinel))).toBe(false);
    expect(() => assertNoRedline(result, beat)).not.toThrow();
  });

  it('被排除字段与画面描述同文时，主判据仍通过，只降级为告警', () => {
    const beat = filledBeat(1);
    beat.note = FRAMES[0] ?? '';

    const result = run(beat);

    expect(() => assertNoRedline(result, beat)).not.toThrow();
    expect(redlineWarnings(result, beat)).toEqual([
      expect.objectContaining({ code: 'excluded_text_in_frame' }),
    ]);
  });

  it('被排除字段与画面描述无关时不产生告警', () => {
    const beat = filledBeat(1);
    beat.note = '黑场后女主已在医院';
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
    beat.note = '独一无二的备注';
    const result = run(beat);
    const leaked: AssembleResult = {
      ...result,
      segments: [{ source: 'beat', label: '节拍·剧情核心', text: '独一无二的备注' }],
      text: '独一无二的备注',
    };

    expect(() => assertNoRedline(leaked, beat)).toThrow(RedlineViolation);
  });

  it('适配器模块不引入衔接模块：排除是「够不着」，不是「拼完再删」', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/prompt/assemble.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+'.*transitions'/);
  });
});

describe('未填清单', () => {
  it('空白宫格描述计入未填，不静默跳过', () => {
    const beat = filledBeat(1);
    beat.frames[1]!.text = '   ';
    const result = run(beat);

    expect(result.missing).toContainEqual({ kind: 'frame', order: 2 });
    expect(result.segments.filter((segment) => segment.source === 'frame')).toHaveLength(2);
  });

  it('字段齐备时未填清单为空', () => {
    expect(run(filledBeat(1)).missing).toEqual([]);
  });

  it('B5 只需两格即可齐备', () => {
    const beat = filledBeat(5);
    expect(beat.frames).toHaveLength(2);
    expect(run(beat).missing).toEqual([]);
  });

  it('超过 30 秒的时长计入未填', () => {
    const beat = filledBeat(1);
    beat.duration_sec = 31;
    expect(run(beat).missing).toContainEqual({ kind: 'duration_sec' });
  });

  it('组装引擎版本随结果返回，供快照解释历史差异', () => {
    expect(run(filledBeat(1)).engineVersion).toBe(ENGINE_VERSION);
  });
});
