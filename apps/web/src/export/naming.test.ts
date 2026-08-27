/**
 * 成片文件命名（PRD 5.5.2：`项目名_节拍序号_节拍名.mp4`）。
 */

import { describe, expect, it } from 'vitest';
import { beatAt } from '../domain/projects';
import { createFilledEpisode } from '../testing/goldens';
import {
  deliveryManifestFileName,
  deliveryZipFileName,
  projectJsonFileName,
  sanitizeFileNamePart,
  segmentEntryPath,
  segmentFileName,
} from './naming';

describe('逐段下载命名', () => {
  it('恒为 `项目名_节拍序号_节拍名.mp4`', () => {
    const project = createFilledEpisode();

    expect(segmentFileName(project, beatAt(project, 1))).toBe('婚宴反转_1_开篇钩子.mp4');
    expect(segmentFileName(project, beatAt(project, 5))).toBe('婚宴反转_5_断集留客.mp4');
  });

  it('板序进文件名，五段文件名互不相同且可按名排序', () => {
    const project = createFilledEpisode();
    const names = project.beat_list.map((beat) => segmentFileName(project, beat));

    expect(new Set(names).size).toBe(5);
    expect(names.map((name) => name.split('_')[1])).toEqual(['1', '2', '3', '4', '5']);
  });

  it('交付包内路径带 segments/ 前缀', () => {
    const project = createFilledEpisode();

    expect(segmentEntryPath(project, beatAt(project, 3))).toBe(
      'segments/婚宴反转_3_打压升级.mp4',
    );
  });
});

describe('文件名净化', () => {
  it('路径分隔符与保留字符换成下划线', () => {
    expect(sanitizeFileNamePart('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('空白折叠、首尾下划线去掉、连续下划线合并', () => {
    expect(sanitizeFileNamePart('  第 3  集  ')).toBe('第_3_集');
    expect(sanitizeFileNamePart('///名字///')).toBe('名字');
  });

  it('空串回落到「未命名」', () => {
    expect(sanitizeFileNamePart('')).toBe('未命名');
    expect(sanitizeFileNamePart('   ')).toBe('未命名');
  });

  it('净化后的名字直接进项目级导出名', () => {
    const project = createFilledEpisode();
    project.name = '婚宴/反转 · 第 3 集';

    expect(projectJsonFileName(project)).toBe('婚宴_反转_·_第_3_集_节拍板项目.json');
    expect(deliveryZipFileName(project)).toBe('婚宴_反转_·_第_3_集_成片交付包.zip');
    expect(deliveryManifestFileName(project)).toBe('婚宴_反转_·_第_3_集_成片交付包_清单.json');
  });
});
