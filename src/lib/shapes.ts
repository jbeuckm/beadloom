// Parametric "Selburose" generator.
//
// The star is built from eight identical parallelograms arranged radially, one
// every 45°. Each parallelogram has a fixed half-angle of 22.5°, so at rest the
// facing edges of neighbouring rays coincide and the union is a solid eight-point
// star. `gap` shrinks every parallelogram by a geometric inset of `gap` beads on
// each edge, so two rays that shared a border are each pulled back by `gap` and
// the apparent channel between them is `2·gap` beads wide (default 0.5 → 1 bead).
//
// Everything here works on a SQUARE cell grid — one column-width == one row-height.
// The cells it picks are addresses `(c, r)`; when the loom paints them at its 0.8
// aspect the star reads a little wider than tall, which is the intended look.

export interface SelburoseParams {
  cx: number; // centre column (fractional)
  cy: number; // centre row (fractional)
  outerR: number; // tip radius, in cells (same on both axes)
  rotationDeg: number; // slider value; 0 == "stands on two points"
  gap: number; // per-edge inset of each parallelogram, in beads (>= 0)
}

export const SELBUROSE_RAYS = 8;
const SELBUROSE_ROT0 = 22.5; // deg added so slider-0 stands on two points
const SELBUROSE_PHI = Math.PI / 8; // 22.5° — fixed half-angle (8 rays, shoulders touch)

/**
 * Snap a centre coordinate so the star sits either on a bead ("cell", a middle
 * bead exists) or on the line between two beads ("border", an even mirror axis).
 */
export function snapSelburoseCenter(v: number, mode: 'cell' | 'border'): number {
  return mode === 'border' ? Math.round(v) : Math.floor(v) + 0.5;
}

/** How far a parallelogram's inner/tip vertices move under a `gap`-bead inset. */
export function selburoseInsetShift(gap: number): number {
  const phi = SELBUROSE_PHI;
  return (Math.max(0, gap) / Math.sin(2 * phi)) * 2 * Math.cos(phi);
}

/** The eight parallelograms, each an array of 4 [x, y] vertices in grid units. */
export function selburoseParallelograms(
  p: SelburoseParams,
): Array<Array<[number, number]>> {
  const phi = SELBUROSE_PHI;
  const step = (2 * Math.PI) / SELBUROSE_RAYS;
  const rot = ((p.rotationDeg + SELBUROSE_ROT0) * Math.PI) / 180 - Math.PI / 2;

  // Keep the inset from collapsing a parallelogram to nothing.
  const dRaw = p.outerR / (2 * Math.cos(phi));
  const maxInset = 0.48 * dRaw * Math.sin(2 * phi);
  const inset = Math.min(Math.max(0, p.gap), maxInset);

  // k·(e1+e2) offsets a corner inward so each edge recedes by `inset`; γ = 2·phi.
  const k = inset / Math.sin(2 * phi);
  const shift = k * 2 * Math.cos(phi); // inward move of the inner + tip vertices
  const L = p.outerR + shift; // pre-inset length, so the inset tip lands at outerR
  const d = L / (2 * Math.cos(phi));

  const out: Array<Array<[number, number]>> = [];
  for (let i = 0; i < SELBUROSE_RAYS; i++) {
    const a = rot + i * step;
    const uh: [number, number] = [Math.cos(a - phi), Math.sin(a - phi)];
    const vh: [number, number] = [Math.cos(a + phi), Math.sin(a + phi)];
    // raw parallelogram in square space, inner vertex at the centre
    const v: Array<[number, number]> = [
      [0, 0],
      [d * uh[0], d * uh[1]],
      [L * Math.cos(a), L * Math.sin(a)],
      [d * vh[0], d * vh[1]],
    ];
    // inset each corner along its interior-bisector direction
    const bis: Array<[number, number]> = [
      [uh[0] + vh[0], uh[1] + vh[1]],
      [-uh[0] + vh[0], -uh[1] + vh[1]],
      [-uh[0] - vh[0], -uh[1] - vh[1]],
      [uh[0] - vh[0], uh[1] - vh[1]],
    ];
    out.push(
      v.map(([x, y], j) => [
        p.cx + x + k * bis[j][0],
        p.cy + y + k * bis[j][1],
      ]),
    );
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
  return mode === 'fill' ? filled : erodeOutline(filled, cols);
}

/** From a filled set, keep only cells that are missing a 4-neighbour. */
function erodeOutline(
  filled: Array<[number, number]>,
  cols: number,
): Array<[number, number]> {
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

/**
 * Cells covered by the Selburose, clipped to the grid. A cell fills when the
 * fraction of it covered by the shape (estimated with a 4×4 supersample) reaches
 * `coverage` — the "aliasing" threshold, 0..1.
 */
export function selburoseCells(
  p: SelburoseParams,
  cols: number,
  rows: number,
  mode: 'fill' | 'outline',
  coverage: number,
): Array<[number, number]> {
  const quads = selburoseParallelograms(p);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of quads)
    for (const [x, y] of q) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  const c0 = Math.max(0, Math.floor(minX));
  const c1 = Math.min(cols - 1, Math.ceil(maxX));
  const r0 = Math.max(0, Math.floor(minY));
  const r1 = Math.min(rows - 1, Math.ceil(maxY));

  const SS = 4;
  const thr = Math.min(1, Math.max(0.02, coverage));
  const filled: Array<[number, number]> = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        const py = r + (sy + 0.5) / SS;
        for (let sx = 0; sx < SS; sx++) {
          const px = c + (sx + 0.5) / SS;
          if (quads.some((q) => pointInPolygon(px, py, q))) hit++;
        }
      }
      if (hit / (SS * SS) >= thr) filled.push([c, r]);
    }
  }
  return mode === 'fill' ? filled : erodeOutline(filled, cols);
}

// ---------------------------------------------------------------------------
// Line / box shape layers — a straight run of beads or a rectangle, kept live
// and re-editable until the user flattens it.

export interface ShapeGeom {
  kind: 'line' | 'box' | 'poly';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  points: Array<[number, number]>;
  closed: boolean;
  thickness: number;
  fill: boolean;
}

/** Integer cell addresses along a Bresenham line from (x0,y0) to (x1,y1). */
function linePixels(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x, y]);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** Stamp a round brush of the given bead width around each spine cell. */
function thicken(
  spine: Array<[number, number]>,
  thickness: number,
): Array<[number, number]> {
  const t = Math.max(1, Math.round(thickness));
  if (t <= 1) return spine;
  const rad = (t - 1) / 2;
  const R = Math.ceil(rad);
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  for (const [c, r] of spine) {
    for (let dr = -R; dr <= R; dr++) {
      for (let dc = -R; dc <= R; dc++) {
        if (Math.hypot(dc, dr) > rad + 0.5) continue;
        const key = `${c + dc},${r + dr}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([c + dc, r + dr]);
      }
    }
  }
  return out;
}

/** Cells a line / box / poly shape paints, clipped to the grid. */
export function shapeCells(
  g: ShapeGeom,
  cols: number,
  rows: number,
): Array<[number, number]> {
  let raw: Array<[number, number]>;
  if (g.kind === 'poly') {
    const pts = g.points;
    const spine: Array<[number, number]> = [];
    const n = pts.length;
    const segs = g.closed ? n : n - 1;
    for (let i = 0; i < Math.max(0, segs); i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      for (const p of linePixels(a[0], a[1], b[0], b[1])) spine.push(p);
    }
    if (n === 1) spine.push(pts[0]);
    raw = thicken(spine, g.thickness);
    if (g.closed && g.fill && n >= 3) {
      const poly = pts.map(([x, y]): [number, number] => [x + 0.5, y + 0.5]);
      for (const cell of rasterizePolygon(poly, cols, rows, 'fill')) raw.push(cell);
    }
  } else if (g.kind === 'line') {
    raw = thicken(linePixels(g.x0, g.y0, g.x1, g.y1), g.thickness);
  } else {
    const c0 = Math.min(g.x0, g.x1);
    const c1 = Math.max(g.x0, g.x1);
    const r0 = Math.min(g.y0, g.y1);
    const r1 = Math.max(g.y0, g.y1);
    raw = [];
    if (g.fill) {
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) raw.push([c, r]);
    } else {
      const t = Math.max(1, Math.round(g.thickness));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++)
          if (c - c0 < t || c1 - c < t || r - r0 < t || r1 - r < t)
            raw.push([c, r]);
    }
  }
  const seen = new Set<number>();
  const out: Array<[number, number]> = [];
  for (const [c, r] of raw) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
    const key = r * cols + c;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([c, r]);
  }
  return out;
}

/** Inclusive bounding box (grid units) of a shape, including line thickness. */
export function shapeGridBBox(g: ShapeGeom) {
  const pad =
    g.kind === 'box' ? 0 : Math.max(0, (g.thickness - 1) / 2);
  const xs = g.kind === 'poly' ? g.points.map((p) => p[0]) : [g.x0, g.x1];
  const ys = g.kind === 'poly' ? g.points.map((p) => p[1]) : [g.y0, g.y1];
  if (!xs.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return {
    minX: Math.min(...xs) - pad,
    minY: Math.min(...ys) - pad,
    maxX: Math.max(...xs) + pad + 1,
    maxY: Math.max(...ys) + pad + 1,
  };
}

/** A Selburose on an N×N grid (N even, so its axes fall between cells), its
 *  cells sorted into the eight petals: each to the petal covering most of it. */
export function selburosePetals(N: number): Array<Array<[number, number]>> {
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
