/**
 * 项目列表页的真实持久化流程回归：新建 / 复用 / 归档 / 删除 / 导入导出。
 * 每个用例都在操作后回仓储里核对落盘结果，避免只测了界面文案。
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BEAT_COUNT } from '../domain/beats';
import { serializeEnvelope } from '../adapters/persistence';
import {
  BASE_INPUT,
  makeProject,
  renderApp,
  seedRepository,
  withVideos,
} from '../testing/harness';

const ready = () => waitFor(() => expect(screen.queryByText(/读取本地项目库/)).toBeNull());

/** 定位某个项目的卡片，避免多卡片时按钮名冲突。 */
function cardFor(name: string): HTMLElement {
  const link = screen.getByRole('link', { name: new RegExp(name) });
  const card = link.closest('li');
  if (card === null) {
    throw new Error(`找不到《${name}》的卡片`);
  }
  return card;
}

describe('空库首次进入', () => {
  it('给出空态引导，并说明新建会自动落 5 块板', async () => {
    renderApp('/', { repository: await seedRepository([]) });
    await ready();

    expect(screen.getByText(/还没有项目/)).toBeInTheDocument();
    expect(screen.getByText(/5 块锁定节拍板/)).toBeInTheDocument();
  });
});

describe('新建项目（PRD §7.1）', () => {
  it('填齐必填字段后创建，落库即带 5 块锁定板', async () => {
    const repository = await seedRepository([]);
    const user = userEvent.setup();
    renderApp('/', { repository });
    await ready();

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    const form = screen.getByRole('form', { name: '新建项目' });

    await user.type(within(form).getByLabelText('项目名称'), '第一集·煎饼摊惊魂');
    await user.type(within(form).getByLabelText('题材'), '末世·爽剧');
    await user.type(within(form).getByLabelText('全局画风'), '冷调赛博废土');
    await user.type(within(form).getByLabelText('主角形象'), '短发女青年');
    await user.click(within(form).getByRole('button', { name: '创建项目' }));

    expect(await screen.findByText(/已创建《第一集·煎饼摊惊魂》/)).toBeInTheDocument();

    const summaries = await repository.list();
    expect(summaries).toHaveLength(1);

    const stored = await repository.load(summaries[0]?.id ?? '');
    expect(stored?.beats).toHaveLength(BEAT_COUNT);
    expect(stored?.beats.map((beat) => beat.gridSize)).toEqual([3, 3, 3, 3, 2]);
    expect(stored?.beats.every((beat) => beat.status === 'empty')).toBe(true);
  });

  it('必填字段没填齐时创建按钮不可点', async () => {
    const user = userEvent.setup();
    renderApp('/', { repository: await seedRepository([]) });
    await ready();

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    const form = screen.getByRole('form', { name: '新建项目' });

    expect(within(form).getByRole('button', { name: '创建项目' })).toBeDisabled();
    await user.type(within(form).getByLabelText('项目名称'), '只填了名字');
    expect(within(form).getByRole('button', { name: '创建项目' })).toBeDisabled();
  });

  it('表单里没有"板数"这类结构选项', async () => {
    const user = userEvent.setup();
    renderApp('/', { repository: await seedRepository([]) });
    await ready();

    await user.click(screen.getByRole('button', { name: '新建项目' }));
    const form = screen.getByRole('form', { name: '新建项目' });
    const text = form.textContent ?? '';

    expect(text).not.toMatch(/板数|节拍数量|分镜/);
  });
});

describe('复用项目（PRD §7.2）', () => {
  it('复制结构与参数、清空画面文案与生成结果', async () => {
    const source = withVideos(
      {
        ...makeProject('prj_1', { name: '第一集' }),
        beats: makeProject('prj_1').beats.map((beat) => ({
          ...beat,
          summary: '上一集的剧情',
          status: 'generated' as const,
          cells: [
            { order: 1 as const, description: '上一集第 1 格' },
            { order: 2 as const, description: '上一集第 2 格' },
            { order: 3 as const, description: '上一集第 3 格' },
          ],
        })),
      },
      5,
    );

    const repository = await seedRepository([source]);
    const user = userEvent.setup();
    renderApp('/', { repository });
    await ready();

    await user.click(within(cardFor('第一集')).getByRole('button', { name: '复用' }));

    expect(await screen.findByText(/画面文案已清空/)).toBeInTheDocument();

    const summaries = await repository.list();
    expect(summaries).toHaveLength(2);

    const copyId = summaries.find((summary) => summary.reusedFromId === 'prj_1')?.id ?? '';
    const copy = await repository.load(copyId);

    expect(copy?.beats).toHaveLength(BEAT_COUNT);
    expect(copy?.beats.flatMap((beat) => beat.cells.map((cell) => cell.description))).toEqual(
      Array.from({ length: BEAT_COUNT * 3 }, () => ''),
    );
    expect(copy?.beats.every((beat) => beat.videoUrl === null)).toBe(true);
    expect(copy?.beats.every((beat) => beat.status === 'empty')).toBe(true);

    // 结构与参数照抄。
    expect(copy?.beats.map((beat) => beat.durationSec)).toEqual(
      source.beats.map((beat) => beat.durationSec),
    );
    expect(copy?.genre).toBe(source.genre);
    expect(copy?.stylePrompt).toBe(source.stylePrompt);

    // 源项目不受影响。
    expect((await repository.load('prj_1'))?.beats[0]?.cells[0]?.description).toBe('上一集第 1 格');
  });
});

describe('归档', () => {
  it('归档后从进行中列表收起，可在归档视图里找回并取消归档', async () => {
    const repository = await seedRepository([
      makeProject('prj_1', { name: '第一集' }),
      makeProject('prj_2', { name: '第二集' }),
    ]);
    const user = userEvent.setup();
    renderApp('/', { repository });
    await ready();

    await user.click(within(cardFor('第一集')).getByRole('button', { name: '归档' }));

    await waitFor(() => expect(screen.queryByRole('link', { name: /第一集/ })).toBeNull());
    expect(screen.getByRole('link', { name: /第二集/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /查看归档（1）/ }));
    expect(await screen.findByRole('link', { name: /第一集/ })).toBeInTheDocument();

    await user.click(within(cardFor('第一集')).getByRole('button', { name: '取消归档' }));
    await waitFor(async () => {
      const summaries = await repository.list();
      expect(summaries.find((summary) => summary.id === 'prj_1')?.archived).toBe(false);
    });
  });
});

describe('删除', () => {
  it('没有视频的项目直接删除，不打扰用户', async () => {
    const repository = await seedRepository([makeProject('prj_1', { name: '空项目' })]);
    const user = userEvent.setup();
    renderApp('/', { repository });
    await ready();

    await user.click(within(cardFor('空项目')).getByRole('button', { name: '删除' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('link', { name: /空项目/ })).toBeNull());
    expect(await repository.list()).toEqual([]);
  });

  it('已有视频的项目必须二次确认；取消则保留', async () => {
    const repository = await seedRepository([
      withVideos(makeProject('prj_1', { name: '已生成三段' }), 3),
    ]);
    const user = userEvent.setup();
    renderApp('/', { repository });
    await ready();

    await user.click(within(cardFor('已生成三段')).getByRole('button', { name: '删除' }));

    const dialog = screen.getByRole('alertdialog', { name: '确认删除项目' });
    expect(within(dialog).getByText(/已有 3 段生成视频/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '取消' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('link', { name: /已生成三段/ })).toBeInTheDocument();
    expect(await repository.load('prj_1')).not.toBeNull();
  });

  it('确认后才真正删除', async () => {
    const repository = await seedRepository([
      withVideos(makeProject('prj_1', { name: '已生成三段' }), 3),
    ]);
    const user = userEvent.setup();
    renderApp('/', { repository });
    await ready();

    await user.click(within(cardFor('已生成三段')).getByRole('button', { name: '删除' }));
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(screen.queryByRole('link', { name: /已生成三段/ })).toBeNull());
    expect(await repository.load('prj_1')).toBeNull();
  });
});

describe('导出 / 导入 JSON 备份', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('导出按钮生成带全部项目的备份文件', async () => {
    const repository = await seedRepository([makeProject('prj_1', { name: '第一集' })]);
    const user = userEvent.setup();

    // jsdom 没有实现 createObjectURL，这里桩掉并顺手截获导出内容。
    const created = vi.fn(() => 'blob:mock');
    vi.stubGlobal('URL', { ...URL, createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    renderApp('/', { repository });
    await ready();
    await user.click(screen.getByRole('button', { name: '导出备份' }));

    expect(await screen.findByText(/已导出备份 jiepaiban-backup-/)).toBeInTheDocument();
    expect(created).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);

    click.mockRestore();
  });

  it('导入备份后项目出现在列表，结构锁完好', async () => {
    const donor = await seedRepository([
      makeProject('prj_import', { name: '来自备份的一集' }),
    ]);
    const text = serializeEnvelope(await donor.exportAll());

    const repository = await seedRepository([]);
    const user = userEvent.setup();
    renderApp('/', { repository });
    await ready();

    const file = new File([text], 'backup.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('导入备份文件'), file);

    expect(await screen.findByText(/已从备份导入 1 个项目/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /来自备份的一集/ })).toBeInTheDocument();

    const stored = await repository.load('prj_import');
    expect(stored?.beats).toHaveLength(BEAT_COUNT);
    expect(stored?.beats.map((beat) => beat.gridSize)).toEqual([3, 3, 3, 3, 2]);
  });

  it('导入不是本产品的文件时报错且不改库', async () => {
    const repository = await seedRepository([]);
    const user = userEvent.setup();
    renderApp('/', { repository });
    await ready();

    const file = new File(['{"kind":"other"}'], 'x.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('导入备份文件'), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(/不是节拍板备份文件/);
    expect(await repository.list()).toEqual([]);
  });
});

describe('列表展示', () => {
  it('卡片显示完成度点阵（分母恒为 5）与已生成段数', async () => {
    const repository = await seedRepository([
      withVideos(
        {
          ...makeProject('prj_1', { name: '第一集' }),
          beats: makeProject('prj_1').beats.map((beat, i) =>
            i < 3 ? { ...beat, status: 'filled' as const } : beat,
          ),
        },
        2,
      ),
    ]);
    renderApp('/', { repository });
    await ready();

    expect(screen.getByLabelText(`五节拍完成度 3/${BEAT_COUNT}`)).toBeInTheDocument();
    expect(screen.getByText(/3\/5 节拍已填 · 2 段已生成/)).toBeInTheDocument();
  });

  it('按更新时间倒序排列', async () => {
    const repository = await seedRepository([
      makeProject('prj_old', { name: '旧的一集' }, '2026-08-20T00:00:00.000Z'),
      makeProject('prj_new', { name: '新的一集' }, '2026-08-26T00:00:00.000Z'),
    ]);
    renderApp('/', { repository });
    await ready();

    const titles = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(titles).toEqual(['新的一集', '旧的一集']);
  });

  it('参数默认值来自基准表：单集 88 秒 / 五板 8·17·20·25·18', async () => {
    const repository = await seedRepository([makeProject('prj_1')]);
    const stored = await repository.load('prj_1');

    expect(stored?.episodeDurationSec).toBe(88);
    expect(stored?.beats.map((beat) => beat.durationSec)).toEqual([8, 17, 20, 25, 18]);
    expect(BASE_INPUT.aspectRatio).toBe('9:16');
  });
});
