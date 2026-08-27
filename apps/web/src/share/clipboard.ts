/**
 * 复制到剪贴板（W4/FEISHU-EXPORT）。
 *
 * 和 `export/download.ts` 一个套路：动作被抽成可注入的函数。理由也一样——
 * `navigator.clipboard` 在 jsdom 里不存在、在非安全上下文里会被浏览器拒绝，
 * 而「复制失败」必须变成页面上一句可读的话，不能是控制台里的一条红字。
 *
 * 只做纯文本（`writeText`）。飞书粘贴 Markdown 文本时会自行解析成块级元素，
 * 不需要 `text/html` 版本；写 HTML 反而会把代码块里的 Prompt 全文变成富文本。
 */

export type ClipboardWriter = (text: string) => Promise<void>;

export const CLIPBOARD_UNSUPPORTED_MESSAGE =
  '当前环境不支持一键复制，请展开下方预览手动全选复制' as const;

export function canCopyToClipboard(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.writeText === 'function' &&
    typeof window !== 'undefined' &&
    window.isSecureContext !== false
  );
}

/** 环境不支持时的实现：如实失败，让调用方把原因显示出来。 */
export const unsupportedClipboard: ClipboardWriter = () =>
  Promise.reject(new Error(CLIPBOARD_UNSUPPORTED_MESSAGE));

export function createBrowserClipboard(): ClipboardWriter {
  if (!canCopyToClipboard()) {
    return unsupportedClipboard;
  }
  return (text) => navigator.clipboard.writeText(text);
}

/** 复制失败时的可读原因；非 `Error` 抛出物也能落到一句话上。 */
export function copyFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }
  return CLIPBOARD_UNSUPPORTED_MESSAGE;
}
