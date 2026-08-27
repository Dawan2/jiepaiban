/**
 * 段卡（PRD 5.5.1 / 5.5.2 / 5.5.4、11.4 线框）。
 *
 * 一张卡 = 一块板 = 一段成片，五张卡按板序排开，卡上不做任何跨段动作。
 * 卡内元素顺序对齐线框：预览占位 → 时长 → 生成完成时间 → 组间衔接 → 下载 / 重新生成。
 *
 * 重新生成走二次确认（PRD 12.6：新结果将替换当前段，历史可回滚），确认后调
 * `controller.retryBeat`，请求体照旧由生成侧组装——衔接在卡上看得见，但传不出去。
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TRANSITION_STAGE } from '../domain/transitions';
import type { SegmentCard as SegmentCardModel } from './segments';

export interface SegmentCardProps {
  readonly card: SegmentCardModel;
  readonly projectId: string;
  /** 二次确认通过后的重投动作。 */
  readonly onRegenerate: (beatIndex: SegmentCardModel['beat_index']) => void;
}

const PREVIEW_TEXT: Readonly<Record<SegmentCardModel['status'], string>> = Object.freeze({
  PENDING: '未生成',
  RUNNING: '生成中…',
  SUCCEEDED: '▶ 预览占位',
  FAILED: '生成失败',
});

export function ExportSegmentCard({ card, projectId, onRegenerate }: SegmentCardProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="segment" data-beat={card.beat_index}>
      <div className={`segment__preview export-preview--${card.status.toLowerCase()}`}>
        <span aria-hidden="true">{PREVIEW_TEXT[card.status]}</span>
        <span className="visually-hidden">{`节拍${card.beat_index}预览位，当前状态${card.status_label}`}</span>
      </div>

      <div className="segment__body">
        <h2 className="segment__title">
          节拍{card.beat_index}· {card.title}
        </h2>
        <p className="segment__meta">
          {card.g_index} · 时间位 {card.time_start}–{card.time_end}s ·{' '}
          <span className={`generate__badge generate__badge--${card.status.toLowerCase()}`}>
            {card.status_label}
          </span>
        </p>

        <dl className="export-card__facts">
          <div>
            <dt>时长</dt>
            <dd>{card.duration_sec} 秒</dd>
          </div>
          <div>
            <dt>生成完成时间</dt>
            <dd>{card.generated_at_label}</dd>
          </div>
          <div className="export-card__transition">
            <dt>组间衔接</dt>
            <dd>
              {card.transition.point_label}：{card.transition.rule}
              <span className="export-card__stage">仅{TRANSITION_STAGE}生效，不进生成</span>
            </dd>
          </div>
        </dl>

        {card.failure_message !== null && (
          <p className="generate__reason" role="status">
            {card.failure_message}
          </p>
        )}

        <div className="export-card__actions">
          {card.download !== null ? (
            <a
              className="btn"
              href={card.download.url}
              download={card.download.file_name}
              title={`下载 ${card.download.file_name}`}
            >
              下载本段
            </a>
          ) : (
            <button type="button" className="btn" disabled title="本段还没有成片，暂不能下载">
              下载本段
            </button>
          )}

          {confirming ? (
            <>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setConfirming(false);
                  onRegenerate(card.beat_index);
                }}
              >
                确认重投
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={!card.can_regenerate}
              title={card.regenerate_blocked_reason ?? '用当前字段重新提交本段'}
              onClick={() => setConfirming(true)}
            >
              {card.regenerate_label}
            </button>
          )}

          <Link to={`/p/${projectId}`} className="segment__action">
            去编辑
          </Link>
        </div>

        {confirming && (
          <p className="export-card__confirm" role="status">
            新结果将替换当前段（历史可回滚）。
          </p>
        )}
      </div>
    </li>
  );
}
