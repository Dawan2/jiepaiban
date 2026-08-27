/**
 * 项目导出与交付包（PRD 5.5.2、AC-6.9）。
 *
 * 这里对着红线的两面同时下断言：
 * - 导出**有**衔接（后期合成要用），且 5 块板字段与 Prompt 全文齐备；
 * - 各板的 `prompt_final` 里**没有**衔接 / 名称 / 备注（AC-6.4）。
 */

import { describe, expect, it } from 'vitest';
import { BEAT_COUNT } from '../domain/beats';
import { assemblePrompt, findExcludedFieldLeaks } from '../domain/prompt';
import { beatAt } from '../domain/projects';
import { TRANSITION_RULES, TRANSITION_STAGE } from '../domain/transitions';
import { createGeneratedEpisode, FIXED_GENERATED_AT } from './fixtures';
import {
  EXPORT_SCHEMA_VERSION,
  buildDeliveryManifest,
  buildDeliveryManifestFile,
  buildProjectExport,
  buildProjectJsonFile,
  toJsonText,
} from './projectExport';
import { buildSegmentCards } from './segments';

const NOW = '2026-08-27T10:00:00.000Z';

async function exportFor(generated?: readonly (1 | 2 | 3 | 4 | 5)[]) {
  const fixture = await createGeneratedEpisode(generated === undefined ? {} : { generated });
  const cards = buildSegmentCards(fixture.project, fixture.controller.snapshot());
  return {
    ...fixture,
    cards,
    payload: buildProjectExport(fixture.project, cards, { now: NOW }),
    manifest: buildDeliveryManifest(fixture.project, cards, { now: NOW }),
  };
}

describe('项目 JSON 导出', () => {
  it('带版本号、导出时间与项目级字段', async () => {
    const { payload, project } = await exportFor();

    expect(payload.schema_version).toBe(EXPORT_SCHEMA_VERSION);
    expect(payload.exported_at).toBe(NOW);
    expect(payload.project.id).toBe(project.id);
    expect(payload.project.name).toBe('婚宴反转');
    expect(payload.project.aspect_ratio).toBe('9:16');
    expect(payload.project.beat_count).toBe(BEAT_COUNT);
    expect(payload.project.beat_duration_sum_sec).toBe(88);
    expect(payload.project.style_prompt).not.toBe('');
    expect(payload.project.protagonist).not.toBe('');
  });

  it('恰 5 块板，顺序即板序，字段与宫格齐备', async () => {
    const { payload } = await exportFor();

    expect(payload.beats).toHaveLength(BEAT_COUNT);
    expect(payload.beats.map((beat) => beat.index)).toEqual([1, 2, 3, 4, 5]);
    expect(payload.beats.map((beat) => beat.frame_count)).toEqual([3, 3, 3, 3, 2]);
    expect(payload.beats.map((beat) => beat.frames.length)).toEqual([3, 3, 3, 3, 2]);
    expect(payload.beats[0]?.frames.map((frame) => frame.order)).toEqual([1, 2, 3]);
    expect(payload.beats[0]?.frames[0]?.semantic).toBe('impact');
    expect(payload.beats.every((beat) => beat.emotion !== '')).toBe(true);
    expect(payload.beats.every((beat) => beat.camera_rhythm !== '')).toBe(true);
    expect(payload.beats.every((beat) => beat.plot_core !== '')).toBe(true);
  });

  it('每块板带 Prompt 全文，与组装器逐字一致（R5 所见即所发）', async () => {
    const { payload, project } = await exportFor();

    payload.beats.forEach((exported) => {
      expect(exported.prompt_final).toBe(assemblePrompt(project, beatAt(project, exported.index)));
    });
  });

  it('Prompt 全文里没有衔接 / 名称 / 备注（AC-6.4）', async () => {
    const { payload, project } = await exportFor();

    payload.beats.forEach((exported) => {
      const beat = beatAt(project, exported.index);
      expect(findExcludedFieldLeaks(beat, exported.prompt_final)).toEqual([]);
      TRANSITION_RULES.forEach((rule) => {
        expect(exported.prompt_final).not.toContain(rule);
      });
      expect(exported.prompt_final).not.toContain(beat.note);
    });
  });

  it('导出里带衔接与生效阶段（后期合成要照它剪）', async () => {
    const { payload } = await exportFor();

    expect(payload.beats.map((beat) => beat.transition_rule)).toEqual([
      '音频预接',
      '卡点硬切',
      '纯硬切',
      'BGM升调截断',
      '黑屏断钩子',
    ]);
    expect(payload.beats.every((beat) => beat.transition_stage === TRANSITION_STAGE)).toBe(true);
    expect(payload.transitions).toHaveLength(BEAT_COUNT);
    expect(payload.transitions[4]?.point_label).toBe('节拍5 → 下一集');
  });

  it('带成片地址、生成完成时间与重投次数（AC-6.9 可溯）', async () => {
    const { payload } = await exportFor();

    expect(payload.beats.every((beat) => beat.video_url?.startsWith('stub://') === true)).toBe(true);
    expect(payload.beats.every((beat) => beat.generated_at === FIXED_GENERATED_AT)).toBe(true);
    expect(payload.beats.every((beat) => beat.attempt === 1)).toBe(true);
  });

  it('带拼接计划，缺片时如实标注', async () => {
    const { payload } = await exportFor([1, 2, 3]);

    expect(payload.stitch_plan.total_duration_sec).toBe(88);
    expect(payload.stitch_plan.is_complete).toBe(false);
    expect(payload.stitch_plan.missing_indexes).toEqual([4, 5]);
    expect(payload.stitch_plan.rows).toHaveLength(BEAT_COUNT);
  });

  it('序列化成可读 JSON，文件名取项目名', async () => {
    const { project, cards } = await exportFor();
    const file = buildProjectJsonFile(project, cards, { now: NOW });

    expect(file.file_name).toBe('婚宴反转_节拍板项目.json');
    expect(file.mime).toContain('application/json');
    const parsed: unknown = JSON.parse(file.text);
    expect(parsed).toEqual(JSON.parse(toJsonText(buildProjectExport(project, cards, { now: NOW }))));
    expect(file.text.endsWith('\n')).toBe(true);
  });

  it('导出载荷里没有任何生成侧的密钥字段', async () => {
    const { payload } = await exportFor();
    const body = JSON.stringify(payload);

    ['api_key', 'apiKey', 'token', 'secret'].forEach((key) => {
      expect(body).not.toContain(key);
    });
  });
});

describe('交付包清单', () => {
  it('齐备时 5 段 + 项目 JSON，路径按板序', async () => {
    const { manifest } = await exportFor();

    expect(manifest.zip_file_name).toBe('婚宴反转_成片交付包.zip');
    expect(manifest.segment_count).toBe(BEAT_COUNT);
    expect(manifest.is_complete).toBe(true);
    expect(manifest.entries.map((entry) => entry.path)).toEqual([
      'segments/婚宴反转_1_开篇钩子.mp4',
      'segments/婚宴反转_2_矛盾建立.mp4',
      'segments/婚宴反转_3_打压升级.mp4',
      'segments/婚宴反转_4_反转蓄力.mp4',
      'segments/婚宴反转_5_断集留客.mp4',
      '婚宴反转_节拍板项目.json',
    ]);
    expect(manifest.created_at).toBe(NOW);
    expect(manifest.total_duration_sec).toBe(88);
  });

  it('缺片时只列已生成的段，并点名缺哪几段', async () => {
    const { manifest } = await exportFor([1, 2, 3]);

    expect(manifest.segment_count).toBe(3);
    expect(manifest.is_complete).toBe(false);
    expect(manifest.missing_indexes).toEqual([4, 5]);
    expect(manifest.entries.filter((entry) => entry.beat_index !== null)).toHaveLength(3);
  });

  it('桩件地址在清单里如实标注不可抓取', async () => {
    const { manifest } = await exportFor();

    expect(manifest.entries[0]?.source_url).toContain('stub://');
    expect(manifest.note).toContain('桩件');
  });

  it('清单文件可下载，文件名与 zip 名同源', async () => {
    const { project, cards } = await exportFor();
    const file = buildDeliveryManifestFile(project, cards, { now: NOW });

    expect(file.file_name).toBe('婚宴反转_成片交付包_清单.json');
    const parsed = JSON.parse(file.text) as { zip_file_name: string };
    expect(parsed.zip_file_name).toBe('婚宴反转_成片交付包.zip');
  });
});
