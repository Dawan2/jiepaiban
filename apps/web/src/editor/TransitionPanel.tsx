/**
 * 组间衔接模块（PRD 5.2.4 / AC-6.4）。
 *
 * 衔接挂在**上一块板**，语义是「本板结束时如何进入下一板」，因此第 5 板没有接缝。
 * 红线：衔接只在后期合成阶段生效，**不参与 AI 生成**——
 * 它既不出现在 Prompt 面板里，也不进入生成请求体。这不是靠这里少拼一段实现的，
 * 而是组装器的输入类型里根本没有衔接字段（见 `src/prompt/assemble.ts`）。
 *
 * 无障碍（W4-A11Y）：本模块以 `<aside>` 呈现为 complementary 地标。这不是排版选择，
 * 而是上面那条红线的听觉版本——衔接是后期合成的旁支信息，与「这一板要生成什么」
 * 不在同一条主线上。屏幕阅读器的地标列表因此把它和 Prompt 预览一样列在主内容之外。
 */

import {
  TRANSITION_CATALOG,
  TRANSITION_STAGE,
  seamOf,
  type TransitionRule,
} from '../domain/transitions';
import { draftHasSeam, type BeatDraft } from './draft';

interface TransitionPanelProps {
  draft: BeatDraft;
  nextBeatTitle: string | null;
  onRuleChange: (rule: TransitionRule) => void;
  onNoteChange: (note: string) => void;
}

const noteId = 'transition-note';

export function TransitionPanel({
  draft,
  nextBeatTitle,
  onRuleChange,
  onNoteChange,
}: TransitionPanelProps) {
  const seam = seamOf(draft.index);

  return (
    <aside className="panel transition" aria-labelledby="transition-title">
      <div className="panel__head">
        <h2 id="transition-title" className="panel__title">
          组间衔接
        </h2>
        <span className="tag tag--excluded">不参与 AI 生成</span>
      </div>

      {!draftHasSeam(draft) || seam === null ? (
        <p className="panel__rule">第 5 板收在最高势能处，之后是下一集，本集不设衔接。</p>
      ) : (
        <>
          <p className="transition__seam">
            接缝 <span className="transition__seam-id">{seam}</span>
            <span className="transition__seam-flow">
              {draft.title} → {nextBeatTitle ?? `节拍${draft.index + 1}`}
            </span>
          </p>

          <fieldset className="transition__set">
            <legend className="transition__legend">衔接手法（封闭目录 6 选 1）</legend>
            <ul className="templates">
              {TRANSITION_CATALOG.map((entry) => (
                <li key={entry.code}>
                  <label
                    className={`template${draft.transition_rule === entry.rule ? ' template--on' : ''}`}
                  >
                    <input
                      type="radio"
                      name="transition-method"
                      className="visually-hidden"
                      value={entry.code}
                      checked={draft.transition_rule === entry.rule}
                      onChange={() => onRuleChange(entry.rule)}
                    />
                    <span className="template__label">{entry.rule}</span>
                    <span className="template__hint">{entry.hint}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <label className="cell__label" htmlFor={noteId}>
            操作要点
            <span className="tag tag--excluded">不进 Prompt</span>
          </label>
          <textarea
            id={noteId}
            className="input input--area"
            rows={2}
            placeholder="给剪辑的人读，例：黑场后女主已在医院"
            value={draft.transition_note}
            onChange={(event) => onNoteChange(event.target.value)}
          />

          <p className="panel__rule panel__rule--warn">
            组内交给 AI，组间交给人。衔接只在{TRANSITION_STAGE}阶段生效，
            写进 Prompt 只会让模型在段内乱加黑场，污染素材。
          </p>
        </>
      )}
    </aside>
  );
}
