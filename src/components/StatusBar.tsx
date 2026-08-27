import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { colorUsage, totalBeads } from '../lib/grid';

export default function StatusBar() {
  const design = useStore((s) => s.design);
  const selection = useStore((s) => s.selection);
  const clipboard = useStore((s) => s.clipboard);
  const cursor = useStore((s) => s.cursor);
  const zoom = useStore((s) => s.view.zoom);

  const { columns, rows } = design.loom;
  const data = design.cells.data;

  const { total, distinct } = useMemo(
    () => ({ total: totalBeads(data), distinct: colorUsage(data).size }),
    [data],
  );

  const inBounds =
    cursor && cursor.c >= 0 && cursor.r >= 0 && cursor.c < columns && cursor.r < rows;

  return (
    <div className="statusbar">
      <span>
        Grid <b>{columns}</b> × <b>{rows}</b>
      </span>
      <span>
        <b>{total.toLocaleString()}</b> beads placed
      </span>
      <span>
        <b>{distinct}</b> / {design.palette.colors.length} colours used
      </span>
      {selection && (
        <span>
          Selection{' '}
          <b>
            {selection.c1 - selection.c0 + 1}×{selection.r1 - selection.r0 + 1}
          </b>
        </span>
      )}
      {clipboard && (
        <span>
          Clipboard{' '}
          <b>
            {clipboard.w}×{clipboard.h}
          </b>
        </span>
      )}
      <span>
        Cell{' '}
        <b>{inBounds ? `${cursor!.c + 1}, ${cursor!.r + 1}` : '—'}</b>
      </span>
      <span style={{ marginLeft: 'auto' }}>
        Zoom <b>{Math.round(zoom * 100)}%</b>
      </span>
    </div>
  );
}
