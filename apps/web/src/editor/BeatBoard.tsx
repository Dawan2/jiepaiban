/**
 * 节拍板编辑区（W1/WK3）。
 *
 * 组成：左侧固定 5 板导航（由 EditorPage 装配）+ 信息条 + 剧情核心 + 画面宫格 +
 * 组间衔接 + Prompt 实时预览。
 *
 * 结构红线在这一层全部体现为"没有入口"：
 *   - 板数恒 5，无增删改序；
 *   - 格数由板位锁定（B1–B4 三格、B5 两格），无切换、无拖拽；
 *   - 衔接与板名不进 Prompt，面板上找不到它们的片段。
 */

import { useMemo, useState } from 'react';
import type { BeatNavItem } from '../components/BeatNav';
import { beatTimeRanges, episodeTotalSec, type BeatIndex } from '../domain/beats';
import type { Project } from '../domain/projects';
import type { TransitionMethodId } from '../domain/transitions';
import {
  assemble,
  assertNoRedline,
  redlineWarnings,
  toAssembleView,
  toPrefixInput,
} from '../prompt/assemble';
import { BeatInfoBar } from './BeatInfoBar';
import {
  createBeatDrafts,
  draftToBeat,
  referenceImageKeys,
  updateBeatFields,
  updateCellDescription,
  updateCellImage,
  type CellImage,
} from './draft';
import { GridBoard } from './GridBoard';
import { PromptPreview } from './PromptPreview';
import { TransitionPanel } from './TransitionPanel';

function formatRange(range: { startSec: number; endSec: number } | null): string {
  return range === null ? '时长待填' : `${range.startSec}–${range.endSec}s`;
}

export function useBeatBoard(project: Project) {
  const [drafts, setDrafts] = useState(() => createBeatDrafts(project));
  const [activeIndex, setActiveIndex] = useState<BeatIndex>(1);

  const beats = useMemo(() => drafts.map(draftToBeat), [drafts]);
  const ranges = useMemo(() => beatTimeRanges(beats), [beats]);
  const totalSec = useMemo(() => episodeTotalSec(beats), [beats]);

  const navItems: readonly BeatNavItem[] = drafts.map((draft, i) => ({
    index: draft.index,
    name: draft.name,
    role: draft.role,
    status: draft.status,
    meta: `${draft.gridSize} 格 · ${formatRange(ranges[i] ?? null)}`,
  }));

  return { drafts, setDrafts, activeIndex, setActiveIndex, beats, ranges, totalSec, navItems };
}

interface BoardBodyProps {
  project: Project;
  board: ReturnType<typeof useBeatBoard>;
}

export function BeatBoardBody({ project, board }: BoardBodyProps) {
  const { drafts, setDrafts, activeIndex, ranges } = board;

  const position = drafts.findIndex((draft) => draft.index === activeIndex);
  const draft = drafts[position];

  const assembled = useMemo(() => {
    if (draft === undefined) {
      return null;
    }
    const beat = draftToBeat(draft);
    const result = assemble({
      prefix: toPrefixInput(project),
      beat: toAssembleView(beat, referenceImageKeys(draft)),
    });

    let redlineError: string | null = null;
    try {
      assertNoRedline(result, beat);
    } catch (error) {
      redlineError = error instanceof Error ? error.message : '未知错误';
    }

    return {
      result: { ...result, warnings: redlineWarnings(result, beat) },
      redlineError,
    };
  }, [draft, project]);

  if (draft === undefined || assembled === null) {
    return null;
  }

  const nextDraft = drafts[position + 1];

  return (
    <div className="board">
      <div className="board__head">
        <div className="board__ident">
          <span className="board__code">B{draft.index}</span>
          <h2 className="board__title">
            节拍{draft.index}· {draft.name}
          </h2>
          <p className="board__role">{draft.role}</p>
        </div>
        <dl className="board__spec">
          <div>
            <dt>宫格</dt>
            <dd className="num">{draft.gridSize}</dd>
          </div>
          <div>
            <dt>时间位</dt>
            <dd className="num">{formatRange(ranges[position] ?? null)}</dd>
          </div>
          <div>
            <dt>整集</dt>
            <dd className="num">{board.totalSec === null ? '—' : `${board.totalSec}s`}</dd>
          </div>
        </dl>
      </div>

      <BeatInfoBar
        draft={draft}
        timeRange={ranges[position] ?? null}
        aspectRatio={project.aspectRatio}
        referenceImageCount={referenceImageKeys(draft).length}
        onToneChange={(tone) => setDrafts((prev) => updateBeatFields(prev, draft.index, { tone }))}
        onDurationChange={(durationSec) =>
          setDrafts((prev) => updateBeatFields(prev, draft.index, { durationSec }))
        }
      />

      <div className="board__cols">
        <div className="board__main">
          <section className="panel" aria-labelledby="summary-title">
            <div className="panel__head">
              <h2 id="summary-title" className="panel__title">
                剧情核心
              </h2>
              <span className="tag tag--prompt">进 Prompt</span>
            </div>
            <label className="visually-hidden" htmlFor="beat-summary">
              剧情核心
            </label>
            <textarea
              id="beat-summary"
              className="input input--area"
              rows={3}
              placeholder="这一板演什么，1–3 句"
              value={draft.summary}
              onChange={(event) =>
                setDrafts((prev) =>
                  updateBeatFields(prev, draft.index, { summary: event.target.value }),
                )
              }
            />
          </section>

          <GridBoard
            draft={draft}
            onCellDescriptionChange={(order, description) =>
              setDrafts((prev) => updateCellDescription(prev, draft.index, order, description))
            }
            onCellImageChange={(order, image: CellImage | null) =>
              setDrafts((prev) => updateCellImage(prev, draft.index, order, image))
            }
          />

          <TransitionPanel
            draft={draft}
            nextBeatName={nextDraft?.name ?? null}
            onMethodChange={(method: TransitionMethodId | null) =>
              setDrafts((prev) =>
                updateBeatFields(prev, draft.index, { transitionMethod: method }),
              )
            }
            onNoteChange={(note) =>
              setDrafts((prev) => updateBeatFields(prev, draft.index, { transitionNote: note }))
            }
          />
        </div>

        <PromptPreview result={assembled.result} redlineError={assembled.redlineError} />
      </div>
    </div>
  );
}
