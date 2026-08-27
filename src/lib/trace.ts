// Map a placed image layer onto the grid: for each cell, sample the image under
// the cell centre and pick the nearest palette colour.

import type { ImageLayer } from '../types';
import { nearestIndex, type Lab } from './color';
import { sampleImage } from './referenceImage';

/** grid column-units (both axes) → image pixel coords, inverting the placement. */
export function gridToImage(layer: ImageLayer) {
  const deg = Math.PI / 180;
  const th = layer.rotationDeg * deg;
  const cos = Math.cos(-th);
  const sin = Math.sin(-th);
  const b = Math.tan(layer.skewXDeg * deg);
  const c = Math.tan(layer.skewYDeg * deg);
  const det = 1 - b * c || 1;
  const s = layer.scale || 1e-6;
  return (gx: number, gy: number) => {
    const dx = gx - layer.x;
    const dy = gy - layer.y;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    const ux = (rx - b * ry) / det;
    const uy = (-c * rx + ry) / det;
    return { ix: ux / s + layer.w / 2, iy: uy / s + layer.h / 2 };
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
      out[r][c] = nearestIndex([px[0], px[1], px[2]], labs);
    }
  }
  return out;
}
