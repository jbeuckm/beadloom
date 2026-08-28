import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { ShapeObject } from '../types';

export default function ShapeDialog() {
  const editingId = useStore((s) => s.editingShape);
  const shape = useStore((s) => {
    if (!s.editingShape) return null;
    const l = s.design.layers.find(
      (x) => x.kind === 'shape' && x.id === s.editingShape,
    );
    return l && l.kind === 'shape' ? l.shape : null;
  });

  const updateShape = useStore((s) => s.updateShape);
  const removeShape = useStore((s) => s.removeShape);
  const flattenShape = useStore((s) => s.flattenShape);
  const pushHistory = useStore((s) => s.pushHistory);
  const setLineThickness = useStore((s) => s.setLineThickness);
  const close = useStore((s) => s.closeShapeEditor);

  // The object was deleted out from under the panel — just close.
  useEffect(() => {
    if (!shape) close();
  }, [shape, close]);

  // One undo checkpoint the first time this shape is edited in the panel.
  const dirtied = useRef<string | null>(null);
  const edit = (patch: Partial<ShapeObject>) => {
    if (!shape) return;
    if (dirtied.current !== shape.id) {
      pushHistory();
      dirtied.current = shape.id;
    }
    updateShape(shape.id, patch);
  };

  if (!shape) return null;

  const isLine = shape.kind === 'line';
  const isPoly = shape.kind === 'poly';
  const isBox = shape.kind === 'box';
  const strokeMode = isLine || isPoly || !shape.fill;
  const showFill = isBox || (isPoly && shape.closed);
  const len = isLine
    ? Math.round(Math.hypot(shape.x1 - shape.x0, shape.y1 - shape.y0)) + 1
    : null;

  return (
    <div className="dock-panel shape-panel" key={editingId ?? ''}>
      <p className="hint">
        {isLine
          ? 'A straight run of beads. Drag it or its end handles on the canvas.'
          : isBox
            ? 'A rectangle. Drag it or its corner handles on the canvas.'
            : 'A free polygon. With the Select tool: drag a point to move it, click an edge to add a point, Alt-click a point to remove it.'}
      </p>

      {strokeMode && (
        <div className="field">
          <label>
            {isBox ? 'Border' : 'Thickness'} — {shape.thickness} bead
            {shape.thickness === 1 ? '' : 's'}
          </label>
          <input
            type="range"
            min={1}
            max={24}
            value={shape.thickness}
            onChange={(e) => {
              const t = Number(e.target.value);
              edit({ thickness: t });
              if (isLine || isPoly) setLineThickness(t);
            }}
          />
        </div>
      )}

      {isPoly && (
        <label className="check">
          <input
            type="checkbox"
            checked={shape.closed}
            onChange={(e) => edit({ closed: e.target.checked })}
          />
          Closed path
        </label>
      )}

      {showFill && (
        <>
          <label className="check">
            <input
              type="radio"
              name="shape-fill"
              checked={shape.fill}
              onChange={() => edit({ fill: true })}
            />
            Filled
          </label>
          <label className="check">
            <input
              type="radio"
              name="shape-fill"
              checked={!shape.fill}
              onChange={() => edit({ fill: false })}
            />
            Outline
          </label>
        </>
      )}

      <p className="hint">
        {isLine ? (
          <>
            ({shape.x0}, {shape.y0}) → ({shape.x1}, {shape.y1}) · {len} beads long
          </>
        ) : isPoly ? (
          <>{shape.points.length} points</>
        ) : (
          <>
            {Math.abs(shape.x1 - shape.x0) + 1} ×{' '}
            {Math.abs(shape.y1 - shape.y0) + 1} cells
          </>
        )}
      </p>

      <div className="actions spread">
        <button
          className="btn danger"
          onClick={() => {
            removeShape(shape.id);
            close();
          }}
        >
          Delete
        </button>
        <span className="grow" />
        <button
          className="btn"
          onClick={() => {
            flattenShape(shape.id);
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
