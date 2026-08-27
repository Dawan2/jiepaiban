/**
 * 飞书文档载荷（W4/FEISHU-EXPORT）。
 *
 * 三条主张：
 * 1. 集名在最前，段数恒 5、段序恒为节拍序；
 * 2. 每段都有情绪 / 时间位 / 节拍帧正文 / Prompt 全文 / 组间衔接（标注后期合成）；
 * 3. 各段 `prompt_final` 与组装器逐字一致，且不含衔接 / 名称 / 备注（AC-6.4）。
 */

import { describe, expect, it } from 'vitest';
import { BEAT_COUNT, type BeatIndex } from '../domain/beats';
import { assemblePrompt, findExcludedFieldLeaks } from '../domain/prompt';
import { beatAt } from '../domain/projects';
import { TRANSITION_RULES, TRANSITION_STAGE } from '../domain/transitions';
import { buildSegmentCards } from '../export/segments';
import {
  createGeneratedEpisode,
  storedPromptSnapshot,
  withStoredGeneration,
} from '../export/fixtures';
import { createFilledEpisode } from '../testing/goldens';
import {
  buildFeishuDoc,
  FEISHU_DOC_SCHEMA_VERSION,
  FEISHU_EMPTY,
  FRAME_ARROW,
  frameSemanticLabel,
} from './feishuDoc';

const NOW = '2026-08-27T10:00:00.000Z';

async function docWithCards(generated?: readonly BeatIndex[]) {
  const fixture = await createGeneratedEpisode(generated === undefined ? {} : { generated });
  const cards = buildSegmentCards(fixture.project, fixture.controller.snapshot());
  return { ...fixture, cards, doc: buildFeishuDoc(fixture.project, { now: NOW, cards }) };
}

describe('集名与项目级字段', () => {
  it('集名即项目名，一级标题带集名', () => {
    const doc = buildFeishuDoc(createFilledEpisode(), { now: NOW });

    expect(doc.schema_version).toBe(FEISHU_DOC_SCHEMA_VERSION);
    expect(doc.generated_at).toBe(NOW);
    expect(doc.episode_title).toBe('婚宴反转');
    expect(doc.doc_title).toBe('婚宴反转 · 节拍板导出');
    expect(doc.project.genre).toBe('都市·复仇');
    expect(doc.project.aspect_ratio).toBe('9:16');
    expect(doc.project.beat_count).toBe(BEAT_COUNT);
    expect(doc.project.beat_duration_sum_sec).toBe(88);
    expect(doc.project.style_prompt).not.toBe(FEISHU_EMPTY);
    expect(doc.project.protagonist).not.toBe(FEISHU_EMPTY);
  });

  it('空项目名回落到破折号，不产出空标题', () => {
    const project = createFilledEpisode();
    project.name = '   ';
    const doc = buildFeishuDoc(project, { now: NOW });

    expect(doc.episode_title).toBe(FEISHU_EMPTY);
    expect(doc.doc_title).toBe(`${FEISHU_EMPTY} · 节拍板导出`);
  });

  it('载荷与各段都被冻结，改不动', () => {
    const doc = buildFeishuDoc(createFilledEpisode(), { now: NOW });

    expect(() => {
      (doc.beats as unknown as unknown[]).reverse();
    }).toThrow(TypeError);
    expect(Object.isFrozen(doc)).toBe(true);
    expect(doc.beats.every((beat) => Object.isFrozen(beat))).toBe(true);
  });
});

describe('恒 5 段，段序恒为节拍序', () => {
  it('段数恒 5，index 与宫格数按板序', () => {
    const doc = buildFeishuDoc(createFilledEpisode(), { now: NOW });

    expect(doc.beats).toHaveLength(BEAT_COUNT);
    expect(doc.beats.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
    expect(doc.beats.map((beat) => beat.g_index)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5']);
    expect(doc.beats.map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
    expect(doc.beats.map((beat) => beat.frames.length)).toEqual([3, 3, 3, 3, 2]);
  });

  it('段状态数组倒序也不影响段序', async () => {
    const { project, cards } = await docWithCards();
    const doc = buildFeishuDoc(project, { now: NOW, cards: [...cards].reverse() });

    expect(doc.beats.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
    expect(doc.beats.map((beat) => beat.beat_name)).toEqual([
      '开篇钩子',
      '矛盾建立',
      '打压升级',
      '反转蓄力',
      '断集留客',
    ]);
  });

  it('段状态缺项时该段状态留破折号，段数不少', async () => {
    const { project, cards } = await docWithCards();
    const doc = buildFeishuDoc(project, { now: NOW, cards: cards.filter((c) => c.beat_index !== 3) });

    expect(doc.beats).toHaveLength(BEAT_COUNT);
    expect(doc.beats[2]?.status_label).toBe(FEISHU_EMPTY);
    expect(doc.beats[2]?.video_url).toBeNull();
  });
});

describe('每段的字段：情绪 / 时间位 / 节拍帧 / Prompt 全文', () => {
  it('情绪与时间位逐段齐备，时间位取 canon 值', () => {
    const doc = buildFeishuDoc(createFilledEpisode(), { now: NOW });

    expect(doc.beats.every((beat) => beat.emotion !== FEISHU_EMPTY)).toBe(true);
    expect(doc.beats.map((beat) => beat.time_range)).toEqual([
      '0-8s',
      '8-25s',
      '25-45s',
      '45-70s',
      '70-88s',
    ]);
    expect(doc.beats.map((beat) => beat.duration_label)).toEqual([
      '8 秒',
      '17 秒',
      '20 秒',
      '25 秒',
      '18 秒',
    ]);
  });

  it('节拍帧正文按帧序左 → 右拼接，节拍 1 带 canon 语义标注', () => {
    const project = createFilledEpisode();
    const doc = buildFeishuDoc(project, { now: NOW });
    const first = doc.beats[0];

    expect(first?.frames.map((frame) => frame.order)).toEqual([1, 2, 3]);
    expect(first?.frames.map((frame) => frame.semantic)).toEqual(['impact', 'reaction', 'env']);
    expect(first?.frames.map((frame) => frame.semantic_label)).toEqual(['冲击', '反应', '环境']);
    expect(first?.frames_text).toBe(
      beatAt(project, 1)
        .frames.map((frame) => frame.text)
        .join(FRAME_ARROW),
    );
    expect(first?.frames_label_text.startsWith('冲击｜')).toBe(true);
    expect(doc.beats[1]?.frames.every((frame) => frame.semantic_label === '')).toBe(true);
    expect(doc.beats[1]?.frames_label_text).toBe(doc.beats[1]?.frames_text);
  });

  it('帧语义标注只有冲击 / 反应 / 环境三种，无语义为空串', () => {
    expect(frameSemanticLabel('impact')).toBe('冲击');
    expect(frameSemanticLabel('reaction')).toBe('反应');
    expect(frameSemanticLabel('env')).toBe('环境');
    expect(frameSemanticLabel(null)).toBe('');
  });

  it('各段 Prompt 全文与组装器逐字一致（R5 所见即所发）', () => {
    const project = createFilledEpisode();
    const doc = buildFeishuDoc(project, { now: NOW });

    doc.beats.forEach((beat) => {
      expect(beat.prompt_final).toBe(assemblePrompt(project, beatAt(project, beat.index)));
    });
  });

  it('各段 Prompt 全文不含衔接 / 名称 / 备注（AC-6.4）', () => {
    const project = createFilledEpisode();
    const doc = buildFeishuDoc(project, { now: NOW });

    doc.beats.forEach((section) => {
      const beat = beatAt(project, section.index);
      expect(findExcludedFieldLeaks(beat, section.prompt_final)).toEqual([]);
      TRANSITION_RULES.forEach((rule) => {
        expect(section.prompt_final).not.toContain(rule);
      });
      expect(section.prompt_final).not.toContain(TRANSITION_STAGE);
    });
  });
});

describe('组间衔接：恒 5 条，逐条标注后期合成', () => {
  it('五条衔接按板序，末拍指向下一集', () => {
    const doc = buildFeishuDoc(createFilledEpisode(), { now: NOW });

    expect(doc.transitions).toHaveLength(BEAT_COUNT);
    expect(doc.transitions.map((item) => item.rule)).toEqual([
      '音频预接',
      '卡点硬切',
      '纯硬切',
      'BGM升调截断',
      '黑屏断钩子',
    ]);
    expect(doc.transitions.map((item) => item.point_label)).toEqual([
      '节拍1 → 节拍2',
      '节拍2 → 节拍3',
      '节拍3 → 节拍4',
      '节拍4 → 节拍5',
      '节拍5 → 下一集',
    ]);
    expect(doc.transitions[4]?.is_episode_tail).toBe(true);
  });

  it('每条衔接的生效阶段恒为后期合成，且与段上的衔接同源', () => {
    const doc = buildFeishuDoc(createFilledEpisode(), { now: NOW });

    expect(doc.transition_stage).toBe(TRANSITION_STAGE);
    expect(doc.transitions.every((item) => item.stage === TRANSITION_STAGE)).toBe(true);
    doc.beats.forEach((beat, at) => {
      expect(beat.transition).toBe(doc.transitions[at]);
      expect(beat.transition.stage).toBe(TRANSITION_STAGE);
    });
  });

  it('改了衔接取值，文档跟着变，Prompt 不变', () => {
    const project = createFilledEpisode();
    const before = buildFeishuDoc(project, { now: NOW });
    beatAt(project, 3).transition_rule = '螺口顺滑过渡';
    const after = buildFeishuDoc(project, { now: NOW });

    expect(after.transitions[2]?.rule).toBe('螺口顺滑过渡');
    expect(after.transitions[2]?.code).toBe('SCREW_SMOOTH');
    expect(after.beats[2]?.prompt_final).toBe(before.beats[2]?.prompt_final);
    expect(after.beats[2]?.prompt_final).not.toContain('螺口顺滑过渡');
  });
});

describe('成片交付状态（可选一节）', () => {
  it('不给段状态时为 null，编辑阶段也能导文档', () => {
    const doc = buildFeishuDoc(createFilledEpisode(), { now: NOW });

    expect(doc.delivery).toBeNull();
    expect(doc.beats.every((beat) => beat.status_label === FEISHU_EMPTY)).toBe(true);
  });

  it('五段齐备时点清 5/5，并带成片地址', async () => {
    const { doc } = await docWithCards();

    expect(doc.delivery?.is_complete).toBe(true);
    expect(doc.delivery?.ready_count).toBe(BEAT_COUNT);
    expect(doc.delivery?.missing_indexes).toEqual([]);
    expect(doc.delivery?.summary).toBe(`已齐 ${BEAT_COUNT}/${BEAT_COUNT} 段`);
    expect(doc.beats.every((beat) => beat.video_url?.startsWith('stub://') === true)).toBe(true);
  });

  it('缺片时点名缺哪几段', async () => {
    const { doc } = await docWithCards([1, 2, 3]);

    expect(doc.delivery?.is_complete).toBe(false);
    expect(doc.delivery?.ready_count).toBe(3);
    expect(doc.delivery?.missing_indexes).toEqual([4, 5]);
    expect(doc.delivery?.summary).toContain('节拍4、节拍5');
    expect(doc.beats.filter((beat) => beat.video_url === null).map((beat) => beat.index)).toEqual([
      4, 5,
    ]);
  });
});

describe('落库态与 Prompt 快照（W8）', () => {
  it('段状态取自落库的成片时，交付一节照旧点清 5/5', async () => {
    const fixture = await createGeneratedEpisode({ generated: [] });
    withStoredGeneration(fixture.project);
    const cards = buildSegmentCards(fixture.project, fixture.controller.snapshot());

    const doc = buildFeishuDoc(fixture.project, { now: NOW, cards });

    expect(doc.delivery?.is_complete).toBe(true);
    expect(doc.delivery?.ready_count).toBe(BEAT_COUNT);
    expect(
      doc.beats.every((beat) => beat.video_url?.startsWith('https://cdn.example.com/') === true),
    ).toBe(true);
  });

  it('已生成的拍给的是提交快照，不跟着事后改的文案漂移', async () => {
    const fixture = await createGeneratedEpisode({ generated: [] });
    withStoredGeneration(fixture.project, [1]);
    const snapshot = storedPromptSnapshot(fixture.project, 1);
    beatAt(fixture.project, 1).plot_core = '生成之后又改过的剧情核心';
    const cards = buildSegmentCards(fixture.project, fixture.controller.snapshot());

    const doc = buildFeishuDoc(fixture.project, { now: NOW, cards });

    expect(doc.beats[0]?.prompt_final).toBe(snapshot);
    expect(doc.beats[0]?.prompt_final).not.toContain('生成之后又改过的剧情核心');
    // 没生成过的拍仍按当前字段现算。
    expect(doc.beats[1]?.prompt_final).toBe(assemblePrompt(fixture.project, beatAt(fixture.project, 2)));
  });

  it('走快照这条路，衔接仍只在后期那一节（AC-6.4）', async () => {
    const fixture = await createGeneratedEpisode({ generated: [] });
    beatAt(fixture.project, 3).transition_rule = '螺口顺滑过渡';
    beatAt(fixture.project, 3).note = '备注哨兵';
    withStoredGeneration(fixture.project);
    const cards = buildSegmentCards(fixture.project, fixture.controller.snapshot());

    const doc = buildFeishuDoc(fixture.project, { now: NOW, cards });

    doc.beats.forEach((beat) => {
      TRANSITION_RULES.forEach((rule) => {
        expect(beat.prompt_final).not.toContain(rule);
      });
      expect(beat.prompt_final).not.toContain('备注哨兵');
      expect(findExcludedFieldLeaks(beatAt(fixture.project, beat.index), beat.prompt_final)).toEqual(
        [],
      );
    });
    // 衔接照旧成节，标注只在后期生效。
    expect(doc.transitions[2]?.rule).toBe('螺口顺滑过渡');
    expect(doc.transitions.every((item) => item.stage === TRANSITION_STAGE)).toBe(true);
  });
});
