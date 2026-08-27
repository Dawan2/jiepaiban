/**
 * 画面宫格区（PRD 5.2.3 / AC-6.3）。
 *
 * 格数由板位锁定：B1–B4 三格、B5 两格，全集恒 14 格。
 * 本组件按 `draft.frame_count` 渲染，**不提供**增格 / 删格 / 换序 / 切换格数的入口。
 */

import { frameRoleHint } from '../domain/beats';
import { frameFillProgress, type BeatDraft, type FrameImage } from './draft';
import { GridCellCard } from './GridCellCard';

interface GridBoardProps {
  draft: BeatDraft;
  onFrameTextChange: (order: number, text: string) => void;
  onFrameImageChange: (order: number, image: FrameImage | null) => void;
}

export function GridBoard({ draft, onFrameTextChange, onFrameImageChange }: GridBoardProps) {
  const progress = frameFillProgress(draft);

  return (
    <section className="panel grid" aria-labelledby="grid-title">
      <div className="panel__head">
        <h2 id="grid-title" className="panel__title">
          画面宫格
        </h2>
        <span className="panel__meta">
          <span className="panel__meta-num">{draft.frame_count}</span> 格 · 由板位锁定 · 已填{' '}
          <span className="panel__meta-num">{progress.filled}</span>/{progress.total}
        </span>
      </div>

      <ol
        className={`cells cells--${draft.frame_count}`}
        aria-label={`节拍${draft.index}宫格（${draft.frame_count} 格）`}
      >
        {draft.frames.map((frame) => (
          <GridCellCard
            key={frame.order}
            beatIndex={draft.index}
            frame={frame}
            roleHint={frameRoleHint(draft.index, frame.order)}
            onTextChange={(text) => onFrameTextChange(frame.order, text)}
            onImageChange={(image) => onFrameImageChange(frame.order, image)}
          />
        ))}
      </ol>

      <p className="panel__rule">
        格序左 → 右即时序，由一次生成在段内完成切换。格数与顺序均为规格，不开放调整。
      </p>
    </section>
  );
}
