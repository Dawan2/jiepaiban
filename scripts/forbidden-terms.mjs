/**
 * 禁用词扫描器（NFR-7 术语合规、AC-6.3 / AC-6.8）。
 *
 * 法源：`docs/methodology/glossary.md` §8 禁用词表 —— 表里的词在本产品中
 * **不存在对应概念**，出现即方法论违规，改正后才能合并。
 *
 * 扫描口径：
 * - **产品源码必须干净**：`apps/**` 下的组件、领域层、样式与页面文案里
 *   一个禁用词都不许有，且不接受任何例外。
 * - **文档与守卫测试可以引用**：法源文档要写出禁用词表本身，
 *   AC-6.4 / AC-6.8 的守卫测试也必须写出禁用词才能断言它不出现。
 *   这两类走 `exceptions`，每条都要写清理由。
 *
 * 实现上刻意不引第三方依赖：CI 里 `node scripts/scan-forbidden-terms.mjs` 直接可跑。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CONFIG_PATH = fileURLToPath(new URL('./forbidden-terms.json', import.meta.url));

/** 允许写出禁用词的路径类型：法源文档，或断言禁用词不存在的守卫测试。 */
const DOC_EXCEPTION = /^(docs\/|README\.md$)/;
const TEST_EXCEPTION = /\.test\.(ts|tsx|js|jsx|mjs)$/;

export function loadConfig(path = CONFIG_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** 极小号 glob：`**` 跨目录，`*` 不跨目录，其余按字面量。 */
export function globToRegExp(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        source += '.*';
        i += 1;
        if (pattern[i + 1] === '/') {
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }
    source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

export function matchesPattern(pattern, relPath) {
  return globToRegExp(pattern).test(relPath);
}

/** 命中例外则返回那条例外，否则返回 `null`。 */
export function findException(config, relPath) {
  return config.exceptions.find((item) => matchesPattern(item.path, relPath)) ?? null;
}

/**
 * 例外只能开给法源文档与守卫测试。
 * 任何试图给产品源码开口子的配置都会在这里被判定为非法。
 */
export function validateConfig(config) {
  const problems = [];

  if (!Array.isArray(config.terms) || config.terms.length === 0) {
    problems.push('terms 不能为空');
  }
  config.terms?.forEach((entry, at) => {
    if (typeof entry.term !== 'string' || entry.term.trim() === '') {
      problems.push(`terms[${at}] 缺少 term`);
    }
    if (typeof entry.use !== 'string' || entry.use.trim() === '') {
      problems.push(`terms[${at}]（${entry.term}）缺少正确替代词`);
    }
  });

  config.exceptions?.forEach((entry, at) => {
    if (typeof entry.path !== 'string' || entry.path.trim() === '') {
      problems.push(`exceptions[${at}] 缺少 path`);
      return;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      problems.push(`exceptions[${at}]（${entry.path}）缺少 reason`);
    }
    const allowed = DOC_EXCEPTION.test(entry.path) || TEST_EXCEPTION.test(entry.path);
    if (!allowed) {
      problems.push(
        `exceptions[${at}]（${entry.path}）越界：例外只能开给 docs/ 下的法源文档或 *.test.* 守卫测试，产品源码必须干净`,
      );
    }
  });

  return problems;
}

function shouldSkipDir(config, name) {
  return config.excludeDirs.includes(name);
}

function hasScannedExtension(config, name) {
  return config.extensions.some((ext) => name.endsWith(ext));
}

/** 列出待扫描文件，返回相对仓库根的 POSIX 路径。 */
export function listFiles(config, root = REPO_ROOT) {
  const found = [];

  const walk = (absolute) => {
    for (const name of readdirSync(absolute).sort()) {
      if (shouldSkipDir(config, name)) {
        continue;
      }
      const child = join(absolute, name);
      const stat = statSync(child);
      if (stat.isDirectory()) {
        walk(child);
      } else if (stat.isFile() && hasScannedExtension(config, name)) {
        found.push(relative(root, child).split('\\').join('/'));
      }
    }
  };

  for (const entry of config.include) {
    const absolute = join(root, entry);
    let stat;
    try {
      stat = statSync(absolute);
    } catch {
      continue; // 该入口在当前分支上还不存在（例如别的槽位才会建的 docs 子目录）。
    }
    if (stat.isDirectory()) {
      walk(absolute);
    } else if (stat.isFile() && hasScannedExtension(config, entry)) {
      found.push(entry);
    }
  }

  return found.filter((path) => !(config.excludeFiles ?? []).includes(path));
}

/** 扫一段文本，返回全部命中（含行号与该行原文）。 */
export function scanText(config, text) {
  const hits = [];
  const lines = text.split('\n');

  lines.forEach((line, at) => {
    config.terms.forEach((entry) => {
      let from = 0;
      for (;;) {
        const column = line.indexOf(entry.term, from);
        if (column < 0) {
          break;
        }
        hits.push({
          term: entry.term,
          use: entry.use,
          line: at + 1,
          column: column + 1,
          text: line.trim(),
        });
        from = column + entry.term.length;
      }
    });
  });

  return hits;
}

/**
 * 扫描整个仓库。
 *
 * @returns `{ scanned, violations, allowed, configProblems }`
 *   `violations` 是必须修的；`allowed` 是命中了例外的引用，只用于报告。
 */
export function scanRepo({ root = REPO_ROOT, config = loadConfig() } = {}) {
  const configProblems = validateConfig(config);
  const violations = [];
  const allowed = [];
  const files = listFiles(config, root);

  for (const file of files) {
    const hits = scanText(config, readFileSync(join(root, file), 'utf8'));
    if (hits.length === 0) {
      continue;
    }
    const exception = findException(config, file);
    const bucket = exception === null ? violations : allowed;
    hits.forEach((hit) => {
      bucket.push({ file, ...hit, ...(exception === null ? {} : { reason: exception.reason }) });
    });
  }

  return { scanned: files.length, violations, allowed, configProblems };
}

export function formatReport(result) {
  const lines = [];

  result.configProblems.forEach((problem) => {
    lines.push(`配置违规：${problem}`);
  });

  result.violations.forEach((hit) => {
    lines.push(`${hit.file}:${hit.line}:${hit.column} 命中禁用词「${hit.term}」，应改用：${hit.use}`);
    lines.push(`    ${hit.text}`);
  });

  if (lines.length === 0) {
    lines.push(
      `术语合规：扫了 ${result.scanned} 个文件，产品源码无禁用词（法源文档与守卫测试的 ${result.allowed.length} 处引用已豁免）。`,
    );
  }

  return lines.join('\n');
}
