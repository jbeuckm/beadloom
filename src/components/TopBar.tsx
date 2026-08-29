import { useState } from 'react';
import { useStore } from '../store/useStore';
import Menu, { MenuItem } from './Menu';
import { Icon } from './icons';
import { downloadText, exportPNG, pickTextFile } from '../lib/designFormat';
import * as storage from '../lib/storage';

export type DialogId = 'new' | 'open' | 'saveas' | 'resize' | 'help';

/** ~11/0 seed beads: 74 columns is about 6 inches, so one column ≈ this. */
const IN_PER_COL = 6 / 74;

function SizeField({ axis }: { axis: 'columns' | 'rows' }) {
  const value = useStore((s) => s.design.loom[axis]);
  const apply = useStore((s) => (axis === 'columns' ? s.setColumns : s.setRows));
  const pushHistory = useStore((s) => s.pushHistory);
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n) && n >= 1 && n !== value) {
      pushHistory();
      apply(n);
    }
  };

  return (
    <input
      className="dim-value"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft ?? String(value)}
      aria-label={axis === 'columns' ? 'Column count' : 'Row count'}
      onFocus={(e) => {
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function LoomSize() {
  const columns = useStore((s) => s.design.loom.columns);
  const rows = useStore((s) => s.design.loom.rows);
  const aspect = useStore((s) => s.design.loom.cellAspect);
  const inW = columns * IN_PER_COL;
  const inH = rows * IN_PER_COL * aspect;
  const fmt = (n: number) => (n < 9.95 ? n.toFixed(1) : Math.round(n).toString());

  return (
    <div className="dim-group">
      <label htmlFor="dim-columns">Size</label>
      <SizeField axis="columns" />
      <span className="dim-x" aria-hidden="true">
        ×
      </span>
      <SizeField axis="rows" />
      <span
        className="dim-est"
        title="Approximate finished size with 11/0 seed beads (about 74 columns per 6 in)"
      >
        ≈ {fmt(inW)} × {fmt(inH)} in
      </span>
    </div>
  );
}

export default function TopBar({ onDialog }: { onDialog: (d: DialogId) => void }) {
  const s = useStore();

  const quickSave = () => {
    const name = s.design.meta.name.trim();
    if (name && storage.listDesigns().includes(name)) s.saveToSlot(name);
    else onDialog('saveas');
  };

  const importDesign = async () => {
    const f = await pickTextFile();
    if (!f) return;
    try {
      s.loadDesignText(f.text);
    } catch (err) {
      alert('Could not import design:\n' + (err as Error).message);
    }
  };

  return (
    <div className="topbar">
      <div className="brand">
        BeadLoom <small>Studio</small>
      </div>

      <Menu
        title="File menu"
        label={
          <>
            File <Icon name="chevron-down" size={15} />
          </>
        }
      >
        {(close) => (
          <>
            <div className="menu-label">Design</div>
            <MenuItem
              onClick={() => {
                if (
                  s.dirty &&
                  !confirm('Discard unsaved changes and start a new design?')
                )
                  return;
                onDialog('new');
              }}
              close={close}
            >
              + New…
            </MenuItem>
            <MenuItem onClick={() => onDialog('open')} close={close}>
              ⊟ Open…
            </MenuItem>
            <MenuItem onClick={quickSave} close={close}>
              ◊ Save
            </MenuItem>
            <MenuItem onClick={() => onDialog('saveas')} close={close}>
              ◊ Save As…
            </MenuItem>
            <div className="menu-sep" />
            <div className="menu-label">Interchange</div>
            <MenuItem onClick={importDesign} close={close}>
              ↓ Import Design (.json)…
            </MenuItem>
            <MenuItem
              onClick={() =>
                downloadText(
                  `${s.design.meta.name || 'pattern'}.beadloom.json`,
                  s.exportJSON(),
                )
              }
              close={close}
            >
              ↑ Export Design (.json)
            </MenuItem>
            <MenuItem onClick={() => exportPNG(s.design)} close={close}>
              ⊡ Export Image (.png)
            </MenuItem>
            <div className="menu-sep" />
            <MenuItem onClick={() => onDialog('resize')} close={close}>
              ◆ Resize Grid…
            </MenuItem>
            <div className="menu-sep" />
            <MenuItem
              onClick={() => {
                if (confirm('Clear every bead in this design?')) s.clearAll();
              }}
              close={close}
              danger
            >
              ⌫ Clear All
            </MenuItem>
            <MenuItem onClick={() => s.fillAll()} close={close}>
              ▓ Fill All (active colour)
            </MenuItem>
            <div className="menu-sep" />
            <MenuItem onClick={() => onDialog('help')} close={close}>
              ? File Format &amp; Shortcuts
            </MenuItem>
          </>
        )}
      </Menu>

      <input
        className="name-input"
        value={s.design.meta.name}
        onChange={(e) => s.setName(e.target.value)}
        placeholder="Pattern name"
        aria-label="Design name"
        title="Design name"
      />

      <div className="spacer" />

      <LoomSize />
    </div>
  );
}
