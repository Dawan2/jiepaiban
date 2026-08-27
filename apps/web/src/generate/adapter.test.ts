/**
 * Seedance 2.5 适配器桩件（FR-4-09、AC-6.4）。
 *
 * 桩件的两条底线：**不带任何密钥**、**请求体里不含红线字段**。
 */

import { describe, expect, it, vi } from 'vitest';
import { BEAT1_GOLDEN_PROMPT, createBeat1Sample } from '../testing/goldens';
import {
  FORBIDDEN_SUBMISSION_KEYS,
  createScriptedTransport,
  createSeedanceAdapter,
  createStubTransport,
  fingerprint,
  idempotencyKeyFor,
  moderationFailure,
  upstreamFailure,
} from './adapter';
import { buildGenerateRequest } from '../domain/prompt';
import { SEEDANCE_MODEL, generateFailure } from './types';

describe('提交体', () => {
  it('模型恒为 Seedance 2.5', () => {
    const adapter = createSeedanceAdapter();
    const { project, beat } = createBeat1Sample();
    expect(adapter.model).toBe(SEEDANCE_MODEL);
    expect(adapter.buildSubmission(project, beat).model).toBe('Seedance 2.5');
  });

  it('字段恰为模型 / 板序 / prompt / 参数位 / 幂等键', () => {
    const adapter = createSeedanceAdapter();
    const { project, beat } = createBeat1Sample();
    const submission = adapter.buildSubmission(project, beat);
    expect(Object.keys(submission).sort()).toEqual([
      'beat_index',
      'idempotency_key',
      'model',
      'params',
      'prompt',
    ]);
    expect(submission.prompt).toBe(BEAT1_GOLDEN_PROMPT);
  });

  it('提交体里没有密钥、没有衔接 / 名称 / 备注、没有镜头级结构', () => {
    const adapter = createSeedanceAdapter();
    const { project, beat } = createBeat1Sample();
    const body = JSON.stringify(adapter.buildSubmission(project, beat));

    FORBIDDEN_SUBMISSION_KEYS.forEach((key) => {
      expect(body).not.toContain(key);
    });
    expect(body).not.toContain(beat.transition_rule);
    expect(body).not.toContain(beat.note);
    expect(body).not.toMatch(/shot|storyboard|camera_json|lens/i);
    expect(body).not.toMatch(/api[_-]?key|access[_-]?token|secret|credential/i);
  });

  it('组装出的 Prompt 有泄漏时，出网口直接抛错', () => {
    const adapter = createSeedanceAdapter();
    const { project, beat } = createBeat1Sample();
    beat.note = '戒指';
    expect(() => adapter.buildSubmission(project, beat)).toThrow(/AC-6\.4/);
  });
});

describe('幂等键', () => {
  it('同一入参恒定', () => {
    const { project, beat } = createBeat1Sample();
    const first = idempotencyKeyFor(project, buildGenerateRequest(project, beat));
    const second = idempotencyKeyFor(project, buildGenerateRequest(project, beat));
    expect(first).toBe(second);
    expect(first.startsWith('idem_')).toBe(true);
  });

  it('改任一进 Prompt 的槽位就变，改衔接 / 名称 / 备注不变', () => {
    const { project, beat } = createBeat1Sample();
    const base = idempotencyKeyFor(project, buildGenerateRequest(project, beat));

    beat.transition_rule = '纯硬切';
    beat.title = '换个名字';
    expect(idempotencyKeyFor(project, buildGenerateRequest(project, beat))).toBe(base);

    beat.emotion = `${beat.emotion}（改过）`;
    expect(idempotencyKeyFor(project, buildGenerateRequest(project, beat))).not.toBe(base);
  });

  it('不同板互不相同', () => {
    const { project } = createBeat1Sample();
    const keys = project.beat_list.map((beat) =>
      idempotencyKeyFor(project, buildGenerateRequest(project, beat)),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('指纹函数稳定且区分输入', () => {
    expect(fingerprint('节拍板')).toBe(fingerprint('节拍板'));
    expect(fingerprint('节拍板')).not.toBe(fingerprint('节拍版'));
  });
});

describe('传输层', () => {
  it('桩件不出网、不鉴权，产出确定性占位地址', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = createSeedanceAdapter();
    const { project, beat } = createBeat1Sample();
    const submission = adapter.buildSubmission(project, beat);

    const first = await adapter.submit(submission);
    const second = await adapter.submit(submission);

    expect(first.ok).toBe(true);
    expect(first).toEqual(second);
    if (first.ok) {
      expect(first.video_url).toContain('stub://seedance-2.5/b1/');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('传输层抛错收敛成接口异常，可重试', async () => {
    const adapter = createSeedanceAdapter({
      transport: () => {
        throw new Error('502 Bad Gateway');
      },
    });
    const { project, beat } = createBeat1Sample();
    const result = await adapter.submit(adapter.buildSubmission(project, beat));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.error_class).toBe('API_ERROR');
      expect(result.failure.label).toBe('接口异常');
      expect(result.failure.message).toContain('502');
      expect(result.failure.retryable).toBe(true);
    }
  });

  it('剧本传输层按序返回，用尽后回落成功', async () => {
    const transport = createScriptedTransport([
      { ok: false, failure: upstreamFailure('timeout') },
      { ok: false, failure: moderationFailure('画面涉及违规内容') },
    ]);
    const adapter = createSeedanceAdapter({ transport });
    const { project, beat } = createBeat1Sample();
    const submission = adapter.buildSubmission(project, beat);

    const results = [
      await adapter.submit(submission),
      await adapter.submit(submission),
      await adapter.submit(submission),
    ];
    expect(results.map((result) => result.ok)).toEqual([false, false, true]);
    expect(results[1]?.ok === false && results[1].failure.error_class).toBe('CONTENT_VIOLATION');
  });

  it('桩件支持模拟延迟', async () => {
    const transport = createStubTransport({ latencyMs: 1 });
    const adapter = createSeedanceAdapter({ transport });
    const { project, beat } = createBeat1Sample();
    await expect(adapter.submit(adapter.buildSubmission(project, beat))).resolves.toMatchObject({
      ok: true,
    });
  });
});

describe('前置校验入口', () => {
  it('填满的板通过', () => {
    const adapter = createSeedanceAdapter();
    const { project, beat } = createBeat1Sample();
    expect(adapter.precheck(project, beat)).toBeNull();
  });

  it('超 30 秒被挡在出网之前', () => {
    const adapter = createSeedanceAdapter();
    const { project, beat } = createBeat1Sample();
    beat.duration_sec = 31;
    expect(adapter.precheck(project, beat)?.code).toBe('DURATION_OVER_CAP');
  });

  it('失败详情自带中文类目名', () => {
    const failure = generateFailure('API_ERROR', 'UPSTREAM_ERROR', '网关超时', true);
    expect(failure.label).toBe('接口异常');
    expect(Object.isFrozen(failure)).toBe(true);
  });
});
