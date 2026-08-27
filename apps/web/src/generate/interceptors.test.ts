/**
 * 前置校验拦截链（FR-4-03、AC-F4-1、AC-R3-1）。
 *
 * 重点：**单板时长 > 30 秒必须被拦下**，且拦截原因可读。
 */

import { describe, expect, it } from 'vitest';
import { MAX_BEAT_DURATION_SEC, type Beat } from '../domain/beats';
import { buildGenerateRequest } from '../domain/prompt';
import { createBeat1Sample } from '../testing/goldens';
import {
  DEFAULT_INTERCEPTORS,
  TRANSITION_WORD_DENYLIST,
  durationInterceptor,
  frameLockInterceptor,
  redLineInterceptor,
  requiredFieldInterceptor,
  runInterceptors,
  type InterceptorContext,
} from './interceptors';
import { GENERATE_ERROR_CLASSES, GENERATE_ERROR_LABEL } from './types';

function contextFor(mutate: (beat: Beat) => void = () => {}): InterceptorContext {
  const { project, beat } = createBeat1Sample();
  mutate(beat);
  return { project, beat, request: buildGenerateRequest(project, beat) };
}

describe('错误类目只有三类', () => {
  it('参数缺失 / 接口异常 / 内容违规', () => {
    expect([...GENERATE_ERROR_CLASSES]).toEqual(['PARAM_MISSING', 'API_ERROR', 'CONTENT_VIOLATION']);
    expect(GENERATE_ERROR_LABEL.PARAM_MISSING).toBe('参数缺失');
    expect(GENERATE_ERROR_LABEL.API_ERROR).toBe('接口异常');
    expect(GENERATE_ERROR_LABEL.CONTENT_VIOLATION).toBe('内容违规');
  });
});

describe('时长拦截器：单板不得超过 30 秒', () => {
  it('填满的 Beat 1（8 秒）放行', () => {
    expect(durationInterceptor.inspect(contextFor())).toBeNull();
  });

  it('正好 30 秒放行，31 秒拦截', () => {
    expect(
      durationInterceptor.inspect(
        contextFor((beat) => {
          beat.duration_sec = MAX_BEAT_DURATION_SEC;
        }),
      ),
    ).toBeNull();

    const failure = durationInterceptor.inspect(
      contextFor((beat) => {
        beat.duration_sec = MAX_BEAT_DURATION_SEC + 1;
      }),
    );
    expect(failure?.error_class).toBe('PARAM_MISSING');
    expect(failure?.label).toBe('参数缺失');
    expect(failure?.code).toBe('DURATION_OVER_CAP');
    expect(failure?.message).toContain('不得超过 30 秒');
    expect(failure?.retryable).toBe(false);
  });

  it.each([31, 45, 60, 88, 999])('%s 秒一律拦截', (duration) => {
    const failure = durationInterceptor.inspect(
      contextFor((beat) => {
        beat.duration_sec = duration;
      }),
    );
    expect(failure?.code).toBe('DURATION_OVER_CAP');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('非法时长 %s 也拦截', (duration) => {
    const failure = durationInterceptor.inspect(
      contextFor((beat) => {
        beat.duration_sec = duration;
      }),
    );
    expect(failure?.error_class).toBe('PARAM_MISSING');
    expect(failure?.code).toBe('DURATION_INVALID');
  });
});

describe('必填拦截器', () => {
  it('槽位齐备放行', () => {
    expect(requiredFieldInterceptor.inspect(contextFor())).toBeNull();
  });

  it('缺剧情核心时点名缺哪一项', () => {
    const failure = requiredFieldInterceptor.inspect(
      contextFor((beat) => {
        beat.plot_core = '   ';
      }),
    );
    expect(failure?.error_class).toBe('PARAM_MISSING');
    expect(failure?.message).toContain('剧情核心');
  });

  it('缺某一格画面描述时点名第几格', () => {
    const failure = requiredFieldInterceptor.inspect(
      contextFor((beat) => {
        const frame = beat.frames[1];
        if (frame !== undefined) {
          frame.text = '';
        }
      }),
    );
    expect(failure?.message).toContain('第2格');
  });
});

describe('宫格锁拦截器', () => {
  it('三宫格齐备放行', () => {
    expect(frameLockInterceptor.inspect(contextFor())).toBeNull();
  });

  it('参数里的宫格数被篡改即拦截', () => {
    const base = contextFor();
    const tampered: InterceptorContext = {
      project: base.project,
      beat: base.beat,
      request: { ...base.request, params: { ...base.request.params, frame_count: 2 } },
    };
    expect(frameLockInterceptor.inspect(tampered)?.code).toBe('FRAME_COUNT_MISMATCH');
  });
});

describe('红线拦截器：内容违规', () => {
  it('干净的 Prompt 放行', () => {
    expect(redLineInterceptor.inspect(contextFor())).toBeNull();
  });

  it('命中转场词即内容违规', () => {
    const failure = redLineInterceptor.inspect(
      contextFor((beat) => {
        beat.plot_core = '女主离席，这里用一次转场推进到下一段';
      }),
    );
    expect(failure?.error_class).toBe('CONTENT_VIOLATION');
    expect(failure?.label).toBe('内容违规');
    expect(failure?.code).toBe('TRANSITION_WORD_HIT');
    expect(failure?.message).toContain('转场');
  });

  it('备注内容混进 Prompt 也算内容违规', () => {
    const failure = redLineInterceptor.inspect(
      contextFor((beat) => {
        beat.note = '戒指';
      }),
    );
    expect(failure?.error_class).toBe('CONTENT_VIOLATION');
    expect(failure?.code).toBe('EXCLUDED_FIELD_LEAK');
  });

  it('六种衔接取值都在拦截清单里', () => {
    ['音频预接', '螺口顺滑过渡', '卡点硬切', 'BGM升调截断', '黑屏断钩子', '纯硬切'].forEach(
      (rule) => {
        expect(TRANSITION_WORD_DENYLIST.some((word) => rule.includes(word))).toBe(true);
      },
    );
  });
});

describe('拦截链顺序', () => {
  it('默认四道：必填 → 时长 → 宫格 → 红线', () => {
    expect(DEFAULT_INTERCEPTORS.map((item) => item.name)).toEqual([
      'required-fields',
      'duration-cap',
      'frame-lock',
      'red-line',
    ]);
  });

  it('同时缺必填与超时长，先报必填', () => {
    const failure = runInterceptors(
      DEFAULT_INTERCEPTORS,
      contextFor((beat) => {
        beat.emotion = '';
        beat.duration_sec = 40;
      }),
    );
    expect(failure?.code).toBe('FIELD_MISSING');
  });

  it('填满的 Beat 1 穿过整条链', () => {
    expect(runInterceptors(DEFAULT_INTERCEPTORS, contextFor())).toBeNull();
  });
});
