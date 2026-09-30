// Original 8-bit designs in the spirit of 1980s Commodore 64 games — a dojo
// at dusk, a flying kick, paper lanterns, a loading screen, a high score —
// drawn in the C64's 16-colour palette. Each is a grid of palette indices
// (-1 for "leave to the background fill"); the demo script paints them into
// the app pixel by pixel. None copies a game's actual sprites.

// The C64's palette (the widely used "Pepto" measurement).
export const C64 = [
  ['Black', '#000000'],
  ['White', '#ffffff'],
  ['Red', '#68372b'],
  ['Cyan', '#70a4b2'],
  ['Purple', '#6f3d86'],
  ['Green', '#588d43'],
  ['Blue', '#352879'],
  ['Yellow', '#b8c76f'],
  ['Orange', '#6f4f25'],
  ['Brown', '#433900'],
  ['Light red', '#9a6759'],
  ['Dark grey', '#444444'],
  ['Grey', '#6c6c6c'],
  ['Light green', '#9ad284'],
  ['Light blue', '#6c5eb5'],
  ['Light grey', '#959595'],
];
const [K, W, R, C, P, G, B, Y, O, N, LR, DG, M, LG, LB, LL] = C64.map((_, i) => i);

function canvas(cols, rows) {
  const g = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const set = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < cols && y < rows) g[y][x] = c;
  };
  return {
    g,
    set,
    rect(x0, y0, w, h, c) {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c);
    },
    disc(cx, cy, r, c) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++)
        for (let x = Math.floor(cx - r); x <= cx + r; x++)
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) set(x, y, c);
    },
    /** Rows of characters, each char a colour from `key` (others skipped). */
    stamp(x0, y0, rows, key) {
      rows.forEach((row, dy) =>
        [...row].forEach((ch, dx) => {
          if (ch in key) set(x0 + dx, y0 + dy, key[ch]);
        }),
      );
    },
  };
}

// a 3×5 pixel font, enough for the words below
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  G: ['###', '#..', '#.#', '#.#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '###'],
  L: ['#..', '#..', '#..', '#..', '###'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  '.': ['...', '...', '...', '...', '.#.'],
  ' ': ['...', '...', '...', '...', '...'],
};
function text(cv, x, y, s, c) {
  for (const ch of s) {
    cv.stamp(x, y, FONT[ch] ?? FONT[' '], { '#': c });
    x += 4;
  }
}

/** A dojo at dusk: sky in raster-bar bands, a pagoda, a low moon. */
function dojoAtDusk() {
  const cv = canvas(32, 32);
  const bands = [B, B, B, P, P, P, P, LR, LR, LR, LR, O, O, O, Y, Y, Y, Y, O, O];
  bands.forEach((c, y) => cv.rect(0, y, 32, 1, c)); // sky (Box+ in the app)
  cv.disc(24.5, 7.5, 3.4, LL); // moon
  cv.disc(25.5, 6.5, 1.2, W);
  cv.rect(0, 20, 32, 12, DG); // ground
  cv.rect(0, 20, 32, 1, M);
  // the pagoda: three stepped roofs, eaves turned up
  const roof = (y, x0, w) => {
    cv.rect(x0, y, w, 1, K);
    cv.set(x0 - 1, y - 1, K);
    cv.set(x0 + w, y - 1, K);
    cv.rect(x0 + 1, y - 1, w - 2, 1, R);
  };
  cv.rect(15, 2, 2, 3, K); // spire
  roof(6, 11, 10);
  cv.rect(13, 7, 6, 3, N);
  cv.set(15, 8, Y);
  cv.set(16, 8, Y);
  roof(11, 9, 14);
  cv.rect(11, 12, 10, 3, N);
  cv.rect(13, 13, 2, 1, Y);
  cv.rect(17, 13, 2, 1, Y);
  roof(16, 7, 18);
  cv.rect(9, 17, 14, 5, N);
  cv.rect(14, 18, 4, 4, K); // door
  cv.rect(10, 18, 2, 2, Y);
  cv.rect(20, 18, 2, 2, Y);
  cv.rect(6, 22, 20, 1, K); // steps
  cv.rect(4, 23, 24, 1, M);
  return { name: 'Dojo at Dusk', cols: 32, rows: 32, bg: DG, g: cv.g };
}

/** A flying kick: an original figure, mid-air, against a big sun. */
function flyingKick() {
  const cv = canvas(32, 32);
  cv.disc(16, 15, 12, O); // sun
  cv.disc(16, 15, 9, Y);
  cv.rect(0, 27, 32, 5, N); // floor boards
  cv.rect(0, 27, 32, 1, O);
  for (let x = 3; x < 32; x += 7) cv.rect(x, 28, 1, 4, K);
  // the fighter, in black: one leg out straight, arms guarding
  cv.stamp(
    6,
    6,
    [
      '.......KKK..............',
      '......KKKKK.............',
      '......KKKK..............',
      '.......KK...............',
      '.....KKKKKK.............',
      '...KK.KKKKKK............',
      '..K...KKKKKKK...........',
      '.......KKKKKKKKKKKKKKKK.',
      '.......KKKKKKKKKKKKKKKKK',
      '........KKKK............',
      '.......KKKK.............',
      '......KKK...............',
      '.....KKK................',
      '....KKK.................',
      '...KK...................',
      '..KKK...................',
    ],
    { K },
  );
  cv.rect(11, 12, 5, 1, R); // a red belt
  return { name: 'Flying Kick', cols: 32, rows: 32, bg: LR, g: cv.g };
}

/** Paper lanterns on a starry night. */
function paperLanterns() {
  const cv = canvas(32, 32);
  for (const [x, y] of [[3, 3], [9, 1], [27, 4], [22, 2], [30, 12], [2, 17], [28, 22], [5, 27], [19, 29], [13, 5]])
    cv.set(x, y, W);
  const lantern = (cx, top, body, light) => {
    cv.rect(cx, 0, 1, top, K); // string
    cv.rect(cx - 2, top, 5, 1, K); // cap
    cv.disc(cx + 0.5, top + 6.5, 5.6, body);
    cv.disc(cx - 1, top + 5, 2, light); // glow
    for (const dy of [3, 6, 9]) cv.rect(cx - 4, top + dy, 9, 1, R === body ? N : K); // ribs
    cv.rect(cx - 2, top + 12, 5, 1, K); // base
    cv.rect(cx, top + 13, 1, 3, Y); // tassel
    cv.rect(cx - 1, top + 15, 3, 1, Y);
  };
  lantern(9, 6, R, LR);
  lantern(22, 11, O, Y);
  return { name: 'Paper Lanterns', cols: 32, rows: 32, bg: B, g: cv.g };
}

/** The screen everyone stared at: raster bars and LOADING. */
function loadingScreen() {
  const cv = canvas(32, 32);
  const bars = [LB, LB, B, C, C, LG, Y, O, LR, P, B, LB, C, W, LG, G, Y, Y, O, R, P, LB, B, C, LG, Y, LR, P, B, LB, C, LG];
  bars.forEach((c, y) => cv.rect(0, y, 32, 1, c));
  cv.rect(1, 10, 30, 11, K);
  cv.rect(1, 10, 30, 1, LB);
  cv.rect(1, 20, 30, 1, LB);
  text(cv, 3, 13, 'LOADING', LB);
  return { name: 'Loading', cols: 32, rows: 32, bg: LB, g: cv.g };
}

/** A high-score table, 1984. */
function highScore() {
  const cv = canvas(32, 32);
  text(cv, 1, 3, 'HI SCORE', Y);
  text(cv, 5, 11, '001984', W);
  cv.rect(3, 18, 26, 1, LB);
  text(cv, 3, 21, '1.', C);
  text(cv, 11, 21, 'DOJO', LG);
  // a little ship
  cv.stamp(13, 27, ['..W..', '.WCW.', 'WCCCW', 'R...R'], { W, C, R });
  return { name: 'High Score 1984', cols: 32, rows: 32, bg: K, g: cv.g };
}

export const DESIGNS = [dojoAtDusk(), flyingKick(), paperLanterns(), loadingScreen(), highScore()];

// preview in the terminal: node scripts/demo/art.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const chars = 'KWRCPGBYONrdmglL';
  for (const d of DESIGNS) {
    console.log(`\n${d.name} (${d.cols}×${d.rows}, background ${C64[d.bg][0]})`);
    for (const row of d.g) console.log(row.map((v) => (v < 0 ? '·' : chars[v])).join(''));
  }
}
