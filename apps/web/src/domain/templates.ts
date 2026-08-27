/**
 * 黄金五板模板库 —— **数据，不是 UI**。
 *
 * 上游：`docs/methodology/golden-5-beats.md`（METH-003 §1 整集总览、§3–§7 五板样板、
 * §8 组间衔接总表、§9「模板库落地要求」）、`docs/methodology/glossary.md`（METH-002 §5）。
 *
 * METH-003 §0 把该文档的内容分成两类，本模块**照此分层，不把两类混成一坨**：
 *
 * - **【CANON】骨架**：时间位、时长、宫格数、帧语义、组间衔接。这一层**不在本模块重新声明**，
 *   而是从 `./beats` 的 {@link BEAT_DEFS} 取——模板库不是第二个骨架法源。模板里同名字段
 *   （`time_start` / `duration_sec` / `frame_count` / `transition_rule`）只是**冗余副本**，
 *   `templates.test.ts` 逐字段断言它与 `BEAT_DEFS` 一致，模板一旦偏离骨架立即变红。
 * - **【示例】文案**：情绪 / 镜头节奏 / 剧情核心 / 帧描述。这一层是模板库的真正内容，
 *   是「填好的起手稿」，用户可以逐字改写。
 *
 * 红线沿用领域层：模板只提供 5 板的**内容**，不提供任何改动结构的能力——
 * 本模块不导出增删节拍 / 改宫格数 / 换衔接枚举的入口，产出的项目照旧走
 * {@link createProject}，因此 `beat_list` 依然是冻结的 5 项。
 *
 * 衔接照旧**绝不进 Prompt**：{@link createProjectFromTemplate} 在返回前对 5 块板逐一跑
 * {@link assertPromptClean}，模板文案里若写进了衔接词，建项目当场抛错。
 */

import {
  BEAT_COUNT,
  BEAT_DEFS,
  MAX_BEAT_DURATION_SEC,
  beatDef,
  type BeatIndex,
  type BeatType,
  type FrameCount,
  type GIndex,
} from './beats';
import { assemblePrompt, assertPromptClean } from './prompt';
import {
  createProject,
  type AspectRatio,
  type CreateProjectOptions,
  type Project,
} from './projects';
import type { TransitionRule } from './transitions';

/** 模板标识。V1.0 只内置黄金五板样板一套。 */
export type TemplateId = 'banquet-hook';

/**
 * 一块板的模板内容。
 *
 * 骨架字段（`index` / `beat_type` / `g_index` / `time_start` / `time_end` /
 * `duration_sec` / `frame_count` / `transition_rule`）是 {@link BEAT_DEFS} 的副本，
 * 便于模板数据自解释；**取值由骨架决定，不由模板决定**。
 */
export interface BeatTemplate {
  readonly index: BeatIndex;
  readonly beat_type: BeatType;
  readonly g_index: GIndex;
  /** canon 节拍名（METH-002 §2 标准词）。 */
  readonly name: string;
  readonly time_start: number;
  readonly time_end: number;
  readonly duration_sec: number;
  readonly frame_count: FrameCount;
  /** 【示例】本段情绪，● 进 Prompt。 */
  readonly emotion: string;
  /** 【示例】镜头节奏，不含刀数与逐镜时长，● 进 Prompt。 */
  readonly camera_rhythm: string;
  /** 【示例】剧情核心，一句话剧情推进，● 进 Prompt。 */
  readonly plot_core: string;
  /** 【示例】帧描述，左 → 右，长度恒等于 `frame_count`，● 进 Prompt。 */
  readonly frame_texts: readonly string[];
  /** 组间衔接枚举值，○ 绝不进 Prompt。 */
  readonly transition_rule: TransitionRule;
  /**
   * METH-003 §8 的原文写法。可能是**复合说法**（B4 记作「卡点硬切 + BGM 升调」）
   * 或**否定说法**（B5 记作「无转场，黑屏截断」），落到封闭枚举时只能取一个值，
   * 映射必然有损；把原文一并留在数据里，损在哪里就是可查的。
   */
  readonly transition_label: string;
}

export interface ProjectTemplate {
  readonly id: TemplateId;
  /** 模板名（模板选择器的标题）。 */
  readonly title: string;
  /** 一句话说明。 */
  readonly summary: string;
  /** 法源出处。 */
  readonly canon_source: string;
  /** 套用后的默认项目名。 */
  readonly project_name: string;
  readonly genre: string;
  readonly aspect_ratio: AspectRatio;
  /** 整集时长（秒），恒等于五板时长之和。 */
  readonly total_duration_sec: number;
  readonly style_prompt: string;
  readonly protagonist: string;
  /** 五板模板内容，长度恒为 {@link BEAT_COUNT}。 */
  readonly beat_list: readonly BeatTemplate[];
}

/**
 * 宴会钻戒故事（黄金五板样板）。
 *
 * 骨架来自 METH-003 §1：时间位 0-8 / 8-25 / 25-45 / 45-70 / 70-88，宫格 3/3/3/3/2，
 * 整集 88s。文案来自 METH-003 §3–§7 的【示例】列，其中「被砸在主桌上的东西」统一为
 * **母亲遗物钻戒**（本项目既有黄金用例 `testing/goldens.ts` 已采此写法，两处同故事）。
 */
const BANQUET_HOOK_BEATS = [
  {
    index: 1,
    emotion: '骤然炸裂的震惊，压迫感在三秒内拉满',
    camera_rhythm: '极快切入，冲击—反应—环境三段递进，节奏不留缓冲',
    plot_core: '婚礼现场戒指被当众砸在地上，女主身份瞬间坍塌',
    frame_texts: [
      '婚宴主桌前，一枚钻戒被狠狠砸在地上，红酒杯翻倒',
      '女主瞳孔骤缩、笑意冻在脸上，指尖攥紧裙摆',
      '全场宾客围观哗然，长辈起身，主位空着一把椅子',
    ],
    transition_label: '音频预接',
  },
  {
    index: 2,
    emotion: '冷静下的暗涌，敌意逐步显形',
    camera_rhythm: '中速推进，人物关系逐层交代，压迫感稳步累积',
    plot_core: '继妹与新郎联手，用家族股权协议逼女主让位，敌对关系确立',
    frame_texts: [
      '对立方登场：继妹挽着新郎手臂走到台前，笑容得体',
      '利害揭明：家族股权协议摊开，签名处只留一个空格',
      '立场对峙：女主与继妹隔着长桌对视，宾客分成两侧',
    ],
    transition_label: '卡点硬切',
  },
  {
    index: 3,
    emotion: '层层加码的窒息与孤立，情绪压到底部',
    camera_rhythm: '快切递进，压迫逐级加重，节奏一路收紧不回落',
    plot_core: '继承权被当众剥夺、亲友倒戈，女主被逐出宴厅',
    frame_texts: [
      '第一层打压：当众宣布撤销女主继承资格，文件被撕开',
      '第二层打压：亲友倒戈，母亲被扶离现场，无人替她说话',
      '压力见顶：女主被推出宴厅，礼服裙角踩脏，门在背后合上',
    ],
    transition_label: '纯硬切',
  },
  {
    index: 4,
    emotion: '由沉到燃，压抑转为锋利，气势逐步上扬',
    camera_rhythm: '先慢后紧，蓄势推进，尾段节奏骤然收束到临界点',
    plot_core: '女主握到钻戒原主证明与录音，重返宴厅，反转前势能拉满',
    frame_texts: [
      '转机浮现：雨中长廊，女主接到一通匿名来电，抬眼',
      '势能积累：母亲遗物钻戒的原主证明与录音在手，指尖收紧',
      '临界点：宴厅大门重新推开，全场目光回转，她站在门口',
    ],
    transition_label: '卡点硬切 + BGM 升调',
  },
  {
    index: 5,
    emotion: '压抑后的锐利反打，情绪停在最高点不释放',
    camera_rhythm: '两段收束，节奏在最强处直接掐断，不做收尾缓冲',
    plot_core: '女主当众亮出钻戒原主证明，全场僵住，悬念留到下一集',
    frame_texts: [
      '抛出悬念：她把原件推到主桌中央，只说一句「再念一次」',
      '最高势能处切断：所有人表情僵住，画面停在她抬起的眼神上',
    ],
    transition_label: '无转场，黑屏截断',
  },
] as const;

/** 把【示例】文案与 {@link BEAT_DEFS} 的【CANON】骨架合成模板板，骨架字段一律取自骨架。 */
function toBeatTemplate(content: (typeof BANQUET_HOOK_BEATS)[number]): BeatTemplate {
  const def = beatDef(content.index);
  return Object.freeze({
    index: def.index,
    beat_type: def.beat_type,
    g_index: def.g_index,
    name: def.name,
    time_start: def.time_start,
    time_end: def.time_end,
    duration_sec: def.duration_sec,
    frame_count: def.frame_count,
    emotion: content.emotion,
    camera_rhythm: content.camera_rhythm,
    plot_core: content.plot_core,
    frame_texts: Object.freeze([...content.frame_texts]),
    transition_rule: def.transition_rule,
    transition_label: content.transition_label,
  });
}

export const BANQUET_HOOK_TEMPLATE: ProjectTemplate = Object.freeze({
  id: 'banquet-hook',
  title: '宴会钻戒反转（黄金五板样板）',
  summary: '婚宴上钻戒被当众砸地引爆钩子，五板一路压到底再反打，88s 断集留客。',
  canon_source: 'METH-003 §1 / §3–§8',
  project_name: '婚宴钻戒反转',
  genre: '都市·复仇',
  aspect_ratio: '9:16',
  total_duration_sec: 88,
  style_prompt: '冷调高对比，胶片颗粒质感，强逆光',
  protagonist: '长发女主，米白抹胸礼服，左颊有疤',
  beat_list: Object.freeze(BANQUET_HOOK_BEATS.map(toBeatTemplate)),
});

/** 内置模板目录，运行时冻结。 */
export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = Object.freeze([
  BANQUET_HOOK_TEMPLATE,
]);

export const TEMPLATE_IDS: readonly TemplateId[] = Object.freeze(
  PROJECT_TEMPLATES.map((template) => template.id),
);

/** 默认模板：新建项目时的起手模板。 */
export const DEFAULT_TEMPLATE_ID: TemplateId = 'banquet-hook';

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && TEMPLATE_IDS.includes(value as TemplateId);
}

export function projectTemplate(id: TemplateId): ProjectTemplate {
  const template = PROJECT_TEMPLATES.find((item) => item.id === id);
  if (template === undefined) {
    throw new RangeError(`未知的模板标识：${id}`);
  }
  return template;
}

/** 模板某一板的内容。 */
export function beatTemplate(id: TemplateId, index: BeatIndex): BeatTemplate {
  const found = projectTemplate(id).beat_list[index - 1];
  if (found === undefined) {
    throw new RangeError(`节拍序号越界：${index}；节拍数恒为 ${BEAT_COUNT}`);
  }
  return found;
}

/** 模板的五板 Prompt 全文预览，供「套用前先看一眼」用；衔接同样不在其中。 */
export function templatePromptPreview(id: TemplateId): readonly string[] {
  const project = createProjectFromTemplate(id);
  return Object.freeze(project.beat_list.map((beat) => assemblePrompt(project, beat)));
}

/** 模板自检违规码。 */
export type TemplateViolationCode =
  | 'TEMPLATE_BEAT_COUNT_NOT_5'
  | 'TEMPLATE_SKELETON_MISMATCH'
  | 'TEMPLATE_FRAME_TEXT_COUNT_MISMATCH'
  | 'TEMPLATE_FRAME_TEXT_EMPTY'
  | 'TEMPLATE_SLOT_EMPTY'
  | 'TEMPLATE_DURATION_OVER_CAP'
  | 'TEMPLATE_TOTAL_DURATION_MISMATCH';

export interface TemplateViolation {
  readonly code: TemplateViolationCode;
  readonly message: string;
  readonly index: BeatIndex | null;
}

function templateViolation(
  code: TemplateViolationCode,
  index: BeatIndex | null,
  message: string,
): TemplateViolation {
  return Object.freeze({ code, index, message });
}

/**
 * 模板自检：骨架副本是否仍与 {@link BEAT_DEFS} 一致、文案是否填满、时长是否合规。
 *
 * 新增模板时先过这里，模板库才不会成为绕过五节拍锁的后门。
 */
export function validateTemplate(template: ProjectTemplate): readonly TemplateViolation[] {
  const violations: TemplateViolation[] = [];

  if (template.beat_list.length !== BEAT_COUNT) {
    violations.push(
      templateViolation(
        'TEMPLATE_BEAT_COUNT_NOT_5',
        null,
        `模板节拍数恒为 ${BEAT_COUNT}，实际 ${template.beat_list.length}`,
      ),
    );
  }

  template.beat_list.forEach((beat, i) => {
    const def = BEAT_DEFS[i];
    if (def === undefined) {
      return;
    }

    const skeleton: readonly (readonly [string, unknown, unknown])[] = [
      ['index', beat.index, def.index],
      ['beat_type', beat.beat_type, def.beat_type],
      ['g_index', beat.g_index, def.g_index],
      ['name', beat.name, def.name],
      ['time_start', beat.time_start, def.time_start],
      ['time_end', beat.time_end, def.time_end],
      ['duration_sec', beat.duration_sec, def.duration_sec],
      ['frame_count', beat.frame_count, def.frame_count],
      ['transition_rule', beat.transition_rule, def.transition_rule],
    ];
    skeleton.forEach(([field, actual, expected]) => {
      if (actual !== expected) {
        violations.push(
          templateViolation(
            'TEMPLATE_SKELETON_MISMATCH',
            def.index,
            `模板第 ${def.index} 板的 ${field} 应为 ${String(expected)}，实际 ${String(actual)}；骨架由 BEAT_DEFS 决定`,
          ),
        );
      }
    });

    if (beat.frame_texts.length !== def.frame_count) {
      violations.push(
        templateViolation(
          'TEMPLATE_FRAME_TEXT_COUNT_MISMATCH',
          def.index,
          `模板第 ${def.index} 板应有 ${def.frame_count} 条帧描述，实际 ${beat.frame_texts.length}`,
        ),
      );
    }
    if (beat.frame_texts.some((text) => text.trim() === '')) {
      violations.push(
        templateViolation(
          'TEMPLATE_FRAME_TEXT_EMPTY',
          def.index,
          `模板第 ${def.index} 板有空帧描述；模板必须是填好的起手稿`,
        ),
      );
    }
    if (
      beat.emotion.trim() === '' ||
      beat.camera_rhythm.trim() === '' ||
      beat.plot_core.trim() === ''
    ) {
      violations.push(
        templateViolation(
          'TEMPLATE_SLOT_EMPTY',
          def.index,
          `模板第 ${def.index} 板的情绪 / 镜头节奏 / 剧情核心不得为空`,
        ),
      );
    }
    if (beat.duration_sec > MAX_BEAT_DURATION_SEC) {
      violations.push(
        templateViolation(
          'TEMPLATE_DURATION_OVER_CAP',
          def.index,
          `模板第 ${def.index} 板时长 ${beat.duration_sec}s 超出上限 ${MAX_BEAT_DURATION_SEC}s`,
        ),
      );
    }
  });

  const sum = template.beat_list.reduce((total, beat) => total + beat.duration_sec, 0);
  if (sum !== template.total_duration_sec) {
    violations.push(
      templateViolation(
        'TEMPLATE_TOTAL_DURATION_MISMATCH',
        null,
        `模板整集时长 ${template.total_duration_sec}s 与五板之和 ${sum}s 不一致`,
      ),
    );
  }

  return Object.freeze(violations);
}

export function assertTemplateValid(template: ProjectTemplate): void {
  const violations = validateTemplate(template);
  if (violations.length > 0) {
    throw new Error(
      `模板违规：${violations.map((item) => `[${item.code}] ${item.message}`).join('；')}`,
    );
  }
}

/**
 * 按模板建出一个**已填满**的项目。
 *
 * 与 {@link createProject} 的区别只在内容：结构照旧由创建事务写死 5 板，
 * `beat_list` 依然冻结、宫格数依然按板序锁定。模板只填 ● 进 Prompt 的四类槽位
 * （情绪 / 镜头节奏 / 剧情核心 / 帧描述），衔接沿用骨架值。
 *
 * 返回前做两道守卫：模板自检 {@link assertTemplateValid}，以及对 5 块板逐一
 * {@link assertPromptClean}——模板文案里写进衔接词 / 节拍名 / 备注，这里当场抛错。
 *
 * @param id 模板标识，默认 {@link DEFAULT_TEMPLATE_ID}
 * @param options 透传给 {@link createProject}（可指定 `id` / `now`，便于测试稳定取值）
 */
export function createProjectFromTemplate(
  id: TemplateId = DEFAULT_TEMPLATE_ID,
  options: CreateProjectOptions & { readonly name?: string } = {},
): Project {
  const template = projectTemplate(id);
  assertTemplateValid(template);

  const project = createProject(
    {
      name: options.name ?? template.project_name,
      genre: template.genre,
      aspect_ratio: template.aspect_ratio,
      total_duration_sec: template.total_duration_sec,
      style_prompt: template.style_prompt,
      protagonist: template.protagonist,
    },
    options,
  );

  project.beat_list.forEach((beat, i) => {
    const content = template.beat_list[i];
    if (content === undefined) {
      return;
    }
    beat.emotion = content.emotion;
    beat.camera_rhythm = content.camera_rhythm;
    beat.plot_core = content.plot_core;
    beat.frames.forEach((frame, at) => {
      frame.text = content.frame_texts[at] ?? '';
    });
    beat.status = 'filled';
  });

  project.beat_list.forEach((beat) => {
    assertPromptClean(beat, assemblePrompt(project, beat));
  });

  return project;
}
