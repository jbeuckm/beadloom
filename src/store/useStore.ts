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
  type Settings,
  type Snapshot,
  type Stamp,
  type ToolId,
} from '../types';
import {
  compositeLayers,
  emptyRasterLayer,
  nextLayerName,
  rasterCount,
  remapLayerColors,
  selburoseLayerCells,
} from '../lib/layers';
import { snapSelburoseCenter } from '../lib/shapes';
import { makeColor, makeRainbowPalette } from '../lib/palettes';
import { emptyGrid, floodFill, linePoints, readStamp, resizeGrid } from '../lib/grid';
import { paletteLabs } from '../lib/color';
import { traceImageLayer } from '../lib/trace';
import { revokeImage } from '../lib/referenceImage';
import {
  parseDesign,
  serializeDesign,
  validateDesign,
} from '../lib/designFormat';
import { clamp, normalizeHex, randomPleasantHex, uid } from '../util';
import * as storage from '../lib/storage';

const HISTORY_LIMIT = 60;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 14;

// --------------------------------------------------------------------------

function freshDesign(opts?: {
  columns?: number;
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
    loom: { stitch: 'loom', columns, rows, cellAspect: 0.8 },
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
  if (next === cur.data) return {};
  const layers = s.design.layers.slice();
  layers[i] = { ...cur, data: next };
  return { design: { ...s.design, layers }, dirty: true };
};

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

// --------------------------------------------------------------------------

export interface StoreState {
  design: BeadDesign;
  designKey: string; // changes on new/open to let the canvas re-fit
  fitNonce: number; // bump to request a "fit to view"
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
  rightPanel: RightPanelId | null; // the panel docked to the right edge
  highlightRow: number | null;
  cursor: { c: number; r: number } | null;
  settings: Settings;
  view: { zoom: number; panX: number; panY: number };
  viewport: { w: number; h: number };
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  dirty: boolean;

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
  selectWand: (c: number, r: number) => void;
  setHighlightRow: (r: number | null) => void;

  // painting — callers push history once at the start of a stroke
  paintCells: (cells: Array<[number, number]>, value: number) => void;
  paintLine: (c0: number, r0: number, c1: number, r1: number, value: number) => void;
  paintRect: (rect: Rect, value: number, filled: boolean) => void;
  bucketFill: (c: number, r: number) => void;
  pickAt: (c: number, r: number) => void;

  // bulk grid ops — history managed by caller
  replaceGrid: (data: number[][]) => void;
  setCells: (entries: Array<[number, number, number]>) => void;

  // image layers (self-managed history)
  addImageLayer: (
    p: Omit<ImageLayer, 'id' | 'kind' | 'name' | 'visible'>,
  ) => void;
  updateImageLayer: (id: string, patch: Partial<ImageLayer>) => void;
  selectImage: (id: string) => void;
  removeImageLayer: (id: string) => void;
  flattenImageLayer: (id: string) => void;

  // clipboard (self-managed history)
  copySelection: () => void;
  cutSelection: () => void;
  deleteSelection: () => void;
  pasteAt: (c: number, r: number) => void;

  // region transforms (self-managed history)
  flip: (axis: 'h' | 'v', scope: 'all' | 'selection') => void;
  rotate180: (scope: 'all' | 'selection') => void;

  // layers (self-managed history)
  setActiveLayer: (id: string) => void;
  addLayer: () => void;
  removeLayer: (id: string) => void;
  moveLayer: (id: string, dir: -1 | 1) => void;
  reorderLayers: (ordered: Layer[]) => void;
  renameLayer: (id: string, name: string) => void;
  toggleLayerVisible: (id: string) => void;

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

  // grid size — history managed by caller
  setColumns: (n: number) => void;
  setRows: (n: number) => void;
  clearAll: () => void;
  fillAll: () => void;

  // meta / palette (self-managed history where it matters)
  setName: (s: string) => void;
  setNotes: (s: string) => void;
  setBackground: (hex: string) => void;
  setPaletteName: (s: string) => void;
  addColor: () => void;
  updateColor: (
    id: string,
    patch: Partial<{ name: string; hex: string; code: string }>,
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
    keepPalette?: boolean;
  }) => void;
  loadDesignObject: (raw: unknown) => void;
  loadDesignText: (text: string) => void;
  exportJSON: () => string;
  saveToSlot: (name: string) => void;
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
    activeLayer: firstRasterId(initialDesign),
    activeColor: 0,
    tool: 'pen',
    pasteMode: false,
    selection: null,
    selectionMask: null,
    clipboard: null,
    selectedSelburoseId: null,
    editingSelburose: null,
    selectedImageId: null,
    editingImage: null,
    rightPanel: null,
    highlightRow: null,
    cursor: null,
    settings: initialSettings,
    view: { zoom: 1, panX: 0, panY: 0 },
    viewport: { w: 0, h: 0 },
    undoStack: [],
    redoStack: [],
    dirty: false,

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

    setTool: (t) => set({ tool: t, pasteMode: false }),
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

    // Magic wand: flood a contiguous same-value region on the composited view.
    selectWand: (c, r) =>
      set((s) => {
        const { columns: cols, rows } = s.design.loom;
        if (c < 0 || r < 0 || c >= cols || r >= rows) return {};
        const grid = compositeLayers(s.design);
        const target = grid[r][c];
        const mask = new Set<number>();
        const stack: Array<[number, number]> = [[c, r]];
        let c0 = c;
        let c1 = c;
        let r0 = r;
        let r1 = r;
        while (stack.length) {
          const [x, y] = stack.pop()!;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          const key = y * cols + x;
          if (mask.has(key) || grid[y][x] !== target) continue;
          mask.add(key);
          if (x < c0) c0 = x;
          if (x > c1) c1 = x;
          if (y < r0) r0 = y;
          if (y > r1) r1 = y;
          stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        return { tool: 'wand', selection: { c0, r0, c1, r1 }, selectionMask: mask };
      }),

    setHighlightRow: (r) => set({ highlightRow: r }),

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
      get().paintCells([...linePoints(c0, r0, c1, r1)], value),

    paintRect: (rect, value, filled) => {
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
      const { columns, rows, cellAspect } = s0.design.loom;
      const labs = paletteLabs(s0.design.palette.colors.map((c) => c.hex));
      const data = traceImageLayer(
        emptyGrid(columns, rows),
        layer,
        labs,
        columns,
        rows,
        cellAspect,
      );
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
          selectedImageId: s.selectedImageId === id ? null : s.selectedImageId,
          editingImage: s.editingImage === id ? null : s.editingImage,
          dirty: true,
        };
      });
    },

    copySelection: () =>
      set((s) => {
        if (!s.selection) return {};
        const stamp = readStamp(activeRasterData(s) ?? [], s.selection);
        const mask = s.selectionMask;
        if (mask) {
          const { c0, r0 } = s.selection;
          const cols = s.design.loom.columns;
          for (let y = 0; y < stamp.h; y++)
            for (let x = 0; x < stamp.w; x++)
              if (!mask.has((r0 + y) * cols + (c0 + x))) stamp.data[y][x] = EMPTY;
        }
        return { clipboard: stamp };
      }),

    cutSelection: () => {
      const s = get();
      if (!s.selection) return;
      s.pushHistory();
      s.copySelection();
      s.paintCells(selectionCells(s), EMPTY);
    },

    deleteSelection: () => {
      const s = get();
      if (!s.selection) return;
      s.pushHistory();
      s.paintCells(selectionCells(s), EMPTY);
    },

    pasteAt: (c, r) => {
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
          if (!touched.has(tr)) {
            next[tr] = data[tr].slice();
            touched.add(tr);
          }
          for (let x = 0; x < st.w; x++) {
            const tc = c + x;
            if (tc < 0 || tc >= columns) continue;
            next[tr][tc] = st.data[y][x];
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

    flip: (axis, scope) => {
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
      const s0 = get();
      const layer = s0.design.layers.find((l) => l.id === id);
      if (!layer) return;
      if (layer.kind === 'raster' && rasterCount(s0.design.layers) <= 1) return;
      if (layer.kind === 'image') revokeImage(layer.src);
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
          dirty: true,
        };
      });
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
          dirty: true,
        };
      });
    },

    openSelburoseEditor: (id) =>
      set({
        editingSelburose: id,
        rightPanel: 'selburose',
        selectedImageId: null,
        editingImage: null,
      }),
    closeSelburoseEditor: () =>
      set((s) => ({
        editingSelburose: null,
        rightPanel: s.rightPanel === 'selburose' ? null : s.rightPanel,
      })),

    selectSelburose: (id) =>
      set({
        selectedSelburoseId: id,
        selectedImageId: null,
        editingImage: null,
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
        const layers = s.design.layers
          .filter((l) => l.kind === 'raster')
          .map((l) => ({ ...(l as RasterLayer), data: emptyGrid(columns, rows) }));
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

    addColor: () => {
      get().pushHistory();
      set((s) => {
        const color = makeColor(
          randomPleasantHex(),
          `Color ${s.design.palette.colors.length + 1}`,
        );
        return {
          design: {
            ...s.design,
            palette: {
              ...s.design.palette,
              colors: s.design.palette.colors.concat(color),
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
        const layers = remapLayerColors(s.design.layers, (v) =>
          v === idx ? EMPTY : v > idx ? v - 1 : v,
        );
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
        const layers = remapLayerColors(s.design.layers, (v) =>
          v === i ? j : v === j ? i : v,
        );
        const active = s.activeColor === i ? j : s.activeColor === j ? i : s.activeColor;
        return {
          design: {
            ...s.design,
            palette: { ...s.design.palette, colors: cs },
            layers,
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
        const layers = remapLayerColors(s.design.layers, (v) =>
          indexMap.has(v) ? indexMap.get(v)! : v,
        );

        // Update active color index if needed
        const newActiveIdx = indexMap.get(s.activeColor) ?? s.activeColor;

        return {
          design: {
            ...s.design,
            palette: { ...s.design.palette, colors: newColors },
            layers,
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
        const layers = remapLayerColors(s.design.layers, (v) =>
          v < n ? v : EMPTY,
        );
        return {
          design: {
            ...s.design,
            palette: structuredClone(p),
            layers,
          },
          activeColor: clamp(s.activeColor, 0, n - 1),
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
          selectedSelburoseId: null,
          editingSelburose: null,
          selectedImageId: null,
          editingImage: null,
          rightPanel: null,
          pasteMode: false,
          activeColor: 0,
          highlightRow: null,
          dirty: false,
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
          selectedSelburoseId: null,
          editingSelburose: null,
          selectedImageId: null,
          editingImage: null,
          rightPanel: null,
          pasteMode: false,
          activeColor: 0,
          highlightRow: null,
          dirty: false,
        };
      }),

    loadDesignText: (text) => get().loadDesignObject(JSON.parse(text)),

    exportJSON: () => serializeDesign(get().design),

    saveToSlot: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      get().setName(trimmed);
      storage.saveDesignSlot(trimmed, serializeDesign(get().design));
      set({ dirty: false });
    },

    loadFromSlot: (name) => {
      const j = storage.loadDesignSlot(name);
      if (j) get().loadDesignText(j);
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
