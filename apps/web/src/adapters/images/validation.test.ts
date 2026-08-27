/**
 * 参考图准入校验的纯函数用例（W4/IMAGE-STORE）。
 *
 * 这一层不碰存储，所以体积边界能直接按字节数造，不必真去搬 8 MiB 文件。
 */

import { describe, expect, it } from 'vitest';
import {
  AVIF_MAGIC,
  GIF_MAGIC,
  JPEG_MAGIC,
  PNG_MAGIC,
  WEBP_MAGIC,
  bytesOf,
} from '../../testing/imageFixtures';
import {
  ALLOWED_IMAGE_TYPES,
  FrameImageError,
  MAX_FRAME_IMAGE_BYTES,
  MAX_PROJECT_IMAGE_BYTES,
  assertProjectQuota,
  formatBytes,
  isAllowedImageType,
  normalizeImageType,
  sniffImageType,
  validateImageBytes,
  type FrameImageRejection,
} from './validation';

function rejection(run: () => unknown): FrameImageRejection {
  try {
    run();
  } catch (cause) {
    expect(cause).toBeInstanceOf(FrameImageError);
    return (cause as FrameImageError).reason;
  }
  throw new Error('期望抛出 FrameImageError，但调用成功返回了');
}

describe('字节签名识别（sniffImageType）', () => {
  it.each([
    ['PNG', PNG_MAGIC, 'image/png'],
    ['JPEG', JPEG_MAGIC, 'image/jpeg'],
    ['GIF', GIF_MAGIC, 'image/gif'],
    ['WebP', WEBP_MAGIC, 'image/webp'],
    ['AVIF', AVIF_MAGIC, 'image/avif'],
  ])('认得 %s 的文件头', (_label, magic, expected) => {
    expect(sniffImageType(bytesOf(magic, 8))).toBe(expected);
  });

  it('白名单外的图片（SVG / BMP / TIFF）与非图片一律返回 null', () => {
    const svg = bytesOf([...'<svg xmlns'].map((c) => c.charCodeAt(0)));
    const bmp = bytesOf([0x42, 0x4d, 0x36, 0x00], 8);
    const tiff = bytesOf([0x49, 0x49, 0x2a, 0x00], 8);
    const pe = bytesOf([0x4d, 0x5a, 0x90, 0x00], 8);

    expect(sniffImageType(svg)).toBeNull();
    expect(sniffImageType(bmp)).toBeNull();
    expect(sniffImageType(tiff)).toBeNull();
    expect(sniffImageType(pe)).toBeNull();
  });

  it('字节不足以判断时不猜（截断的 PNG 头返回 null）', () => {
    expect(sniffImageType(new Uint8Array(PNG_MAGIC.slice(0, 4)))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });

  it('WebP 必须同时有 RIFF 与 WEBP 两段标记', () => {
    const riffOnly = bytesOf([...'RIFF\u0000\u0000\u0000\u0000AVI '].map((c) => c.charCodeAt(0)));
    expect(sniffImageType(riffOnly)).toBeNull();
  });
});

describe('MIME 归一与白名单', () => {
  it('image/jpg 归一到 image/jpeg，大小写与参数被忽略', () => {
    expect(normalizeImageType('image/jpg')).toBe('image/jpeg');
    expect(normalizeImageType(' IMAGE/PNG ')).toBe('image/png');
    expect(normalizeImageType('image/webp;charset=binary')).toBe('image/webp');
  });

  it('白名单恰是五种静态图片格式', () => {
    expect([...ALLOWED_IMAGE_TYPES]).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/avif',
    ]);
    expect(isAllowedImageType('image/svg+xml')).toBe(false);
    expect(isAllowedImageType('application/pdf')).toBe(false);
    expect(isAllowedImageType('image/jpg')).toBe(true);
  });
});

describe('单图准入（validateImageBytes）', () => {
  it('返回以签名为准的类型', () => {
    expect(validateImageBytes(bytesOf(PNG_MAGIC, 8), 'image/png')).toBe('image/png');
    expect(validateImageBytes(bytesOf(JPEG_MAGIC, 8), 'image/jpg')).toBe('image/jpeg');
  });

  it('声明类型为空时完全以签名为准', () => {
    expect(validateImageBytes(bytesOf(GIF_MAGIC, 4), '')).toBe('image/gif');
  });

  it('声明与签名不符判为伪装', () => {
    expect(rejection(() => validateImageBytes(bytesOf(PNG_MAGIC, 8), 'image/webp'))).toBe('content');
  });

  it('声明类型不在白名单里先被拦掉', () => {
    expect(rejection(() => validateImageBytes(bytesOf(PNG_MAGIC, 8), 'image/svg+xml'))).toBe('type');
    expect(rejection(() => validateImageBytes(bytesOf(PNG_MAGIC, 8), 'application/pdf'))).toBe('type');
  });

  it('空字节判为空文件', () => {
    expect(rejection(() => validateImageBytes(new Uint8Array(), 'image/png'))).toBe('empty');
  });

  it('恰好等于上限放行，多一个字节即拒', () => {
    const padding = MAX_FRAME_IMAGE_BYTES - PNG_MAGIC.length;
    expect(validateImageBytes(bytesOf(PNG_MAGIC, padding), 'image/png')).toBe('image/png');
    expect(rejection(() => validateImageBytes(bytesOf(PNG_MAGIC, padding + 1), 'image/png'))).toBe(
      'too-large',
    );
  });

  it('拒收文案给得出可执行的下一步（说明支持哪些格式 / 多大）', () => {
    expect(() => validateImageBytes(bytesOf([0x42, 0x4d], 8), '')).toThrow(/image\/png/);
    expect(() =>
      validateImageBytes(bytesOf(PNG_MAGIC, MAX_FRAME_IMAGE_BYTES), 'image/png'),
    ).toThrow(/8 MB/);
  });
});

describe('项目配额（assertProjectQuota）', () => {
  it('未超上限时通过', () => {
    expect(() => assertProjectQuota(0, 0, 1024)).not.toThrow();
    expect(() => assertProjectQuota(MAX_PROJECT_IMAGE_BYTES - 10, 0, 10)).not.toThrow();
  });

  it('超一个字节即拒', () => {
    expect(rejection(() => assertProjectQuota(MAX_PROJECT_IMAGE_BYTES - 10, 0, 11))).toBe('quota');
  });

  it('覆盖时扣掉被替换那张的体积', () => {
    // 已满，但换上的比换下的更小 → 应放行。
    expect(() => assertProjectQuota(MAX_PROJECT_IMAGE_BYTES, 4096, 1024)).not.toThrow();
    expect(rejection(() => assertProjectQuota(MAX_PROJECT_IMAGE_BYTES, 1024, 4096))).toBe('quota');
  });
});

describe('体积文案（formatBytes）', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [8 * 1024 * 1024, '8 MB'],
    [64 * 1024 * 1024, '64 MB'],
  ])('%i 字节显示为 %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
