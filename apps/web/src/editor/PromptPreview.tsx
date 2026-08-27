/**
 * Prompt 实时预览面板（PRD 5.3 / AC-6.5、AC-6.7）。
 *
 * 「所见即所发」（L7）：面板渲染 `result.segments`，提交发送 `result.text`，
 * 而 `text` 由 `segments` 拼接派生——二者同源，不可能不一致。
 * 系统注入的固定前缀同样在这里可见：没有「用户看不见但发出去了」的内容。
 */

import type { AssembleResult, MissingField, SegmentSource } from '../prompt/assemble';

interface PromptPreviewProps {
  result: AssembleResult;
  /** 红线自检结果：null 为通过，否则为拦截原因。 */
  redlineError: string | null;
}

const SOURCE_LABEL: Record<SegmentSource, string> = {
  project: '项目级',
  beat: '节拍级',
  frame: '宫格级',
};

function missingLabel(missing: MissingField): string {
  switch (missing.kind) {
    case 'style_prompt':
      return '项目风格词';
    case 'protagonist':
      return '主角形象';
    case 'emotion':
      return '情绪基调';
    case 'camera_rhythm':
      return '镜头节奏';
    case 'plot_core':
      return '剧情核心';
    case 'duration_sec':
      return '本拍时长';
    case 'frame':
      return `格 ${missing.order} 画面描述`;
  }
}

export function PromptPreview({ result, redlineError }: PromptPreviewProps) {
  const ready = result.missing.length === 0 && redlineError === null;

  return (
    <aside className="panel prompt" aria-labelledby="prompt-title">
      <div className="panel__head">
        <h2 id="prompt-title" className="panel__title">
          Prompt 预览
        </h2>
        {/*
          就绪 / 待补全是编辑过程中唯一会自己变化的判定结论，用 status 播报出来，
          键盘用户不必反复 Tab 回来确认。全文本身不播报：每敲一个字都念一遍是噪音。
        */}
        <span className={`status${ready ? ' status--ok' : ' status--wait'}`} role="status">
          {ready ? '就绪' : '待补全'}
        </span>
      </div>

      <p className="prompt__wysiwyg">面板所见 = 请求所发，逐字符一致。</p>

      {/* 光有 aria-label 的 div 不进无障碍树；给它一个 group 角色才能被读到名字。 */}
      <div className="prompt__body" role="group" aria-label="Prompt 全文">
        {result.segments.length === 0 ? (
          <p className="prompt__empty">填写字段后在此实时组装。</p>
        ) : (
          result.segments.map((segment, i) => (
            <span
              key={`${segment.label}-${i}`}
              className={`seg seg--${segment.source}`}
              title={`${SOURCE_LABEL[segment.source]} · ${segment.label}`}
            >
              {segment.text}
            </span>
          ))
        )}
      </div>

      <dl className="legend">
        {(['project', 'beat', 'frame'] as const).map((source) => (
          <div key={source} className="legend__row">
            <dt>
              <span className={`legend__swatch legend__swatch--${source}`} aria-hidden="true" />
              {SOURCE_LABEL[source]}
            </dt>
            <dd>{result.segments.filter((segment) => segment.source === source).length} 段</dd>
          </div>
        ))}
      </dl>

      {result.missing.length > 0 && (
        <div className="prompt__missing">
          <span className="prompt__missing-title">待填 {result.missing.length} 项</span>
          <ul className="chips">
            {result.missing.map((missing) => (
              <li key={missingLabel(missing)} className="chip">
                {missingLabel(missing)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.map((warning) => (
        <p key={warning.code} className="panel__rule panel__rule--warn">
          {warning.message}
        </p>
      ))}

      <section className="params" aria-label="参数位">
        <h3 className="params__title">
          参数位<span className="tag tag--param">随请求发送</span>
        </h3>
        <dl className="params__list">
          <div>
            <dt>时长</dt>
            <dd className="num">{result.params.duration_sec}s</dd>
          </div>
          <div>
            <dt>画幅</dt>
            <dd className="num">{result.params.aspect_ratio}</dd>
          </div>
          <div>
            <dt>宫格</dt>
            <dd className="num">{result.params.frame_count}</dd>
          </div>
          <div>
            <dt>参考图</dt>
            <dd className="num">{result.params.reference_image_keys.length}</dd>
          </div>
          <div>
            <dt>字数</dt>
            <dd className="num">{result.text.length}</dd>
          </div>
        </dl>
      </section>

      <p className={`redline${redlineError === null ? ' redline--ok' : ' redline--bad'}`}>
        红线自检：
        {redlineError === null ? '通过 — 衔接 / 板名 / 备注 无一进入 Prompt' : redlineError}
      </p>

      <p className="panel__rule">
        组装引擎 <code>{result.engineVersion}</code>，公式与法源见领域层 <code>domain/prompt.ts</code>。
      </p>
    </aside>
  );
}
