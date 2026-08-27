#!/usr/bin/env node
/**
 * 禁用词扫描 CLI —— `npm run lint:terms`，同时挂在 CI 上。
 *
 * 命中禁用词或配置越界即以退出码 1 结束。
 */

import { formatReport, scanRepo } from './forbidden-terms.mjs';

const result = scanRepo();
const failed = result.violations.length > 0 || result.configProblems.length > 0;

console.log(formatReport(result));

if (failed) {
  console.log('');
  console.log(
    '禁用词法源：docs/methodology/glossary.md §8。产品源码必须干净；' +
      '法源文档与守卫测试的引用请在 scripts/forbidden-terms.json 的 exceptions 里登记并写明理由。',
  );
  process.exitCode = 1;
}
