import { describe, expect, it } from 'vitest';
import {
  BEAT_COUNT,
  BEAT_PRESETS,
  GRID_SIZES,
  PROMPT_EXCLUDED_BEAT_FIELDS,
  activeCells,
  createDefaultBeats,
  isBeatReady,
  type Beat,
} from './beats';

/** 一个字段齐备、可提交生成的节拍。 */
function readyBeat(): Beat {
  const beats = createDefaultBeats(100);
  const beat = beats[0];
  if (beat === undefined) {
    throw new Error('createDefaultBeats returned no beats');
  }
  beat.summary = '女主在雨夜被追债人堵在巷口。';
  beat.tone = '紧张';
  beat.cells[0].description = '雨夜巷口，女主背贴砖墙喘息';
  beat.cells[1].description = '三个追债人的皮鞋踩进水洼';
  beat.cells[2].description = '女主攥紧手里的煎饼铲，抬头';
  return beat;
}

describe('五节拍结构（AC-6.1）', () => {
  it('新建项目自动生成恰好 5 个节拍', () => {
    expect(BEAT_COUNT).toBe(5);
    expect(createDefaultBeats()).toHaveLength(5);
  });

  it('5 个节拍按 1–5 顺序预填名称与叙事定位', () => {
    const beats = createDefaultBeats();
    expect(beats.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
    // 板名取方法论 METH-003 §1 的标准板名，为规格用词。
    expect(beats.map((beat) => beat.name)).toEqual([
      '开篇钩子',
      '矛盾建立',
      '打压升级',
      '反转蓄力',
      '断集留客',
    ]);
    expect(beats.every((beat) => beat.role.trim() !== '')).toBe(true);
    expect(BEAT_PRESETS).toHaveLength(BEAT_COUNT);
  });

  it('每拍时长按「单集目标时长 / 5」预填', () => {
    expect(createDefaultBeats(120).map((beat) => beat.durationSec)).toEqual([24, 24, 24, 24, 24]);
    expect(createDefaultBeats().every((beat) => beat.durationSec === null)).toBe(true);
  });

  it('不导出任何增删节拍的能力', async () => {
    const moduleExports = Object.keys(await import('./beats'));
    const mutators = moduleExports.filter((name) => /^(add|append|insert|remove|delete)/i.test(name));
    expect(mutators).toEqual([]);
  });
});

describe('画面宫格（AC-6.3）', () => {
  it('宫格规格仅允许 3 或 2', () => {
    expect([...GRID_SIZES].sort()).toEqual([2, 3]);
  });

  it('切到 2 宫格后第 3 格不参与组装，切回 3 内容恢复', () => {
    const beat = readyBeat();
    const draft = beat.cells[2].description;

    beat.gridSize = 2;
    const cellsAt2 = activeCells(beat);
    expect(cellsAt2).toHaveLength(2);
    expect(cellsAt2.map((cell) => cell.description)).not.toContain(draft);

    beat.gridSize = 3;
    expect(activeCells(beat)).toHaveLength(3);
    expect(beat.cells[2].description).toBe(draft);
  });

  it('宫格里只有白话画面描述，没有镜头级专业字段', () => {
    const cell = createDefaultBeats()[0]?.cells[0];
    expect(Object.keys(cell ?? {}).sort()).toEqual(['description', 'order']);
  });
});

describe('就绪校验（AC-6.2）', () => {
  it('字段齐备时节拍就绪', () => {
    expect(isBeatReady(readyBeat())).toBe(true);
  });

  it('新建的空节拍不就绪', () => {
    expect(createDefaultBeats(100).every((beat) => isBeatReady(beat))).toBe(false);
  });

  it.each<[string, (beat: Beat) => void]>([
    ['剧情概要', (beat) => void (beat.summary = '  ')],
    ['情绪基调', (beat) => void (beat.tone = null)],
    ['时长', (beat) => void (beat.durationSec = null)],
    ['宫格描述', (beat) => void (beat.cells[1].description = '')],
  ])('缺少 %s 时不可提交生成', (_label, blank) => {
    const beat = readyBeat();
    blank(beat);
    expect(isBeatReady(beat)).toBe(false);
  });

  it('衔接与备注为空不影响就绪（二者非必填）', () => {
    const beat = readyBeat();
    beat.transition = '';
    beat.note = '';
    expect(isBeatReady(beat)).toBe(true);
  });

  it('2 宫格时第 3 格为空仍可就绪', () => {
    const beat = readyBeat();
    beat.gridSize = 2;
    beat.cells[2].description = '';
    expect(isBeatReady(beat)).toBe(true);
  });
});

describe('产品红线（AC-6.4 / AC-6.8）', () => {
  it('衔接、备注、节拍名称列入 Prompt 硬排除清单', () => {
    expect([...PROMPT_EXCLUDED_BEAT_FIELDS].sort()).toEqual(['name', 'note', 'transition']);
  });

  it('节拍模型不含任何分镜 / 镜头级字段', () => {
    const forbidden = [
      'shot',
      'shots',
      'shotList',
      'storyboard',
      'camera',
      'cameraMove',
      'lens',
      'angle',
      'framing',
      'shotSize',
    ];
    const keys = Object.keys(readyBeat());
    expect(keys.filter((key) => forbidden.includes(key))).toEqual([]);
  });

  it('节拍字段集合与 PRD 5.2.2 一致', () => {
    expect(Object.keys(readyBeat()).sort()).toEqual([
      'cells',
      'durationSec',
      'gridSize',
      'index',
      'name',
      'note',
      'role',
      'status',
      'summary',
      'tone',
      'transition',
    ]);
  });
});
