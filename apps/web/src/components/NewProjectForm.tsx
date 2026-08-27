/**
 * 新建项目表单（PRD §7.1、5.1.1）。
 *
 * 强制字段未填齐不可提交（校验走 `domain/projects.isNewProjectValid`）。
 * 表单里没有"板数"这一项：新建**必然**产生 5 块锁定板，不存在"空项目"或"自选板数"。
 *
 * 起手内容有两条路径，由「起手内容」单选决定：空白五板，或套用黄金五板样板
 * （`domain/templates.ts`）。模板只填板上的文案，**不碰结构**——两条路径产出的
 * 板数、宫格数、时间位、canon 衔接完全一致。默认仍是空白，套模板是显式选择。
 */

import { useState } from 'react';
import {
  DEFAULT_ASPECT_RATIO,
  isNewProjectValid,
  type AspectRatio,
  type NewProjectInput,
} from '../domain/projects';
import { BEAT_COUNT, EPISODE_DURATION_RANGE_SEC } from '../domain/beats';
import { PROJECT_TEMPLATES, projectTemplate, type TemplateId } from '../domain/templates';
import { CANON_TOTAL_DURATION_SEC } from '../store/projectFactory';

const ASPECT_RATIOS: readonly AspectRatio[] = ['9:16', '16:9', '1:1'];

/** 表单态里总时长始终有值（默认基准轴），领域类型上它是可选的。 */
type FormInput = NewProjectInput & { total_duration_sec: number };

/** 起手内容：空白五板，或某个内置模板。 */
type Starter = 'blank' | TemplateId;

const EMPTY: FormInput = {
  name: '',
  genre: '',
  aspect_ratio: DEFAULT_ASPECT_RATIO,
  total_duration_sec: CANON_TOTAL_DURATION_SEC,
  style_prompt: '',
  protagonist: '',
};

interface NewProjectFormProps {
  onSubmit(input: NewProjectInput, templateId: TemplateId | null): void;
  onCancel(): void;
  pending?: boolean;
}

export function NewProjectForm({ onSubmit, onCancel, pending = false }: NewProjectFormProps) {
  const [input, setInput] = useState<FormInput>(EMPTY);
  const [starter, setStarter] = useState<Starter>('blank');
  const valid = isNewProjectValid(input);
  const template = starter === 'blank' ? null : projectTemplate(starter);

  const set = <K extends keyof FormInput>(key: K, value: FormInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  /**
   * 切换起手内容时同步项目级参数：套模板则填成模板的取值，回空白则清空。
   * 项目名是唯一的例外——只在用户还没填时才代填，已经输入的名字不被覆盖。
   */
  const chooseStarter = (next: Starter) => {
    setStarter(next);
    setInput((prev) => {
      if (next === 'blank') {
        return { ...EMPTY, name: prev.name };
      }
      const picked = projectTemplate(next);
      return {
        name: prev.name.trim() === '' ? picked.project_name : prev.name,
        genre: picked.genre,
        aspect_ratio: picked.aspect_ratio,
        total_duration_sec: picked.total_duration_sec,
        style_prompt: picked.style_prompt,
        protagonist: picked.protagonist,
      };
    });
  };

  return (
    <form
      className="panel form"
      aria-label="新建项目"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !pending) {
          onSubmit(input, starter === 'blank' ? null : starter);
        }
      }}
    >
      <h2 className="panel__title">新建项目</h2>
      <p className="panel__desc">
        创建后自动落 {BEAT_COUNT} 块锁定节拍板（B1–B4 三宫格、B5 两宫格），顺序与语义不可改。
      </p>

      <fieldset className="field field--group">
        <legend className="field__label">起手内容</legend>
        <label className="choice">
          <input
            type="radio"
            name="new-project-starter"
            value="blank"
            checked={starter === 'blank'}
            onChange={() => chooseStarter('blank')}
          />
          <span className="choice__body">
            <span className="choice__title">空白五板</span>
            <span className="choice__desc">{BEAT_COUNT} 块板都留空，情绪与画面全部自己写。</span>
          </span>
        </label>

        {PROJECT_TEMPLATES.map((item) => (
          <label className="choice" key={item.id}>
            <input
              type="radio"
              name="new-project-starter"
              value={item.id}
              checked={starter === item.id}
              onChange={() => chooseStarter(item.id)}
            />
            <span className="choice__body">
              <span className="choice__title">{item.title}</span>
              <span className="choice__desc">{item.summary}</span>
            </span>
          </label>
        ))}

        {template !== null && (
          <p className="field__hint" role="status">
            已套用「{template.title}」（{template.canon_source}）：
            {BEAT_COUNT} 块板的情绪 / 镜头节奏 / 剧情核心 / 节拍帧都已填好，创建后可逐字改写。
            下面的项目参数也已按模板填好，可直接改。
          </p>
        )}
      </fieldset>

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
