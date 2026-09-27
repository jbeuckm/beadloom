import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import FileBrowser from './FileBrowser';
import { designLibrary } from '../lib/library';
import { Icon } from './icons';
import type { DialogId } from './TopBar';
import * as storage from '../lib/storage';
import { pickTextFile } from '../lib/designFormat';
import { FILE_FORMAT_SPEC, SHORTCUTS } from '../help';
import { DEFAULT_GRID_TYPE, GRID_TYPES, gridTypeFor } from '../lib/gridTypes';

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

/** Pick the kind of grid: each type fixes the cell aspect (height ÷ width). */
function GridTypeField({
  aspect,
  onChange,
}: {
  aspect: number;
  onChange: (a: number) => void;
}) {
  const current = gridTypeFor(aspect);
  return (
    <div className="field">
      <label>Grid type</label>
      {GRID_TYPES.map((t) => (
        <label key={t.id} className="check">
          <input
            type="radio"
            name="grid-type"
            checked={current?.id === t.id}
            onChange={() => onChange(t.cellAspect)}
          />
          {t.label}
        </label>
      ))}
      {!current && (
        <p className="hint">Custom cell aspect {aspect.toFixed(2)} (from file)</p>
      )}
    </div>
  );
}

function NewDialog({ onClose }: { onClose: () => void }) {
  const newDesign = useStore((s) => s.newDesign);
  const [cols, setCols] = useState(100);
  const [rows, setRows] = useState(25);
  const [name, setName] = useState('Untitled Pattern');
  const [keepPalette, setKeepPalette] = useState(true);
  const [aspect, setAspect] = useState(DEFAULT_GRID_TYPE.cellAspect);

  // The unsaved-changes prompt already happened before this dialog opened.
  const create = () => {
    newDesign({ columns: cols, rows, name, cellAspect: aspect, keepPalette });
    onClose();
  };

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
      <GridTypeField aspect={aspect} onChange={setAspect} />
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
        <button className="btn primary" onClick={create}>
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
  const [aspect, setAspect] = useState(s.design.loom.cellAspect);
  return (
    <Modal title="Grid" onClose={onClose}>
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
      <GridTypeField aspect={aspect} onChange={setAspect} />
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
            s.setCellAspect(aspect);
            onClose();
          }}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}

/** The Finder-style browser over saved designs, for Open and Save As. */
function DesignBrowser({ mode, onClose }: { mode: 'open' | 'save'; onClose: () => void }) {
  const s = useStore();
  return (
    <FileBrowser
      col={designLibrary}
      mode={mode}
      prefsKey={storage.BKEY}
      typeHeader="Grid type"
      currentPath={s.slotPath}
      initialName={s.design.meta.name || 'Untitled Pattern'}
      onOpen={(e) => s.loadFromSlot(e.path)}
      onSave={(name, folder) => {
        s.saveToSlot(name, folder);
        return useStore.getState().slotPath ?? '';
      }}
      onRemap={s.remapSlot}
      onClose={onClose}
      footer={
        mode === 'open' && (
          <>
            {storage.readAutosave() && (
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
          </>
        )
      }
    />
  );
}

function SaveAsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Save Design" onClose={onClose} wide>
      <DesignBrowser mode="save" onClose={onClose} />
    </Modal>
  );
}

function OpenDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Open Design" onClose={onClose} wide>
      <DesignBrowser mode="open" onClose={onClose} />
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
