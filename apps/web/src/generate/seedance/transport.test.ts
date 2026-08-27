/**
 * 传输层 v2 的形状与桩件行为（FR-4-09、AC-6.4）。
 *
 * 三条底线在这里钉住：请求体恰为三个字段、默认实现是不出网的桩件、
 * 轮询是可选的（v1 那种「一次调用直接拿成片」的形状不再是唯一选项）。
 */

import { describe, expect, it, vi } from 'vitest';
import { createBeat1Sample } from '../../testing/goldens';
import { findSecretLikeKeys } from './redline';
import {
  SEEDANCE_BEAT_REQUEST_KEYS,
  SEEDANCE_TRANSPORT_VERSION,
  STUB_VIDEO_URL_PREFIX,
  buildBeatRequest,
  createScriptedBeatTransport,
  createStubBeatTransport,
  pollTimeoutFailure,
  resolveSeedanceTransport,
  stubJobId,
  submitFailure,
  supportsPolling,
  type SeedanceBeatRequest,
  type SeedanceBeatTransport,
} from './transport';
import {
  interfaceBody,
  interfacePropertyNames,
  readSeedanceSource,
} from './testing/sourceScan';

const TRANSPORT_SOURCE = readSeedanceSource('transport.ts');

describe('请求体形状', () => {
  it('字段恰为 prompt / duration_sec / reference_image_keys', () => {
    const request = buildBeatRequest({
      prompt: '一句 prompt',
      duration_sec: 8,
      reference_image_keys: ['img_b1_c1_a.png'],
    });
    expect(Object.keys(request)).toEqual([...SEEDANCE_BEAT_REQUEST_KEYS]);
    expect(Object.isFrozen(request)).toBe(true);
  });

  it('参考图键缺省即空数组，不占位', () => {
    expect(buildBeatRequest({ prompt: 'p', duration_sec: 8 }).reference_image_keys).toEqual([]);
  });

  it('接口源码里没有凭据字段', () => {
    const declared = interfacePropertyNames(TRANSPORT_SOURCE, 'SeedanceBeatRequest');
    expect([...declared].sort()).toEqual([...SEEDANCE_BEAT_REQUEST_KEYS].sort());
    expect(findSecretLikeKeys(declared)).toEqual([]);
    expect(findSecretLikeKeys(interfacePropertyNames(TRANSPORT_SOURCE, 'SeedanceBeatTransport')))
      .toEqual([]);
  });

  it('请求体接口里没有组间衔接 / 节拍名称 / 备注，也没有镜头级字段', () => {
    const body = interfaceBody(TRANSPORT_SOURCE, 'SeedanceBeatRequest');
    expect(body).not.toMatch(/transition|title|note|camera|lens/i);
  });

  it('幂等键与取消信号是传输级选项，不进请求体', () => {
    const options = interfacePropertyNames(TRANSPORT_SOURCE, 'SeedanceSubmitOptions');
    expect([...options].sort()).toEqual(['idempotency_key', 'signal']);
    expect(interfaceBody(TRANSPORT_SOURCE, 'SeedanceBeatRequest')).not.toContain('idempotency_key');
  });
});

describe('默认传输层', () => {
  it('没传就是桩件，且协议是 v2', () => {
    const transport = resolveSeedanceTransport();
    expect(transport.kind).toBe('stub');
    expect(transport.version).toBe(SEEDANCE_TRANSPORT_VERSION);
    expect(SEEDANCE_TRANSPORT_VERSION).toBe(2);
  });

  it('桩件提交不出网、不鉴权，任务 id 确定性', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const transport = resolveSeedanceTransport();
    const request = buildBeatRequest({ prompt: 'p', duration_sec: 8 });

    const first = await transport.submitBeat(request);
    const second = await transport.submitBeat(request);

    expect(first).toEqual(second);
    expect(first.ok && first.job_id).toBe(stubJobId(request));
    expect(first.ok && first.job_id.startsWith('job_stub_')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('幂等键不同则任务 id 不同', async () => {
    const transport = createStubBeatTransport();
    const request = buildBeatRequest({ prompt: 'p', duration_sec: 8 });
    const a = await transport.submitBeat(request, { idempotency_key: 'idem_a' });
    const b = await transport.submitBeat(request, { idempotency_key: 'idem_b' });
    expect(a.ok && b.ok && a.job_id === b.job_id).toBe(false);
  });

  it('桩件支持模拟延迟', async () => {
    const transport = createStubBeatTransport({ latencyMs: 1 });
    await expect(
      transport.submitBeat(buildBeatRequest({ prompt: 'p', duration_sec: 8 })),
    ).resolves.toMatchObject({ ok: true });
  });

  it('传输层拒绝混入红线字段的请求体', async () => {
    const transport = createStubBeatTransport();
    const tainted = { prompt: 'p', duration_sec: 8, reference_image_keys: [], title: '开篇钩子' };
    await expect(
      transport.submitBeat(tainted as unknown as SeedanceBeatRequest),
    ).rejects.toThrow(/AC-6\.4/);
  });

  it('默认配置随桩件带上，但桩件不访问它', () => {
    expect(createStubBeatTransport().config.base_url).toBe('/api/seedance');
  });
});

describe('轮询是可选的', () => {
  it('桩件默认提供轮询，首次即成功并给出占位地址', async () => {
    const transport = createStubBeatTransport();
    const request = buildBeatRequest({ prompt: 'p', duration_sec: 8 });
    const submitted = await transport.submitBeat(request);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }
    expect(supportsPolling(transport)).toBe(true);
    const snapshot = await transport.pollJob?.(submitted.job_id);
    expect(snapshot?.status).toBe('SUCCEEDED');
    expect(snapshot?.status === 'SUCCEEDED' && snapshot.video_url).toContain(
      STUB_VIDEO_URL_PREFIX,
    );
  });

  it('可以配置前 n 次报生成中', async () => {
    const transport = createStubBeatTransport({ runningPolls: 2 });
    const request = buildBeatRequest({ prompt: 'p', duration_sec: 8 });
    const submitted = await transport.submitBeat(request);
    if (!submitted.ok || !supportsPolling(transport)) {
      throw new Error('桩件应当提交成功且支持轮询');
    }
    const statuses = [
      (await transport.pollJob(submitted.job_id)).status,
      (await transport.pollJob(submitted.job_id)).status,
      (await transport.pollJob(submitted.job_id)).status,
    ];
    expect(statuses).toEqual(['RUNNING', 'RUNNING', 'SUCCEEDED']);
  });

  it('不实现轮询的传输层同样合法', () => {
    const transport = createStubBeatTransport({ poll: false });
    expect(transport.pollJob).toBeUndefined();
    expect(supportsPolling(transport)).toBe(false);
  });
});

describe('协议版本校验', () => {
  it('v1 形状的传输层在装配期就被拒绝', () => {
    const v1 = { version: 1, kind: 'stub', submitBeat: async () => ({ ok: true, job_id: 'x' }) };
    expect(() =>
      resolveSeedanceTransport({ transport: v1 as unknown as SeedanceBeatTransport }),
    ).toThrow(/版本不匹配/);
  });
});

describe('剧本传输层', () => {
  it('按序返回失败，用尽后回落桩件成功', async () => {
    const transport = createScriptedBeatTransport([
      { ok: false, failure: submitFailure('502 Bad Gateway') },
      { ok: false, failure: pollTimeoutFailure(300_000) },
    ]);
    const request = buildBeatRequest({ prompt: 'p', duration_sec: 8 });
    const results = [
      await transport.submitBeat(request),
      await transport.submitBeat(request),
      await transport.submitBeat(request),
    ];
    expect(results.map((result) => result.ok)).toEqual([false, false, true]);
    expect(results[0]?.ok === false && results[0].failure.error_class).toBe('API_ERROR');
    expect(results[0]?.ok === false && results[0].failure.retryable).toBe(true);
    expect(results[1]?.ok === false && results[1].failure.code).toBe('POLL_TIMEOUT');
  });
});

describe('黄金样例的请求体', () => {
  it('填满的 Beat 1 组出的请求体里没有衔接、名称、备注与凭据', () => {
    const { beat } = createBeat1Sample();
    const request = buildBeatRequest({
      prompt: '组装好的 prompt',
      duration_sec: beat.duration_sec,
      reference_image_keys: ['img_b1_c1_a.png'],
    });
    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain(beat.transition_rule);
    expect(serialized).not.toContain(beat.title);
    expect(serialized).not.toContain(beat.note);
    expect(serialized).not.toMatch(/api[_-]?key|token|secret|authorization/i);
  });
});
