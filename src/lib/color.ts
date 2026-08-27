// Perceptual nearest-colour matching (CIE-L*a*b*, ΔE76) for tracing a reference
// image onto the current palette.

import { hexToRgb } from '../util';

export type Lab = [number, number, number];

export function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (u: number) => {
    u /= 255;
    return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);

  let x = R * 0.4124 + G * 0.3576 + B * 0.1805;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  x /= 0.95047;
  z /= 1.08883;

  const f = (u: number) => (u > 0.008856 ? Math.cbrt(u) : 7.787 * u + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

export function paletteLabs(hexes: string[]): Lab[] {
  return hexes.map(hexToLab);
}

/** Index of the palette colour closest to the given RGB. */
export function nearestIndex(
  rgb: [number, number, number],
  labs: Lab[],
): number {
  const t = rgbToLab(rgb[0], rgb[1], rgb[2]);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < labs.length; i++) {
    const [l, a, b] = labs[i];
    const d = (t[0] - l) ** 2 + (t[1] - a) ** 2 + (t[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
