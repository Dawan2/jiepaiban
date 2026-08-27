/**
 * v2 提交通路的守卫（AC-F4-1、AC-6.4）。
 *
 * 两条重点：
 *
 * 1. **30s Cap 仍由既有拦截器把关**。换传输层没有绕开红线——超时长的板连传输层
 *    都碰不到。用例还反向证明了这条判定确实来自 `durationInterceptor`：
 *    把它从拦截链里摘掉，31 秒就过得去；也就是说 v2 没有自己抄一份上限。
 * 2. **组间衔接永不进请求体**。Beat 1 黄金样例把衔接 / 名称 / 备注都填了真值，
 *    请求体里逐字扫这些取值，字段名另有清单扫描。
 */

import { describe, expect, it, vi } from 'vitest';
import { MAX_BEAT_DURATION_SEC } from '../../domain/beats';
import { TRANSITION_RULES } from '../../domain/transitions';
import { BEAT1_GOLDEN_PROMPT, createBeat1Sample } from '../../testing/goldens';
import { DEFAULT_INTERCEPTORS, durationInterceptor } from '../interceptors';
import { findForbiddenBodyKeys, findSecretLikeKeys } from './redline';
import {
  SEEDANCE_BEAT_REQUEST_KEYS,
  createStubBeatTransport,
  type SeedanceBeatRequest,
  type SeedanceBeatTransport,
  type SeedanceSubmitOptions,
} from './transport';
import { createSeedanceBeatSubmitter, validateReferenceImageKeys } from './submitter';

/** 记账用的桩件包装：证明「传输层根本没被调用」需要拿到调用次数。 */
function recordingStub(): {
  transport: SeedanceBeatTransport;
  calls: { request: SeedanceBeatRequest; options?: SeedanceSubmitOptions }[];
} {
  const stub = createStubBeatTransport();
  const calls: { request: SeedanceBeatRequest; options?: SeedanceSubmitOptions }[] = [];
  const transport: SeedanceBeatTransport = Object.freeze({
    ...stub,
    submitBeat: async (request: SeedanceBeatRequest, options?: SeedanceSubmitOptions) => {
      calls.push(options === undefined ? { request } : { request, options });
      return stub.submitBeat(request, options);
    },
  });
  return { transport, calls };
}

describe('提交前置校验', () => {
  it('填满的板通过，拿到 job id', async () => {
    const submitter = createSeedanceBeatSubmitter();
    const { project, beat } = createBeat1Sample();
    expect(submitter.precheck(project, beat)).toBeNull();

    const result = await submitter.submitBeat(project, beat, ['img_b1_c1_a.png']);
    expect(result.ok).toBe(true);
    expect(result.ok && result.job_id.startsWith('job_stub_')).toBe(true);
  });

  it('默认传输层是桩件，提交不出网', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const submitter = createSeedanceBeatSubmitter();
    const { project, beat } = createBeat1Sample();
    await submitter.submitBeat(project, beat);
    expect(submitter.transport.kind).toBe('stub');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('必填未齐归「参数缺失」，且不调用传输层', async () => {
    const { transport, calls } = recordingStub();
    const submitter = createSeedanceBeatSubmitter({ transport });
    const { project, beat } = createBeat1Sample();
    beat.emotion = '';

    const result = await submitter.submitBeat(project, beat);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.error_class).toBe('PARAM_MISSING');
    expect(calls).toHaveLength(0);
  });

  it('默认拦截链就是既有的那条，没有另起一套', () => {
    const submitter = createSeedanceBeatSubmitter();
    // 按引用比对而不是 toEqual：拦截器上有个叫 `inspect` 的方法，
    // 断言失败时的序列化会把它当成自定义 inspect 调用，报错会盖掉真实原因。
    expect(submitter.interceptors.map((interceptor) => interceptor.name)).toEqual(
      DEFAULT_INTERCEPTORS.map((interceptor) => interceptor.name),
    );
    expect(submitter.interceptors.includes(durationInterceptor)).toBe(true);
  });
});

describe('30 秒上限（经既有拦截器）', () => {
  it(`超过 ${MAX_BEAT_DURATION_SEC} 秒被挡在出网之前，传输层不被调用`, async () => {
    const { transport, calls } = recordingStub();
    const submitter = createSeedanceBeatSubmitter({ transport });
    const { project, beat } = createBeat1Sample();
    beat.duration_sec = MAX_BEAT_DURATION_SEC + 1;

    const result = await submitter.submitBeat(project, beat);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.code).toBe('DURATION_OVER_CAP');
    expect(result.ok === false && result.failure.error_class).toBe('PARAM_MISSING');
    expect(result.ok === false && result.failure.message).toContain(String(MAX_BEAT_DURATION_SEC));
    expect(calls).toHaveLength(0);
  });

  it(`恰好 ${MAX_BEAT_DURATION_SEC} 秒放行（上限是闭区间）`, async () => {
    const submitter = createSeedanceBeatSubmitter();
    const { project, beat } = createBeat1Sample();
    beat.duration_sec = MAX_BEAT_DURATION_SEC;

    const result = await submitter.submitBeat(project, beat);
    expect(result.ok).toBe(true);
    expect(submitter.buildRequest(project, beat).duration_sec).toBe(MAX_BEAT_DURATION_SEC);
  });

  it('时长为 0 或负数同样被挡', async () => {
    const submitter = createSeedanceBeatSubmitter();
    const { project, beat } = createBeat1Sample();
    beat.duration_sec = 0;
    expect(submitter.precheck(project, beat)?.code).toBe('DURATION_INVALID');
  });

  it('摘掉 durationInterceptor 后 31 秒就过得去：上限只有那一处判定', async () => {
    const submitter = createSeedanceBeatSubmitter({
      interceptors: DEFAULT_INTERCEPTORS.filter(
        (interceptor) => interceptor !== durationInterceptor,
      ),
    });
    const { project, beat } = createBeat1Sample();
    beat.duration_sec = MAX_BEAT_DURATION_SEC + 1;

    const result = await submitter.submitBeat(project, beat);
    expect(result.ok).toBe(true);
  });
});

describe('组间衔接绝不进请求体', () => {
  it('黄金样例的请求体字段恰为三项，且不含衔接 / 名称 / 备注的取值', () => {
    const submitter = createSeedanceBeatSubmitter();
    const { project, beat } = createBeat1Sample();
    const request = submitter.buildRequest(project, beat, ['img_b1_c2_a.png']);

    expect(Object.keys(request)).toEqual([...SEEDANCE_BEAT_REQUEST_KEYS]);
    expect(request.prompt).toBe(BEAT1_GOLDEN_PROMPT);

    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain(beat.transition_rule);
    expect(serialized).not.toContain(beat.title);
    expect(serialized).not.toContain(beat.note);
    expect(findForbiddenBodyKeys(request)).toEqual([]);
    expect(findSecretLikeKeys(Object.keys(request))).toEqual([]);
  });

  it('六种封闭衔接手法逐个试，请求体里一个都不出现', () => {
    const submitter = createSeedanceBeatSubmitter();
    const { project, beat } = createBeat1Sample();
    TRANSITION_RULES.forEach((rule) => {
      beat.transition_rule = rule;
      const serialized = JSON.stringify(submitter.buildRequest(project, beat));
      expect(serialized).not.toContain(rule);
    });
  });

  it('真正送到传输层的请求体也是同一份，没有中途加料', async () => {
    const { transport, calls } = recordingStub();
    const submitter = createSeedanceBeatSubmitter({ transport });
    const { project, beat } = createBeat1Sample();

    await submitter.submitBeat(project, beat, ['img_b1_c1_a.png']);

    expect(calls).toHaveLength(1);
    const sent = calls[0];
    expect(Object.keys(sent?.request ?? {})).toEqual([...SEEDANCE_BEAT_REQUEST_KEYS]);
    expect(JSON.stringify(sent?.request)).not.toContain(beat.transition_rule);
    // 幂等键走传输级选项，不在请求体里。
    expect(sent?.options?.idempotency_key?.startsWith('idem_')).toBe(true);
    expect(JSON.stringify(sent?.request)).not.toContain('idem_');
  });

  it('衔接内容泄漏进 Prompt 时，出网口直接抛错', () => {
    const submitter = createSeedanceBeatSubmitter();
    const { project, beat } = createBeat1Sample();
    beat.note = '戒指';
    expect(() => submitter.buildRequest(project, beat)).toThrow(/AC-6\.4/);
  });
});

describe('参考图键', () => {
  it('按格序原样带上，键是不透明存储键', async () => {
    const { transport, calls } = recordingStub();
    const submitter = createSeedanceBeatSubmitter({ transport });
    const { project, beat } = createBeat1Sample();
    const keys = ['img_b1_c1_a.png', 'img_b1_c3_b.png'];

    await submitter.submitBeat(project, beat, keys);
    expect(calls[0]?.request.reference_image_keys).toEqual(keys);
  });

  it('多于本板宫格数即拒绝', () => {
    const { beat } = createBeat1Sample();
    expect(
      validateReferenceImageKeys(beat, ['a.png', 'b.png', 'c.png', 'd.png'])?.code,
    ).toBe('REFERENCE_IMAGE_KEYS_OVERFLOW');
    expect(validateReferenceImageKeys(beat, ['a.png', 'b.png', 'c.png'])).toBeNull();
  });

  it('空键与直接发地址都拒绝（object URL 刷新即失效）', () => {
    const { beat } = createBeat1Sample();
    expect(validateReferenceImageKeys(beat, ['  '])?.code).toBe('REFERENCE_IMAGE_KEY_INVALID');
    expect(validateReferenceImageKeys(beat, ['blob:http://localhost/x'])?.code).toBe(
      'REFERENCE_IMAGE_KEY_NOT_OPAQUE',
    );
    expect(validateReferenceImageKeys(beat, ['data:image/png;base64,AAAA'])?.code).toBe(
      'REFERENCE_IMAGE_KEY_NOT_OPAQUE',
    );
  });

  it('键里夹带备注内容归「内容违规」', () => {
    const { beat } = createBeat1Sample();
    beat.note = '戒指';
    const failure = validateReferenceImageKeys(beat, ['img_戒指.png']);
    expect(failure?.error_class).toBe('CONTENT_VIOLATION');
    expect(failure?.code).toBe('EXCLUDED_FIELD_LEAK');
  });

  it('参考图键不合法时传输层不被调用', async () => {
    const { transport, calls } = recordingStub();
    const submitter = createSeedanceBeatSubmitter({ transport });
    const { project, beat } = createBeat1Sample();
    const result = await submitter.submitBeat(project, beat, ['']);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('上游异常与轮询', () => {
  it('传输层抛错收敛成「接口异常」，可重试', async () => {
    const stub = createStubBeatTransport();
    const transport: SeedanceBeatTransport = Object.freeze({
      ...stub,
      submitBeat: async () => {
        throw new Error('502 Bad Gateway');
      },
    });
    const submitter = createSeedanceBeatSubmitter({ transport });
    const { project, beat } = createBeat1Sample();

    const result = await submitter.submitBeat(project, beat);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.error_class).toBe('API_ERROR');
    expect(result.ok === false && result.failure.retryable).toBe(true);
    expect(result.ok === false && result.failure.message).toContain('502');
  });

  it('提交后可轮询取件；传输层不支持轮询时 pollJob 为 null', async () => {
    const submitter = createSeedanceBeatSubmitter();
    const { project, beat } = createBeat1Sample();
    const result = await submitter.submitBeat(project, beat);
    if (!result.ok || submitter.pollJob === null) {
      throw new Error('桩件应当提交成功且支持轮询');
    }
    const snapshot = await submitter.pollJob(result.job_id);
    expect(snapshot.status).toBe('SUCCEEDED');

    const withoutPoll = createSeedanceBeatSubmitter({
      transport: createStubBeatTransport({ poll: false }),
    });
    expect(withoutPoll.pollJob).toBeNull();
  });
});
