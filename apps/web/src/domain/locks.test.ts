/**
 * 红线锁测试（METH-002 §9、PRD R3 / AC-6.1 / AC-6.3）。
 *
 * 本文件的每条断言都是**反向**的：一旦有人放开「第 6 个节拍」「增删宫格」
 * 「拖拽重排帧序」「改宫格数」中的任意一条，这里就必须变红。
 * 不得为了让实现通过而放宽本文件的断言。
 */

import { describe, expect, it } from 'vitest';
import {
  BEAT_COUNT,
  BEAT_DEFS,
  assertBeatListLocked,
  createBeatList,
  validateBeatList,
  type Beat,
  type BeatFrame,
  type BeatList,
} from './beats';
import { createEmptyProject } from './projects';

/** 一块伪造的「第 6 板」：任何时候都不允许它进入 beat_list。 */
function forgedSixthBeat(): Beat {
  return {
    index: 6,
    beat_type: 'BEAT_HOOK',
    g_index: 'G1',
    time_start: 88,
    time_end: 96,
    frame_count: 3,
    title: '第六板',
    emotion: '强行加戏',
    duration_sec: 8,
    camera_rhythm: '快切',
    plot_core: '多出来的一板',
    frames: [
      { order: 1, semantic: null, text: 'a' },
      { order: 2, semantic: null, text: 'b' },
      { order: 3, semantic: null, text: 'c' },
    ],
    transition_rule: '纯硬切',
    note: '',
    status: 'empty',
  } as unknown as Beat;
}

/** 绕过 readonly 类型，模拟「实现被改坏」后的运行时行为。 */
function asMutableList(list: BeatList): Beat[] {
  return list as unknown as Beat[];
}

function asMutableFrames(frames: readonly BeatFrame[]): BeatFrame[] {
  return frames as unknown as BeatFrame[];
}

describe('五节拍锁：不能有第 6 个节拍', () => {
  it('createBeatList 恒返回 5 项', () => {
    expect(BEAT_COUNT).toBe(5);
    expect(createBeatList()).toHaveLength(5);
    expect(BEAT_DEFS).toHaveLength(5);
  });

  it('push 第 6 个节拍抛 TypeError，且列表长度不变', () => {
    const list = createBeatList();
    expect(() => asMutableList(list).push(forgedSixthBeat())).toThrow(TypeError);
    expect(list).toHaveLength(BEAT_COUNT);
  });

  it('splice / 下标赋值追加第 6 个节拍同样抛错', () => {
    const list = createBeatList();
    expect(() => asMutableList(list).splice(5, 0, forgedSixthBeat())).toThrow(TypeError);
    expect(() => {
      asMutableList(list)[5] = forgedSixthBeat();
    }).toThrow(TypeError);
    expect(list).toHaveLength(BEAT_COUNT);
  });

  it('删除节拍同样抛错', () => {
    const list = createBeatList();
    expect(() => asMutableList(list).pop()).toThrow(TypeError);
    expect(() => asMutableList(list).splice(0, 1)).toThrow(TypeError);
    expect(list).toHaveLength(BEAT_COUNT);
  });

  it('6 项的列表通不过校验', () => {
    const six = [...createBeatList(), forgedSixthBeat()];
    const codes = validateBeatList(six).map((item) => item.code);
    expect(codes).toContain('BEAT_COUNT_NOT_5');
    expect(() => assertBeatListLocked(six)).toThrow(/节拍数恒为 5/);
  });

  it('4 项的列表也通不过校验（增删双向锁）', () => {
    const four = createBeatList().slice(0, 4);
    expect(validateBeatList(four).map((item) => item.code)).toContain('BEAT_COUNT_NOT_5');
  });

  it('项目上的 beat_list 无法被整表替换', () => {
    const project = createEmptyProject('测试项目');
    expect(() => {
      (project as unknown as { beat_list: readonly Beat[] }).beat_list = [];
    }).toThrow(TypeError);
    expect(project.beat_list).toHaveLength(BEAT_COUNT);
  });
});

describe('五节拍锁：不能重排节拍', () => {
  it('reverse / sort 抛错，顺序保持 1–5', () => {
    const list = createBeatList();
    expect(() => asMutableList(list).reverse()).toThrow(TypeError);
    expect(() => asMutableList(list).sort((a, b) => b.index - a.index)).toThrow(TypeError);
    expect(list.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('重排后的列表通不过校验', () => {
    const reordered = [...createBeatList()].reverse();
    const codes = validateBeatList(reordered).map((item) => item.code);
    expect(codes).toContain('BEAT_INDEX_OUT_OF_ORDER');
    expect(() => assertBeatListLocked(reordered)).toThrow();
  });

  it('节拍的结构字段不可写', () => {
    const [first] = createBeatList();
    (['index', 'beat_type', 'g_index', 'time_start', 'time_end'] as const).forEach((field) => {
      expect(() => {
        (first as unknown as Record<string, unknown>)[field] = 99;
      }).toThrow(TypeError);
    });
    expect(first.index).toBe(1);
    expect(first.beat_type).toBe('BEAT_HOOK');
  });
});

describe('宫格锁：不能增删宫格，也不能改宫格数', () => {
  it('宫格数由板序锁定为 3/3/3/3/2', () => {
    expect(createBeatList().map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
    expect(createBeatList().map((beat) => beat.frames.length)).toEqual([3, 3, 3, 3, 2]);
  });

  it('frame_count 不可写', () => {
    const [first, , , , fifth] = createBeatList();
    expect(() => {
      (first as unknown as { frame_count: number }).frame_count = 2;
    }).toThrow(TypeError);
    expect(() => {
      (fifth as unknown as { frame_count: number }).frame_count = 3;
    }).toThrow(TypeError);
    expect(first.frame_count).toBe(3);
    expect(fifth.frame_count).toBe(2);
  });

  it('frames 属性不可替换，数组不可增删', () => {
    const [first] = createBeatList();
    expect(() => {
      (first as unknown as { frames: readonly BeatFrame[] }).frames = [];
    }).toThrow(TypeError);
    expect(() => asMutableFrames(first.frames).push({ order: 3, semantic: null, text: '第 4 格' } as BeatFrame)).toThrow(
      TypeError,
    );
    expect(() => asMutableFrames(first.frames).pop()).toThrow(TypeError);
    expect(first.frames).toHaveLength(3);
  });

  it('第五板不能被加出第 3 格', () => {
    const fifth = createBeatList()[4];
    expect(() => asMutableFrames(fifth.frames).push({ order: 3, semantic: null, text: 'x' } as BeatFrame)).toThrow(
      TypeError,
    );
    expect(fifth.frames).toHaveLength(2);
  });

  it('宫格数与板序不符时通不过校验', () => {
    const list = createBeatList();
    const tampered = list.map((beat, i) =>
      i === 4 ? ({ ...beat, frame_count: 3 } as unknown as Beat) : beat,
    );
    expect(validateBeatList(tampered).map((item) => item.code)).toContain('FRAME_COUNT_NOT_LOCKED');
  });

  it('宫格数量被改动时通不过校验', () => {
    const list = createBeatList();
    const tampered = list.map((beat, i) =>
      i === 0 ? ({ ...beat, frames: beat.frames.slice(0, 2) } as unknown as Beat) : beat,
    );
    expect(validateBeatList(tampered).map((item) => item.code)).toContain('FRAME_COUNT_MISMATCH');
  });
});

describe('帧序锁：只允许左 → 右，不提供拖拽重排', () => {
  it('reverse / sort / 下标赋值抛错，帧序保持 1..n', () => {
    const [first] = createBeatList();
    expect(() => asMutableFrames(first.frames).reverse()).toThrow(TypeError);
    expect(() => asMutableFrames(first.frames).sort((a, b) => b.order - a.order)).toThrow(TypeError);
    expect(() => {
      asMutableFrames(first.frames)[0] = first.frames[2] as BeatFrame;
    }).toThrow(TypeError);
    expect(first.frames.map((frame) => frame.order)).toEqual([1, 2, 3]);
  });

  it('帧的 order 不可写', () => {
    const [first] = createBeatList();
    expect(() => {
      (first.frames[0] as unknown as { order: number }).order = 3;
    }).toThrow(TypeError);
    expect(first.frames[0]?.order).toBe(1);
  });

  it('帧文案仍可编辑（锁的是结构，不是内容）', () => {
    const [first] = createBeatList();
    const frame = first.frames[0];
    expect(frame).toBeDefined();
    if (frame === undefined) {
      return;
    }
    frame.text = '婚宴现场，一份亲子鉴定报告被砸在主桌上';
    expect(first.frames[0]?.text).toBe('婚宴现场，一份亲子鉴定报告被砸在主桌上');
  });

  it('帧序被重排（3,2,1）时通不过校验', () => {
    const list = createBeatList();
    const tampered = list.map((beat, i) =>
      i === 0 ? ({ ...beat, frames: [...beat.frames].reverse() } as unknown as Beat) : beat,
    );
    const codes = validateBeatList(tampered).map((item) => item.code);
    expect(codes).toContain('FRAME_ORDER_NOT_LTR');
    expect(() => assertBeatListLocked(tampered)).toThrow(/帧序只允许左 → 右/);
  });
});

describe('模块出口不含任何解锁能力', () => {
  it('不导出增删 / 移动 / 重排节拍或宫格的函数', async () => {
    const exports = Object.keys(await import('./index'));
    const forbidden = exports.filter((name) =>
      /^(add|append|insert|push|remove|delete|drop|move|swap|reorder|resize|split|duplicate|clone)/i.test(
        name,
      ),
    );
    expect(forbidden).toEqual([]);
  });

  it('不导出任何分镜 / 镜头级概念', async () => {
    const exports = Object.keys(await import('./index'));
    const forbidden = exports.filter((name) =>
      /(shot|storyboard|camera_json|cameraJson|lens|angle|framing)/i.test(name),
    );
    expect(forbidden).toEqual([]);
  });

  it('节拍字段里没有分镜 / 镜头级字段', () => {
    const [first] = createBeatList();
    const forbidden = [
      'shot',
      'shots',
      'shot_list',
      'shotList',
      'storyboard',
      'camera',
      'camera_json',
      'cameraJson',
      'lens',
      'angle',
      'framing',
      'shot_size',
      'grid_size',
      'gridSize',
    ];
    expect(Object.keys(first).filter((key) => forbidden.includes(key))).toEqual([]);
  });

  it('帧里只有帧序、帧语义与白话描述', () => {
    const frame = createBeatList()[0].frames[0];
    expect(Object.keys(frame ?? {}).sort()).toEqual(['order', 'semantic', 'text']);
  });
});
