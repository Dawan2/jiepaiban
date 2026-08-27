/**
 * 源码扫描小工具，供本目录的红线守卫测试使用（不进产品运行路径）。
 *
 * 为什么要扫源码：「配置类型里不能有凭据字段」是**类型层**的约束，
 * 类型在运行期不存在，任何基于对象实例的断言都只能证明「默认值里没有」，
 * 证不了「接口里不能有」。所以守卫直接读 `.ts` 源码，把接口声明本身当被测对象。
 *
 * 扫描前先剥注释：文档注释里必须能写出 `apiKey`、`VITE_` 这些词来解释为什么禁它们，
 * 剥掉注释后扫到的就只有真代码。
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SEEDANCE_RELATIVE_DIR = 'src/generate/seedance';

/**
 * 定位本目录在磁盘上的位置。
 *
 * 不用 `import.meta.url`：Vite 会把它改写成相对项目根的模块 id，
 * 拿去读文件会得到 `/src/...` 这种不存在的路径。改为从 cwd 逐级向上找，
 * 无论 vitest 从仓库根还是从 `apps/web` 启动都能命中。
 */
function seedanceDir(): string {
  let cursor = resolve(process.cwd());
  for (let depth = 0; depth < 6; depth += 1) {
    const candidates = [resolve(cursor, SEEDANCE_RELATIVE_DIR), resolve(cursor, 'apps/web', SEEDANCE_RELATIVE_DIR)];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (found !== undefined) {
      return found;
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }
  throw new Error(`定位不到 ${SEEDANCE_RELATIVE_DIR}，无法扫描源码`);
}

/** 读同目录（`generate/seedance/`）下某个源码文件的原文。 */
export function readSeedanceSource(fileName: string): string {
  return readFileSync(resolve(seedanceDir(), fileName), 'utf8');
}

/**
 * 剥掉块注释与行注释，只留代码。
 *
 * 行注释的判定排除了紧跟冒号的情形，否则 `'stub://…'` 这样的字面量会被当成注释截断。
 * 这个剥离足够用于「接口声明里有没有某个字段名」这类扫描，不是通用词法分析。
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/[^\n]*/g, '');
}

/**
 * 取出 `interface <name> { … }` 的花括号内文本（已剥注释），花括号配对计数。
 * 找不到该接口时抛错——接口被改名而守卫静默通过，比守卫变红危险得多。
 */
export function interfaceBody(source: string, name: string): string {
  const code = stripComments(source);
  const declaration = new RegExp(`interface\\s+${name}\\b[^{]*{`).exec(code);
  if (declaration === null) {
    throw new Error(`源码里找不到 interface ${name}`);
  }
  let depth = 0;
  const start = declaration.index + declaration[0].length;
  for (let i = start - 1; i < code.length; i += 1) {
    const char = code[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return code.slice(start, i);
      }
    }
  }
  throw new Error(`interface ${name} 的花括号没有配对`);
}

/**
 * 取出接口里声明的全部属性名（含嵌套对象类型里的属性名，扫描要的是「出现过没有」）。
 */
export function interfacePropertyNames(source: string, name: string): readonly string[] {
  const body = interfaceBody(source, name);
  const names = [...body.matchAll(/(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*:/g)].map(
    (match) => match[1] ?? '',
  );
  return Object.freeze(names.filter((item) => item !== ''));
}
