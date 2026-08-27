/**
 * 节拍帧参考图的准入校验（W4/IMAGE-STORE）。
 *
 * 三道关，缺一不可：
 *
 * 1. **声明类型白名单**：只收 {@link ALLOWED_IMAGE_TYPES} 里的图片 MIME。
 * 2. **字节签名**（{@link sniffImageType}）：按文件头判断真实类型。
 *    只信 `File.type` 是不够的——那是浏览器按扩展名猜的，把 `.exe` 改名成 `.png`
 *    就能骗过白名单；本地库里塞进非图片字节，后果是 `<img>` 加载失败且用户无从排查。
 * 3. **体积上限**：单图 {@link MAX_FRAME_IMAGE_BYTES}，单项目 {@link MAX_PROJECT_IMAGE_BYTES}。
 *    IndexedDB 的配额是浏览器按站点整体分配的，一旦写爆，**项目本身也存不进去**——
 *    所以宁可在入口拒绝一张大图，也不能让图片把节拍数据挤掉。
 *
 * 失败一律抛 {@link FrameImageError}，并带机器可读的 {@link FrameImageRejection}，
 * UI 据此给出可执行的提示（换格式 / 压缩 / 先删旧图），不做静默丢弃。
 */

/**
 * 图片字节。显式写成 `Uint8Array<ArrayBuffer>`（而非默认的 `ArrayBufferLike`），
 * 好处是能直接喂给 `new Blob([...])`——`SharedArrayBuffer` 视图不是合法的 `BlobPart`。
 */
export type ImageBytes = Uint8Array<ArrayBuffer>;

/** 允许入库的图片 MIME。GIF 只取首帧展示，仍按静态图处理。 */
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** 单张参考图上限：8 MiB。手机直出与设计稿导出都在这条线以内。 */
export const MAX_FRAME_IMAGE_BYTES = 8 * 1024 * 1024;

/** 单项目图片总量上限：64 MiB（15 个帧位 × 约 4 MiB 的宽裕值）。 */
export const MAX_PROJECT_IMAGE_BYTES = 64 * 1024 * 1024;

/** 拒收原因，UI 按此分支给提示。 */
export type FrameImageRejection =
  /** 声明的 MIME 不在白名单里。 */
  | 'type'
  /** 空文件。 */
  | 'empty'
  /** 单图超过 {@link MAX_FRAME_IMAGE_BYTES}。 */
  | 'too-large'
  /** 字节签名不是图片，或与声明的 MIME 不符（改名伪装）。 */
  | 'content'
  /** 本项目图片总量将超过 {@link MAX_PROJECT_IMAGE_BYTES}。 */
  | 'quota'
  /** 帧位坐标非法（板序 / 帧序越界，或触碰宫格锁）。 */
  | 'key';

export class FrameImageError extends Error {
  constructor(
    readonly reason: FrameImageRejection,
    message: string,
  ) {
    super(message);
    this.name = 'FrameImageError';
  }
}

function fail(reason: FrameImageRejection, message: string): never {
  throw new FrameImageError(reason, message);
}

/** 人读体积，用于错误文案。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

/** `image/jpg` 之类的非标准写法归一到白名单里的标准 MIME。 */
export function normalizeImageType(declared: string): string {
  const type = declared.trim().toLowerCase().split(';')[0] ?? '';
  return type === 'image/jpg' ? 'image/jpeg' : type;
}

export function isAllowedImageType(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(normalizeImageType(type));
}

const ascii = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...bytes.subarray(from, to));

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);

/**
 * 按文件头识别真实图片类型；不是白名单内的图片则返回 `null`。
 *
 * 签名取自各格式规范：PNG 8 字节魔数、JPEG `FF D8 FF`（SOI + 首个标记）、
 * GIF 的 `GIF87a` / `GIF89a`、WebP 的 `RIFF....WEBP`、AVIF 的 `ftyp` + `avif` / `avis` 品牌。
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) {
    return 'image/gif';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(bytes, 8, 12))) {
    return 'image/avif';
  }
  return null;
}

/**
 * 单张图片的准入校验，返回**以字节签名为准**的类型（落库存这个，不存浏览器的猜测）。
 *
 * @param declaredType `File.type`。允许为空（某些拖拽来源不给），此时完全以签名为准；
 *   非空则必须与签名一致，不一致视为伪装。
 */
export function validateImageBytes(bytes: ImageBytes, declaredType: string): AllowedImageType {
  if (bytes.length === 0) {
    fail('empty', '这是个空文件，选一张真的图片再试');
  }
  if (bytes.length > MAX_FRAME_IMAGE_BYTES) {
    fail(
      'too-large',
      `图片 ${formatBytes(bytes.length)} 超过单张上限 ${formatBytes(MAX_FRAME_IMAGE_BYTES)}，请先压缩`,
    );
  }

  const declared = normalizeImageType(declaredType);
  if (declared !== '' && !isAllowedImageType(declared)) {
    fail(
      'type',
      `只支持 ${ALLOWED_IMAGE_TYPES.join(' / ')}，这个文件声明为 ${declared || '未知类型'}`,
    );
  }

  const sniffed = sniffImageType(bytes);
  if (sniffed === null) {
    fail('content', `文件内容不是支持的图片格式（只支持 ${ALLOWED_IMAGE_TYPES.join(' / ')}）`);
  }
  if (declared !== '' && declared !== sniffed) {
    fail('content', `文件内容与声明的类型不符：声明 ${declared}，实际是 ${sniffed}`);
  }

  return sniffed;
}

/** 项目配额校验：`已用 - 被覆盖的那张 + 新图`。 */
export function assertProjectQuota(usedBytes: number, replacedBytes: number, incoming: number): void {
  const next = usedBytes - replacedBytes + incoming;
  if (next > MAX_PROJECT_IMAGE_BYTES) {
    fail(
      'quota',
      `本项目参考图将占用 ${formatBytes(next)}，超过上限 ${formatBytes(MAX_PROJECT_IMAGE_BYTES)}，请先移除不用的图片`,
    );
  }
}

/**
 * 读出 Blob / File 的字节。
 *
 * 优先用 `Blob.arrayBuffer()`，缺失时退回 `FileReader`——jsdom 至今没实现前者，
 * 而这条路径必须能在单测里跑（测试环境的补丁写在 `vitest.setup.ts`，此处的兜底只是双保险）。
 */
export async function readBytes(blob: Blob): Promise<ImageBytes> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsArrayBuffer(blob);
  });
  return new Uint8Array(buffer);
}
