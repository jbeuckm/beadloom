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
