import type { CloudUser } from '../lib/cloud/backend';
import type { SyncInfo } from '../lib/cloud/sync';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import {
  APP_NAME,
  APP_VERSION,
  type BeadColor,
  type BeadDesign,
  EMPTY,
  FORMAT_ID,
  FORMAT_VERSION,
  type ImageLayer,
  type Layer,
  type Palette,
  PX_PER_COL,
  type RasterLayer,
  type Rect,
  type RightPanelId,
  type SelburoseLayer,
  type SelburoseObject,
  type ShapeLayer,
  type ShapeObject,
  type Settings,
  type Snapshot,
  type Stamp,
  type ToolId,
} from '../types';
import {
  compositeLayers,
  compositeRange,
  emptyRasterLayer,
  nextLayerName,
  rasterCount,
  remapLayerColors,
  selburoseLayerCells,
  shapeLayerCells,
} from '../lib/layers';
import { snapSelburoseCenter } from '../lib/shapes';
import { makeColor, makeRainbowPalette } from '../lib/palettes';
import { emptyGrid, floodFill, linePoints, readStamp, resizeGrid } from '../lib/grid';
import { paletteLabs } from '../lib/color';
import { adjustRgb, traceImageLayer } from '../lib/trace';
import { paletteFromImage, rgbToHex } from '../lib/quantize';
import { imageSamples, revokeImage, subscribeImages } from '../lib/referenceImage';
import {
  parseDesign,
  serializeDesign,
  validateDesign,
} from '../lib/designFormat';
import { clamp, normalizeHex, uid } from '../util';
import * as storage from '../lib/storage';

export type WandMode = 'new' | 'add' | 'subtract';

const HISTORY_LIMIT = 60;

/** Follow a palette renumbering; a background colour that's removed goes away. */
const remapBackground = (
  bg: number | null | undefined,
  remap: (v: number) => number,
): number | null => {
  if (bg == null) return null;
  const v = remap(bg);
  return v >= 0 ? v : null;
};
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 14;

// --------------------------------------------------------------------------

function freshDesign(opts?: {
  columns?: number;
  cellAspect?: number;
  rows?: number;
  name?: string;
  palette?: Palette;
}): BeadDesign {
  const columns = opts?.columns ?? 100;
  const rows = opts?.rows ?? 25;
  const now = new Date().toISOString();
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    meta: {
      name: opts?.name ?? 'Untitled Pattern',
      created: now,
      modified: now,
      app: `${APP_NAME} ${APP_VERSION}`,
    },
    loom: { stitch: 'loom', columns, rows, cellAspect: opts?.cellAspect ?? 0.8 },
    palette: opts?.palette ?? makeRainbowPalette(10),
    background: '#FFFFFF',
    layers: [emptyRasterLayer('Layer 1', columns, rows)],
  };
}

const firstRasterId = (d: BeadDesign): string =>
  (d.layers.find((l) => l.kind === 'raster') as RasterLayer).id;

const activeRasterIdx = (s: StoreState): number =>
  s.design.layers.findIndex(
    (l) => l.id === s.activeLayer && l.kind === 'raster',
  );

const activeRasterData = (s: StoreState): number[][] | null => {
  const i = activeRasterIdx(s);
  return i >= 0 ? (s.design.layers[i] as RasterLayer).data : null;
};

/** State patch that swaps a new grid into the active raster layer. */
const setActiveRaster = (s: StoreState, next: number[][]): Partial<StoreState> => {
  const i = activeRasterIdx(s);
  if (i < 0) return {};
  const cur = s.design.layers[i] as RasterLayer;
  if (next === cur.data || cur.locked) return {};
  const layers = s.design.layers.slice();
  layers[i] = { ...cur, data: next };
  return { design: { ...s.design, layers }, dirty: true };
};

const layerById = (s: StoreState, id: string | null | undefined) =>
  id ? s.design.layers.find((l) => l.id === id) : undefined;

/** True (after saying so) when `id` names a locked layer — callers bail out. */
const refuseLocked = (get: () => StoreState, id: string | null | undefined): boolean => {
  const s = get();
  const l = layerById(s, id);
  if (!l?.locked) return false;
  s.notify(`“${l.name}” is locked`);
  return true;
};

/** Refuse an edit to the active drawing layer when it's locked. */
const activeLocked = (get: () => StoreState): boolean => refuseLocked(get, get().activeLayer);

/** The selection's cells read out of `grid`, with unselected wand cells emptied. */
function maskedStamp(s: StoreState, grid: number[][]): Stamp {
  const stamp = readStamp(grid, s.selection!);
  const mask = s.selectionMask;
  if (mask) {
    const { c0, r0 } = s.selection!;
    const cols = s.design.loom.columns;
    for (let y = 0; y < stamp.h; y++)
      for (let x = 0; x < stamp.w; x++)
        if (!mask.has((r0 + y) * cols + (c0 + x))) stamp.data[y][x] = EMPTY;
  }
  return stamp;
}

/** The cells a selection covers — the wand mask if present, else the whole rect. */
const selectionCells = (s: StoreState): Array<[number, number]> => {
  const sel = s.selection;
  if (!sel) return [];
  const cols = s.design.loom.columns;
  const out: Array<[number, number]> = [];
  for (let r = sel.r0; r <= sel.r1; r++)
    for (let c = sel.c0; c <= sel.c1; c++)
      if (!s.selectionMask || s.selectionMask.has(r * cols + c)) out.push([c, r]);
  return out;
};

const findStar = (s: StoreState, id: string): SelburoseObject | undefined => {
  const l = s.design.layers.find((x) => x.kind === 'selburose' && x.id === id);
  return l && l.kind === 'selburose' ? l.star : undefined;
};

/** State patch that merges a patch into one selburose layer's star. */
const patchStar = (
  s: StoreState,
  id: string,
  patch: Partial<SelburoseObject>,
): Partial<StoreState> => ({
  design: {
    ...s.design,
    layers: s.design.layers.map((l) =>
      l.kind === 'selburose' && l.id === id
        ? { ...l, star: { ...l.star, ...patch, id: l.star.id } }
        : l,
    ),
  },
  dirty: true,
});

const findShape = (s: StoreState, id: string): ShapeObject | undefined => {
  const l = s.design.layers.find((x) => x.kind === 'shape' && x.id === id);
  return l && l.kind === 'shape' ? l.shape : undefined;
};

/** State patch that merges a patch into one shape layer's shape object. */
const patchShapeObj = (
  s: StoreState,
  id: string,
  patch: Partial<ShapeObject>,
): Partial<StoreState> => ({
  design: {
    ...s.design,
    layers: s.design.layers.map((l) =>
      l.kind === 'shape' && l.id === id
        ? { ...l, shape: { ...l.shape, ...patch, id: l.shape.id } }
        : l,
    ),
  },
  dirty: true,
});

// --------------------------------------------------------------------------

export interface StoreState {
  design: BeadDesign;
  designKey: string; // changes on new/open to let the canvas re-fit
  fitNonce: number; // bump to request a "fit to view"
  imageEpoch: number; // bumps when an image-layer bitmap decodes (trace refresh)
  activeLayer: string; // id of the active raster layer (paint target)
  activeColor: number; // index into design.palette.colors
  tool: ToolId;
  pasteMode: boolean;
  selection: Rect | null;
  selectionMask: Set<number> | null; // wand result: cell keys r*cols+c inside `selection`
  clipboard: Stamp | null;
  selectedSelburoseId: string | null;
  editingSelburose: string | null; // id of the star the Selburose panel edits
  selectedImageId: string | null;
  editingImage: string | null; // id of the image layer the Image panel edits
  selectedShapeId: string | null;
  editingShape: string | null; // id of the line/box the Shape panel edits
  lineThickness: number; // default bead width for new line / box-outline shapes
  brushSize: number; // pen / eraser radius in beads (1 = a single bead)
  rightPanel: RightPanelId | null; // the panel docked to the right edge
  showPrint: boolean; // the printable-sheet overlay is open
  workColumn: number | null; // the column being beaded: others wash out
  cursor: { c: number; r: number } | null;
  settings: Settings;
  view: { zoom: number; panX: number; panY: number };
  viewport: { w: number; h: number };
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  dirty: boolean;
  slotPath: string | null; // where the open design was last saved / opened from
  paletteSlotPath: string | null; // the saved palette the current one came from

  // history
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // tools & selection
  setTool: (t: ToolId) => void;
  setActiveColor: (i: number) => void;
  setPasteMode: (v: boolean) => void;
  setCursor: (c: { c: number; r: number } | null) => void;
  setSelection: (r: Rect | null) => void;
  selectAll: () => void;
  /** Magic wand: replace the selection, or add / subtract a region (Shift / Option). */
  selectWand: (c: number, r: number, mode?: WandMode) => void;
  wandMode: WandMode; // the wand's default when no modifier key is held
  setWandMode: (m: WandMode) => void;
  setWorkColumn: (c: number | null) => void;
  /** Step the working column by `d`, staying on the grid. */
  stepWorkColumn: (d: number) => void;
  setShowPrint: (v: boolean) => void;

  // painting — callers push history once at the start of a stroke
  paintCells: (cells: Array<[number, number]>, value: number) => void;
  paintLine: (c0: number, r0: number, c1: number, r1: number, value: number) => void;
  paintRect: (rect: Rect, value: number, filled: boolean) => void;
  bucketFill: (c: number, r: number) => void;
  pickAt: (c: number, r: number) => void;

  // bulk grid ops — history managed by caller
  replaceGrid: (data: number[][]) => void;
  setCells: (entries: Array<[number, number, number]>) => void;

  // Cellular automata — evolves the selection in place when one exists, otherwise a
  // dedicated full-grid layer created on the first write.
  lifeLayerId: string | null;
  lifeInput: () => number[][];
  lifeOutput: (next: number[][], withHistory: boolean) => void;
  lifeEnd: () => void;

  // image layers (self-managed history)
  addImageLayer: (
    p: Omit<ImageLayer, 'id' | 'kind' | 'name' | 'visible'>,
  ) => void;
  updateImageLayer: (id: string, patch: Partial<ImageLayer>) => void;
  selectImage: (id: string) => void;
  removeImageLayer: (id: string) => void;
  flattenImageLayer: (id: string) => void;

  // clipboard (self-managed history)
  starClipboard: SelburoseObject | null; // a copied selburose, ready to paste
  shapeClipboard: ShapeObject | null; // a copied line / box / polygon, ready to paste
  notice: { text: string; id: number } | null; // brief status message (copied…, nothing to paste)
  notify: (text: string) => void;

  // cloud accounts (lib/cloud): optional; absent when not configured
  cloudAvailable: boolean;
  cloudUser: CloudUser | null;
  cloudInfo: SyncInfo;
  libraryNonce: number; // bumped when a sync changes saved designs / palettes
  setCloudAvailable: (v: boolean) => void;
  setCloudUser: (u: CloudUser | null) => void;
  setCloudInfo: (i: SyncInfo) => void;
  bumpLibrary: () => void;
  /** ⌘V: drop a copied object straight away, or enter paste mode for cells. */
  paste: () => void;
  pasteShape: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  deleteSelection: () => void;
  pasteAt: (c: number, r: number) => void;
  pasteStar: () => void;
  // Move the selected selburose / image layer by a grid-unit delta. `coalesce`
  // skips the history checkpoint (for held-arrow auto-repeat).
  nudgeSelected: (dx: number, dy: number, coalesce: boolean) => void;

  // region transforms (self-managed history)
  flip: (axis: 'h' | 'v', scope: 'all' | 'selection') => void;
  rotate180: (scope: 'all' | 'selection') => void;
  // Translate the marquee/wand selection's pixels (and the selection itself) on
  // the active raster layer by a cell delta. `coalesce` skips the history push.
  moveSelection: (dx: number, dy: number, coalesce: boolean) => void;

  // layers (self-managed history)
  setActiveLayer: (id: string) => void;
  addLayer: () => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  mergeLayerDown: (id: string) => void;
  moveLayer: (id: string, dir: -1 | 1) => void;
  reorderLayers: (ordered: Layer[]) => void;
  renameLayer: (id: string, name: string) => void;
  toggleLayerVisible: (id: string) => void;
  /** Lock / unlock a layer: locked layers can't be selected or edited. */
  toggleLayerLocked: (id: string) => void;
  /** True (after saying so) when the active drawing layer is locked. */
  guardActiveEdit: () => boolean;

  // right-edge dock
  setRightPanel: (p: RightPanelId | null) => void;

  // selburose overlay objects
  addSelburose: () => void;
  openSelburoseEditor: (id: string) => void;
  closeSelburoseEditor: () => void;
  selectSelburose: (id: string | null) => void;
  moveSelburose: (id: string, cx: number, cy: number) => void;
  updateSelburose: (id: string, patch: Partial<SelburoseObject>) => void;
  transformSelburose: (id: string, kind: 'flipH' | 'flipV' | 'rot180') => void;
  recolorSelburose: (id: string, colorIndex: number) => void;
  removeSelburose: (id: string) => void;
  flattenSelburose: (id: string) => void;

  // line / box / poly shape overlay objects
  setLineThickness: (n: number) => void;
  setBrushSize: (n: number) => void;
  addShape: (p: Omit<ShapeObject, 'id'>) => void;
  openShapeEditor: (id: string) => void;
  closeShapeEditor: () => void;
  selectShape: (id: string | null) => void;
  moveShape: (id: string, dx: number, dy: number) => void;
  updateShape: (id: string, patch: Partial<ShapeObject>) => void;
  transformShape: (id: string, kind: 'flipH' | 'flipV' | 'rot180') => void;
  recolorShape: (id: string, colorIndex: number) => void;
  removeShape: (id: string) => void;
  flattenShape: (id: string) => void;
  // arbitrary-polygon point editing
  appendShapePoint: (id: string, pt: [number, number]) => void;
  moveShapePoint: (id: string, i: number, pt: [number, number]) => void;
  insertShapePoint: (id: string, i: number, pt: [number, number]) => void;
  removeShapePoint: (id: string, i: number) => void;

  // grid size — history managed by caller
  setColumns: (n: number) => void;
  setRows: (n: number) => void;
  setCellAspect: (a: number) => void;
  clearAll: () => void;
  fillAll: () => void;

  // meta / palette (self-managed history where it matters)
  setName: (s: string) => void;
  setNotes: (s: string) => void;
  setBackground: (hex: string) => void;
  /** Fill every empty position with a palette colour (null: leave them empty). */
  setBackgroundColor: (index: number | null) => void;
  setPaletteName: (s: string) => void;
  /** Append colours (e.g. picked from a maker library) as one undo step. */
  addColors: (
    colors: Array<{ name: string; hex: string; code?: string; heather?: Array<[string, number]> }>,
  ) => void;
  /** `heather: null` drops the wool texture (e.g. after a custom recolour). */
  updateColor: (
    id: string,
    patch: Partial<{ name: string; hex: string; code: string; heather: Array<[string, number]> | null }>,
  ) => void;
  removeColor: (id: string) => void;
  moveColor: (id: string, dir: -1 | 1) => void;
  reorderColors: (newColors: BeadColor[]) => void;
  applyPalette: (p: Palette) => void;
  resetPalette: () => void;

  // documents
  newDesign: (opts?: {
    columns?: number;
    rows?: number;
    name?: string;
    cellAspect?: number;
    keepPalette?: boolean;
  }) => void;
  loadDesignObject: (raw: unknown) => void;
  loadDesignText: (text: string) => void;
  exportJSON: () => string;
  saveToSlot: (name: string, folder?: string) => void;
  /** Save over the open design's file; false when it needs a Save As. */
  quickSave: () => boolean;
  /** Follow the open design's file after a library move / rename / trash. */
  remapSlot: (map: Map<string, string>) => void;
  setPaletteSlotPath: (path: string | null) => void;
  /** Follow the current palette's saved file after a library change. */
  remapPaletteSlot: (map: Map<string, string>) => void;
  loadFromSlot: (name: string) => void;

  // settings & view
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  setView: (v: Partial<{ zoom: number; panX: number; panY: number }>) => void;
  setViewport: (w: number, h: number) => void;
  zoomBy: (factor: number) => void;
  requestFit: () => void;
}

// --------------------------------------------------------------------------

const snap = (s: StoreState): Snapshot => ({
  loom: structuredClone(s.design.loom),
  palette: structuredClone(s.design.palette),
  background: s.design.background,
  backgroundColor: s.design.backgroundColor ?? null,
  layers: structuredClone(s.design.layers),
  activeLayer: s.activeLayer,
  activeColor: s.activeColor,
});

const applySnap = (s: StoreState, snp: Snapshot): Partial<StoreState> => {
  const layers = structuredClone(snp.layers);
  const activeLayer = layers.some(
    (l) => l.id === snp.activeLayer && l.kind === 'raster',
  )
    ? snp.activeLayer
    : ((layers.find((l) => l.kind === 'raster') as RasterLayer).id);
  return {
    design: {
      ...s.design,
      loom: structuredClone(snp.loom),
      palette: structuredClone(snp.palette),
      background: snp.background,
      backgroundColor: snp.backgroundColor,
      layers,
    },
    activeLayer,
    activeColor: clamp(snp.activeColor, 0, snp.palette.colors.length - 1),
    selection: null,
    selectionMask: null,
    selectedSelburoseId: null,
    editingSelburose: null,
    selectedImageId: null,
    editingImage: null,
    selectedShapeId: null,
    editingShape: null,
    dirty: true,
  };
};

// --------------------------------------------------------------------------

const initialDesign: BeadDesign = (() => {
  const j = storage.readAutosave();
  if (j) {
    try {
      return parseDesign(j);
    } catch {
      /* fall through */
    }
  }
  return freshDesign();
})();

const initialSettings: Settings = {
  pencilOnly: false,
  showGrid: true,
  showRowNumbers: true,
  showUsage: true,
  ...((storage.readSettings() as Partial<Settings> | null) ?? {}),
};

// --------------------------------------------------------------------------

export const useStore = create<StoreState>()(
  subscribeWithSelector((set, get) => ({
    design: initialDesign,
    designKey: uid(),
    fitNonce: 0,
    imageEpoch: 0,
    activeLayer: firstRasterId(initialDesign),
    activeColor: 0,
    tool: 'pen',
    pasteMode: false,
    selection: null,
    selectionMask: null,
    wandMode: 'new',
    lifeLayerId: null,
    clipboard: null,
    starClipboard: null,
    shapeClipboard: null,
    notice: null,
    selectedSelburoseId: null,
    editingSelburose: null,
    selectedImageId: null,
    editingImage: null,
    selectedShapeId: null,
    editingShape: null,
    lineThickness: 1,
    brushSize: 1,
    rightPanel: null,
    showPrint: false,
    workColumn: null,
    cursor: null,
    settings: initialSettings,
    view: { zoom: 1, panX: 0, panY: 0 },
    viewport: { w: 0, h: 0 },
    undoStack: [],
    redoStack: [],
    dirty: false,
    slotPath: null,
    paletteSlotPath: null,

    pushHistory: () =>
      set((s) => {
        const u = s.undoStack.concat(snap(s));
        if (u.length > HISTORY_LIMIT) u.shift();
        return { undoStack: u, redoStack: [] };
      }),

    undo: () =>
      set((s) => {
        if (!s.undoStack.length) return {};
        const u = s.undoStack.slice();
        const prev = u.pop()!;
        return {
          ...applySnap(s, prev),
          undoStack: u,
          redoStack: s.redoStack.concat(snap(s)),
        };
      }),

    redo: () =>
      set((s) => {
        if (!s.redoStack.length) return {};
        const r = s.redoStack.slice();
        const next = r.pop()!;
        return {
          ...applySnap(s, next),
          redoStack: r,
          undoStack: s.undoStack.concat(snap(s)),
        };
      }),

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    setTool: (t) =>
      set((s) => {
        // Switching to a drawing tool drops any object selection so the next
        // palette pick chooses a colour to draw with, not a recolour.
        if (t === 'select' || t === 'pan')
          return { tool: t, pasteMode: false };
        return {
          tool: t,
          pasteMode: false,
          selectedSelburoseId: null,
          selectedShapeId: null,
        };
      }),
    setActiveColor: (i) =>
      set((s) => ({
        activeColor: clamp(i, 0, s.design.palette.colors.length - 1),
      })),
    setPasteMode: (v) => set((s) => ({ pasteMode: v && !!s.clipboard })),
    setCursor: (c) => set({ cursor: c }),
    setSelection: (r) => set({ selection: r, selectionMask: null }),
    selectAll: () =>
      set((s) => ({
        tool: 'select',
        selectionMask: null,
        selection: {
          c0: 0,
          r0: 0,
          c1: s.design.loom.columns - 1,
          r1: s.design.loom.rows - 1,
        },
      })),

    setWandMode: (m) => set({ wandMode: m }),

    // Magic wand: flood a contiguous same-value region on the composited view,
    // then replace the selection with it, or add it / take it away.
    selectWand: (c, r, mode) =>
      set((s) => {
        const { columns: cols, rows } = s.design.loom;
        if (c < 0 || r < 0 || c >= cols || r >= rows) return {};
        const how = mode ?? s.wandMode;
        const grid = compositeLayers(s.design);
        const target = grid[r][c];
        const region = new Set<number>();
        const stack: Array<[number, number]> = [[c, r]];
        while (stack.length) {
          const [x, y] = stack.pop()!;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          const key = y * cols + x;
          if (region.has(key) || grid[y][x] !== target) continue;
          region.add(key);
          stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        // what's selected now, as cell keys (a marquee counts as its rect)
        const current = new Set<number>();
        if (how !== 'new' && s.selection)
          for (const [x, y] of selectionCells(s)) current.add(y * cols + x);
        let mask: Set<number>;
        if (how === 'add') {
          mask = current;
          for (const k of region) mask.add(k);
        } else if (how === 'subtract') {
          mask = current;
          for (const k of region) mask.delete(k);
        } else mask = region;

        if (!mask.size) return { tool: 'wand', selection: null, selectionMask: null };
        let c0 = cols;
        let c1 = -1;
        let r0 = rows;
        let r1 = -1;
        for (const k of mask) {
          const x = k % cols;
          const y = (k - x) / cols;
          if (x < c0) c0 = x;
          if (x > c1) c1 = x;
          if (y < r0) r0 = y;
          if (y > r1) r1 = y;
        }
        return { tool: 'wand', selection: { c0, r0, c1, r1 }, selectionMask: mask };
      }),

    setWorkColumn: (c) => set({ workColumn: c }),
    stepWorkColumn: (d) =>
      set((s) =>
        s.workColumn == null
          ? {}
          : { workColumn: clamp(s.workColumn + d, 0, s.design.loom.columns - 1) },
      ),
    setShowPrint: (v) => set({ showPrint: v }),

    paintCells: (cells, value) =>
      set((s) => {
        if (!cells.length) return {};
        const data = activeRasterData(s);
        if (!data) return {};
        const { columns, rows } = s.design.loom;
        const touched = new Map<number, number[]>();
        for (const [c, r] of cells) {
          if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
          let row = touched.get(r);
          if (!row) {
            row = data[r].slice();
            touched.set(r, row);
          }
          row[c] = value;
        }
        if (!touched.size) return {};
        const next = data.slice();
        for (const [r, row] of touched) next[r] = row;
        return setActiveRaster(s, next);
      }),

    paintLine: (c0, r0, c1, r1, value) =>
      activeLocked(get) ||
      get().paintCells([...linePoints(c0, r0, c1, r1)], value),

    paintRect: (rect, value, filled) => {
      if (activeLocked(get)) return;
      const pts: Array<[number, number]> = [];
      for (let y = rect.r0; y <= rect.r1; y++)
        for (let x = rect.c0; x <= rect.c1; x++)
          if (
            filled ||
            y === rect.r0 ||
            y === rect.r1 ||
            x === rect.c0 ||
            x === rect.c1
          )
            pts.push([x, y]);
      get().paintCells(pts, value);
    },

    bucketFill: (c, r) =>
      activeLocked(get) ||
      set((s) => {
        const data = activeRasterData(s);
        if (!data) return {};
        const next = floodFill(data, c, r, s.activeColor);
        return next === data ? {} : setActiveRaster(s, next);
      }),

    pickAt: (c, r) =>
      set((s) => {
        const v = activeRasterData(s)?.[r]?.[c] ?? -1;
        return v >= 0 ? { activeColor: v } : {};
      }),

    replaceGrid: (data) =>
      set((s) => {
        const { columns, rows } = s.design.loom;
        const fixed =
          data.length === rows && data.every((row) => row.length === columns)
            ? data
            : resizeGrid(data, columns, rows);
        return { ...setActiveRaster(s, fixed), selection: null };
      }),

    // ---- Cellular automata -------------------------------------------------
    // With a selection, the simulation runs inside its bounding box (mask cells
    // only are read/written) on the active layer. Without one, it runs on a
    // full-grid layer of its own, created lazily on the first write so opening
    // and closing the panel leaves nothing behind.
    lifeInput: () => {
      const s = get();
      const { columns, rows } = s.design.loom;
      const sel = s.selection;
      if (sel) {
        const base = activeRasterData(s) ?? emptyGrid(columns, rows);
        const out: number[][] = [];
        for (let r = sel.r0; r <= sel.r1; r++) {
          const row: number[] = [];
          for (let c = sel.c0; c <= sel.c1; c++) {
            const inMask =
              !s.selectionMask || s.selectionMask.has(r * columns + c);
            row.push(inMask ? base[r]?.[c] ?? EMPTY : EMPTY);
          }
          out.push(row);
        }
        return out;
      }
      const working = s.lifeLayerId
        ? (s.design.layers.find(
            (l) => l.id === s.lifeLayerId && l.kind === 'raster',
          ) as RasterLayer | undefined)
        : undefined;
      return working ? working.data : emptyGrid(columns, rows);
    },

    lifeOutput: (next, withHistory) => {
      if (withHistory) get().pushHistory();
      set((s) => {
        const { columns, rows } = s.design.loom;
        const sel = s.selection;
        if (sel) {
          const i = activeRasterIdx(s);
          if (i < 0) return {};
          const cur = (s.design.layers[i] as RasterLayer).data;
          const data = cur.map((row) => row.slice());
          for (let r = 0; r < next.length; r++) {
            const gr = sel.r0 + r;
            if (gr < 0 || gr >= rows) continue;
            for (let c = 0; c < next[r].length; c++) {
              const gc = sel.c0 + c;
              if (gc < 0 || gc >= columns) continue;
              if (s.selectionMask && !s.selectionMask.has(gr * columns + gc))
                continue;
              data[gr][gc] = next[r][c];
            }
          }
          const layers = s.design.layers.slice();
          layers[i] = { ...(s.design.layers[i] as RasterLayer), data };
          return { design: { ...s.design, layers }, dirty: true };
        }
        const fit =
          next.length === rows && next.every((row) => row.length === columns)
            ? next
            : resizeGrid(next, columns, rows);
        const layers = s.design.layers.slice();
        const idx = s.lifeLayerId
          ? layers.findIndex(
              (l) => l.id === s.lifeLayerId && l.kind === 'raster',
            )
          : -1;
        if (idx < 0) {
          const layer = emptyRasterLayer(
            nextLayerName(layers, 'raster'),
            columns,
            rows,
          );
          const at = activeRasterIdx(s);
          const insertAt = at < 0 ? layers.length : at + 1;
          layers.splice(insertAt, 0, { ...layer, data: fit });
          return {
            design: { ...s.design, layers },
            activeLayer: layer.id,
            lifeLayerId: layer.id,
            dirty: true,
          };
        }
        layers[idx] = { ...(layers[idx] as RasterLayer), data: fit };
        return { design: { ...s.design, layers }, dirty: true };
      });
    },

    lifeEnd: () => set({ lifeLayerId: null }),

    setCells: (entries) =>
      set((s) => {
        if (!entries.length) return {};
        const data = activeRasterData(s);
        if (!data) return {};
        const { columns, rows } = s.design.loom;
        const touched = new Map<number, number[]>();
        for (const [c, r, v] of entries) {
          if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
          let row = touched.get(r);
          if (!row) {
            row = data[r].slice();
            touched.set(r, row);
          }
          row[c] = v;
        }
        if (!touched.size) return {};
        const next = data.slice();
        for (const [r, row] of touched) next[r] = row;
        return setActiveRaster(s, next);
      }),

    // ---- image layers -------------------------------------------------
    addImageLayer: (p) => {
      get().pushHistory();
      set((s) => {
        const layer: ImageLayer = {
          ...p,
          id: uid(),
          kind: 'image',
          name: nextLayerName(s.design.layers, 'image'),
          visible: true,
        };
        return {
          design: { ...s.design, layers: s.design.layers.concat(layer) },
          selectedImageId: layer.id,
          editingImage: layer.id,
          rightPanel: 'reference',
          tool: 'reference',
          selection: null,
          selectionMask: null,
          selectedSelburoseId: null,
          editingSelburose: null,
          selectedShapeId: null,
          editingShape: null,
          dirty: true,
        };
      });
    },

    updateImageLayer: (id, patch) =>
      set((s) => ({
        design: {
          ...s.design,
          layers: s.design.layers.map((l) =>
            l.kind === 'image' && l.id === id
              ? { ...l, ...patch, id: l.id, kind: 'image' }
              : l,
          ),
        },
        dirty: true,
      })),

    selectImage: (id) =>
      refuseLocked(get, id) ||
      set((s) =>
        s.design.layers.some((l) => l.id === id && l.kind === 'image')
          ? {
              selectedImageId: id,
              editingImage: id,
              tool: 'reference',
              selection: null,
              selectionMask: null,
              selectedSelburoseId: null,
              editingSelburose: null,
              selectedShapeId: null,
              editingShape: null,
            }
          : {},
      ),

    removeImageLayer: (id) => get().removeLayer(id),

    flattenImageLayer: (id) => {
      const s0 = get();
      const idx = s0.design.layers.findIndex(
        (l) => l.kind === 'image' && l.id === id,
      );
      if (idx < 0) return;
      const layer = s0.design.layers[idx] as ImageLayer;

      // "proposed" mode: adopt the image-derived palette first, then trace
      // against it. "current" mode traces against the existing palette.
      if (layer.paletteMode === 'proposed') {
        const smp = imageSamples(layer.src).map((c) => adjustRgb(c, layer));
        const proposed = smp.length
          ? paletteFromImage(smp, layer.paletteColors)
          : [];
        if (proposed.length)
          get().applyPalette({
            id: uid(),
            name: 'From image',
            colors: proposed.map((rgb, i) => ({
              id: `img-${uid()}`,
              name: `Colour ${i + 1}`,
              hex: rgbToHex(rgb),
            })),
          });
      } else {
        get().pushHistory();
      }

      const s1 = get();
      const { columns, rows, cellAspect } = s1.design.loom;
      const labs = paletteLabs(s1.design.palette.colors.map((c) => c.hex));
      const data = traceImageLayer(
        emptyGrid(columns, rows),
        layer,
        labs,
        columns,
        rows,
        cellAspect,
      );
      set((s) => {
        const li = s.design.layers.findIndex((l) => l.id === id);
        if (li < 0) return {};
        const layers = s.design.layers.slice();
        layers[li] = {
          id: uid(),
          kind: 'raster',
          name: layer.name,
          visible: layer.visible,
          data,
        };
        return {
          design: { ...s.design, layers },
          selectedImageId: s.selectedImageId === id ? null : s.selectedImageId,
          editingImage: s.editingImage === id ? null : s.editingImage,
          dirty: true,
        };
      });
    },

    notify: (text) => set((s) => ({ notice: { text, id: (s.notice?.id ?? 0) + 1 } })),

    cloudAvailable: false,
    cloudUser: null,
    cloudInfo: { status: 'off', pending: 0 },
    libraryNonce: 0,
    setCloudAvailable: (v) => set({ cloudAvailable: v }),
    setCloudUser: (u) => set({ cloudUser: u }),
    setCloudInfo: (i) => set({ cloudInfo: i }),
    bumpLibrary: () => set((s) => ({ libraryNonce: s.libraryNonce + 1 })),

    // ⌘C copies what you see: every visible layer merged (not the background
    // fill, so empty cells stay transparent when pasted).
    copySelection: () => {
      const s = get();
      if (s.selectedSelburoseId) {
        const star = findStar(s, s.selectedSelburoseId);
        if (star) {
          set({ starClipboard: { ...star }, shapeClipboard: null, clipboard: null });
          s.notify('Copied star');
        }
        return;
      }
      if (s.selectedShapeId) {
        const sh = findShape(s, s.selectedShapeId);
        if (sh) {
          set({ shapeClipboard: structuredClone(sh), starClipboard: null, clipboard: null });
          s.notify(`Copied ${sh.kind === 'poly' ? 'polygon' : sh.kind}`);
        }
        return;
      }
      if (!s.selection) {
        s.notify('Select beads or an object to copy');
        return;
      }
      const merged = compositeRange(s.design, 0, s.design.layers.length - 1);
      const stamp = maskedStamp(s, merged);
      const n = stamp.data.flat().filter((v) => v >= 0).length;
      if (!n) {
        s.notify('Nothing to copy — the selection is empty');
        return;
      }
      set({ clipboard: stamp, starClipboard: null, shapeClipboard: null });
      s.notify(`Copied ${n} bead${n === 1 ? '' : 's'}`);
    },

    // ⌘X cuts from the active drawing layer — the only beads it can remove.
    cutSelection: () => {
      const s = get();
      if (s.selectedSelburoseId) {
        const star = findStar(s, s.selectedSelburoseId);
        if (!star) return;
        set({ starClipboard: { ...star }, shapeClipboard: null, clipboard: null });
        s.removeSelburose(s.selectedSelburoseId); // self-manages history
        s.notify('Cut star');
        return;
      }
      if (s.selectedShapeId) {
        const sh = findShape(s, s.selectedShapeId);
        if (!sh) return;
        set({ shapeClipboard: structuredClone(sh), starClipboard: null, clipboard: null });
        s.removeShape(s.selectedShapeId);
        s.notify(`Cut ${sh.kind === 'poly' ? 'polygon' : sh.kind}`);
        return;
      }
      if (!s.selection) {
        s.notify('Select beads or an object to cut');
        return;
      }
      if (activeLocked(get)) return;
      const stamp = maskedStamp(s, activeRasterData(s) ?? []);
      const n = stamp.data.flat().filter((v) => v >= 0).length;
      if (!n) {
        s.notify('Nothing to cut on this layer');
        return;
      }
      s.pushHistory();
      set({ clipboard: stamp, starClipboard: null, shapeClipboard: null });
      s.paintCells(selectionCells(s), EMPTY);
      s.notify(`Cut ${n} bead${n === 1 ? '' : 's'}`);
    },

    paste: () => {
      const s = get();
      if (s.starClipboard) s.pasteStar();
      else if (s.shapeClipboard) s.pasteShape();
      else if (s.clipboard) s.setPasteMode(true);
      else s.notify('Nothing to paste — copy something first');
    },

    // Drop a copy of the copied shape a little down-right of the original, on
    // its own layer, selected. Repeated pastes keep stepping along.
    pasteShape: () => {
      const s0 = get();
      const tmpl = s0.shapeClipboard;
      if (!tmpl) return;
      const { columns, rows } = s0.design.loom;
      const xs = tmpl.kind === 'poly' ? tmpl.points.map((p) => p[0]) : [tmpl.x0, tmpl.x1];
      const ys = tmpl.kind === 'poly' ? tmpl.points.map((p) => p[1]) : [tmpl.y0, tmpl.y1];
      // step 2 beads, but not off the grid
      const dx = clamp(2, -Math.min(...xs), columns - 1 - Math.max(...xs));
      const dy = clamp(2, -Math.min(...ys), rows - 1 - Math.max(...ys));
      const moved = {
        ...structuredClone(tmpl),
        x0: tmpl.x0 + dx,
        y0: tmpl.y0 + dy,
        x1: tmpl.x1 + dx,
        y1: tmpl.y1 + dy,
        points: tmpl.points.map(([x, y]) => [x + dx, y + dy] as [number, number]),
      };
      const { id: _id, ...rest } = moved;
      s0.addShape(rest);
      const placed = findShape(get(), get().selectedShapeId ?? '');
      set({
        tool: 'select',
        shapeClipboard: placed ? structuredClone(placed) : moved,
      });
    },

    deleteSelection: () => {
      if (activeLocked(get)) return;
      const s = get();
      if (!s.selection) return;
      s.pushHistory();
      s.paintCells(selectionCells(s), EMPTY);
    },

    moveSelection: (dx, dy, coalesce) => {
      if (activeLocked(get)) return;
      const s0 = get();
      const sel = s0.selection;
      const data = activeRasterData(s0);
      if (!sel || !data) return;
      const { columns, rows } = s0.design.loom;
      const mask = s0.selectionMask;
      // keep the selection rectangle inside the grid
      const cdx = Math.round(
        clamp(dx, -sel.c0, columns - 1 - sel.c1),
      );
      const cdy = Math.round(
        clamp(dy, -sel.r0, rows - 1 - sel.r1),
      );
      if (!cdx && !cdy) return;

      // lift the selected pixels, then re-stamp them shifted (opaque cells only,
      // so we don't punch holes over existing beads at the destination)
      const lifted: Array<[number, number, number]> = [];
      for (let r = sel.r0; r <= sel.r1; r++)
        for (let c = sel.c0; c <= sel.c1; c++) {
          if (mask && !mask.has(r * columns + c)) continue;
          const v = data[r]?.[c] ?? EMPTY;
          if (v >= 0) lifted.push([c, r, v]);
        }
      const next = data.map((row) => row.slice());
      for (let r = sel.r0; r <= sel.r1; r++)
        for (let c = sel.c0; c <= sel.c1; c++) {
          if (mask && !mask.has(r * columns + c)) continue;
          next[r][c] = EMPTY;
        }
      for (const [c, r, v] of lifted) next[r + cdy][c + cdx] = v;

      const nextMask = mask
        ? new Set(
            [...mask].map((k) => {
              const r = Math.floor(k / columns);
              const c = k - r * columns;
              return (r + cdy) * columns + (c + cdx);
            }),
          )
        : null;

      if (!coalesce) s0.pushHistory();
      set((s) => ({
        ...setActiveRaster(s, next),
        selection: {
          c0: sel.c0 + cdx,
          r0: sel.r0 + cdy,
          c1: sel.c1 + cdx,
          r1: sel.r1 + cdy,
        },
        selectionMask: nextMask,
      }));
    },

    pasteAt: (c, r) => {
      if (activeLocked(get)) return;
      const st = get().clipboard;
      if (!st) return;
      get().pushHistory();
      set((s) => {
        const data = activeRasterData(s);
        if (!data) return {};
        const { columns, rows } = s.design.loom;
        const next = data.slice();
        const touched = new Set<number>();
        for (let y = 0; y < st.h; y++) {
          const tr = r + y;
          if (tr < 0 || tr >= rows) continue;
          for (let x = 0; x < st.w; x++) {
            const v = st.data[y][x];
            if (v < 0) continue; // transparent stamp cell — keep what's there
            const tc = c + x;
            if (tc < 0 || tc >= columns) continue;
            if (!touched.has(tr)) {
              next[tr] = data[tr].slice();
              touched.add(tr);
            }
            next[tr][tc] = v;
          }
        }
        const sel: Rect = {
          c0: clamp(c, 0, columns - 1),
          r0: clamp(r, 0, rows - 1),
          c1: clamp(c + st.w - 1, 0, columns - 1),
          r1: clamp(r + st.h - 1, 0, rows - 1),
        };
        return { ...setActiveRaster(s, next), selection: sel, selectionMask: null };
      });
    },

    // Drop a copy of the copied selburose as a new layer, offset a little from
    // the source so repeated pastes cascade; select it and open its panel.
    pasteStar: () => {
      const s0 = get();
      const tmpl = s0.starClipboard;
      if (!tmpl) return;
      const { columns, rows } = s0.design.loom;
      const cx = snapSelburoseCenter(
        clamp(tmpl.cx + 1.5, 0, columns),
        tmpl.center,
      );
      const cy = snapSelburoseCenter(clamp(tmpl.cy + 1.5, 0, rows), tmpl.center);
      const star: SelburoseObject = { ...tmpl, id: uid(), cx, cy };
      s0.pushHistory();
      set((s) => {
        const layer: SelburoseLayer = {
          id: star.id,
          kind: 'selburose',
          name: nextLayerName(s.design.layers, 'selburose'),
          visible: true,
          star,
        };
        return {
          design: { ...s.design, layers: s.design.layers.concat(layer) },
          selectedSelburoseId: star.id,
          editingSelburose: star.id,
          rightPanel: 'selburose',
          tool: 'select',
          selection: null,
          selectionMask: null,
          selectedImageId: null,
          editingImage: null,
          selectedShapeId: null,
          editingShape: null,
          starClipboard: { ...star },
          dirty: true,
        };
      });
    },

    nudgeSelected: (dx, dy, coalesce) => {
      const s = get();
      if (s.selectedSelburoseId) {
        const star = findStar(s, s.selectedSelburoseId);
        if (!star) return;
        if (!coalesce) s.pushHistory();
        set((st) =>
          patchStar(st, s.selectedSelburoseId as string, {
            cx: snapSelburoseCenter(star.cx + dx, star.center),
            cy: snapSelburoseCenter(star.cy + dy, star.center),
          }),
        );
        return;
      }
      if (s.selectedImageId) {
        const l = s.design.layers.find(
          (x) => x.kind === 'image' && x.id === s.selectedImageId,
        );
        if (!l || l.kind !== 'image') return;
        if (!coalesce) s.pushHistory();
        get().updateImageLayer(s.selectedImageId, { x: l.x + dx, y: l.y + dy });
        return;
      }
      if (s.selectedShapeId) {
        if (!findShape(s, s.selectedShapeId)) return;
        if (!coalesce) s.pushHistory();
        get().moveShape(s.selectedShapeId, dx, dy);
      }
    },

    flip: (axis, scope) => {
      if (activeLocked(get)) return;
      get().pushHistory();
      set((s) => {
        const src = activeRasterData(s);
        if (!src) return {};
        const { columns, rows } = s.design.loom;
        const region: Rect =
          scope === 'selection' && s.selection
            ? s.selection
            : { c0: 0, r0: 0, c1: columns - 1, r1: rows - 1 };
        const out = src.map((row) => row.slice());
        const w = region.c1 - region.c0 + 1;
        const h = region.r1 - region.r0 + 1;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const sx = axis === 'h' ? w - 1 - x : x;
            const sy = axis === 'v' ? h - 1 - y : y;
            out[region.r0 + y][region.c0 + x] = src[region.r0 + sy][region.c0 + sx];
          }
        return setActiveRaster(s, out);
      });
    },

    rotate180: (scope) => {
      if (activeLocked(get)) return;
      get().pushHistory();
      set((s) => {
        const src = activeRasterData(s);
        if (!src) return {};
        const { columns, rows } = s.design.loom;
        const region: Rect =
          scope === 'selection' && s.selection
            ? s.selection
            : { c0: 0, r0: 0, c1: columns - 1, r1: rows - 1 };
        const out = src.map((row) => row.slice());
        const w = region.c1 - region.c0 + 1;
        const h = region.r1 - region.r0 + 1;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            out[region.r0 + y][region.c0 + x] =
              src[region.r0 + (h - 1 - y)][region.c0 + (w - 1 - x)];
        return setActiveRaster(s, out);
      });
    },

    // ---- layers ------------------------------------------------------------
    // Making a raster layer active clears any object/marquee selection that
    // belonged to other layers.
    setActiveLayer: (id) =>
      refuseLocked(get, id) ||
      set((s) =>
        s.design.layers.some((l) => l.id === id && l.kind === 'raster')
          ? {
              activeLayer: id,
              selection: null,
              selectionMask: null,
              selectedSelburoseId: null,
              editingSelburose: null,
              selectedImageId: null,
              editingImage: null,
              selectedShapeId: null,
              editingShape: null,
            }
          : {},
      ),

    addLayer: () => {
      get().pushHistory();
      set((s) => {
        const { columns, rows } = s.design.loom;
        const layer = emptyRasterLayer(
          nextLayerName(s.design.layers, 'raster'),
          columns,
          rows,
        );
        const at = activeRasterIdx(s);
        const layers = s.design.layers.slice();
        layers.splice(at < 0 ? layers.length : at + 1, 0, layer);
        return {
          design: { ...s.design, layers },
          activeLayer: layer.id,
          dirty: true,
        };
      });
    },

    removeLayer: (id) => {
      if (refuseLocked(get, id)) return;
      const s0 = get();
      const layer = s0.design.layers.find((l) => l.id === id);
      if (!layer) return;
      if (layer.kind === 'raster' && rasterCount(s0.design.layers) <= 1) return;
      if (
        layer.kind === 'image' &&
        !s0.design.layers.some(
          (l) => l !== layer && l.kind === 'image' && l.src === layer.src,
        )
      )
        revokeImage(layer.src);
      s0.pushHistory();
      set((s) => {
        const layers = s.design.layers.filter((l) => l.id !== id);
        const activeLayer =
          s.activeLayer === id
            ? (layers.find((l) => l.kind === 'raster') as RasterLayer).id
            : s.activeLayer;
        return {
          design: { ...s.design, layers },
          activeLayer,
          selectedSelburoseId:
            s.selectedSelburoseId === id ? null : s.selectedSelburoseId,
          editingSelburose:
            s.editingSelburose === id ? null : s.editingSelburose,
          selectedImageId: s.selectedImageId === id ? null : s.selectedImageId,
          editingImage: s.editingImage === id ? null : s.editingImage,
          selectedShapeId: s.selectedShapeId === id ? null : s.selectedShapeId,
          editingShape: s.editingShape === id ? null : s.editingShape,
          dirty: true,
        };
      });
    },

    duplicateLayer: (id) => {
      const s0 = get();
      const idx = s0.design.layers.findIndex((l) => l.id === id);
      if (idx < 0) return;
      const src = s0.design.layers[idx];
      const nid = uid();
      const base = { id: nid, name: `${src.name} copy`, visible: src.visible };
      let copy: Layer;
      if (src.kind === 'raster')
        copy = { ...base, kind: 'raster', data: src.data.map((r) => r.slice()) };
      else if (src.kind === 'selburose')
        copy = { ...base, kind: 'selburose', star: { ...src.star, id: nid } };
      else if (src.kind === 'shape')
        copy = {
          ...base,
          kind: 'shape',
          shape: {
            ...src.shape,
            id: nid,
            points: src.shape.points.map(
              (p): [number, number] => [p[0], p[1]],
            ),
          },
        };
      else copy = { ...src, ...base, kind: 'image' };
      s0.pushHistory();
      set((s) => {
        const layers = s.design.layers.slice();
        const at = s.design.layers.findIndex((l) => l.id === id);
        layers.splice((at < 0 ? layers.length - 1 : at) + 1, 0, copy);
        const patch: Partial<StoreState> = {
          design: { ...s.design, layers },
          dirty: true,
        };
        if (copy.kind === 'raster') patch.activeLayer = nid;
        else if (copy.kind === 'selburose') patch.selectedSelburoseId = nid;
        else if (copy.kind === 'shape') patch.selectedShapeId = nid;
        else patch.selectedImageId = nid;
        return patch;
      });
    },

    // Flatten a layer into the one directly below it, replacing both with a
    // single raster layer. Works for any pair of kinds.
    mergeLayerDown: (id) => {
      const s0 = get();
      const idx = s0.design.layers.findIndex((l) => l.id === id);
      if (idx <= 0) return; // nothing below to merge into
      const below = s0.design.layers[idx - 1];
      const top = s0.design.layers[idx];
      if (refuseLocked(get, top.id) || refuseLocked(get, below.id)) return;
      const merged = compositeRange(s0.design, idx - 1, idx);
      s0.pushHistory();
      const nid = uid();
      set((s) => {
        const at = s.design.layers.findIndex((l) => l.id === id);
        if (at <= 0) return {};
        const layers = s.design.layers.slice();
        layers.splice(at - 1, 2, {
          id: nid,
          kind: 'raster',
          name: below.name,
          visible: true,
          data: merged,
        });
        const gone = (v: string | null) =>
          v === id || v === below.id ? null : v;
        return {
          design: { ...s.design, layers },
          activeLayer:
            s.activeLayer === id || s.activeLayer === below.id
              ? nid
              : s.activeLayer,
          selectedSelburoseId: gone(s.selectedSelburoseId),
          editingSelburose: gone(s.editingSelburose),
          selectedImageId: gone(s.selectedImageId),
          editingImage: gone(s.editingImage),
          selectedShapeId: gone(s.selectedShapeId),
          editingShape: gone(s.editingShape),
          dirty: true,
        };
      });
      // release image bitmaps no longer referenced by any layer
      const layersNow = get().design.layers;
      for (const l of [below, top])
        if (
          l.kind === 'image' &&
          !layersNow.some((x) => x.kind === 'image' && x.src === l.src)
        )
          revokeImage(l.src);
    },

    moveLayer: (id, dir) => {
      get().pushHistory();
      set((s) => {
        const layers = s.design.layers.slice();
        const i = layers.findIndex((l) => l.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= layers.length) return {};
        [layers[i], layers[j]] = [layers[j], layers[i]];
        return { design: { ...s.design, layers }, dirty: true };
      });
    },

    reorderLayers: (ordered) => {
      get().pushHistory();
      set((s) => {
        // keep only layers that still exist, in the requested order
        const known = new Set(s.design.layers.map((l) => l.id));
        const layers = ordered.filter((l) => known.has(l.id));
        if (layers.length !== s.design.layers.length) return {};
        return { design: { ...s.design, layers }, dirty: true };
      });
    },

    renameLayer: (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      get().pushHistory();
      set((s) => ({
        design: {
          ...s.design,
          layers: s.design.layers.map((l) =>
            l.id === id ? { ...l, name: trimmed } : l,
          ),
        },
        dirty: true,
      }));
    },

    guardActiveEdit: () => activeLocked(get),

    toggleLayerLocked: (id) => {
      get().pushHistory();
      set((s) => {
        const layers = s.design.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l));
        const layer = layers.find((l) => l.id === id);
        if (!layer?.locked) return { design: { ...s.design, layers }, dirty: true };
        // locking: let go of it if it was selected / being edited…
        const patch: Partial<StoreState> = { design: { ...s.design, layers }, dirty: true };
        if (s.selectedShapeId === id) Object.assign(patch, { selectedShapeId: null, editingShape: null });
        if (s.selectedSelburoseId === id || s.editingSelburose === id)
          Object.assign(patch, { selectedSelburoseId: null, editingSelburose: null });
        if (s.selectedImageId === id || s.editingImage === id)
          Object.assign(patch, { selectedImageId: null, editingImage: null });
        // …and move painting to the nearest unlocked drawing layer, if any
        if (s.activeLayer === id) {
          const at = layers.findIndex((l) => l.id === id);
          const free = (i: number) => layers[i]?.kind === 'raster' && !layers[i].locked;
          for (let d = 1; d < layers.length; d++) {
            const i = [at - d, at + d].find(free);
            if (i !== undefined) {
              patch.activeLayer = layers[i].id;
              break;
            }
          }
        }
        return patch;
      });
    },

    toggleLayerVisible: (id) => {
      get().pushHistory();
      set((s) => ({
        design: {
          ...s.design,
          layers: s.design.layers.map((l) =>
            l.id === id ? { ...l, visible: !l.visible } : l,
          ),
        },
        dirty: true,
      }));
    },

    setRightPanel: (p) =>
      set((s) => ({
        rightPanel: p,
        editingSelburose: p === 'selburose' ? s.editingSelburose : null,
        editingImage: p === 'reference' ? s.editingImage : null,
        editingShape: p === 'shape' ? s.editingShape : null,
        lifeLayerId: p === 'life' ? s.lifeLayerId : null,
      })),

    // ---- selburose overlay objects -------------------------------------
    // Engaging the Selburose tool drops a fresh star at the centre of the view
    // and opens the panel targeting it. There is no separate "new" flow.
    addSelburose: () => {
      const s0 = get();
      const { columns: cols, rows, cellAspect: asp } = s0.design.loom;
      const maxH = Math.max(6, Math.round(Math.max(rows, cols) * 1.4));
      const h = Math.min(
        maxH,
        Math.max(4, Math.round(Math.min(rows, cols) * 0.6)),
      );
      const sc = PX_PER_COL * s0.view.zoom;
      let cx = cols / 2;
      let cy = rows / 2;
      if (s0.viewport.w > 0 && sc > 0) {
        cx = (s0.viewport.w / 2 - s0.view.panX) / sc;
        cy = (s0.viewport.h / 2 - s0.view.panY) / (sc * asp);
      }
      const star: SelburoseObject = {
        id: uid(),
        cx: snapSelburoseCenter(cx, 'cell'),
        cy: snapSelburoseCenter(cy, 'cell'),
        size: h / 2,
        rotationDeg: 0,
        gap: 0.5,
        coverage: 0.5,
        center: 'cell',
        mode: 'fill',
        colorIndex: s0.activeColor,
      };
      s0.pushHistory();
      set((s) => {
        const layer: SelburoseLayer = {
          id: star.id,
          kind: 'selburose',
          name: nextLayerName(s.design.layers, 'selburose'),
          visible: true,
          star,
        };
        return {
          design: { ...s.design, layers: s.design.layers.concat(layer) },
          selectedSelburoseId: star.id,
          editingSelburose: star.id,
          rightPanel: 'selburose',
          tool: 'select',
          selection: null,
          selectionMask: null,
          selectedImageId: null,
          editingImage: null,
          selectedShapeId: null,
          editingShape: null,
          dirty: true,
        };
      });
    },

    openSelburoseEditor: (id) =>
      refuseLocked(get, id) ||
      set({
        editingSelburose: id,
        rightPanel: 'selburose',
        selectedImageId: null,
        editingImage: null,
        selectedShapeId: null,
        editingShape: null,
      }),
    closeSelburoseEditor: () =>
      set((s) => ({
        editingSelburose: null,
        rightPanel: s.rightPanel === 'selburose' ? null : s.rightPanel,
      })),

    selectSelburose: (id) =>
      refuseLocked(get, id) ||
      set({
        selectedSelburoseId: id,
        selectedImageId: null,
        editingImage: null,
        selectedShapeId: null,
        editingShape: null,
        selection: null,
        selectionMask: null,
      }),

    moveSelburose: (id, cx, cy) => set((s) => patchStar(s, id, { cx, cy })),

    updateSelburose: (id, patch) => set((s) => patchStar(s, id, patch)),

    transformSelburose: (id, kind) => {
      const s0 = get();
      const star = findStar(s0, id);
      if (!star) return;
      const norm = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
      // The star has 8-fold dihedral symmetry: a mirror on either axis is the
      // same as negating its rotation, a 180° turn leaves it unchanged.
      const rotationDeg =
        kind === 'rot180'
          ? norm(star.rotationDeg + 180)
          : norm(-star.rotationDeg);
      s0.pushHistory();
      set((s) => patchStar(s, id, { rotationDeg }));
    },

    recolorSelburose: (id, colorIndex) => {
      const s0 = get();
      const star = findStar(s0, id);
      if (!star) return;
      const ci = clamp(colorIndex, 0, s0.design.palette.colors.length - 1);
      if (ci === star.colorIndex) return;
      s0.pushHistory();
      set((s) => patchStar(s, id, { colorIndex: ci }));
    },

    removeSelburose: (id) => get().removeLayer(id),

    flattenSelburose: (id) => {
      const s0 = get();
      const idx = s0.design.layers.findIndex(
        (l) => l.kind === 'selburose' && l.id === id,
      );
      if (idx < 0) return;
      const layer = s0.design.layers[idx] as SelburoseLayer;
      const { columns, rows } = s0.design.loom;
      const cells = selburoseLayerCells(layer.star, columns, rows);
      const value = clamp(
        layer.star.colorIndex,
        0,
        s0.design.palette.colors.length - 1,
      );
      const data = emptyGrid(columns, rows);
      for (const [c, r] of cells)
        if (r >= 0 && r < rows && c >= 0 && c < columns) data[r][c] = value;
      s0.pushHistory();
      set((s) => {
        const layers = s.design.layers.slice();
        layers[idx] = {
          id: uid(),
          kind: 'raster',
          name: layer.name,
          visible: layer.visible,
          data,
        };
        return {
          design: { ...s.design, layers },
          selectedSelburoseId:
            s.selectedSelburoseId === id ? null : s.selectedSelburoseId,
          editingSelburose:
            s.editingSelburose === id ? null : s.editingSelburose,
          dirty: true,
        };
      });
    },

    // ---- line / box shape overlay objects ---------------------------------
    // Drawing a line or box on the canvas drops one of these as its own layer;
    // it stays a live, re-editable vector until the user flattens it.
    setBrushSize: (n) => set({ brushSize: Math.max(1, Math.min(20, Math.round(n))) }),

    setLineThickness: (n) =>
      set((s) => {
        const t = Math.max(1, Math.min(40, Math.round(n)));
        const sh = s.selectedShapeId
          ? findShape(s, s.selectedShapeId)
          : undefined;
        if (sh) return { lineThickness: t, ...patchShapeObj(s, sh.id, { thickness: t }) };
        return { lineThickness: t };
      }),

    addShape: (p) => {
      const s0 = get();
      const shape: ShapeObject = { ...p, id: uid() };
      s0.pushHistory();
      set((s) => {
        const layer: ShapeLayer = {
          id: shape.id,
          kind: 'shape',
          name: nextLayerName(s.design.layers, 'shape'),
          visible: true,
          shape,
        };
        return {
          design: { ...s.design, layers: s.design.layers.concat(layer) },
          selectedShapeId: shape.id,
          editingShape: shape.id,
          rightPanel: 'shape',
          selection: null,
          selectionMask: null,
          selectedSelburoseId: null,
          editingSelburose: null,
          selectedImageId: null,
          editingImage: null,
          dirty: true,
        };
      });
    },

    openShapeEditor: (id) =>
      refuseLocked(get, id) ||
      set({
        editingShape: id,
        rightPanel: 'shape',
        selectedSelburoseId: null,
        editingSelburose: null,
        selectedImageId: null,
        editingImage: null,
      }),

    closeShapeEditor: () =>
      set((s) => ({
        editingShape: null,
        rightPanel: s.rightPanel === 'shape' ? null : s.rightPanel,
      })),

    selectShape: (id) =>
      refuseLocked(get, id) ||
      set({
        selectedShapeId: id,
        selectedSelburoseId: null,
        editingSelburose: null,
        selectedImageId: null,
        editingImage: null,
        selection: null,
        selectionMask: null,
      }),

    moveShape: (id, dx, dy) =>
      set((s) => {
        const sh = findShape(s, id);
        if (!sh) return {};
        const { columns, rows } = s.design.loom;
        const xs =
          sh.kind === 'poly' ? sh.points.map((p) => p[0]) : [sh.x0, sh.x1];
        const ys =
          sh.kind === 'poly' ? sh.points.map((p) => p[1]) : [sh.y0, sh.y1];
        const ddx = Math.round(
          clamp(dx, -Math.min(...xs), columns - 1 - Math.max(...xs)),
        );
        const ddy = Math.round(
          clamp(dy, -Math.min(...ys), rows - 1 - Math.max(...ys)),
        );
        if (!ddx && !ddy) return {};
        if (sh.kind === 'poly')
          return patchShapeObj(s, id, {
            points: sh.points.map((p): [number, number] => [
              p[0] + ddx,
              p[1] + ddy,
            ]),
          });
        return patchShapeObj(s, id, {
          x0: sh.x0 + ddx,
          y0: sh.y0 + ddy,
          x1: sh.x1 + ddx,
          y1: sh.y1 + ddy,
        });
      }),

    updateShape: (id, patch) => set((s) => patchShapeObj(s, id, patch)),

    transformShape: (id, kind) => {
      const s0 = get();
      const sh = findShape(s0, id);
      if (!sh) return;
      const { columns, rows } = s0.design.loom;
      const xs = sh.kind === 'poly' ? sh.points.map((p) => p[0]) : [sh.x0, sh.x1];
      const ys = sh.kind === 'poly' ? sh.points.map((p) => p[1]) : [sh.y0, sh.y1];
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const doX = kind !== 'flipV';
      const doY = kind !== 'flipH';
      const fx = (x: number) =>
        doX ? clamp(Math.round(2 * cx - x), 0, columns - 1) : x;
      const fy = (y: number) =>
        doY ? clamp(Math.round(2 * cy - y), 0, rows - 1) : y;
      s0.pushHistory();
      set((s) =>
        patchShapeObj(
          s,
          id,
          sh.kind === 'poly'
            ? { points: sh.points.map((p): [number, number] => [fx(p[0]), fy(p[1])]) }
            : {
                x0: fx(sh.x0),
                x1: fx(sh.x1),
                y0: fy(sh.y0),
                y1: fy(sh.y1),
              },
        ),
      );
    },

    appendShapePoint: (id, pt) => {
      const s0 = get();
      const sh = findShape(s0, id);
      if (!sh || sh.kind !== 'poly') return;
      s0.pushHistory();
      set((s) => patchShapeObj(s, id, { points: [...sh.points, pt] }));
    },

    moveShapePoint: (id, i, pt) =>
      set((s) => {
        const sh = findShape(s, id);
        if (!sh || sh.kind !== 'poly' || i < 0 || i >= sh.points.length)
          return {};
        const points = sh.points.slice();
        points[i] = pt;
        return patchShapeObj(s, id, { points });
      }),

    insertShapePoint: (id, i, pt) => {
      const s0 = get();
      const sh = findShape(s0, id);
      if (!sh || sh.kind !== 'poly') return;
      s0.pushHistory();
      set((s) => {
        const points = sh.points.slice();
        points.splice(clamp(i, 0, points.length), 0, pt);
        return patchShapeObj(s, id, { points });
      });
    },

    removeShapePoint: (id, i) => {
      const s0 = get();
      const sh = findShape(s0, id);
      if (!sh || sh.kind !== 'poly' || sh.points.length <= 2) return;
      s0.pushHistory();
      set((s) => {
        const points = sh.points.slice();
        points.splice(i, 1);
        return patchShapeObj(s, id, { points });
      });
    },

    recolorShape: (id, colorIndex) => {
      const s0 = get();
      const sh = findShape(s0, id);
      if (!sh) return;
      const ci = clamp(colorIndex, 0, s0.design.palette.colors.length - 1);
      if (ci === sh.colorIndex) return;
      s0.pushHistory();
      set((s) => patchShapeObj(s, id, { colorIndex: ci }));
    },

    removeShape: (id) => get().removeLayer(id),

    // Bake the vector into the nearest raster layer (below, else above, else
    // the active one) and drop the shape layer — "flatten into the drawing".
    flattenShape: (id) => {
      const s0 = get();
      const idx = s0.design.layers.findIndex(
        (l) => l.kind === 'shape' && l.id === id,
      );
      if (idx < 0) return;
      const layer = s0.design.layers[idx] as ShapeLayer;
      const { columns, rows } = s0.design.loom;
      const cells = shapeLayerCells(layer.shape, columns, rows);
      const value = clamp(
        layer.shape.colorIndex,
        0,
        s0.design.palette.colors.length - 1,
      );
      let targetId: string | null = null;
      const bakeable = (l: Layer) => l.kind === 'raster' && !l.locked;
      for (let i = idx - 1; i >= 0 && !targetId; i--)
        if (bakeable(s0.design.layers[i])) targetId = s0.design.layers[i].id;
      for (let i = idx + 1; i < s0.design.layers.length && !targetId; i++)
        if (bakeable(s0.design.layers[i])) targetId = s0.design.layers[i].id;
      if (!targetId) {
        s0.notify('Every drawing layer is locked');
        return;
      }
      s0.pushHistory();
      set((s) => {
        const withoutShape = s.design.layers.filter((l) => l.id !== id);
        const ti = withoutShape.findIndex((l) => l.id === targetId);
        let layers: Layer[];
        if (ti >= 0) {
          const src = (withoutShape[ti] as RasterLayer).data;
          const data = src.map((row) => row.slice());
          for (const [c, r] of cells)
            if (r >= 0 && r < rows && c >= 0 && c < columns) data[r][c] = value;
          layers = withoutShape.slice();
          layers[ti] = { ...(withoutShape[ti] as RasterLayer), data };
        } else {
          // nothing to merge into — leave a raster in the shape's place
          const data = emptyGrid(columns, rows);
          for (const [c, r] of cells)
            if (r >= 0 && r < rows && c >= 0 && c < columns) data[r][c] = value;
          layers = s.design.layers.map((l) =>
            l.id === id
              ? {
                  id: uid(),
                  kind: 'raster' as const,
                  name: layer.name,
                  visible: layer.visible,
                  data,
                }
              : l,
          );
        }
        return {
          design: { ...s.design, layers },
          selectedShapeId:
            s.selectedShapeId === id ? null : s.selectedShapeId,
          editingShape: s.editingShape === id ? null : s.editingShape,
          dirty: true,
        };
      });
    },

    setColumns: (n) =>
      set((s) => {
        const cols = clamp(Math.round(n), 1, 400);
        if (cols === s.design.loom.columns) return {};
        const rows = s.design.loom.rows;
        return {
          design: {
            ...s.design,
            loom: { ...s.design.loom, columns: cols },
            layers: s.design.layers.map((l) =>
              l.kind === 'raster'
                ? { ...l, data: resizeGrid(l.data, cols, rows) }
                : l,
            ),
          },
          selection: null,
          selectionMask: null,
          dirty: true,
        };
      }),

    setCellAspect: (a) =>
      set((s) => {
        const asp = clamp(Math.round(a * 100) / 100, 0.3, 3);
        const old = s.design.loom.cellAspect;
        if (asp === old) return {};
        // Image layers sit in column-units with rows scaled by the aspect; keep
        // each one anchored to the same row as the grid stretches.
        const k = asp / old;
        return {
          design: {
            ...s.design,
            loom: { ...s.design.loom, cellAspect: asp },
            layers: s.design.layers.map((l) =>
              l.kind === 'image' ? { ...l, y: l.y * k } : l,
            ),
          },
          fitNonce: s.fitNonce + 1,
          dirty: true,
        };
      }),

    setRows: (n) =>
      set((s) => {
        const rows = clamp(Math.round(n), 1, 1000);
        if (rows === s.design.loom.rows) return {};
        const cols = s.design.loom.columns;
        return {
          design: {
            ...s.design,
            loom: { ...s.design.loom, rows },
            layers: s.design.layers.map((l) =>
              l.kind === 'raster'
                ? { ...l, data: resizeGrid(l.data, cols, rows) }
                : l,
            ),
          },
          selection: null,
          selectionMask: null,
          dirty: true,
        };
      }),

    clearAll: () => {
      get().pushHistory();
      set((s) => {
        const { columns, rows } = s.design.loom;
        // locked layers stay exactly as they are
        const layers = s.design.layers
          .filter((l) => l.kind === 'raster' || l.locked)
          .map((l) =>
            l.kind === 'raster' && !l.locked ? { ...l, data: emptyGrid(columns, rows) } : l,
          );
        const activeLayer = layers.some((l) => l.id === s.activeLayer)
          ? s.activeLayer
          : layers[0].id;
        return {
          design: { ...s.design, layers },
          activeLayer,
          selectedSelburoseId: null,
          selection: null,
          selectionMask: null,
          dirty: true,
        };
      });
    },

    fillAll: () => {
      if (activeLocked(get)) return;
      get().pushHistory();
      set((s) => {
        const { columns, rows } = s.design.loom;
        const v = s.activeColor;
        return setActiveRaster(
          s,
          Array.from({ length: rows }, () =>
            Array.from({ length: columns }, () => v),
          ),
        );
      });
    },

    setName: (name) =>
      set((s) => ({ design: { ...s.design, meta: { ...s.design.meta, name } } })),
    setNotes: (notes) =>
      set((s) => ({ design: { ...s.design, meta: { ...s.design.meta, notes } } })),

    setBackgroundColor: (index) => {
      get().pushHistory();
      set((s) => ({
        design: {
          ...s.design,
          backgroundColor:
            index != null && index >= 0 && index < s.design.palette.colors.length ? index : null,
        },
        dirty: true,
      }));
    },

    setBackground: (hex) => {
      const h = normalizeHex(hex);
      if (!h) return;
      get().pushHistory();
      set((s) => ({ design: { ...s.design, background: h }, dirty: true }));
    },

    setPaletteName: (name) =>
      set((s) => ({
        design: { ...s.design, palette: { ...s.design.palette, name } },
      })),

    addColors: (colors) => {
      if (!colors.length) return;
      get().pushHistory();
      set((s) => {
        const added = colors.map((c) => ({
          ...makeColor(c.hex.toUpperCase(), c.name),
          ...(c.code ? { code: c.code } : {}),
          ...(c.heather ? { heather: c.heather } : {}),
        }));
        return {
          design: {
            ...s.design,
            palette: {
              ...s.design.palette,
              colors: s.design.palette.colors.concat(added),
            },
          },
          activeColor: s.design.palette.colors.length,
          dirty: true,
        };
      });
    },

    updateColor: (id, patch) => {
      get().pushHistory();
      set((s) => ({
        design: {
          ...s.design,
          palette: {
            ...s.design.palette,
            colors: s.design.palette.colors.map((c) => {
              if (c.id !== id) return c;
              const next = { ...c };
              if (patch.name != null) next.name = patch.name;
              if (patch.hex != null) {
                const h = normalizeHex(patch.hex);
                if (h) next.hex = h;
              }
              if (patch.code != null) next.code = patch.code || undefined;
              if (patch.heather === null) delete next.heather;
              else if (patch.heather) next.heather = patch.heather;
              return next;
            }),
          },
        },
        dirty: true,
      }));
    },

    removeColor: (id) => {
      const s0 = get();
      if (s0.design.palette.colors.length <= 1) return;
      s0.pushHistory();
      set((s) => {
        const idx = s.design.palette.colors.findIndex((c) => c.id === id);
        if (idx < 0) return {};
        const colors = s.design.palette.colors.filter((c) => c.id !== id);
        const remap = (v: number) =>
          v === idx ? EMPTY : v > idx ? v - 1 : v;
        const layers = remapLayerColors(s.design.layers, remap);
        const backgroundColor = remapBackground(s.design.backgroundColor, remap);
        const active =
          s.activeColor > idx
            ? s.activeColor - 1
            : s.activeColor === idx
              ? 0
              : s.activeColor;
        return {
          design: {
            ...s.design,
            palette: { ...s.design.palette, colors },
            layers,
            backgroundColor,
          },
          activeColor: clamp(active, 0, colors.length - 1),
          dirty: true,
        };
      });
    },

    moveColor: (id, dir) => {
      get().pushHistory();
      set((s) => {
        const cs = s.design.palette.colors.slice();
        const i = cs.findIndex((c) => c.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= cs.length) return {};
        [cs[i], cs[j]] = [cs[j], cs[i]];
        const remap = (v: number) =>
          v === i ? j : v === j ? i : v;
        const layers = remapLayerColors(s.design.layers, remap);
        const backgroundColor = remapBackground(s.design.backgroundColor, remap);
        const active = s.activeColor === i ? j : s.activeColor === j ? i : s.activeColor;
        return {
          design: {
            ...s.design,
            palette: { ...s.design.palette, colors: cs },
            layers,
            backgroundColor,
          },
          activeColor: active,
          dirty: true,
        };
      });
    },

    reorderColors: (newColors) => {
      get().pushHistory();
      set((s) => {
        const oldColors = s.design.palette.colors;
        // Build a mapping from old index to new index
        const indexMap = new Map<number, number>();
        oldColors.forEach((oc) => {
          const newIdx = newColors.findIndex((nc) => nc.id === oc.id);
          const oldIdx = oldColors.indexOf(oc);
          if (newIdx >= 0) indexMap.set(oldIdx, newIdx);
        });

        // Update cell + star indices
        const remap = (v: number) =>
          indexMap.has(v) ? indexMap.get(v)! : v;
        const layers = remapLayerColors(s.design.layers, remap);
        const backgroundColor = remapBackground(s.design.backgroundColor, remap);

        // Update active color index if needed
        const newActiveIdx = indexMap.get(s.activeColor) ?? s.activeColor;

        return {
          design: {
            ...s.design,
            palette: { ...s.design.palette, colors: newColors },
            layers,
            backgroundColor,
          },
          activeColor: newActiveIdx,
          dirty: true,
        };
      });
    },

    applyPalette: (p) => {
      get().pushHistory();
      set((s) => {
        const n = p.colors.length;
        const remap = (v: number) =>
          v < n ? v : EMPTY;
        const layers = remapLayerColors(s.design.layers, remap);
        const backgroundColor = remapBackground(s.design.backgroundColor, remap);
        return {
          design: {
            ...s.design,
            palette: structuredClone(p),
            layers,
            backgroundColor,
          },
          activeColor: clamp(s.activeColor, 0, n - 1),
          paletteSlotPath: null, // callers loading a saved palette set it after
          dirty: true,
        };
      });
    },

    resetPalette: () => get().applyPalette(makeRainbowPalette(10)),

    newDesign: (opts) =>
      set((s) => {
        const palette = opts?.keepPalette
          ? structuredClone(s.design.palette)
          : makeRainbowPalette(10);
        const design = freshDesign({
          columns: opts?.columns,
          rows: opts?.rows,
          name: opts?.name,
          cellAspect: opts?.cellAspect,
          palette,
        });
        return {
          design,
          activeLayer: firstRasterId(design),
          designKey: uid(),
          fitNonce: s.fitNonce + 1,
          undoStack: [],
          redoStack: [],
          selection: null,
          selectionMask: null,
          clipboard: null,
          starClipboard: null,
          selectedSelburoseId: null,
          editingSelburose: null,
          selectedImageId: null,
          editingImage: null,
          selectedShapeId: null,
          editingShape: null,
          rightPanel: null,
          lifeLayerId: null,
          pasteMode: false,
          activeColor: 0,
          workColumn: null,
          dirty: false,
          slotPath: null,
          paletteSlotPath: null,
        };
      }),

    loadDesignObject: (raw) =>
      set((s) => {
        const design = validateDesign(raw);
        return {
          design,
          activeLayer: firstRasterId(design),
          designKey: uid(),
          fitNonce: s.fitNonce + 1,
          undoStack: [],
          redoStack: [],
          selection: null,
          selectionMask: null,
          clipboard: null,
          starClipboard: null,
          selectedSelburoseId: null,
          editingSelburose: null,
          selectedImageId: null,
          editingImage: null,
          selectedShapeId: null,
          editingShape: null,
          rightPanel: null,
          lifeLayerId: null,
          pasteMode: false,
          activeColor: 0,
          workColumn: null,
          dirty: false,
          slotPath: null,
          paletteSlotPath: null,
        };
      }),

    loadDesignText: (text) => get().loadDesignObject(JSON.parse(text)),

    exportJSON: () => serializeDesign(get().design),

    saveToSlot: (name, folder = '') => {
      const trimmed = name.trim();
      if (!trimmed) return;
      get().setName(trimmed);
      const path = storage.designPath(folder, storage.cleanSegment(trimmed));
      storage.saveDesignSlot(path, serializeDesign(get().design));
      set({ dirty: false, slotPath: path });
    },

    quickSave: () => {
      const s = get();
      const name = s.design.meta.name.trim();
      const folder = s.slotPath ? storage.splitDesignPath(s.slotPath).folder : '';
      const path = storage.designPath(folder, storage.cleanSegment(name));
      if (!name || !storage.listDesigns().includes(path)) return false;
      s.saveToSlot(name, folder);
      return true;
    },

    setPaletteSlotPath: (path) => set({ paletteSlotPath: path }),

    remapPaletteSlot: (map) => {
      const s = get();
      if (!s.paletteSlotPath || !map.has(s.paletteSlotPath)) return;
      const to = map.get(s.paletteSlotPath)!;
      if (to.startsWith('.Trash/')) {
        set({ paletteSlotPath: null });
        return;
      }
      set({ paletteSlotPath: to });
      const name = storage.splitDesignPath(to).name;
      if (name !== s.design.palette.name) get().setPaletteName(name);
    },

    remapSlot: (map) => {
      const s = get();
      if (!s.slotPath || !map.has(s.slotPath)) return;
      const to = map.get(s.slotPath)!;
      if (to.startsWith('.Trash/')) {
        set({ slotPath: null, dirty: true });
        return;
      }
      set({ slotPath: to });
      const name = storage.splitDesignPath(to).name;
      if (name !== s.design.meta.name) get().setName(name);
    },

    loadFromSlot: (path) => {
      const j = storage.loadDesignSlot(path);
      if (!j) return;
      get().loadDesignText(j);
      set({ slotPath: path });
    },

    setSetting: (k, v) =>
      set((s) => ({ settings: { ...s.settings, [k]: v } as Settings })),

    setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
    setViewport: (w, h) => set({ viewport: { w, h } }),

    zoomBy: (factor) =>
      set((s) => {
        const z = clamp(s.view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        const { w, h } = s.viewport;
        const asp = s.design.loom.cellAspect;
        const s0 = PX_PER_COL * s.view.zoom;
        const s1 = PX_PER_COL * z;
        const cx = w / 2;
        const cy = h / 2;
        const worldX = (cx - s.view.panX) / s0;
        const worldY = (cy - s.view.panY) / (s0 * asp);
        return {
          view: {
            zoom: z,
            panX: cx - worldX * s1,
            panY: cy - worldY * s1 * asp,
          },
        };
      }),

    requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
  })),
);

// A decoded image bitmap changes what `compositeLayers` produces; nudge the
// store so bead counts / palette usage / the canvas all recompute.
subscribeImages(() =>
  useStore.setState((s) => ({ imageEpoch: s.imageEpoch + 1 })),
);
