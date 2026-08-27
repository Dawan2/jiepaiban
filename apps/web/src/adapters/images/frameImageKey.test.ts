/**
 * 帧图坐标的锁断言（W4/IMAGE-STORE）。
 *
 * 坐标不是随便一个字符串：它必须与五节拍锁、宫格锁、帧序锁三条红线一致，
 * 否则库里会出现"B5 第 3 格的图"这种 UI 永远显示不出来的记录。
 */

import { describe, expect, it } from 'vitest';
import { BEAT_COUNT, BEAT_INDEXES, gridSizeForBeat, type BeatIndex } from '../../domain/beats';
import {
  FRAME_ORDERS,
  assertFrameImageKey,
  decodeFrameImageKey,
  encodeFrameImageKey,
  framesForBeat,
  type FrameOrder,
} from './frameImageKey';
import { FrameImageError } from './validation';

describe('帧位由宫格锁推导（RULE-3 / RULE-7）', () => {
  it('B1–B4 三格，B5 两格', () => {
    expect(framesForBeat(1)).toEqual([1, 2, 3]);
    expect(framesForBeat(4)).toEqual([1, 2, 3]);
    expect(framesForBeat(BEAT_COUNT)).toEqual([1, 2]);
  });

  it('帧位数恒等于该板的宫格数', () => {
    for (const index of BEAT_INDEXES) {
      expect(framesForBeat(index)).toHaveLength(gridSizeForBeat(index));
    }
  });

  it('帧序只有 1–3，没有第 4 格', () => {
    expect([...FRAME_ORDERS]).toEqual([1, 2, 3]);
  });
});

describe('坐标校验', () => {
  it('合法坐标原样返回', () => {
    const key = { projectId: 'prj_1', beatIndex: 2 as BeatIndex, frameOrder: 3 as FrameOrder };
    expect(assertFrameImageKey(key)).toEqual(key);
  });

  it.each([
    ['板序 0', 0, 1],
    ['板序 6', 6, 1],
    ['板序 -1', -1, 1],
    ['帧序 0', 1, 0],
    ['帧序 4', 1, 4],
    ['B5 的第 3 格', BEAT_COUNT, 3],
  ])('%s 拒收', (_label, beatIndex, frameOrder) => {
    expect(() =>
      assertFrameImageKey({
        projectId: 'prj_1',
        beatIndex: beatIndex as BeatIndex,
        frameOrder: frameOrder as FrameOrder,
      }),
    ).toThrow(FrameImageError);
  });

  it('空项目 id 与含分隔符的项目 id 拒收', () => {
    const base = { beatIndex: 1 as BeatIndex, frameOrder: 1 as FrameOrder };
    expect(() => assertFrameImageKey({ ...base, projectId: '  ' })).toThrow(/缺少项目 id/);
    expect(() => assertFrameImageKey({ ...base, projectId: 'prj::1' })).toThrow(/不得包含/);
  });

  it('拒收文案指明是哪条锁', () => {
    expect(() =>
      assertFrameImageKey({ projectId: 'p', beatIndex: BEAT_COUNT, frameOrder: 3 }),
    ).toThrow(/RULE-3/);
  });
});

describe('主键编解码', () => {
  it('编码稳定：同一坐标恒得同一个键（所以再传一张就是覆盖）', () => {
    const key = { projectId: 'prj_9', beatIndex: 4 as BeatIndex, frameOrder: 2 as FrameOrder };
    expect(encodeFrameImageKey(key)).toBe('prj_9::4::2');
    expect(encodeFrameImageKey(key)).toBe(encodeFrameImageKey({ ...key }));
  });

  it('不同坐标编不出同一个键', () => {
    const keys = BEAT_INDEXES.flatMap((beatIndex) =>
      framesForBeat(beatIndex).map((frameOrder) =>
        encodeFrameImageKey({ projectId: 'prj_1', beatIndex, frameOrder }),
      ),
    );
    expect(new Set(keys).size).toBe(keys.length);
    // 五节拍 × 宫格锁 = 3+3+3+3+2 = 14 个帧位，一个项目最多 14 张参考图。
    expect(keys).toHaveLength(14);
  });

  it('解码是编码的逆运算', () => {
    const key = { projectId: 'prj_abc', beatIndex: 3 as BeatIndex, frameOrder: 1 as FrameOrder };
    expect(decodeFrameImageKey(encodeFrameImageKey(key))).toEqual(key);
  });

  it('脏键解码为 null（读到坏数据跳过该条，不让整库读不出来）', () => {
    expect(decodeFrameImageKey('prj_1::9::1')).toBeNull();
    expect(decodeFrameImageKey('prj_1::5::3')).toBeNull();
    expect(decodeFrameImageKey('prj_1::1')).toBeNull();
    expect(decodeFrameImageKey('')).toBeNull();
    expect(decodeFrameImageKey('::1::1')).toBeNull();
    expect(decodeFrameImageKey('prj_1::x::1')).toBeNull();
  });
});
