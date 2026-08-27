// ---------------------------------------------------------------------------
// Core domain types + the custom design-file contract.
// See docs/FILE_FORMAT.md for the annotated specification.
// ---------------------------------------------------------------------------

export const APP_NAME = 'BeadLoom Studio';
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
}

export interface Palette {
  id: string;
  name: string;
  colors: BeadColor[]; // order matters: a cell value is an index into this array
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

export interface BeadDesign {
  format: typeof FORMAT_ID;
  version: number;
  meta: DesignMeta;
  loom: LoomSpec;
  palette: Palette; // every colour used by the design is specified here
  background: string; // "#RRGGBB" painted behind empty cells
  cells: CellData;
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
  | 'select'
  | 'pan';

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
  data: number[][];
  activeColor: number;
}
