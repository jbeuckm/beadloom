import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import type { Palette } from '../types';
import { PRESET_PALETTES } from '../lib/palettes';
import {
  downloadText,
  parsePalette,
  pickTextFile,
  serializePalette,
} from '../lib/designFormat';
import * as storage from '../lib/storage';

function Preview({ palette }: { palette: Palette }) {
  return (
    <span className="pal-swatches" aria-hidden="true">
      {palette.colors.slice(0, 14).map((c) => (
        <i key={c.id} style={{ background: c.hex }} />
      ))}
    </span>
  );
}

export default function PaletteLibrary({ onClose }: { onClose: () => void }) {
  const palette = useStore((s) => s.design.palette);
  const applyPalette = useStore((s) => s.applyPalette);

  const [tick, setTick] = useState(0);
  const saved = useMemo(() => storage.listPalettes(), [tick]);
  const [saveName, setSaveName] = useState(palette.name.trim() || 'My Palette');

  const presets = useMemo(
    () => PRESET_PALETTES.map((p) => ({ ...p, palette: p.build() })),
    [],
  );

  const use = (p: Palette) => {
    applyPalette(p);
    onClose();
  };

  const load = (name: string) => {
    const json = storage.loadPaletteSlot(name);
    if (!json) return;
    try {
      applyPalette(parsePalette(json));
      onClose();
    } catch (err) {
      alert('Could not load palette:\n' + (err as Error).message);
    }
  };

  const saveCurrent = () => {
    const name = saveName.trim();
    if (!name) return;
    storage.savePaletteSlot(
      name,
      serializePalette({ ...palette, name }),
    );
    setTick((t) => t + 1);
  };

  const importFile = async () => {
    const f = await pickTextFile();
    if (!f) return;
    try {
      applyPalette(parsePalette(f.text));
      onClose();
    } catch (err) {
      alert('Could not import palette:\n' + (err as Error).message);
    }
  };

  return (
    <Modal title="Palette Library" onClose={onClose}>
      <h3>Presets</h3>
      <div className="slot-list">
        {presets.map((p) => (
          <div className="slot" key={p.key}>
            <Preview palette={p.palette} />
            <span className="nm">
              {p.label}
              <small className="hint"> · {p.palette.colors.length}</small>
            </span>
            <button className="btn mini" onClick={() => use(p.palette)}>
              Apply
            </button>
          </div>
        ))}
      </div>

      <h3>Saved in this browser</h3>
      {saved.length === 0 && (
        <p className="hint">Save the current palette below to reuse it in other designs.</p>
      )}
      <div className="slot-list">
        {saved.map((n) => (
          <div className="slot" key={n}>
            <span className="nm">{n}</span>
            <button className="btn mini" onClick={() => load(n)}>
              Load
            </button>
            <button
              className="btn mini danger"
              aria-label={`Delete palette ${n}`}
              onClick={() => {
                if (confirm(`Delete palette "${n}"?`)) {
                  storage.deletePaletteSlot(n);
                  setTick((t) => t + 1);
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      <h3>Save current palette</h3>
      <div className="save-row">
        <input
          type="text"
          value={saveName}
          aria-label="Save palette as"
          onChange={(e) => setSaveName(e.target.value)}
        />
        <button className="btn" disabled={!saveName.trim()} onClick={saveCurrent}>
          Save
        </button>
      </div>

      <div className="actions">
        <button className="btn" onClick={importFile}>
          Import file…
        </button>
        <button
          className="btn"
          onClick={() =>
            downloadText(
              `${palette.name || 'palette'}.beadloom-palette.json`,
              serializePalette(palette),
            )
          }
        >
          Export file…
        </button>
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
