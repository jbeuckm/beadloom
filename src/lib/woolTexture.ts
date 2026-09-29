// Wool texture for heathered yarn colours: a small tile of the base colour
// with soft heather mottling, fine fibres in the heather colours (by share)
// along the ply, and soft ply shading. Each tile is corrected so its average is
// exactly the colour's measured `hex`, so the texture adds realism without
// shifting the colour. Tiles are cached; a few variants break up repetition.

import type { BeadColor } from '../types';

type Heathered = Pick<BeadColor, 'hex' | 'heather'>;

export const TILE = 32; // px; one tile covers one grid cell on the canvas
export const VARIANTS = 3;

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const gam = (v: number) => {
  const c = Math.max(0, Math.min(1, v));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const key = (c: Heathered, v: number) =>
  `${c.hex}|${(c.heather ?? []).map(([h, w]) => h + w).join(',')}|${v}`;

const tiles = new Map<string, HTMLCanvasElement>();

/** The wool tile for a heathered colour (null for a plain colour). */
export function woolTile(c: Heathered, variant = 0): HTMLCanvasElement | null {
  if (!c.heather?.length || typeof document === 'undefined') return null;
  const k = key(c, variant);
  const hit = tiles.get(k);
  if (hit) return hit;

  const size = TILE;
  let seed = 0x9e3779b9 ^ (variant * 7919 + 1);
  for (const ch of c.hex) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mix = c.heather;
  const pick = () => {
    let r = rnd();
    for (const [h, w] of mix) if ((r -= w) <= 0) return h;
    return mix[mix.length - 1][0];
  };

  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const wrap = (fn: (ox: number, oy: number) => void) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy);
  };

  ctx.fillStyle = c.hex;
  ctx.fillRect(0, 0, size, size);
  // soft mottling: a few large, faint blobs of the heather colours
  for (let i = 0; i < 7; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = size * (0.15 + rnd() * 0.25);
    const col = pick();
    wrap((ox, oy) => {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, col + '66');
      g.addColorStop(1, col + '00');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  // fibres: fine strokes roughly along the ply
  ctx.lineCap = 'round';
  const n = Math.round(size * size * 0.9);
  for (let i = 0; i < n; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = 0.8 + rnd() * 2.6;
    const a = -Math.PI / 3 + (rnd() - 0.5) * 1.2;
    ctx.strokeStyle = pick();
    ctx.globalAlpha = 0.55 + rnd() * 0.45;
    ctx.lineWidth = 0.45 + rnd() * 0.6;
    wrap((ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  // ply shading: a few long, soft, darker strands along the twist, drawn
  // wrapped so the tile repeats seamlessly (gentler on pale wool)
  const [r0, g0, b0] = rgb(c.hex).map((v) => v / 255);
  const light = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = size * (0.35 + rnd() * 0.4);
    const a = -Math.PI / 3 + (rnd() - 0.5) * 0.4;
    ctx.globalAlpha = (0.03 + 0.08 * (1 - light)) * (0.6 + rnd() * 0.8);
    ctx.lineWidth = 1.5 + rnd() * 2;
    wrap((ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;

  // keep the tile's average exactly the measured colour
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const mean = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let ch = 0; ch < 3; ch++) mean[ch] += lin(d[i + ch]);
  const want = rgb(c.hex).map(lin);
  const gain = mean.map((m, ch) => (m > 0 ? want[ch] / (m / (d.length / 4)) : 1));
  for (let i = 0; i < d.length; i += 4)
    for (let ch = 0; ch < 3; ch++) d[i + ch] = gam(lin(d[i + ch]) * gain[ch]);
  ctx.putImageData(img, 0, 0);

  tiles.set(k, cv);
  return cv;
}

const urls = new Map<string, string>();
/** A data URL of the tile, for CSS swatches. */
export function woolDataUrl(c: Heathered): string | null {
  const t = woolTile(c, 0);
  if (!t) return null;
  const k = key(c, 0);
  let u = urls.get(k);
  if (!u) {
    u = t.toDataURL();
    urls.set(k, u);
  }
  return u;
}

/** Inline style for a swatch of this colour: flat, or wool-textured. */
export function swatchStyle(c: Heathered, tileCss = 28): {
  background: string;
  backgroundImage?: string;
  backgroundSize?: string;
} {
  const u = woolDataUrl(c);
  return u
    ? { background: c.hex, backgroundImage: `url(${u})`, backgroundSize: `${tileCss}px` }
    : { background: c.hex };
}

const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();
/** A canvas pattern of the tile for drawing cells (null for a plain colour). */
export function woolPattern(
  ctx: CanvasRenderingContext2D,
  c: Heathered,
  variant: number,
): CanvasPattern | null {
  const t = woolTile(c, variant);
  if (!t) return null;
  let m = patterns.get(ctx);
  if (!m) {
    m = new Map();
    patterns.set(ctx, m);
  }
  const k = key(c, variant);
  let p = m.get(k);
  if (!p) {
    p = ctx.createPattern(t, 'repeat')!;
    m.set(k, p);
  }
  return p;
}
