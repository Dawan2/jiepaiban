/**
 * 本地持久化的落库结构。
 *
 * 权威字段定义来自 WK2 的领域层（`src/domain/beats.ts` / `projects.ts`）——
 * 落库结构**不另立一套模型**，只在领域模型之上补 PRD §8.2 的生成期字段与列表页需要的归档位：
 *
 * | PRD §8.2 | 本层字段 | 说明 |
 * | --- | --- | --- |
 * | `video_url` | `video_url` | 生成成功后写入；删除项目前据此判断是否需要二次确认 |
 * | `prompt_final` | `prompt_final` | 组装器（`src/prompt/assemble.ts`）产出的只读快照 |
 *
 * 二者放在持久化层而非 `domain/beats.ts`：领域层只管结构与红线，生成产物属于运行期状态。
 * 字段命名沿用领域层的 snake_case（METH-002 §10 / PRD §9.2 的字段法源）。
 *
 * 红线：本文件不得出现任何镜头级字段（`RULE-11`、AC-6.8），
 * 衔接字段（`transition_rule` / `note`）只作人读信息落库，
 * 永不进入 Prompt 与生成请求体（`RULE-9`、AC-6.4）。
 */

import { BEAT_COUNT, type Beat } from '../../domain/beats';
import { beatCompletion, episodeDuration, type AspectRatio, type Project } from '../../domain/projects';

/** 落库封套版本号。每次结构变更都必须 +1 并补一个迁移函数（见 `./envelope.ts`）。 */
export const SCHEMA_VERSION = 1;

/** 封套标识，用于识别导入文件是否属于本产品。 */
export const ENVELOPE_KIND = 'jiepaiban.project-archive' as const;

/** 节拍落库结构 = 领域节拍 + PRD §8.2 的生成期字段。 */
export interface StoredBeat extends Beat {
  /** PRD §8.2 `video_url`：本板视频地址，生成成功后写入；未生成为 `null`。 */
  video_url: string | null;
  /** PRD §8.2 `prompt_final`：组装器产出的只读快照。 */
  prompt_final: string | null;
}

/** 恒为 5 项的落库板列表；类型层已排除增删。 */
export type StoredBeatList = readonly [StoredBeat, StoredBeat, StoredBeat, StoredBeat, StoredBeat];

/** 项目落库结构 = 领域项目 + 列表页需要的归档位与创建时间。 */
export interface StoredProject extends Omit<Project, 'beat_list'> {
  /** 长度恒为 {@link BEAT_COUNT}，顺序恒为 1–5（PRD §8.1，R5 由数据层拦截）。 */
  readonly beat_list: StoredBeatList;
  created_at: string;
  /** 归档态项目从默认列表收起，但不删除数据。 */
  archived: boolean;
  /** 复用（PRD §7.2）产物指向来源项目，便于追溯「这是上一集的结构」。 */
  reused_from_id: string | null;
}

/** 列表页卡片所需的投影，避免为了渲染列表把 5 块板全量读进内存。 */
export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly genre: string;
  readonly aspect_ratio: AspectRatio;
  /** 五块板时长之和（秒）。 */
  readonly episode_duration_sec: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly archived: boolean;
  readonly reused_from_id: string | null;
  /** 已填节拍数，分母恒为 5。 */
  readonly filled_beats: number;
  readonly total_beats: typeof BEAT_COUNT;
  /** 已生成视频数；> 0 时删除需二次确认。 */
  readonly video_count: number;
}

/** 导出 / 导入用的版本化封套（架构文档 tech-stack §2.2）。 */
export interface PersistedEnvelope {
  readonly kind: typeof ENVELOPE_KIND;
  readonly schemaVersion: number;
  readonly savedAt: string;
  readonly projects: readonly StoredProject[];
}

/**
 * 给领域层刚铸出的板补上生成期字段的空位（`video_url` / `prompt_final`）。
 *
 * 领域层的板没有这两个字段，落库结构必须有；这里就地补空位而不是新建对象，
 * 是为了保留 `createBeat()` 用 `defineProperty` 装上的那一层结构锁。
 */
export function toStoredBeat(beat: Beat): StoredBeat {
  const stored = beat as StoredBeat;
  stored.video_url = null;
  stored.prompt_final = null;
  return stored;
}

/** 该板是否已有成片地址。 */
export function hasVideo(beat: StoredBeat): boolean {
  return beat.video_url !== null && beat.video_url !== '';
}

/** 已生成视频的节拍数。 */
export function videoCount(project: StoredProject): number {
  return project.beat_list.filter(hasVideo).length;
}

/** 列表页投影。 */
export function toSummary(project: StoredProject): ProjectSummary {
  const completion = beatCompletion(project);
  return {
    id: project.id,
    name: project.name,
    genre: project.genre,
    aspect_ratio: project.aspect_ratio,
    episode_duration_sec: episodeDuration(project),
    created_at: project.created_at,
    updated_at: project.updated_at,
    archived: project.archived,
    reused_from_id: project.reused_from_id,
    filled_beats: completion.filled,
    total_beats: completion.total,
    video_count: videoCount(project),
  };
}
