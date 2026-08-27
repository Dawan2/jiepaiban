/**
 * 拼接计划与衔接总表（PRD 5.5.3 / 5.5.5、FR-5-06 / AC-F5-8）。
 *
 * 计划表是 V1.1 一键拼接的输入契约，V1.0 只出表：段序锁死、时间位按板时长累加、
 * 每段带一条衔接，且衔接只往后期合成走。
 */

import { describe, expect, it } from 'vitest';
import { BEAT_COUNT, EPISODE_DURATION_RANGE_SEC } from '../domain/beats';
import { beatAt } from '../domain/projects';
import { TRANSITION_STAGE } from '../domain/transitions';
import { createGeneratedEpisode } from './fixtures';
import { buildSegmentCards } from './segments';
import { STITCH_UNLOCK_VERSION, buildStitchPlan, formatClock } from './stitchPlan';

async function planFor(generated?: readonly (1 | 2 | 3 | 4 | 5)[]) {
  const fixture = await createGeneratedEpisode(
    generated === undefined ? {} : { generated },
  );
  const cards = buildSegmentCards(fixture.project, fixture.controller.snapshot());
  return { ...fixture, cards, plan: buildStitchPlan(fixture.project, cards) };
}

describe('拼接计划', () => {
  it('恒 5 行，顺序即节拍序，时间位按板时长累加', async () => {
    const { plan } = await planFor();

    expect(plan.rows).toHaveLength(BEAT_COUNT);
    expect(plan.rows.map((row) => row.beat_index)).toEqual([1, 2, 3, 4, 5]);
    expect(plan.rows.map((row) => [row.start_sec, row.end_sec])).toEqual([
      [0, 8],
      [8, 25],
      [25, 45],
      [45, 70],
      [70, 88],
    ]);
    expect(plan.rows[0]?.range_label).toBe('00:00 – 00:08');
    expect(plan.rows[4]?.range_label).toBe('01:10 – 01:28');
    expect(plan.total_duration_sec).toBe(88);
    expect(plan.is_duration_in_range).toBe(true);
    expect(plan.duration_range_sec).toBe(EPISODE_DURATION_RANGE_SEC);
  });

  it('五段齐备时可交付，行内带取件地址', async () => {
    const { plan } = await planFor();

    expect(plan.is_complete).toBe(true);
    expect(plan.ready_count).toBe(BEAT_COUNT);
    expect(plan.missing_indexes).toEqual([]);
    expect(plan.blocked_reason).toBeNull();
    expect(plan.rows.every((row) => row.video_url?.startsWith('stub://') === true)).toBe(true);
  });

  it('缺片时点名缺哪几段，并保留缺片行的时间位', async () => {
    const { plan } = await planFor([1, 2, 3]);

    expect(plan.is_complete).toBe(false);
    expect(plan.ready_count).toBe(3);
    expect(plan.missing_indexes).toEqual([4, 5]);
    expect(plan.blocked_reason).toContain('节拍4');
    expect(plan.rows[3]?.video_url).toBeNull();
    expect(plan.rows[3]?.start_sec).toBe(45);
    expect(plan.total_duration_sec).toBe(88);
  });

  it('板时长改了，时间位随之重算', async () => {
    const { project, controller } = await createGeneratedEpisode();
    beatAt(project, 1).duration_sec = 6;
    const plan = buildStitchPlan(project, buildSegmentCards(project, controller.snapshot()));

    expect(plan.rows.map((row) => row.start_sec)).toEqual([0, 6, 23, 43, 68]);
    expect(plan.total_duration_sec).toBe(86);
    expect(plan.is_duration_in_range).toBe(true);
  });

  it('整集时长越界时给出区间提示口径', async () => {
    const { project, controller } = await createGeneratedEpisode();
    project.beat_list.forEach((beat) => {
      beat.duration_sec = 5;
    });
    const plan = buildStitchPlan(project, buildSegmentCards(project, controller.snapshot()));

    expect(plan.total_duration_sec).toBe(25);
    expect(plan.is_duration_in_range).toBe(false);
  });

  it('一键拼接锁在 V1.1（V1.0 只出计划）', () => {
    expect(STITCH_UNLOCK_VERSION).toBe('V1.1');
  });

  it('秒 → mm:ss，非法值回落 00:00', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(8)).toBe('00:08');
    expect(formatClock(88)).toBe('01:28');
    expect(formatClock(Number.NaN)).toBe('00:00');
    expect(formatClock(-3)).toBe('00:00');
  });
});

describe('衔接总表（与段卡同源）', () => {
  it('五条衔接，末条指向下一集，生效阶段恒为后期合成', async () => {
    const { plan, cards } = await planFor();

    expect(plan.transitions).toHaveLength(BEAT_COUNT);
    expect(plan.transitions.map((item) => item.point_label)).toEqual([
      '节拍1 → 节拍2',
      '节拍2 → 节拍3',
      '节拍3 → 节拍4',
      '节拍4 → 节拍5',
      '节拍5 → 下一集',
    ]);
    expect(plan.transition_stage).toBe(TRANSITION_STAGE);
    expect(plan.transitions.every((item) => item.stage === TRANSITION_STAGE)).toBe(true);
    // 同源：表里的每条衔接就是段卡上的那条。
    expect(plan.transitions).toEqual(cards.map((card) => card.transition));
    plan.rows.forEach((row, at) => {
      expect(row.transition).toBe(plan.transitions[at]);
    });
  });

  it('改板上的衔接，总表与段卡一起变，计划的其余部分不动', async () => {
    const { project, controller } = await createGeneratedEpisode();
    beatAt(project, 2).transition_rule = '螺口顺滑过渡';
    const plan = buildStitchPlan(project, buildSegmentCards(project, controller.snapshot()));

    expect(plan.transitions[1]?.rule).toBe('螺口顺滑过渡');
    expect(plan.transitions[1]?.code).toBe('SCREW_SMOOTH');
    expect(plan.total_duration_sec).toBe(88);
    // 改衔接不会动成片：地址仍是原来那五个（AC-F5-7 的成片页侧影）。
    expect(plan.rows.every((row) => row.video_url?.startsWith('stub://') === true)).toBe(true);
    expect(plan.rows[1]?.video_url).not.toContain('螺口');
  });
});
