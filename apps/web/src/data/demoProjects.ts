/**
 * 脚手架期的演示数据。接入真实持久化（WK3 数据/API 层）后整体替换。
 */

import { createProject, type Project } from '../domain/projects';

function withBeatStatuses(project: Project, filledCount: number): Project {
  project.beats.forEach((beat, i) => {
    if (i < filledCount) {
      beat.status = 'filled';
      beat.summary = '（演示数据）本节拍剧情概要占位。';
    }
  });
  return project;
}

export const demoProjects: Project[] = [
  withBeatStatuses(
    createProject(
      {
        name: '重生之我在末世卖煎饼',
        genre: '末世·爽剧',
        aspectRatio: '9:16',
        episodeDurationSec: 120,
        stylePrompt: '冷调赛博废土，胶片颗粒，强逆光',
        protagonist: '短发女青年，机能风冲锋衣，左颊有疤',
      },
      'prj_demo_1',
      '2026-08-26T09:12:00Z',
    ),
    3,
  ),
  withBeatStatuses(
    createProject(
      {
        name: '总裁的隐婚小娇妻',
        genre: '都市·甜宠',
        aspectRatio: '9:16',
        episodeDurationSec: 90,
        stylePrompt: '暖调高级感都市夜景，柔焦，霓虹反射',
        protagonist: '长发女生，米白针织衫，清冷气质',
      },
      'prj_demo_2',
      '2026-08-25T14:03:00Z',
    ),
    5,
  ),
];

export function findDemoProject(id: string): Project | undefined {
  return demoProjects.find((project) => project.id === id);
}
