/**
 * 节拍信息条（PRD 5.2.2）。
 *
 * 字段权限一目了然：
 *   - 板名：规格用词，只读，且不进 Prompt；
 *   - 情绪基调：可编辑，整句描写进 Prompt 文本；
 *   - 时间位：canon 规格（METH-003 §1），只读，改时长也不会移动它；
 *   - 本拍时长：可编辑，既进 Prompt 文本也作请求参数（METH-003 §2 / PRD 5.3.2）；
 *   - 画幅、参考图：项目级 / 格级参数位。
 */

import { EMOTION_PRESETS, MAX_BEAT_DURATION_SEC } from '../domain/beats';
import type { AspectRatio } from '../domain/projects';
import { emotionPresetOf, type BeatDraft } from './draft';

interface BeatInfoBarProps {
  draft: BeatDraft;
  aspectRatio: AspectRatio;
  referenceImageCount: number;
  onEmotionPresetChange: (preset: string) => void;
  onDurationChange: (durationSec: number) => void;
}

const toneSelectId = 'beat-tone';
const durationInputId = 'beat-duration';

export function BeatInfoBar({
  draft,
  aspectRatio,
  referenceImageCount,
  onEmotionPresetChange,
  onDurationChange,
}: BeatInfoBarProps) {
  return (
    <section className="infobar" aria-label="节拍信息条">
      <div className="infobar__field infobar__field--locked">
        <span className="infobar__label">
          板名
          <span className="tag tag--locked">锁定</span>
        </span>
        <output className="infobar__value infobar__value--name">{draft.title}</output>
        <span className="infobar__hint">规格用词，不可改，不进 Prompt</span>
      </div>

      <div className="infobar__field">
        <label className="infobar__label" htmlFor={toneSelectId}>
          情绪基调
          <span className="tag tag--prompt">进 Prompt</span>
        </label>
        <select
          id={toneSelectId}
          className="input input--select"
          value={emotionPresetOf(draft.emotion)}
          onChange={(event) => onEmotionPresetChange(event.target.value)}
        >
          <option value="">未选</option>
          {EMOTION_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
        </select>
        <span className="infobar__hint">单选，展开为整句描写后入 Prompt</span>
      </div>

      <div className="infobar__field infobar__field--locked">
        <span className="infobar__label">
          时间位
          <span className="tag tag--locked">锁定</span>
        </span>
        <output className="infobar__value infobar__value--num">
          {draft.time_start}–{draft.time_end}s
        </output>
        <span className="infobar__hint">整集时间轴上的规格位置，只读</span>
      </div>

      <div className="infobar__field infobar__field--param">
        <label className="infobar__label" htmlFor={durationInputId}>
          本拍时长
          <span className="tag tag--param">参数位</span>
        </label>
        <span className="infobar__control">
          <input
            id={durationInputId}
            className="input input--num"
            type="number"
            min={1}
            max={MAX_BEAT_DURATION_SEC}
            step={1}
            value={draft.duration_sec}
            onChange={(event) => {
              const next = Number(event.target.value);
              onDurationChange(Number.isNaN(next) ? 0 : next);
            }}
          />
          <span className="infobar__unit">秒</span>
        </span>
        <span className="infobar__hint">
          上限 {MAX_BEAT_DURATION_SEC} 秒；同时进 Prompt 文本与参数位
        </span>
      </div>

      <div className="infobar__field infobar__field--param infobar__field--locked">
        <span className="infobar__label">
          画幅
          <span className="tag tag--param">参数位</span>
        </span>
        <output className="infobar__value infobar__value--num">{aspectRatio}</output>
        <span className="infobar__hint">项目级设定，5 拍一致</span>
      </div>

      <div className="infobar__field infobar__field--param infobar__field--locked">
        <span className="infobar__label">
          参考图
          <span className="tag tag--param">参数位</span>
        </span>
        <output className="infobar__value infobar__value--num">
          {referenceImageCount} / {draft.frame_count}
        </output>
        <span className="infobar__hint">按格序随请求发送，不入文本</span>
      </div>
    </section>
  );
}
