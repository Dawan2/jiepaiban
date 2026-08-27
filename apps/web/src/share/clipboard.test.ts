/**
 * 剪贴板实现（W4/FEISHU-EXPORT）。
 *
 * 主张只有一条：不支持的环境**不静默**。`createBrowserClipboard` 在 jsdom 里
 * 回落到一个会如实失败的实现，面板据此把原因显示成一句人话（IX-3）。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLIPBOARD_UNSUPPORTED_MESSAGE,
  canCopyToClipboard,
  copyFailureMessage,
  createBrowserClipboard,
  unsupportedClipboard,
} from './clipboard';

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true });
}

afterEach(() => {
  if (original === undefined) {
    Reflect.deleteProperty(navigator, 'clipboard');
  } else {
    Object.defineProperty(navigator, 'clipboard', original);
  }
});

describe('能力探测', () => {
  it('jsdom 默认没有 navigator.clipboard，判定为不支持', () => {
    setClipboard(undefined);
    expect(canCopyToClipboard()).toBe(false);
  });

  it('有 writeText 时判定为支持', () => {
    setClipboard({ writeText: () => Promise.resolve() });
    expect(canCopyToClipboard()).toBe(true);
  });
});

describe('浏览器实现', () => {
  it('支持时把文本原样交给 writeText', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });

    await createBrowserClipboard()('# 婚宴反转 · 节拍板导出');

    expect(writeText).toHaveBeenCalledWith('# 婚宴反转 · 节拍板导出');
  });

  it('不支持时回落到会失败的实现，不静默吞掉', async () => {
    setClipboard(undefined);

    await expect(createBrowserClipboard()('任意文本')).rejects.toThrow(
      CLIPBOARD_UNSUPPORTED_MESSAGE,
    );
    await expect(unsupportedClipboard('任意文本')).rejects.toThrow(CLIPBOARD_UNSUPPORTED_MESSAGE);
  });

  it('浏览器自己拒绝时把原因原样透出', async () => {
    setClipboard({ writeText: () => Promise.reject(new Error('用户未授权剪贴板写入')) });

    await expect(createBrowserClipboard()('任意文本')).rejects.toThrow('用户未授权剪贴板写入');
  });
});

describe('失败文案', () => {
  it('Error 用它自己的 message', () => {
    expect(copyFailureMessage(new Error('写入被拒绝'))).toBe('写入被拒绝');
  });

  it('非 Error 抛出物与空 message 都回落到通用提示', () => {
    expect(copyFailureMessage('字符串')).toBe(CLIPBOARD_UNSUPPORTED_MESSAGE);
    expect(copyFailureMessage(new Error('  '))).toBe(CLIPBOARD_UNSUPPORTED_MESSAGE);
    expect(copyFailureMessage(undefined)).toBe(CLIPBOARD_UNSUPPORTED_MESSAGE);
  });
});
