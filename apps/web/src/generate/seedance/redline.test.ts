/**
 * 出网口红线清单自测。清单本身是被测对象——
 * 判定式写漏了，上面所有依赖它的守卫都会静默通过。
 */

import { describe, expect, it } from 'vitest';
import { FORBIDDEN_SUBMISSION_KEYS } from '../adapter';
import {
  FORBIDDEN_BEAT_REQUEST_KEYS,
  assertBodyClean,
  assertNoSecretLikeKeys,
  collectKeys,
  findEnvAccess,
  findForbiddenBodyKeys,
  findSecretLikeKeys,
  isSecretLikeKey,
} from './redline';

describe('凭据字段判定', () => {
  it.each([
    'api_key',
    'apiKey',
    'APIKEY',
    'ark_api_key',
    'access_token',
    'refresh_token',
    'client_secret',
    'secretKey',
    'password',
    'credential',
    'Authorization',
    'auth_header',
    'bearer_token',
    'signature',
    'sign_key',
    'access_key_id',
    'private_key',
    'ak',
    'sk',
    'session_id',
    'cookie',
    'VITE_SEEDANCE_KEY',
  ])('判定 %s 为凭据字段', (key) => {
    expect(isSecretLikeKey(key)).toBe(true);
  });

  it.each([
    'base_url',
    'submit_path',
    'poll_path',
    'request_timeout_ms',
    'poll_interval_ms',
    'poll_max_wait_ms',
    'prompt',
    'duration_sec',
    'reference_image_keys',
    'job_id',
    'idempotency_key',
    'signal',
    'options',
    'request',
  ])('不误伤正常字段 %s', (key) => {
    expect(isSecretLikeKey(key)).toBe(false);
  });

  it('挑出的凭据字段保持输入顺序', () => {
    expect(findSecretLikeKeys(['prompt', 'token', 'duration_sec', 'api_key'])).toEqual([
      'token',
      'api_key',
    ]);
  });

  it('断言命中即抛，说明字段名与位置', () => {
    expect(() => assertNoSecretLikeKeys(['prompt', 'api_key'], '端点配置')).toThrow(
      /端点配置.*api_key/,
    );
    expect(() => assertNoSecretLikeKeys(['prompt'], '端点配置')).not.toThrow();
  });
});

describe('请求体字段清单', () => {
  it('是 v1 提交体禁用清单的超集，两份清单不会各自漂移', () => {
    FORBIDDEN_SUBMISSION_KEYS.forEach((key) => {
      expect(FORBIDDEN_BEAT_REQUEST_KEYS).toContain(key);
    });
  });

  it('覆盖组间衔接、节拍名称、备注与镜头级结构', () => {
    ['transition', 'transition_rule', 'title', 'note', 'camera_json', 'lens'].forEach((key) => {
      expect(FORBIDDEN_BEAT_REQUEST_KEYS).toContain(key);
    });
  });

  it('字段名收集会下钻嵌套对象与数组', () => {
    expect(collectKeys({ a: 1, b: { c: 2 }, d: [{ e: 3 }] })).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(collectKeys(null)).toEqual([]);
    expect(collectKeys('prompt')).toEqual([]);
  });

  it('干净请求体通过；藏在嵌套层的衔接字段照样被抓出来', () => {
    const clean = { prompt: '一句话', duration_sec: 8, reference_image_keys: [] };
    expect(findForbiddenBodyKeys(clean)).toEqual([]);
    expect(() => assertBodyClean(clean)).not.toThrow();

    const tainted = { prompt: '一句话', extra: { transition_rule: '音频预接' } };
    expect(findForbiddenBodyKeys(tainted)).toEqual(['transition_rule']);
    expect(() => assertBodyClean(tainted)).toThrow(/AC-6\.4/);
  });

  it('凭据字段与红线字段同时命中时不重复报', () => {
    expect(findForbiddenBodyKeys({ api_key: 'x', nested: { api_key: 'y' } })).toEqual(['api_key']);
  });
});

describe('环境变量读取扫描', () => {
  it('认得三种写法', () => {
    expect(findEnvAccess('const a = import.meta.env.VITE_KEY;').length).toBeGreaterThan(0);
    expect(findEnvAccess('const a = process.env.SEEDANCE_KEY;').length).toBeGreaterThan(0);
    expect(findEnvAccess('const a = "VITE_SEEDANCE_TOKEN";').length).toBeGreaterThan(0);
  });

  it('干净代码没有命中', () => {
    expect(findEnvAccess('const a = config.base_url;')).toEqual([]);
  });
});
