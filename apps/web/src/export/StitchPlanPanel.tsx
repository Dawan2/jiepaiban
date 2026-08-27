/**
 * 拼接计划面板（页面底部，PRD 5.5.3 的顺序依据、5.5.5 拼接留位）。
 *
 * 这是 V1.1「一键拼接」的输入契约先行版：段序、起止时间位、取件地址、段间衔接
 * 都在这张表里；V1.0 只出表不拼，按钮置灰。
 */

import type { StitchPlan } from './stitchPlan';
import { STITCH_UNLOCK_VERSION } from './stitchPlan';

export function StitchPlanPanel({ plan }: { readonly plan: StitchPlan }) {
  return (
    <section className="panel export-panel" aria-labelledby="stitch-plan-title">
      <h2 id="stitch-plan-title" className="panel__title">
        拼接计划
      </h2>
      <p className="panel__desc">
        {plan.rows.length} 段按板序排列，起止时间位由各板时长累加得出；一键拼接为{' '}
        {STITCH_UNLOCK_VERSION} 能力，V1.0 只出计划。
      </p>

      <table className="export-table">
        <caption className="visually-hidden">拼接计划：按节拍序排列的 5 段成片</caption>
        <thead>
          <tr>
            <th scope="col">段</th>
            <th scope="col">时间位</th>
            <th scope="col">时长</th>
            <th scope="col">状态</th>
            <th scope="col">出段后衔接</th>
            <th scope="col">取件地址</th>
          </tr>
        </thead>
        <tbody>
          {plan.rows.map((row) => (
            <tr key={row.beat_index} data-stitch-row={row.beat_index}>
              <th scope="row">
                节拍{row.beat_index}· {row.title}
              </th>
              <td>{row.range_label}</td>
              <td>{row.duration_sec} 秒</td>
              <td>{row.status_label}</td>
              <td>
                {row.transition.point_label}：{row.transition.rule}
              </td>
              <td className="export-table__url">{row.video_url ?? '缺片'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">合计</th>
            <td colSpan={2}>{plan.total_duration_sec} 秒</td>
            <td colSpan={3}>
              已齐 {plan.ready_count}/{plan.rows.length} 段
              {plan.blocked_reason === null ? '' : `·${plan.blocked_reason}`}
            </td>
          </tr>
        </tfoot>
      </table>

      {!plan.is_duration_in_range && (
        <p className="panel__note">
          整集时长 {plan.total_duration_sec} 秒不在 {plan.duration_range_sec.min}–
          {plan.duration_range_sec.max} 秒区间内，后期合成前先回编辑页调板时长。
        </p>
      )}
    </section>
  );
}
