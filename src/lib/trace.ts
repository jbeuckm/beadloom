// Map a placed image layer onto the grid: for each cell, sample the image under
// the cell centre and pick the nearest palette colour.

import type { ImageLayer } from '../types';
import { nearestIndex, type Lab } from './color';
import { lumaEqualizer, sampleImage } from './referenceImage';

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Equalize / contrast / brightness / warmth adjustment applied before palette
 * matching. Equalize shifts each pixel's luma toward its histogram-equalised
 * value for `adj.src`, spreading the image's tones across the full range.
 */
export function adjustRgb(
  [r, g, b]: [number, number, number],
  adj: {
    contrast: number;
    brightness: number;
    warmth: number;
    equalize?: number;
    src?: string;
  },
): [number, number, number] {
  const eq = adj.equalize || 0;
  const lut = eq > 0 && adj.src ? lumaEqualizer(adj.src) : null;
  if (lut) {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const shift = (lut[Math.round(y)] - y) * eq;
    r = clamp255(r + shift);
    g = clamp255(g + shift);
    b = clamp255(b + shift);
  }
  const cf = 1 + (adj.contrast || 0); // slope about mid-grey
  const add = (adj.brightness || 0) * 255;
  const w = (adj.warmth || 0) * 60;
  return [
    clamp255((r - 128) * cf + 128 + add + w),
    clamp255((g - 128) * cf + 128 + add),
    clamp255((b - 128) * cf + 128 + add - w),
  ];
}

/** grid column-units (both axes) → image pixel coords, inverting the placement. */
export function gridToImage(layer: ImageLayer) {
  const deg = Math.PI / 180;
  const th = layer.rotationDeg * deg;
  const cos = Math.cos(-th);
  const sin = Math.sin(-th);
  const b = Math.tan(layer.skewXDeg * deg);
  const c = Math.tan(layer.skewYDeg * deg);
  const det = 1 - b * c || 1;
  const sx = layer.scaleX || 1e-6;
  const sy = layer.scaleY || 1e-6;
  return (gx: number, gy: number) => {
    const dx = gx - layer.x;
    const dy = gy - layer.y;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    const ux = (rx - b * ry) / det;
    const uy = (-c * rx + ry) / det;
    return { ix: ux / sx + layer.w / 2, iy: uy / sy + layer.h / 2 };
  };
}

/**
 * Returns a new grid: `base` with every cell the image covers replaced by its
 * nearest palette colour. `layer.coveredOnly=false` also fills transparent regions.
 */
export function traceImageLayer(
  base: number[][],
  layer: ImageLayer,
  labs: Lab[],
  cols: number,
  rows: number,
  aspect: number,
): number[][] {
  if (!labs.length) return base;
  const inv = gridToImage(layer);
  const out = base.map((row) => row.slice());
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { ix, iy } = inv(c + 0.5, (r + 0.5) * aspect);
      const px = sampleImage(layer.src, ix, iy);
      if (!px || (layer.coveredOnly && px[3] < 8)) continue;
      out[r][c] = nearestIndex(adjustRgb([px[0], px[1], px[2]], layer), labs);
    }
  }
  return out;
}
