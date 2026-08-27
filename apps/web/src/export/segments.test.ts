/**
 * 段卡视图模型（PRD 5.5.1 / AC-6.7）。
 *
 * 断言最狠的两条：
 * 1. **卡序锁**：恒 5 张、顺序恒为节拍序，状态数组被打乱 / 缺项 / 重复都改不动它；
 * 2. **衔接可见但不外传**：卡上有衔接文案，传输层收到的请求体里一个字都没有（AC-6.4）。
 */

import { describe, expect, it } from 'vitest';
import { BEAT_COUNT, BEAT_INDEXES, type BeatIndex } from '../domain/beats';
import { beatAt } from '../domain/projects';
import { PROMPT_EXCLUDED_BEAT_FIELDS } from '../domain/prompt';
import { TRANSITION_RULES, TRANSITION_STAGE } from '../domain/transitions';
import type { GenerateBoardState } from '../generate/controller';
import { createGeneratedEpisode, FIXED_GENERATED_AT_LABEL } from './fixtures';
import {
  EMPTY_TIME_LABEL,
  EPISODE_TAIL_LABEL,
  buildSegmentCards,
  buildSegmentTransition,
  formatTimestamp,
  missingSegmentIndexes,
  missingSegmentReason,
} from './segments';

describe('段卡顺序锁（PRD 5.5.1：固定 5 张，顺序 = 节拍序）', () => {
  it('恒为 5 张卡，序号严格 1 → 5', async () => {
    const { project, controller } = await createGeneratedEpisode();
    const cards = buildSegmentCards(project, controller.snapshot());

    expect(cards).toHaveLength(BEAT_COUNT);
    expect(cards.map((card) => card.beat_index)).toEqual([1, 2, 3, 4, 5]);
    expect(cards.map((card) => card.g_index)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5']);
  });

  it('状态数组被打乱也不影响卡序', async () => {
    const { project, controller } = await createGeneratedEpisode();
    const shuffled = [...controller.snapshot()].reverse();

    const cards = buildSegmentCards(project, shuffled);

    expect(cards.map((card) => card.beat_index)).toEqual([1, 2, 3, 4, 5]);
    expect(cards.every((card) => card.is_generated)).toBe(true);
  });

  it('状态数组缺项或重复，仍是 5 张卡且不错位', async () => {
    const { project, controller } = await createGeneratedEpisode();
    const states = controller.snapshot();
    const third = states[2] as GenerateBoardState;
    const patched: readonly GenerateBoardState[] = [third, third, states[0] as GenerateBoardState];

    const cards = buildSegmentCards(project, patched);

    expect(cards).toHaveLength(BEAT_COUNT);
    expect(cards.map((card) => card.beat_index)).toEqual([1, 2, 3, 4, 5]);
    expect(cards[2]?.is_generated).toBe(true);
    // 没有状态的板回落到「待生成」空白卡，而不是消失。
    expect(cards[3]?.status_label).toBe('待生成');
    expect(cards[3]?.can_download).toBe(false);
  });

  it('卡序与 `beat_list` 同源，返回的数组被冻结', async () => {
    const { project, controller } = await createGeneratedEpisode();
    const cards = buildSegmentCards(project, controller.snapshot());

    expect(Object.isFrozen(cards)).toBe(true);
    expect(() => (cards as unknown as unknown[]).reverse()).toThrow(TypeError);
    expect(cards.map((card) => card.beat_index)).toEqual([...BEAT_INDEXES]);
  });
});

describe('段卡字段（时长 / 生成完成时间 / 下载 / 重投）', () => {
  it('已生成的卡带时长、完成时间与下载文件名', async () => {
    const { project, controller } = await createGeneratedEpisode();
    const cards = buildSegmentCards(project, controller.snapshot());
    const first = cards[0];

    expect(first?.duration_sec).toBe(8);
    expect(first?.status_label).toBe('成功');
    expect(first?.generated_at_label).toBe(FIXED_GENERATED_AT_LABEL);
    expect(first?.video_url).toContain('stub://seedance-2.5/b1/');
    expect(first?.download?.file_name).toBe('婚宴反转_1_开篇钩子.mp4');
    expect(first?.can_download).toBe(true);
    expect(first?.can_regenerate).toBe(true);
    expect(first?.regenerate_label).toBe('重新生成');
  });

  it('未生成的卡：无下载、不可重投，且给出可读原因', async () => {
    const { project, controller } = await createGeneratedEpisode({ generated: [1, 2, 3] });
    const cards = buildSegmentCards(project, controller.snapshot());

    expect(cards[3]?.is_generated).toBe(false);
    expect(cards[3]?.download).toBeNull();
    expect(cards[3]?.generated_at).toBeNull();
    expect(cards[3]?.generated_at_label).toBe(EMPTY_TIME_LABEL);
    expect(cards[3]?.can_regenerate).toBe(false);
    expect(cards[3]?.regenerate_blocked_reason).toContain('先回编辑页');
  });

  it('缺片板号与提示文案（AC-6.7 的反向判据）', async () => {
    const { project, controller } = await createGeneratedEpisode({ generated: [1, 2, 3] });
    const cards = buildSegmentCards(project, controller.snapshot());

    expect(missingSegmentIndexes(cards)).toEqual([4, 5]);
    expect(missingSegmentReason(cards)).toBe('还缺 节拍4、节拍5 的成片');

    const full = await createGeneratedEpisode();
    expect(missingSegmentReason(buildSegmentCards(full.project, full.controller.snapshot()))).toBeNull();
  });

  it('时间戳固定按 UTC 展示，非法值回落占位符', () => {
    expect(formatTimestamp('2026-08-27T09:12:00.000Z')).toBe('2026-08-27 09:12:00 UTC');
    expect(formatTimestamp('不是时间')).toBe(EMPTY_TIME_LABEL);
  });
});

describe('段卡上的组间衔接（可见，仅后期合成生效）', () => {
  it('五张卡各带一条衔接，末板指向下一集', async () => {
    const { project, controller } = await createGeneratedEpisode();
    const cards = buildSegmentCards(project, controller.snapshot());

    expect(cards.map((card) => card.transition.point_label)).toEqual([
      '节拍1 → 节拍2',
      '节拍2 → 节拍3',
      '节拍3 → 节拍4',
      '节拍4 → 节拍5',
      `节拍5 → ${EPISODE_TAIL_LABEL}`,
    ]);
    expect(cards.map((card) => card.transition.rule)).toEqual([
      '音频预接',
      '卡点硬切',
      '纯硬切',
      'BGM升调截断',
      '黑屏断钩子',
    ]);
    expect(cards.every((card) => card.transition.stage === TRANSITION_STAGE)).toBe(true);
    expect(cards[4]?.transition.is_episode_tail).toBe(true);
    expect(cards[0]?.transition.is_episode_tail).toBe(false);
  });

  it('六种取值都能取到目录里的枚举码与说明', async () => {
    const { project } = await createGeneratedEpisode();
    const beat = beatAt(project, 1);

    TRANSITION_RULES.forEach((rule) => {
      beat.transition_rule = rule;
      const transition = buildSegmentTransition(beat);
      expect(transition.rule).toBe(rule);
      expect(transition.code).not.toBe('');
      expect(transition.note).not.toBe('');
      expect(transition.stage).toBe(TRANSITION_STAGE);
    });
  });

  it('衔接改成任何取值，传输层收到的请求体都不含它（AC-6.4）', async () => {
    const rules = [...TRANSITION_RULES];
    const { project, queue, submissions } = await createGeneratedEpisode({ generated: [] });

    // 逐块板换一种衔接取值，再整集提交一次。
    BEAT_INDEXES.forEach((index, at) => {
      const beat = beatAt(project, index);
      beat.transition_rule = rules[at % rules.length] ?? '纯硬切';
      beat.note = `备注哨兵${index}`;
      beat.title = `名称哨兵${index}`;
    });

    queue.enqueueEpisode(project);
    await queue.drain();

    expect(submissions).toHaveLength(BEAT_COUNT);
    submissions.forEach((submission) => {
      const body = JSON.stringify(submission);
      TRANSITION_RULES.forEach((rule) => {
        expect(body).not.toContain(rule);
      });
      expect(body).not.toContain('备注哨兵');
      expect(body).not.toContain('名称哨兵');
      PROMPT_EXCLUDED_BEAT_FIELDS.forEach((field) => {
        expect(Object.keys(submission)).not.toContain(field);
      });
    });
  });

  it('衔接可见的同时，段卡不提供任何写回生成侧的通路', async () => {
    const { project, controller } = await createGeneratedEpisode();
    const cards = buildSegmentCards(project, controller.snapshot());
    const first = cards[0];

    expect(Object.isFrozen(first)).toBe(true);
    // 段卡是只读视图模型：改它既改不动板，也进不了任何请求体。
    expect(() => {
      (first as unknown as { transition: unknown }).transition = null;
    }).toThrow(TypeError);
    expect(beatAt(project, 1 as BeatIndex).transition_rule).toBe('音频预接');
  });
});
