/**
 * 生成引擎（M4）公共出口 —— W2/PROMPT-GEN 槽位。
 *
 * UI 只需要两个东西：{@link createGenerateController}（或 React 版
 * {@link useGenerateController}）与它返回的 5 个板位状态。
 * 队列、幂等键、拦截链、状态机都在内部，不外泄。
 *
 * 本出口**故意不存在**以下能力，新增即为红线违规：
 * 模型选择、拆板 / 合板生成、组内剪辑点或逐镜时长参数、
 * 把组间衔接 / 节拍名称 / 备注送进请求体的通路。
 */

export * from './types';
export * from './interceptors';
export * from './adapter';
export * from './store';
export * from './queue';
export * from './controller';
export * from './useGenerateController';
export * from './GenerateActions';
