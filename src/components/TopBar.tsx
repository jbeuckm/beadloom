import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from '../store/useStore';
import Menu, { MenuItem } from './Menu';
import { Icon } from './icons';
import { downloadText, exportPNG, pickTextFile } from '../lib/designFormat';
import * as storage from '../lib/storage';
import { gridTypeFor } from '../lib/gridTypes';

export type DialogId = 'new' | 'open' | 'saveas' | 'resize' | 'help';

/** Press-and-hold auto-repeat for the ± steppers, one history entry per hold. */
function useHoldRepeat(step: () => void, onStart?: () => void) {
  const timers = useRef<number[]>([]);
  const stop = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => stop, []);

  const start = () => {
    onStart?.();
    step();
    let delay = 300;
    const tick = () => {
      step();
      delay = Math.max(28, delay * 0.8);
      timers.current.push(window.setTimeout(tick, delay));
    };
    timers.current.push(window.setTimeout(tick, delay));
  };

  return {
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      start();
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}

function SizeField({ axis }: { axis: 'columns' | 'rows' }) {
  const value = useStore((s) => s.design.loom[axis]);
  const apply = useStore((s) => (axis === 'columns' ? s.setColumns : s.setRows));
  const pushHistory = useStore((s) => s.pushHistory);
  const [draft, setDraft] = useState<string | null>(null);
  const noun = axis === 'columns' ? 'columns' : 'rows';

  const bump = (d: number) =>
    apply(useStore.getState().design.loom[axis] + d);
  const dec = useHoldRepeat(() => bump(-1), pushHistory);
  const inc = useHoldRepeat(() => bump(1), pushHistory);

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
    <span className="dim-field">
      <button
        className="dim-step"
        title={`Fewer ${noun}`}
        aria-label={`Fewer ${noun}`}
        {...dec}
      >
        −
      </button>
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
      <button
        className="dim-step"
        title={`More ${noun}`}
        aria-label={`More ${noun}`}
        {...inc}
      >
        +
      </button>
    </span>
  );
}

function LoomSize() {
  const columns = useStore((s) => s.design.loom.columns);
  const type = useStore((s) => gridTypeFor(s.design.loom.cellAspect));
  const inW = type?.inPerCol ? columns * type.inPerCol : null;
  const est =
    inW === null ? null : inW < 9.95 ? inW.toFixed(1) : Math.round(inW).toString();

  return (
    <div className="dim-group">
      <label htmlFor="dim-columns">Size</label>
      <SizeField axis="columns" />
      <span className="dim-x" aria-hidden="true">
        ×
      </span>
      <SizeField axis="rows" />
      {est !== null && (
        <span
          className="dim-est"
          title={`Approximate length along the columns with ${type!.label}`}
        >
          ≈ {est} in
        </span>
      )}
    </div>
  );
}

export default function TopBar({ onDialog }: { onDialog: (d: DialogId) => void }) {
  const s = useStore();

  const quickSave = () => {
    if (!s.quickSave()) onDialog('saveas');
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
        Grid <small>Designer</small>
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
            <MenuItem onClick={() => s.setShowPrint(true)} close={close}>
              ⎙ Print Chart…
            </MenuItem>
            <div className="menu-sep" />
            <MenuItem onClick={() => onDialog('resize')} close={close}>
              ◆ Grid Size & Type…
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
