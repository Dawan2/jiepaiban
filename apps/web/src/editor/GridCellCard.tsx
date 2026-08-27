/**
 * 一格宫格（PRD 5.2.3 / AC-6.3）。
 *
 * 一格只有两样东西：**参考图**（可选）与**白话画面描述**（必填）。
 * 宫格是分场表达的替代物，不是它的简化版——因此这里没有、也不得加入任何镜头级参数。
 * 格数由板位锁定，本组件不提供增删与拖拽换序入口（AC-6.1 / AC-6.8）。
 */

import { useRef, useState, type DragEvent } from 'react';
import type { FrameDraft, FrameImage } from './draft';

interface GridCellCardProps {
  beatIndex: number;
  frame: FrameDraft;
  roleHint: string;
  onTextChange: (text: string) => void;
  onImageChange: (image: FrameImage | null) => void;
}

function toFrameImage(file: File, beatIndex: number, order: number): FrameImage {
  const previewUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';

  return {
    key: `img_b${beatIndex}_c${order}_${file.name}`,
    name: file.name,
    preview_url: previewUrl,
  };
}

function firstImage(files: FileList | null): File | null {
  if (files === null) {
    return null;
  }
  return Array.from(files).find((file) => file.type.startsWith('image/')) ?? null;
}

export function GridCellCard({
  beatIndex,
  frame,
  roleHint,
  onTextChange,
  onImageChange,
}: GridCellCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const descriptionId = `cell-desc-b${beatIndex}-c${frame.order}`;

  const accept = (file: File | null) => {
    if (file !== null) {
      onImageChange(toFrameImage(file, beatIndex, frame.order));
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    accept(firstImage(event.dataTransfer?.files ?? null));
  };

  return (
    <li className="cell">
      <div className="cell__head">
        <span className="cell__ordinal">格 {frame.order}</span>
        <span className="cell__role">{roleHint}</span>
      </div>

      <div
        className={`dropzone${dragging ? ' dropzone--over' : ''}${
          frame.image === null ? '' : ' dropzone--filled'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {frame.image === null ? (
          <button
            type="button"
            className="dropzone__trigger"
            onClick={() => inputRef.current?.click()}
          >
            <span className="dropzone__icon" aria-hidden="true">
              ▤
            </span>
            <span className="dropzone__text">拖入参考图，或点击选择</span>
            <span className="dropzone__hint">可选 · 随请求参数发送</span>
          </button>
        ) : (
          <div className="dropzone__preview">
            {frame.image.preview_url === '' ? (
              <span className="dropzone__filename">{frame.image.name}</span>
            ) : (
              <img className="dropzone__img" src={frame.image.preview_url} alt={frame.image.name} />
            )}
            <button
              type="button"
              className="dropzone__clear"
              onClick={() => onImageChange(null)}
              aria-label={`移除格 ${frame.order} 的参考图`}
            >
              移除参考图
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          aria-label={`格 ${frame.order} 参考图`}
          onChange={(event) => accept(firstImage(event.target.files))}
        />
      </div>

      <label className="cell__label" htmlFor={descriptionId}>
        画面描述
        <span className="tag tag--prompt">进 Prompt</span>
      </label>
      <textarea
        id={descriptionId}
        className="input input--area"
        rows={4}
        placeholder="这一格里发生什么、看到什么"
        value={frame.text}
        onChange={(event) => onTextChange(event.target.value)}
      />
    </li>
  );
}
