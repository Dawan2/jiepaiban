/**
 * 本地仓储：`ProjectRepository` 端口的唯一实现（架构文档 tech-stack §2.2）。
 *
 * 端口化的目的很明确：UI 与应用层只依赖 {@link ProjectRepository} 接口，
 * 日后接服务端时换一个实现即可，业务代码不动（system-architecture §7 阶段 3）。
 *
 * 读路径：驱动读出 → 迁移链 → `normalizeProject`（含结构锁断言）→ 交给上层。
 * 写路径：结构锁断言 → 驱动写入 → 刷新 `meta` 封套。断言失败即抛，违规结构不落库。
 */

import { deserializeEnvelope, createEnvelope, parseEnvelope } from './envelope';
import { normalizeProject } from './locks';
import { selectDriver, type StorageDriver, type StorageKind } from './drivers';
import {
  SCHEMA_VERSION,
  toSummary,
  type PersistedEnvelope,
  type ProjectSummary,
  type StoredProject,
} from './schema';

/** 导入策略。 */
export type ImportMode =
  /** 同 id 覆盖，其余保留（恢复自己的备份时的默认行为）。 */
  | 'merge'
  /** 清库后整体写入（换机 / 重置）。 */
  | 'replace';

export interface ProjectRepository {
  list(): Promise<readonly ProjectSummary[]>;
  load(id: string): Promise<StoredProject | null>;
  save(project: StoredProject): Promise<void>;
  remove(id: string): Promise<void>;
  exportAll(): Promise<PersistedEnvelope>;
  importAll(envelope: PersistedEnvelope, mode?: ImportMode): Promise<void>;
}

/** 时钟端口：测试注入固定实现，快照才稳定（architecture §5「确定性」）。 */
export type Clock = () => string;

const systemClock: Clock = () => new Date().toISOString();

export class LocalRepository implements ProjectRepository {
  constructor(
    private readonly driver: StorageDriver,
    private readonly now: Clock = systemClock,
  ) {}

  get storageKind(): StorageKind {
    return this.driver.kind;
  }

  /** 读出全部项目并逐个过锁；任何一条违规都会抛出，由上层进入数据修复提示。 */
  private async readAll(): Promise<StoredProject[]> {
    const records = await this.driver.getAll();
    return records.map((record) => normalizeProject(record as StoredProject));
  }

  async list(): Promise<readonly ProjectSummary[]> {
    const projects = await this.readAll();
    return projects
      .map((project) => toSummary(project))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<StoredProject | null> {
    const projects = await this.readAll();
    return projects.find((project) => project.id === id) ?? null;
  }

  async save(project: StoredProject): Promise<void> {
    const normalized = normalizeProject(project);
    await this.driver.put(normalized.id, normalized);
    await this.touchMeta();
  }

  async remove(id: string): Promise<void> {
    await this.driver.remove(id);
    await this.touchMeta();
  }

  async exportAll(): Promise<PersistedEnvelope> {
    const projects = await this.readAll();
    return createEnvelope(
      [...projects].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      this.now(),
    );
  }

  async importAll(envelope: PersistedEnvelope, mode: ImportMode = 'merge'): Promise<void> {
    // 先整批过锁再落任何一条：宁可整批拒绝，也不留下一半导入的库。
    const validated = parseEnvelope(envelope);

    if (mode === 'replace') {
      await this.driver.clear();
    }
    for (const project of validated.projects) {
      await this.driver.put(project.id, project);
    }
    await this.touchMeta();
  }

  private async touchMeta(): Promise<void> {
    await this.driver.setMeta({ schemaVersion: SCHEMA_VERSION, savedAt: this.now() });
  }
}

/** 从 JSON 文本导入（导入按钮直接用）。 */
export async function importFromText(
  repository: ProjectRepository,
  text: string,
  mode: ImportMode = 'merge',
): Promise<number> {
  const envelope = deserializeEnvelope(text);
  await repository.importAll(envelope, mode);
  return envelope.projects.length;
}

/** 浏览器环境下的默认仓储（IndexedDB → localStorage → 内存）。 */
export function createLocalRepository(now: Clock = systemClock): LocalRepository {
  return new LocalRepository(selectDriver(), now);
}
