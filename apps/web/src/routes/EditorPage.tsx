/**
 * 节拍编辑页（路由 `/p/:id`，PRD 5.2 / 5.3）。
 *
 * 三条链路在这一页汇合：
 *
 * | 链路 | 入口 | 归属 |
 * | --- | --- | --- |
 * | 编辑区（信息条 / 宫格 / 衔接 / Prompt 实时预览） | `editor/BeatBoard` | 编辑态 |
 * | 持久化（读库、2s 防抖自动保存、离页强制落盘 `FR-2-11`） | `store/useProjectEditor` | 本地库 |
 * | 生成（板级「生成本板」与顶栏「生成全集」） | `generate/` 的控制器 | 生成引擎 |
 *
 * 编辑态是**用户改动**唯一的中转：宫格与字段改动经 `onDraftsChange` 一次落到落库结构上，
 * 既进防抖保存，也立刻算进生成前置校验——填完就能点生成，不必等落盘。
 *
 * 生成结果不走这条路。`video_url` / `prompt_final` / `status` 由
 * `store/generateResults` 在任务进终态时直接写仓储：跑完就在库里，
 * 不等 2 秒防抖，也不怕用户在生成期间离页。落库之后再把值 `patch` 进草稿
 * （不置未保存态），免得随后的一次编辑把成片地址盖回空。
 *
 * 红线（AC-6.1 / 6.4 / 6.8）：板数恒 5 且无增删改序入口；格数由板位锁定；
 * 衔接、板名、备注绝不进入 Prompt 与生成请求体。
 */

import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { BeatNav } from '../components/BeatNav';
import { BEAT_COUNT, TOTAL_FRAME_COUNT, type BeatIndex } from '../domain/beats';
import { BASELINE_EPISODE_DURATION_SEC } from '../domain/beats';
import { BeatBoardBody, useBeatBoard, type BeatDrafts } from '../editor/BeatBoard';
import { draftToBeat } from '../editor/draft';
import { hydrateProject } from '../domain/projects';
import { rebuildBeat, type StoredBeat, type StoredProject } from '../adapters/persistence';
import {
  BeatGenerateAction,
  GenerateEpisodeButton,
  pickBoardState,
} from '../generate/GenerateActions';
import type { GenerateJob } from '../generate/types';
import { useGenerateController } from '../generate/useGenerateController';
import { useProject, useProjects } from '../store/ProjectsProvider';
import {
  applyJobResult,
  jobResultPending,
  useGenerateResultWriter,
} from '../store/generateResults';
import { SAVE_STATE_LABEL, useProjectEditor } from '../store/useProjectEditor';
import { ProjectMissing } from './ProjectMissing';

/**
 * 把编辑态盖回落库结构。
 *
 * 板经 `rebuildBeat` 重铸（结构锁跟着回来），可编辑字段取编辑态、生成期字段
 * （`video_url` / `prompt_final` / `status`）留库里那份——编辑不应该抹掉已生成的成片地址。
 *
 * `status` 也在这三个字段里：编辑态里的 `status` 是挂载那一刻的快照，编辑区从不改它，
 * 拿它盖回去会把生成通道刚写下的 `generated` 退回 `filled`。
 */
function withDrafts(project: StoredProject, drafts: BeatDrafts): StoredProject {
  const { beat_list: stored, ...fields } = project;
  const beats = stored.map((previous) => {
    const draft = drafts.find((item) => item.index === previous.index);
    if (draft === undefined) {
      return rebuildBeat(previous);
    }
    const beat = draftToBeat(draft) as StoredBeat;
    beat.status = previous.status;
    beat.video_url = previous.video_url;
    beat.prompt_final = previous.prompt_final;
    return beat;
  });
  return hydrateProject(fields, beats);
}

/** 把一个终态任务的结果并进项目；无变化时返回原项目（草稿的 mutate 契约不允许返回 null）。 */
function mergeResult(job: GenerateJob) {
  return (current: StoredProject) => applyJobResult(current, job) ?? current;
}

export function EditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { project, state } = useProject(id);

  if (state === 'loading') {
    return (
      <AppLayout title="节拍编辑" nav={<p className="nav__caption">读取中…</p>}>
        <p className="empty">读取项目…</p>
      </AppLayout>
    );
  }

  if (project === null) {
    return <ProjectMissing id={id} />;
  }

  // 编辑区与生成控制器的状态都以项目为单位：换项目必须整块重建，故用 key 而非 prop 更新。
  return <Editor key={project.id} project={project} />;
}

function Editor({ project }: { readonly project: StoredProject }) {
  const { save, repository } = useProjects();
  const editor = useProjectEditor(project, { save });
  const draft = editor.draft ?? project;

  // 生成结果的落库通道：任务一进终态就写仓储，与编辑态的防抖完全无关。
  // 写成功后把值对齐进草稿；写失败则退回编辑态通道（置未保存态，由防抖 / 手动保存重试）。
  const results = useGenerateResultWriter({
    repository,
    onPersisted: (job) => editor.patch(mergeResult(job)),
    onError: (_error, job) => editor.update(mergeResult(job)),
  });

  const board = useBeatBoard(project, {
    onDraftsChange: (drafts) => editor.update((current) => withDrafts(current, drafts)),
  });

  // 生成前置校验读的是编辑态盖回后的项目：刚填的宫格马上解禁按钮，不必等落盘。
  const liveProject = useMemo(
    () => withDrafts(draft, board.drafts),
    [draft, board.drafts],
  );
  const { controller, states } = useGenerateController(liveProject, {
    onSettle: results.settle,
  });
  const boardState = pickBoardState(states, board.activeIndex);

  // 补写：任务表里已有终态结果、而库里那份还没跟上。正常路径不会进这里——
  // 结果在任务进终态的那一刻就写过了。这里管的是上次离页时写盘失败、
  // 或本地任务表比项目更新（换机导入了旧项目）这两种残留。
  useEffect(() => {
    states.forEach((state) => {
      if (state.job !== null && jobResultPending(draft, state.job)) {
        void results.settle(state.job);
      }
    });
  }, [draft, states, results]);

  const totalDeviation = board.totalSec - BASELINE_EPISODE_DURATION_SEC;

  return (
    <AppLayout
      title="节拍编辑"
      subtitle={draft.name}
      nav={
        <>
          <p className="nav__caption">
            五节拍（固定 {BEAT_COUNT} 板 · 恒 {TOTAL_FRAME_COUNT} 格）
          </p>
          <BeatNav
            beats={board.navItems}
            activeIndex={board.activeIndex}
            onSelect={(index) => board.setActiveIndex(index as BeatIndex)}
          />
          <p className="nav__lock">板序与板名为规格，不可改序、不可改名。</p>
          <Link to="/" className="nav__back">
            返回项目列表
          </Link>
        </>
      }
      actions={
        <>
          <span
            className={`savestate savestate--${editor.saveState}`}
            role="status"
            aria-label={`保存状态：${SAVE_STATE_LABEL[editor.saveState]}`}
          >
            {SAVE_STATE_LABEL[editor.saveState]}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => void editor.saveNow()}
            disabled={editor.saveState === 'saving'}
          >
            保存
          </button>
          {boardState !== undefined && (
            <BeatGenerateAction controller={controller} state={boardState} />
          )}
          <GenerateEpisodeButton controller={controller} states={states} />
          <Link to={`/p/${draft.id}/export`} className="btn btn--primary">
            成片
          </Link>
        </>
      }
    >
      {editor.error !== null && (
        <p className="notice notice--danger" role="alert">
          保存失败：{editor.error}（改动仍在本页，请重试）
        </p>
      )}

      {totalDeviation !== 0 && (
        <p className="notice notice--warn">
          五板时长合计 {board.totalSec} 秒，偏离 {BASELINE_EPISODE_DURATION_SEC} 秒基准轴
          {totalDeviation > 0 ? ` +${totalDeviation}` : ` ${totalDeviation}`} 秒。
        </p>
      )}

      <BeatBoardBody project={draft} board={board} />
    </AppLayout>
  );
}
