import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import { rasterCount } from '../lib/layers';
import { ensureImage, imageSamples, subscribeImages } from '../lib/referenceImage';
import type { Layer } from '../types';

const toHex = (r: number, g: number, b: number) =>
  '#' +
  [r, g, b]
    .map((x) =>
      Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0'),
    )
    .join('');

/** The colour that most represents a layer: its most-used bead, the star's
 *  fill, or an image's average pixel. Null when there's nothing to show yet. */
function dominantHex(l: Layer, hexes: string[]): string | null {
  if (l.kind === 'selburose') return hexes[l.star.colorIndex] ?? null;
  if (l.kind === 'shape') return hexes[l.shape.colorIndex] ?? null;
  if (l.kind === 'raster') {
    const counts = new Map<number, number>();
    for (const row of l.data)
      for (const v of row) if (v >= 0) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best = -1;
    let bestN = 0;
    for (const [v, n] of counts) if (n > bestN) [best, bestN] = [v, n];
    return best >= 0 ? hexes[best] ?? null : null;
  }
  ensureImage(l.src);
  const smp = imageSamples(l.src, 800);
  if (!smp.length) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [pr, pg, pb] of smp) {
    r += pr;
    g += pg;
    b += pb;
  }
  return toHex(r / smp.length, g / smp.length, b / smp.length);
}

export default function LayerPanel({ onClose }: { onClose: () => void }) {
  const layers = useStore((s) => s.design.layers);
  const activeLayer = useStore((s) => s.activeLayer);
  const selectedSelburoseId = useStore((s) => s.selectedSelburoseId);
  const selectedImageId = useStore((s) => s.selectedImageId);
  const selectedShapeId = useStore((s) => s.selectedShapeId);
  const hexes = useStore((s) => s.design.palette.colors.map((c) => c.hex));
  const s = useStore();

  const [dragId, setDragId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [, setImgNonce] = useState(0);

  // repaint the swatches when an image layer's bitmap finishes decoding
  useEffect(() => subscribeImages(() => setImgNonce((n) => n + 1)), []);

  const onlyRaster = rasterCount(layers) <= 1;

  // the "current" layer the footer actions target
  const currentId =
    selectedSelburoseId || selectedImageId || selectedShapeId || activeLayer;
  const currentIdx = layers.findIndex((l) => l.id === currentId);

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const next = layers.slice();
    const from = next.findIndex((l) => l.id === dragId);
    const to = next.findIndex((l) => l.id === targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    s.reorderLayers(next);
    setDragId(null);
  };

  const rowClick = (l: Layer) => {
    if (l.locked) {
      s.notify(`“${l.name}” is locked`);
      return;
    }
    if (l.kind === 'raster') s.setActiveLayer(l.id);
    else if (l.kind === 'selburose') s.selectSelburose(l.id);
    else if (l.kind === 'shape') {
      s.selectShape(l.id);
      s.openShapeEditor(l.id);
    } else {
      s.selectImage(l.id);
      s.setRightPanel('reference');
    }
  };

  const kindIcon = (
    k: Layer['kind'],
  ): 'selburose' | 'image' | 'line' | 'swatches' =>
    k === 'selburose'
      ? 'selburose'
      : k === 'image'
        ? 'image'
        : k === 'shape'
          ? 'line'
          : 'swatches';

  return (
    <div className="layer-panel dock-panel">
      <div className="layer-actions">
        <button
          className="btn mini"
          onClick={s.addLayer}
          aria-label="Add layer"
          title="Add a new paintable layer"
        >
          <Icon name="plus" size={16} /> Layer
        </button>
        <button
          className="btn mini"
          onClick={() => currentIdx >= 0 && s.duplicateLayer(currentId)}
          disabled={currentIdx < 0}
          title="Duplicate the current layer"
        >
          <Icon name="copy" size={16} /> Duplicate
        </button>
        <button
          className="btn mini"
          onClick={() => currentIdx > 0 && s.mergeLayerDown(currentId)}
          disabled={
            currentIdx <= 0 || !!layers[currentIdx]?.locked || !!layers[currentIdx - 1]?.locked
          }
          title="Merge the current layer into the one below it"
        >
          Merge ↓
        </button>
      </div>

      <div className="layer-list">
        {layers
          .map((l, i) => ({ l, i }))
          .reverse()
          .map(({ l }) => {
            const active = l.kind === 'raster' && l.id === activeLayer;
            const picked =
              (l.kind === 'selburose' && l.id === selectedSelburoseId) ||
              (l.kind === 'image' && l.id === selectedImageId) ||
              (l.kind === 'shape' && l.id === selectedShapeId);
            return (
              <div
                key={l.id}
                className={
                  'layer-row' +
                  (active ? ' active' : '') +
                  (picked ? ' picked' : '') +
                  (l.visible ? '' : ' hidden') +
                  (l.locked ? ' locked' : '') +
                  (dragId === l.id ? ' dragging' : '')
                }
                draggable={renaming !== l.id}
                onDragStart={() => setDragId(l.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(l.id)}
                onClick={() => rowClick(l)}
              >
                <span className="grip" aria-hidden="true">
                  <Icon name="dots" size={16} />
                </span>
                <button
                  className="eye"
                  onClick={(e) => {
                    e.stopPropagation();
                    s.toggleLayerVisible(l.id);
                  }}
                  title={l.visible ? 'Hide layer' : 'Show layer'}
                  aria-label={l.visible ? 'Hide layer' : 'Show layer'}
                  aria-pressed={l.visible}
                >
                  <Icon name={l.visible ? 'eye' : 'eye-off'} size={16} />
                </button>
                {(() => {
                  const hex = dominantHex(l, hexes);
                  return hex ? (
                    <span
                      className="layer-swatch"
                      style={{ background: hex }}
                      title={`Dominant colour ${hex}`}
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon name={kindIcon(l.kind)} size={15} />
                  );
                })()}
                {renaming === l.id ? (
                  <input
                    className="layer-name-input"
                    defaultValue={l.name}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      s.renameLayer(l.id, e.target.value);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <span
                    className="layer-name"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenaming(l.id);
                    }}
                  >
                    {l.name}
                  </span>
                )}
                <button
                  className="layer-lock"
                  onClick={(e) => {
                    e.stopPropagation();
                    s.toggleLayerLocked(l.id);
                  }}
                  title={l.locked ? 'Unlock layer' : 'Lock layer — no selecting or editing'}
                  aria-label={l.locked ? 'Unlock layer' : 'Lock layer'}
                  aria-pressed={!!l.locked}
                >
                  <Icon name={l.locked ? 'lock' : 'unlock'} size={15} />
                </button>
                <button
                  className="layer-del"
                  disabled={(l.kind === 'raster' && onlyRaster) || !!l.locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    s.removeLayer(l.id);
                  }}
                  title="Delete layer"
                  aria-label="Delete layer"
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            );
          })}
      </div>

      <p className="hint">
        Painting goes to the highlighted raster layer. Double-click a name to
        rename; drag the handle to reorder.
      </p>
    </div>
  );
}
