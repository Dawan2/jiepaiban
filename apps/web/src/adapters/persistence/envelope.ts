/**
 * 版本化封套与迁移链（架构文档 system-architecture §5「持久化与迁移」）。
 *
 * 规则：写入一律带 `schemaVersion`；读取时按版本链式迁移到 {@link SCHEMA_VERSION}，
 * 再交给 `assertProjectLocks` 校验。**每次结构变更必须在 {@link MIGRATIONS} 里补一个迁移函数**，
 * 并配一个迁移单测，否则老用户的库读不回来。
 */

import { ENVELOPE_KIND, SCHEMA_VERSION, type PersistedEnvelope, type StoredProject } from './schema';
import { normalizeProject } from './locks';

export class ArchiveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveFormatError';
  }
}

/** 未知版本的封套载荷，迁移函数逐级把它抬到当前版本。 */
type RawEnvelope = Record<string, unknown>;

/**
 * 迁移链：键为**源版本**，值为「把源版本载荷升到 源版本+1」的纯函数。
 * v1 是首个版本，故当前为空表；新增 v2 时在此登记 `1: (raw) => ...`。
 */
export const MIGRATIONS: Readonly<Record<number, (raw: RawEnvelope) => RawEnvelope>> = {};

export function createEnvelope(projects: readonly StoredProject[], savedAt: string): PersistedEnvelope {
  return {
    kind: ENVELOPE_KIND,
    schemaVersion: SCHEMA_VERSION,
    savedAt,
    projects,
  };
}

function readVersion(raw: RawEnvelope): number {
  const version = raw['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ArchiveFormatError(`备份缺少合法的 schemaVersion，读到 ${JSON.stringify(version)}`);
  }
  if (version > SCHEMA_VERSION) {
    throw new ArchiveFormatError(
      `备份版本 v${version} 高于当前程序支持的 v${SCHEMA_VERSION}，请先升级再导入`,
    );
  }
  return version;
}

/** 把任意历史版本的载荷迁移到当前版本。 */
function migrate(raw: RawEnvelope): RawEnvelope {
  let current = raw;
  let version = readVersion(raw);

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (step === undefined) {
      throw new ArchiveFormatError(`缺少 v${version} → v${version + 1} 的迁移函数，拒绝静默丢数据`);
    }
    current = step(current);
    version += 1;
  }

  return { ...current, schemaVersion: SCHEMA_VERSION };
}

/**
 * 解析并校验一个封套（导入文件或 IndexedDB 读回的载荷）。
 * 结构锁在此统一把关：任何一个项目违规，整批拒绝，不做部分导入。
 */
export function parseEnvelope(input: unknown): PersistedEnvelope {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ArchiveFormatError('备份格式不正确：顶层应为对象');
  }

  const raw = input as RawEnvelope;
  if (raw['kind'] !== ENVELOPE_KIND) {
    throw new ArchiveFormatError(`不是节拍板备份文件（kind 应为 ${ENVELOPE_KIND}）`);
  }

  const migrated = migrate(raw);
  const projects = migrated['projects'];
  if (!Array.isArray(projects)) {
    throw new ArchiveFormatError('备份格式不正确：projects 应为数组');
  }

  const savedAt = typeof migrated['savedAt'] === 'string' ? migrated['savedAt'] : '';

  return {
    kind: ENVELOPE_KIND,
    schemaVersion: SCHEMA_VERSION,
    savedAt,
    projects: (projects as StoredProject[]).map((project) => normalizeProject(project)),
  };
}

/** 导出为可下载的 JSON 文本（缩进 2 空格，便于人工比对与 diff）。 */
export function serializeEnvelope(envelope: PersistedEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/** 从导入文件文本解析。 */
export function deserializeEnvelope(text: string): PersistedEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ArchiveFormatError('备份文件不是合法 JSON');
  }
  return parseEnvelope(parsed);
}

/** 备份文件名：`jiepaiban-backup-YYYYMMDD-HHmm.json`。 */
export function archiveFileName(savedAt: string): string {
  const stamp = savedAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  return `jiepaiban-backup-${stamp}.json`;
}
