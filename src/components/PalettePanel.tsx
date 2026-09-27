import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import ColorDialog from './ColorDialog';
import PaletteLibrary from './PaletteLibrary';
import { Icon } from './icons';
import { colorUsage } from '../lib/grid';
import { compositeLayers } from '../lib/layers';
import { contrastText } from '../util';
import { serializePalette } from '../lib/designFormat';
import { paletteLibrary, splitPath, stampPaletteJson } from '../lib/library';

export default function PalettePanel() {
  const s = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draggedColor, setDraggedColor] = useState<string | null>(null);

  const palette = s.design.palette;
  const usage = useMemo(
    () => colorUsage(compositeLayers(s.design)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.design, s.imageEpoch],
  );
  const activeColor = palette.colors[s.activeColor];

  const quickSave = () => {
    const name = palette.name.trim();
    if (!name) {
      alert('Name the palette first.');
      return;
    }
    // back into the folder it was loaded from / last saved to
    const folder = s.paletteSlotPath ? splitPath(s.paletteSlotPath).folder : '';
    s.setPaletteSlotPath(
      paletteLibrary.save(folder, name, stampPaletteJson(serializePalette(palette))),
    );
  };

  const handleDrop = (targetColorId: string) => {
    if (!draggedColor || draggedColor === targetColorId) {
      setDraggedColor(null);
      return;
    }
    const draggedIdx = palette.colors.findIndex((c) => c.id === draggedColor);
    const targetIdx = palette.colors.findIndex((c) => c.id === targetColorId);
    if (draggedIdx !== -1 && targetIdx !== -1) {
      const next = [...palette.colors];
      const [moved] = next.splice(draggedIdx, 1);
      next.splice(targetIdx, 0, moved);
      s.reorderColors(next);
    }
    setDraggedColor(null);
  };

  return (
    <div className="palette">
      <div className="swatch-list" role="listbox" aria-label="Palette colours">
        {palette.colors.map((c, i) => {
          const n = usage.get(i) ?? 0;
          const selected = s.activeColor === i;
          return (
            <div
              key={c.id}
              className={
                'swatch-row' +
                (selected ? ' active' : '') +
                (draggedColor === c.id ? ' dragging' : '')
              }
              draggable
              onDragStart={() => setDraggedColor(c.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(c.id)}
            >
              <button
                className="swatch"
                style={{ background: c.hex, color: contrastText(c.hex) }}
                onClick={() => {
                  s.setActiveColor(i);
                  if (s.selectedSelburoseId)
                    s.recolorSelburose(s.selectedSelburoseId, i);
                  if (s.selectedShapeId) s.recolorShape(s.selectedShapeId, i);
                  // picking a colour means you want to paint, not erase
                  if (s.tool === 'eraser') s.setTool('pen');
                }}
                title={`${c.name} — ${c.hex}${c.code ? ` · ${c.code}` : ''}`}
                aria-label={`Use ${c.name}`}
                aria-pressed={selected}
              >
                {s.settings.showUsage && n > 0 && <span className="count">{n}</span>}
              </button>
              <div
                className="swatch-meta"
                onClick={() => setEditing(c.id)}
                title="Edit this colour"
              >
                <div className="nm">{c.name}</div>
                <div className="sub">
                  {c.hex}
                  {c.code ? ` · ${c.code}` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <footer>
        <button
          className="btn grow"
          onClick={() => setAdding(true)}
          title="Add a colour — pick one, or choose bead / yarn colours from a library"
        >
          + Color
        </button>
        <button
          className="btn"
          onClick={() => activeColor && setEditing(activeColor.id)}
          title="Edit the selected colour"
          aria-label="Edit the selected colour"
        >
          <Icon name="pencil" size={16} /> Edit
        </button>
        <button
          className="btn mini"
          onClick={() => s.setSetting('showUsage', !s.settings.showUsage)}
          title="Show per-colour bead counts"
          aria-label="Show bead counts"
          aria-pressed={s.settings.showUsage}
        >
          <Icon name="hash" size={16} />
        </button>

        <input
          className="pname"
          value={palette.name}
          onChange={(e) => s.setPaletteName(e.target.value)}
          aria-label="Palette name"
          title="Palette name"
          placeholder="Untitled palette"
        />
        <button
          className="btn mini"
          onClick={quickSave}
          title="Save this palette to the browser"
          aria-label="Save this palette"
        >
          <Icon name="save" size={18} />
        </button>
        <button
          className="btn"
          onClick={() => setLibraryOpen(true)}
          title="Palette library — saved palettes, starter sets, import / export"
        >
          <Icon name="swatches" size={16} /> Palettes
        </button>

        <div className="bg-row">
          <input
            type="color"
            value={s.design.background}
            onChange={(e) => s.setBackground(e.target.value)}
            aria-label="Background colour"
            title="Background colour of empty cells"
          />
          <span className="hint">Bg</span>
        </div>
      </footer>

      {editing && <ColorDialog id={editing} onClose={() => setEditing(null)} />}
      {adding && <ColorDialog onClose={() => setAdding(false)} />}
      {libraryOpen && <PaletteLibrary onClose={() => setLibraryOpen(false)} />}
    </div>
  );
}
