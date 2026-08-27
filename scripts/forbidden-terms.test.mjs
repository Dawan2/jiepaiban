/**
 * 禁用词扫描器自测 —— `npm run test:terms`。
 *
 * 用 Node 内置的 `node:test`：扫描器要在 CI 里独立于前端构建运行，
 * 不该依赖 vitest，也不该跑在 jsdom 里。
 *
 * 本文件登记在 `excludeFiles` 里：它必须写出禁用词才能测「扫描器抓不抓得到」。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  findException,
  formatReport,
  globToRegExp,
  listFiles,
  loadConfig,
  matchesPattern,
  scanRepo,
  scanText,
  validateConfig,
} from './forbidden-terms.mjs';

const config = loadConfig();
const sandboxes = [];

function sandbox(files) {
  const root = mkdtempSync(join(tmpdir(), 'term-scan-'));
  sandboxes.push(root);
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, 'utf8');
  }
  return root;
}

after(() => {
  sandboxes.forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('禁用词清单', () => {
  it('至少包含产品红线要求的三个词', () => {
    const terms = config.terms.map((entry) => entry.term);
    assert.ok(terms.includes('分镜'));
    assert.ok(terms.includes('故事板'));
    assert.ok(terms.includes('单镜头时长'));
  });

  it('每个词都给了正确替代词', () => {
    config.terms.forEach((entry) => {
      assert.ok(entry.use && entry.use.trim() !== '', `${entry.term} 缺少替代词`);
    });
  });
});

describe('配置合法性', () => {
  it('当前配置本身合法', () => {
    assert.deepEqual(validateConfig(config), []);
  });

  it('例外必须写理由', () => {
    const problems = validateConfig({
      ...config,
      exceptions: [{ path: 'docs/x.md' }],
    });
    assert.ok(problems.some((problem) => problem.includes('缺少 reason')));
  });

  it('不允许给产品源码开例外', () => {
    const problems = validateConfig({
      ...config,
      exceptions: [{ path: 'apps/web/src/routes/EditorPage.tsx', reason: '想蒙混过关' }],
    });
    assert.ok(problems.some((problem) => problem.includes('越界')));
  });

  it('产品源码路径不命中任何现有例外', () => {
    const productFiles = [
      'apps/web/src/App.tsx',
      'apps/web/src/routes/EditorPage.tsx',
      'apps/web/src/domain/beats.ts',
      'apps/web/src/domain/prompt.ts',
      'apps/web/src/generate/queue.ts',
      'apps/web/src/generate/GenerateActions.tsx',
      'apps/web/src/styles.css',
    ];
    productFiles.forEach((file) => {
      assert.equal(findException(config, file), null, `${file} 不该被豁免`);
    });
  });

  it('法源文档与守卫测试确实被豁免', () => {
    assert.ok(findException(config, 'docs/methodology/glossary.md'));
    assert.ok(findException(config, 'docs/work/w2-prompt-generate.md'));
    assert.ok(findException(config, 'apps/web/src/App.test.tsx'));
  });
});

describe('glob 匹配', () => {
  it('** 跨目录，* 不跨目录', () => {
    assert.ok(globToRegExp('docs/**').test('docs/prd/prd.md'));
    assert.ok(globToRegExp('docs/**').test('docs/x.md'));
    assert.ok(!globToRegExp('docs/*.md').test('docs/prd/prd.md'));
    assert.ok(globToRegExp('docs/*.md').test('docs/x.md'));
    assert.ok(!matchesPattern('docs/**', 'apps/web/src/App.tsx'));
  });
});

describe('文本扫描', () => {
  it('抓得到禁用词并报出行列', () => {
    const hits = scanText(config, ['第一行没问题', '第二行写了分镜两个字'].join('\n'));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].term, '分镜');
    assert.equal(hits[0].line, 2);
    assert.equal(hits[0].column, 6);
  });

  it('一行里出现多次会全部报出来', () => {
    const hits = scanText(config, '故事板与故事板');
    assert.equal(hits.length, 2);
  });

  it('单镜头时长与单镜时长都在拦截范围内', () => {
    assert.ok(scanText(config, '这里写了单镜头时长').length > 0);
    assert.ok(scanText(config, '这里写了单镜时长').length > 0);
  });

  it('正常文案不误报', () => {
    const clean = '节拍板、节拍帧、镜头组 G1，板时长 8 秒，组内切分归 AI。';
    assert.deepEqual(scanText(config, clean), []);
  });
});

describe('仓库扫描', () => {
  it('当前仓库产品源码干净', () => {
    const result = scanRepo();
    assert.deepEqual(result.configProblems, []);
    assert.deepEqual(
      result.violations.map((hit) => `${hit.file}:${hit.line} ${hit.term}`),
      [],
    );
    assert.ok(result.scanned > 0);
  });

  it('产品源码里混进禁用词就会被判违规', () => {
    const root = sandbox({
      'apps/web/src/routes/BadPage.tsx': 'export const label = "分镜";\n',
      'docs/methodology/glossary.md': '禁用词：分镜、故事板\n',
    });
    const result = scanRepo({ root, config });

    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].file, 'apps/web/src/routes/BadPage.tsx');
    assert.equal(result.allowed.length, 2);
    assert.ok(formatReport(result).includes('命中禁用词'));
  });

  it('豁免路径不算违规，但会被记进报告', () => {
    const root = sandbox({ 'docs/prd/prd.md': '废弃项：分镜 / 故事板\n' });
    const result = scanRepo({ root, config });

    assert.deepEqual(result.violations, []);
    assert.equal(result.allowed.length, 2);
    assert.ok(result.allowed[0].reason.length > 0);
  });

  it('只扫配置里的扩展名，跳过 node_modules 与产物目录', () => {
    const root = sandbox({
      'apps/web/src/a.ts': '// 干净\n',
      'apps/web/node_modules/pkg/index.ts': 'const x = "分镜";\n',
      'apps/web/dist/bundle.js': 'const y = "分镜";\n',
      'apps/web/src/logo.svg': '<svg>分镜</svg>\n',
    });
    const result = scanRepo({ root, config });

    assert.deepEqual(result.violations, []);
    assert.deepEqual(listFiles(config, root), ['apps/web/src/a.ts']);
  });

  it('干净的仓库报告说得清扫了多少文件', () => {
    const root = sandbox({ 'apps/web/src/a.ts': '// 节拍板\n' });
    assert.ok(formatReport(scanRepo({ root, config })).includes('产品源码无禁用词'));
  });
});
