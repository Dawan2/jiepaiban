/**
 * 本地持久化的落库结构（W2/WK-STORE）。
 *
 * 权威字段定义来自 PRD V1.0 §8「数据模型 —— beat 字段唯一来源」。本层在 WK1 的
 * 领域类型（`src/domain/`）之上补两个 PRD §8.2 的生成期字段：
 *
 * | PRD §8.2 | 本层字段 | 说明 |
 * | --- | --- | --- |
 * | `video_url` | `videoUrl` | 生成成功后写入；删除项目前据此判断是否需要二次确认 |
 * | `prompt_final` | `promptFinal` | 组装器（WK2）产出的只读快照 |
 *
 * 二者放在持久化层而非 `domain/beats.ts`，是为了不与 WK2 的领域建模抢同一文件；
 * 待 WK2 的规范 beat 模型落地后，本层类型可直接收敛过去（见 docs/work/w2-local-store.md §迁移）。
 *
 * 红线：本文件不得出现任何分镜 / 镜头级字段（`RULE-11`、AC-6.8），
 * 衔接字段（`transition`）只作人读信息落库，永不进入 Prompt 与生成请求体（`RULE-9`、AC-6.4）。
 */

import { BEAT_COUNT, type Beat } from '../../domain/beats';
import type { AspectRatio, Project } from '../../domain/projects';

/** 落库封套版本号。每次结构变更都必须 +1 并补一个迁移函数（见 `./envelope.ts`）。 */
export const SCHEMA_VERSION = 1;

/** 封套标识，用于识别导入文件是否属于本产品。 */
export const ENVELOPE_KIND = 'jiepaiban.project-archive' as const;

/** 节拍落库结构 = WK1 领域节拍 + PRD §8.2 的生成期字段。 */
export interface StoredBeat extends Beat {
  /** PRD §8.2 `video_url`：本板视频地址，生成成功后写入。 */
  videoUrl: string | null;
  /** PRD §8.2 `prompt_final`：组装器产出的只读快照。 */
  promptFinal: string | null;
}

/** 项目落库结构 = WK1 领域项目 + 列表页需要的归档位与创建时间。 */
export interface StoredProject extends Omit<Project, 'beats'> {
  /** 长度恒为 {@link BEAT_COUNT}，顺序恒为 1–5（PRD §8.1，R5 由数据层拦截）。 */
  beats: StoredBeat[];
  createdAt: string;
  /** 归档态项目从默认列表收起，但不删除数据。 */
  archived: boolean;
  /** 复用（PRD §7.2）产物指向来源项目，便于追溯"这是上一集的结构"。 */
  reusedFromId: string | null;
}

/** 列表页卡片所需的投影，避免为了渲染列表把 5 块板全量读进内存。 */
export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly genre: string;
  readonly aspectRatio: AspectRatio;
  readonly episodeDurationSec: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archived: boolean;
  readonly reusedFromId: string | null;
  /** 已填节拍数，分母恒为 5。 */
  readonly filledBeats: number;
  readonly totalBeats: typeof BEAT_COUNT;
  /** 已生成视频数；> 0 时删除需二次确认。 */
  readonly videoCount: number;
}

/** 导出 / 导入用的版本化封套（架构文档 tech-stack §2.2）。 */
export interface PersistedEnvelope {
  readonly kind: typeof ENVELOPE_KIND;
  readonly schemaVersion: number;
  readonly savedAt: string;
  readonly projects: readonly StoredProject[];
}

/** 已生成视频的节拍数。 */
export function videoCount(project: StoredProject): number {
  return project.beats.filter((beat) => beat.videoUrl !== null && beat.videoUrl !== '').length;
}

/** 列表页投影。 */
export function toSummary(project: StoredProject): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    genre: project.genre,
    aspectRatio: project.aspectRatio,
    episodeDurationSec: project.episodeDurationSec,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archived: project.archived,
    reusedFromId: project.reusedFromId,
    filledBeats: project.beats.filter((beat) => beat.status !== 'empty').length,
    totalBeats: BEAT_COUNT,
    videoCount: videoCount(project),
  };
}
