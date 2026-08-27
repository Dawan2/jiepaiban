/**
 * 成片页的接线回归（路由 `/p/:id/export`，PRD 5.5）。
 *
 * W8 合并把这一页的数据源从演示夹具（`findDemoProject`，已随 W2 删除）换成了本地库。
 * 换完之后有一条不能再回退的性质，本文件就是为它存在的：
 *
 * **段卡的「已生成」以落库的 `video_url` 为准，不以内存里的生成队列为准。**
 *
 * 刚打开成片页时队列必然是空的（控制器随页面新建）。若只读队列，
 * 五段明明已经交付的成片会一齐显示「未生成」，连重投入口都给不出来。
 * 下面第一组断言全部跑在「队列为空、库里有片」这个状态上。
 *
 * 另外两条一并守住：本页重投的结果要落回库（刷新不丢），
 * 以及飞书面板仍在页上、衔接只出现在给人读的那一节里（AC-6.4）。
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LocalRepository } from '../adapters/persistence';
import { BEAT_COUNT } from '../domain/beats';
import { TRANSITION_RULES, TRANSITION_STAGE } from '../domain/transitions';
import {
  makeProject,
  renderApp,
  seedRepository,
  withFilledBeats,
  withVideos,
} from '../testing/harness';

/** 五块板填齐、前 n 段已落库成片的项目。 */
function delivered(id: string, name: string, count: number) {
  return withVideos(withFilledBeats(makeProject(id, { name })), count);
}

const ready = () => waitFor(() => expect(screen.queryByText(/读取项目/)).toBeNull());

function segmentCards(): readonly HTMLElement[] {
  return Array.from(document.querySelectorAll('li.segment'));
}

let repository: LocalRepository;

describe('数据源是本地库，不是演示夹具（W8）', () => {
  beforeEach(async () => {
    repository = await seedRepository([delivered('prj_1', '第一集', BEAT_COUNT)]);
  });

  it('项目名与 5 张段卡都来自仓储', async () => {
    renderApp('/p/prj_1/export', { repository });
    await ready();

    expect(screen.getByText('第一集')).toBeInTheDocument();
    expect(segmentCards()).toHaveLength(BEAT_COUNT);
    expect(segmentCards().map((card) => card.dataset.beat)).toEqual(['1', '2', '3', '4', '5']);
    // 演示夹具已删除，它那份项目名不该再出现在任何一页上。
    expect(screen.queryByText('婚宴反转')).toBeNull();
  });

  it('库里存着成片时，五张卡都是已生成——队列此刻是空的', async () => {
    renderApp('/p/prj_1/export', { repository });
    await ready();

    const links = segmentCards().map((card) =>
      within(card).getByRole('link', { name: '下载本段' }),
    );
    expect(links).toHaveLength(BEAT_COUNT);
    expect(links[0]?.getAttribute('href')).toBe('https://cdn.example.com/prj_1-1.mp4');
    expect(links[0]?.getAttribute('download')).toBe('第一集_1_开篇钩子.mp4');
    expect(screen.queryByText('未生成')).toBeNull();
    expect(screen.getByText(/已齐 5\/5 段 · 合计 88 秒/)).toBeInTheDocument();
  });

  it('落库的段可以直接重投，不再被判成「还没生成过」', async () => {
    renderApp('/p/prj_1/export', { repository });
    await ready();

    const first = segmentCards()[0] as HTMLElement;
    expect(within(first).getByRole('button', { name: '重新生成' })).toBeEnabled();
  });

  it('五段齐备时「全部下载」可用', async () => {
    renderApp('/p/prj_1/export', { repository });
    await ready();

    expect(screen.getByRole('button', { name: '全部下载' })).toBeEnabled();
  });

  it('只落库三段时，缺片提示点名缺哪两段', async () => {
    repository = await seedRepository([delivered('prj_3', '交付三段', 3)]);
    renderApp('/p/prj_3/export', { repository });
    await ready();

    const fourth = segmentCards()[3] as HTMLElement;
    expect(within(fourth).getByText('未生成')).toBeInTheDocument();
    expect(within(fourth).getByRole('button', { name: '下载本段' })).toBeDisabled();
    const regenerate = within(fourth).getByRole('button', { name: '重新生成' });
    expect(regenerate).toBeDisabled();
    expect(regenerate.getAttribute('title')).toContain('先回编辑页');

    const all = screen.getByRole('button', { name: '全部下载' });
    expect(all).toBeDisabled();
    expect(all.getAttribute('title')).toContain('节拍4');
    expect(all.getAttribute('title')).toContain('节拍5');
  });

  it('项目不存在时兜底，不渲染任何段卡', async () => {
    renderApp('/p/prj_missing/export', { repository });

    expect(await screen.findByText(/项目不存在/)).toBeInTheDocument();
    expect(segmentCards()).toHaveLength(0);
  });
});

describe('本页重投的结果落回库（刷新不丢）', () => {
  beforeEach(async () => {
    repository = await seedRepository([delivered('prj_1', '第一集', BEAT_COUNT)]);
  });

  it('确认重投后新地址与新快照写进仓储，其余四段不动', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1/export', { repository });
    await ready();

    const third = segmentCards()[2] as HTMLElement;
    await user.click(within(third).getByRole('button', { name: '重新生成' }));
    await user.click(within(third).getByRole('button', { name: '确认重投' }));

    // 离页即强制落盘（`useProjectEditor` 的卸载 flush），不必等防抖窗口。
    await user.click(within(segmentCards()[2] as HTMLElement).getByRole('link', { name: '去编辑' }));

    await waitFor(async () => {
      const stored = await repository.load('prj_1');
      expect(stored?.beat_list[2]?.video_url).toMatch(/^stub:\/\/seedance-2\.5/);
    });

    const stored = await repository.load('prj_1');
    expect(stored?.beat_list[2]?.prompt_final).not.toBeNull();
    expect(stored?.beat_list[2]?.status).toBe('generated');
    [0, 1, 3, 4].forEach((at) => {
      expect(stored?.beat_list[at]?.video_url).toBe(
        `https://cdn.example.com/prj_1-${at + 1}.mp4`,
      );
    });
  });

  it('落库的 Prompt 快照里没有衔接手法（AC-6.4）', async () => {
    const user = userEvent.setup();
    renderApp('/p/prj_1/export', { repository });
    await ready();

    const first = segmentCards()[0] as HTMLElement;
    await user.click(within(first).getByRole('button', { name: '重新生成' }));
    await user.click(within(first).getByRole('button', { name: '确认重投' }));
    await user.click(within(segmentCards()[0] as HTMLElement).getByRole('link', { name: '去编辑' }));

    await waitFor(async () => {
      const stored = await repository.load('prj_1');
      expect(stored?.beat_list[0]?.video_url).toMatch(/^stub:\/\/seedance-2\.5/);
    });

    const stored = await repository.load('prj_1');
    stored?.beat_list.forEach((beat) => {
      const snapshot = beat.prompt_final ?? '';
      TRANSITION_RULES.forEach((rule) => {
        expect(snapshot).not.toContain(rule);
      });
    });
    // 衔接本身照旧落库，只是不进快照。
    expect(stored?.beat_list[0]?.transition_rule).toBe('音频预接');
  });

  it('只是打开页面不触发写库（不该把「没动过」写成一次保存）', async () => {
    const saved: string[] = [];
    const write = repository.save.bind(repository);
    repository.save = async (project) => {
      saved.push(project.id);
      await write(project);
    };

    renderApp('/p/prj_1/export', { repository });
    await ready();
    // 让队列状态上报的 effect 与后续重渲染都跑完。
    await waitFor(() => expect(segmentCards()).toHaveLength(BEAT_COUNT));

    expect(saved).toEqual([]);
  });
});

describe('飞书面板仍在成片页（W4 保留）', () => {
  beforeEach(async () => {
    repository = await seedRepository([delivered('prj_1', '第一集', BEAT_COUNT)]);
  });

  it('三个导出出口都在，说明里点明衔接只在后期生效', async () => {
    renderApp('/p/prj_1/export', { repository });
    await ready();

    const panel = screen.getByRole('region', { name: '飞书文档导出' });
    expect(within(panel).getByRole('button', { name: '复制飞书 Markdown' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: '下载 Markdown' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: '下载飞书 JSON' })).toBeEnabled();
    expect(within(panel).getByText(new RegExp(`只在${TRANSITION_STAGE}生效`))).toBeInTheDocument();
  });

  it('飞书 Markdown 预览里，衔接只出现在「组间衔接总表（后期合成）」那一节', async () => {
    renderApp('/p/prj_1/export', { repository });
    await ready();

    const markdown =
      screen.getByRole('region', { name: '飞书文档导出' }).querySelector('pre')?.textContent ?? '';
    expect(markdown).toContain(`## 组间衔接总表（${TRANSITION_STAGE}）`);

    const [beforeTransitions, transitionsSection] = markdown.split(
      `## 组间衔接总表（${TRANSITION_STAGE}）`,
    );
    TRANSITION_RULES.forEach((rule) => {
      expect(beforeTransitions ?? '').not.toContain(rule);
    });
    expect(transitionsSection ?? '').toContain('音频预接');
  });

  it('页面上看得见衔接，仍标注不进生成', async () => {
    renderApp('/p/prj_1/export', { repository });
    await ready();

    const first = segmentCards()[0] as HTMLElement;
    expect(within(first).getByText(/节拍1 → 节拍2：音频预接/)).toBeInTheDocument();
    expect(within(first).getByText(new RegExp(`仅${TRANSITION_STAGE}生效，不进生成`))).toBeInTheDocument();
  });
});
