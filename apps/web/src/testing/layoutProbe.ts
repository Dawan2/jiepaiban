/**
 * 顶部栏几何探针：在 jsdom 里量出顶部栏的纵向排布。
 *
 * jsdom 不排版，`getBoundingClientRect()` 一律返回全 0，所以「按钮被顶部栏裁掉」这类
 * 回归在页面测试里量不出来（W5 审计 P0：56px 的固定行高把板级生成动作压到 top:-17）。
 * 探针补的就是这一段：**真实样式表 + 真实 DOM**，按 CSS 声明还原一个纵向盒模型，
 * 再把算出来的矩形挂回元素的 `getBoundingClientRect()` 上，测试于是能直接断言
 * 「动作控件的 top 不为负」。
 *
 * 模型只覆盖断言用得到的那部分 CSS，边界写明白：
 *   - 只算纵向；横向、换行、文本折行不算（顶部栏的裁切是纵向问题）；
 *   - 单行文本按 `font-size × line-height` 记一行；
 *   - flex 行方向按 `align-items` / `align-self` 对齐，其余容器按块流依次堆叠；
 *   - `position: absolute / fixed` 与 `display: none` 视作脱离常规流，不占高度；
 *   - 选择器不比特异性，按出现顺序后来者覆盖（本项目样式表是单文件顺序书写）；
 *   - 全站 `* { box-sizing: border-box }`，故显式 `height` 即边框盒高度。
 *
 * 探针本身也要能出错才有意义，所以 `styles` 可注入：`topbarLayout.test.tsx` 用一份
 * 手写的固定行高样式表反证探针能量出负偏移。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 不用 `new URL('...', import.meta.url)`：Vite 会把这个写法当成静态资源引用重写掉。
const APP_STYLESHEET = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css');

interface Rule {
  readonly selectors: readonly string[];
  readonly declarations: ReadonlyMap<string, string>;
}

interface Box {
  readonly top: number;
  readonly height: number;
}

export interface TopbarProbeOptions {
  /** 样式表源码，默认读产品样式表 `src/styles.css`。 */
  readonly styles?: string;
}

export interface TopbarProbe {
  /** 顶部栏行高（`.layout` 的第一条行轨道解出来的值）。 */
  readonly trackHeight: number;
  /** 顶部栏动作区的外盒高度——单行带宽的度量口。 */
  readonly actionsHeight: number;
  /** 卸掉挂上去的 `getBoundingClientRect()`。 */
  restore(): void;
}

/** 读产品样式表（一次读一次，测试进程内复用）。 */
let appStyles: string | null = null;

export function readAppStyles(): string {
  appStyles ??= readFileSync(APP_STYLESHEET, 'utf8');
  return appStyles;
}

// ── 样式表：解析与取值 ───────────────────────────────────────────────

/** 顶层规则；条件块（`@media` 等）不进模型——探针量的是桌面基线。 */
function parseRules(source: string): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let cursor = 0;

  while (cursor < css.length) {
    const open = css.indexOf('{', cursor);
    if (open === -1) {
      break;
    }
    const prelude = css.slice(cursor, open).trim();

    let depth = 1;
    let end = open + 1;
    while (end < css.length && depth > 0) {
      if (css[end] === '{') {
        depth += 1;
      } else if (css[end] === '}') {
        depth -= 1;
      }
      end += 1;
    }

    if (!prelude.startsWith('@')) {
      rules.push({
        selectors: prelude.split(',').map((selector) => selector.trim()),
        declarations: parseDeclarations(css.slice(open + 1, end - 1)),
      });
    }
    cursor = end;
  }

  return rules;
}

function parseDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const entry of body.split(';')) {
    const colon = entry.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const property = entry.slice(0, colon).trim();
    const value = entry.slice(colon + 1).trim();
    if (property !== '' && value !== '') {
      declarations.set(property, value);
    }
  }
  return declarations;
}

function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    // jsdom 认不出的选择器（各种伪元素）对纵向盒模型没有贡献，跳过。
    return false;
  }
}

function declaration(rules: readonly Rule[], element: Element, property: string): string | null {
  let value: string | null = null;
  for (const rule of rules) {
    if (
      rule.declarations.has(property) &&
      rule.selectors.some((selector) => matches(element, selector))
    ) {
      value = rule.declarations.get(property) ?? null;
    }
  }
  return value;
}

/** 继承型属性（字号、行高）：沿祖先链往上找第一条声明。 */
function inherited(rules: readonly Rule[], element: Element, property: string): string | null {
  let node: Element | null = element;
  while (node !== null) {
    const value = declaration(rules, node, property);
    if (value !== null) {
      return value;
    }
    node = node.parentElement;
  }
  return null;
}

function px(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const match = /^(-?\d*\.?\d+)px$/.exec(value.trim());
  return match === null ? null : Number(match[1]);
}

/** 1–4 值简写里取上 / 下边。 */
function shorthandEdge(value: string, side: 'top' | 'bottom'): string {
  const parts = value.split(/\s+/);
  if (side === 'top') {
    return parts[0] ?? '0';
  }
  return (parts.length >= 3 ? parts[2] : parts[0]) ?? '0';
}

// ── 纵向盒模型 ───────────────────────────────────────────────────────

class VerticalBoxModel {
  constructor(private readonly rules: readonly Rule[]) {}

  private value(element: Element, property: string): string | null {
    return declaration(this.rules, element, property);
  }

  private spacing(element: Element, property: 'margin' | 'padding', side: 'top' | 'bottom'): number {
    const longhand = px(this.value(element, `${property}-${side}`));
    if (longhand !== null) {
      return longhand;
    }
    const shorthand = this.value(element, property);
    return shorthand === null ? 0 : (px(shorthandEdge(shorthand, side)) ?? 0);
  }

  private border(element: Element, side: 'top' | 'bottom'): number {
    const sideValue = this.value(element, `border-${side}`);
    if (sideValue !== null) {
      return px(sideValue.split(/\s+/)[0] ?? null) ?? 0;
    }
    const all = this.value(element, 'border');
    if (all === null) {
      return 0;
    }
    return px(all.split(/\s+/)[0] ?? null) ?? 0;
  }

  marginTop(element: Element): number {
    return this.spacing(element, 'margin', 'top');
  }

  private marginY(element: Element): number {
    return this.marginTop(element) + this.spacing(element, 'margin', 'bottom');
  }

  paddingTop(element: Element): number {
    return this.spacing(element, 'padding', 'top');
  }

  private frameY(element: Element): number {
    return (
      this.paddingTop(element) +
      this.spacing(element, 'padding', 'bottom') +
      this.borderTop(element) +
      this.border(element, 'bottom')
    );
  }

  borderTop(element: Element): number {
    return this.border(element, 'top');
  }

  outOfFlow(element: Element): boolean {
    const position = this.value(element, 'position');
    if (position === 'absolute' || position === 'fixed') {
      return true;
    }
    return this.value(element, 'display') === 'none' || (element as HTMLElement).hidden === true;
  }

  /** flex 行方向容器：子项横排，高度取最高的那个。 */
  rowContainer(element: Element): boolean {
    const display = this.value(element, 'display') ?? '';
    if (!display.includes('flex')) {
      return false;
    }
    return (this.value(element, 'flex-direction') ?? 'row') === 'row';
  }

  gap(element: Element): number {
    return px(this.value(element, 'gap')) ?? 0;
  }

  alignment(container: Element, child: Element): string {
    return (
      this.value(child, 'align-self') ?? this.value(container, 'align-items') ?? 'stretch'
    );
  }

  children(element: Element): Element[] {
    return Array.from(element.children).filter((child) => !this.outOfFlow(child));
  }

  /** 单行文本高度。 */
  private textHeight(element: Element): number {
    if ((element.textContent ?? '').trim() === '') {
      return 0;
    }
    const fontSize = px(inherited(this.rules, element, 'font-size')) ?? 16;
    const lineHeight = inherited(this.rules, element, 'line-height');
    const asPx = px(lineHeight);
    if (asPx !== null) {
      return asPx;
    }
    const ratio = lineHeight === null ? 1.2 : Number(lineHeight);
    return fontSize * (Number.isFinite(ratio) ? ratio : 1.2);
  }

  contentHeight(element: Element): number {
    const children = this.children(element);
    if (children.length === 0) {
      return this.textHeight(element);
    }
    if (this.rowContainer(element)) {
      return Math.max(...children.map((child) => this.outerHeight(child)));
    }
    const stacked = children.reduce((sum, child) => sum + this.outerHeight(child), 0);
    return stacked + this.gap(element) * (children.length - 1);
  }

  /** 边框盒高度。`* { box-sizing: border-box }` 让显式 `height` 直接就是它。 */
  borderBoxHeight(element: Element): number {
    const explicit = px(this.value(element, 'height'));
    return explicit ?? this.contentHeight(element) + this.frameY(element);
  }

  outerHeight(element: Element): number {
    return this.borderBoxHeight(element) + this.marginY(element);
  }

  /** 第一条行轨道的高度：`56px` 或 `minmax(56px, auto)`（后者能被内容顶高）。 */
  trackHeight(grid: Element, content: number): number {
    const rows = this.value(grid, 'grid-template-rows') ?? '';
    const minmax = /^minmax\(\s*([^,]+),\s*[^)]+\)/.exec(rows);
    if (minmax !== null) {
      return Math.max(px(minmax[1] ?? null) ?? 0, content);
    }
    return px(rows.split(/\s+/)[0] ?? null) ?? content;
  }

  /**
   * 把 `element`（边框盒已定位在 `[top, top + height]`）的子树逐层定位。
   * flex 行按对齐方式摆，其余按块流从上往下堆。
   */
  place(element: Element, top: number, height: number, into: Map<Element, Box>): void {
    const contentTop = top + this.borderTop(element) + this.paddingTop(element);
    const contentHeight = height - this.frameY(element);
    const children = this.children(element);

    if (this.rowContainer(element)) {
      for (const child of children) {
        const box = this.rowChildBox(element, child, contentTop, contentHeight);
        into.set(child, box);
        this.place(child, box.top, box.height, into);
      }
      return;
    }

    let cursor = contentTop;
    for (const child of children) {
      const box = { top: cursor + this.marginTop(child), height: this.borderBoxHeight(child) };
      into.set(child, box);
      this.place(child, box.top, box.height, into);
      cursor = box.top + box.height + this.spacing(child, 'margin', 'bottom') + this.gap(element);
    }
  }

  private rowChildBox(
    container: Element,
    child: Element,
    contentTop: number,
    contentHeight: number,
  ): Box {
    const alignment = this.alignment(container, child);
    const explicit = px(this.value(child, 'height'));
    const height = this.borderBoxHeight(child);

    if (alignment === 'center') {
      return {
        top: contentTop + (contentHeight - this.outerHeight(child)) / 2 + this.marginTop(child),
        height,
      };
    }
    if (alignment === 'flex-end' || alignment === 'end') {
      return { top: contentTop + contentHeight - height, height };
    }
    if (alignment === 'stretch' && explicit === null) {
      return { top: contentTop + this.marginTop(child), height: contentHeight };
    }
    return { top: contentTop + this.marginTop(child), height };
  }
}

// ── 探针 ─────────────────────────────────────────────────────────────

function stubRect(element: Element, box: Box): void {
  const rect: DOMRect = {
    top: box.top,
    bottom: box.top + box.height,
    height: box.height,
    y: box.top,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    toJSON: () => ({ top: box.top, height: box.height }),
  };
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => rect,
    configurable: true,
  });
}

/**
 * 量出 `root` 里那套骨架的顶部栏，并把矩形挂到顶部栏子树的每个元素上。
 *
 * 坐标原点是视口顶边：骨架 `.layout` 占满视口且顶部栏是第一行，所以顶部栏的边框盒
 * 就是 `[0, trackHeight]`，控件的 `top` 为负即意味着它被画到了视口上方（看不见）。
 */
export function probeTopbar(root: ParentNode, options: TopbarProbeOptions = {}): TopbarProbe {
  const layout = root.querySelector('.layout');
  const topbar = root.querySelector('.layout__topbar');
  if (layout === null || topbar === null) {
    throw new Error('探针需要 .layout 与 .layout__topbar：请渲染 AppLayout 骨架后再量。');
  }

  const model = new VerticalBoxModel(parseRules(options.styles ?? readAppStyles()));
  const trackHeight = model.trackHeight(layout, model.outerHeight(topbar));

  const boxes = new Map<Element, Box>([[topbar, { top: 0, height: trackHeight }]]);
  model.place(topbar, 0, trackHeight, boxes);
  boxes.forEach((box, element) => stubRect(element, box));

  const actions = root.querySelector('.layout__actions');

  return {
    trackHeight,
    actionsHeight: actions === null ? 0 : model.outerHeight(actions),
    restore: () => {
      boxes.forEach((_box, element) => {
        Reflect.deleteProperty(element, 'getBoundingClientRect');
      });
    },
  };
}
