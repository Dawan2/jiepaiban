/**
 * 一块板的节拍帧参考图（W4/IMAGE-STORE）。
 *
 * **这不是宫格编辑器。** 宫格的白话画面描述与 Prompt 组装归 WK3 / WK2；这里只做
 * "每个帧位挂一张参考图"这件事，槽位数由宫格锁推导（B1–B4 三格、B5 两格），
 * 组件本身不提供增删帧位的入口（`RULE-3`、`RULE-7`）。
 *
 * WK3 落地宫格编辑器时，把 {@link useBeatFrameImages} 的 `slots[i].url` 挂到自己的格子里
 * 即可复用同一条读写链路，然后删掉本组件——不要再写第二套图片读写。
 *
 * 图片是**参考图**：给人看、给后期对照，不进 Prompt 文本（`RULE-9` 的同类约束）。
 */

import { useRef } from 'react';
import { ALLOWED_IMAGE_TYPES, MAX_FRAME_IMAGE_BYTES, formatBytes } from '../adapters/images';
import type { BeatIndex } from '../domain/beats';
import { useBeatFrameImages } from '../store/useBeatFrameImages';

interface FrameImagePanelProps {
  projectId: string;
  beatIndex: BeatIndex;
}

export function FrameImagePanel({ projectId, beatIndex }: FrameImagePanelProps) {
  const { slots, state, error, usage, upload, remove } = useBeatFrameImages(projectId, beatIndex);
  // 每个帧位一个隐藏的 file input：可见的是那块可点的画布，而不是浏览器默认的丑控件。
  const inputs = useRef(new Map<number, HTMLInputElement | null>());

  return (
    <section className="frames" aria-labelledby="frames-title">
      <h3 id="frames-title" className="frames__title">
        帧参考图（{slots.length} 格）
      </h3>
      <p className="frames__hint">
        支持 {ALLOWED_IMAGE_TYPES.map((type) => type.replace('image/', '')).join(' / ')}，
        单张不超过 {formatBytes(MAX_FRAME_IMAGE_BYTES)}。图片存在本机，刷新后仍在；仅供对照，不进 Prompt。
      </p>

      {error !== null && (
        <p className="notice notice--danger" role="alert">
          {error}
        </p>
      )}

      <ul className="frames__list">
        {slots.map((slot) => {
          const label = `第 ${slot.order} 格`;
          return (
            <li key={slot.order} className="frames__slot">
              <button
                type="button"
                className="frames__canvas"
                aria-label={
                  slot.image === null ? `为${label}选择参考图` : `更换${label}参考图（${slot.image.name}）`
                }
                disabled={slot.busy || state === 'loading'}
                onClick={() => inputs.current.get(slot.order)?.click()}
              >
                {slot.url === null ? (
                  <span className="frames__placeholder">{slot.image === null ? '未配图' : '已配图'}</span>
                ) : (
                  <img className="frames__thumb" src={slot.url} alt={`${label}参考图`} />
                )}
              </button>

              <input
                ref={(node) => void inputs.current.set(slot.order, node)}
                type="file"
                className="visually-hidden"
                accept={ALLOWED_IMAGE_TYPES.join(',')}
                aria-label={`${label}参考图文件`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // 清空 value：同一个文件再选一次也要触发 change（用户改了图片内容重传）。
                  event.target.value = '';
                  if (file !== undefined) {
                    void upload(slot.order, file);
                  }
                }}
              />

              <p className="frames__caption">
                <span className="frames__order">{label}</span>
                {slot.image === null ? (
                  <span className="frames__empty">未配图</span>
                ) : (
                  <span className="frames__file" title={slot.image.name}>
                    {slot.image.name} · {formatBytes(slot.image.size)}
                  </span>
                )}
              </p>

              {slot.image !== null && (
                <button
                  type="button"
                  className="btn btn--small btn--danger"
                  disabled={slot.busy}
                  onClick={() => void remove(slot.order)}
                >
                  移除{label}图片
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {usage !== null && (
        <p className="frames__usage">
          本项目参考图 {usage.count} 张 · {formatBytes(usage.bytes)} / {formatBytes(usage.limitBytes)}
        </p>
      )}
    </section>
  );
}
