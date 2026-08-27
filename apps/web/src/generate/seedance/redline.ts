/**
 * 出网口红线：字段名级别的守卫（AC-6.4、PRD R2、NFR-5）。
 *
 * 这里放的是**可执行的清单**，不是注释里的约定。两类红线：
 *
 * 1. **凭据类字段名**：前端的配置与请求体里都不允许出现。前端持有密钥
 *    等于公开发布密钥，鉴权只能在同源中继的服务端一侧（见 `config.ts`）。
 * 2. **硬排除业务字段名**：组间衔接 / 节拍名称 / 备注，以及任何小于 beat
 *    粒度的结构（`shot` / `camera_json` / …）。衔接只在后期合成生效，不进请求体。
 *
 * 两份清单都以字段名（key）为单位判定，不看取值——取值层面的泄漏由
 * `domain/prompt` 的 `findExcludedFieldLeaks` 负责，两者互补。
 */

/**
 * 凭据类字段名的判定式。命中即视为凭据字段。
 *
 * 刻意避开会误伤的宽泛词根：用 `signature|sign_key|signing` 而不是 `sign`
 * （否则 `AbortSignal` 的 `signal` 会被判成凭据）。
 */
export const SECRET_KEY_PATTERNS: readonly RegExp[] = Object.freeze([
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password|passwd|pwd/i,
  /credential/i,
  /authorization|auth[_-]?header|bearer/i,
  /signature|sign[_-]?key|signing/i,
  /access[_-]?key|private[_-]?key|public[_-]?key/i,
  /^(ak|sk|ak_id|sk_id|access_id|secret_id)$/i,
  /session|cookie/i,
  /^vite_/i,
]);

/** 该字段名是否属于凭据类。 */
export function isSecretLikeKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/** 挑出全部凭据类字段名，顺序与输入一致。 */
export function findSecretLikeKeys(keys: readonly string[]): readonly string[] {
  return Object.freeze(keys.filter((key) => isSecretLikeKey(key)));
}

export function assertNoSecretLikeKeys(keys: readonly string[], where: string): void {
  const hits = findSecretLikeKeys(keys);
  if (hits.length > 0) {
    throw new Error(`${where} 出现了凭据类字段（${hits.join('、')}）：前端不持有密钥（NFR-5）`);
  }
}

/**
 * 源码里读取构建期 / 运行期环境变量的写法。
 *
 * 端点配置一旦读环境变量，密钥就会被打进 bundle；配置必须由调用方显式传入。
 */
export const ENV_ACCESS_PATTERNS: readonly RegExp[] = Object.freeze([
  /import\s*\.\s*meta\s*\.\s*env/,
  /process\s*\.\s*env/,
  /\bVITE_[A-Z0-9_]+/,
]);

/** 在（已剥注释的）源码里找环境变量读取写法。 */
export function findEnvAccess(code: string): readonly string[] {
  return Object.freeze(
    ENV_ACCESS_PATTERNS.filter((pattern) => pattern.test(code)).map((pattern) => pattern.source),
  );
}

/**
 * 请求体里绝不允许出现的字段名。
 *
 * 与 `generate/adapter` 的 `FORBIDDEN_SUBMISSION_KEYS` 同源，这里是它的超集：
 * 多出的项覆盖 v2 请求体新暴露的面（参考图键、镜头级结构）。
 * `redline.test.ts` 断言超集关系，两份清单不会各自漂移。
 */
export const FORBIDDEN_BEAT_REQUEST_KEYS: readonly string[] = Object.freeze([
  'api_key',
  'apiKey',
  'token',
  'secret',
  'authorization',
  'credential',
  'transition',
  'transition_rule',
  'transitionRule',
  'title',
  'name',
  'note',
  'shot',
  'shots',
  'shot_list',
  'camera_json',
  'lens',
  'storyboard',
]);

/** 递归收集对象（含嵌套对象与数组元素）里的全部字段名。 */
export function collectKeys(value: unknown): readonly string[] {
  const keys: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== 'object') {
      return;
    }
    Object.entries(node as Record<string, unknown>).forEach(([key, child]) => {
      keys.push(key);
      walk(child);
    });
  };
  walk(value);
  return Object.freeze(keys);
}

/** 挑出请求体里命中红线的字段名。 */
export function findForbiddenBodyKeys(body: unknown): readonly string[] {
  const present = collectKeys(body);
  const forbidden = present.filter(
    (key) => FORBIDDEN_BEAT_REQUEST_KEYS.includes(key) || isSecretLikeKey(key),
  );
  return Object.freeze([...new Set(forbidden)]);
}

/**
 * 出网前的最后一道断言。桩件与真实中继客户端都在发出之前调它——
 * 拼错方向的请求体宁可当场炸掉，也不能静默发出去。
 */
export function assertBodyClean(body: unknown, where = 'Seedance 请求体'): void {
  const hits = findForbiddenBodyKeys(body);
  if (hits.length > 0) {
    throw new Error(`${where} 出现了红线字段（${hits.join('、')}），已阻断出网（AC-6.4）`);
  }
}
