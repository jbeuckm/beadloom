// A small memoised cache for image-layer bead traces. An image layer keeps its
// transformed, palette-matched result visible in the composite while you work
// on other layers; only "Flatten to beads" bakes it into a raster layer.
//
// The trace always matches against the design's current palette so its cells
// are ordinary palette indices the rest of the stack understands. The Image
// panel's "proposed" palette is a while-editing preview only (see LoomCanvas).

import type { BeadDesign, ImageLayer } from '../types';
import { emptyGrid } from './grid';
import { paletteLabs } from './color';
import { traceImageLayer } from './trace';
import { bitmapReady, imageEpoch } from './referenceImage';

const cache = new Map<string, { key: string; grid: number[][] }>();

function signature(design: BeadDesign, l: ImageLayer): string {
  const { columns, rows, cellAspect } = design.loom;
  return [
    l.src,
    l.w,
    l.h,
    l.x,
    l.y,
    l.scaleX,
    l.scaleY,
    l.rotationDeg,
    l.skewXDeg,
    l.skewYDeg,
    l.contrast,
    l.brightness,
    l.warmth,
    l.coveredOnly ? 1 : 0,
    columns,
    rows,
    cellAspect,
    design.palette.colors.map((c) => c.hex).join(','),
    imageEpoch(),
  ].join('|');
}

/** The bead grid an image layer contributes, or null if it can't yet (bitmap
 *  still decoding, empty palette). Result is cached until its inputs change. */
export function imageLayerGrid(
  design: BeadDesign,
  l: ImageLayer,
): number[][] | null {
  if (!bitmapReady(l.src)) return null;
  const hexes = design.palette.colors.map((c) => c.hex);
  if (!hexes.length) return null;

  const key = signature(design, l);
  const hit = cache.get(l.id);
  if (hit && hit.key === key) return hit.grid;

  const { columns, rows, cellAspect } = design.loom;
  const grid = traceImageLayer(
    emptyGrid(columns, rows),
    l,
    paletteLabs(hexes),
    columns,
    rows,
    cellAspect,
  );
  cache.set(l.id, { key, grid });
  return grid;
}
