/**
 * 项目级左侧导航。
 * 红线（AC-6.8）：不得出现镜头级入口 —— 没有对应页面，也没有对应菜单项。
 */

import { NavLink } from 'react-router-dom';

interface MainNavItem {
  to: string;
  label: string;
  hint: string;
  end?: boolean;
}

interface MainNavProps {
  items?: readonly MainNavItem[];
}

const DEFAULT_ITEMS: readonly MainNavItem[] = [
  { to: '/', label: '项目', hint: '项目列表与新建', end: true },
];

export function MainNav({ items = DEFAULT_ITEMS }: MainNavProps) {
  return (
    <ul className="mainnav">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) => `mainnav__item${isActive ? ' mainnav__item--active' : ''}`}
          >
            <span className="mainnav__label">{item.label}</span>
            <span className="mainnav__hint">{item.hint}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
