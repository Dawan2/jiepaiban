/**
 * 节拍信息条（PRD 5.2.2）。
 *
 * 字段权限一目了然：
 *   - 板名：规格用词，只读，且不进 Prompt；
 *   - 情绪基调：可编辑，进 Prompt 文本；
 *   - 时间位：由各拍时长累加派生，只读；
 *   - AI 参数位：时长可编辑、画幅随项目，二者都**不拼进 Prompt 文本**，只作请求参数。
 */

import { EMOTION_TONES, type BeatTimeRange, type EmotionTone } from '../domain/beats';
import type { AspectRatio } from '../domain/projects';
import type { BeatDraft } from './draft';

interface BeatInfoBarProps {
  draft: BeatDraft;
  timeRange: BeatTimeRange | null;
  aspectRatio: AspectRatio;
  referenceImageCount: number;
  onToneChange: (tone: EmotionTone | null) => void;
  onDurationChange: (durationSec: number | null) => void;
}

const toneSelectId = 'beat-tone';
const durationInputId = 'beat-duration';

export function BeatInfoBar({
  draft,
  timeRange,
  aspectRatio,
  referenceImageCount,
  onToneChange,
  onDurationChange,
}: BeatInfoBarProps) {
  return (
    <section className="infobar" aria-label="节拍信息条">
      <div className="infobar__field infobar__field--locked">
        <span className="infobar__label">
          板名
          <span className="tag tag--locked">锁定</span>
        </span>
        <output className="infobar__value infobar__value--name">{draft.name}</output>
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
          value={draft.tone ?? ''}
          onChange={(event) =>
            onToneChange(event.target.value === '' ? null : (event.target.value as EmotionTone))
          }
        >
          <option value="">未选</option>
          {EMOTION_TONES.map((tone) => (
            <option key={tone} value={tone}>
              {tone}
            </option>
          ))}
        </select>
        <span className="infobar__hint">单选，映射为固定文案后入 Prompt</span>
      </div>

      <div className="infobar__field infobar__field--locked">
        <span className="infobar__label">
          时间位
          <span className="tag tag--derived">派生</span>
        </span>
        <output className="infobar__value infobar__value--num">
          {timeRange === null ? '待各拍时长填齐' : `${timeRange.startSec}–${timeRange.endSec}s`}
        </output>
        <span className="infobar__hint">按 1–5 拍时长累加，只读</span>
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
            max={30}
            step={1}
            value={draft.durationSec ?? ''}
            onChange={(event) => {
              const next = event.target.value === '' ? null : Number(event.target.value);
              onDurationChange(next === null || Number.isNaN(next) ? null : next);
            }}
          />
          <span className="infobar__unit">秒</span>
        </span>
        <span className="infobar__hint">上限 30 秒；走参数位，不拼进文本</span>
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
          {referenceImageCount} / {draft.gridSize}
        </output>
        <span className="infobar__hint">按格序随请求发送，不入文本</span>
      </div>
    </section>
  );
}
