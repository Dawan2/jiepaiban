/**
 * 黄金五板模板库测试（METH-003 §1 / §3–§8 / §9）。
 *
 * 三条硬断言，对应本槽位的验收口径：
 *
 * 1. **88s 窗口**：五板时长之和恒为 88s，时间位首尾相接铺满 0–88，且落在整集 70–90s 区间内。
 * 2. **宫格数 3,3,3,3,2**：模板不得自带另一套宫格数。
 * 3. **Prompt 不含衔接**：五板 Prompt 全文与生成请求体都不含任何衔接词——
 *    既包括封闭枚举的 6 个取值，也包括 METH-003 §8 的原文复合写法（「BGM 升调」等）。
 *
 * 期望值一律**手写字面量**，不由实现反推：模板文案被改动、骨架被改动、组装公式被改动，
 * 本文件必须变红。不得为了让实现通过而放宽这里的断言。
 */

import { describe, expect, it } from 'vitest';
import {
  BANQUET_HOOK_TEMPLATE,
  DEFAULT_TEMPLATE_ID,
  PROJECT_TEMPLATES,
  TEMPLATE_IDS,
  assertTemplateValid,
  beatTemplate,
  createProjectFromTemplate,
  isTemplateId,
  projectTemplate,
  templatePromptPreview,
  validateTemplate,
  type BeatTemplate,
  type ProjectTemplate,
  type TemplateId,
} from './templates';
import {
  BASELINE_EPISODE_DURATION_SEC,
  BEAT_COUNT,
  BEAT_DEFS,
  EPISODE_DURATION_RANGE_SEC,
  MAX_BEAT_DURATION_SEC,
  validateBeatList,
} from './beats';
import { TRANSITION_RULES } from './transitions';
import { assemblePrompt, buildGenerateRequest } from './prompt';
import { episodeDuration, isProjectReady, validateProject } from './projects';

/** METH-003 §8 的原文写法，含封闭枚举里没有的复合 / 否定说法。 */
const TRANSITION_WORDS: readonly string[] = [
  ...TRANSITION_RULES,
  'BGM 升调',
  'BGM升调',
  '卡点硬切',
  '纯硬切',
  '音频预接',
  '螺口顺滑',
  '黑屏截断',
  '无转场',
  '转场',
];

describe('模板目录', () => {
  it('内置一套模板，标识为 banquet-hook', () => {
    expect(TEMPLATE_IDS).toEqual(['banquet-hook']);
    expect(DEFAULT_TEMPLATE_ID).toBe('banquet-hook');
    expect(PROJECT_TEMPLATES).toHaveLength(1);
    expect(BANQUET_HOOK_TEMPLATE.id).toBe('banquet-hook');
    expect(BANQUET_HOOK_TEMPLATE.canon_source).toBe('METH-003 §1 / §3–§8');
  });

  it('目录与模板在运行时被冻结，不能私自扩表或改文案', () => {
    expect(Object.isFrozen(PROJECT_TEMPLATES)).toBe(true);
    expect(Object.isFrozen(BANQUET_HOOK_TEMPLATE)).toBe(true);
    expect(Object.isFrozen(BANQUET_HOOK_TEMPLATE.beat_list)).toBe(true);
    BANQUET_HOOK_TEMPLATE.beat_list.forEach((beat) => {
      expect(Object.isFrozen(beat)).toBe(true);
      expect(Object.isFrozen(beat.frame_texts)).toBe(true);
    });
    expect(() =>
      (PROJECT_TEMPLATES as unknown as ProjectTemplate[]).push(BANQUET_HOOK_TEMPLATE),
    ).toThrow(TypeError);
    expect(() => {
      (BANQUET_HOOK_TEMPLATE as unknown as { title: string }).title = '改名';
    }).toThrow(TypeError);
    expect(PROJECT_TEMPLATES).toHaveLength(1);
  });

  it('查询入口：命中返回模板，未命中抛 RangeError', () => {
    expect(projectTemplate('banquet-hook')).toBe(BANQUET_HOOK_TEMPLATE);
    expect(() => projectTemplate('unknown-template' as TemplateId)).toThrow(RangeError);
    expect(isTemplateId('banquet-hook')).toBe(true);
    ['', 'banquet', 'BANQUET-HOOK', null, undefined, 0, {}].forEach((value) => {
      expect(isTemplateId(value)).toBe(false);
    });
  });

  it('beatTemplate 取到对应板，越界抛 RangeError', () => {
    expect(beatTemplate('banquet-hook', 1).g_index).toBe('G1');
    expect(beatTemplate('banquet-hook', 5).g_index).toBe('G5');
    expect(() => beatTemplate('banquet-hook', 6 as BeatTemplate['index'])).toThrow(RangeError);
  });

  it('项目级默认值齐备（建项目的强制字段一个不缺）', () => {
    expect(BANQUET_HOOK_TEMPLATE.project_name).toBe('婚宴钻戒反转');
    expect(BANQUET_HOOK_TEMPLATE.genre).toBe('都市·复仇');
    expect(BANQUET_HOOK_TEMPLATE.aspect_ratio).toBe('9:16');
    expect(BANQUET_HOOK_TEMPLATE.style_prompt).toBe('冷调高对比，胶片颗粒质感，强逆光');
    expect(BANQUET_HOOK_TEMPLATE.protagonist).toBe('长发女主，米白抹胸礼服，左颊有疤');
    expect(BANQUET_HOOK_TEMPLATE.summary.trim()).not.toBe('');
  });
});

describe('88s 窗口', () => {
  it('五板时长之和恒为 88s，且等于模板声明的整集时长', () => {
    const durations = BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.duration_sec);
    expect(durations).toEqual([8, 17, 20, 25, 18]);
    expect(durations.reduce((sum, value) => sum + value, 0)).toBe(88);
    expect(BANQUET_HOOK_TEMPLATE.total_duration_sec).toBe(88);
    expect(BANQUET_HOOK_TEMPLATE.total_duration_sec).toBe(BASELINE_EPISODE_DURATION_SEC);
  });

  it('时间位首尾相接铺满 0–88，无缝无叠', () => {
    expect(
      BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => [beat.time_start, beat.time_end]),
    ).toEqual([
      [0, 8],
      [8, 25],
      [25, 45],
      [45, 70],
      [70, 88],
    ]);
    BANQUET_HOOK_TEMPLATE.beat_list.forEach((beat, i) => {
      expect(beat.duration_sec).toBe(beat.time_end - beat.time_start);
      const previous = BANQUET_HOOK_TEMPLATE.beat_list[i - 1];
      if (previous !== undefined) {
        expect(beat.time_start).toBe(previous.time_end);
      }
    });
    expect(BANQUET_HOOK_TEMPLATE.beat_list[0]?.time_start).toBe(0);
    expect(BANQUET_HOOK_TEMPLATE.beat_list[BEAT_COUNT - 1]?.time_end).toBe(88);
  });

  it('88s 落在整集 70–90s 区间内，且最长单板不超 30s 上限', () => {
    expect(BANQUET_HOOK_TEMPLATE.total_duration_sec).toBeGreaterThanOrEqual(
      EPISODE_DURATION_RANGE_SEC.min,
    );
    expect(BANQUET_HOOK_TEMPLATE.total_duration_sec).toBeLessThanOrEqual(
      EPISODE_DURATION_RANGE_SEC.max,
    );
    const longest = Math.max(
      ...BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.duration_sec),
    );
    expect(longest).toBe(25);
    expect(longest).toBeLessThanOrEqual(MAX_BEAT_DURATION_SEC);
  });

  it('套用后的项目整集时长同样是 88s', () => {
    const project = createProjectFromTemplate('banquet-hook');
    expect(project.total_duration_sec).toBe(88);
    expect(episodeDuration(project)).toBe(88);
  });
});

describe('宫格数 3,3,3,3,2', () => {
  it('模板声明的宫格数与板序锁一致', () => {
    expect(BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.frame_count)).toEqual([
      3, 3, 3, 3, 2,
    ]);
  });

  it('每板的帧描述条数等于宫格数，共 14 条且无空文案', () => {
    expect(BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.frame_texts.length)).toEqual([
      3, 3, 3, 3, 2,
    ]);
    BANQUET_HOOK_TEMPLATE.beat_list.forEach((beat) => {
      expect(beat.frame_texts).toHaveLength(beat.frame_count);
      beat.frame_texts.forEach((text) => {
        expect(text.trim()).not.toBe('');
      });
    });
    const total = BANQUET_HOOK_TEMPLATE.beat_list.reduce(
      (sum, beat) => sum + beat.frame_texts.length,
      0,
    );
    expect(total).toBe(14);
  });

  it('套用后的项目宫格数仍是 3,3,3,3,2，且第五板只有 2 格', () => {
    const project = createProjectFromTemplate('banquet-hook');
    expect(project.beat_list.map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
    expect(project.beat_list.map((beat) => beat.frames.length)).toEqual([3, 3, 3, 3, 2]);
    expect(project.beat_list[4]?.frames).toHaveLength(2);
  });

  it('模板不能绕过宫格锁：多给一条帧描述会被自检拦下', () => {
    const tampered = tamperBeat(4, (beat) => ({
      ...beat,
      frame_texts: [...beat.frame_texts, '第 3 格'],
    }));
    expect(validateTemplate(tampered).map((item) => item.code)).toContain(
      'TEMPLATE_FRAME_TEXT_COUNT_MISMATCH',
    );
    expect(() => assertTemplateValid(tampered)).toThrow(/应有 2 条帧描述/);
  });
});

describe('模板骨架不得偏离 BEAT_DEFS', () => {
  it('五板的骨架字段逐项等于 BEAT_DEFS', () => {
    expect(BANQUET_HOOK_TEMPLATE.beat_list).toHaveLength(BEAT_COUNT);
    BANQUET_HOOK_TEMPLATE.beat_list.forEach((beat, i) => {
      const def = BEAT_DEFS[i];
      expect(def).toBeDefined();
      expect(beat.index).toBe(def?.index);
      expect(beat.beat_type).toBe(def?.beat_type);
      expect(beat.g_index).toBe(def?.g_index);
      expect(beat.name).toBe(def?.name);
      expect(beat.time_start).toBe(def?.time_start);
      expect(beat.time_end).toBe(def?.time_end);
      expect(beat.duration_sec).toBe(def?.duration_sec);
      expect(beat.frame_count).toBe(def?.frame_count);
      expect(beat.transition_rule).toBe(def?.transition_rule);
    });
  });

  it('节拍语义与镜头组按 METH-002 §2 硬锁', () => {
    expect(BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.beat_type)).toEqual([
      'BEAT_HOOK',
      'BEAT_CONFLICT',
      'BEAT_ESCALATION',
      'BEAT_CHARGEUP',
      'BEAT_CLIFFHANGER',
    ]);
    expect(BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.g_index)).toEqual([
      'G1',
      'G2',
      'G3',
      'G4',
      'G5',
    ]);
    expect(BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.name)).toEqual([
      '开篇钩子',
      '矛盾建立',
      '打压升级',
      '反转蓄力',
      '断集留客',
    ]);
  });

  it('内置模板自检为空；骨架被改坏时自检报 TEMPLATE_SKELETON_MISMATCH', () => {
    expect(validateTemplate(BANQUET_HOOK_TEMPLATE)).toEqual([]);
    expect(() => assertTemplateValid(BANQUET_HOOK_TEMPLATE)).not.toThrow();

    const tampered = tamperBeat(0, (beat) => ({ ...beat, duration_sec: 12, time_end: 12 }));
    const codes = validateTemplate(tampered).map((item) => item.code);
    expect(codes).toContain('TEMPLATE_SKELETON_MISMATCH');
    expect(codes).toContain('TEMPLATE_TOTAL_DURATION_MISMATCH');
    expect(() => assertTemplateValid(tampered)).toThrow(/骨架由 BEAT_DEFS 决定/);
  });

  it('自检覆盖空文案与超时长', () => {
    expect(
      validateTemplate(tamperBeat(0, (beat) => ({ ...beat, emotion: '  ' }))).map(
        (item) => item.code,
      ),
    ).toContain('TEMPLATE_SLOT_EMPTY');
    expect(
      validateTemplate(tamperBeat(0, (beat) => ({ ...beat, frame_texts: ['', 'b', 'c'] }))).map(
        (item) => item.code,
      ),
    ).toContain('TEMPLATE_FRAME_TEXT_EMPTY');
    expect(
      validateTemplate({
        ...BANQUET_HOOK_TEMPLATE,
        beat_list: BANQUET_HOOK_TEMPLATE.beat_list.slice(0, 4),
      }).map((item) => item.code),
    ).toContain('TEMPLATE_BEAT_COUNT_NOT_5');
  });
});

describe('组间衔接：模板记录原文写法，落枚举取标准词', () => {
  it('五个衔接点按 METH-003 §8 取值', () => {
    expect(BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.transition_rule)).toEqual([
      '音频预接',
      '卡点硬切',
      '纯硬切',
      'BGM升调截断',
      '黑屏断钩子',
    ]);
  });

  it('原文写法一并留痕，复合 / 否定说法的有损映射可查', () => {
    expect(BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.transition_label)).toEqual([
      '音频预接',
      '卡点硬切',
      '纯硬切',
      '卡点硬切 + BGM 升调',
      '无转场，黑屏截断',
    ]);
    const composite = beatTemplate('banquet-hook', 4);
    expect(composite.transition_label).not.toBe(composite.transition_rule);
    expect(composite.transition_rule).toBe('BGM升调截断');
    const cliffhanger = beatTemplate('banquet-hook', 5);
    expect(cliffhanger.transition_label).not.toBe(cliffhanger.transition_rule);
    expect(cliffhanger.transition_rule).toBe('黑屏断钩子');
  });

  it('每个衔接取值都在封闭目录内', () => {
    BANQUET_HOOK_TEMPLATE.beat_list.forEach((beat) => {
      expect(TRANSITION_RULES).toContain(beat.transition_rule);
    });
  });
});

describe('Prompt 不含衔接', () => {
  it('五板 Prompt 全文都不含任何衔接词（含 METH-003 原文写法）', () => {
    const project = createProjectFromTemplate('banquet-hook');
    project.beat_list.forEach((beat) => {
      const prompt = assemblePrompt(project, beat);
      expect(prompt.trim()).not.toBe('');
      TRANSITION_WORDS.forEach((word) => {
        expect(prompt).not.toContain(word);
      });
    });
  });

  it('生成请求体的 JSON 里也没有衔接词，也没有承载衔接的字段', () => {
    const project = createProjectFromTemplate('banquet-hook');
    project.beat_list.forEach((beat) => {
      const request = buildGenerateRequest(project, beat);
      const json = JSON.stringify(request);
      TRANSITION_WORDS.forEach((word) => {
        expect(json).not.toContain(word);
      });
      expect(Object.keys(request).sort()).toEqual(['beat_index', 'params', 'prompt']);
      expect(Object.keys(request.params).sort()).toEqual([
        'aspect_ratio',
        'duration_sec',
        'frame_count',
        'g_index',
      ]);
    });
  });

  it('节拍名称与备注同样不进 Prompt', () => {
    const project = createProjectFromTemplate('banquet-hook');
    project.beat_list.forEach((beat) => {
      beat.note = '这条备注只给编剧看：钻戒是女主母亲的遗物';
      const prompt = assemblePrompt(project, beat);
      expect(prompt).not.toContain(beat.title);
      expect(prompt).not.toContain(beat.note);
    });
  });

  it('模板预览走同一条组装路径，同样不含衔接词', () => {
    const previews = templatePromptPreview('banquet-hook');
    expect(previews).toHaveLength(BEAT_COUNT);
    previews.forEach((prompt) => {
      TRANSITION_WORDS.forEach((word) => {
        expect(prompt).not.toContain(word);
      });
    });
  });
});

describe('createProjectFromTemplate', () => {
  it('建出的项目五板齐备、就绪、且通过结构校验', () => {
    const project = createProjectFromTemplate('banquet-hook', {
      id: 'prj_template_banquet',
      now: '2026-08-27T00:00:00.000Z',
    });
    expect(project.id).toBe('prj_template_banquet');
    expect(project.updated_at).toBe('2026-08-27T00:00:00.000Z');
    expect(project.name).toBe('婚宴钻戒反转');
    expect(project.beat_list).toHaveLength(BEAT_COUNT);
    expect(project.beat_list.map((beat) => beat.status)).toEqual([
      'filled',
      'filled',
      'filled',
      'filled',
      'filled',
    ]);
    expect(isProjectReady(project)).toBe(true);
    expect(validateProject(project)).toEqual([]);
    expect(validateBeatList(project.beat_list)).toEqual([]);
  });

  it('默认取默认模板，也可覆盖项目名', () => {
    expect(createProjectFromTemplate().name).toBe('婚宴钻戒反转');
    expect(createProjectFromTemplate('banquet-hook', { name: '第二集' }).name).toBe('第二集');
  });

  it('槽位逐字落到对应的板与格上', () => {
    const project = createProjectFromTemplate('banquet-hook');
    project.beat_list.forEach((beat, i) => {
      const content = BANQUET_HOOK_TEMPLATE.beat_list[i];
      expect(content).toBeDefined();
      expect(beat.emotion).toBe(content?.emotion);
      expect(beat.camera_rhythm).toBe(content?.camera_rhythm);
      expect(beat.plot_core).toBe(content?.plot_core);
      expect(beat.transition_rule).toBe(content?.transition_rule);
      expect(beat.frames.map((frame) => frame.text)).toEqual(content?.frame_texts);
      expect(beat.frames.map((frame) => frame.order)).toEqual(
        content?.frame_texts.map((_, at) => at + 1),
      );
    });
  });

  it('第一板保留 canon 帧语义 impact / reaction / env', () => {
    const project = createProjectFromTemplate('banquet-hook');
    expect(project.beat_list[0]?.frames.map((frame) => frame.semantic)).toEqual([
      'impact',
      'reaction',
      'env',
    ]);
    expect(project.beat_list[4]?.frames.map((frame) => frame.semantic)).toEqual([null, null]);
  });

  it('结构照旧锁死：套用模板不是解锁通道', () => {
    const project = createProjectFromTemplate('banquet-hook');
    expect(Object.isFrozen(project.beat_list)).toBe(true);
    expect(() => {
      (project as unknown as { beat_list: unknown }).beat_list = [];
    }).toThrow(TypeError);
    expect(() => {
      (project.beat_list[0] as unknown as { frame_count: number }).frame_count = 2;
    }).toThrow(TypeError);
    expect(project.beat_list).toHaveLength(BEAT_COUNT);
  });

  it('每次调用返回全新项目，改动互不串味', () => {
    const first = createProjectFromTemplate('banquet-hook');
    const second = createProjectFromTemplate('banquet-hook');
    expect(first).not.toBe(second);
    const frame = first.beat_list[0]?.frames[0];
    expect(frame).toBeDefined();
    if (frame === undefined) {
      return;
    }
    frame.text = '改写后的第一格';
    expect(second.beat_list[0]?.frames[0]?.text).toBe(
      '婚宴主桌前，一枚钻戒被狠狠砸在地上，红酒杯翻倒',
    );
    expect(BANQUET_HOOK_TEMPLATE.beat_list[0]?.frame_texts[0]).toBe(
      '婚宴主桌前，一枚钻戒被狠狠砸在地上，红酒杯翻倒',
    );
  });

  it('未知模板标识抛 RangeError', () => {
    expect(() => createProjectFromTemplate('nope' as TemplateId)).toThrow(RangeError);
  });
});

describe('模板文案【GOLDEN】', () => {
  it('五板情绪逐字固定', () => {
    expect(BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.emotion)).toEqual([
      '骤然炸裂的震惊，压迫感在三秒内拉满',
      '冷静下的暗涌，敌意逐步显形',
      '层层加码的窒息与孤立，情绪压到底部',
      '由沉到燃，压抑转为锋利，气势逐步上扬',
      '压抑后的锐利反打，情绪停在最高点不释放',
    ]);
  });

  it('五板镜头节奏逐字固定', () => {
    expect(BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.camera_rhythm)).toEqual([
      '极快切入，冲击—反应—环境三段递进，节奏不留缓冲',
      '中速推进，人物关系逐层交代，压迫感稳步累积',
      '快切递进，压迫逐级加重，节奏一路收紧不回落',
      '先慢后紧，蓄势推进，尾段节奏骤然收束到临界点',
      '两段收束，节奏在最强处直接掐断，不做收尾缓冲',
    ]);
  });

  it('五板剧情核心逐字固定', () => {
    expect(BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => beat.plot_core)).toEqual([
      '婚礼现场戒指被当众砸在地上，女主身份瞬间坍塌',
      '继妹与新郎联手，用家族股权协议逼女主让位，敌对关系确立',
      '继承权被当众剥夺、亲友倒戈，女主被逐出宴厅',
      '女主握到钻戒原主证明与录音，重返宴厅，反转前势能拉满',
      '女主当众亮出钻戒原主证明，全场僵住，悬念留到下一集',
    ]);
  });

  it('14 条帧描述逐字固定，帧序左 → 右', () => {
    expect(BANQUET_HOOK_TEMPLATE.beat_list.map((beat) => [...beat.frame_texts])).toEqual([
      [
        '婚宴主桌前，一枚钻戒被狠狠砸在地上，红酒杯翻倒',
        '女主瞳孔骤缩、笑意冻在脸上，指尖攥紧裙摆',
        '全场宾客围观哗然，长辈起身，主位空着一把椅子',
      ],
      [
        '对立方登场：继妹挽着新郎手臂走到台前，笑容得体',
        '利害揭明：家族股权协议摊开，签名处只留一个空格',
        '立场对峙：女主与继妹隔着长桌对视，宾客分成两侧',
      ],
      [
        '第一层打压：当众宣布撤销女主继承资格，文件被撕开',
        '第二层打压：亲友倒戈，母亲被扶离现场，无人替她说话',
        '压力见顶：女主被推出宴厅，礼服裙角踩脏，门在背后合上',
      ],
      [
        '转机浮现：雨中长廊，女主接到一通匿名来电，抬眼',
        '势能积累：母亲遗物钻戒的原主证明与录音在手，指尖收紧',
        '临界点：宴厅大门重新推开，全场目光回转，她站在门口',
      ],
      [
        '抛出悬念：她把原件推到主桌中央，只说一句「再念一次」',
        '最高势能处切断：所有人表情僵住，画面停在她抬起的眼神上',
      ],
    ]);
  });

  it('第一板的 Prompt 全文与既有黄金用例同源同字', () => {
    const project = createProjectFromTemplate('banquet-hook');
    const first = project.beat_list[0];
    expect(first).toBeDefined();
    if (first === undefined) {
      return;
    }
    expect(assemblePrompt(project, first)).toBe(
      '漫剧厚涂画风，高清8K，人物五官稳定无漂移，' +
        '冷调高对比，胶片颗粒质感，强逆光，' +
        '长发女主，米白抹胸礼服，左颊有疤，' +
        '画幅9:16，' +
        '骤然炸裂的震惊，压迫感在三秒内拉满，' +
        '时长8秒，' +
        '极快切入，冲击—反应—环境三段递进，节奏不留缓冲，' +
        '婚礼现场戒指被当众砸在地上，女主身份瞬间坍塌，' +
        '婚宴主桌前，一枚钻戒被狠狠砸在地上，红酒杯翻倒' +
        ' → 女主瞳孔骤缩、笑意冻在脸上，指尖攥紧裙摆' +
        ' → 全场宾客围观哗然，长辈起身，主位空着一把椅子。',
    );
  });

  it('第五板只有两格，Prompt 的帧段只连两条', () => {
    const project = createProjectFromTemplate('banquet-hook');
    const fifth = project.beat_list[4];
    expect(fifth).toBeDefined();
    if (fifth === undefined) {
      return;
    }
    expect(assemblePrompt(project, fifth)).toBe(
      '漫剧厚涂画风，高清8K，人物五官稳定无漂移，' +
        '冷调高对比，胶片颗粒质感，强逆光，' +
        '长发女主，米白抹胸礼服，左颊有疤，' +
        '画幅9:16，' +
        '压抑后的锐利反打，情绪停在最高点不释放，' +
        '时长18秒，' +
        '两段收束，节奏在最强处直接掐断，不做收尾缓冲，' +
        '女主当众亮出钻戒原主证明，全场僵住，悬念留到下一集，' +
        '抛出悬念：她把原件推到主桌中央，只说一句「再念一次」' +
        ' → 最高势能处切断：所有人表情僵住，画面停在她抬起的眼神上。',
    );
  });
});

/** 造一个只改动某一板的模板副本，用于反向断言自检确实会报警。 */
function tamperBeat(
  at: number,
  patch: (beat: BeatTemplate) => BeatTemplate,
): ProjectTemplate {
  return {
    ...BANQUET_HOOK_TEMPLATE,
    beat_list: BANQUET_HOOK_TEMPLATE.beat_list.map((beat, i) =>
      i === at ? patch(beat) : beat,
    ),
  };
}
