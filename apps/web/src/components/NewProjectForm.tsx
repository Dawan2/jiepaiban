/**
 * 新建项目表单（PRD §7.1、5.1.1）。
 *
 * 强制字段未填齐不可提交（校验走 `domain/projects.isNewProjectValid`）。
 * 表单里没有"板数"这一项：新建**必然**产生 5 块锁定板，不存在"空项目"或"自选板数"。
 */

import { useState } from 'react';
import {
  DEFAULT_ASPECT_RATIO,
  isNewProjectValid,
  type AspectRatio,
  type NewProjectInput,
} from '../domain/projects';
import { BEAT_COUNT, EPISODE_DURATION_RANGE_SEC } from '../domain/beats';
import { CANON_TOTAL_DURATION_SEC } from '../store/projectFactory';

const ASPECT_RATIOS: readonly AspectRatio[] = ['9:16', '16:9', '1:1'];

/** 表单态里总时长始终有值（默认基准轴），领域类型上它是可选的。 */
type FormInput = NewProjectInput & { total_duration_sec: number };

const EMPTY: FormInput = {
  name: '',
  genre: '',
  aspect_ratio: DEFAULT_ASPECT_RATIO,
  total_duration_sec: CANON_TOTAL_DURATION_SEC,
  style_prompt: '',
  protagonist: '',
};

interface NewProjectFormProps {
  onSubmit(input: NewProjectInput): void;
  onCancel(): void;
  pending?: boolean;
}

export function NewProjectForm({ onSubmit, onCancel, pending = false }: NewProjectFormProps) {
  const [input, setInput] = useState<FormInput>(EMPTY);
  const valid = isNewProjectValid(input);

  const set = <K extends keyof FormInput>(key: K, value: FormInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      className="panel form"
      aria-label="新建项目"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !pending) {
          onSubmit(input);
        }
      }}
    >
      <h2 className="panel__title">新建项目</h2>
      <p className="panel__desc">
        创建后自动落 {BEAT_COUNT} 块锁定节拍板（B1–B4 三宫格、B5 两宫格），顺序与语义不可改。
      </p>

      <label className="field">
        <span className="field__label">项目名称</span>
        <input
          className="field__input"
          value={input.name}
          onChange={(event) => set('name', event.target.value)}
          maxLength={60}
          required
        />
      </label>

      <label className="field">
        <span className="field__label">题材</span>
        <input
          className="field__input"
          value={input.genre}
          onChange={(event) => set('genre', event.target.value)}
          placeholder="末世·爽剧"
          required
        />
      </label>

      <div className="form__row">
        <label className="field">
          <span className="field__label">画幅</span>
          <select
            className="field__input"
            value={input.aspect_ratio}
            onChange={(event) => set('aspect_ratio', event.target.value as AspectRatio)}
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <label className="field__label" htmlFor="new-project-duration">
            单集目标时长（秒）
          </label>
          <input
            id="new-project-duration"
            className="field__input"
            aria-describedby="new-project-duration-hint"
            type="number"
            min={EPISODE_DURATION_RANGE_SEC.min}
            max={EPISODE_DURATION_RANGE_SEC.max}
            value={input.total_duration_sec}
            onChange={(event) => set('total_duration_sec', Number(event.target.value))}
            required
          />
          <span id="new-project-duration-hint" className="field__hint">
            基准轴 {CANON_TOTAL_DURATION_SEC} 秒，区间 {EPISODE_DURATION_RANGE_SEC.min}–
            {EPISODE_DURATION_RANGE_SEC.max} 秒
          </span>
        </div>
      </div>

      <label className="field">
        <span className="field__label">全局画风</span>
        <input
          className="field__input"
          value={input.style_prompt}
          onChange={(event) => set('style_prompt', event.target.value)}
          placeholder="冷调赛博废土，胶片颗粒，强逆光"
          required
        />
      </label>

      <label className="field">
        <span className="field__label">主角形象</span>
        <input
          className="field__input"
          value={input.protagonist}
          onChange={(event) => set('protagonist', event.target.value)}
          placeholder="短发女青年，机能风冲锋衣，左颊有疤"
          required
        />
      </label>

      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={!valid || pending}>
          {pending ? '创建中…' : '创建项目'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={pending}>
          取消
        </button>
      </div>
    </form>
  );
}
