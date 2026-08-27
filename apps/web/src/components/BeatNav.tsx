/**
 * 编辑页左侧固定 5 项节拍导航（PRD 5.2.1）。
 * 数量固定为 5：本组件不提供、也不得添加"新增/删除节拍"入口（AC-6.1）。
 */

import type { Beat, BeatStatus } from '../domain/beats';

const STATUS_LABEL: Record<BeatStatus, string> = {
  empty: '未填',
  filled: '已填',
  generating: '生成中',
  generated: '已生成',
  failed: '失败',
};

interface BeatNavProps {
  beats: readonly Beat[];
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
