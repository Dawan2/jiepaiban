/**
 * 页面测试脚手架：用内存仓储替掉 IndexedDB，渲染真实路由树。
 *
 * 演示数据已随 W2 一并删除，页面测试因此必须自己播种——这正是我们要的：
 * 断言跑在"真的从仓储读出来"的路径上，而不是某个硬编码常量上。
 */

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import {
  LocalRepository,
  MemoryDriver,
  rebuildBeat,
  type StoredProject,
} from '../adapters/persistence';
import { ProjectsProvider } from '../store/ProjectsProvider';
import { createEmptyProject, type IdGen } from '../store/projectFactory';
import { assemblePrompt } from '../domain/prompt';
import { hydrateProject, type NewProjectInput } from '../domain/projects';

export const BASE_INPUT: NewProjectInput = {
  name: '重生之我在末世卖煎饼',
  genre: '末世·爽剧',
  aspect_ratio: '9:16',
  total_duration_sec: 88,
  style_prompt: '冷调赛博废土，胶片颗粒，强逆光',
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

/**
 * 给项目的前 n 拍挂上**落库的**生成产物（用于「删除需二次确认」与成片页断言）。
 *
 * `prompt_final` 一并补上，且由组装器现算——落库的快照在生产路径上同样出自白名单，
 * 成片页与导出侧的「快照可溯」断言才跑在真实形状上。
 */
export function withVideos(project: StoredProject, count: number): StoredProject {
  const { beat_list: stored, ...fields } = project;
  const beats = stored.map((beat, i) => {
    const copy = rebuildBeat(beat);
    if (i < count) {
      copy.video_url = `https://cdn.example.com/${project.id}-${beat.index}.mp4`;
      copy.prompt_final = assemblePrompt(project, copy);
      copy.status = 'generated';
    }
    return copy;
  });
  return hydrateProject(fields, beats);
}

/** 把 5 块板填到「可生成」的程度（情绪 / 节奏 / 剧情核心 / 每格画面都有文案）。 */
export function withFilledBeats(project: StoredProject): StoredProject {
  const { beat_list: stored, ...fields } = project;
  const beats = stored.map((beat) => {
    const copy = rebuildBeat(beat);
    copy.emotion = '紧张压迫的情绪，压迫感持续收紧';
    copy.camera_rhythm = '极快切入，三段递进';
    copy.plot_core = `第 ${beat.index} 板的剧情推进`;
    copy.frames.forEach((frame) => {
      frame.text = `B${beat.index} 第 ${frame.order} 格画面`;
    });
    copy.status = 'filled';
    return copy;
  });
  return hydrateProject(fields, beats);
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
