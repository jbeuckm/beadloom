// Colour quantisation — reduce a bag of sampled pixels to N representative
// colours, used to lift a palette straight off a reference image.

import { rgbToLab } from './color';

type RGB = [number, number, number];

function bounds(box: RGB[]) {
  const mn: RGB = [255, 255, 255];
  const mx: RGB = [0, 0, 0];
  for (const p of box) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < mn[k]) mn[k] = p[k];
      if (p[k] > mx[k]) mx[k] = p[k];
    }
  }
  return { mn, mx };
}

export function medianCut(samples: RGB[], count: number): RGB[] {
  const n = Math.max(1, Math.round(count));
  if (samples.length <= n) return samples.slice();

  let boxes: RGB[][] = [samples.slice()];
  while (boxes.length < n) {
    // split the box with the widest single-channel spread
    let target = -1;
    let widest = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const { mn, mx } = bounds(boxes[i]);
      const spread = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
      if (spread > widest) {
        widest = spread;
        target = i;
      }
    }
    if (target < 0) break;

    const box = boxes[target];
    const { mn, mx } = bounds(box);
    let ch = 0;
    let best = mx[0] - mn[0];
    if (mx[1] - mn[1] > best) {
      ch = 1;
      best = mx[1] - mn[1];
    }
    if (mx[2] - mn[2] > best) ch = 2;

    box.sort((a, b) => a[ch] - b[ch]);
    const mid = box.length >> 1;
    boxes.splice(target, 1, box.slice(0, mid), box.slice(mid));
  }

  return boxes
    .filter((b) => b.length)
    .map((b) => {
      const s = [0, 0, 0];
      for (const p of b) {
        s[0] += p[0];
        s[1] += p[1];
        s[2] += p[2];
      }
      return [
        Math.round(s[0] / b.length),
        Math.round(s[1] / b.length),
        Math.round(s[2] / b.length),
      ] as RGB;
    });
}

export function rgbToHex([r, g, b]: RGB): string {
  return (
    '#' +
    [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
  );
}

// ---------------------------------------------------------------------------
// Hue-aware palette extraction. Plain median-cut spends its budget on whichever
// flat region has the most pixels, so a big neutral background can crowd out the
// vivid accents a person actually notices. This bins pixels by perceptual hue,
// weights each pixel by chroma, guarantees every present hue a slot before any
// hue gets a second, and shares the leftover slots by sqrt(weight) so one
// dominant hue can't monopolise the palette.
// ---------------------------------------------------------------------------

const HUE_BINS = 12;
const NEUTRAL_CHROMA = 12; // Lab chroma below this counts as "grey"

function labOf(p: RGB) {
  const [L, a, b] = rgbToLab(p[0], p[1], p[2]);
  return { L, a, b, C: Math.hypot(a, b) };
}

/** ΔE76 between two RGB colours. */
function deltaE(x: RGB, y: RGB): number {
  const p = labOf(x);
  const q = labOf(y);
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

export function paletteFromImage(samples: RGB[], count: number): RGB[] {
  const n = Math.max(1, Math.min(32, Math.round(count)));
  if (samples.length <= n) return samples.slice();

  const bins: RGB[][] = Array.from({ length: HUE_BINS }, () => []);
  const binW = new Array(HUE_BINS).fill(0);
  const neutralPx: RGB[] = [];
  let neutralW = 0;
  let totalW = 0;

  for (const p of samples) {
    const { a, b, C } = labOf(p);
    const w = 0.12 + Math.pow(C / 70, 1.3); // chroma-boosted vote
    totalW += w;
    if (C < NEUTRAL_CHROMA) {
      neutralPx.push(p);
      neutralW += w;
      continue;
    }
    let h = Math.atan2(b, a);
    if (h < 0) h += Math.PI * 2;
    const bi = Math.min(HUE_BINS - 1, Math.floor((h / (Math.PI * 2)) * HUE_BINS));
    bins[bi].push(p);
    binW[bi] += w;
  }

  const populated = bins
    .map((px, i) => ({ i, px, w: binW[i] }))
    .filter((b) => b.px.length > 0)
    .sort((x, y) => y.w - x.w);

  if (!populated.length) return medianCut(samples, n); // wholly greyscale

  const alloc = new Array(HUE_BINS).fill(0);
  let remaining = n;
  let neutralSlots = 0;
  if (neutralPx.length && neutralW / totalW > 0.12 && remaining > 1) {
    neutralSlots = 1;
    remaining -= 1;
  }

  // round 1 — one slot per present hue, most apparent first
  for (const b of populated) {
    if (remaining <= 0) break;
    alloc[b.i] += 1;
    remaining -= 1;
  }

  // rounds 2+ — leftover slots by sqrt(weight), largest-remainder apportionment
  if (remaining > 0) {
    const share = populated.map((b) => Math.sqrt(Math.max(b.w, 1e-6)));
    const shareSum = share.reduce((s, v) => s + v, 0);
    const want = share.map((v) => (v / shareSum) * remaining);
    const base = want.map((v) => Math.floor(v));
    let left = remaining - base.reduce((s, v) => s + v, 0);
    want
      .map((v, k) => ({ k, frac: v - base[k] }))
      .sort((x, y) => y.frac - x.frac)
      .slice(0, Math.max(0, left))
      .forEach(({ k }) => (base[k] += 1));
    populated.forEach((b, k) => (alloc[b.i] += base[k]));
  }

  let out: RGB[] = [];
  for (let i = 0; i < HUE_BINS; i++) {
    if (alloc[i] > 0) out.push(...medianCut(bins[i], alloc[i]));
  }
  if (neutralSlots) out.push(...medianCut(neutralPx, neutralSlots));

  // drop near-duplicates, then back-fill from a plain cut of everything
  const merged: RGB[] = [];
  for (const c of out) {
    if (!merged.some((m) => deltaE(m, c) < 6)) merged.push(c);
  }
  out = merged;
  if (out.length < n) {
    for (const c of medianCut(samples, n + out.length)) {
      if (out.length >= n) break;
      if (!out.some((m) => deltaE(m, c) < 6)) out.push(c);
    }
  }
  while (out.length < n && out.length) out.push(out[out.length - 1]);
  out = out.slice(0, n);

  // tidy the strip: greys first (dark→light), then around the hue circle
  return out.sort((x, y) => {
    const p = labOf(x);
    const q = labOf(y);
    const hp = p.C < NEUTRAL_CHROMA ? -1 : Math.atan2(p.b, p.a);
    const hq = q.C < NEUTRAL_CHROMA ? -1 : Math.atan2(q.b, q.a);
    return hp !== hq ? hp - hq : p.L - q.L;
  });
}
