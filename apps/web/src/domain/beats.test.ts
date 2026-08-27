import { describe, expect, it } from 'vitest';
import {
  BEAT_COUNT,
  BEAT_INDEXES,
  BEAT_PRESETS,
  CELL_ROLE_HINTS,
  GRID_SIZES,
  GRID_SIZE_BY_BEAT_INDEX,
  PROMPT_EXCLUDED_BEAT_FIELDS,
  TOTAL_GRID_CELL_COUNT,
  activeCells,
  beatTimeRanges,
  cellRoleHint,
  createDefaultBeats,
  episodeTotalSec,
  gridSizeForBeatIndex,
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

describe('宫格数位置锁（METH-003 §1）', () => {
  it('B1–B4 三格、B5 两格', () => {
    expect(BEAT_INDEXES.map((index) => gridSizeForBeatIndex(index))).toEqual([3, 3, 3, 3, 2]);
    expect(GRID_SIZE_BY_BEAT_INDEX).toEqual({ 1: 3, 2: 3, 3: 3, 4: 3, 5: 2 });
  });

  it('新建项目的 5 拍按板位预填格数，合计 14 格', () => {
    const beats = createDefaultBeats(120);
    expect(beats.map((beat) => beat.gridSize)).toEqual([3, 3, 3, 3, 2]);
    expect(beats.reduce((sum, beat) => sum + activeCells(beat).length, 0)).toBe(
      TOTAL_GRID_CELL_COUNT,
    );
    expect(TOTAL_GRID_CELL_COUNT).toBe(14);
  });

  it('每格都有位置语义提示，且提示数与格数一致', () => {
    BEAT_INDEXES.forEach((index) => {
      const size = gridSizeForBeatIndex(index);
      expect(CELL_ROLE_HINTS[index]).toHaveLength(size);
      for (let order = 1; order <= size; order += 1) {
        expect(cellRoleHint(index, order)).not.toBe('');
      }
    });
  });

  it('不导出任何增删宫格的能力', async () => {
    const moduleExports = Object.keys(await import('./beats'));
    expect(
      moduleExports.filter((name) => /(cell|grid)/i.test(name) && /^(add|remove|delete)/i.test(name)),
    ).toEqual([]);
  });
});

describe('时间位（METH-003 §1 时间位列）', () => {
  it('由各拍时长累加得出 5 个时间位', () => {
    const beats = createDefaultBeats(120);
    expect(beatTimeRanges(beats)).toEqual([
      { startSec: 0, endSec: 24 },
      { startSec: 24, endSec: 48 },
      { startSec: 48, endSec: 72 },
      { startSec: 72, endSec: 96 },
      { startSec: 96, endSec: 120 },
    ]);
    expect(episodeTotalSec(beats)).toBe(120);
  });

  it('时长未填则该拍及其后续时间位不可知，不用 0 顶替', () => {
    const beats = createDefaultBeats(120);
    const third = beats[2];
    if (third === undefined) {
      throw new Error('缺少节拍 3');
    }
    third.durationSec = null;

    expect(beatTimeRanges(beats)).toEqual([
      { startSec: 0, endSec: 24 },
      { startSec: 24, endSec: 48 },
      null,
      null,
      null,
    ]);
    expect(episodeTotalSec(beats)).toBeNull();
  });

  it('时间位随时长改动而变', () => {
    const beats = createDefaultBeats(120);
    const first = beats[0];
    if (first === undefined) {
      throw new Error('缺少节拍 1');
    }
    first.durationSec = 8;

    expect(beatTimeRanges(beats)[0]).toEqual({ startSec: 0, endSec: 8 });
    expect(beatTimeRanges(beats)[1]).toEqual({ startSec: 8, endSec: 32 });
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
