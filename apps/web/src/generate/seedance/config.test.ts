/**
 * 端点配置的红线守卫（NFR-5、AC-6.4）。
 *
 * 核心用例是**扫接口源码**：「配置类型里不能出现凭据字段」是类型层的约束，
 * 类型在运行期不存在，只断言默认值的对象实例证不了这件事——
 * 有人往接口里加一个 `api_key?: string` 而不给默认值，实例断言照样全绿。
 * 所以这里直接读 `config.ts` 的源码，把 `interface SeedanceEndpointConfig` 当被测对象。
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEEDANCE_ENDPOINT_CONFIG,
  SEEDANCE_ENDPOINT_CONFIG_KEYS,
  createSeedanceEndpointConfig,
  pollUrl,
  submitUrl,
} from './config';
import { findEnvAccess, findSecretLikeKeys, isSecretLikeKey } from './redline';
import {
  interfaceBody,
  interfacePropertyNames,
  readSeedanceSource,
  stripComments,
} from './testing/sourceScan';

const CONFIG_SOURCE = readSeedanceSource('config.ts');

describe('配置接口源码扫描', () => {
  it('接口里声明的字段一个都不是凭据字段', () => {
    const declared = interfacePropertyNames(CONFIG_SOURCE, 'SeedanceEndpointConfig');
    expect(declared.length).toBeGreaterThan(0);
    expect(findSecretLikeKeys(declared)).toEqual([]);
  });

  it('接口声明恰好是封闭清单里的字段，没有多余的口子', () => {
    const declared = interfacePropertyNames(CONFIG_SOURCE, 'SeedanceEndpointConfig');
    expect([...declared].sort()).toEqual([...SEEDANCE_ENDPOINT_CONFIG_KEYS].sort());
  });

  it('接口源码里逐字不含 apiKey / token / secret / authorization 之类的写法', () => {
    const body = interfaceBody(CONFIG_SOURCE, 'SeedanceEndpointConfig');
    [
      'apiKey',
      'api_key',
      'apikey',
      'token',
      'secret',
      'credential',
      'authorization',
      'bearer',
      'password',
      'signature',
      'access_key',
      'cookie',
      'session',
    ].forEach((word) => {
      expect(body.toLowerCase()).not.toContain(word.toLowerCase());
    });
  });

  it('整个模块不读环境变量，也不含任何 VITE_ 变量名', () => {
    const code = stripComments(CONFIG_SOURCE);
    expect(findEnvAccess(code)).toEqual([]);
    expect(code).not.toContain('VITE_');
    expect(code).not.toMatch(/localStorage|sessionStorage|document\s*\.\s*cookie/);
  });

  it('接口里没有第二份时长上限：30s Cap 只由 domain/beats 定义', () => {
    const body = interfaceBody(CONFIG_SOURCE, 'SeedanceEndpointConfig');
    expect(body).not.toMatch(/duration|cap|max_beat/i);
    SEEDANCE_ENDPOINT_CONFIG_KEYS.forEach((key) => {
      expect(key).not.toMatch(/duration|cap/i);
    });
  });

  it('守卫工具本身有效：接口改名或凭据字段混入都能被发现', () => {
    expect(() => interfaceBody(CONFIG_SOURCE, 'NotAnInterface')).toThrow(/找不到 interface/);
    const tainted = 'interface Tainted {\n  readonly api_key: string;\n}';
    expect(findSecretLikeKeys(interfacePropertyNames(tainted, 'Tainted'))).toEqual(['api_key']);
    expect(isSecretLikeKey('base_url')).toBe(false);
  });
});

describe('默认配置', () => {
  it('运行期实例同样没有凭据字段', () => {
    expect(findSecretLikeKeys(Object.keys(DEFAULT_SEEDANCE_ENDPOINT_CONFIG))).toEqual([]);
    expect(JSON.stringify(DEFAULT_SEEDANCE_ENDPOINT_CONFIG)).not.toMatch(
      /api[_-]?key|token|secret|credential|authorization|bearer/i,
    );
  });

  it('默认走同源相对路径，不指向第三方域名', () => {
    expect(DEFAULT_SEEDANCE_ENDPOINT_CONFIG.base_url.startsWith('/')).toBe(true);
    expect(DEFAULT_SEEDANCE_ENDPOINT_CONFIG.base_url).not.toContain('://');
  });

  it('冻结且字段恰为封闭清单', () => {
    expect(Object.isFrozen(DEFAULT_SEEDANCE_ENDPOINT_CONFIG)).toBe(true);
    expect(Object.keys(DEFAULT_SEEDANCE_ENDPOINT_CONFIG).sort()).toEqual(
      [...SEEDANCE_ENDPOINT_CONFIG_KEYS].sort(),
    );
  });

  it('覆盖只改指定项，其余取默认', () => {
    const config = createSeedanceEndpointConfig({ poll_interval_ms: 500 });
    expect(config.poll_interval_ms).toBe(500);
    expect(config.base_url).toBe(DEFAULT_SEEDANCE_ENDPOINT_CONFIG.base_url);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('地址拼接会转义任务 id', () => {
    const config = createSeedanceEndpointConfig();
    expect(submitUrl(config)).toBe('/api/seedance/beats');
    expect(pollUrl(config, 'job stub/1')).toBe('/api/seedance/jobs/job%20stub%2F1');
  });
});
