import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { snapSelburoseCenter } from '../lib/shapes';
import type { SelburoseObject } from '../types';

// The height control is the star's tip-to-tip span in cells; geometry uses an
// outer radius (cells, square grid), so it is just half the height.
const outerToHeight = (r: number) => Math.round(2 * r);
const heightToOuter = (h: number) => h / 2;

export default function SelburoseDialog() {
  const { columns, rows } = useStore((s) => s.design.loom);
  const editingId = useStore((s) => s.editingSelburose);
  const star = useStore((s) => {
    if (!s.editingSelburose) return null;
    const l = s.design.layers.find(
      (x) => x.kind === 'selburose' && x.id === s.editingSelburose,
    );
    return l && l.kind === 'selburose' ? l.star : null;
  });

  const updateSelburose = useStore((s) => s.updateSelburose);
  const removeSelburose = useStore((s) => s.removeSelburose);
  const flattenSelburose = useStore((s) => s.flattenSelburose);
  const pushHistory = useStore((s) => s.pushHistory);
  const close = useStore((s) => s.closeSelburoseEditor);

  // The object was deleted out from under the panel — just close.
  useEffect(() => {
    if (!star) close();
  }, [star, close]);

  // Holding Shift snaps the rotation slider to 15° increments.
  const shiftHeld = useRef(false);
  useEffect(() => {
    const track = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeld.current = e.type === 'keydown';
    };
    window.addEventListener('keydown', track);
    window.addEventListener('keyup', track);
    return () => {
      window.removeEventListener('keydown', track);
      window.removeEventListener('keyup', track);
    };
  }, []);

  // One undo checkpoint the first time this star is edited in the panel.
  const dirtied = useRef<string | null>(null);
  const edit = (patch: Partial<SelburoseObject>) => {
    if (!star) return;
    if (dirtied.current !== star.id) {
      pushHistory();
      dirtied.current = star.id;
    }
    updateSelburose(star.id, patch);
  };

  if (!star) return null;

  const maxHeight = Math.max(6, Math.round(Math.max(rows, columns) * 1.4));
  const height = outerToHeight(star.size);
  const setCenter = (c: 'cell' | 'border') =>
    edit({
      center: c,
      cx: snapSelburoseCenter(star.cx, c),
      cy: snapSelburoseCenter(star.cy, c),
    });

  return (
    <div className="dock-panel selburose-panel" key={editingId ?? ''}>
      <p className="hint">
        An eight-point star built from eight parallelograms. Drag it on the canvas
        with the Select tool; changes here apply to it live.
      </p>

      <div className="field">
        <label>Height — {height} rows</label>
        <input
          type="range"
          min={3}
          max={maxHeight}
          value={height}
          onChange={(e) => edit({ size: heightToOuter(Number(e.target.value)) })}
        />
      </div>
      <div className="field">
        <label>
          Gap — {star.gap.toFixed(1)} in ({(star.gap * 2).toFixed(1)}-bead channel)
        </label>
        <input
          type="range"
          min={0}
          max={4}
          step={0.1}
          value={star.gap}
          onChange={(e) => edit({ gap: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>Rotation — {star.rotationDeg}°</label>
        <input
          type="range"
          min={-180}
          max={180}
          value={star.rotationDeg}
          onChange={(e) => {
            let v = Number(e.target.value);
            if (shiftHeld.current) v = Math.round(v / 15) * 15;
            edit({ rotationDeg: v });
          }}
        />
      </div>
      <div className="field">
        <label>Aliasing — {Math.round(star.coverage * 100)}%</label>
        <input
          type="range"
          min={5}
          max={100}
          value={Math.round(star.coverage * 100)}
          onChange={(e) => edit({ coverage: Number(e.target.value) / 100 })}
        />
      </div>

      <fieldset className="selburose-align">
        <legend>Alignment</legend>
        <label className="check">
          <input
            type="radio"
            name="selburose-align"
            checked={star.center === 'cell'}
            onChange={() => setCenter('cell')}
          />
          Center
        </label>
        <label className="check">
          <input
            type="radio"
            name="selburose-align"
            checked={star.center === 'border'}
            onChange={() => setCenter('border')}
          />
          Edge
        </label>
      </fieldset>

      <label className="check">
        <input
          type="radio"
          name="selburose-mode"
          checked={star.mode === 'fill'}
          onChange={() => edit({ mode: 'fill' })}
        />
        Filled
      </label>
      <label className="check">
        <input
          type="radio"
          name="selburose-mode"
          checked={star.mode === 'outline'}
          onChange={() => edit({ mode: 'outline' })}
        />
        Outline
      </label>

      <div className="actions spread">
        <button
          className="btn danger"
          onClick={() => {
            removeSelburose(star.id);
            close();
          }}
        >
          Delete
        </button>
        <span className="grow" />
        <button
          className="btn"
          onClick={() => {
            flattenSelburose(star.id);
            close();
          }}
        >
          Flatten to beads
        </button>
        <button className="btn primary" onClick={close}>
          Done
        </button>
      </div>
    </div>
  );
}
