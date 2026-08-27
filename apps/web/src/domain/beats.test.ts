/**
 * 黄金五板骨架与就绪校验（METH-002 §2/§9、METH-003 §1、PRD 5.2.2 / AC-6.2）。
 * 结构锁的反向断言在 `./locks.test.ts`。
 */

import { describe, expect, it } from 'vitest';
import {
  BASELINE_EPISODE_DURATION_SEC,
  BEAT_COUNT,
  BEAT_DEFS,
  BEAT_INDEXES,
  EPISODE_DURATION_RANGE_SEC,
  MAX_BEAT_DURATION_SEC,
  beatDef,
  createBeatList,
  frameCountFor,
  isBeatReady,
  isDurationWithinCap,
  orderedFrames,
  validateBeatList,
  type Beat,
  type BeatIndex,
} from './beats';

/** 一块字段齐备、可提交生成的板。 */
function readyBeat(): Beat {
  const beat = createBeatList()[0];
  beat.emotion = '骤然炸裂的震惊，压迫感在三秒内拉满';
  beat.camera_rhythm = '极快切入，冲击—反应—环境三段递进，节奏不留缓冲';
  beat.plot_core = '婚宴上被当众甩出亲子鉴定，新娘身份瞬间坍塌';
  beat.frames.forEach((frame, i) => {
    frame.text = `第 ${i + 1} 格画面描述`;
  });
  return beat;
}

describe('BEAT_DEFS 是 canon 骨架', () => {
  it('五板名称与顺序硬锁', () => {
    expect(BEAT_DEFS.map((def) => def.name)).toEqual([
      '开篇钩子',
      '矛盾建立',
      '打压升级',
      '反转蓄力',
      '断集留客',
    ]);
    expect(BEAT_DEFS.map((def) => def.beat_type)).toEqual([
      'BEAT_HOOK',
      'BEAT_CONFLICT',
      'BEAT_ESCALATION',
      'BEAT_CHARGEUP',
      'BEAT_CLIFFHANGER',
    ]);
    expect(BEAT_DEFS.map((def) => def.g_index)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5']);
    expect(BEAT_INDEXES).toEqual([1, 2, 3, 4, 5]);
  });

  it('时间位为 0-8 / 8-25 / 25-45 / 45-70 / 70-88', () => {
    expect(BEAT_DEFS.map((def) => [def.time_start, def.time_end])).toEqual([
      [0, 8],
      [8, 25],
      [25, 45],
      [45, 70],
      [70, 88],
    ]);
  });

  it('时间位首尾相接、无缝无叠，整集收在 88s', () => {
    BEAT_DEFS.forEach((def, i) => {
      const previous = BEAT_DEFS[i - 1];
      expect(def.time_start).toBe(previous === undefined ? 0 : previous.time_end);
    });
    expect(BEAT_DEFS[4]?.time_end).toBe(BASELINE_EPISODE_DURATION_SEC);
  });

  it('板时长等于时间位跨度，合计 88s 且落在整集区间内', () => {
    expect(BEAT_DEFS.map((def) => def.duration_sec)).toEqual([8, 17, 20, 25, 18]);
    BEAT_DEFS.forEach((def) => {
      expect(def.duration_sec).toBe(def.time_end - def.time_start);
    });
    const total = BEAT_DEFS.reduce((sum, def) => sum + def.duration_sec, 0);
    expect(total).toBe(BASELINE_EPISODE_DURATION_SEC);
    expect(total).toBeGreaterThanOrEqual(EPISODE_DURATION_RANGE_SEC.min);
    expect(total).toBeLessThanOrEqual(EPISODE_DURATION_RANGE_SEC.max);
  });

  it('宫格数为 3/3/3/3/2，由板序决定', () => {
    expect(BEAT_DEFS.map((def) => def.frame_count)).toEqual([3, 3, 3, 3, 2]);
    expect(BEAT_INDEXES.map(frameCountFor)).toEqual([3, 3, 3, 3, 2]);
    expect(beatDef(5).frame_count).toBe(2);
  });

  it('组间衔接取封闭目录里的值，第五板为黑屏断钩子', () => {
    expect(BEAT_DEFS.map((def) => def.transition_rule)).toEqual([
      '音频预接',
      '卡点硬切',
      '纯硬切',
      'BGM升调截断',
      '黑屏断钩子',
    ]);
  });

  it('第一板带 canon 帧语义：冲击 / 反应 / 环境', () => {
    expect(beatDef(1).frame_semantics).toEqual(['impact', 'reaction', 'env']);
    expect(createBeatList()[0].frames.map((frame) => frame.semantic)).toEqual([
      'impact',
      'reaction',
      'env',
    ]);
  });

  it('BEAT_DEFS 与其嵌套数组在运行时被冻结', () => {
    expect(Object.isFrozen(BEAT_DEFS)).toBe(true);
    BEAT_DEFS.forEach((def) => {
      expect(Object.isFrozen(def)).toBe(true);
      expect(Object.isFrozen(def.frame_semantics)).toBe(true);
    });
  });

  it('板序越界直接抛错', () => {
    expect(() => beatDef(0 as unknown as BeatIndex)).toThrow(RangeError);
    expect(() => beatDef(6 as unknown as BeatIndex)).toThrow(/节拍数恒为 5/);
  });
});

describe('createBeatList 预填', () => {
  it('按 canon 预填名称、时长与衔接，正文字段留空', () => {
    const list = createBeatList();
    expect(list.map((beat) => beat.title)).toEqual([
      '开篇钩子',
      '矛盾建立',
      '打压升级',
      '反转蓄力',
      '断集留客',
    ]);
    expect(list.map((beat) => beat.duration_sec)).toEqual([8, 17, 20, 25, 18]);
    expect(list.map((beat) => beat.transition_rule)).toEqual([
      '音频预接',
      '卡点硬切',
      '纯硬切',
      'BGM升调截断',
      '黑屏断钩子',
    ]);
    expect(list.every((beat) => beat.emotion === '')).toBe(true);
    expect(list.every((beat) => beat.camera_rhythm === '')).toBe(true);
    expect(list.every((beat) => beat.plot_core === '')).toBe(true);
    expect(list.every((beat) => beat.status === 'empty')).toBe(true);
    expect(list.every((beat) => beat.frames.every((frame) => frame.text === ''))).toBe(true);
  });

  it('每次调用返回独立实例，互不串写', () => {
    const a = createBeatList();
    const b = createBeatList();
    const frame = a[0].frames[0];
    expect(frame).toBeDefined();
    if (frame === undefined) {
      return;
    }
    frame.text = '只改 a';
    expect(b[0].frames[0]?.text).toBe('');
  });

  it('刚建出来的五板即通过结构校验', () => {
    expect(validateBeatList(createBeatList())).toEqual([]);
  });

  it('orderedFrames 按左 → 右返回', () => {
    expect(orderedFrames(createBeatList()[0]).map((frame) => frame.order)).toEqual([1, 2, 3]);
    expect(orderedFrames(createBeatList()[4]).map((frame) => frame.order)).toEqual([1, 2]);
  });
});

describe('时长上限 30s', () => {
  it('上限是 30，canon 里最长的一板是 25s（B4）', () => {
    expect(MAX_BEAT_DURATION_SEC).toBe(30);
    expect(Math.max(...BEAT_DEFS.map((def) => def.duration_sec))).toBe(25);
    BEAT_DEFS.forEach((def) => {
      expect(def.duration_sec).toBeLessThanOrEqual(MAX_BEAT_DURATION_SEC);
    });
  });

  it('边界：30 通过，30.1 与 31 不通过', () => {
    expect(isDurationWithinCap(30)).toBe(true);
    expect(isDurationWithinCap(30.1)).toBe(false);
    expect(isDurationWithinCap(31)).toBe(false);
  });

  it('0、负数、NaN 一律不通过', () => {
    expect(isDurationWithinCap(0)).toBe(false);
    expect(isDurationWithinCap(-5)).toBe(false);
    expect(isDurationWithinCap(Number.NaN)).toBe(false);
    expect(isDurationWithinCap(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('超过 30s 的板通不过校验，且不再就绪', () => {
    const list = createBeatList();
    const fourth = list[3];
    fourth.duration_sec = 31;
    const violation = validateBeatList(list).find((item) => item.code === 'DURATION_OVER_CAP');
    expect(violation?.index).toBe(4);
    expect(violation?.message).toContain('30');

    const beat = readyBeat();
    beat.duration_sec = 31;
    expect(isBeatReady(beat)).toBe(false);
  });
});

describe('就绪校验（AC-6.2）', () => {
  it('字段齐备时就绪', () => {
    expect(isBeatReady(readyBeat())).toBe(true);
  });

  it('新建的空板一律不就绪', () => {
    expect(createBeatList().some(isBeatReady)).toBe(false);
  });

  it.each<[string, (beat: Beat) => void]>([
    ['本段情绪', (beat) => void (beat.emotion = '  ')],
    ['镜头节奏', (beat) => void (beat.camera_rhythm = '')],
    ['剧情核心', (beat) => void (beat.plot_core = '')],
    ['节拍名称', (beat) => void (beat.title = '')],
  ])('缺少 %s 时不可提交生成', (_label, blank) => {
    const beat = readyBeat();
    blank(beat);
    expect(isBeatReady(beat)).toBe(false);
  });

  it('任一格画面描述为空即不就绪', () => {
    const beat = readyBeat();
    const frame = beat.frames[1];
    expect(frame).toBeDefined();
    if (frame === undefined) {
      return;
    }
    frame.text = '   ';
    expect(isBeatReady(beat)).toBe(false);
  });

  it('第五板只需 2 格齐备即可就绪', () => {
    const fifth = createBeatList()[4];
    fifth.emotion = '压抑后的锐利反打';
    fifth.camera_rhythm = '两段收束，在最强处直接掐断';
    fifth.plot_core = '女主当众亮出鉴定原件，全场僵住';
    fifth.frames.forEach((frame, i) => {
      frame.text = `第 ${i + 1} 格`;
    });
    expect(fifth.frames).toHaveLength(2);
    expect(isBeatReady(fifth)).toBe(true);
  });

  it('衔接与备注为空不影响就绪（二者非必填且不进 Prompt）', () => {
    const beat = readyBeat();
    beat.note = '';
    expect(isBeatReady(beat)).toBe(true);
  });

  it('节拍字段集合被锁定，无多余字段', () => {
    expect(Object.keys(readyBeat()).sort()).toEqual([
      'beat_type',
      'camera_rhythm',
      'duration_sec',
      'emotion',
      'frame_count',
      'frames',
      'g_index',
      'index',
      'note',
      'plot_core',
      'status',
      'time_end',
      'time_start',
      'title',
      'transition_rule',
    ]);
    expect(BEAT_COUNT).toBe(5);
  });
});
