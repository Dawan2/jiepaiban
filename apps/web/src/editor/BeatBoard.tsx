/**
 * 节拍板编辑区。
 *
 * 组成：左侧固定 5 板导航（由 EditorPage 装配）+ 信息条 + 剧情核心 / 镜头节奏 +
 * 画面宫格 + 组间衔接 + Prompt 实时预览。
 *
 * 结构红线在这一层全部体现为「没有入口」：
 *   - 板数恒 5，无增删改序；
 *   - 格数由板位锁定（B1–B4 三格、B5 两格），无切换、无拖拽；
 *   - 衔接与板名不进 Prompt，面板上找不到它们的片段。
 */

import { useMemo, useState } from 'react';
import type { BeatNavItem } from '../components/BeatNav';
import { BASELINE_EPISODE_DURATION_SEC, type BeatIndex } from '../domain/beats';
import type { Project } from '../domain/projects';
import type { TransitionRule } from '../domain/transitions';
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
  emotionTextFor,
  referenceImageKeys,
  updateBeatFields,
  updateFrameImage,
  updateFrameText,
  type FrameImage,
} from './draft';
import { GridBoard } from './GridBoard';
import { PromptPreview } from './PromptPreview';
import { TransitionPanel } from './TransitionPanel';

export function useBeatBoard(project: Project) {
  const [drafts, setDrafts] = useState(() => createBeatDrafts(project));
  const [activeIndex, setActiveIndex] = useState<BeatIndex>(1);

  const totalSec = useMemo(
    () => drafts.reduce((sum, draft) => sum + draft.duration_sec, 0),
    [drafts],
  );

  const navItems: readonly BeatNavItem[] = drafts.map((draft) => ({
    index: draft.index,
    name: draft.title,
    role: draft.role,
    status: draft.status,
    meta: `${draft.frame_count} 格 · ${draft.time_start}–${draft.time_end}s`,
  }));

  return { drafts, setDrafts, activeIndex, setActiveIndex, totalSec, navItems };
}

interface BoardBodyProps {
  project: Project;
  board: ReturnType<typeof useBeatBoard>;
}

export function BeatBoardBody({ project, board }: BoardBodyProps) {
  const { drafts, setDrafts, activeIndex } = board;

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
            节拍{draft.index}· {draft.title}
          </h2>
          <p className="board__role">{draft.role}</p>
        </div>
        <dl className="board__spec">
          <div>
            <dt>宫格</dt>
            <dd className="num">{draft.frame_count}</dd>
          </div>
          <div>
            <dt>时间位</dt>
            <dd className="num">
              {draft.time_start}–{draft.time_end}s
            </dd>
          </div>
          <div>
            <dt>整集</dt>
            <dd className="num">
              {board.totalSec}s / {BASELINE_EPISODE_DURATION_SEC}s
            </dd>
          </div>
        </dl>
      </div>

      <BeatInfoBar
        draft={draft}
        aspectRatio={project.aspect_ratio}
        referenceImageCount={referenceImageKeys(draft).length}
        onEmotionPresetChange={(preset) =>
          setDrafts((prev) =>
            updateBeatFields(prev, draft.index, {
              emotion: preset === '' ? '' : emotionTextFor(preset),
            }),
          )
        }
        onDurationChange={(durationSec) =>
          setDrafts((prev) => updateBeatFields(prev, draft.index, { duration_sec: durationSec }))
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
            <label className="visually-hidden" htmlFor="beat-plot-core">
              剧情核心
            </label>
            <textarea
              id="beat-plot-core"
              className="input input--area"
              rows={3}
              placeholder="这一板演什么，一句话推进剧情"
              value={draft.plot_core}
              onChange={(event) =>
                setDrafts((prev) =>
                  updateBeatFields(prev, draft.index, { plot_core: event.target.value }),
                )
              }
            />

            <label className="cell__label" htmlFor="beat-rhythm">
              镜头节奏
              <span className="tag tag--prompt">进 Prompt</span>
            </label>
            <textarea
              id="beat-rhythm"
              className="input input--area"
              rows={2}
              placeholder="这一段的节奏形容，例：极快切入，三段递进"
              value={draft.camera_rhythm}
              onChange={(event) =>
                setDrafts((prev) =>
                  updateBeatFields(prev, draft.index, { camera_rhythm: event.target.value }),
                )
              }
            />
          </section>

          <GridBoard
            draft={draft}
            onFrameTextChange={(order, text) =>
              setDrafts((prev) => updateFrameText(prev, draft.index, order, text))
            }
            onFrameImageChange={(order, image: FrameImage | null) =>
              setDrafts((prev) => updateFrameImage(prev, draft.index, order, image))
            }
          />

          <TransitionPanel
            draft={draft}
            nextBeatTitle={nextDraft?.title ?? null}
            onRuleChange={(rule: TransitionRule) =>
              setDrafts((prev) => updateBeatFields(prev, draft.index, { transition_rule: rule }))
            }
            onNoteChange={(note) =>
              setDrafts((prev) => updateBeatFields(prev, draft.index, { transition_note: note }))
            }
          />
        </div>

        <PromptPreview result={assembled.result} redlineError={assembled.redlineError} />
      </div>
    </div>
  );
}
