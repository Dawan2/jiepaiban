/**
 * 节拍帧图片的坐标：`项目 + 板序 + 帧序`（W4/IMAGE-STORE）。
 *
 * 帧序沿用 `RULE-7` 的帧序锁：恒为左→右 1–3，没有排序权重字段。
 * 可用帧位由**宫格锁**（`RULE-3`）推导——B1–B4 有 3 格、B5 只有 2 格，
 * 因此「给 B5 的第 3 格配图」不是"暂不支持"，而是坐标本身非法：
 * UI 从不渲染那个格子，能构造出这个坐标只可能是调用方绕过了推导。
 */

import { BEAT_INDEXES, gridSizeForBeat, type BeatIndex } from '../../domain/beats';
import { FrameImageError } from './validation';

/** 帧序，1 起，最大 3（与 `GridCell.order` 同一套编号）。 */
export type FrameOrder = 1 | 2 | 3;

export const FRAME_ORDERS: readonly FrameOrder[] = [1, 2, 3];

export interface FrameImageKey {
  readonly projectId: string;
  readonly beatIndex: BeatIndex;
  readonly frameOrder: FrameOrder;
}

/** 复合主键的分隔符。项目 id 里不允许出现它，否则不同坐标可能编出同一个键。 */
export const FRAME_KEY_SEPARATOR = '::';

/** 该板真实存在的帧位（B1–B4 = 1,2,3；B5 = 1,2）。 */
export function framesForBeat(beatIndex: BeatIndex): readonly FrameOrder[] {
  return FRAME_ORDERS.slice(0, gridSizeForBeat(beatIndex));
}

function fail(message: string): never {
  throw new FrameImageError('key', message);
}

/** 校验坐标合法（板序 1–5、帧序 1–3、且该帧位在宫格锁下存在）。 */
export function assertFrameImageKey(key: FrameImageKey): FrameImageKey {
  if (key.projectId.trim() === '') {
    fail('帧图坐标缺少项目 id');
  }
  if (key.projectId.includes(FRAME_KEY_SEPARATOR)) {
    fail(`项目 id 不得包含 ${FRAME_KEY_SEPARATOR}，实为 ${key.projectId}`);
  }
  if (!BEAT_INDEXES.includes(key.beatIndex)) {
    fail(`板序恒为 1–${BEAT_INDEXES.length}，实为 ${key.beatIndex}（RULE-2）`);
  }
  if (!framesForBeat(key.beatIndex).includes(key.frameOrder)) {
    fail(
      `B${key.beatIndex} 只有 ${gridSizeForBeat(key.beatIndex)} 格，没有第 ${key.frameOrder} 格（RULE-3、RULE-7）`,
    );
  }
  return key;
}

/** 编码为 IndexedDB 主键。同一坐标恒得同一个键，因此"再传一张"就是覆盖。 */
export function encodeFrameImageKey(key: FrameImageKey): string {
  const { projectId, beatIndex, frameOrder } = assertFrameImageKey(key);
  return [projectId, beatIndex, frameOrder].join(FRAME_KEY_SEPARATOR);
}

/** 解码主键；格式不对返回 `null`（读到脏键时跳过该条，不让整库读不出来）。 */
export function decodeFrameImageKey(encoded: string): FrameImageKey | null {
  const parts = encoded.split(FRAME_KEY_SEPARATOR);
  if (parts.length !== 3) {
    return null;
  }
  const [projectId, beat, frame] = parts;
  const beatIndex = Number(beat) as BeatIndex;
  const frameOrder = Number(frame) as FrameOrder;
  if (projectId === undefined || projectId === '') {
    return null;
  }
  try {
    return assertFrameImageKey({ projectId, beatIndex, frameOrder });
  } catch {
    return null;
  }
}
