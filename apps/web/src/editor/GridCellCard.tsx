/**
 * 一格宫格（PRD 5.2.3 / AC-6.3）。
 *
 * 一格只有两样东西：**参考图**（可选）与**白话画面描述**（必填）。
 * 宫格是分场表达的替代物，不是它的简化版——因此这里没有、也不得加入任何镜头级参数。
 * 格数由板位锁定，本组件不提供增删与拖拽换序入口（AC-6.1 / AC-6.8）。
 */

import { useRef, useState, type DragEvent } from 'react';
import type { CellDraft, CellImage } from './draft';

interface GridCellCardProps {
  beatIndex: number;
  cell: CellDraft;
  roleHint: string;
  onDescriptionChange: (description: string) => void;
  onImageChange: (image: CellImage | null) => void;
}

function toCellImage(file: File, beatIndex: number, order: number): CellImage {
  const previewUrl =
    typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';

  return {
    key: `img_b${beatIndex}_c${order}_${file.name}`,
    name: file.name,
    previewUrl,
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
  cell,
  roleHint,
  onDescriptionChange,
  onImageChange,
}: GridCellCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const descriptionId = `cell-desc-b${beatIndex}-c${cell.order}`;

  const accept = (file: File | null) => {
    if (file !== null) {
      onImageChange(toCellImage(file, beatIndex, cell.order));
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
        <span className="cell__ordinal">格 {cell.order}</span>
        <span className="cell__role">{roleHint}</span>
      </div>

      <div
        className={`dropzone${dragging ? ' dropzone--over' : ''}${
          cell.image === null ? '' : ' dropzone--filled'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {cell.image === null ? (
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
            {cell.image.previewUrl === '' ? (
              <span className="dropzone__filename">{cell.image.name}</span>
            ) : (
              <img className="dropzone__img" src={cell.image.previewUrl} alt={cell.image.name} />
            )}
            <button
              type="button"
              className="dropzone__clear"
              onClick={() => onImageChange(null)}
              aria-label={`移除格 ${cell.order} 的参考图`}
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
          aria-label={`格 ${cell.order} 参考图`}
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
        value={cell.description}
        onChange={(event) => onDescriptionChange(event.target.value)}
      />
    </li>
  );
}
