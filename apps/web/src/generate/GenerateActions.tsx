/**
 * 生成动作的最小 UI 件（PRD 5.4 生成状态呈现、IX-3 禁用必须给原因）。
 *
 * 这里只做「按钮 + 状态徽章 + 原因文案」，不碰编辑区布局、不碰宫格样式——
 * 板体与宫格的结构与 CSS 归 WK3，本文件可以被整体替换而不影响生成逻辑。
 */

import type { BeatIndex } from '../domain/beats';
import type { GenerateBoardState, GenerateController } from './controller';

function badgeClass(state: GenerateBoardState): string {
  return `generate__badge generate__badge--${state.status.toLowerCase()}`;
}

export interface BeatGenerateActionProps {
  readonly controller: GenerateController;
  readonly state: GenerateBoardState;
}

/** 板级动作：一块板一次生成，一次调用对应一块板。 */
export function BeatGenerateAction({ controller, state }: BeatGenerateActionProps) {
  const done = state.status === 'SUCCEEDED' || state.status === 'FAILED';
  const reason = state.blocked_reason ?? '';

  return (
    <div className="generate" data-beat={state.beat_index}>
      <p className="generate__row">
        <span className={badgeClass(state)}>{state.status_label}</span>
        <button
          type="button"
          className="btn"
          disabled={!state.can_generate}
          title={state.can_generate ? `目标模型：${controller.model}` : reason}
          onClick={() => {
            if (done) {
              controller.retryBeat(state.beat_index);
            } else {
              controller.generateBeat(state.beat_index);
            }
          }}
        >
          {state.action_label}
        </button>
      </p>
      {state.failure !== null && (
        <p className="generate__reason" role="status">
          {state.failure.label}·{state.failure.message}
        </p>
      )}
      {state.failure === null && reason !== '' && <p className="generate__reason">{reason}</p>}
      {state.video_url !== null && <p className="generate__result">成片地址：{state.video_url}</p>}
    </div>
  );
}

export interface GenerateEpisodeButtonProps {
  readonly controller: GenerateController;
  readonly states: readonly GenerateBoardState[];
}

/** 整集生成：按 B1 → B5 依次发起 5 次独立调用，不合规的板会被跳过。 */
export function GenerateEpisodeButton({ controller, states }: GenerateEpisodeButtonProps) {
  const ready = states.filter((state) => state.can_generate);
  const blocked = states.filter((state) => state.blocked_reason !== null);
  const disabled = ready.length === 0;
  const title = disabled
    ? `暂时不能生成：${blocked[0]?.blocked_reason ?? '五块板都还没就绪'}`
    : `按板序依次发起 ${ready.length} 次独立生成（${controller.model}）`;

  return (
    <button
      type="button"
      className="btn"
      disabled={disabled}
      title={title}
      onClick={() => controller.generateEpisode()}
    >
      生成全集
    </button>
  );
}

/** 从 5 个板位状态里取当前板。 */
export function pickBoardState(
  states: readonly GenerateBoardState[],
  beatIndex: BeatIndex,
): GenerateBoardState | undefined {
  return states.find((state) => state.beat_index === beatIndex);
}
