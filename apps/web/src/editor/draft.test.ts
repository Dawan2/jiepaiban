/**
 * 编辑态测试。
 *
 * 这一层是 UI 与领域模型之间的桥：格数锁必须在铸造时就成立，
 * 回落到领域模型时也不能把衔接内容混进任何进 Prompt 的字段，
 * 而且回落回来的板必须仍然带着领域层的运行时锁。
 */

import { describe, expect, it } from 'vitest';
import { TOTAL_FRAME_COUNT, frameCountFor, type BeatFrame } from '../domain/beats';
import { createProject, type Project } from '../domain/projects';
import {
  createBeatDrafts,
  draftHasSeam,
  draftToBeat,
  draftTransitionHint,
  emotionPresetOf,
  emotionTextFor,
  frameFillProgress,
  referenceImageKeys,
  updateBeatFields,
  updateFrameImage,
  updateFrameText,
} from './draft';

function project(): Project {
  return createProject(
    {
      name: '测试项目',
      genre: '都市',
      aspect_ratio: '9:16',
      style_prompt: '冷调',
      protagonist: '短发女青年',
    },
    { id: 'prj_test', now: '2026-08-27T00:00:00Z' },
  );
}

describe('铸造', () => {
  it('恒 5 份，格数由板位决定，合计 14 格', () => {
    const drafts = createBeatDrafts(project());

    expect(drafts).toHaveLength(5);
    expect(drafts.map((draft) => draft.frames.length)).toEqual([3, 3, 3, 3, 2]);
    expect(drafts.reduce((sum, draft) => sum + draft.frames.length, 0)).toBe(TOTAL_FRAME_COUNT);
    drafts.forEach((draft) => {
      expect(draft.frames).toHaveLength(frameCountFor(draft.index));
      expect(draft.frame_count).toBe(frameCountFor(draft.index));
    });
  });

  it('格序左 → 右，且每格只有描述与参考图', () => {
    const draft = createBeatDrafts(project())[0];
    expect(draft?.frames.map((frame) => frame.order)).toEqual([1, 2, 3]);
    expect(Object.keys(draft?.frames[0] ?? {}).sort()).toEqual(['image', 'order', 'text']);
  });

  it('带回 canon 时间位与板名', () => {
    const drafts = createBeatDrafts(project());
    expect(drafts.map((draft) => [draft.time_start, draft.time_end])).toEqual([
      [0, 8],
      [8, 25],
      [25, 45],
      [45, 70],
      [70, 88],
    ]);
    expect(drafts.map((draft) => draft.title)).toEqual([
      '开篇钩子',
      '矛盾建立',
      '打压升级',
      '反转蓄力',
      '断集留客',
    ]);
  });

  it('预填方法论默认衔接，B5 无接缝', () => {
    const drafts = createBeatDrafts(project());
    expect(drafts.map((draft) => draft.transition_rule)).toEqual([
      '音频预接',
      '卡点硬切',
      '纯硬切',
      'BGM升调截断',
      null,
    ]);
    expect(drafts.map((draft) => draftHasSeam(draft))).toEqual([true, true, true, true, false]);
  });

  it('衔接手法带出给剪辑读的操作要点，B5 为空', () => {
    const drafts = createBeatDrafts(project());
    expect(draftTransitionHint(drafts[0]!)).toContain('提前');
    expect(draftTransitionHint(drafts[4]!)).toBe('');
  });

  it('不导出任何增删节拍或增删格的能力', async () => {
    const moduleExports = Object.keys(await import('./draft'));
    expect(
      moduleExports.filter((name) => /^(add|insert|remove|delete|reorder|move)/i.test(name)),
    ).toEqual([]);
  });
});

describe('情绪基调预设', () => {
  it('预设展开为整句描写，自由文本原样保留', () => {
    expect(emotionTextFor('紧张')).toBe('紧张压迫的情绪，压迫感持续收紧');
    expect(emotionTextFor('自己写的一句情绪')).toBe('自己写的一句情绪');
  });

  it('整句描写可回显为预设名，自由文本回显为空', () => {
    expect(emotionPresetOf('紧张压迫的情绪，压迫感持续收紧')).toBe('紧张');
    expect(emotionPresetOf('自己写的一句情绪')).toBe('');
  });
});

describe('编辑', () => {
  it('改字段只影响目标板，且格数不变', () => {
    const before = createBeatDrafts(project());
    const after = updateBeatFields(before, 2, { emotion: '紧张', duration_sec: 17 });

    expect(after[1]?.emotion).toBe('紧张');
    expect(after[1]?.duration_sec).toBe(17);
    expect(after[0]?.emotion).toBe('');
    expect(after.map((draft) => draft.frames.length)).toEqual([3, 3, 3, 3, 2]);
  });

  it('改一格描述不动其他格', () => {
    const after = updateFrameText(createBeatDrafts(project()), 1, 2, '皮鞋踩进水洼');

    expect(after[0]?.frames[1]?.text).toBe('皮鞋踩进水洼');
    expect(after[0]?.frames[0]?.text).toBe('');
    expect(after[0]?.frames).toHaveLength(3);
  });

  it('挂载与清除参考图，键按格序收集', () => {
    const withImage = updateFrameImage(createBeatDrafts(project()), 1, 2, {
      key: 'img_b1_c2_a.png',
      name: 'a.png',
      preview_url: '',
    });
    const first = withImage[0];
    if (first === undefined) {
      throw new Error('缺少节拍 1');
    }

    expect(referenceImageKeys(first)).toEqual(['img_b1_c2_a.png']);

    const cleared = updateFrameImage(withImage, 1, 2, null);
    expect(referenceImageKeys(cleared[0] ?? first)).toEqual([]);
  });

  it('已填格数按应填格数统计', () => {
    const filled = updateFrameText(createBeatDrafts(project()), 5, 1, '推到主桌中央');
    const fifth = filled[4];
    if (fifth === undefined) {
      throw new Error('缺少节拍 5');
    }
    expect(frameFillProgress(fifth)).toEqual({ filled: 1, total: 2 });
  });
});

describe('回落领域模型', () => {
  it('B5 回落后仍是 2 格，且结构字段不可写', () => {
    const fifth = createBeatDrafts(project())[4];
    if (fifth === undefined) {
      throw new Error('缺少节拍 5');
    }

    const beat = draftToBeat(fifth);
    expect(beat.frames).toHaveLength(2);
    expect(beat.frame_count).toBe(2);
    expect(() => {
      (beat as unknown as { frame_count: number }).frame_count = 3;
    }).toThrow(TypeError);
    expect(() =>
      (beat.frames as unknown as BeatFrame[]).push({ order: 3, semantic: null, text: 'x' }),
    ).toThrow(TypeError);
  });

  it('编辑态即便被篡改，回落时也拿不到第 3 格', () => {
    const fifth = createBeatDrafts(project())[4];
    if (fifth === undefined) {
      throw new Error('缺少节拍 5');
    }
    const tampered = {
      ...fifth,
      frames: [...fifth.frames, { order: 3 as const, text: '偷加的一格', image: null }],
    };

    const beat = draftToBeat(tampered);
    expect(beat.frames).toHaveLength(2);
    expect(beat.frames.map((frame) => frame.text)).toEqual(['', '']);
  });

  it('衔接落在 transition_rule / note 里，不渗进任何进 Prompt 的字段', () => {
    const drafts = updateBeatFields(createBeatDrafts(project()), 1, {
      transition_rule: '黑屏断钩子',
      transition_note: '黑场后女主已在医院',
    });
    const first = drafts[0];
    if (first === undefined) {
      throw new Error('缺少节拍 1');
    }

    const beat = draftToBeat(first);
    expect(beat.transition_rule).toBe('黑屏断钩子');
    expect(beat.note).toBe('黑场后女主已在医院');
    expect(beat.plot_core).toBe('');
    expect(beat.emotion).toBe('');
    expect(beat.camera_rhythm).toBe('');
    expect(beat.frames.map((frame) => frame.text)).toEqual(['', '', '']);
  });

  it('板名原样带回，不被编辑改写', () => {
    const fourth = createBeatDrafts(project())[3];
    if (fourth === undefined) {
      throw new Error('缺少节拍 4');
    }
    expect(draftToBeat(fourth).title).toBe('反转蓄力');
  });

  it('可编辑字段逐项带回', () => {
    const drafts = updateFrameText(
      updateBeatFields(createBeatDrafts(project()), 3, {
        emotion: '压到底的窒息感',
        camera_rhythm: '层层加压，不给喘息',
        plot_core: '第三次打压落地',
        duration_sec: 22,
      }),
      3,
      1,
      '门被从外面反锁',
    );
    const beat = draftToBeat(drafts[2]!);

    expect(beat.emotion).toBe('压到底的窒息感');
    expect(beat.camera_rhythm).toBe('层层加压，不给喘息');
    expect(beat.plot_core).toBe('第三次打压落地');
    expect(beat.duration_sec).toBe(22);
    expect(beat.frames[0]?.text).toBe('门被从外面反锁');
  });
});
