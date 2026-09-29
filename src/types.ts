// ---------------------------------------------------------------------------
// Core domain types + the custom design-file contract.
// See docs/FILE_FORMAT.md for the annotated specification.
// ---------------------------------------------------------------------------

export const APP_NAME = 'Grid Designer';
export const APP_VERSION = '1.0.0';

export const FORMAT_ID = 'beadloom-design' as const;
export const FORMAT_VERSION = 1 as const;
export const PALETTE_FORMAT_ID = 'beadloom-palette' as const;

/** Value stored in a grid cell that has no bead. */
export const EMPTY = -1;

/** Screen pixels per column width at zoom === 1. Column height = this * cellAspect. */
export const PX_PER_COL = 26;

/** A single colour in a palette. `code` is an optional bead product reference (e.g. Delica "DB-0723"). */
export interface BeadColor {
  id: string;
  name: string;
  hex: string; // "#RRGGBB", upper-case
  code?: string;
  /** Heathered yarn: the fibre colours and their share (summing to 1). The
   *  app draws a wool texture from it; `hex` stays the colour it reads as. */
  heather?: Array<[string, number]>;
}

export interface Palette {
  id: string;
  name: string;
  colors: BeadColor[]; // order matters: a cell value is an index into this array
  kind?: string; // what the colours are, e.g. "Bead colours", "Yarn colours"
}

export interface LoomSpec {
  stitch: 'loom';
  columns: number; // warp threads, left -> right
  rows: number; // bead rows, top -> bottom
  cellAspect: number; // cell height / cell width (0.8 = a bead 80% as tall as wide)
}

export interface DesignMeta {
  name: string;
  created: string; // ISO 8601
  modified: string; // ISO 8601
  app: string;
  notes?: string;
}

export interface CellData {
  encoding: 'rows-index'; // row-major; each value indexes palette.colors, or `empty`
  empty: -1;
  data: number[][]; // data[row][col]; row.length === loom.columns; data.length === loom.rows
}

/** A hand-painted plane of beads. */
export interface RasterLayer {
  id: string;
  kind: 'raster';
  name: string;
  visible: boolean;
  locked?: boolean; // no selecting or editing its contents
  data: number[][]; // rows × cols; palette index or EMPTY
}

/** A live, re-editable Selburose that renders as its own layer. */
export interface SelburoseLayer {
  id: string; // === star.id
  kind: 'selburose';
  name: string;
  visible: boolean;
  locked?: boolean; // no selecting or editing its contents
  star: SelburoseObject;
}

/**
 * A placed bitmap that renders as an overlay for tracing. Session-only — `src` is
 * an object URL, never serialised — and it never touches a bead until the user
 * flattens it into a raster layer.
 */
export interface ImageLayer {
  id: string;
  kind: 'image';
  name: string;
  visible: boolean;
  locked?: boolean; // no selecting or editing its contents
  src: string; // session object URL
  w: number; // natural pixel width
  h: number; // natural pixel height
  x: number; // centre, in grid column-units
  y: number; // centre, in grid column-units (row units scaled by cellAspect)
  scaleX: number; // grid column-units per image pixel, horizontal
  scaleY: number; // grid column-units per image pixel, vertical
  rotationDeg: number;
  skewXDeg: number;
  skewYDeg: number;
  opacity: number; // 0..1
  contrast: number; // -1..1, applied before sampling/tracing
  brightness: number; // -1..1
  warmth: number; // -1..1 (red ↔ blue balance)
  equalize: number; // 0..1 blend toward a histogram-equalised tonal range
  paletteMode: 'proposed' | 'current'; // trace against image-derived colours, or the current palette
  paletteColors: number; // N colours to lift from the image (proposed mode)
  coveredOnly: boolean; // flatten only the cells the image actually covers
}

/**
 * A live, re-editable straight line or rectangle placed on the loom as its own
 * layer. Like a Selburose it composites for display but never touches a bead
 * until the user flattens it into a raster layer.
 */
export interface ShapeObject {
  id: string;
  kind: 'line' | 'box' | 'poly';
  x0: number; // line endpoint / box corner cell coords (integers); unused for poly
  y0: number;
  x1: number;
  y1: number;
  points: Array<[number, number]>; // poly vertices (cell coords); empty for line/box
  closed: boolean; // poly: connect last vertex back to first (and allow fill)
  thickness: number; // bead width of a line / poly stroke / box outline (>= 1)
  fill: boolean; // box, or closed poly: solid vs outline
  colorIndex: number; // index into palette.colors
}

export interface ShapeLayer {
  id: string; // === shape.id
  kind: 'shape';
  name: string;
  visible: boolean;
  locked?: boolean; // no selecting or editing its contents
  shape: ShapeObject;
}

export type Layer = RasterLayer | SelburoseLayer | ImageLayer | ShapeLayer;

/**
 * A parametric eight-point star placed on the loom as a live, non-destructive
 * overlay. It is never written into `cells` until the user explicitly flattens it,
 * and it stays individually selectable and re-editable.
 */
export interface SelburoseObject {
  id: string;
  cx: number; // centre column (fractional)
  cy: number; // centre row (fractional)
  size: number; // tip radius, in columns
  rotationDeg: number; // 0 == "stands on two points"
  gap: number; // per-edge inset of each parallelogram, in beads (>= 0); apparent gap = 2×
  coverage: number; // 0..1 "aliasing" threshold: fraction of a cell that must be covered
  center: 'cell' | 'border'; // centred on a bead, or on the line between beads
  mode: 'fill' | 'outline';
  colorIndex: number; // index into palette.colors, frozen at placement time
}

export interface BeadDesign {
  format: typeof FORMAT_ID;
  version: number;
  meta: DesignMeta;
  loom: LoomSpec;
  palette: Palette; // every colour used by the design is specified here
  background: string; // "#RRGGBB" painted behind empty cells
  /** A palette index that fills every position no layer covers — a real bead
   *  colour (counted, printed, exported). Absent / null leaves them empty. */
  backgroundColor?: number | null;
  layers: Layer[]; // bottom → top; composited for display and export
}

export interface PaletteFile {
  format: typeof PALETTE_FORMAT_ID;
  version: number;
  palette: Palette;
}

export type ToolId =
  | 'pen'
  | 'eraser'
  | 'fill'
  | 'eyedropper'
  | 'line'
  | 'rect'
  | 'rectFill'
  | 'poly'
  | 'select'
  | 'pan'
  | 'wand'
  | 'reference';

/** The panels that dock to the right edge of the workspace, one at a time. */
export type RightPanelId =
  | 'reference'
  | 'selburose'
  | 'shape'
  | 'layers'
  | 'life';

/** Inclusive, normalised cell rectangle. */
export interface Rect {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

/** A rectangular block of cells lifted for copy / paste. */
export interface Stamp {
  w: number;
  h: number;
  data: number[][];
}

export interface Settings {
  pencilOnly: boolean; // ignore finger touches for painting (Apple Pencil palm rejection)
  showGrid: boolean;
  showRowNumbers: boolean;
  showUsage: boolean; // show per-colour bead counts in the palette
}

/** Everything an undo step needs to restore. */
export interface Snapshot {
  loom: LoomSpec;
  palette: Palette;
  background: string;
  backgroundColor: number | null;
  layers: Layer[];
  activeLayer: string;
  activeColor: number;
}
