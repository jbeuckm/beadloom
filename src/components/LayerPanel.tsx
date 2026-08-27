import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import { rasterCount } from '../lib/layers';
import type { Layer } from '../types';

export default function LayerPanel({ onClose }: { onClose: () => void }) {
  const layers = useStore((s) => s.design.layers);
  const activeLayer = useStore((s) => s.activeLayer);
  const selectedSelburoseId = useStore((s) => s.selectedSelburoseId);
  const selectedImageId = useStore((s) => s.selectedImageId);
  const s = useStore();

  const [dragId, setDragId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const onlyRaster = rasterCount(layers) <= 1;

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
    if (l.kind === 'raster') s.setActiveLayer(l.id);
    else if (l.kind === 'selburose') s.selectSelburose(l.id);
    else {
      s.selectImage(l.id);
      s.setRightPanel('reference');
    }
  };

  const kindIcon = (
    k: Layer['kind'],
  ): 'selburose' | 'image' | 'swatches' =>
    k === 'selburose' ? 'selburose' : k === 'image' ? 'image' : 'swatches';

  return (
    <div className="layer-panel dock-panel">
      <button
        className="btn grow"
        onClick={s.addLayer}
        aria-label="Add layer"
        title="Add a new paintable layer"
      >
        <Icon name="plus" size={16} /> Layer
      </button>

      <div className="layer-list">
        {layers
          .map((l, i) => ({ l, i }))
          .reverse()
          .map(({ l }) => {
            const active = l.kind === 'raster' && l.id === activeLayer;
            const picked =
              (l.kind === 'selburose' && l.id === selectedSelburoseId) ||
              (l.kind === 'image' && l.id === selectedImageId);
            return (
              <div
                key={l.id}
                className={
                  'layer-row' +
                  (active ? ' active' : '') +
                  (picked ? ' picked' : '') +
                  (l.visible ? '' : ' hidden') +
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
                <Icon name={kindIcon(l.kind)} size={15} />
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
                  className="btn mini danger"
                  disabled={l.kind === 'raster' && onlyRaster}
                  onClick={(e) => {
                    e.stopPropagation();
                    s.removeLayer(l.id);
                  }}
                  title="Delete layer"
                  aria-label="Delete layer"
                >
                  <Icon name="trash" size={15} />
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
