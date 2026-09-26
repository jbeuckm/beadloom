import { useRef } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import type { ImageLayer } from '../types';
import { uid } from '../util';
import { paletteFromImage, rgbToHex } from '../lib/quantize';
import { ensureImage, imageSamples } from '../lib/referenceImage';
import { adjustRgb } from '../lib/trace';

export default function ReferencePanel({ onClose: _onClose }: { onClose: () => void }) {
  const { columns, rows, cellAspect } = useStore((s) => s.design.loom);
  const palette = useStore((s) => s.design.palette);
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
        scaleX: fitScale(w, h),
        scaleY: fitScale(w, h),
        rotationDeg: 0,
        skewXDeg: 0,
        skewYDeg: 0,
        opacity: 0.55,
        contrast: 0,
        brightness: 0,
        warmth: 0,
        equalize: 0,
        paletteMode: 'current',
        paletteColors: 10,
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

  /** Hue-aware palette from the (adjusted) image pixels. */
  const proposeColors = () => {
    if (!layer) return [];
    const samples = imageSamples(layer.src).map((rgb) => adjustRgb(rgb, layer));
    if (!samples.length) return [];
    return paletteFromImage(samples, layer.paletteColors).map((rgb, i) => ({
      id: `img-${uid()}`,
      name: `Colour ${i + 1}`,
      hex: rgbToHex(rgb),
    }));
  };

  const replacePalette = () => {
    const colors = proposeColors();
    if (colors.length) applyPalette({ id: uid(), name: 'From image', colors });
  };

  const addColors = () => {
    const colors = proposeColors();
    if (colors.length)
      applyPalette({
        id: palette.id,
        name: palette.name,
        colors: palette.colors.concat(colors),
      });
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
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          <Icon name="image" size={16} /> Choose image…
        </button>
      </div>
    );
  }

  return (
    <div className="ref-panel dock-panel">
      {picker}

      <p className="hint">
        This image keeps its traced colours on its own layer while you work
        elsewhere. Use <b>Flatten to beads</b> when you want it painted into a
        normal drawing layer.
      </p>

      <h4>Adjust</h4>
      <div className="field">
        <label>Contrast — {Math.round(layer.contrast * 100)}</label>
        <input
          type="range"
          min={-100}
          max={100}
          value={Math.round(layer.contrast * 100)}
          onChange={(e) => edit({ contrast: Number(e.target.value) / 100 })}
        />
      </div>
      <div className="field">
        <label>Brightness — {Math.round(layer.brightness * 100)}</label>
        <input
          type="range"
          min={-100}
          max={100}
          value={Math.round(layer.brightness * 100)}
          onChange={(e) => edit({ brightness: Number(e.target.value) / 100 })}
        />
      </div>
      <div className="field">
        <label>Warmth — {Math.round(layer.warmth * 100)}</label>
        <input
          type="range"
          min={-100}
          max={100}
          value={Math.round(layer.warmth * 100)}
          onChange={(e) => edit({ warmth: Number(e.target.value) / 100 })}
        />
      </div>
      <div className="field">
        <label>Equalize — {Math.round((layer.equalize ?? 0) * 100)}</label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((layer.equalize ?? 0) * 100)}
          onChange={(e) => edit({ equalize: Number(e.target.value) / 100 })}
        />
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

      <h4>Palette</h4>
      <label className="check">
        <input
          type="radio"
          name="img-palette-mode"
          checked={layer.paletteMode === 'proposed'}
          onChange={() => edit({ paletteMode: 'proposed' })}
        />
        Colours from this image
      </label>
      <label className="check">
        <input
          type="radio"
          name="img-palette-mode"
          checked={layer.paletteMode === 'current'}
          onChange={() => edit({ paletteMode: 'current' })}
        />
        Use the current palette
      </label>

      {layer.paletteMode === 'proposed' && (
        <>
          <label className="ref-num">
            Colours
            <input
              type="number"
              min={2}
              max={24}
              value={layer.paletteColors}
              onChange={(e) =>
                edit({
                  paletteColors: Math.max(
                    2,
                    Math.min(24, Number(e.target.value) || 2),
                  ),
                })
              }
            />
          </label>
          <div className="ref-btn-row">
            <button className="btn grow" onClick={replacePalette}>
              Replace palette
            </button>
            <button className="btn grow" onClick={addColors}>
              Add colours
            </button>
          </div>
        </>
      )}

      <div className="ref-btn-row">
        <button
          className="btn mini"
          onClick={() =>
            edit({
              scaleX: fitScale(layer.w, layer.h),
              scaleY: fitScale(layer.w, layer.h),
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
