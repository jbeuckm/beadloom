import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import Modal from './Modal';
import { starCells, starVertices, type StarParams } from '../lib/shapes';

export default function SelburoseDialog({ onClose }: { onClose: () => void }) {
  const { columns, rows, cellAspect } = useStore((s) => s.design.loom);
  const activeColor = useStore((s) => s.activeColor);
  const paintCells = useStore((s) => s.paintCells);
  const pushHistory = useStore((s) => s.pushHistory);
  const swatch = useStore(
    (s) => s.design.palette.colors[s.activeColor]?.hex ?? '#1268ff',
  );

  const [points, setPoints] = useState(8);
  const [size, setSize] = useState(Math.max(3, Math.round(Math.min(columns, rows / cellAspect) / 3)));
  const [separation, setSeparation] = useState(0.62);
  const [rotation, setRotation] = useState(0);
  const [cx, setCx] = useState(Math.round(columns / 2));
  const [cy, setCy] = useState(Math.round(rows / 2));
  const [mode, setMode] = useState<'fill' | 'outline'>('fill');

  const ratio = 1 - 0.85 * separation;

  const params = (cxv: number, cyv: number, asp: number): StarParams => ({
    cx: cxv,
    cy: cyv,
    points,
    outerR: size,
    ratio,
    rotationDeg: rotation,
    aspect: asp,
  });

  const previewPts = useMemo(() => {
    const pv = starVertices(params(50, 50, cellAspect));
    // fit the raw vertices into a 0..100 box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pv) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const s = 92 / Math.max(maxX - minX, maxY - minY, 1);
    return pv
      .map(([x, y]) => `${4 + (x - minX) * s},${4 + (y - minY) * s}`)
      .join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, ratio, rotation, cellAspect]);

  const insert = () => {
    const cells = starCells(params(cx, cy, cellAspect), columns, rows, mode);
    if (!cells.length) return;
    pushHistory();
    paintCells(cells, activeColor);
    onClose();
  };

  return (
    <Modal title="Selburose" onClose={onClose}>
      <p className="hint">
        A parametric star / rose. Higher separation = sharper, more distinct
        petals. Inserts with the active colour.
      </p>

      <div className="selburose-body">
        <svg className="selburose-preview" viewBox="0 0 100 100" aria-hidden="true">
          <polygon
            points={previewPts}
            fill={mode === 'fill' ? swatch : 'none'}
            stroke={swatch}
            strokeWidth={mode === 'fill' ? 0 : 3}
            strokeLinejoin="round"
          />
        </svg>

        <div className="selburose-controls">
          <div className="field">
            <label>Petals — {points}</label>
            <input type="range" min={3} max={24} value={points}
              onChange={(e) => setPoints(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Size (radius, columns) — {size}</label>
            <input type="range" min={2} max={Math.max(4, Math.round(Math.max(columns, rows)))} value={size}
              onChange={(e) => setSize(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Petal separation — {Math.round(separation * 100)}%</label>
            <input type="range" min={0} max={100} value={Math.round(separation * 100)}
              onChange={(e) => setSeparation(Number(e.target.value) / 100)} />
          </div>
          <div className="field">
            <label>Rotation — {rotation}°</label>
            <input type="range" min={-180} max={180} value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))} />
          </div>
          <div className="row2">
            <div className="field">
              <label>Centre X</label>
              <input type="number" min={0} max={columns - 1} value={cx}
                onChange={(e) => setCx(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Centre Y</label>
              <input type="number" min={0} max={rows - 1} value={cy}
                onChange={(e) => setCy(Number(e.target.value))} />
            </div>
          </div>
          <label className="check">
            <input type="radio" name="selburose-mode" checked={mode === 'fill'}
              onChange={() => setMode('fill')} />
            Filled
          </label>
          <label className="check">
            <input type="radio" name="selburose-mode" checked={mode === 'outline'}
              onChange={() => setMode('outline')} />
            Outline
          </label>
        </div>
      </div>

      <div className="actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={insert}>Insert</button>
      </div>
    </Modal>
  );
}
