// ---------------------------------------------------------------------------
// The layer stack. A design is an ordered list of layers, bottom → top:
//   - raster layers   — hand-painted planes of bead indices
//   - selburose layers — live, re-editable parametric stars
//   - image layers    — placed bitmaps for tracing; contribute no beads until
//                       flattened, and are never serialised
// `compositeLayers` flattens the visible stack into the single grid that the
// canvas, the PNG exporter and the status bar all consume.
// ---------------------------------------------------------------------------

import {
  type BeadDesign,
  EMPTY,
  type Layer,
  type RasterLayer,
  type SelburoseLayer,
  type SelburoseObject,
  type ShapeLayer,
  type ShapeObject,
} from '../types';
import { emptyGrid } from './grid';
import { selburoseCells, shapeCells } from './shapes';
import { imageLayerGrid } from './imageTrace';
import { clamp, uid } from '../util';

export function emptyRasterLayer(
  name: string,
  cols: number,
  rows: number,
): RasterLayer {
  return { id: uid(), kind: 'raster', name, visible: true, data: emptyGrid(cols, rows) };
}

/** Cells a shape (line / box) layer paints, clipped to the grid. */
export function shapeLayerCells(
  shape: ShapeObject,
  cols: number,
  rows: number,
): Array<[number, number]> {
  return shapeCells(
    {
      kind: shape.kind,
      x0: shape.x0,
      y0: shape.y0,
      x1: shape.x1,
      y1: shape.y1,
      points: shape.points,
      closed: shape.closed,
      thickness: shape.thickness,
      fill: shape.fill,
    },
    cols,
    rows,
  );
}

/** Cells a Selburose layer paints, clipped to the grid. */
export function selburoseLayerCells(
  star: SelburoseObject,
  cols: number,
  rows: number,
): Array<[number, number]> {
  return selburoseCells(
    {
      cx: star.cx,
      cy: star.cy,
      outerR: star.size,
      rotationDeg: star.rotationDeg,
      gap: star.gap,
    },
    cols,
    rows,
    star.mode,
    star.coverage,
  );
}

/** Flatten every visible layer into one grid; higher non-empty cells win, and
 *  the design's background colour (if set) fills every position left empty. */
export function compositeLayers(design: BeadDesign): number[][] {
  const out = compositeRange(design, 0, design.layers.length - 1);
  const bg = design.backgroundColor;
  if (bg != null && bg >= 0 && bg < design.palette.colors.length)
    for (const row of out)
      for (let c = 0; c < row.length; c++) if (row[c] < 0) row[c] = bg;
  return out;
}

/**
 * Composite the layers at indices [from..to] inclusive into one grid.
 * `includeHidden` forces hidden layers in too (used when merging layers).
 */
export function compositeRange(
  design: BeadDesign,
  from: number,
  to: number,
  includeHidden = false,
): number[][] {
  const { columns: cols, rows } = design.loom;
  const nColors = design.palette.colors.length;
  const out = emptyGrid(cols, rows);
  for (let i = Math.max(0, from); i <= Math.min(design.layers.length - 1, to); i++) {
    const layer = design.layers[i];
    if (!layer.visible && !includeHidden) continue;
    if (layer.kind === 'image') {
      // A placed image shows its palette-matched trace live; it only becomes
      // real raster pixels when the user flattens it.
      const g = imageLayerGrid(design, layer);
      if (!g) continue;
      for (let r = 0; r < rows; r++) {
        const src = g[r];
        if (!src) continue;
        for (let c = 0; c < cols; c++) {
          const v = src[c];
          if (v >= 0 && v < nColors) out[r][c] = v;
        }
      }
      continue;
    }
    if (layer.kind === 'raster') {
      for (let r = 0; r < rows; r++) {
        const src = layer.data[r];
        if (!src) continue;
        for (let c = 0; c < cols; c++) {
          const v = src[c];
          if (v >= 0 && v < nColors) out[r][c] = v;
        }
      }
    } else if (layer.kind === 'shape') {
      const v = clamp(layer.shape.colorIndex, 0, Math.max(0, nColors - 1));
      for (const [c, r] of shapeLayerCells(layer.shape, cols, rows)) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) out[r][c] = v;
      }
    } else {
      const v = clamp(layer.star.colorIndex, 0, Math.max(0, nColors - 1));
      for (const [c, r] of selburoseLayerCells(layer.star, cols, rows)) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) out[r][c] = v;
      }
    }
  }
  return out;
}

/** Remap every palette index in the stack (raster cells + star colours). */
export function remapLayerColors(
  layers: Layer[],
  map: (i: number) => number,
): Layer[] {
  return layers.map((layer) => {
    if (layer.kind === 'raster')
      return {
        ...layer,
        data: layer.data.map((row) => row.map((v) => (v >= 0 ? map(v) : v))),
      };
    if (layer.kind === 'selburose')
      return {
        ...layer,
        star: { ...layer.star, colorIndex: map(layer.star.colorIndex) },
      };
    if (layer.kind === 'shape')
      return {
        ...layer,
        shape: { ...layer.shape, colorIndex: map(layer.shape.colorIndex) },
      };
    return layer; // image layers carry no palette indices
  });
}

const NAME_RE = {
  raster: /^Layer (\d+)$/,
  selburose: /^Selburose (\d+)$/,
  image: /^Image (\d+)$/,
  shape: /^Shape (\d+)$/,
} as const;
const NAME_LABEL = {
  raster: 'Layer',
  selburose: 'Selburose',
  image: 'Image',
  shape: 'Shape',
} as const;

export function nextLayerName(layers: Layer[], kind: Layer['kind']): string {
  const re = NAME_RE[kind];
  const label = NAME_LABEL[kind];
  let max = 0;
  for (const l of layers) {
    const m = l.name.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${label} ${max + 1}`;
}

export function isRaster(l: Layer): l is RasterLayer {
  return l.kind === 'raster';
}
export function isSelburose(l: Layer): l is SelburoseLayer {
  return l.kind === 'selburose';
}

export function rasterCount(layers: Layer[]): number {
  return layers.reduce((n, l) => n + (l.kind === 'raster' ? 1 : 0), 0);
}

/** The grid painting operations target: the active raster layer, or the first. */
export function activeRasterGrid(
  design: BeadDesign,
  activeLayer: string,
): number[][] {
  const l =
    design.layers.find((x) => x.id === activeLayer && x.kind === 'raster') ??
    design.layers.find((x) => x.kind === 'raster');
  return (l as RasterLayer).data;
}
