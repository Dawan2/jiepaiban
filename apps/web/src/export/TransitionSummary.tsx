/**
 * 衔接总表（页面底部，FR-5-06 / AC-F5-8，与段卡上的衔接同源）。
 *
 * 五行恒定：`节拍1 → 节拍2` … `节拍5 → 下一集`，每行标注生效阶段「后期合成」。
 * 表格是给后期合成看的清单，不是编辑入口——改衔接回编辑页改。
 */

import { TRANSITION_STAGE } from '../domain/transitions';
import type { SegmentTransition } from './segments';

export function TransitionSummary({
  transitions,
}: {
  readonly transitions: readonly SegmentTransition[];
}) {
  return (
    <section className="panel export-panel" aria-labelledby="transition-summary-title">
      <h2 id="transition-summary-title" className="panel__title">
        组间衔接总表
      </h2>
      <p className="panel__desc">
        衔接挂在上一块板上，语义为「本板结束时如何进入下一板」，只在{TRANSITION_STAGE}生效。
      </p>

      <table className="export-table">
        <caption className="visually-hidden">组间衔接总表：5 个衔接点</caption>
        <thead>
          <tr>
            <th scope="col">衔接点</th>
            <th scope="col">手法</th>
            <th scope="col">枚举码</th>
            <th scope="col">生效阶段</th>
            <th scope="col">说明</th>
          </tr>
        </thead>
        <tbody>
          {transitions.map((transition) => (
            <tr key={transition.beat_index} data-transition-row={transition.beat_index}>
              <th scope="row">{transition.point_label}</th>
              <td>{transition.rule}</td>
              <td>{transition.code}</td>
              <td>{transition.stage}</td>
              <td>{transition.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="panel__note">
        衔接、节拍名称、备注三个字段永不进入 Prompt 与生成请求体（AC-6.4）；本表只往后期合成走。
      </p>
    </section>
  );
}
