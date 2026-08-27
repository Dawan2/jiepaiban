/**
 * 持久化适配层的公开入口。
 * 上层（`src/store/`、路由组件）只从这里 import，不直接摸驱动实现。
 */

export {
  ENVELOPE_KIND,
  SCHEMA_VERSION,
  hasVideo,
  toStoredBeat,
  toSummary,
  videoCount,
  type PersistedEnvelope,
  type ProjectSummary,
  type StoredBeat,
  type StoredBeatList,
  type StoredProject,
} from './schema';

export {
  FORBIDDEN_BEAT_FIELDS,
  ProjectLockError,
  assertProjectLocks,
  normalizeProject,
  rebuildBeat,
} from './locks';

export {
  ArchiveFormatError,
  MIGRATIONS,
  archiveFileName,
  createEnvelope,
  deserializeEnvelope,
  parseEnvelope,
  serializeEnvelope,
} from './envelope';

export {
  DB_NAME,
  IndexedDbDriver,
  LOCAL_STORAGE_PREFIX,
  LocalStorageDriver,
  MemoryDriver,
  selectDriver,
  type StorageDriver,
  type StorageKind,
} from './drivers';

export {
  LocalRepository,
  createLocalRepository,
  importFromText,
  type Clock,
  type ImportMode,
  type ProjectRepository,
} from './localRepository';
