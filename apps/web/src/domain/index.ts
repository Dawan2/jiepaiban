/**
 * 领域层公共出口（W1/WK2）。
 *
 * 这里是五节拍红线的唯一代码法源：UI 层与后续的数据 / API 层（WK3）
 * 只能经本模块读写节拍结构，不得另建一套 Beat 模型。
 *
 * 本出口**故意不存在**以下能力，新增即为红线违规：
 * 增 / 删 / 移动 / 重排节拍，修改宫格数，任何 shot / camera_json / 逐镜时长字段，
 * 以及把组间衔接送进 Prompt 或生成请求体的通路。
 */

export * from './beats';
export * from './prompt';
export * from './projects';
export * from './transitions';
