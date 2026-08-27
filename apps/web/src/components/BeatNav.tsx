/**
 * 编辑页左侧固定 5 项节拍导航（PRD 5.2.1）。
 * 数量固定为 5：本组件不提供、也不得添加"新增/删除节拍"入口（AC-6.1）。
 *
 * 键盘可达性（W4-A11Y）：
 *   - 5 项全部留在自然 Tab 序里，不做 roving tabindex——板位是并列的作业入口，
 *     逐项 Tab 到达比"先进容器再按方向键"更符合这里的使用方式；
 *   - 另给方向键 / Home / End 作为快捷键：移动焦点的同时切板，与视觉上
 *     「点哪块板就看哪块板」保持一致，不引入"焦点在 B3、内容还停在 B1"的中间态。
 */

import { useRef, type KeyboardEvent } from 'react';
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

/** 方向键 → 目标位次（0 基）；不是导航键则返回 null。 */
function targetPosition(key: string, from: number, count: number): number | null {
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return (from + 1) % count;
    case 'ArrowUp':
    case 'ArrowLeft':
      return (from - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

export function BeatNav({ beats, activeIndex, onSelect }: BeatNavProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, position: number) => {
    const next = targetPosition(event.key, position, beats.length);
    if (next === null) {
      return;
    }

    // 左导航自己消费方向键，否则页面会跟着滚动。
    event.preventDefault();
    const beat = beats[next];
    if (beat === undefined) {
      return;
    }
    itemRefs.current[next]?.focus();
    onSelect(beat.index);
  };

  return (
    <ul className="beatnav" aria-label="五节拍导航">
      {beats.map((beat, position) => {
        const active = beat.index === activeIndex;

        return (
          <li key={beat.index}>
            <button
              type="button"
              ref={(node) => {
                itemRefs.current[position] = node;
              }}
              className={`beatnav__item${active ? ' beatnav__item--active' : ''}`}
              // 五板是一条固定推进的叙事序列，当前板即"当前这一步"。
              aria-current={active ? 'step' : undefined}
              onKeyDown={(event) => onKeyDown(event, position)}
              onClick={() => onSelect(beat.index)}
            >
              <span className="beatnav__ordinal">{beat.index}</span>
              <span className="beatnav__body">
                <span className="beatnav__name">{beat.name}</span>
                <span className="beatnav__role">{beat.role}</span>
                {beat.meta !== undefined && <span className="beatnav__meta">{beat.meta}</span>}
              </span>
              {/* 状态只用颜色区分会违反 WCAG 1.4.1：hover 给 title，AT 给隐藏文本。 */}
              <span
                className={`beatnav__dot beatnav__dot--${beat.status}`}
                title={STATUS_LABEL[beat.status]}
              >
                <span className="visually-hidden">{STATUS_LABEL[beat.status]}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
