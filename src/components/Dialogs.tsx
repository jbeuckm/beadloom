import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import type { DialogId } from './TopBar';
import * as storage from '../lib/storage';
import { pickTextFile } from '../lib/designFormat';
import { FILE_FORMAT_SPEC, SHORTCUTS } from '../help';

export default function Dialogs({
  which,
  onClose,
}: {
  which: DialogId;
  onClose: () => void;
}) {
  if (which === 'new') return <NewDialog onClose={onClose} />;
  if (which === 'resize') return <ResizeDialog onClose={onClose} />;
  if (which === 'saveas') return <SaveAsDialog onClose={onClose} />;
  if (which === 'open') return <OpenDialog onClose={onClose} />;
  return <HelpDialog onClose={onClose} />;
}

const PRESETS: Array<[number, number]> = [
  [20, 40],
  [30, 60],
  [40, 80],
  [15, 15],
  [24, 32],
  [60, 120],
];

function NewDialog({ onClose }: { onClose: () => void }) {
  const newDesign = useStore((s) => s.newDesign);
  const [cols, setCols] = useState(100);
  const [rows, setRows] = useState(25);
  const [name, setName] = useState('Untitled Pattern');
  const [keepPalette, setKeepPalette] = useState(true);

  return (
    <Modal title="New Design" onClose={onClose}>
      <div className="field">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="row2">
        <div className="field">
          <label>Columns (left → right)</label>
          <input
            type="number"
            min={1}
            max={400}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Rows (bead rows)</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="preset-grid">
        {PRESETS.map(([c, r]) => (
          <button
            key={`${c}x${r}`}
            className="btn"
            onClick={() => {
              setCols(c);
              setRows(r);
            }}
          >
            {c}×{r}
          </button>
        ))}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={keepPalette}
          onChange={(e) => setKeepPalette(e.target.checked)}
        />
        Keep current palette (otherwise reset to Rainbow 10)
      </label>
      <div className="actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() => {
            newDesign({ columns: cols, rows, name, keepPalette });
            onClose();
          }}
        >
          Create
        </button>
      </div>
    </Modal>
  );
}

function ResizeDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [cols, setCols] = useState(s.design.loom.columns);
  const [rows, setRows] = useState(s.design.loom.rows);
  return (
    <Modal title="Resize Grid" onClose={onClose}>
      <p className="hint">
        Existing beads stay anchored to the top-left. Growing adds empty cells;
        shrinking trims from the right / bottom.
      </p>
      <div className="row2">
        <div className="field">
          <label>Columns</label>
          <input
            type="number"
            min={1}
            max={400}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Rows</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() => {
            s.pushHistory();
            s.setColumns(cols);
            s.setRows(rows);
            onClose();
          }}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}

function SaveAsDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState(s.design.meta.name || 'Untitled Pattern');
  const exists = storage.listDesigns().includes(name.trim());
  return (
    <Modal title="Save Design" onClose={onClose}>
      <div className="field">
        <label>Name (saved in this browser)</label>
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {exists && <p className="hint">A design with this name will be overwritten.</p>}
      <div className="actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!name.trim()}
          onClick={() => {
            s.saveToSlot(name);
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function OpenDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [tick, setTick] = useState(0);
  const names = useMemo(() => storage.listDesigns(), [tick]);
  const hasAuto = !!storage.readAutosave();

  return (
    <Modal title="Open Design" onClose={onClose}>
      {names.length === 0 && (
        <p className="hint">No saved designs yet. Use “Save As…” to create one.</p>
      )}
      <div className="slot-list">
        {names.map((n) => (
          <div className="slot" key={n}>
            <span className="nm">{n}</span>
            <button
              className="btn mini"
              onClick={() => {
                s.loadFromSlot(n);
                onClose();
              }}
            >
              Open
            </button>
            <button
              className="btn mini danger"
              onClick={() => {
                if (confirm(`Delete "${n}"?`)) {
                  storage.deleteDesignSlot(n);
                  setTick((t) => t + 1);
                }
              }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
      <div className="actions">
        {hasAuto && (
          <button
            className="btn"
            onClick={() => {
              const j = storage.readAutosave();
              if (j) {
                try {
                  s.loadDesignText(j);
                } catch {
                  /* ignore */
                }
              }
              onClose();
            }}
          >
            Restore last autosave
          </button>
        )}
        <button
          className="btn"
          onClick={async () => {
            const f = await pickTextFile();
            if (!f) return;
            try {
              s.loadDesignText(f.text);
              onClose();
            } catch (err) {
              alert('Could not import:\n' + (err as Error).message);
            }
          }}
        >
          Import from file…
        </button>
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="File Format & Shortcuts" onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>Keyboard shortcuts</h3>
      <div className="slot-list">
        {SHORTCUTS.map(([k, d]) => (
          <div key={k} style={{ display: 'flex', gap: 10 }}>
            <kbd>{k}</kbd>
            <span className="hint">{d}</span>
          </div>
        ))}
      </div>
      <h3>Custom design file — <code>.beadloom.json</code></h3>
      <div className="spec">{FILE_FORMAT_SPEC}</div>
      <div className="actions">
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
