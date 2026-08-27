/**
 * 脚手架期的演示数据。接入真实持久化（WK3 数据 / API 层）后整体替换。
 * 只经领域层构造，不自建 Beat 结构。
 */

import { createProject, type Project } from '../domain/projects';

function withFilledBeats(project: Project, filledCount: number): Project {
  project.beat_list.forEach((beat, i) => {
    if (i < filledCount) {
      beat.status = 'filled';
      beat.emotion = '（演示数据）本段情绪占位';
      beat.camera_rhythm = '（演示数据）镜头节奏占位';
      beat.plot_core = '（演示数据）剧情核心占位';
    }
  });
  return project;
}

export const demoProjects: Project[] = [
  withFilledBeats(
    createProject(
      {
        name: '重生之我在末世卖煎饼',
        genre: '末世·爽剧',
        aspect_ratio: '9:16',
        style_prompt: '冷调赛博废土，胶片颗粒，强逆光',
        protagonist: '短发女青年，机能风冲锋衣，左颊有疤',
      },
      { id: 'prj_demo_1', now: '2026-08-26T09:12:00Z' },
    ),
    3,
  ),
  withFilledBeats(
    createProject(
      {
        name: '总裁的隐婚小娇妻',
        genre: '都市·甜宠',
        aspect_ratio: '9:16',
        style_prompt: '暖调高级感都市夜景，柔焦，霓虹反射',
        protagonist: '长发女生，米白针织衫，清冷气质',
      },
      { id: 'prj_demo_2', now: '2026-08-25T14:03:00Z' },
    ),
    5,
  ),
];

export function findDemoProject(id: string): Project | undefined {
  return demoProjects.find((project) => project.id === id);
}
