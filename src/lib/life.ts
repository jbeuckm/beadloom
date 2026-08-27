// Conway-style cellular automaton over the bead grid. A cell is "alive" when it
// holds any bead (value >= 0); "dead" is empty (-1). Newborn cells are coloured
// either with a fixed colour or by a vote of their live neighbours, so a run
// grows a coherent multi-colour pattern rather than a monochrome blob.

import { EMPTY } from '../types';

export interface LifeRule {
  birth: Set<number>; // neighbour counts that turn an empty cell on
  survive: Set<number>; // neighbour counts that keep a live cell on
}

/** Parse "B3/S23" (case-insensitive). Returns null if malformed. */
export function parseRule(input: string): LifeRule | null {
  const m = /^\s*b([0-8]*)\s*\/\s*s([0-8]*)\s*$/i.exec(input);
  if (!m) return null;
  return {
    birth: new Set([...m[1]].map(Number)),
    survive: new Set([...m[2]].map(Number)),
  };
}

export const CONWAY: LifeRule = { birth: new Set([3]), survive: new Set([2, 3]) };

function mode(values: number[]): number {
  const count = new Map<number, number>();
  let best = values[0] ?? 0;
  let bestN = 0;
  for (const v of values) {
    const n = (count.get(v) ?? 0) + 1;
    count.set(v, n);
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

export interface StepOptions {
  wrap: boolean; // toroidal edges
  /** Colour for a newborn cell: 'active' uses fixedColor, 'vote' uses neighbours. */
  colorMode: 'active' | 'vote';
  fixedColor: number;
}

export function lifeStep(
  data: number[][],
  rule: LifeRule,
  opts: StepOptions,
): number[][] {
  const rows = data.length;
  const cols = data[0]?.length ?? 0;
  const out = data.map((row) => row.slice());

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let live = 0;
      const votes: number[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          let rr = r + dr;
          let cc = c + dc;
          if (opts.wrap) {
            rr = (rr + rows) % rows;
            cc = (cc + cols) % cols;
          } else if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) {
            continue;
          }
          const v = data[rr][cc];
          if (v >= 0) {
            live++;
            votes.push(v);
          }
        }
      }
      const alive = data[r][c] >= 0;
      if (alive) {
        out[r][c] = rule.survive.has(live) ? data[r][c] : EMPTY;
      } else if (rule.birth.has(live)) {
        out[r][c] =
          opts.colorMode === 'vote' && votes.length ? mode(votes) : opts.fixedColor;
      } else {
        out[r][c] = EMPTY;
      }
    }
  }
  return out;
}

/** A fresh grid seeded with random live cells at the given density (0..1). */
export function randomSeed(
  cols: number,
  rows: number,
  density: number,
  color: number,
): number[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() < density ? color : EMPTY)),
  );
}

export function countLive(data: number[][]): number {
  let n = 0;
  for (const row of data) for (const v of row) if (v >= 0) n++;
  return n;
}
