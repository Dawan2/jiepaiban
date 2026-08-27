/**
 * 成片文件命名（PRD 5.5.2）。
 *
 * 逐段视频恒为 `项目名_节拍序号_节拍名.mp4`，项目级导出与交付包清单沿用同一套
 * 净化规则，保证 Windows / macOS / Linux 三端都能落盘。
 *
 * 命名只做「净化」不做「翻译」：中文原样保留，只把路径分隔符与保留字符换成下划线，
 * 这样文件名仍然可读，后期合成的人一眼能对上是哪块板。
 */

import type { Beat } from '../domain/beats';
import type { Project } from '../domain/projects';

/** 视频扩展名固定 mp4（V1.0 只有单一产物格式）。 */
export const SEGMENT_FILE_EXT = 'mp4' as const;

/** 文件名里不允许出现的字符：路径分隔符、Windows 保留字符与控制字符。 */
const UNSAFE_PATTERN = /[\\/:*?"<>|\u0000-\u001f]/g;
const WHITESPACE_PATTERN = /\s+/g;
const REPEATED_UNDERSCORE = /_{2,}/g;

/** 项目名 / 节拍名进文件名前的净化；空串回落到 `未命名`。 */
export function sanitizeFileNamePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(UNSAFE_PATTERN, '_')
    .replace(WHITESPACE_PATTERN, '_')
    .replace(REPEATED_UNDERSCORE, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned === '' ? '未命名' : cleaned;
}

/** 逐段下载文件名：`项目名_节拍序号_节拍名.mp4`。 */
export function segmentFileName(project: Project, beat: Beat): string {
  const name = sanitizeFileNamePart(project.name);
  const title = sanitizeFileNamePart(beat.title);
  return `${name}_${beat.index}_${title}.${SEGMENT_FILE_EXT}`;
}

/** 交付包内的相对路径，按板序排前缀，解压后顺序天然正确。 */
export function segmentEntryPath(project: Project, beat: Beat): string {
  return `segments/${segmentFileName(project, beat)}`;
}

/** 项目 JSON 导出文件名。 */
export function projectJsonFileName(project: Project): string {
  return `${sanitizeFileNamePart(project.name)}_节拍板项目.json`;
}

/** 交付包（zip）文件名。 */
export function deliveryZipFileName(project: Project): string {
  return `${sanitizeFileNamePart(project.name)}_成片交付包.zip`;
}

/** 交付包清单文件名（清单本身也可单独下载）。 */
export function deliveryManifestFileName(project: Project): string {
  return `${sanitizeFileNamePart(project.name)}_成片交付包_清单.json`;
}
