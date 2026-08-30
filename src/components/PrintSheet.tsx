import { useMemo, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { compositeLayers } from '../lib/layers';

// SVG units: 100 per inch. The sheet is a US-Letter page minus 0.5in margins.
const IN = 100;
const PAGE_W = 7.5 * IN;
const PAGE_H = 10 * IN;
const EXT = 0.125 * IN; // major grid lines run this far past the design
const RULER_W = 0.4 * IN; // inch-scale axis + digit labels
const SIDENUM_W = 0.17 * IN; // grid column numbers, each side
const ROWNUM_H = 0.14 * IN; // grid row numbers, top & bottom
const FOOT = 0.16 * IN; // caption strip at the page foot
const IN_PER_COL = 6 / 74; // 74 columns ≈ 6 inches of beadwork

/**
 * The app view rotated 90° clockwise: columns run top→bottom, and the whole
 * design is scaled uniformly to fit the page while keeping the bead form
 * factor (~4:5, from the loom cell aspect). Every-5th grid line is marked on
 * all four sides; the inch scale down the left is nominal (74 cols ≈ 6in).
 */
export default function PrintSheet() {
  const design = useStore((s) => s.design);
  const grid = useMemo(() => compositeLayers(design), [design]);
  const hexes = design.palette.colors.map((c) => c.hex);
  const cols = design.loom.columns; // vertical on the page
  const rows = design.loom.rows; // horizontal on the page
  const aspect = design.loom.cellAspect || 0.8; // app cellH / cellW

  const availW = PAGE_W - RULER_W - 2 * SIDENUM_W - 2 * EXT;
  const availH = PAGE_H - 2 * ROWNUM_H - 2 * EXT - FOOT;

  // one page cell: width : height == aspect (so it prints ~4:5, tall)
  const cellH = Math.min(availW / (rows * aspect), availH / cols);
  const cellW = aspect * cellH;
  const dw = rows * cellW;
  const dh = cols * cellH;

  // centre the whole block on the page
  const contentW = RULER_W + 2 * SIDENUM_W + 2 * EXT + dw;
  const contentH = 2 * ROWNUM_H + 2 * EXT + dh;
  const originX = Math.max(0, (PAGE_W - contentW) / 2);
  const originY = Math.max(0, (PAGE_H - FOOT - contentH) / 2);
  const dx = originX + RULER_W + SIDENUM_W + EXT;
  const dy = originY + ROWNUM_H + EXT;

  // app (col c, row r) → page cell, rotated 90° CW
  const px = (r: number) => dx + (rows - 1 - r) * cellW;
  const py = (c: number) => dy + c * cellH;

  // relative luminance of a palette entry (page-white for an empty cell)
  const lumaCache = new Map<number, number>();
  const luma = (idx: number) => {
    if (idx < 0) return 1;
    let l = lumaCache.get(idx);
    if (l === undefined) {
      const h = (hexes[idx] || '#000').replace('#', '');
      const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
      l =
        (0.299 * ((n >> 16) & 255) +
          0.587 * ((n >> 8) & 255) +
          0.114 * (n & 255)) /
        255;
      lumaCache.set(idx, l);
    }
    return l;
  };
  // ink for the border between two cells: black on light, white on dark
  const ink = (a: number, b: number) => ((luma(a) + luma(b)) / 2 < 0.5 ? '#fff' : '#000');
  const beadAt = (xslot: number, yslot: number) => {
    const v = grid[rows - 1 - xslot]?.[yslot];
    return v == null ? -1 : v;
  };

  // --- bead cells (skip empties so the paper shows through) ---
  const cells: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const row = grid[r] || [];
    for (let c = 0; c < cols; c++) {
      const v = row[c];
      if (v == null || v < 0) continue;
      cells.push(
        <rect
          key={`b${r}-${c}`}
          x={px(r)}
          y={py(c)}
          width={cellW + 0.5}
          height={cellH + 0.5}
          fill={hexes[v] || '#000'}
        />,
      );
    }
  }

  // --- grid lines. A faint base grid so empty areas stay legible, then each
  //     interior border drawn as its own segment inked (black or white) to
  //     contrast with the bead colours on *both* sides of it. Only every-5th
  //     line gets the 1/8" stub past the design. ---
  const lines: ReactNode[] = [];
  const showMinorV = cellW >= 3.5;
  const showMinorH = cellH >= 3.5;
  const perSeg = rows * cols <= 9000; // cap the element count on huge grids
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w: number, key: string) =>
    lines.push(<line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={w} />);

  for (let k = 0; k <= rows; k++) {
    const major = k % 5 === 0 || k === rows;
    if (!major && !showMinorV) continue;
    const x = dx + k * cellW;
    if (major) {
      line(x, dy - EXT, x, dy, '#000', 0.7, `vt${k}`);
      line(x, dy + dh, x, dy + dh + EXT, '#000', 0.7, `vb${k}`);
    }
    line(x, dy, x, dy + dh, '#9a9a9a', major ? 1 : 0.55, `vg${k}`);
    if (perSeg && k > 0 && k < rows)
      for (let y = 0; y < cols; y++) {
        const a = beadAt(k - 1, y);
        const b = beadAt(k, y);
        if (a < 0 && b < 0) continue;
        line(x, dy + y * cellH, x, dy + (y + 1) * cellH, ink(a, b), major ? 1.4 : 1, `vs${k}-${y}`);
      }
  }
  for (let k = 0; k <= cols; k++) {
    const major = k % 5 === 0 || k === cols;
    if (!major && !showMinorH) continue;
    const y = dy + k * cellH;
    if (major) {
      line(dx - EXT, y, dx, y, '#000', 0.7, `ht${k}`);
      line(dx + dw, y, dx + dw + EXT, y, '#000', 0.7, `hb${k}`);
    }
    line(dx, y, dx + dw, y, '#9a9a9a', major ? 1 : 0.55, `hg${k}`);
    if (perSeg && k > 0 && k < cols)
      for (let x = 0; x < rows; x++) {
        const a = beadAt(x, k - 1);
        const b = beadAt(x, k);
        if (a < 0 && b < 0) continue;
        line(dx + x * cellW, y, dx + (x + 1) * cellW, y, ink(a, b), major ? 1.4 : 1, `hs${k}-${x}`);
      }
  }

  // --- grid counts on all four sides (every 5) ---
  const marks: ReactNode[] = [];
  for (let k = 0; k <= rows; k++) {
    if (k % 5 !== 0 && k !== rows) continue;
    const x = dx + k * cellW;
    marks.push(
      <text key={`rt${k}`} x={x} y={dy - EXT - 3} textAnchor="middle" fontSize={8} fill="#444">
        {k}
      </text>,
      <text key={`rb${k}`} x={x} y={dy + dh + EXT + 9} textAnchor="middle" fontSize={8} fill="#444">
        {k}
      </text>,
    );
  }
  for (let k = 0; k <= cols; k++) {
    if (k % 5 !== 0 && k !== cols) continue;
    const y = dy + k * cellH + 3;
    marks.push(
      <text key={`cl${k}`} x={dx - EXT - 3} y={y} textAnchor="end" fontSize={8} fill="#444">
        {k}
      </text>,
      <text key={`cr${k}`} x={dx + dw + EXT + 3} y={y} textAnchor="start" fontSize={8} fill="#444">
        {k}
      </text>,
    );
  }

  // --- nominal inch scale down the left ---
  const scale: ReactNode[] = [];
  const totalIn = cols * IN_PER_COL;
  const axisX = originX + RULER_W - 3;
  scale.push(
    <line key="axis" x1={axisX} y1={dy} x2={axisX} y2={dy + dh} stroke="#000" strokeWidth={0.9} />,
    <text key="unit" x={originX} y={dy - EXT - 3} fontSize={7} fill="#666">
      in↓ nom
    </text>,
  );
  for (let i = 0; i / 2 <= totalIn + 1e-6; i++) {
    const inch = i / 2;
    const y = dy + (inch / totalIn) * dh;
    const whole = i % 2 === 0;
    scale.push(
      <line key={`t${i}`} x1={axisX - (whole ? 7 : 4)} y1={y} x2={axisX} y2={y} stroke="#000" strokeWidth={whole ? 0.9 : 0.6} />,
    );
    if (whole)
      scale.push(
        <text key={`l${i}`} x={axisX - 9} y={y + 3} textAnchor="end" fontSize={8.5} fill="#000">
          {inch}
        </text>,
      );
  }

  return (
    <svg
      className="print-sheet"
      width={`${PAGE_W / IN}in`}
      height={`${PAGE_H / IN}in`}
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill="#fff" />
      {cells}
      {lines}
      <rect x={dx} y={dy} width={dw} height={dh} fill="none" stroke="#000" strokeWidth={1.4} />
      {marks}
      {scale}
      <text x={PAGE_W} y={PAGE_H - 3} textAnchor="end" fontSize={8} fill="#777">
        {(design.meta.name || 'Untitled').slice(0, 64)} · {cols} columns × {rows} rows ·
        scaled to page (inch scale nominal)
      </text>
    </svg>
  );
}
