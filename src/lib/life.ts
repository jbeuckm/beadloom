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

// ---------------------------------------------------------------------------
// Rule catalogue. A curated set of well-studied cellular automata with a
// plain-language note on what each one does. "Class" is Wolfram's four-way
// split of CA behaviour: 1 dies out, 2 freezes into blocks, 3 stays random,
// 4 makes moving structures that interact (the interesting middle ground).

export type RuleKind = '2d' | '1d';

export interface RuleDef {
  id: string;
  name: string;
  kind: RuleKind;
  /** "B3/S23" for 2-D life-like rules; a Wolfram code "0".."255" for 1-D. */
  code: string;
  klass: 1 | 2 | 3 | 4;
  featured: boolean;
  blurb: string;
}

export const CLASS_NOTE: Record<1 | 2 | 3 | 4, string> = {
  1: 'Class 1 — everything settles to blank.',
  2: 'Class 2 — freezes into stable or blinking blocks.',
  3: 'Class 3 — stays random and noise-like; good for texture.',
  4: 'Class 4 — makes moving structures that interact; the interesting middle ground.',
};

export const RULE_CATALOG: RuleDef[] = [
  // — 1-D elementary automata (Wolfram). Painted as a tapestry: the top row is
  //   the seed, every row below is the next generation. —
  {
    id: 'w30',
    name: 'Rule 30',
    kind: '1d',
    code: '30',
    klass: 3,
    featured: true,
    blurb:
      'Wolfram’s favourite. From a single bead on the top row, every row below turns to noise — random enough that Mathematica shipped it as a random-number generator. One edge stays orderly while the other dissolves into chaos.',
  },
  {
    id: 'w110',
    name: 'Rule 110',
    kind: '1d',
    code: '110',
    klass: 4,
    featured: true,
    blurb:
      'A rule you can memorise that is nonetheless a universal computer: little gliders drift across a striped background and collide to carry information. "Complicated" and "complex" are not the same thing.',
  },
  {
    id: 'w90',
    name: 'Rule 90',
    kind: '1d',
    code: '90',
    klass: 3,
    featured: true,
    blurb:
      'Each cell is just the XOR of its two neighbours, and from one bead it draws a flawless Sierpiński triangle. The cleanest "simple rule, ornate result" there is.',
  },
  {
    id: 'w54',
    name: 'Rule 54',
    kind: '1d',
    code: '54',
    klass: 4,
    featured: false,
    blurb:
      'Small localised structures glide over a flickering background and bounce off one another — a 1-D cousin of Game-of-Life gliders.',
  },
  {
    id: 'w150',
    name: 'Rule 150',
    kind: '1d',
    code: '150',
    klass: 3,
    featured: false,
    blurb:
      'XOR of all three neighbours: nested triangular filigree, denser and busier than Rule 90.',
  },
  {
    id: 'w184',
    name: 'Rule 184',
    kind: '1d',
    code: '184',
    klass: 2,
    featured: false,
    blurb:
      'The traffic-jam rule: live beads march one step to the right each row and pile up behind each other. Actually used to model road flow.',
  },

  // — 2-D life-like rules (born / survives on a neighbour count) —
  {
    id: 'conway',
    name: 'Conway’s Life',
    kind: '2d',
    code: 'B3/S23',
    klass: 4,
    featured: true,
    blurb:
      'Born on exactly 3 neighbours, survives on 2 or 3. Those few words are enough for gliders, oscillators, and — with patience — a working computer. The textbook case of complexity out of almost nothing.',
  },
  {
    id: 'highlife',
    name: 'HighLife',
    kind: '2d',
    code: 'B36/S23',
    klass: 4,
    featured: true,
    blurb:
      'Conway’s rule with one extra birth case. That tiny change is just enough to add a small pattern that builds copies of itself.',
  },
  {
    id: 'daynight',
    name: 'Day & Night',
    kind: '2d',
    code: 'B3678/S34678',
    klass: 4,
    featured: true,
    blurb:
      'Perfectly symmetric: swap every bead and empty cell and the motion is unchanged. Big stable islands, spaceships, and elaborate borders.',
  },
  {
    id: 'seeds',
    name: 'Seeds',
    kind: '2d',
    code: 'B2/S',
    klass: 3,
    featured: true,
    blurb:
      'Nothing ever survives a step. Every bead you place immediately detonates into a spreading spray — striking, and utterly unstable.',
  },
  {
    id: 'replicator',
    name: 'Replicator',
    kind: '2d',
    code: 'B1357/S1357',
    klass: 3,
    featured: true,
    blurb:
      'Fredkin’s rule: whatever you draw is copied outward again and again into a growing kaleidoscope of itself.',
  },
  {
    id: 'lwod',
    name: 'Life without Death',
    kind: '2d',
    code: 'B3/S012345678',
    klass: 4,
    featured: false,
    blurb:
      'Beads are born but never die. Patterns creep outward like frost on glass, and can still route signals along "ladders".',
  },
  {
    id: 'maze',
    name: 'Maze',
    kind: '2d',
    code: 'B3/S12345',
    klass: 2,
    featured: false,
    blurb: 'Freezes into a tangle of twisty little corridors — a ready-made maze.',
  },
  {
    id: 'mazectric',
    name: 'Mazectric',
    kind: '2d',
    code: 'B3/S1234',
    klass: 2,
    featured: false,
    blurb: 'Maze with a shorter fuse: longer, straighter hallways.',
  },
  {
    id: 'diamoeba',
    name: 'Diamoeba',
    kind: '2d',
    code: 'B35678/S5678',
    klass: 3,
    featured: false,
    blurb: 'Solid diamond-shaped blobs with restless, crystalline edges.',
  },
  {
    id: 'anneal',
    name: 'Anneal',
    kind: '2d',
    code: 'B4678/S35678',
    klass: 2,
    featured: false,
    blurb:
      'A majority vote: patches merge and their boundaries pull tight like surface tension. Good for smoothing a rough shape.',
  },
  {
    id: 'coral',
    name: 'Coral',
    kind: '2d',
    code: 'B3/S45678',
    klass: 2,
    featured: false,
    blurb: 'Slow encrusting growth with a rough, branching fractal edge.',
  },
  {
    id: 'gnarl',
    name: 'Gnarl',
    kind: '2d',
    code: 'B1/S1',
    klass: 3,
    featured: false,
    blurb: 'A single bead erupts into an ever-growing woven filigree.',
  },
];

// --- 1-D elementary cellular automata -------------------------------------

/** A Wolfram rule number 0..255, or null if the text isn't one. */
export function parseWolframCode(s: string): number | null {
  const n = Number(String(s).trim());
  return Number.isInteger(n) && n >= 0 && n <= 255 ? n : null;
}

/**
 * Return a copy of `data` with row `dst` filled by applying elementary rule
 * `code` to row `dst - 1`. Rows above are untouched, so stepping downward
 * paints a space-time tapestry. Returns `data` unchanged if `dst` is out of
 * range or the grid has no width.
 */
export function elementaryRow(
  data: number[][],
  code: number,
  dst: number,
  opts: { wrap: boolean; colorMode: 'vote' | 'active'; fixedColor: number },
): number[][] {
  const rows = data.length;
  const cols = data[0]?.length ?? 0;
  if (dst <= 0 || dst >= rows || cols === 0) return data;
  const out = data.map((row) => row.slice());
  const src = out[dst - 1];
  const cellAt = (c: number): number => {
    if (c >= 0 && c < cols) return src[c];
    return opts.wrap ? src[(c + cols) % cols] : EMPTY;
  };
  for (let c = 0; c < cols; c++) {
    const idx =
      (cellAt(c - 1) >= 0 ? 4 : 0) |
      (cellAt(c) >= 0 ? 2 : 0) |
      (cellAt(c + 1) >= 0 ? 1 : 0);
    if ((code >> idx) & 1) {
      const votes: number[] = [];
      for (const cc of [c - 1, c, c + 1]) {
        const v = cellAt(cc);
        if (v >= 0) votes.push(v);
      }
      out[dst][c] =
        opts.colorMode === 'vote' && votes.length
          ? mode(votes)
          : opts.fixedColor;
    } else {
      out[dst][c] = EMPTY;
    }
  }
  return out;
}
