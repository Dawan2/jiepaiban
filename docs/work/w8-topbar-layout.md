# W8 / TOPBAR-LAYOUT —— 板级生成动作移出顶部栏，并把「不许裁」写成回归测试

**分支** `cursor/w8-topbar-layout-224e`
**基底** `cursor/w7-merge-templates-9e75` @ `acab82b0ff0807a87c9600d3f65f9a1493286400`
**修的是** W5 审计 P0：56px 的顶部栏把板级生成动作裁到视口外，
`保存` / `生成全集` / `成片` 三个按钮量出 `top: -17`。

---

## 一、事故成因

顶部栏是骨架里恒 56px 的那一行（`.layout` 的第一条行轨道），
里面横着放的是**全站级单行控件**。基底把板级生成动作也塞进了同一排：

```
.layout__actions
├─ span.savestate      「已保存」        1 行
├─ button.btn          「保存」          32px
├─ div.generate        ← 板级生成动作     最多 4 行
│  ├─ p.generate__row      徽章 + 按钮
│  ├─ p.generate__reason   禁用原因（未填齐时出现）
│  └─ p.generate__result   成片地址（生成成功后出现）
├─ button.btn          「生成全集」      32px
└─ a.btn               「成片」          32px
```

`div.generate` 是块级多行内容，动作区的高度被它顶到 56px 以上；
动作区在顶部栏里 `align-items: center` 居中，于是**整块动作区被顶出行外**，
而动作区自己没有定交叉轴对齐（默认 `stretch`），同排的单行按钮跟着贴到动作区顶边，
一起画到视口上方——按钮在屏幕外，鼠标点不到。

真实浏览器实测（基底 `acab82b`，Chrome 1440×900，套黄金五板样板的项目）：

| 量的东西 | 基底 | 本分支 |
| --- | --- | --- |
| 顶部栏高度 | 56 | 56 |
| `.layout__actions` 高度 | **61** | **32** |
| `保存` 的 `top` | **-3** | **+11.5** |
| `生成全集` 的 `top` | **-3** | **+11.5** |
| `成片` 的 `top` | **-3** | **+11.5** |
| 板级动作块在顶部栏里 | 是 | 否 |

审计报的是 `-17`，实测是 `-3`：差在板级动作那一刻有几行——
只有徽章行时动作区 61px，再长出禁用原因或成片地址就是 80–99px，越出越多。
量级与方向一致，是同一个缺陷。

---

## 二、修法

### 1. 板级动作进板体：信息条末位的「本板生成」动作位

`BeatInfoBar` 新增 `actions` 槽，渲染成末位的 `.infobar__field--action`（整行独占）；
`BeatBoardBody` 新增 `beatActions` 传参把它接出去；`EditorPage` 把
`BeatGenerateAction` 从 `AppLayout` 的 `actions` 挪到这里。

分层没被打破：`BeatInfoBar` / `BeatBoardBody` 都不认识生成引擎，只留槽；
`GenerateActions.tsx` 仍然只产「按钮 + 徽章 + 原因」，不产布局。

顶部栏从此只剩全站级单行控件：**保存态 / 保存 / 生成全集 / 成片**。
派单里的「reset」在本产品的顶部栏没有对应控件（列表页是导出备份 / 导入备份 / 新建项目），
故只保留既有四项，未新造入口。

### 2. 行高从裁刀改回设计带

```css
.layout { grid-template-rows: minmax(56px, auto) minmax(0, 1fr); }
.layout__actions { align-items: center; }
```

56px 仍是设计带宽，但写成 `minmax(56px, auto)`：万一以后有人再往顶部栏塞多行内容，
行会长高而不是把内容裁到视口上方。动作区补 `align-items: center`，
让单行控件在带里居中，而不是跟着某个变高的兄弟节点漂走。

顶部栏没有也不要 `overflow: hidden`（有守卫测试盯着）。

### 3. `.generate` 卸掉外围留白

原来它带 `margin-top: 16px` + `padding-top: 12px` + 上边框，是「挂在面板底部」的假设。
改成 `display: grid; gap: 6px`，留白与分隔线归容器，
块因此可以被挪到板体任意位置而不带走一圈外边距。

---

## 三、回归测试：jsdom 不排版，那就把排版算出来

jsdom 里 `getBoundingClientRect()` 一律返回全 0，`css: false` 也不加载样式表——
这类「被裁掉」的缺陷在现有页面测试里**量不出来**，这正是它能一路走到 W5 审计的原因。

### 探针 `testing/layoutProbe.ts`

`probeTopbar(container)` 读**产品样式表** `src/styles.css` + **真实渲染出的 DOM**，
按 CSS 声明还原一个纵向盒模型（外边距 / 边框 / 内边距 / 显式高度 / 单行文本行高 /
flex 行的 `align-items` 与 `align-self` / 块流堆叠 / `grid-template-rows` 的
`minmax()` 语义），再把算出来的矩形挂回顶部栏子树每个元素的 `getBoundingClientRect()`。
测试于是能直接写「这个按钮的 `top` 不许为负」。

模型的边界写在文件头：只算纵向，不算换行与文本折行；选择器不比特异性，按出现顺序覆盖
（本项目样式表是单文件顺序书写）；`position: absolute/fixed` 与 `display: none` 不占高度
（列表页那个隐藏的文件选择框因此不参与计算）。`styles` 可注入，供自检用例反证。

### `components/topbarLayout.test.tsx` —— 14 例，四把锁

| 锁 | 断言 | 能挡住什么 |
| --- | --- | --- |
| 探针自检 | 用 W5 那版 CSS（行高写死 56px + 动作区 `align-items: stretch`）把板级动作原样搭回顶部栏，探针必须量出 `top < -10` | 探针失灵后守卫变成空转 |
| 几何锁 | 三个页面顶部栏里所有按钮与链接：`top ≥ 0` 且 `bottom ≤` 行高 | 行高被改回固定值且内容超高 |
| 单行锁 | 动作区外盒高度 `≤ 56px`；另加两条最坏内容用例：未填齐（多一行禁用原因）、生成成功（多一行成片地址） | 多行块被塞回顶部栏 |
| 结构锁 | 顶部栏动作区里没有 `.generate`、没有「生成本板」；板级动作在 `.infobar .infobar__field--action` 里；编辑页顶部栏的控件恰好是 `保存 / 生成全集 / 成片` | 结构回退 |

最坏内容那两条是必要的：板级动作只有徽章行时高 32px，塞回顶部栏也不会破 56px 带宽，
单行锁量不到。加上禁用原因或成片地址后是 57.2px，锁才咬得住。

**变异验证**（把 `BeatGenerateAction` 挪回 `AppLayout` 的 `actions`，其余不动）：
14 例中 4 例失败 —— 单行锁的两条最坏内容用例（`57.2 > 56`）、
结构锁的「动作区里没有板级动作块」与「顶部栏只有三个控件」。守卫不是空转。

---

## 四、验证

| 闸门 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint:terms` | 通过（109 文件，产品源码无禁用词） |
| `npm test` | **24 文件 / 514 例全绿** |
| `npx vite build` | 通过 |

用例数 500 → 514，新增 14 例全在新文件里，**原有 500 例一条未改、一条未删**。

真实浏览器（Chrome，生产构建）走完「新建 → 套模板 → 进编辑页 → 生成本板」：

- 顶部栏 56px，动作区 32px，三个控件 `top` 都是 `+11.5`，`bottom` 43.5——都在带内；
- 生成成功后 `成片地址：stub://seedance-2.5/b1/idem_97f30d42.mp4` 出现在信息条的动作位里
  （该字段高 99px），顶部栏高度与控件位置**一点没动**。

---

## 五、顺手发现的另一个 P0（不属于本槽位，未动）

`dev` 模式下点「生成本板」后状态永远停在「待生成…」，生成不推进；
同样的操作在生产构建里正常出成片地址。基底 `acab82b` 上同样复现，与本次改动无关。

成因指向 `generate/useGenerateController.ts`：

```ts
const controller = useMemo(() => createGenerateController(...), [project.id]);
useEffect(() => () => controller.dispose(), [controller]);
```

控制器是 `useMemo` 缓存的对象，而 `dispose()` 会解绑队列订阅并清空监听者。
React 19 的 StrictMode 在开发模式下会「挂载 → 卸载 → 再挂载」跑一遍效果，
清理函数把这个**仍将继续使用**的控制器废掉，重挂时 `useMemo` 返回的还是同一个死对象，
`invalidate()` 再也通知不到 React，视图从此不更新。

修法方向（留给生成槽位）：清理里重建订阅，或把生命周期从 `useMemo` 换成
`useSyncExternalStore` 之外的显式订阅/退订对，让 dispose 与 subscribe 成对可重入。
本槽位只改布局，没碰 `generate/` 的逻辑，避免与并行槽位撞车。
