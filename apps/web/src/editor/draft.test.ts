/**
 * 编辑态测试。
 * 这一层是 UI 与领域模型之间的桥：格数锁必须在铸造时就成立，
 * 回落到领域模型时也不能把衔接内容混进任何进 Prompt 的字段。
 */

import { describe, expect, it } from 'vitest';
import { TOTAL_GRID_CELL_COUNT, gridSizeForBeatIndex } from '../domain/beats';
import { createProject, type Project } from '../domain/projects';
import {
  cellFillProgress,
  createBeatDrafts,
  draftHasSeam,
  draftToBeat,
  referenceImageKeys,
  updateBeatFields,
  updateCellDescription,
  updateCellImage,
} from './draft';

function project(): Project {
  return createProject(
    {
      name: '测试项目',
      genre: '都市',
      aspectRatio: '9:16',
      episodeDurationSec: 100,
      stylePrompt: '冷调',
      protagonist: '短发女青年',
    },
    'prj_test',
    '2026-08-27T00:00:00Z',
  );
}

describe('铸造', () => {
  it('恒 5 份，格数由板位决定，合计 14 格', () => {
    const drafts = createBeatDrafts(project());

    expect(drafts).toHaveLength(5);
    expect(drafts.map((draft) => draft.cells.length)).toEqual([3, 3, 3, 3, 2]);
    expect(drafts.reduce((sum, draft) => sum + draft.cells.length, 0)).toBe(
      TOTAL_GRID_CELL_COUNT,
    );
    drafts.forEach((draft) => {
      expect(draft.cells).toHaveLength(gridSizeForBeatIndex(draft.index));
      expect(draft.gridSize).toBe(gridSizeForBeatIndex(draft.index));
    });
  });

  it('格序左 → 右，且每格只有描述与参考图', () => {
    const draft = createBeatDrafts(project())[0];
    expect(draft?.cells.map((cell) => cell.order)).toEqual([1, 2, 3]);
    expect(Object.keys(draft?.cells[0] ?? {}).sort()).toEqual([
      'description',
      'image',
      'order',
    ]);
  });

  it('预填方法论默认衔接，B5 无接缝', () => {
    const drafts = createBeatDrafts(project());
    expect(drafts.map((draft) => draft.transitionMethod)).toEqual([
      'audio_prelap',
      'beat_sync_cut',
      'pure_hard_cut',
      'bgm_pitch_cut',
      null,
    ]);
    expect(drafts.map((draft) => draftHasSeam(draft))).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('不导出任何增删节拍或增删格的能力', async () => {
    const moduleExports = Object.keys(await import('./draft'));
    expect(
      moduleExports.filter((name) => /^(add|insert|remove|delete|reorder|move)/i.test(name)),
    ).toEqual([]);
  });
});

describe('编辑', () => {
  it('改字段只影响目标板，且格数不变', () => {
    const before = createBeatDrafts(project());
    const after = updateBeatFields(before, 2, { tone: '紧张', durationSec: 17 });

    expect(after[1]?.tone).toBe('紧张');
    expect(after[1]?.durationSec).toBe(17);
    expect(after[0]?.tone).toBeNull();
    expect(after.map((draft) => draft.cells.length)).toEqual([3, 3, 3, 3, 2]);
  });

  it('改一格描述不动其他格', () => {
    const after = updateCellDescription(createBeatDrafts(project()), 1, 2, '皮鞋踩进水洼');

    expect(after[0]?.cells[1]?.description).toBe('皮鞋踩进水洼');
    expect(after[0]?.cells[0]?.description).toBe('');
    expect(after[0]?.cells).toHaveLength(3);
  });

  it('挂载与清除参考图，键按格序收集', () => {
    const withImage = updateCellImage(createBeatDrafts(project()), 1, 2, {
      key: 'img_b1_c2_a.png',
      name: 'a.png',
      previewUrl: '',
    });
    const first = withImage[0];
    if (first === undefined) {
      throw new Error('缺少节拍 1');
    }

    expect(referenceImageKeys(first)).toEqual(['img_b1_c2_a.png']);

    const cleared = updateCellImage(withImage, 1, 2, null);
    expect(referenceImageKeys(cleared[0] ?? first)).toEqual([]);
  });

  it('已填格数按应填格数统计', () => {
    const filled = updateCellDescription(createBeatDrafts(project()), 5, 1, '推到主桌中央');
    const fifth = filled[4];
    if (fifth === undefined) {
      throw new Error('缺少节拍 5');
    }
    expect(cellFillProgress(fifth)).toEqual({ filled: 1, total: 2 });
  });
});

describe('回落领域模型', () => {
  it('宫格补齐三元组，B5 第 3 格为空且不参与组装', () => {
    const drafts = createBeatDrafts(project());
    const fifth = drafts[4];
    if (fifth === undefined) {
      throw new Error('缺少节拍 5');
    }

    const beat = draftToBeat(fifth);
    expect(beat.cells).toHaveLength(3);
    expect(beat.gridSize).toBe(2);
    expect(beat.cells[2].description).toBe('');
  });

  it('衔接落在 transition 字段里，不渗进任何进 Prompt 的字段', () => {
    const drafts = updateBeatFields(createBeatDrafts(project()), 1, {
      transitionMethod: 'black_cut_hook',
      transitionNote: '黑场后女主已在医院',
    });
    const first = drafts[0];
    if (first === undefined) {
      throw new Error('缺少节拍 1');
    }

    const beat = draftToBeat(first);
    expect(beat.transition).toBe('黑屏断钩子：黑场后女主已在医院');
    expect(beat.summary).toBe('');
    expect(beat.cells.map((cell) => cell.description)).toEqual(['', '', '']);
  });

  it('板名原样带回，不被编辑改写', () => {
    const drafts = createBeatDrafts(project());
    expect(drafts.map((draft) => draft.name)).toEqual([
      '开篇钩子',
      '矛盾建立',
      '打压升级',
      '反转蓄力',
      '断集留客',
    ]);

    const fourth = drafts[3];
    if (fourth === undefined) {
      throw new Error('缺少节拍 4');
    }
    expect(draftToBeat(fourth).name).toBe('反转蓄力');
  });
});
