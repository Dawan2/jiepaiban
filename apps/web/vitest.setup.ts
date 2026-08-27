import '@testing-library/jest-dom/vitest';

/**
 * jsdom 缺三个 Blob / URL 相关的标准 API，而节拍帧参考图（W4）的读写正好全走它们。
 * 下面三个补丁**只影响测试环境**，生产代码里不存在同名分支；补的都是标准语义，
 * 不放宽任何断言：图片仍要过白名单、字节签名与体积上限。
 */

// jsdom 尚未实现 Blob.prototype.text()，而"导入备份"走的是标准的 File.text()。
// 这里用 FileReader 补一个等价实现，只影响测试环境，不进生产代码路径。
if (typeof Blob !== 'undefined' && Blob.prototype.text === undefined) {
  Object.defineProperty(Blob.prototype, 'text', {
    configurable: true,
    writable: true,
    value(this: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
        reader.readAsText(this);
      });
    },
  });
}

// 同理，jsdom 也没有 Blob.prototype.arrayBuffer()——图片入库要读原始字节做签名校验。
if (typeof Blob !== 'undefined' && Blob.prototype.arrayBuffer === undefined) {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    configurable: true,
    writable: true,
    value(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
        reader.readAsArrayBuffer(this);
      });
    },
  });
}

// jsdom 没实现 object URL。这里给一份带登记表的等价实现：
// revoke 后再取该 URL 会拿不到 Blob，于是"忘记 revoke / 提前 revoke"两类缺陷在测试里可被断言。
if (typeof URL !== 'undefined' && typeof URL.createObjectURL !== 'function') {
  const live = new Map<string, Blob>();
  let serial = 0;

  URL.createObjectURL = (object: Blob | MediaSource): string => {
    const url = `blob:jiepaiban/${(serial += 1)}`;
    live.set(url, object as Blob);
    return url;
  };

  URL.revokeObjectURL = (url: string): void => void live.delete(url);

  Object.defineProperty(URL, 'objectUrlRegistry', { value: live, configurable: true });
}
