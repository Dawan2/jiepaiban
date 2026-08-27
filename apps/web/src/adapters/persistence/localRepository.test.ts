/**
 * 仓储与驱动的落盘回归。
 *
 * 同一批断言跑在三种驱动上（内存 / localStorage / IndexedDB），
 * 以此保证「换存储介质不改业务行为」这条端口化承诺是真的，而不是只写在文档里。
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BEAT_COUNT } from '../../domain/beats';
import type { NewProjectInput } from '../../domain/projects';
import {
  CANON_TOTAL_DURATION_SEC,
  createEmptyProject,
  reuseProject,
  setArchived,
} from '../../store/projectFactory';
import {
  IndexedDbDriver,
  LocalStorageDriver,
  MemoryDriver,
  type StorageDriver,
} from './drivers';
import { ArchiveFormatError, deserializeEnvelope, serializeEnvelope } from './envelope';
import { ProjectLockError } from './locks';
import { LocalRepository, importFromText } from './localRepository';
import { ENVELOPE_KIND, SCHEMA_VERSION, type StoredProject } from './schema';

const input: NewProjectInput = {
  name: '重生之我在末世卖煎饼',
  genre: '末世·爽剧',
  aspectRatio: '9:16',
  episodeDurationSec: CANON_TOTAL_DURATION_SEC,
  stylePrompt: '冷调赛博废土',
  protagonist: '短发女青年',
};

let tick = 0;
const clock = () => `2026-08-27T00:00:${String(tick++).padStart(2, '0')}.000Z`;

function project(id: string, name = input.name): StoredProject {
  return createEmptyProject({ ...input, name }, id, clock());
}

function withVideos(source: StoredProject, count: number): StoredProject {
  return {
    ...source,
    beats: source.beats.map((beat, i) =>
      i < count
        ? { ...beat, videoUrl: `https://cdn.example.com/${beat.index}.mp4`, status: 'generated' }
        : beat,
    ),
  };
}

/** 每种驱动一个工厂，保证用例之间互不串数据。 */
const drivers: readonly [string, () => StorageDriver][] = [
  ['内存', () => new MemoryDriver()],
  ['localStorage', () => new LocalStorageDriver(window.localStorage)],
  ['IndexedDB', () => new IndexedDbDriver(indexedDB)],
];

describe.each(drivers)('LocalRepository（%s 驱动）', (_label, makeDriver) => {
  let repository: LocalRepository;

  beforeEach(async () => {
    tick = 0;
    const driver = makeDriver();
    await driver.clear();
    repository = new LocalRepository(driver, clock);
  });

  it('保存后能按 id 读回完整的 5 板结构', async () => {
    const saved = project('prj_1');
    await repository.save(saved);

    const loaded = await repository.load('prj_1');
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe(saved.name);
    expect(loaded?.beats).toHaveLength(BEAT_COUNT);
    expect(loaded?.beats.map((beat) => beat.gridSize)).toEqual([3, 3, 3, 3, 2]);
  });

  it('读不到的项目返回 null，而不是抛错', async () => {
    expect(await repository.load('prj_missing')).toBeNull();
  });

  it('列表按更新时间倒序，并投影出完成度与视频数', async () => {
    await repository.save(project('prj_1', '第一集'));
    await repository.save(withVideos(project('prj_2', '第二集'), 2));

    const summaries = await repository.list();
    expect(summaries.map((summary) => summary.name)).toEqual(['第二集', '第一集']);

    const second = summaries[0];
    expect(second?.totalBeats).toBe(BEAT_COUNT);
    expect(second?.videoCount).toBe(2);
    expect(second?.filledBeats).toBe(2);
  });

  it('归档态与复用来源随项目一起落盘', async () => {
    const source = project('prj_1');
    await repository.save(source);
    await repository.save(setArchived(source, true, clock()));
    await repository.save(reuseProject(source, 'prj_2', clock()));

    const byId = new Map((await repository.list()).map((summary) => [summary.id, summary]));
    expect(byId.get('prj_1')?.archived).toBe(true);
    expect(byId.get('prj_2')?.archived).toBe(false);
    expect(byId.get('prj_2')?.reusedFromId).toBe('prj_1');
  });

  it('删除后列表与单读都拿不到该项目', async () => {
    await repository.save(project('prj_1'));
    await repository.save(project('prj_2', '第二集'));

    await repository.remove('prj_1');

    expect(await repository.load('prj_1')).toBeNull();
    expect((await repository.list()).map((summary) => summary.id)).toEqual(['prj_2']);
  });

  it('保存是按 id 覆盖，不会堆出重复记录', async () => {
    const saved = project('prj_1');
    await repository.save(saved);
    await repository.save({ ...saved, name: '改了名' });

    const summaries = await repository.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.name).toBe('改了名');
  });

  it('结构违规的项目拒绝落库（第 6 块板进不来）', async () => {
    const saved = project('prj_1');
    const sixth = saved.beats[0];
    if (sixth === undefined) {
      throw new Error('缺少第 1 块板');
    }

    await expect(repository.save({ ...saved, beats: [...saved.beats, sixth] })).rejects.toThrow(
      ProjectLockError,
    );
    expect(await repository.load('prj_1')).toBeNull();
  });

  it('衔接文案泄漏进 Prompt 快照时拒绝落库（RULE-9 / AC-6.4）', async () => {
    const saved = project('prj_1');
    const leaked: StoredProject = {
      ...saved,
      beats: saved.beats.map((beat, i) =>
        i === 0 ? { ...beat, transition: '卡点硬切', promptFinal: '…时长8秒，卡点硬切' } : beat,
      ),
    };

    await expect(repository.save(leaked)).rejects.toThrow(/衔接文案泄漏进 Prompt 快照/);
  });

  it('导出封套带版本号，导入后逐字还原', async () => {
    await repository.save(withVideos(project('prj_1'), 1));
    await repository.save(project('prj_2', '第二集'));

    const envelope = await repository.exportAll();
    expect(envelope.kind).toBe(ENVELOPE_KIND);
    expect(envelope.schemaVersion).toBe(SCHEMA_VERSION);
    expect(envelope.projects).toHaveLength(2);

    const restored = new LocalRepository(makeDriver(), clock);
    await restored.importAll(envelope, 'replace');

    expect((await restored.list()).map((summary) => summary.id).sort()).toEqual([
      'prj_1',
      'prj_2',
    ]);
    expect((await restored.load('prj_1'))?.beats[0]?.videoUrl).toBe(
      'https://cdn.example.com/1.mp4',
    );
  });

  it('JSON 文本往返：导出的文本能原样导入', async () => {
    await repository.save(project('prj_1'));
    const text = serializeEnvelope(await repository.exportAll());

    const restored = new LocalRepository(makeDriver(), clock);
    const count = await importFromText(restored, text, 'replace');

    expect(count).toBe(1);
    expect((await restored.load('prj_1'))?.beats).toHaveLength(BEAT_COUNT);
  });

  it('merge 导入保留库里其他项目，replace 导入先清库', async () => {
    await repository.save(project('prj_1'));
    const envelope = await repository.exportAll();

    await repository.save(project('prj_local', '本地新建'));
    await repository.importAll(envelope, 'merge');
    expect((await repository.list()).map((summary) => summary.id).sort()).toEqual([
      'prj_1',
      'prj_local',
    ]);

    await repository.importAll(envelope, 'replace');
    expect((await repository.list()).map((summary) => summary.id)).toEqual(['prj_1']);
  });

  it('导入违规备份时整批拒绝，不做部分导入', async () => {
    const good = project('prj_good');
    const bad = project('prj_bad');
    const envelope = {
      kind: ENVELOPE_KIND,
      schemaVersion: SCHEMA_VERSION,
      savedAt: clock(),
      projects: [good, { ...bad, beats: bad.beats.slice(0, 4) }],
    } as const;

    await expect(repository.importAll(envelope, 'merge')).rejects.toThrow(ProjectLockError);
    expect(await repository.list()).toEqual([]);
  });
});

describe('落库封套与迁移（架构 §5 持久化与迁移）', () => {
  it('读回时把宫格数归一到锁定值（历史数据修复）', async () => {
    const driver = new MemoryDriver();
    await driver.clear();
    const saved = project('prj_1');
    // 绕过仓储直接塞一条 B5 记为 3 宫格的旧数据。
    await driver.put('prj_1', {
      ...saved,
      beats: saved.beats.map((beat) => ({ ...beat, gridSize: 3 })),
    });

    const loaded = await new LocalRepository(driver, clock).load('prj_1');
    expect(loaded?.beats.map((beat) => beat.gridSize)).toEqual([3, 3, 3, 3, 2]);
  });

  it('拒绝非本产品的备份文件', () => {
    expect(() => deserializeEnvelope('{"kind":"other","schemaVersion":1,"projects":[]}')).toThrow(
      ArchiveFormatError,
    );
  });

  it('拒绝非法 JSON 与缺版本号的备份', () => {
    expect(() => deserializeEnvelope('not json')).toThrow(/不是合法 JSON/);
    expect(() => deserializeEnvelope(`{"kind":"${ENVELOPE_KIND}","projects":[]}`)).toThrow(
      /schemaVersion/,
    );
  });

  it('拒绝高于当前程序版本的备份，提示先升级', () => {
    const future = JSON.stringify({
      kind: ENVELOPE_KIND,
      schemaVersion: SCHEMA_VERSION + 1,
      savedAt: '',
      projects: [],
    });
    expect(() => deserializeEnvelope(future)).toThrow(/高于当前程序支持/);
  });
});
