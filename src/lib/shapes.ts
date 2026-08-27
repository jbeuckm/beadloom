// Parametric star / rosette ("Selburose") generator.
//
// A star polygon with `points` lobes is built from 2·points vertices alternating
// between `outerR` and `innerR`. A low inner/outer ratio gives sharp, well-
// separated petals; a high ratio gives a rounded rosette. `aspect` pre-stretches
// the vertical axis so the shape reads as round on the loom (where each cell is
// only `aspect` as tall as it is wide).

export interface StarParams {
  cx: number; // centre, in grid columns
  cy: number; // centre, in grid rows
  points: number; // number of lobes (>= 3)
  outerR: number; // outer radius, in columns
  ratio: number; // innerR / outerR, 0..1
  rotationDeg: number;
  aspect: number; // loom cellAspect (cell height / width)
}

export function starVertices(p: StarParams): Array<[number, number]> {
  const n = Math.max(3, Math.round(p.points));
  const inner = p.outerR * Math.min(0.98, Math.max(0.02, p.ratio));
  const rot = (p.rotationDeg * Math.PI) / 180 - Math.PI / 2;
  const yScale = p.aspect > 0 ? 1 / p.aspect : 1;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? p.outerR : inner;
    const a = rot + (i * Math.PI) / n;
    out.push([p.cx + rad * Math.cos(a), p.cy + rad * Math.sin(a) * yScale]);
  }
  return out;
}

export function pointInPolygon(
  x: number,
  y: number,
  poly: Array<[number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Cells whose centre falls inside the polygon, clipped to the grid. */
export function rasterizePolygon(
  poly: Array<[number, number]>,
  cols: number,
  rows: number,
  mode: 'fill' | 'outline',
): Array<[number, number]> {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const c0 = Math.max(0, Math.floor(minX));
  const c1 = Math.min(cols - 1, Math.ceil(maxX));
  const r0 = Math.max(0, Math.floor(minY));
  const r1 = Math.min(rows - 1, Math.ceil(maxY));

  const filled: Array<[number, number]> = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (pointInPolygon(c + 0.5, r + 0.5, poly)) filled.push([c, r]);
    }
  }
  if (mode === 'fill') return filled;

  const key = (c: number, r: number) => r * cols + c;
  const set = new Set(filled.map(([c, r]) => key(c, r)));
  return filled.filter(
    ([c, r]) =>
      !(
        set.has(key(c + 1, r)) &&
        set.has(key(c - 1, r)) &&
        set.has(key(c, r + 1)) &&
        set.has(key(c, r - 1))
      ),
  );
}

export function starCells(
  p: StarParams,
  cols: number,
  rows: number,
  mode: 'fill' | 'outline',
): Array<[number, number]> {
  return rasterizePolygon(starVertices(p), cols, rows, mode);
}
