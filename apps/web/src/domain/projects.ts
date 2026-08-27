/**
 * 项目模型（PRD V1.0 第 5.1 章）。
 *
 * 项目级字段自动注入每个节拍的 Prompt，节拍卡内只读展示、不重复填写。
 * 项目一旦创建即自动携带 5 个节拍（见 `./beats.ts`），数量不可增删。
 */

import { BEAT_COUNT, createDefaultBeats, type Beat } from './beats';

/** V1.0 画幅：竖屏优先，默认 9:16。 */
export type AspectRatio = '9:16' | '16:9' | '1:1';

export interface Project {
  readonly id: string;
  name: string;
  /** 题材，自由文本（V1.1 升级为模板选择）。 */
  genre: string;
  aspectRatio: AspectRatio;
  /** 单集目标时长（秒）。 */
  episodeDurationSec: number;
  /** 全局画风风格词，注入每拍 Prompt。 */
  stylePrompt: string;
  /** 主角形象描述，注入每拍 Prompt。 */
  protagonist: string;
  updatedAt: string;
  /** 恒为 5 项。 */
  beats: Beat[];
}

export type NewProjectInput = Omit<Project, 'id' | 'updatedAt' | 'beats'>;

/** 强制字段未填不可创建（PRD 5.1.1）。 */
export function isNewProjectValid(input: NewProjectInput): boolean {
  return (
    input.name.trim() !== '' &&
    input.genre.trim() !== '' &&
    input.episodeDurationSec > 0 &&
    input.stylePrompt.trim() !== '' &&
    input.protagonist.trim() !== ''
  );
}

/** 创建项目：成功后自动生成 5 个节拍（AC-6.1）。 */
export function createProject(input: NewProjectInput, id: string, now: string): Project {
  return {
    id,
    ...input,
    updatedAt: now,
    beats: createDefaultBeats(input.episodeDurationSec),
  };
}

/** 五节拍完成度（项目卡点阵用），分母恒为 5。 */
export function beatCompletion(project: Project): { filled: number; total: typeof BEAT_COUNT } {
  const filled = project.beats.filter((beat) => beat.status !== 'empty').length;
  return { filled, total: BEAT_COUNT };
}
