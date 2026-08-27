# W2 / PROMPT-GEN — Prompt 黄金用例与生成引擎桩件

- 文档编号：`WORK-W2-PROMPT-GEN`
- 归属：Wave 2 / Slot W2-PROMPT-GEN
- 分支：`cursor/wave2-w2-prompt-generate-c608`，基线为 W1/WK2 领域层 `e030f04`
- 上游法源：[`docs/methodology/glossary.md`](../methodology/glossary.md)（METH-002 §4/§5/§8/§9）、
  [`docs/methodology/golden-5-beats.md`](../methodology/golden-5-beats.md)（METH-003 §2/§3）、
  PRD-001 §5.3 / §6.4 / §8.6 / §9，验收项 `AC-F3-*`、`AC-F4-*`、`AC-6.4`、`AC-R3-1`、`NFR-7`

---

## 1. 交付物

| 文件 | 职责 |
| --- | --- |
| `apps/web/src/testing/goldens.ts` | Beat 1 黄金用例数据（婚宴 · 戒指砸地）与整集填充夹具 |
| `apps/web/src/domain/prompt.golden.test.ts` | 黄金回归：全文期望值 + 衔接永不进 Prompt |
| `apps/web/src/generate/types.ts` | 四态状态机、三类失败、`GenerateJob` 模型 |
| `apps/web/src/generate/interceptors.ts` | 前置校验拦截链（必填 / 时长 / 宫格 / 红线） |
| `apps/web/src/generate/adapter.ts` | Seedance 2.5 适配器**桩件** + 幂等键 |
| `apps/web/src/generate/store.ts` | 任务持久化：内存实现与 `localStorage` 实现 |
| `apps/web/src/generate/queue.ts` | 一板一任务的队列与状态流转 |
| `apps/web/src/generate/controller.ts` | `createGenerateController`：给 UI 的唯一入口 |
| `apps/web/src/generate/useGenerateController.ts` | React 接线（`useSyncExternalStore`） |
| `apps/web/src/generate/GenerateActions.tsx` | 按钮 + 状态徽章 + 原因文案（可被 WK3 整体替换） |
| `scripts/forbidden-terms.*` | 禁用词扫描器、配置与自测 |

测试：`prompt.golden.test.ts`(16) / `interceptors.test.ts`(24) / `adapter.test.ts`(15) /
`store.test.ts`(15) / `queue.test.ts`(21) / `controller.test.tsx`(12) —— 前端合计
**12 个文件 202 条**（基线 99 条），另加扫描器自测 **17 条**。

---

## 2. Prompt 黄金用例

`assemblePrompt` 是 WK2 已经落地的，本槽位**只加回归网，不改组装规则**。

黄金值取 METH-003 §3 的 Beat 1 样例，期望全文写成**手写字面量**，不由组装器反推：

```
漫剧厚涂画风，高清8K，人物五官稳定无漂移，冷调高对比，胶片颗粒质感，强逆光，
长发女主，米白抹胸礼服，左颊有疤，画幅9:16，骤然炸裂的震惊，压迫感在三秒内拉满，
时长8秒，极快切入，冲击—反应—环境三段递进，节奏不留缓冲，
婚礼现场戒指被当众砸在地上，女主身份瞬间坍塌，
婚宴主桌前，一枚钻戒被狠狠砸在地上，红酒杯翻倒 → 女主瞳孔骤缩、笑意冻在脸上，指尖攥紧裙摆
 → 全场宾客围观哗然，长辈起身，主位空着一把椅子。
```

三格对应 canon 帧语义 `impact / reaction / env`：**戒指砸地 → 女主震惊 → 宾客围观**，
拼接顺序左 → 右，用 ` → ` 连接。

关于固定前缀：METH-003 §2 的写法是 `漫剧厚涂画风，高清8K... 人物五官稳定无漂移...`（带省略号，
表示画质与一致性约束还会继续补）。WK2 已把它定成常量 `FIXED_PREFIX`，本槽位**不改这个锁**，
只断言三个 canon 锚点：以「漫剧厚涂画风」开头、含「高清8K」、含「人物五官稳定无漂移」。
以后要扩前缀词，改 `FIXED_PREFIX` 一处，黄金值会立刻变红提醒同步。

### 2.1 衔接永不进 Prompt

这是本槽位断言最狠的一条（`AC-6.4`）：

1. 黄金值本身不含六种衔接取值中的任何一个。
2. 黄金值不含 PRD 5.3「转场词拦截清单」里的任何一个词（音频预接 / 螺口顺滑 / 卡点硬切 /
   硬切 / BGM 升调 / 升调截断 / 黑屏断钩子 / 黑屏截断 / 转场 / 过渡）。
3. **六种衔接 × 同一块板**：逐一改 `transition_rule` 后组装，结果**逐字节等于同一个黄金值**。
4. **五块板 × 六种衔接全排列**：30 种组合下衔接词一次都不出现，`findExcludedFieldLeaks` 恒为空。
5. 节拍名称与备注同样不出现；把它们改成哨兵值后组装结果仍等于黄金值。
6. 生成请求体的 JSON 里没有衔接 / 名称 / 备注，也没有镜头级结构字段。

第 3 条比「断言不包含」更强：它证明衔接对组装结果**没有任何影响**，而不只是恰好没漏出来。

---

## 3. 生成引擎桩件

恒等式 `1 Beat = 1 G = 1 节拍板 = 1 次 Seedance 2.5 generate` 落到代码：一块板同一时刻
最多一个在途任务，任务与板 1:1，不拆不合、无模型选择。

### 3.1 状态四态

| 状态码 | 文案 | 含义 |
| --- | --- | --- |
| `PENDING` | 待生成 | 还没提交，或已入队排队中 |
| `RUNNING` | 生成中 | 已提交，等上游返回 |
| `SUCCEEDED` | 成功 | 拿到 `video_url` |
| `FAILED` | 失败 | 带失败类目与可读原因 |

迁移表封闭：`PENDING → RUNNING | FAILED`、`RUNNING → SUCCEEDED | FAILED`，
**成功与失败都是终态**——想再生成只能重新提交，产生一个新任务（`attempt` 递增）。
非法流转直接抛错，不给「悄悄回退状态」留口子。

PRD 5.4 的 UI 徽章有六档（待补全 / 可生成 / 排队中 / 生成中 / 已生成 / 生成失败），
其中「待补全 / 可生成」是**校验态**而非任务态，由 `can_generate` + `blocked_reason` 表达；
「排队中」与「待生成」对用户是同一件事（还没出画面），合成一个点。

### 3.2 失败三类

| 类目 | 文案 | 触发 | 可否原样重试 |
| --- | --- | --- | --- |
| `PARAM_MISSING` | 参数缺失 | 必填没齐、时长越界、宫格数或帧序不对 | 否，先改内容 |
| `API_ERROR` | 接口异常 | 上游报错或传输层抛异常 | 是 |
| `CONTENT_VIOLATION` | 内容违规 | Prompt 命中衔接词 / 排除字段泄漏 / 上游审核不通过 | 否，先改内容 |

三类之外不新增类目，细分原因走 `code`（`DURATION_OVER_CAP`、`FIELD_MISSING`、
`TRANSITION_WORD_HIT`、`EXCLUDED_FIELD_LEAK`、`UPSTREAM_ERROR`、`MODERATION_REJECTED`…），
保证 UI 文案与告警口径收敛（`NFR-6`）。

> 时长超上限本质是「参数非法」而不是「参数没填」，V1.0 只有三类错误，
> 因此归入**参数缺失**并用 `code = DURATION_OVER_CAP` 区分。

### 3.3 时长拦截器（红线）

`0 < duration_sec ≤ 30`，超出即阻断：**不建任务、不打上游、不消耗额度**，
直接把可读原因回给按钮的禁用提示：

```
节拍4时长 45 秒，单板时长不得超过 30 秒（组内时长分配由 AI 负责）
```

拦截链顺序即报错优先级：必填 → 时长 → 宫格 → 红线。测试覆盖 31 / 45 / 60 / 88 / 999 秒
与 0 / 负数 / NaN / Infinity，以及「正好 30 秒放行、31 秒拦截」的边界。

### 3.4 幂等与隔离

- 幂等键 = `project_id + beat_index + prompt + params` 的 FNV-1a 指纹。
- 同板同入参连点两次 → 第二次返回 `reused`，只有一个任务（`AC-F4-5`）。
- 改任一**进 Prompt** 的槽位 → 键变，视为新任务；改衔接 / 名称 / 备注 → 键不变，仍是同一任务。
  这条同时反向验证了「衔接不进请求体」。
- 本板有在途任务时再提交 → `busy`，只锁本板的提交入口，其余四板照常编辑（`IX-4`）。
- 重生成 B3 → 只有 B3 的 `video_url` 变化，其余四板结果与状态不动（`AC-F4-4`）。

### 3.5 桩件边界（没有任何密钥）

适配器**不出网、不读环境变量、不读任何 API Key**。传输层是注入进来的函数：

- 默认 `createStubTransport()`：按幂等键产出确定性占位地址
  `stub://seedance-2.5/b1/idem_xxxxxxxx.mp4`，同一入参永远同一结果。
- `createScriptedTransport([...])`：按剧本返回失败，用来测三类失败分支。
- 接真实接口时**只需替换 transport**，队列、状态机、拦截链、UI 一概不动。

提交体字段恰为五个：`model` / `beat_index` / `prompt` / `params` / `idempotency_key`。
测试逐一断言体内不含 `api_key`、`token`、`secret`，不含衔接 / 名称 / 备注，
也不含 `shot`、`storyboard`、`camera_json`、`lens` 之类的镜头级结构。

### 3.6 持久化

`GenerateJobStore` 五个方法（`list` / `read` / `save` / `remove` / `clear`），两种实现：
内存版与 `localStorage` 版（key `jiepaiban.generate.jobs.v1`，坏数据按空表处理）。
WK3 接后端时新增一个实现即可，队列不感知存储介质。

---

## 4. UI 接线与给 WK3 的交接

编辑页的两个按钮已接上（`EditorPage.tsx`）：顶栏「生成全集」、板内「生成本板」+ 状态徽章 +
禁用原因。所有判断都在控制器里，UI 只渲染 `GenerateBoardState`：

```ts
const { controller, states } = useGenerateController(project);
// states[i] = { status_label: '待生成', can_generate, blocked_reason, action_label, video_url, failure }
controller.generateBeat(1);      // 生成本板
controller.generateEpisode();    // 按 B1 → B5 依次发起 5 次独立调用
controller.retryBeat(3);         // 重试 / 重新生成，只影响本板
```

**边界约定**：本槽位不产出任何布局与宫格样式。`GenerateActions.tsx` 只有按钮、徽章与
原因文案三样东西，用了两个新 class（`.generate*`）追加在 `styles.css` 末尾，
没有改动编辑区、板体或宫格的任何既有样式。WK3 落板体时可以整体替换这个文件，
只要继续调 `createGenerateController` 的方法，生成行为与红线断言不受影响。

不用 React 也能接：`createGenerateController({ project, store, adapter, autoRun })`
返回的是纯对象，`subscribe` + `snapshot` 即可对接任意视图层。

---

## 5. 禁用词扫描（NFR-7）

`npm run lint:terms` 扫全仓，命中即挂 CI；`npm run test:terms` 是扫描器自测（17 条，
用 Node 内置 `node:test`，不依赖 vitest 与 jsdom）。两者都已挂进 `.github/workflows/ci.yml`。

清单来自 METH-002 §8：**分镜、故事板、单镜头时长、单镜时长**，每个词都配了正确替代词，
报错时直接给出「应改用：节拍板 BeatBoard / 节拍帧」。

口径分两档：

1. **产品源码必须干净，且不接受任何例外。** 配置校验会把任何指向产品源码的例外
   直接判为违规（`validateConfig` 里那条「越界」规则），并有一条测试专门断言
   `apps/web/src/**` 的代表性文件都不在豁免名单里。
2. **法源文档与守卫测试可以引用。** 方法论与 PRD 要写出禁用词表本身；`App.test.tsx`
   这类守卫测试也必须写出禁用词才能断言 UI 里没有它。这两类登记在
   `scripts/forbidden-terms.json` 的 `exceptions` 里，**每条都要写理由**。

顺带把 WK1/WK2 注释里残留的禁用词换成了标准词（`App.tsx`、`AppLayout.tsx`、`MainNav.tsx`、
`beats.ts`、`prompt.ts`，都只改注释文案，行为零变化）——按 METH-002 的判定，
禁用词出现在任何产物中都算违规，注释也是产物。

---

## 6. 取舍与留痕

1. **不重写 WK2 的锁。** `assemblePrompt` / `FIXED_PREFIX` / 硬排除清单原样保留，
   本槽位只在外面加黄金回归网与出网口断言（`buildSubmission` 里再跑一次 `assertPromptClean`）。
2. **前置校验不建任务。** PRD 说「任一不过即阻断」，所以校验没过时 `enqueue` 返回
   `blocked` 且**不产生任务**，避免任务列表里堆一串从没提交过的失败记录。
   失败态只留给真正提交过上游的任务。
3. **「排队中」不单独设一态。** 见 3.1，队列里等待与还没提交对用户是同一件事。
4. **转场词扫描放在组装之后。** 组装器已经在源头剔除衔接字段，红线拦截器是兜底的
   第二道；代价是用户在剧情核心里写「转场」二字也会被拦，这与 PRD `FR-3-04`
   「组装后扫描转场词，命中即拦截并报错」一致，属预期行为。
5. **不碰 WK3 的地盘。** 没有新建板体组件、没有动宫格 CSS、没有改 `BeatNav` 与布局。

---

## 7. 交给下一槽位

1. 板级按钮如果要挪进板体，把 `BeatGenerateAction` 换掉即可，
   继续用 `controller.generateBeat / retryBeat` 与 `states[i]`。
2. 接真实 Seedance 2.5 接口时只替换 `transport`，并在失败映射里
   把上游错误分派到三类之一（网络与 5xx → 接口异常，审核 → 内容违规）。
3. 接后端持久化时实现 `GenerateJobStore`，把 `createGenerateController({ store })` 换过去；
   任务字段已是 snake_case，可直接序列化。
4. 新增文案与字段前先跑 `npm run lint:terms`；要给文档开例外，在
   `scripts/forbidden-terms.json` 里写清理由，**不要**给产品源码开例外（会被配置校验直接判违规）。
