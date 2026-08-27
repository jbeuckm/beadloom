import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import type { ReferenceImage } from '../types';

export default function ReferencePanel({ onClose }: { onClose: () => void }) {
  const { columns, rows, cellAspect } = useStore((s) => s.design.loom);
  const reference = useStore((s) => s.reference);
  const setReference = useStore((s) => s.setReference);
  const updateReference = useStore((s) => s.updateReference);
  const traceReference = useStore((s) => s.traceReference);
  const setTool = useStore((s) => s.setTool);

  const [coveredOnly, setCoveredOnly] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const fitScale = (w: number, h: number) =>
    Math.min(columns / w, (rows * cellAspect) / h) || 0.1;

  const choose = async (file: File) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      const next: ReferenceImage = {
        src: url,
        w,
        h,
        x: columns / 2,
        y: (rows * cellAspect) / 2,
        scale: fitScale(w, h),
        rotationDeg: 0,
        skewXDeg: 0,
        skewYDeg: 0,
        opacity: 0.55,
        visible: true,
      };
      setReference(next);
      setTool('reference');
    };
    img.src = url;
  };

  const patch = (p: Partial<ReferenceImage>) => updateReference(p);

  const remove = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setReference(null);
    onClose();
  };

  const widthCols = reference ? +(reference.w * reference.scale).toFixed(1) : 0;

  return (
    <div className="ref-panel" role="dialog" aria-label="Reference image">
      <header>
        <strong>Reference image</strong>
        <button className="btn mini ghost" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void choose(f);
          e.target.value = '';
        }}
      />

      {!reference ? (
        <>
          <p className="hint">
            Place a photo or drawing behind the grid, position it, then fill every
            cell with its nearest palette colour.
          </p>
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={16} /> Choose image…
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label>Width — {widthCols} columns</label>
            <input
              type="range"
              min={1}
              max={Math.max(columns * 3, 30)}
              value={Math.min(widthCols, Math.max(columns * 3, 30))}
              onChange={(e) =>
                patch({ scale: Number(e.target.value) / reference.w })
              }
            />
          </div>
          <div className="field">
            <label>Rotation — {Math.round(reference.rotationDeg)}°</label>
            <input
              type="range"
              min={-180}
              max={180}
              value={Math.round(reference.rotationDeg)}
              onChange={(e) => patch({ rotationDeg: Number(e.target.value) })}
            />
          </div>
          <div className="row2">
            <div className="field">
              <label>Skew X — {Math.round(reference.skewXDeg)}°</label>
              <input
                type="range"
                min={-45}
                max={45}
                value={Math.round(reference.skewXDeg)}
                onChange={(e) => patch({ skewXDeg: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Skew Y — {Math.round(reference.skewYDeg)}°</label>
              <input
                type="range"
                min={-45}
                max={45}
                value={Math.round(reference.skewYDeg)}
                onChange={(e) => patch({ skewYDeg: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="field">
            <label>Opacity — {Math.round(reference.opacity * 100)}%</label>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(reference.opacity * 100)}
              onChange={(e) => patch({ opacity: Number(e.target.value) / 100 })}
            />
          </div>

          <div className="ref-btn-row">
            <button
              className="btn mini"
              onClick={() =>
                patch({
                  scale: fitScale(reference.w, reference.h),
                  x: columns / 2,
                  y: (rows * cellAspect) / 2,
                  rotationDeg: 0,
                  skewXDeg: 0,
                  skewYDeg: 0,
                })
              }
            >
              Fit
            </button>
            <button
              className="btn mini"
              onClick={() => patch({ x: columns / 2, y: (rows * cellAspect) / 2 })}
            >
              Centre
            </button>
            <button
              className={'btn mini' + (reference.visible ? ' ' : '')}
              aria-pressed={reference.visible}
              onClick={() => patch({ visible: !reference.visible })}
            >
              {reference.visible ? 'Hide' : 'Show'}
            </button>
          </div>

          <p className="hint">
            The <b>Image</b> tool is on — drag on the grid to move the picture.
          </p>

          <label className="check">
            <input
              type="checkbox"
              checked={coveredOnly}
              onChange={(e) => setCoveredOnly(e.target.checked)}
            />
            Only cells the image covers
          </label>

          <div className="ref-btn-row">
            <button
              className="btn primary grow"
              onClick={() => traceReference({ coveredOnly })}
            >
              Trace → palette
            </button>
            <button className="btn mini danger" onClick={remove}>
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}
