/**
 * 黄金回归用例（FR-3-08 / AC-6.4）。
 *
 * 法源：`METH-003 §3` 的 Beat 1 样例（婚宴 · 戒指砸地）与 §2 的组装公式。
 * 这里把「输入 → 期望 Prompt 全文」写死成常量：**期望值是手写字面量，不由组装器反推**，
 * 组装公式、槽位顺序、分隔符、固定前缀任一被改动，golden 测试立即变红。
 *
 * 组间衔接 / 节拍名称 / 备注三个字段在本用例里都填了真实值，
 * 用来证明它们**不进入** Prompt——见 `domain/prompt.golden.test.ts`。
 */

import { beatAt, createProject, type Project } from '../domain/projects';
import type { Beat } from '../domain/beats';

/** Beat 1 样例的输入槽位（METH-003 §3.1–§3.3 的示例列）。 */
export const BEAT1_SAMPLE = Object.freeze({
  project: Object.freeze({
    id: 'prj_golden_beat1',
    name: '婚宴反转',
    genre: '都市·复仇',
    aspect_ratio: '9:16',
    style_prompt: '冷调高对比，胶片颗粒质感，强逆光',
    protagonist: '长发女主，米白抹胸礼服，左颊有疤',
    now: '2026-08-27T00:00:00.000Z',
  }),
  beat: Object.freeze({
    /** ○ 不进 Prompt。 */
    title: '开篇钩子',
    /** ● 进 Prompt。 */
    emotion: '骤然炸裂的震惊，压迫感在三秒内拉满',
    camera_rhythm: '极快切入，冲击—反应—环境三段递进，节奏不留缓冲',
    plot_core: '婚礼现场戒指被当众砸在地上，女主身份瞬间坍塌',
    /** ● 进 Prompt，左 → 右：冲击 / 反应 / 环境。 */
    frames: Object.freeze([
      '婚宴主桌前，一枚钻戒被狠狠砸在地上，红酒杯翻倒',
      '女主瞳孔骤缩、笑意冻在脸上，指尖攥紧裙摆',
      '全场宾客围观哗然，长辈起身，主位空着一把椅子',
    ]),
    /** ○ 绝不进 Prompt，也不进生成请求体。 */
    transition_rule: '音频预接',
    /** ○ 不进 Prompt。 */
    note: '这条备注只给编剧看：戒指是女主母亲的遗物，第四板要回收',
  }),
} as const);

/**
 * Beat 1 的期望 Prompt 全文【GOLDEN】。
 *
 * 固定前缀 + 全局画风 + 主角形象 + 画幅 + 本段情绪 + 时长 + 镜头节奏 + 剧情核心 + 节拍帧（左 → 右）。
 */
export const BEAT1_GOLDEN_PROMPT =
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
  ' → 全场宾客围观哗然，长辈起身，主位空着一把椅子。';

/** 期望的槽位顺序【GOLDEN】，顺序即组装公式。 */
export const BEAT1_GOLDEN_SLOTS: readonly string[] = Object.freeze([
  '固定前缀',
  '全局画风风格词',
  '主角形象描述',
  '画幅指令',
  '本段情绪',
  '时长',
  '镜头节奏',
  '剧情核心',
  '节拍帧',
]);

/**
 * 建出 Beat 1 样例：项目 + 已填满的第一块板。
 * 每次调用返回全新对象，用例之间互不污染。
 */
export function createBeat1Sample(): { project: Project; beat: Beat } {
  const { project: p, beat: b } = BEAT1_SAMPLE;
  const project = createProject(
    {
      name: p.name,
      genre: p.genre,
      aspect_ratio: p.aspect_ratio,
      style_prompt: p.style_prompt,
      protagonist: p.protagonist,
    },
    { id: p.id, now: p.now },
  );

  const beat = beatAt(project, 1);
  beat.title = b.title;
  beat.emotion = b.emotion;
  beat.camera_rhythm = b.camera_rhythm;
  beat.plot_core = b.plot_core;
  beat.transition_rule = b.transition_rule;
  beat.note = b.note;
  beat.frames.forEach((frame, i) => {
    frame.text = b.frames[i] ?? '';
  });
  beat.status = 'filled';

  return { project, beat };
}

/** 把整集五块板都填满（各板复用 Beat 1 的槽位文案，仅剧情核心带板序）。 */
export function createFilledEpisode(): Project {
  const { project } = createBeat1Sample();
  project.beat_list.forEach((beat) => {
    if (beat.index === 1) {
      return;
    }
    beat.emotion = BEAT1_SAMPLE.beat.emotion;
    beat.camera_rhythm = BEAT1_SAMPLE.beat.camera_rhythm;
    beat.plot_core = `第${beat.index}板剧情核心：${BEAT1_SAMPLE.beat.plot_core}`;
    beat.note = BEAT1_SAMPLE.beat.note;
    beat.frames.forEach((frame, i) => {
      frame.text = BEAT1_SAMPLE.beat.frames[i] ?? BEAT1_SAMPLE.beat.frames[0] ?? '';
    });
    beat.status = 'filled';
  });
  return project;
}
