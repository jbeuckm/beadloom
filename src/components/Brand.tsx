// Chromattice's look: the Southwest palette, the Selburose mark (in full on
// Home, simplified in the designer), and the pixel-art scenery.

import { useMemo } from 'react';
import '@fontsource/josefin-sans/latin-700.css';
import { pointInPolygon, selburoseCells, selburoseParallelograms } from '../lib/shapes';

// ---- Southwest branding: a stepped-diamond lattice logo, mesas, a zigzag band

export const SW = { turquoise: '#2e9c95', cream: '#f6ead4', terracotta: '#c2562f', ochre: '#d99a3a', plum: '#5b2d3b' };

/** The mark: a Selburose (eight-point star) on a coarse grid, drawn by the
 *  same code that places one in a design. Its petals are pulled apart, each
 *  in its own colour and made in a different craft — every one of them a way
 *  of putting a colour at an address. */
type Craft = 'bead' | 'tile' | 'weave' | 'cross' | 'knit' | 'strung' | 'tent' | 'quilt';
// petal i gets craft i and colour i % 4 (so opposite petals share a colour);
// the dark plum goes to the fuller crafts, where it still reads on the sky
const CRAFTS: Array<{ craft: Craft; label: string }> = [
  { craft: 'bead', label: 'Beaded' },
  { craft: 'tile', label: 'Mosaic tile' },
  { craft: 'weave', label: 'Woven' },
  { craft: 'strung', label: 'Strung beads' },
  { craft: 'knit', label: 'Knitted' },
  { craft: 'cross', label: 'Cross-stitched' },
  { craft: 'tent', label: 'Needlepoint' },
  { craft: 'quilt', label: 'Quilted' },
];

const PETAL_COLOURS = [SW.terracotta, SW.turquoise, SW.ochre, SW.plum];
// the big logo sits on a terracotta sky: cream in place of terracotta
const HERO_COLOURS = [SW.cream, SW.turquoise, SW.ochre, SW.plum];

/** A Selburose on an N×N grid (N even, so its axes fall between cells), its
 *  cells sorted into the eight petals: each to the petal covering most of it. */
function selburosePetals(N: number): Array<Array<[number, number]>> {
  const c = N / 2;
  const star = { cx: c, cy: c, outerR: c, rotationDeg: 0, gap: 0 };
  const quads = selburoseParallelograms(star);
  const petals: Array<Array<[number, number]>> = quads.map(() => []);
  for (const [x, y] of selburoseCells(star, N, N, 'fill', 0.5)) {
    let best = 0;
    let most = -1;
    quads.forEach((q, i) => {
      let hits = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) if (pointInPolygon(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4, q)) hits++;
      if (hits > most) [best, most] = [i, hits];
    });
    petals[best].push([x, y]);
  }
  return petals;
}

/** The mark, simplified for small sizes (the designer's Home button): a
 *  coarser Selburose, flat pixels, a colour per petal. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const cells = useMemo(
    () => selburosePetals(12).flatMap((list, i) => list.map(([x, y]) => ({ x, y, fill: PETAL_COLOURS[i % 4] }))),
    [],
  );
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">
      {cells.map(({ x, y, fill }) => (
        <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={fill} />
      ))}
    </svg>
  );
}

/** A hex colour made lighter (amt > 0) or darker (amt < 0). */
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(ch);
  return `rgb(${r},${g},${b})`;
}

/** The quilted petal: one piece of fabric the shape of the whole petal, with
 *  a running stitch just inside its edge and diagonal quilting lines across. */
function QuiltPiece({ cells, fill }: { cells: Array<[number, number]>; fill: string }) {
  // the outline: every cell edge not shared with another cell of the piece
  const edges = new Map<string, string>();
  const toggle = (k: string, d: string) => (edges.has(k) ? edges.delete(k) : edges.set(k, d));
  for (const [x, y] of cells) {
    toggle(`h${x},${y}`, `M${x} ${y}h1`);
    toggle(`h${x},${y + 1}`, `M${x} ${y + 1}h1`);
    toggle(`v${x},${y}`, `M${x} ${y}v1`);
    toggle(`v${x + 1},${y}`, `M${x + 1} ${y}v1`);
  }
  const outline = [...edges.values()].join('');
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs) + 1, Math.min(...ys), Math.max(...ys) + 1];
  const quilting: string[] = [];
  for (let k = x0 - (y1 - y0); k < x1; k += 1.5) quilting.push(`M${k} ${y0}l${y1 - y0} ${y1 - y0}`);
  const stitch = shade(fill, 0.55);
  return (
    <g>
      <defs>
        <clipPath id="quilt-piece">
          {cells.map(([x, y]) => (
            <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} />
          ))}
        </clipPath>
      </defs>
      <g clipPath="url(#quilt-piece)">
        {cells.map(([x, y]) => (
          <rect key={`${x},${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />
        ))}
        <path d={quilting.join('')} stroke={stitch} strokeWidth={0.05} strokeDasharray="0.14 0.1" opacity={0.7} />
        {/* the running stitch: a dashed band, then the fabric laid back over the outer part of it */}
        <path d={outline} stroke={stitch} strokeWidth={0.42} strokeDasharray="0.14 0.1" fill="none" />
        <path d={outline} stroke={fill} strokeWidth={0.32} fill="none" strokeLinecap="square" />
        {/* a soft edge, as if the fabric rolls over the batting */}
        <path d={outline} stroke="#2a0f16" strokeWidth={0.12} fill="none" opacity={0.35} />
      </g>
    </g>
  );
}

/** One grid cell, made in `craft`. */
function Cell({ x, y, fill, craft }: { x: number; y: number; fill: string; craft: Craft }) {
  const cx = x + 0.5;
  const cy = y + 0.5;
  switch (craft) {
    case 'bead':
      return (
        <g>
          <circle cx={cx} cy={cy} r={0.44} fill={fill} stroke={shade(fill, -0.35)} strokeWidth={0.06} />
          <circle cx={cx} cy={cy} r={0.11} fill={shade(fill, -0.45)} />
          <circle cx={cx - 0.17} cy={cy - 0.18} r={0.09} fill="#fff" opacity={0.7} />
        </g>
      );
    case 'tile': {
      const i = 0.06; // grout
      const b = 0.16;
      const w = 1 - 2 * i;
      return (
        <g>
          <rect x={x + i} y={y + i} width={w} height={w} fill={fill} />
          <path d={`M${x + i} ${y + i}h${w}l-${b} ${b}h${-(w - 2 * b)}v${w - 2 * b}l-${b} ${b}Z`} fill="#fff" opacity={0.4} />
          <path d={`M${x + i + w} ${y + i + w}h${-w}l${b} -${b}h${w - 2 * b}v${-(w - 2 * b)}l${b} -${b}Z`} fill="#2a0f16" opacity={0.35} />
        </g>
      );
    }
    case 'weave': {
      // over-and-under: warp (vertical) and weft (horizontal) take turns on top
      const warpOnTop = (x + y) % 2 === 0;
      const warp = <rect x={x + 0.18} y={y} width={0.64} height={1} fill={fill} />;
      const weft = <rect x={x} y={y + 0.18} width={1} height={0.64} fill={shade(fill, -0.22)} />;
      return (
        <g>
          {warpOnTop ? weft : warp}
          {warpOnTop ? warp : weft}
          {warpOnTop ? (
            <rect x={x + 0.18} y={y} width={0.14} height={1} fill="#fff" opacity={0.25} />
          ) : (
            <rect x={x} y={y + 0.18} width={1} height={0.14} fill="#fff" opacity={0.2} />
          )}
        </g>
      );
    }
    case 'cross':
      return (
        <g strokeWidth={0.26} strokeLinecap="round">
          <line x1={x + 0.18} y1={y + 0.18} x2={x + 0.82} y2={y + 0.82} stroke={shade(fill, -0.2)} />
          <line x1={x + 0.18} y1={y + 0.82} x2={x + 0.82} y2={y + 0.18} stroke={fill} />
          <line x1={x + 0.26} y1={y + 0.7} x2={x + 0.5} y2={y + 0.46} stroke="#fff" strokeWidth={0.06} opacity={0.5} />
        </g>
      );
    case 'knit':
      // a knit stitch: two legs of a V, on the fabric's darker ground
      return (
        <g>
          <rect x={x} y={y} width={1} height={1} fill={shade(fill, -0.4)} />
          <ellipse cx={x + 0.32} cy={cy} rx={0.19} ry={0.46} transform={`rotate(-28 ${x + 0.32} ${cy})`} fill={fill} stroke={shade(fill, -0.3)} strokeWidth={0.05} />
          <ellipse cx={x + 0.68} cy={cy} rx={0.19} ry={0.46} transform={`rotate(28 ${x + 0.68} ${cy})`} fill={shade(fill, 0.08)} stroke={shade(fill, -0.3)} strokeWidth={0.05} />
        </g>
      );
    case 'strung':
      // seed beads seen side-on, strung on a thread that runs along the row
      return (
        <g>
          <line x1={x} y1={cy} x2={x + 1} y2={cy} stroke={SW.cream} strokeWidth={0.12} />
          <rect x={x + 0.13} y={y + 0.15} width={0.74} height={0.7} rx={0.24} fill={fill} stroke={shade(fill, -0.35)} strokeWidth={0.05} />
          <rect x={x + 0.24} y={y + 0.22} width={0.52} height={0.14} rx={0.07} fill="#fff" opacity={0.45} />
          <rect x={x + 0.24} y={y + 0.66} width={0.52} height={0.1} rx={0.05} fill={shade(fill, -0.4)} opacity={0.6} />
        </g>
      );
    case 'tent':
      // needlepoint's tent stitch: one slanted stitch per canvas hole
      return (
        <g strokeLinecap="round">
          <line x1={x + 0.14} y1={y + 0.86} x2={x + 0.86} y2={y + 0.14} stroke={fill} strokeWidth={0.42} />
          <line x1={x + 0.24} y1={y + 0.64} x2={x + 0.62} y2={y + 0.26} stroke="#fff" strokeWidth={0.08} opacity={0.35} />
        </g>
      );
    case 'quilt':
      return (
        <g>
          <rect x={x + 0.03} y={y + 0.03} width={0.94} height={0.94} fill={fill} />
          <rect
            x={x + 0.16}
            y={y + 0.16}
            width={0.68}
            height={0.68}
            fill="none"
            stroke={shade(fill, 0.55)}
            strokeWidth={0.05}
            strokeDasharray="0.1 0.07"
          />
        </g>
      );
  }
}

export function Logo({ size = 64 }: { size?: number }) {
  const petals = useMemo(() => {
    const c = 8;
    return selburosePetals(16).map((list, i) => {
      // pull each petal a little way out from the centre, along its own direction
      const mx = list.reduce((a, [x]) => a + x + 0.5, 0) / list.length - c;
      const my = list.reduce((a, [, y]) => a + y + 0.5, 0) / list.length - c;
      const len = Math.hypot(mx, my) || 1;
      const push = 0.55;
      return {
        cells: list,
        fill: HERO_COLOURS[i % HERO_COLOURS.length],
        ...CRAFTS[i % CRAFTS.length],
        dx: (mx / len) * push,
        dy: (my / len) * push,
      };
    });
  }, []);
  return (
    <svg className="home-logo" width={size} height={size} viewBox="-0.8 -0.8 17.6 17.6" role="img" aria-label="Chromattice">
      {petals.map((p) => (
        <g key={p.craft} transform={`translate(${p.dx} ${p.dy})`}>
          <title>{p.label}</title>
          {p.craft === 'quilt' ? (
            <QuiltPiece cells={p.cells} fill={p.fill} />
          ) : (
            p.cells.map(([x, y]) => <Cell key={`${x},${y}`} x={x} y={y} fill={p.fill} craft={p.craft} />)
          )}
        </g>
      ))}
    </svg>
  );
}

/** A woven-looking band of stepped triangles under the header. */
export function Zigzag() {
  return (
    <svg className="home-zigzag" height="18" width="100%" aria-hidden="true">
      <defs>
        <pattern id="sw-zig" width="24" height="18" patternUnits="userSpaceOnUse">
          <rect width="24" height="18" fill={SW.cream} />
          <path d="M0 18V12h4V8h4V4h4V0h0v4h4v4h4v4h4v6Z" fill={SW.turquoise} />
          <path d="M8 18v-4h4v-4h0v4h4v4Z" fill={SW.terracotta} />
        </pattern>
      </defs>
      <rect width="100%" height="18" fill="url(#sw-zig)" />
    </svg>
  );
}


// ---- the pixel-art scenery ----------------------------------------------------

const SKY = ['#f7c77e', '#f0a869', '#e58a4e', '#d0693a', '#c2562f', '#a4442f', '#8f3a33'];
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * A sunset over mesas, as a tiny image of cols × rows square pixels, to be
 * scaled up with crisp edges: the sky in dithered bands, a pixel sun with a
 * dithered glow, and stepped mesas with their tops catching the light.
 */
function drawScene(cols: number, rows: number, opts: { sun: boolean; mesas: boolean }): string {
  const cv = document.createElement('canvas');
  cv.width = cols;
  cv.height = rows;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(cols, rows);
  const put = (x: number, y: number, hex: string) => {
    const [r, g, b] = rgb(hex);
    const i = (y * cols + x) * 4;
    img.data.set([r, g, b, 255], i);
  };
  // the sun off to the right, clear of the title
  const sun = { x: cols * 0.88, y: rows * 0.46, r: rows * 0.24 };
  // mesa heights per column: flat tops, sides stepping down a cell at a time
  const mesas = [
    [0.02, 0.16, 0.19],
    [0.3, 0.37, 0.11],
    [0.52, 0.66, 0.2],
    [0.76, 0.84, 0.13],
    [0.93, 1.05, 0.17],
  ].map(([a, b, h]) => [a * cols, b * cols, Math.max(2, Math.round(h * rows))]);
  const ground = opts.mesas ? Math.max(1, Math.round(rows * 0.08)) : 0;
  const heights = Array.from({ length: cols }, (_, x) =>
    opts.mesas
      ? Math.max(ground, ...mesas.map(([a, b, h]) => h - Math.max(0, Math.ceil(Math.max(a - x - 0.5, x + 0.5 - b)) * 2)))
      : 0,
  );
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const t = (y / Math.max(1, rows - 1)) * (SKY.length - 1);
      const i = Math.floor(t);
      const threshold = (BAYER[y % 4][x % 4] + 0.5) / 16;
      let colour = SKY[Math.min(SKY.length - 1, i + (t - i > threshold ? 1 : 0))];
      if (opts.sun) {
        const d = Math.hypot(x + 0.5 - sun.x, (y + 0.5 - sun.y) * 1);
        if (d < sun.r) colour = d < sun.r - 1.2 ? '#fde7b0' : '#fbd88f';
        else if (d < sun.r + 3 && threshold < 0.55 * (1 - (d - sun.r) / 3)) colour = '#f8cf87';
      }
      const h = heights[x];
      if (y >= rows - h) colour = y === rows - h && h > ground ? '#7a3d4c' : SW.plum;
      put(x, y, colour);
    }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}

const scenes = new Map<string, string>();
/** The scene as a CSS background: drawn once per size, scaled with crisp pixels. */
export function pixelScene(cols: number, rows: number, opts: { sun: boolean; mesas: boolean }) {
  const key = `${cols}x${rows}:${opts.sun}:${opts.mesas}`;
  let url = scenes.get(key);
  if (url === undefined) {
    url = drawScene(cols, rows, opts);
    scenes.set(key, url);
  }
  return { backgroundImage: url ? `url(${url})` : undefined };
}
