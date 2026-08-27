import { useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import type { ImageLayer } from '../types';
import { uid } from '../util';
import { medianCut, rgbToHex } from '../lib/quantize';
import { ensureImage, imageSamples } from '../lib/referenceImage';

export default function ReferencePanel({ onClose: _onClose }: { onClose: () => void }) {
  const { columns, rows, cellAspect } = useStore((s) => s.design.loom);
  const layer = useStore((s) => {
    if (!s.editingImage) return null;
    const l = s.design.layers.find(
      (x) => x.kind === 'image' && x.id === s.editingImage,
    );
    return l && l.kind === 'image' ? l : null;
  });

  const addImageLayer = useStore((s) => s.addImageLayer);
  const updateImageLayer = useStore((s) => s.updateImageLayer);
  const flattenImageLayer = useStore((s) => s.flattenImageLayer);
  const removeImageLayer = useStore((s) => s.removeImageLayer);
  const applyPalette = useStore((s) => s.applyPalette);
  const pushHistory = useStore((s) => s.pushHistory);

  const [nColors, setNColors] = useState(10);
  const fileRef = useRef<HTMLInputElement>(null);

  const fitScale = (w: number, h: number) =>
    Math.min(columns / w, (rows * cellAspect) / h) || 0.1;

  const choose = (file: File) => {
    const url = URL.createObjectURL(file);
    ensureImage(url);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      addImageLayer({
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
        coveredOnly: true,
      });
    };
    img.src = url;
  };

  // One undo checkpoint the first time a control edits this image.
  const dirtied = useRef<string | null>(null);
  const edit = (patch: Partial<ImageLayer>) => {
    if (!layer) return;
    if (dirtied.current !== layer.id) {
      pushHistory();
      dirtied.current = layer.id;
    }
    updateImageLayer(layer.id, patch);
  };

  const extractPalette = () => {
    if (!layer) return;
    const samples = imageSamples(layer.src);
    if (!samples.length) return;
    const colors = medianCut(samples, nColors).map((rgb, i) => ({
      id: `img-${i + 1}`,
      name: `Colour ${i + 1}`,
      hex: rgbToHex(rgb),
    }));
    applyPalette({ id: uid(), name: 'From image', colors });
  };

  const picker = (
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
  );

  if (!layer) {
    return (
      <div className="ref-panel dock-panel">
        {picker}
        <p className="hint">
          Place a photo or drawing as its own layer, transform it on the canvas
          with the <b>Image</b> tool, then <b>Flatten to beads</b> when it's lined
          up. No bead changes until you flatten.
        </p>
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          <Icon name="image" size={16} /> Choose image…
        </button>
      </div>
    );
  }

  return (
    <div className="ref-panel dock-panel">
      {picker}
      <img className="ref-thumb" src={layer.src} alt="" />

      <p className="hint">
        <b>Image</b> tool: drag the picture to move it; use the corner, edge and
        rotation handles to scale, skew and rotate.
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

      <label className="check">
        <input
          type="checkbox"
          checked={layer.coveredOnly}
          onChange={(e) => edit({ coveredOnly: e.target.checked })}
        />
        Only cells the image covers
      </label>

      <div className="field">
        <label>Opacity — {Math.round(layer.opacity * 100)}%</label>
        <input
          type="range"
          min={5}
          max={100}
          value={Math.round(layer.opacity * 100)}
          onChange={(e) => edit({ opacity: Number(e.target.value) / 100 })}
        />
      </div>

      <div className="ref-btn-row">
        <button
          className="btn mini"
          onClick={() =>
            edit({
              scale: fitScale(layer.w, layer.h),
              x: columns / 2,
              y: (rows * cellAspect) / 2,
              rotationDeg: 0,
              skewXDeg: 0,
              skewYDeg: 0,
            })
          }
        >
          Fit &amp; reset
        </button>
        <button className="btn mini" onClick={() => fileRef.current?.click()}>
          Add another
        </button>
      </div>

      <div className="actions spread">
        <button
          className="btn danger"
          onClick={() => removeImageLayer(layer.id)}
        >
          Delete
        </button>
        <span className="grow" />
        <button
          className="btn primary"
          onClick={() => flattenImageLayer(layer.id)}
        >
          Flatten to beads
        </button>
      </div>
    </div>
  );
}
