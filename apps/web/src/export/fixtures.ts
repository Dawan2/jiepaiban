/**
 * 成片页测试夹具（**仅测试使用**，故意不从 `./index.ts` 导出）。
 *
 * 用真实的队列 + 内存存储把「已生成」的板跑出来，而不是手捏 `GenerateJob`：
 * 这样段卡读到的状态、时间戳、幂等键都与生产路径一致，
 * 「衔接不进请求体」这类断言才有意义。
 */

import { beatAt, type Project } from '../domain/projects';
import { BEAT_INDEXES, type BeatIndex } from '../domain/beats';
import {
  createSeedanceAdapter,
  type SeedanceSubmission,
  type SeedanceTransport,
} from '../generate/adapter';
import { createGenerateController, type GenerateController } from '../generate/controller';
import { createGenerateQueue, type GenerateQueue } from '../generate/queue';
import { createMemoryJobStore, type GenerateJobStore } from '../generate/store';
import { createFilledEpisode } from '../testing/goldens';

/** 固定时间戳，让「生成完成时间」在任何机器上都一样。 */
export const FIXED_GENERATED_AT = '2026-08-27T09:12:00.000Z';
export const FIXED_GENERATED_AT_LABEL = '2026-08-27 09:12:00 UTC';

export interface EpisodeFixture {
  readonly project: Project;
  readonly store: GenerateJobStore;
  readonly queue: GenerateQueue;
  readonly controller: GenerateController;
  /** 提交给传输层的请求体，按提交顺序记录。 */
  readonly submissions: readonly SeedanceSubmission[];
}

export interface EpisodeFixtureOptions {
  /** 需要跑成功的板序，默认五块板全跑。 */
  readonly generated?: readonly BeatIndex[];
}

/**
 * 建出一个「已生成 N 段」的项目 + 控制器。
 *
 * 返回的 `submissions` 是传输层实际收到的请求体，
 * 可直接断言里面没有组间衔接 / 节拍名称 / 备注。
 */
export async function createGeneratedEpisode(
  options: EpisodeFixtureOptions = {},
): Promise<EpisodeFixture> {
  const project = createFilledEpisode();
  const store = createMemoryJobStore();
  const submissions: SeedanceSubmission[] = [];

  const transport: SeedanceTransport = async (submission) => {
    submissions.push(submission);
    return {
      ok: true,
      video_url: `stub://seedance-2.5/b${submission.beat_index}/${submission.idempotency_key}.mp4`,
    };
  };

  const queue = createGenerateQueue({
    adapter: createSeedanceAdapter({ transport }),
    store,
    now: () => FIXED_GENERATED_AT,
  });

  (options.generated ?? BEAT_INDEXES).forEach((index) => {
    queue.enqueue(project, beatAt(project, index));
  });
  await queue.drain();

  const controller = createGenerateController({ project, queue, autoRun: false });

  return { project, store, queue, controller, submissions };
}
