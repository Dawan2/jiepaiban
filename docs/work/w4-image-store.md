# W4 / IMAGE-STORE — 节拍帧参考图的本地持久化

- 槽位：Wave 4 / IMAGE-STORE
- 分支：`cursor/w4-image-store-8321`（起点 `cursor/wave2-wk-store-local-persistence-7ecb` @ `6a118af`）
- 状态：已完成（typecheck / test / build 全绿，265 条测试；另在真实 Chrome 上跑过一遍端到端）
- 法源：PRD V1.0 §5.2 节拍卡与宫格、§7.2 复用、§8 数据模型；
  架构 `tech-stack.md` §2 本地持久化优先、`system-architecture.md` §5 横切关注点
- 上游：W2/WK-STORE 本地持久化（[`w2-local-store.md`](w2-local-store.md)），本槽位补的正是它列在
  「明确不在范围内」里的 `blobs` object store

## 1. 一句话

节拍帧的参考图**以字节形式**存进 IndexedDB，键为 `项目 + 板序 + 帧序`，刷新后照样在；
对外只暴露一个 `FrameImageStore` 与一个 `useBeatFrameImages` hook，宫格编辑器（WK3）直接接就行。

## 2. 为什么不能只存 object URL

`URL.createObjectURL(blob)` 返回的 `blob:` URL 的**生命周期绑在当前文档上**：
刷新、跳转、关标签页之后它一律失效。把它当"图片地址"存进项目记录，得到的是一条
刷新后必然加载失败的引用——而且失败得很安静（`<img>` 就是不显示，控制台一行 404 都没有）。

所以本槽位存的是**图片字节**，URL 在需要展示时才现场生成，并由生成方负责回收：

```
用户选图 → 读字节 → 校验 → 写 IndexedDB（字节）
展示     → 读字节 → new Blob([bytes]) → createObjectURL → <img src>
离开     → revokeObjectURL
```

真实浏览器里的证据（见 §9）：刷新前后 `<img src>` 是两个不同的 `blob:` URL，
但显示的是同一张图——URL 是派生物，字节才是数据。

## 3. 交付物

| 交付物 | 位置 |
|---|---|
| 单库 `beatboard` 的唯一打开点与 store 清单 | `apps/web/src/adapters/indexeddb/beatboardDb.ts` |
| 准入校验（白名单 / 字节签名 / 体积 / 配额） | `apps/web/src/adapters/images/validation.ts` |
| 帧位坐标与主键编解码 | `apps/web/src/adapters/images/frameImageKey.ts` |
| 存储驱动端口 + 三实现（IndexedDB / 内存 / 不可用替身） | `apps/web/src/adapters/images/frameImageDriver.ts` |
| `FrameImageStore`（本槽位的公开 API） | `apps/web/src/adapters/images/frameImageStore.ts` |
| React 上下文（单例图片仓） | `apps/web/src/store/FrameImagesProvider.tsx` |
| 编辑器用的 hook（含 object URL 生命周期） | `apps/web/src/store/useBeatFrameImages.ts` |
| 编辑页里的最小配图面板（**不是**宫格编辑器） | `apps/web/src/components/FrameImagePanel.tsx` |
| 图片字节夹具（真魔数） | `apps/web/src/testing/imageFixtures.ts` |

## 4. 存储布局

IndexedDB 单库 `beatboard`，本槽位把版本从 v1 抬到 **v2**，新增两个 object store：

| store | 主键 | 内容 | 索引 |
|---|---|---|---|
| `frameImageMeta` | `项目id::板序::帧序` | 文件名、真实 MIME、字节数、保存时间 | `byProject`（`projectId`）、`byBeat`（`[projectId, beatIndex]`） |
| `frameImageBytes` | 同上 | `{ key, bytes }` | — |

**为什么分两张表**：列一块板 / 一个项目的图片清单时只读元数据表，
不必把每张图的字节反序列化进内存——那是"点开编辑页就吃掉几十 MB"级别的差别。
两表的写入与删除都在**同一个事务**里完成，因此不会出现"有元数据没字节"的半条记录
（有用例直接从驱动端口核对两张表，见 §8）。

**图片不进项目记录**，这不是洁癖：

- 项目记录每次字段改动都要整条重写（自动保存 2s 一次），把几 MB 的图焊在里面，
  等于每敲几个字就搬一遍所有图片；
- 导出备份是 JSON，图片留在项目记录里就得 base64 进文本，一个项目的备份能到几十 MB。

代价是**删项目必须顺手删图片**（§6），以及导出备份目前不含图片（§7 已知缺口）。

### 4.1 版本号必须集中管理（本槽位改了 W2 的一处结构）

IndexedDB 的版本号是**库级**的，不是 store 级的。若项目驱动按 v1 打开、图片仓按 v2 打开
同一个库，后开的那一侧必然拿到 `VersionError`，或者把先开的连接卡在 `blocked`。

因此库名、版本号、建表全部收进 `adapters/indexeddb/beatboardDb.ts`，
`persistence/drivers.ts` 与 `images/frameImageDriver.ts` 都只调 `openBeatboardDb(factory)`：

- 连接按 `IDBFactory` 实例缓存，同一 factory 上的所有调用方共用一条连接，
  「一侧正在升级、另一侧被自己挡住」这种自锁死不可能发生；
- `onupgradeneeded` 里每个 store 先判存在再建，v1 老库升上来只补缺的两个，老数据一条不动；
- `onblocked` 明确 reject 并提示"关掉本站的其他标签页"。旧标签页持着 v1 连接时升级会被挂住，
  挂住的表现是**整个应用读不出任何项目**——宁可报错也不要静默地卡在那里。

> 下游槽位要加 `jobs` / `snapshots` / `segments` / `settings` 等 store：
> 只改 `beatboardDb.ts` 的 `DB_VERSION` 与 `upgrade()`，不要在别处再 `indexedDB.open`。

## 5. 准入校验：三道关

| 关卡 | 规则 | 拒收原因 |
|---|---|---|
| 声明类型白名单 | `image/png` / `image/jpeg` / `image/webp` / `image/gif` / `image/avif`（`image/jpg` 归一到 jpeg） | `type` |
| 字节签名 | 按文件头判定真实类型；声明非空时必须与签名一致 | `content` |
| 空文件 | 0 字节直接拒 | `empty` |
| 单图上限 | 8 MiB | `too-large` |
| 项目配额 | 64 MiB，覆盖时按差额计算 | `quota` |
| 坐标 | 板序 1–5、帧序 1–3，且该帧位在宫格锁下存在 | `key` |

**为什么要看字节签名**：`File.type` 是浏览器按扩展名猜的。把 `.exe` 改名成 `.png`
就能骗过白名单，然后本地库里躺着一堆非图片字节，`<img>` 只是不显示，用户无从排查。
签名校验把这条路堵死，并且**落库存的是签名判定的类型**，不是浏览器的猜测。
（真实浏览器里的验证：伪装文件被拒，库里仍只有 1 条记录。）

**为什么要有配额**：IndexedDB 的配额是浏览器按站点整体分配的，写爆之后
**项目本身也存不进去**。宁可在入口拒掉一张大图，也不能让参考图把节拍数据挤掉。
UI 常驻显示"本项目参考图 N 张 · 已用 / 上限"。

拒收一律抛 `FrameImageError`，带机器可读的 `reason` 与人读文案（说明支持哪些格式、
多大、下一步该干什么）。hook 把它转成界面上的 `error` 文案而不是异常：
它的正常触发者是"用户选了个 PDF"这类可恢复操作，不是程序缺陷。

## 6. 帧位坐标与红线

坐标不是随便一个字符串，它必须与三条红线一致：

| 锁 | 对坐标的约束 | 法源 |
|---|---|---|
| 五节拍锁 | 板序恒为 1–5，没有第 6 块板 | `RULE-2`、AC-6.1 |
| 宫格锁 | B1–B4 有 3 个帧位、B5 只有 2 个 | `RULE-3`、`FR-1-03` |
| 帧序锁 | 帧位恒为左→右 1–3，无排序权重 | `RULE-7`、R4 |

于是「给 B5 的第 3 格配图」不是"暂不支持"，而是**坐标本身非法**：UI 从不渲染那个格子，
能构造出这个坐标只可能是调用方绕过了推导。一个项目最多 3+3+3+3+2 = **14 张**参考图。

主键 `项目id::板序::帧序` 稳定可复现，因此"同一帧位再传一张"天然就是覆盖，不会堆重复记录；
项目 id 里出现分隔符会被拒（否则不同坐标可能编出同一个键）。脏键读回时解码为 `null`
并跳过该条，不让一条坏数据把整块板读不出来。

**项目生命周期的接线**：

- **删项目**：`ProjectsProvider.remove` 先清图片再删记录。反过来一旦图片清理失败，
  项目记录已经没了，那些字节就再也没有入口能找到它们。这个顺序下失败是"整件事没做成"，用户可重试。
- **复用（PRD §7.2）**：复用产物是新 id，因此天然不继承参考图——与"画面内容一律清空"一致，有用例钉死。
- 图片仓上下文缺失时 `ProjectsProvider` 走 `useOptionalFrameImageStore()` 的 `null` 分支，
  既有测试不必为此套一层 Provider。

## 7. 明确不在本槽位范围内

- **宫格（节拍帧）编辑器**仍归 WK3。`FrameImagePanel` 是一个最小配图面板，
  帧位数由宫格锁推导、不提供增删入口；WK3 落地宫格编辑器时把 `slots[i].url`
  挂到自己的格子上、把文件交给 `upload(order, file)`，然后删掉这个面板即可。
  **不要再写第二套图片读写。**
- **参考图不进 Prompt**。它是给人看、给后期对照的，与「衔接」同类（`RULE-9` 的同类约束）。
  图生视频要不要把首帧喂给模型，是生成槽位的决定，本槽位不预设。
- **导出 / 导入备份暂不含图片**（已知缺口）。当前备份是纯 JSON 文本，
  图片进去就得 base64。要补的话建议换 zip（JSON + 图片文件），而不是把 base64 塞进现有封套；
  那时需要 `SCHEMA_VERSION` +1 与一条迁移。
- **不做图片压缩 / 缩略图生成 / EXIF 清理**。超限时提示用户自己压，不静默改写用户的原图。
- **没有 localStorage 兜底**：它只能存字符串（base64 体积 +33%），配额通常只有 5 MB，
  一张参考图就能撑爆。IndexedDB 不可用时正确行为是明确告知"此环境不能存参考图"
  （`UnavailableFrameImageDriver`：读空、写即报错），而不是塞进一个必然写爆的地方。

## 8. 给下游槽位的接口约定

```ts
import { useBeatFrameImages } from '@/store/useBeatFrameImages';

// 编辑页里一块板的全部帧图：
const { slots, state, error, usage, upload, remove } = useBeatFrameImages(projectId, beatIndex);

// slots.length 恒等于该板宫格数（B1–B4 = 3、B5 = 2）
slots.map((slot) => slot.url); // 可直接给 <img src>，回收由 hook 负责
await upload(1, file);          // 校验失败不抛，转为 error 文案
await remove(1);
```

需要绕过 React 直接读写（例如导出、生成前组装）时用仓本身：

```ts
import { useFrameImageStore } from '@/store/FrameImagesProvider';
// 或在非组件代码里 createFrameImageStore()

const store = useFrameImageStore();
await store.put({ projectId, beatIndex: 1, frameOrder: 2 }, file); // 覆盖式
const image = await store.get({ projectId, beatIndex: 1, frameOrder: 2 }); // { blob, name, type, size, savedAt }
await store.listBeat(projectId, 1);      // 元数据清单，不加载字节
await store.listProject(projectId);
await store.removeBeat(projectId, 1);
await store.removeProject(projectId);    // 删项目时必须调用
await store.usage(projectId);            // { count, bytes, limitBytes, remainingBytes }
```

三条硬约定：

1. **不要自己 `createObjectURL`**。要么用 hook 给的 `slot.url`，要么自己 revoke——
   忘记 revoke 的泄漏在功能测试里完全无症状。
2. **不要绕过 `FrameImageStore` 直接写 store**：校验与坐标锁只在这一处把关。
3. **不要把图片写进项目记录**（理由见 §4）。

## 9. 验证

```bash
npm install
npm run typecheck   # tsc --noEmit，无错误
npm test            # Vitest：16 个文件 / 265 条测试全部通过（本槽位新增 131 条）
npm run build       # 生产构建通过
```

本槽位新增的测试：

| 文件 | 覆盖 |
|---|---|
| `adapters/images/frameImageStore.test.ts`（61） | 同一批断言跑在内存 / IndexedDB 两种驱动上：字节逐字节往返、换实例仍读得到、覆盖不堆记录、项目/板/帧互不串、清单排序、六类拒收、坐标锁、删单张/板/项目、连字节一起删、配额（含覆盖按差额）、两表主键一致、驱动选择与不可用替身 |
| `adapters/images/validation.test.ts`（26） | 五种格式的文件头、SVG/BMP/TIFF/PE 被拒、截断头不猜、MIME 归一、声明与签名不符、上限边界（恰好通过 / 多一字节即拒）、配额边界、体积文案 |
| `adapters/images/frameImageKey.test.ts`（16） | 帧位由宫格锁推导、B5 无第 3 格、板序/帧序越界、分隔符注入、编码稳定与唯一（14 个帧位）、脏键解码为 null |
| `store/useBeatFrameImages.test.tsx`（12） | 槽位数、上传落库、只刷新被改的那一格、覆盖/移除/切板/卸载四个时机 revoke URL、校验失败转错误文案且不写库、重挂载后恢复 |
| `store/FrameImagesProvider.test.tsx`（6） | 缺 Provider 明确报错、可选读取、不传 prop 时不重建仓、删项目连带清图、取消删除保留、复用不继承图片 |
| `components/FrameImagePanel.test.tsx`（10） | 编辑页接线：B1 三格 / B5 两格、配图后缩略图与落库、移除、切板、占用量、accept 过滤、伪装文件与超大图的提示、**卸载整个应用再挂载后图片仍从 IndexedDB 读回** |

### 变异验证（确认测试不是摆设）

逐个把实现改坏，确认对应用例转红，然后回退：

| 改坏什么 | 转红的用例 |
|---|---|
| 去掉字节签名校验，只信 `File.type` | 10 条（含面板上的伪装文件用例） |
| `revokeObjectURL` 改成空实现 | 4 条生命周期用例 |
| 删项目时不清图片 | 1 条 |
| 帧位校验改成只看 1–3，不看宫格锁 | 6 条 |
| 落库时不写字节（只留元数据） | 13 条（含"刷新后仍在"） |
| 去掉项目配额检查 | 2 条 |

### 真实浏览器验证

`fake-indexeddb` 证明不了真实 IndexedDB 的事务、索引与升级行为，也证明不了 object URL
的真实生命周期，因此额外在 Chrome 148（playwright-core 驱动真实 `google-chrome`，
`vite preview` 提供 SPA 回退）上跑了一遍端到端，全部通过：

- **v1 老库升级**：先用脚本造一个只有 `projects` / `meta` 的 v1 库并塞进一条项目，
  再让新代码接管 → 库自动升到 v2、四个 store 齐备、**老项目一条不丢**。
- **落库位置与内容**：直接读 IndexedDB 核对 —— 元数据在 `frameImageMeta`、键为
  `prj_legacy::1::1`、表里没有字节；字节在 `frameImageBytes`，248 B、头 8 字节正是 PNG 魔数。
- **刷新后仍在**：刷新前后 `<img src>` 是两个不同的 `blob:` URL，显示同一张图。
- **宫格锁**：B1 三个帧位、B5 两个。
- **伪装文件**：改名成 `.png` 的文本被拒，提示写明支持的格式；库里仍只有 1 条记录。
- **移除**：元数据与字节同时归零，不留孤儿字节。
- **删项目**：`projects` / `frameImageMeta` / `frameImageBytes` 三张表同时归零。

顺带发现一处**只有真实浏览器才暴露的差异**：真 Chrome 的结构化克隆会把 `Uint8Array`
原样存回（读出来是视图），而 jsdom + `fake-indexeddb` 给回的是一段裸 buffer。
驱动层读字节时不做 `instanceof ArrayBuffer` 判断、只按"是不是视图 / 有没有 byteLength"
取值并拷进自己的 buffer，正是为了同时容纳这两种情况——这段防御代码不是多余的。
