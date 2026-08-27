/**
 * 节拍帧参考图仓的落盘回归（W4/IMAGE-STORE）。
 *
 * 同一批断言跑在两种驱动上（内存 / IndexedDB，后者用 `fake-indexeddb`），
 * 以此保证「换存储介质不改业务行为」这条端口化承诺是真的，而不是只写在文档里。
 *
 * 重点是**字节真的落盘了**：断言一律读回内容逐字节比对，而不是"有个 URL 就算存住了"——
 * 本槽位存在的理由正是 object URL 刷新即失效，只存 URL 等于没存。
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BEAT_COUNT, type BeatIndex } from '../../domain/beats';
import {
  PNG_MAGIC,
  bytesOf,
  jpegFile,
  oversizedPngFile,
  pngFile,
  renamedTextAsPng,
  textFile,
} from '../../testing/imageFixtures';
import {
  IndexedDbFrameImageDriver,
  MemoryFrameImageDriver,
  UnavailableFrameImageDriver,
  selectFrameImageDriver,
  type FrameImageDriver,
} from './frameImageDriver';
import { FrameImageStore } from './frameImageStore';
import { encodeFrameImageKey, type FrameImageKey, type FrameOrder } from './frameImageKey';
import {
  FrameImageError,
  MAX_FRAME_IMAGE_BYTES,
  MAX_PROJECT_IMAGE_BYTES,
  type FrameImageRejection,
} from './validation';

let tick = 0;
const clock = () => `2026-08-27T00:00:${String(tick++).padStart(2, '0')}.000Z`;

const key = (
  beatIndex: BeatIndex = 1,
  frameOrder: FrameOrder = 1,
  projectId = 'prj_1',
): FrameImageKey => ({ projectId, beatIndex, frameOrder });

async function bytesOfBlob(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())];
}

/** 断言抛出的是 FrameImageError 且拒收原因正确（只断言"抛了"会漏掉误判分支）。 */
async function expectRejection(run: Promise<unknown>, reason: FrameImageRejection): Promise<void> {
  await expect(run).rejects.toThrow(FrameImageError);
  await run.catch((cause: unknown) => {
    expect(cause).toBeInstanceOf(FrameImageError);
    expect((cause as FrameImageError).reason).toBe(reason);
  });
}

const drivers: readonly [string, () => FrameImageDriver][] = [
  ['内存', () => new MemoryFrameImageDriver()],
  ['IndexedDB', () => new IndexedDbFrameImageDriver(indexedDB)],
];

describe.each(drivers)('FrameImageStore（%s 驱动）', (_label, makeDriver) => {
  let driver: FrameImageDriver;
  let store: FrameImageStore;

  beforeEach(async () => {
    tick = 0;
    driver = makeDriver();
    await driver.clear();
    store = new FrameImageStore(driver, clock);
  });

  describe('落盘与读回', () => {
    it('存进去的是图片字节本体，读回后逐字节相同', async () => {
      const meta = await store.put(key(1, 2), pngFile('hook-frame-2.png', 32));

      expect(meta).toMatchObject({
        projectId: 'prj_1',
        beatIndex: 1,
        frameOrder: 2,
        name: 'hook-frame-2.png',
        type: 'image/png',
        size: PNG_MAGIC.length + 32,
      });

      const image = await store.get(key(1, 2));
      expect(image).not.toBeNull();
      expect(image?.blob.type).toBe('image/png');
      expect(await bytesOfBlob(image!.blob)).toEqual([...bytesOf(PNG_MAGIC, 32)]);
    });

    it('换一个 store 实例仍读得到（图片不在实例内存里）', async () => {
      await store.put(key(3, 1), pngFile('reload.png', 24));

      const another = new FrameImageStore(driver, clock);
      const image = await another.get(key(3, 1));

      expect(image?.name).toBe('reload.png');
      expect(await bytesOfBlob(image!.blob)).toEqual([...bytesOf(PNG_MAGIC, 24)]);
    });

    it('同一坐标再存一张是覆盖，不是新增', async () => {
      await store.put(key(1, 1), pngFile('first.png', 16));
      await store.put(key(1, 1), jpegFile('second.jpg', 40));

      const listed = await store.listBeat('prj_1', 1);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ name: 'second.jpg', type: 'image/jpeg' });
      expect((await store.get(key(1, 1)))?.blob.type).toBe('image/jpeg');
    });

    it('读不到的坐标返回 null，而不是抛错', async () => {
      expect(await store.get(key(2, 1))).toBeNull();
      expect(await store.getMeta(key(2, 1))).toBeNull();
    });

    it('不同项目 / 板 / 帧互不串数据', async () => {
      await store.put(key(1, 1, 'prj_a'), pngFile('a-1-1.png'));
      await store.put(key(1, 2, 'prj_a'), pngFile('a-1-2.png'));
      await store.put(key(2, 1, 'prj_a'), pngFile('a-2-1.png'));
      await store.put(key(1, 1, 'prj_b'), pngFile('b-1-1.png'));

      expect((await store.listBeat('prj_a', 1)).map((meta) => meta.name)).toEqual([
        'a-1-1.png',
        'a-1-2.png',
      ]);
      expect((await store.listProject('prj_b')).map((meta) => meta.name)).toEqual(['b-1-1.png']);
      expect((await store.get(key(1, 1, 'prj_b')))?.name).toBe('b-1-1.png');
    });

    it('清单按板序、帧序升序，且不受写入顺序影响', async () => {
      await store.put(key(4, 2), pngFile('b4-f2.png'));
      await store.put(key(1, 3), pngFile('b1-f3.png'));
      await store.put(key(1, 1), pngFile('b1-f1.png'));

      expect((await store.listProject('prj_1')).map((meta) => [meta.beatIndex, meta.frameOrder])).toEqual([
        [1, 1],
        [1, 3],
        [4, 2],
      ]);
    });

    it('落库的类型以字节签名为准，不采信浏览器声明的 MIME', async () => {
      // 内容是 PNG，声明成 jpeg：声明与签名不符应被拒（见下一组），
      // 而声明为空时以签名为准落库。
      const declaredEmpty = new File([bytesOf(PNG_MAGIC, 8)], 'dragged', { type: '' });
      const meta = await store.put(key(1, 1), declaredEmpty);

      expect(meta.type).toBe('image/png');
      expect((await store.getMeta(key(1, 1)))?.type).toBe('image/png');
    });
  });

  describe('准入校验', () => {
    it('非图片文件拒收（声明类型就不在白名单里）', async () => {
      await expectRejection(store.put(key(), textFile()), 'type');
      expect(await store.get(key())).toBeNull();
    });

    it('声明类型为空但内容不是图片，一样拒收（只能靠文件头拦）', async () => {
      await expectRejection(store.put(key(), textFile('mystery', '')), 'content');
      expect(await store.get(key())).toBeNull();
    });

    it('改名 + 伪造 MIME 的非图片也拒收（只看文件头）', async () => {
      await expectRejection(store.put(key(), renamedTextAsPng()), 'content');
      expect(await store.listProject('prj_1')).toEqual([]);
    });

    it('内容与声明类型不符时拒收', async () => {
      const mismatched = new File([bytesOf(PNG_MAGIC, 8)], 'a.jpg', { type: 'image/jpeg' });
      await expectRejection(store.put(key(), mismatched), 'content');
    });

    it('白名单外的图片类型拒收（例如 svg）', async () => {
      const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'a.svg', {
        type: 'image/svg+xml',
      });
      await expectRejection(store.put(key(), svg), 'type');
    });

    it('空文件拒收', async () => {
      await expectRejection(store.put(key(), new File([], 'empty.png', { type: 'image/png' })), 'empty');
    });

    it('超过单张上限拒收，且不留半条记录', async () => {
      await expectRejection(store.put(key(), oversizedPngFile(MAX_FRAME_IMAGE_BYTES)), 'too-large');
      expect(await store.getMeta(key())).toBeNull();
      expect(await store.usage('prj_1')).toMatchObject({ count: 0, bytes: 0 });
    });
  });

  describe('坐标锁（RULE-2 / RULE-3 / RULE-7）', () => {
    it('B5 只有 2 格，第 3 格的坐标本身非法', async () => {
      await expectRejection(store.put(key(BEAT_COUNT, 3), pngFile()), 'key');
      expect(store.framesFor(BEAT_COUNT)).toEqual([1, 2]);
      expect(store.framesFor(1)).toEqual([1, 2, 3]);
    });

    it('第 6 块板不存在，落图即拒', async () => {
      await expectRejection(store.put(key(6 as BeatIndex, 1), pngFile()), 'key');
    });

    it('帧序越界（0 / 4）拒收', async () => {
      await expectRejection(store.put(key(1, 0 as FrameOrder), pngFile()), 'key');
      await expectRejection(store.put(key(1, 4 as FrameOrder), pngFile()), 'key');
    });

    it('项目 id 含分隔符时拒收（否则不同坐标会编出同一个键）', async () => {
      await expectRejection(store.put(key(1, 1, 'prj::x'), pngFile()), 'key');
    });
  });

  describe('删除', () => {
    beforeEach(async () => {
      await store.put(key(1, 1), pngFile('b1-f1.png'));
      await store.put(key(1, 2), pngFile('b1-f2.png'));
      await store.put(key(2, 1), pngFile('b2-f1.png'));
      await store.put(key(1, 1, 'prj_other'), pngFile('other.png'));
    });

    it('删单张只删那一张', async () => {
      await store.remove(key(1, 1));

      expect(await store.get(key(1, 1))).toBeNull();
      expect((await store.listBeat('prj_1', 1)).map((meta) => meta.frameOrder)).toEqual([2]);
    });

    it('删一块板清掉该板全部帧，其他板不动', async () => {
      await store.removeBeat('prj_1', 1);

      expect(await store.listBeat('prj_1', 1)).toEqual([]);
      expect((await store.listBeat('prj_1', 2)).map((meta) => meta.name)).toEqual(['b2-f1.png']);
    });

    it('删项目清掉该项目全部图片，其他项目不动', async () => {
      await store.removeProject('prj_1');

      expect(await store.listProject('prj_1')).toEqual([]);
      expect(await store.usage('prj_1')).toMatchObject({ count: 0, bytes: 0 });
      expect((await store.listProject('prj_other')).map((meta) => meta.name)).toEqual(['other.png']);
    });

    it('删除会连字节一起删，不留孤儿字节', async () => {
      const encoded = encodeFrameImageKey(key(1, 1));
      expect(await driver.getBytes(encoded)).not.toBeNull();

      await store.remove(key(1, 1));

      expect(await driver.getMeta(encoded)).toBeNull();
      expect(await driver.getBytes(encoded)).toBeNull();
    });

    it('删不存在的坐标是幂等的', async () => {
      await store.remove(key(3, 1));
      await store.removeBeat('prj_1', 3);
      await store.removeProject('prj_absent');
      expect((await store.listProject('prj_1')).length).toBe(3);
    });
  });

  describe('项目配额', () => {
    it('占用量按项目统计，含张数与字节数', async () => {
      await store.put(key(1, 1), pngFile('a.png', 100));
      await store.put(key(1, 2), pngFile('b.png', 200));

      expect(await store.usage('prj_1')).toEqual({
        count: 2,
        bytes: 2 * PNG_MAGIC.length + 300,
        limitBytes: MAX_PROJECT_IMAGE_BYTES,
        remainingBytes: MAX_PROJECT_IMAGE_BYTES - (2 * PNG_MAGIC.length + 300),
      });
    });

    /**
     * 顶满配额不搬真字节：直接从驱动端口塞一条"体积很大"的元数据。
     * 真存 64 MiB 只是在测 jsdom 的 FileReader 有多慢，测不出更多东西
     * （字节层面的上限判定由 `validation.test.ts` 的纯函数用例覆盖）。
     */
    const fillQuota = async (bytes: number, coords: FrameImageKey = key(1, 3)) => {
      await driver.put(
        {
          key: encodeFrameImageKey(coords),
          projectId: coords.projectId,
          beatIndex: coords.beatIndex,
          frameOrder: coords.frameOrder,
          name: 'filler.png',
          type: 'image/png',
          size: bytes,
          savedAt: clock(),
        },
        bytesOf(PNG_MAGIC, 8),
      );
    };

    it('写到超过项目上限时拒收，且不留记录', async () => {
      await fillQuota(MAX_PROJECT_IMAGE_BYTES - 4);
      expect((await store.usage('prj_1')).remainingBytes).toBe(4);

      await expectRejection(store.put(key(2, 1), pngFile('one-more.png', 64)), 'quota');
      expect(await store.get(key(2, 1))).toBeNull();
    });

    it('剩余空间刚好放得下时仍可写入', async () => {
      const incoming = pngFile('fits.png', 16);
      await fillQuota(MAX_PROJECT_IMAGE_BYTES - incoming.size);

      const meta = await store.put(key(2, 1), incoming);
      expect(meta.size).toBe(incoming.size);
      expect((await store.usage('prj_1')).bytes).toBe(MAX_PROJECT_IMAGE_BYTES);
    });

    it('覆盖已有图片时按差额算配额，不会因为"已经满了"而拒掉覆盖', async () => {
      const target = key(1, 3);
      await fillQuota(MAX_PROJECT_IMAGE_BYTES, target);

      await store.put(target, pngFile('small.png', 8));

      const after = await store.usage('prj_1');
      expect(after.count).toBe(1);
      expect(after.bytes).toBe(PNG_MAGIC.length + 8);
    });

    it('配额只算本项目，不被其他项目的图片挤占', async () => {
      await store.put(key(1, 1, 'prj_a'), pngFile('a.png', 100));
      expect((await store.usage('prj_b')).bytes).toBe(0);
    });
  });
});

describe('元数据与字节分表（IndexedDB 布局）', () => {
  beforeEach(async () => {
    tick = 0;
    await new IndexedDbFrameImageDriver(indexedDB).clear();
  });

  it('刷新页面后图片还在（全新的驱动 + 全新的仓，只有库是同一个）', async () => {
    await new FrameImageStore(new IndexedDbFrameImageDriver(indexedDB), clock).put(
      { projectId: 'prj_1', beatIndex: 3, frameOrder: 1 },
      pngFile('reload.png', 24),
    );

    // 等价于"关掉标签页再打开"：进程里没有任何残留状态，字节只能来自 IndexedDB。
    const afterReload = new FrameImageStore(new IndexedDbFrameImageDriver(indexedDB), clock);
    const image = await afterReload.get({ projectId: 'prj_1', beatIndex: 3, frameOrder: 1 });

    expect(image?.name).toBe('reload.png');
    expect([...new Uint8Array(await image!.blob.arrayBuffer())]).toEqual([...bytesOf(PNG_MAGIC, 24)]);
  });

  it('列清单只读元数据表，不触碰图片字节', async () => {
    const driver = new IndexedDbFrameImageDriver(indexedDB);
    const store = new FrameImageStore(driver, clock);
    await store.put({ projectId: 'prj_1', beatIndex: 1, frameOrder: 1 }, pngFile('a.png', 64));

    const listed = await driver.listByBeat('prj_1', 1);
    expect(listed).toHaveLength(1);
    // 元数据记录里没有 bytes 字段——它在另一个 store 里。
    expect(listed[0]).not.toHaveProperty('bytes');
    expect(listed[0]?.size).toBe(PNG_MAGIC.length + 64);
  });

  it('两张表的主键一致，字节可按同一个键单独取出', async () => {
    const driver = new IndexedDbFrameImageDriver(indexedDB);
    const store = new FrameImageStore(driver, clock);
    await store.put({ projectId: 'prj_1', beatIndex: 5, frameOrder: 2 }, pngFile('b5.png', 8));

    const encoded = encodeFrameImageKey({ projectId: 'prj_1', beatIndex: 5, frameOrder: 2 });
    expect(encoded).toBe('prj_1::5::2');
    expect([...(await driver.getBytes(encoded))!]).toEqual([...bytesOf(PNG_MAGIC, 8)]);
  });
});

describe('驱动选择', () => {
  it('有 IndexedDB 就用 IndexedDB', () => {
    expect(selectFrameImageDriver({ indexedDB }).kind).toBe('indexeddb');
  });

  it('没有 IndexedDB 时读空、写明确报错，不假装存住了', async () => {
    const driver = selectFrameImageDriver({});
    expect(driver).toBeInstanceOf(UnavailableFrameImageDriver);

    const store = new FrameImageStore(driver, clock);
    await expect(store.put(key(), pngFile())).rejects.toThrow(/不支持本地存储参考图/);
    expect(await store.get(key())).toBeNull();
    expect(await store.listProject('prj_1')).toEqual([]);
  });
});
