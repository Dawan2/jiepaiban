/**
 * 文本文件下载（项目 JSON / 交付包清单）。
 *
 * 下载动作被抽成一个可注入的函数，理由有两个：浏览器 API（`Blob` +
 * `createObjectURL`）在 jsdom 里不一定存在；接后端以后同一个入口可以换成
 * 「请求服务端出包，返回签名 URL」而不动任何组件。
 */

export interface DownloadFile {
  readonly file_name: string;
  readonly text: string;
  readonly mime: string;
}

export type FileDownloader = (file: DownloadFile) => void;

/** 环境不支持时的空实现，调用方拿到 `false` 可以把按钮禁掉。 */
export const noopDownloader: FileDownloader = () => {};

export function canDownloadInBrowser(): boolean {
  return (
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof Blob !== 'undefined' &&
    typeof document !== 'undefined'
  );
}

/**
 * 浏览器实现：Blob → 临时对象地址 → 隐藏的 `<a download>` → 立即回收。
 * 不支持的环境（含 jsdom）回落到 {@link noopDownloader}，不抛错。
 */
export function createBrowserDownloader(): FileDownloader {
  if (!canDownloadInBrowser()) {
    return noopDownloader;
  }
  return (file) => {
    const blob = new Blob([file.text], { type: file.mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.file_name;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
}
