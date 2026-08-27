/**
 * 编辑页左侧固定 5 项节拍导航（PRD 5.2.1）。
 * 数量固定为 5：本组件不提供、也不得添加"新增/删除节拍"入口（AC-6.1）。
 */

import type { BeatStatus } from '../domain/beats';

const STATUS_LABEL: Record<BeatStatus, string> = {
  empty: '未填',
  filled: '已填',
  generating: '生成中',
  generated: '已生成',
  failed: '失败',
};

/**
 * 导航只需要板位、板名、职能与状态；
 * 领域模型 `Beat` 与编辑态 `BeatDraft` 都满足这个形状。
 */
export interface BeatNavItem {
  readonly index: number;
  readonly name: string;
  readonly role: string;
  readonly status: BeatStatus;
  /** 可选的规格摘要，例："3 格 · 0–8s"。 */
  readonly meta?: string;
}

interface BeatNavProps {
  beats: readonly BeatNavItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function BeatNav({ beats, activeIndex, onSelect }: BeatNavProps) {
  return (
    <ul className="beatnav" aria-label="五节拍导航">
      {beats.map((beat) => (
        <li key={beat.index}>
          <button
            type="button"
            className={`beatnav__item${beat.index === activeIndex ? ' beatnav__item--active' : ''}`}
            aria-current={beat.index === activeIndex ? 'true' : undefined}
            onClick={() => onSelect(beat.index)}
          >
            <span className="beatnav__ordinal">{beat.index}</span>
            <span className="beatnav__body">
              <span className="beatnav__name">{beat.name}</span>
              <span className="beatnav__role">{beat.role}</span>
              {beat.meta !== undefined && <span className="beatnav__meta">{beat.meta}</span>}
            </span>
            <span className={`beatnav__dot beatnav__dot--${beat.status}`} title={STATUS_LABEL[beat.status]}>
              <span className="visually-hidden">{STATUS_LABEL[beat.status]}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
