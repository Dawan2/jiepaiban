import '@testing-library/jest-dom/vitest';

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
