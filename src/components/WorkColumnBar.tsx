// Floating bar for beading column by column: which column you're on, ‹ › to
// step, and the column's beads bottom to top as colour runs to follow.

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import { compositeLayers } from '../lib/layers';
import { contrastText } from '../util';
import { swatchStyle } from '../lib/woolTexture';

export default function WorkColumnBar() {
  const workColumn = useStore((s) => s.workColumn);
  const design = useStore((s) => s.design);
  const step = useStore((s) => s.stepWorkColumn);
  const setWorkColumn = useStore((s) => s.setWorkColumn);

  const runs = useMemo(() => {
    if (workColumn == null) return [];
    const grid = compositeLayers(design);
    const out: Array<{ v: number; n: number }> = [];
    // bottom row first
    for (const row of [...grid].reverse()) {
      const v = row[workColumn] ?? -1;
      const last = out[out.length - 1];
      if (last && last.v === v) last.n++;
      else out.push({ v, n: 1 });
    }
    return out;
  }, [design, workColumn]);

  if (workColumn == null) return null;
  const cols = design.loom.columns;
  const colors = design.palette.colors;

  return (
    <div className="workcol" role="region" aria-label="Working column">
      <button
        className="workcol-btn"
        aria-label="Previous column"
        disabled={workColumn <= 0}
        onClick={() => step(-1)}
      >
        <Icon name="chevron-left" size={20} />
      </button>
      <div className="workcol-title">
        Column <b>{workColumn + 1}</b> <span>of {cols}</span>
      </div>
      <button
        className="workcol-btn"
        aria-label="Next column"
        disabled={workColumn >= cols - 1}
        onClick={() => step(1)}
      >
        <Icon name="chevron-right" size={20} />
      </button>
      <ol className="workcol-runs" aria-label="Beads, bottom to top">
        {runs.map((run, i) => {
          const col = run.v >= 0 ? colors[run.v] : undefined;
          return (
            <li
              key={i}
              className={col ? '' : 'empty'}
              style={col ? { ...swatchStyle(col, 20), color: contrastText(col.hex) } : undefined}
              title={col ? `${run.n} × ${col.name}${col.code ? ` (${col.code})` : ''}` : `${run.n} empty`}
            >
              {run.n}
            </li>
          );
        })}
      </ol>
      <button
        className="workcol-btn"
        aria-label="Stop beading by column"
        title="Stop"
        onClick={() => setWorkColumn(null)}
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
