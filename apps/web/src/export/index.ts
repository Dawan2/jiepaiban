/**
 * 成片管理（M6）公共出口 —— W2/EXPORT 槽位。
 *
 * 路由层只需要 {@link ExportView}；视图模型（段卡 / 拼接计划 / 导出载荷）单独导出，
 * 便于后端接线与其他槽位复用，不必经过 React。
 *
 * 本出口**故意不存在**以下能力，新增即为红线违规（R1 / R3 / R7）：
 * 增 / 删 / 移动 / 重排段卡，跨段裁剪或轨道编辑，把组间衔接送进生成请求体的通路。
 */

export * from './naming';
export * from './download';
export * from './segments';
export * from './stitchPlan';
export * from './projectExport';
export * from './SegmentCard';
export * from './StitchPlanPanel';
export * from './TransitionSummary';
export * from './DeliveryPanel';
export * from './ExportView';
