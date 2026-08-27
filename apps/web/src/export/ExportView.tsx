/**
 * 成片管理视图（路由 `/p/:id/export`，PRD 5.5 与 11.4 线框）。
 *
 * 结构自上而下：
 * 1. 顶栏动作：顺序连播（桩件阶段不可播）、全部下载、一键拼接（V1.1 置灰）；
 * 2. 固定 5 张段卡，顺序恒为节拍序；
 * 3. 底部三块：拼接计划、组间衔接总表、项目导出与交付包。
 *
 * 页面只做展示 / 下载 / 重投三件事（R7 不做剪辑器）：没有轨道、没有裁剪、
 * 没有比板更细的粒度，也不新增任何跨段编辑能力。
 *
 * 生成侧一律经 `generate/` 的控制器，本视图不自行组装请求体——
 * 衔接在卡与表里都看得见，但传不进生成（R2 / AC-6.4）。
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { MainNav } from '../components/MainNav';
import { BEAT_COUNT, type BeatIndex } from '../domain/beats';
import type { Project } from '../domain/projects';
import { useGenerateController } from '../generate/useGenerateController';
import type { UseGenerateControllerOptions } from '../generate/useGenerateController';
import { DeliveryPanel } from './DeliveryPanel';
import { createBrowserDownloader, type FileDownloader } from './download';
import './export.css';
import {
  buildDeliveryManifest,
  buildDeliveryManifestFile,
  buildProjectJsonFile,
} from './projectExport';
import { ExportSegmentCard } from './SegmentCard';
import { buildSegmentCards } from './segments';
import { STITCH_LOCKED_HINT, STITCH_UNLOCK_VERSION, buildStitchPlan } from './stitchPlan';
import { StitchPlanPanel } from './StitchPlanPanel';
import { TransitionSummary } from './TransitionSummary';

/** 桩件阶段视频地址不可播放，连播随真实接口一起开放。 */
const PLAYBACK_LOCKED_HINT = '桩件阶段的成片地址不可播放，顺序连播随真实生成接口开放';

export interface ExportViewProps {
  readonly project: Project;
  /** 注入生成控制器的依赖（存储 / 适配器 / autoRun），测试与后端接线用。 */
  readonly controllerOptions?: UseGenerateControllerOptions;
  /** 注入下载实现，默认走浏览器 Blob 下载。 */
  readonly downloadFile?: FileDownloader;
  /** 注入导出时间戳，默认取当前时刻。 */
  readonly now?: () => string;
}

export function ExportView({ project, controllerOptions, downloadFile, now }: ExportViewProps) {
  const { controller, states } = useGenerateController(project, controllerOptions ?? {});
  const [lastExport, setLastExport] = useState<string | null>(null);

  const download = useMemo(() => downloadFile ?? createBrowserDownloader(), [downloadFile]);
  const timestamp = useMemo(() => now ?? (() => new Date().toISOString()), [now]);

  const cards = useMemo(() => buildSegmentCards(project, states), [project, states]);
  const plan = useMemo(() => buildStitchPlan(project, cards), [project, cards]);
  const manifest = useMemo(
    () => buildDeliveryManifest(project, cards, { now: timestamp() }),
    [project, cards, timestamp],
  );

  function exportFile(file: { readonly file_name: string; readonly text: string; readonly mime: string }) {
    download(file);
    setLastExport(file.file_name);
  }

  function regenerate(beatIndex: BeatIndex) {
    controller.retryBeat(beatIndex);
  }

  return (
    <AppLayout
      title="成片"
      subtitle={project.name}
      nav={
        <>
          <MainNav
            items={[
              { to: `/p/${project.id}`, label: '节拍编辑', hint: '五节拍卡与 Prompt', end: true },
              { to: `/p/${project.id}/export`, label: '成片', hint: `${BEAT_COUNT} 段卡片与下载` },
            ]}
          />
          <p className="nav__caption">交付状态</p>
          <p className="export-nav__status">
            已齐 {plan.ready_count}/{BEAT_COUNT} 段 · 合计 {plan.total_duration_sec} 秒
          </p>
          <Link to="/" className="nav__back">
            返回项目列表
          </Link>
        </>
      }
      actions={
        <>
          <button type="button" className="btn" disabled title={PLAYBACK_LOCKED_HINT}>
            顺序连播
          </button>
          <button
            type="button"
            className="btn"
            disabled={!plan.is_complete}
            title={plan.blocked_reason ?? '导出交付包清单（zip 内路径与取件地址）'}
            onClick={() => exportFile(buildDeliveryManifestFile(project, cards, { now: timestamp() }))}
          >
            全部下载
          </button>
          <button type="button" className="btn" disabled title={STITCH_LOCKED_HINT}>
            一键拼接（{STITCH_UNLOCK_VERSION}）
          </button>
        </>
      }
    >
      <ol className="segments">
        {cards.map((card) => (
          <ExportSegmentCard
            key={card.beat_index}
            card={card}
            projectId={project.id}
            onRegenerate={regenerate}
          />
        ))}
      </ol>

      <div className="export-bottom">
        <StitchPlanPanel plan={plan} />
        <TransitionSummary transitions={plan.transitions} />
        <DeliveryPanel
          manifest={manifest}
          plan={plan}
          onExportProjectJson={() =>
            exportFile(buildProjectJsonFile(project, cards, { now: timestamp() }))
          }
          onExportManifest={() =>
            exportFile(buildDeliveryManifestFile(project, cards, { now: timestamp() }))
          }
        />
        {lastExport !== null && (
          <p className="export-bottom__toast" role="status">
            已导出 {lastExport}
          </p>
        )}
      </div>
    </AppLayout>
  );
}
