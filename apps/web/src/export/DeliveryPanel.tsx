/**
 * 交付导出面板（页面底部，PRD 5.5.2 「全部下载打包 zip」+ 项目档案导出）。
 *
 * 两个出口：
 * - **导出项目 JSON**：随时可导，含项目级字段、5 块板全字段、各板 Prompt 全文、衔接总表。
 * - **导出交付包清单**：5 段齐备才可导，列出 zip 内路径与取件地址（V1.0 桩件地址不可抓取，
 *   所以先出清单；接真实签名 URL 后按清单打包，清单结构不变）。
 */

import type { DeliveryManifest } from './projectExport';
import type { StitchPlan } from './stitchPlan';

export interface DeliveryPanelProps {
  readonly manifest: DeliveryManifest;
  readonly plan: StitchPlan;
  readonly onExportProjectJson: () => void;
  readonly onExportManifest: () => void;
}

export function DeliveryPanel({
  manifest,
  plan,
  onExportProjectJson,
  onExportManifest,
}: DeliveryPanelProps) {
  const blocked = plan.blocked_reason;

  return (
    <section className="panel export-panel" aria-labelledby="delivery-title">
      <h2 id="delivery-title" className="panel__title">
        项目导出与交付包
      </h2>
      <p className="panel__desc">
        交付包名 {manifest.zip_file_name}；当前清单 {manifest.entries.length} 项，其中成片{' '}
        {manifest.segment_count}/{plan.rows.length} 段。
      </p>

      <div className="export-card__actions">
        <button type="button" className="btn" onClick={onExportProjectJson}>
          导出项目 JSON
        </button>
        <button
          type="button"
          className="btn"
          disabled={blocked !== null}
          title={blocked ?? '导出 zip 内路径与取件地址清单'}
          onClick={onExportManifest}
        >
          导出交付包清单
        </button>
      </div>

      <ol className="export-entries">
        {manifest.entries.map((entry) => (
          <li key={entry.path}>
            <code>{entry.path}</code>
            <span className="export-entries__source">{entry.source_url ?? '本次导出即时生成'}</span>
          </li>
        ))}
      </ol>

      <p className="panel__todo">{manifest.note}</p>
    </section>
  );
}
