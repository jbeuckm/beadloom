import { EMPTY, type Rect, type Stamp } from '../types';

export const emptyGrid = (cols: number, rows: number): number[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => EMPTY));

/** Resize a grid, anchoring existing content to the top-left. */
export function resizeGrid(data: number[][], cols: number, rows: number): number[][] {
  const out = emptyGrid(cols, rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out[r][c] = data[r]?.[c] ?? EMPTY;
  return out;
}

/** 4-connected flood fill. Returns the same array reference if nothing changed. */
export function floodFill(
  data: number[][],
  c: number,
  r: number,
  replacement: number,
): number[][] {
  const rows = data.length;
  const cols = data[0]?.length ?? 0;
  if (r < 0 || c < 0 || r >= rows || c >= cols) return data;
  const target = data[r][c];
  if (target === replacement) return data;

  const out = data.map((row) => row.slice());
  const stack: Array<[number, number]> = [[c, r]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    if (out[y][x] !== target) continue;
    out[y][x] = replacement;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return out;
}

/** Bresenham line between two cells, inclusive of both endpoints. */
export function* linePoints(
  c0: number,
  r0: number,
  c1: number,
  r1: number,
): Generator<[number, number]> {
  const dx = Math.abs(c1 - c0);
  const dy = Math.abs(r1 - r0);
  const sx = c0 < c1 ? 1 : -1;
  const sy = r0 < r1 ? 1 : -1;
  let err = dx - dy;
  let x = c0;
  let y = r0;
  for (;;) {
    yield [x, y];
    if (x === c1 && y === r1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

export const normRect = (
  a: { c: number; r: number },
  b: { c: number; r: number },
): Rect => ({
  c0: Math.min(a.c, b.c),
  r0: Math.min(a.r, b.r),
  c1: Math.max(a.c, b.c),
  r1: Math.max(a.r, b.r),
});

export function readStamp(data: number[][], rect: Rect): Stamp {
  const w = rect.c1 - rect.c0 + 1;
  const h = rect.r1 - rect.r0 + 1;
  const out: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) row.push(data[rect.r0 + y]?.[rect.c0 + x] ?? EMPTY);
    out.push(row);
  }
  return { w, h, data: out };
}

export function colorUsage(data: number[][]): Map<number, number> {
  const m = new Map<number, number>();
  for (const row of data)
    for (const v of row) if (v >= 0) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

export function totalBeads(data: number[][]): number {
  let n = 0;
  for (const row of data) for (const v of row) if (v >= 0) n++;
  return n;
}
