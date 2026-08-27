import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import type { ReferenceImage } from '../types';
import { uid } from '../util';
import { medianCut, rgbToHex } from '../lib/quantize';
import {
  referenceImageReady,
  referenceSamples,
  subscribeReferenceImage,
} from '../lib/referenceImage';

export default function ReferencePanel({ onClose }: { onClose: () => void }) {
  const { columns, rows, cellAspect } = useStore((s) => s.design.loom);
  const reference = useStore((s) => s.reference);
  const setReference = useStore((s) => s.setReference);
  const updateReference = useStore((s) => s.updateReference);
  const traceReference = useStore((s) => s.traceReference);
  const applyPalette = useStore((s) => s.applyPalette);
  const setTool = useStore((s) => s.setTool);

  const [nColors, setNColors] = useState(10);
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

  const traceWhenReady = () => {
    if (referenceImageReady()) {
      traceReference();
      return;
    }
    const un = subscribeReferenceImage(() => {
      if (referenceImageReady()) {
        un();
        traceReference();
      }
    });
  };

  const choose = (file: File) => {
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
        live: true,
        coveredOnly: true,
      };
      setReference(next);
      setTool('reference');
      traceWhenReady();
    };
    img.src = url;
  };

  const remove = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setReference(null);
    onClose();
  };

  const extractPalette = () => {
    const samples = referenceSamples();
    if (!samples.length) return;
    const colors = medianCut(samples, nColors).map((rgb, i) => ({
      id: `img-${i + 1}`,
      name: `Colour ${i + 1}`,
      hex: rgbToHex(rgb),
    }));
    applyPalette({ id: uid(), name: 'From image', colors });
    if (reference?.live) traceReference();
  };

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
          if (f) choose(f);
          e.target.value = '';
        }}
      />

      {!reference ? (
        <>
          <p className="hint">
            Drop a photo or drawing behind the grid, transform it directly on the
            canvas with the <b>Image</b> tool, and fill the beads with its nearest
            palette colours as you go.
          </p>
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={16} /> Choose image…
          </button>
        </>
      ) : (
        <>
          <img className="ref-thumb" src={reference.src} alt="" />

          <p className="hint">
            <b>Image</b> tool: drag the picture to move it; use the corner, edge
            and rotation handles to scale, skew and rotate.
          </p>

          <h4>Palette from image</h4>
          <div className="ref-btn-row">
            <label className="ref-num">
              Colours
              <input
                type="number"
                min={2}
                max={24}
                value={nColors}
                onChange={(e) =>
                  setNColors(Math.max(2, Math.min(24, Number(e.target.value) || 2)))
                }
              />
            </label>
            <button className="btn grow" onClick={extractPalette}>
              Replace palette
            </button>
          </div>

          <h4>Trace</h4>
          <label className="check">
            <input
              type="checkbox"
              checked={reference.live}
              onChange={(e) => {
                updateReference({ live: e.target.checked });
                if (e.target.checked) traceReference();
              }}
            />
            Live — re-colour cells while transforming
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={reference.coveredOnly}
              onChange={(e) => {
                updateReference({ coveredOnly: e.target.checked });
                if (reference.live) traceReference();
              }}
            />
            Only cells the image covers
          </label>

          <div className="field">
            <label>Opacity — {Math.round(reference.opacity * 100)}%</label>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(reference.opacity * 100)}
              onChange={(e) =>
                updateReference({ opacity: Number(e.target.value) / 100 })
              }
            />
          </div>

          <div className="ref-btn-row">
            <button
              className="btn mini"
              onClick={() => {
                updateReference({
                  scale: fitScale(reference.w, reference.h),
                  x: columns / 2,
                  y: (rows * cellAspect) / 2,
                  rotationDeg: 0,
                  skewXDeg: 0,
                  skewYDeg: 0,
                });
                if (reference.live) traceReference();
              }}
            >
              Fit &amp; reset
            </button>
            <button
              className="btn mini"
              aria-pressed={reference.visible}
              onClick={() => updateReference({ visible: !reference.visible })}
            >
              {reference.visible ? 'Hide' : 'Show'}
            </button>
            <button className="btn mini" onClick={() => traceReference()}>
              Trace now
            </button>
          </div>

          <div className="ref-btn-row">
            <button className="btn mini danger grow" onClick={remove}>
              Remove image
            </button>
          </div>
        </>
      )}
    </div>
  );
}
