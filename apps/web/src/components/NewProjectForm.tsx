/**
 * 新建项目表单（PRD §7.1、5.1.1）。
 *
 * 强制字段未填齐不可提交（校验走 `domain/projects.isNewProjectValid`）。
 * 表单里没有"板数"这一项：新建**必然**产生 5 块锁定板，不存在"空项目"或"自选板数"。
 */

import { useState } from 'react';
import { isNewProjectValid, type AspectRatio, type NewProjectInput } from '../domain/projects';
import { BEAT_COUNT } from '../domain/beats';
import { CANON_TOTAL_DURATION_SEC } from '../store/projectFactory';

const ASPECT_RATIOS: readonly AspectRatio[] = ['9:16', '16:9', '1:1'];

const EMPTY: NewProjectInput = {
  name: '',
  genre: '',
  aspectRatio: '9:16',
  episodeDurationSec: CANON_TOTAL_DURATION_SEC,
  stylePrompt: '',
  protagonist: '',
};

interface NewProjectFormProps {
  onSubmit(input: NewProjectInput): void;
  onCancel(): void;
  pending?: boolean;
}

export function NewProjectForm({ onSubmit, onCancel, pending = false }: NewProjectFormProps) {
  const [input, setInput] = useState<NewProjectInput>(EMPTY);
  const valid = isNewProjectValid(input);

  const set = <K extends keyof NewProjectInput>(key: K, value: NewProjectInput[K]) =>
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
            value={input.aspectRatio}
            onChange={(event) => set('aspectRatio', event.target.value as AspectRatio)}
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
            min={1}
            value={input.episodeDurationSec}
            onChange={(event) => set('episodeDurationSec', Number(event.target.value))}
            required
          />
          <span id="new-project-duration-hint" className="field__hint">
            基准轴 {CANON_TOTAL_DURATION_SEC} 秒，建议 70–90 秒
          </span>
        </div>
      </div>

      <label className="field">
        <span className="field__label">全局画风</span>
        <input
          className="field__input"
          value={input.stylePrompt}
          onChange={(event) => set('stylePrompt', event.target.value)}
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
