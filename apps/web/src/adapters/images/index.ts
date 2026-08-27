/**
 * 节拍帧参考图适配层的公开入口。
 * 上层（`src/store/`、组件）只从这里 import，不直接摸驱动实现。
 */

export {
  ALLOWED_IMAGE_TYPES,
  FrameImageError,
  MAX_FRAME_IMAGE_BYTES,
  MAX_PROJECT_IMAGE_BYTES,
  assertProjectQuota,
  formatBytes,
  isAllowedImageType,
  normalizeImageType,
  readBytes,
  sniffImageType,
  validateImageBytes,
  type AllowedImageType,
  type FrameImageRejection,
  type ImageBytes,
} from './validation';

export {
  FRAME_ORDERS,
  assertFrameImageKey,
  decodeFrameImageKey,
  encodeFrameImageKey,
  framesForBeat,
  type FrameImageKey,
  type FrameOrder,
} from './frameImageKey';

export {
  IndexedDbFrameImageDriver,
  MemoryFrameImageDriver,
  UnavailableFrameImageDriver,
  selectFrameImageDriver,
  type FrameImageDriver,
  type FrameImageStorageKind,
  type StoredFrameImageMeta,
} from './frameImageDriver';

export {
  FrameImageStore,
  createFrameImageStore,
  createMemoryFrameImageStore,
  type FrameImage,
  type FrameImageMeta,
  type FrameImageUsage,
} from './frameImageStore';
