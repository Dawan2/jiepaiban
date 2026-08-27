/**
 * 页面测试脚手架：用内存仓储替掉 IndexedDB，渲染真实路由树。
 *
 * 演示数据已随 W2 一并删除，页面测试因此必须自己播种——这正是我们要的：
 * 断言跑在"真的从仓储读出来"的路径上，而不是某个硬编码常量上。
 */

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { LocalRepository, MemoryDriver, type StoredProject } from '../adapters/persistence';
import { ProjectsProvider } from '../store/ProjectsProvider';
import { createEmptyProject, type IdGen } from '../store/projectFactory';
import type { NewProjectInput } from '../domain/projects';

export const BASE_INPUT: NewProjectInput = {
  name: '重生之我在末世卖煎饼',
  genre: '末世·爽剧',
  aspectRatio: '9:16',
  episodeDurationSec: 88,
  stylePrompt: '冷调赛博废土，胶片颗粒，强逆光',
  protagonist: '短发女青年，机能风冲锋衣，左颊有疤',
};

/** 固定时钟：让 updatedAt 排序与快照断言稳定可复现。 */
export function fixedClock(start = 0): () => string {
  let tick = start;
  return () => `2026-08-27T00:00:${String(tick++).padStart(2, '0')}.000Z`;
}

/** 固定 id 生成器。 */
export function sequentialIds(prefix = 'prj_new'): IdGen {
  let n = 0;
  return () => `${prefix}_${n++}`;
}

export function makeProject(
  id: string,
  overrides: Partial<NewProjectInput> = {},
  now = '2026-08-26T09:12:00.000Z',
): StoredProject {
  return createEmptyProject({ ...BASE_INPUT, ...overrides }, id, now);
}

/** 给项目的前 n 拍挂上视频（用于"删除需二次确认"与成片页断言）。 */
export function withVideos(project: StoredProject, count: number): StoredProject {
  return {
    ...project,
    beats: project.beats.map((beat, i) =>
      i < count
        ? {
            ...beat,
            videoUrl: `https://cdn.example.com/${project.id}-${beat.index}.mp4`,
            status: 'generated' as const,
          }
        : beat,
    ),
  };
}

export async function seedRepository(
  projects: readonly StoredProject[],
  now = fixedClock(),
): Promise<LocalRepository> {
  const repository = new LocalRepository(new MemoryDriver(), now);
  for (const project of projects) {
    await repository.save(project);
  }
  return repository;
}

interface RenderOptions {
  repository: LocalRepository;
  now?: () => string;
  newId?: IdGen;
}

export function renderApp(path: string, { repository, now, newId }: RenderOptions) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProjectsProvider
        repository={repository}
        now={now ?? fixedClock(30)}
        newId={newId ?? sequentialIds()}
      >
        <App />
      </ProjectsProvider>
    </MemoryRouter>,
  );
}
