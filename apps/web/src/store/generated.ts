/**
 * 生成结果落库（PRD §8.2 `video_url` / `prompt_final`）。
 *
 * 编辑页与成片页都会发起生成：编辑页出「生成本板 / 生成全集」，成片页出「重新生成」。
 * 两处都必须把结果写回库，否则刷新页面成片就没了。判据与写法收在这一份里，
 * 避免两页各写一套而漂移——尤其是「什么时候算有新结果」这条，写宽了会让保存态反复抖动。
 *
 * 红线（AC-6.4）：这里落库的 `prompt_final` 取自任务的 `prompt_snapshot`，
 * 而快照由 `domain/prompt.ts` 的白名单组装器产出，衔接 / 板名 / 备注压根没有入口。
 */

import { rebuildBeat, type StoredProject } from '../adapters/persistence';
import { hydrateProject } from '../domain/projects';
import type { GenerateBoardState } from '../generate/controller';

/**
 * 生成结果里有、库里还没有的成片地址。
 *
 * 逐板比对而不是「只要跑成功就写」：地址与库内一致时返回空数组，
 * 调用方据此跳过一次 `update`，保存态才不会在每次重渲染时被推成 `dirty`。
 */
export function pendingGeneratedStates(
  project: StoredProject,
  states: readonly GenerateBoardState[],
): readonly GenerateBoardState[] {
  return states.filter((state) => {
    if (state.video_url === null) {
      return false;
    }
    const beat = project.beat_list.find((item) => item.index === state.beat_index);
    return beat !== undefined && beat.video_url !== state.video_url;
  });
}

/**
 * 把生成结果盖回落库结构。
 *
 * 板经 `rebuildBeat` 重铸，结构锁跟着回来；只有 `pending` 里点到的板被改写，
 * 其余四块板原样保留——重投一段不该动到另外四段（IX-4）。
 */
export function withGeneratedResults(
  project: StoredProject,
  pending: readonly GenerateBoardState[],
): StoredProject {
  const { beat_list: stored, ...fields } = project;
  return hydrateProject(
    fields,
    stored.map((beat) => {
      const state = pending.find((item) => item.beat_index === beat.index);
      if (state === undefined) {
        return beat;
      }
      const next = rebuildBeat(beat);
      next.video_url = state.video_url;
      next.prompt_final = state.job?.prompt_snapshot ?? next.prompt_final;
      next.status = 'generated';
      return next;
    }),
  );
}
