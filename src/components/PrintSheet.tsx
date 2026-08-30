import { useMemo, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { compositeLayers } from '../lib/layers';

// SVG units: 100 per inch. The sheet is a US-Letter page minus 0.5in margins.
const IN = 100;
const PAGE_W = 7.5 * IN;
const PAGE_H = 10 * IN;
const EXT = 0.25 * IN; // grid lines run this far past the design on every edge
const RULER_W = 0.5 * IN; // left strip: inch-scale axis + labels
const TOP_H = 0.2 * IN; // top strip: row-count labels
const BOT_H = 0.16 * IN; // bottom strip: caption
const RIGHT_W = 0.28 * IN; // right strip: column-count labels
const IN_PER_COL = 6 / 74; // 74 columns ≈ 6 inches of beadwork

/**
 * The app view rotated 90° clockwise: columns run top→bottom, rows run
 * right→left, and the whole design is scaled uniformly to fit the page while
 * keeping the bead form factor (~4:5, from the loom cell aspect). The inch
 * scale down the left is nominal (74 columns ≈ 6 in), not a physical ruler.
 */
export default function PrintSheet() {
  const design = useStore((s) => s.design);
  const grid = useMemo(() => compositeLayers(design), [design]);
  const hexes = design.palette.colors.map((c) => c.hex);
  const cols = design.loom.columns; // vertical on the page
  const rows = design.loom.rows; // horizontal on the page
  const aspect = design.loom.cellAspect || 0.8; // app cellH / cellW

  // area left for the design after the label/extension strips
  const availW = PAGE_W - RULER_W - RIGHT_W - 2 * EXT;
  const availH = PAGE_H - TOP_H - BOT_H - 2 * EXT;

  // one page cell: width : height == aspect (so it prints ~4:5, tall)
  const cellH = Math.min(availW / (rows * aspect), availH / cols);
  const cellW = aspect * cellH;
  const dw = rows * cellW;
  const dh = cols * cellH;

  // centre the whole block (ruler + 1/4" gap + grid + labels) on the page
  const contentW = RULER_W + 2 * EXT + dw + RIGHT_W;
  const contentH = TOP_H + 2 * EXT + dh + BOT_H;
  const originX = Math.max(0, (PAGE_W - contentW) / 2);
  const originY = Math.max(0, (PAGE_H - contentH) / 2);
  const dx = originX + RULER_W + EXT; // 1/4" gap between the ruler and the grid
  const dy = originY + TOP_H + EXT;

  // app (col c, row r) → page cell, rotated 90° CW
  const px = (r: number) => dx + (rows - 1 - r) * cellW;
  const py = (c: number) => dy + c * cellH;

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

  // --- grid lines: solid stubs in the 1/4" margin, black-on-white dashed
  //     inside the design so they read against any bead colour ---
  const lines: ReactNode[] = [];
  const showMinorV = cellW >= 3.5;
  const showMinorH = cellH >= 3.5;
  const dashed = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    major: boolean,
    key: string,
  ) => {
    const w = major ? 1.9 : 1.2;
    lines.push(
      <line key={key + 'w'} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={w + 1} />,
      <line
        key={key + 'k'}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#000"
        strokeWidth={w}
        strokeDasharray={major ? '7 4' : '3.5 3.5'}
      />,
    );
  };
  const stub = (x1: number, y1: number, x2: number, y2: number, key: string) =>
    lines.push(
      <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={0.6} />,
    );

  for (let k = 0; k <= rows; k++) {
    const major = k % 5 === 0 || k === rows;
    if (!major && !showMinorV) continue;
    const x = dx + k * cellW;
    stub(x, dy - EXT, x, dy, `vt${k}`);
    stub(x, dy + dh, x, dy + dh + EXT, `vb${k}`);
    dashed(x, dy, x, dy + dh, major, `vi${k}`);
  }
  for (let k = 0; k <= cols; k++) {
    const major = k % 5 === 0 || k === cols;
    if (!major && !showMinorH) continue;
    const y = dy + k * cellH;
    stub(dx - EXT, y, dx, y, `ht${k}`);
    stub(dx + dw, y, dx + dw + EXT, y, `hb${k}`);
    dashed(dx, y, dx + dw, y, major, `hi${k}`);
  }

  // --- grid-count marks: app row numbers across the top, column numbers
  //     down the right side ---
  const marks: ReactNode[] = [];
  for (let k = 0; k <= rows; k++) {
    const label = rows - k; // row 0 sits on the right
    if (label % 5 !== 0 && k !== rows && k !== 0) continue;
    marks.push(
      <text
        key={`rn${k}`}
        x={dx + k * cellW}
        y={dy - EXT - 4}
        textAnchor="middle"
        fontSize={8}
        fill="#444"
      >
        {label}
      </text>,
    );
  }
  for (let k = 0; k <= cols; k++) {
    if (k % 5 !== 0 && k !== cols) continue;
    marks.push(
      <text
        key={`cn${k}`}
        x={dx + dw + EXT + 3}
        y={dy + k * cellH + 3}
        textAnchor="start"
        fontSize={8}
        fill="#444"
      >
        {k}
      </text>,
    );
  }

  // --- nominal inch scale down the left, one EXT clear of the grid ---
  const scale: ReactNode[] = [];
  const totalIn = cols * IN_PER_COL;
  const axisX = originX + RULER_W - 6;
  scale.push(
    <line key="axis" x1={axisX} y1={dy} x2={axisX} y2={dy + dh} stroke="#000" strokeWidth={0.9} />,
    <text key="unit" x={originX} y={dy - EXT - 4} fontSize={7.5} fill="#666">
      in ↓ nominal
    </text>,
  );
  for (let i = 0; i / 2 <= totalIn + 1e-6; i++) {
    const inch = i / 2;
    const y = dy + (inch / totalIn) * dh;
    const whole = i % 2 === 0;
    scale.push(
      <line
        key={`t${i}`}
        x1={axisX - (whole ? 7 : 4)}
        y1={y}
        x2={axisX}
        y2={y}
        stroke="#000"
        strokeWidth={whole ? 0.9 : 0.6}
      />,
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
