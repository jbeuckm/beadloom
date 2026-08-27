import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from '../store/useStore';
import Menu, { MenuItem } from './Menu';
import { Icon } from './icons';
import { downloadText, exportPNG, pickTextFile } from '../lib/designFormat';
import * as storage from '../lib/storage';

export type DialogId = 'new' | 'open' | 'saveas' | 'resize' | 'help';

/** Press-and-hold auto-repeat for the ± steppers, with one history entry per hold. */
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

function DimGroup({ axis }: { axis: 'columns' | 'rows' }) {
  const value = useStore((s) => s.design.loom[axis]);
  const setDim = useStore((s) => (axis === 'columns' ? s.setColumns : s.setRows));
  const pushHistory = useStore((s) => s.pushHistory);

  const isCols = axis === 'columns';
  const noun = isCols ? 'columns' : 'rows';
  const [draft, setDraft] = useState<string | null>(null);

  const bump = (d: number) => setDim(useStore.getState().design.loom[axis] + d);
  const dec = useHoldRepeat(() => bump(-1), pushHistory);
  const inc = useHoldRepeat(() => bump(1), pushHistory);

  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n) && n >= 1 && n !== value) {
      pushHistory();
      setDim(n);
    }
  };

  return (
    <div className="dim-group">
      <label htmlFor={`dim-${axis}`}>{isCols ? 'Cols' : 'Rows'}</label>
      <button
        className="dim-step"
        title={`Fewer ${noun}`}
        aria-label={`Fewer ${noun}`}
        {...dec}
      >
        −
      </button>
      <input
        id={`dim-${axis}`}
        className="dim-value"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft ?? String(value)}
        aria-label={isCols ? 'Column count' : 'Row count'}
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
            <MenuItem onClick={() => onDialog('new')} close={close}>
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

      <DimGroup axis="columns" />
      <DimGroup axis="rows" />
    </div>
  );
}
