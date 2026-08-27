/**
 * 图片测试夹具（W4/IMAGE-STORE）。
 *
 * 这些字节头是**真的**格式魔数，不是随手写的占位符：准入校验以文件头为准，
 * 夹具若用假内容，所有"存进去 / 读回来"的断言都会退化成"被拒收"的断言，
 * 等于什么都没测到。反例（{@link textFile} / {@link renamedTextAsPng}）同理，
 * 必须是真的非图片字节才能证明签名校验起了作用。
 */

export const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
export const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0] as const;
export const GIF_MAGIC = [...'GIF89a'].map((char) => char.charCodeAt(0));
export const WEBP_MAGIC = [...'RIFF\u0000\u0000\u0000\u0000WEBP'].map((char) => char.charCodeAt(0));
export const AVIF_MAGIC = [...'\u0000\u0000\u0000\u0020ftypavif'].map((char) => char.charCodeAt(0));

function file(name: string, type: string, magic: readonly number[], padding: number): File {
  const bytes = new Uint8Array([...magic, ...new Array<number>(padding).fill(0x20)]);
  return new File([bytes], name, { type });
}

export function pngFile(name = 'frame.png', padding = 16): File {
  return file(name, 'image/png', PNG_MAGIC, padding);
}

export function jpegFile(name = 'frame.jpg', padding = 16): File {
  return file(name, 'image/jpeg', JPEG_MAGIC, padding);
}

export function gifFile(name = 'frame.gif'): File {
  return file(name, 'image/gif', GIF_MAGIC, 8);
}

export function webpFile(name = 'frame.webp'): File {
  return file(name, 'image/webp', WEBP_MAGIC, 8);
}

export function avifFile(name = 'frame.avif'): File {
  return file(name, 'image/avif', AVIF_MAGIC, 8);
}

/** 大小刚好超过给定上限的 PNG。 */
export function oversizedPngFile(limitBytes: number, name = 'huge.png'): File {
  return file(name, 'image/png', PNG_MAGIC, limitBytes + 1 - PNG_MAGIC.length);
}

/** 真的不是图片。 */
export function textFile(name = 'notes.txt', type = 'text/plain'): File {
  return new File([new Uint8Array([...'hello'].map((c) => c.charCodeAt(0)))], name, { type });
}

/** 文本改名成 `.png` 并伪造 MIME：只信 `File.type` 的实现会放它进库。 */
export function renamedTextAsPng(name = 'trojan.png'): File {
  return new File([new Uint8Array([...'MZ hello'].map((c) => c.charCodeAt(0)))], name, {
    type: 'image/png',
  });
}

/** 声明类型为空（部分拖拽来源就是这样），内容是合法 PNG。 */
export function pngWithoutDeclaredType(name = 'dragged'): File {
  return file(name, '', PNG_MAGIC, 16);
}

export function bytesOf(magic: readonly number[], padding = 0): Uint8Array<ArrayBuffer> {
  return new Uint8Array([...magic, ...new Array<number>(padding).fill(0x20)]);
}
