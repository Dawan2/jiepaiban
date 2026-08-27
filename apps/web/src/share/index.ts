/**
 * 飞书导出（W4/FEISHU-EXPORT）公共出口。
 *
 * 成片页只需要 {@link FeishuExportPanel}；载荷与渲染器单独导出，
 * 便于服务端出包、飞书机器人推送或其他槽位复用，不必经过 React。
 *
 * 本出口**故意不存在**以下能力，新增即为红线违规（R2 / R3 / AC-6.4）：
 * 把组间衔接写进 Prompt 一节的开关、按导出结果回写节拍的通路、
 * 让文档段数不等于 5 的入口。
 */

export * from './clipboard';
export * from './feishuDoc';
export * from './feishuMarkdown';
export * from './FeishuExportPanel';
