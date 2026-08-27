/**
 * 项目铸造：新建与复用（PRD V1.0 §7.1 / §7.2）。
 *
 * 两条路径都只产出**5 块锁定板**的结构：本文件不导出任何增删板的能力，
 * 也不接受「板数」参数——五节拍锁是结构常量，不是配置项（`RULE-2`、AC-6.1）。
 *
 * 与领域层的分工：结构、时间位、canon 衔接、宫格数全部由 `src/domain/` 铸出
 * （`createProject` → `createBeatList`），本文件只负责补齐持久化层字段
 * （`created_at` / `archived` / `video_url` / `prompt_final`）与按目标总时长摊时长。
 * Prompt 组装不在此处（见 `src/prompt/assemble.ts`）。
 */

import {
  BASELINE_EPISODE_DURATION_SEC,
  BEAT_COUNT,
  BEAT_DEFS,
  MAX_BEAT_DURATION_SEC,
} from '../domain/beats';
import {
  createProject,
  hydrateProject,
  type NewProjectInput,
  type Project,
} from '../domain/projects';
import {
  DEFAULT_TEMPLATE_ID,
  createProjectFromTemplate,
  type TemplateId,
} from '../domain/templates';
import { rebuildBeat, toStoredBeat, type StoredProject } from '../adapters/persistence';

/**
 * 五节拍基准表时长（METH-003 §1 CANON）：B1 8s / B2 17s / B3 20s / B4 25s / B5 18s。
 * 直接取自 {@link BEAT_DEFS}，不另抄一份，避免两处 canon 漂移。
 */
export const CANON_BEAT_DURATIONS: readonly number[] = Object.freeze(
  BEAT_DEFS.map((def) => def.duration_sec),
);

/** 基准轴总时长（秒），= 88。 */
export const CANON_TOTAL_DURATION_SEC = BASELINE_EPISODE_DURATION_SEC;

/** id 生成端口：测试注入固定实现，断言才稳定（architecture §5「确定性」）。 */
export type IdGen = () => string;

export const randomProjectId: IdGen = () =>
  `prj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const sum = (values: readonly number[]): number => values.reduce((total, v) => total + v, 0);

/**
 * 按基准表的时长比例摊到目标总时长，保持「B4 最长、B1 最短」的节奏形状。
 *
 * 单板一律夹在 1–{@link MAX_BEAT_DURATION_SEC} 秒内（`RULE-4` 硬上限）。当目标总时长
 * 超出基准轴太多、夹紧后凑不满时，返回值之和会小于 `totalSec`——此时整集时长落在
 * `RULE-5` 的警示区，由编辑页顶部栏提示，不在此处静默改写用户输入。
 */
export function canonBeatDurations(totalSec: number): number[] {
  const durations = CANON_BEAT_DURATIONS.map((seconds) =>
    clamp(Math.round((seconds / CANON_TOTAL_DURATION_SEC) * totalSec), 1, MAX_BEAT_DURATION_SEC),
  );

  // 四舍五入会产生 ±几秒的漂移，按「基准表里最长的板优先」补回，保证总和精确等于目标值。
  const byLengthDesc = CANON_BEAT_DURATIONS.map((seconds, index) => ({ seconds, index }))
    .sort((a, b) => b.seconds - a.seconds)
    .map((entry) => entry.index);

  let drift = totalSec - sum(durations);
  while (drift !== 0) {
    const step = drift > 0 ? 1 : -1;
    const target = byLengthDesc.find((index) => {
      const next = (durations[index] ?? 0) + step;
      return next >= 1 && next <= MAX_BEAT_DURATION_SEC;
    });
    if (target === undefined) {
      break;
    }
    durations[target] = (durations[target] ?? 0) + step;
    drift -= step;
  }

  return durations;
}

/**
 * 领域项目 → 落库项目：补生成期字段与归档位，并把板时长摊到目标总时长。
 *
 * 两条新建路径（空白 / 套模板）共用这一段尾巴，避免两处各摊一次时长而漂移。
 */
function toStoredProject(base: Project, now: string): StoredProject {
  const durations = canonBeatDurations(base.total_duration_sec);

  const beats = base.beat_list.map((beat, i) => {
    const stored = toStoredBeat(beat);
    stored.duration_sec = durations[i] ?? beat.duration_sec;
    return stored;
  });

  if (beats.length !== BEAT_COUNT) {
    throw new Error(`新建项目必须恰好 ${BEAT_COUNT} 块板，实为 ${beats.length}（RULE-2）`);
  }

  const { beat_list: _replaced, ...fields } = base;
  return hydrateProject(
    { ...fields, created_at: now, updated_at: now, archived: false, reused_from_id: null },
    beats,
  );
}

/**
 * 新建项目（PRD §7.1）：必然产生 5 块板，不存在「空项目」或「自选板数」。
 * 板序、语义、宫格数、时间位、canon 衔接由领域层锁定；时长按基准表摊到目标总时长。
 */
export function createEmptyProject(
  input: NewProjectInput,
  id: string,
  now: string,
): StoredProject {
  return toStoredProject(createProject(input, { id, now }), now);
}

/**
 * 按黄金五板模板新建项目 —— 新建的**第二条起手路径**。
 *
 * 与 {@link createEmptyProject} 的差别**只在板上的文案**：结构照旧由领域层锁死
 * （5 块板、宫格数按板序、时间位与 canon 衔接不可改），这里不接受任何结构参数，
 * 因此模板不是绕开五节拍锁的后门（`RULE-2`、AC-6.1）。
 *
 * 分工：板级【示例】文案（情绪 / 镜头节奏 / 剧情核心 / 节拍帧）由
 * `domain/templates.ts` 的 {@link createProjectFromTemplate} 填好，并在那里逐板过
 * `assertPromptClean`；项目级参数（题材 / 画幅 / 目标时长 / 画风 / 主角）一律**以用户
 * 表单为准**——模板只给起手内容，不劫持用户已经填的东西。
 *
 * 落库后 5 块板的 `status` 是 `filled` 而非 `empty`：这正是本路径存在的意义，
 * 用户拿到的是一份可以逐字改写的起手稿，而不是 5 块空板。
 */
export function createTemplateProject(
  input: NewProjectInput,
  id: string,
  now: string,
  templateId: TemplateId = DEFAULT_TEMPLATE_ID,
): StoredProject {
  const base = createProjectFromTemplate(templateId, { id, now, name: input.name });

  base.genre = input.genre;
  base.aspect_ratio = input.aspect_ratio;
  base.total_duration_sec = input.total_duration_sec ?? CANON_TOTAL_DURATION_SEC;
  base.style_prompt = input.style_prompt;
  base.protagonist = input.protagonist;

  return toStoredProject(base, now);
}

/** 复用时被清空的节拍字段（PRD §7.2「清空」列）。 */
export const REUSE_CLEARED_BEAT_FIELDS = ['frames', 'prompt_final', 'video_url', 'status'] as const;

/**
 * 复用项目（PRD §7.2）：**结构与参数的复制 + 内容的清空**，不是「另存副本」。
 *
 * | | 字段 |
 * | --- | --- |
 * | 继承 | 板序与语义、宫格数、时间位、板时长、衔接手法、板级情绪 / 镜头节奏 / 剧情核心、项目级参数（题材 / 画幅 / 画风 / 主角 / 目标时长） |
 * | 清空 | 节拍帧画面文案（`frames[].text`）、`prompt_final`、`video_url`、生成状态（`status` 回 `empty`） |
 *
 * 清空项一律回到空态，不保留上一集残留内容；产物仍是 5 板锁定结构。
 */
export function reuseProject(
  source: StoredProject,
  id: string,
  now: string,
  name = `${source.name} · 复用`,
): StoredProject {
  const { beat_list: _replaced, ...fields } = source;
  // 必须重铸而不是浅拷：直接改源项目的板会把「复用」变成「改上一集」。
  const beats = source.beat_list.map((beat) => {
    const copy = rebuildBeat(beat);
    copy.frames.forEach((frame) => {
      frame.text = '';
    });
    copy.prompt_final = null;
    copy.video_url = null;
    copy.status = 'empty';
    return copy;
  });

  return hydrateProject(
    {
      ...fields,
      id,
      name,
      created_at: now,
      updated_at: now,
      archived: false,
      reused_from_id: source.id,
    },
    beats,
  );
}

/** 归档 / 取消归档（列表页把归档项目收起，数据保留）。 */
export function setArchived(project: StoredProject, archived: boolean, now: string): StoredProject {
  const { beat_list: beats, ...fields } = project;
  return hydrateProject({ ...fields, archived, updated_at: now }, beats);
}
