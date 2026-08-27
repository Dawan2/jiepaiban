# W7 / SEEDANCE-TRANSPORT —— 传输层 v2（无凭据端点配置 + 提交/轮询分离）

**分支** `cursor/w7-seedance-transport-e7ab`
**基线** `cursor/w3-integrate-store-gen-c1f5` @ `8ffe44ff36e421235989d646323f6b4a9ac3c86b`
**改动面** 只新增文件，全部落在 `apps/web/src/generate/seedance/**` 与本文档；
既有 v1 通路（`generate/adapter.ts` / `queue.ts` / `controller.ts`）**一行未改**，
也没有合并任何其它分支。

| 新增文件 | 作用 |
| --- | --- |
| `generate/seedance/config.ts` | `SeedanceEndpointConfig`：往哪发、等多久。**没有凭据字段** |
| `generate/seedance/redline.ts` | 凭据字段判定式、请求体禁用字段清单、环境变量读取扫描 |
| `generate/seedance/transport.ts` | v2 接口：`submitBeat` → job id，`pollJob` 可选；默认桩件 |
| `generate/seedance/submitter.ts` | 把**既有拦截链**接到 v2 前面（含 30s Cap） |
| `generate/seedance/index.ts` | 目录出口 |
| `generate/seedance/testing/sourceScan.ts` | 守卫测试用的源码扫描（读接口声明本身） |
| `generate/seedance/{config,redline,transport,submitter}.test.ts` | 92 条用例 |

---

## 一、为什么配置里不能有凭据字段

前端拿得到的东西等于用户拿得到的东西。浏览器里没有能藏住密钥的地方：

- 构建期 `VITE_*` → 明文进 bundle，`view-source` 就能看到；
- 运行期 localStorage / IndexedDB → 用户与任意扩展都可读；
- 请求头里的 Bearer → DevTools 网络面板直接可见。

三条路都等价于把密钥公开发布。所以 `SeedanceEndpointConfig` 的字段只描述
「往哪发、等多久」，不描述「以谁的身份发」：

```ts
base_url            // 同源相对路径，默认 '/api/seedance'
submit_path         // '/beats'
poll_path           // '/jobs/{job_id}'
request_timeout_ms  // 单次请求超时
poll_interval_ms    // 轮询间隔
poll_max_wait_ms    // 轮询总时长上限
```

鉴权的位置只有一处：**同源中继**。浏览器只发 prompt / 板时长 / 参考图键，
密钥由中继在服务端补齐。`base_url` 默认写成相对路径而不是完整域名，
是为了让「跨域直连模型厂商」这条**必须**前端带密钥的路从一开始就不成立。

本模块也**不读任何环境变量**——没有 `import.meta.env`，没有 `process.env`。
配置一律由调用方显式传入，默认值是不出网的桩件配置。

### 这条约束怎么被钉住：扫接口源码

「配置类型里不能出现凭据字段」是**类型层**的约束，而类型在运行期不存在。
任何基于对象实例的断言都只能证明「默认值里没有」——有人往接口里加一个
`api_key?: string` 而不给默认值，实例断言照样全绿。

所以 `config.test.ts` 直接读 `config.ts` 的源码，把
`interface SeedanceEndpointConfig` 的声明当被测对象：

```
读源码 → 剥注释 → 花括号配对取出接口体 → 抽出属性名 → 逐个过凭据判定式
```

剥注释这一步是必要的：文档注释里得能写出 `apiKey`、`VITE_` 这些词来解释为什么禁它们，
剥掉之后扫到的就只有真代码。守卫本身也有自测（接口改名必须抛错、混入
`api_key` 必须被抓出、`base_url` 不能被误判），否则守卫失效会静默通过。

凭据判定式（`redline.ts`）刻意避开会误伤的宽泛词根：用
`signature|sign_key|signing` 而不是 `sign`，否则 `AbortSignal` 的 `signal`
会被判成凭据。`redline.test.ts` 里 22 个正例与 14 个反例把边界钉住。

## 二、v1 → v2：为什么要改接口形状

v1 的传输层是「一次调用直接拿到成片地址」：

```ts
type SeedanceTransport = (submission) => Promise<{ ok: true; video_url } | { ok: false; failure }>;
```

这在真实接口上不成立——视频生成是异步的，提交与取件必须分开。v2 收成两截：

```ts
submitBeat(prompt, duration_sec, reference_image_keys) → job_id
pollJob(job_id) → PENDING | RUNNING | SUCCEEDED(video_url) | FAILED(failure)
```

**轮询是可选的**（`pollJob?`）。桩件默认提供，不支持轮询的中继可以不实现，
调用方用 `supportsPolling()` 判定，`submitter.pollJob` 在不支持时为 `null`。
这不是为了省事，而是承认「回调 / WebHook 型中继」是合法形态，
把它逼成轮询会多一层假实现。

版本号 `version: 2` 是必需字段，`resolveSeedanceTransport()` 在**装配期**就校验：
误把 v1 的传输层传进来会当场抛错，而不是等到用户点生成时才在运行期炸。

### 请求体恰好三个字段

```ts
interface SeedanceBeatRequest {
  readonly prompt: string;
  readonly duration_sec: number;
  readonly reference_image_keys: readonly string[];
}
```

没有凭据，没有组间衔接 / 节拍名称 / 备注，没有任何镜头级结构。

幂等键与取消信号是**传输级选项**（`SeedanceSubmitOptions`），走请求头与
`AbortSignal`，不进请求体——这样请求体的字段集才能保持封闭并被逐字断言。
测试同时断言了两侧：请求体的键恰为那三个，且序列化结果里搜不到 `idem_`。

参考图键是**不透明存储键**（如 `img_b1_c2_a.png`），不是 URL、不是 data URI。
`validateReferenceImageKeys()` 拒绝 `blob:` / `data:` / 含 `://` 的取值：
发 object URL 出去等于发一个刷新即失效的地址，中继侧根本取不到图
（这正是 W3 遗留缺口 #3 的现状，本槽位先把接口口径定住，不让脏数据出网）。

## 三、30s Cap 仍由既有拦截器把关

**本槽位没有新增任何一条红线判定，也没有抄第二份时长上限常量。**
`submitter.ts` 复用 `generate/interceptors` 的 `DEFAULT_INTERCEPTORS`，
提交顺序是：

```
拦截链（必填齐备 / 30s Cap / 宫格锁 / 红线扫描）
  → 参考图键校验
  → 组请求体（+ Prompt 泄漏断言 + 字段名断言）
  → transport.submitBeat
```

任一步失败都**不会调用传输层**，不消耗额度。`submitter.test.ts` 用一个记账桩件
断言 `calls.length === 0`，而不是只看返回值——「返回了失败但请求已经发出去」
是这类改动最容易出的错。

三条用例把「上限来自既有拦截器」正反都证一遍：

1. 31 秒 → `ok: false`、`code = DURATION_OVER_CAP`、`error_class = 参数缺失`，
   且报错文案里带着 `MAX_BEAT_DURATION_SEC` 的取值；
2. 恰好 30 秒 → 放行（上限是闭区间）；
3. **把 `durationInterceptor` 从拦截链里摘掉，31 秒就过得去**——
   这条反向用例证明 v2 侧确实没有自己藏一份上限判定，
   否则摘掉拦截器后它还会被挡住。

同理，`SeedanceEndpointConfig` 里刻意**没有**时长上限字段，测试直接断言
接口体不含 `duration|cap|max_beat`。30s Cap 的唯一法源是 `domain/beats`
的 `MAX_BEAT_DURATION_SEC`。

## 四、组间衔接永不进请求体

字段名与取值两条线分别守：

- **取值**：Beat 1 黄金样例把衔接（`音频预接`）、名称（`开篇钩子`）、
  备注（三十余字）都填了真值，请求体序列化后逐字搜这三个取值。
  另有一条用例把六种封闭衔接手法逐个赋给板子，每次都重新组请求体并搜一遍。
- **字段名**：`FORBIDDEN_BEAT_REQUEST_KEYS` 递归扫描请求体的全部键（含嵌套对象
  与数组元素）。它是 v1 `FORBIDDEN_SUBMISSION_KEYS` 的**超集**，
  测试断言这个超集关系，两份清单不会各自漂移。

断言点放在三处，覆盖「中途加料」：`buildBeatRequest()` 组体时、
`submitter.buildRequest()` 出网前、桩件 `submitBeat()` 发出前。
最后一处不是多余——它保证任何绕过 submitter 直接调用传输层的代码
也会在发出之前炸掉，而不是静默把脏请求体发出去。

## 五、默认仍是桩件

`resolveSeedanceTransport()` 没传 transport 就返回 `createStubBeatTransport()`：
不出网、不鉴权、不读环境变量，任务 id 由请求内容 + 幂等键做 FNV-1a 得出，
同一入参恒定。成片地址在轮询里给（`stub://seedance-2.5/<job_id>.mp4`，
与 v1 桩件同一形状，成片页无需分辨来源）。

用例里 `vi.spyOn(globalThis, 'fetch')` 断言 `fetch` 一次都没被调用。
接真实中继必须**显式注入** transport——默认值永远是不出网的那个。

## 六、验收

```
npm run typecheck   ✓
npm run lint:terms  ✓  扫了 113 个文件，产品源码无禁用词
npm test            ✓  17 node:test + 527 vitest（26 个文件）
npm run build       ✓
```

测试对账：基线 435 条 → 本槽位 527 条，**+92**，无一条删除或放宽。

| 新增文件 | 用例数 | 覆盖 |
| --- | --- | --- |
| `seedance/config.test.ts` | 11 | 接口源码扫描（凭据字段 / 环境变量 / 无第二份上限）、默认配置、地址拼接 |
| `seedance/redline.test.ts` | 45 | 凭据判定式 22 正例 + 14 反例、请求体清单超集关系、嵌套键收集 |
| `seedance/transport.test.ts` | 17 | 请求体三字段、默认桩件不出网、轮询可选、协议版本校验 |
| `seedance/submitter.test.ts` | 19 | 30s Cap（含摘掉拦截器的反证）、衔接不进体、参考图键、上游异常 |

既有 26 个测试文件中的 22 个未被触碰，用例数与基线逐一相同。

## 七、遗留缺口

1. **没有真实中继客户端。** 本槽位只落接口与桩件，`kind: 'relay'` 的
   `fetch` 实现（含超时、重试、`AbortSignal` 透传）还没写。
   同源中继的服务端也不在本仓库。
2. **v2 还没接进队列。** `generate/queue.ts` 仍在用 v1 的
   `SeedanceTransport`。切换需要队列理解「提交 → 轮询」两段式：
   `PENDING → RUNNING` 的时机从「本地置位」变成「轮询回报」，
   还要处理刷新页面后用 job id 续接轮询。这是下一个槽位的活，
   本槽位刻意不动 v1，避免在没有真实接口时改动生产路径。
3. **参考图键仍未落库。** W3 遗留缺口 #3 未变：`editor/draft.ts` 的
   `FrameImage` 只持有 object URL。本槽位定了「必须是不透明存储键」的口径，
   但产键与存图的 blob 存储还没有。
4. **轮询超时策略只有常量，没有实现。** `poll_max_wait_ms` 与
   `pollTimeoutFailure()` 都在，串起它们的轮询循环等真实中继客户端一起写。
