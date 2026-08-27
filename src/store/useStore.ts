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
  type Palette,
  PX_PER_COL,
  type Rect,
  type Settings,
  type Snapshot,
  type Stamp,
  type ToolId,
} from '../types';
import { makeColor, makeRainbowPalette } from '../lib/palettes';
import { emptyGrid, floodFill, linePoints, readStamp, resizeGrid } from '../lib/grid';
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
    cells: { encoding: 'rows-index', empty: EMPTY, data: emptyGrid(columns, rows) },
  };
}

// --------------------------------------------------------------------------

export interface StoreState {
  design: BeadDesign;
  designKey: string; // changes on new/open to let the canvas re-fit
  fitNonce: number; // bump to request a "fit to view"
  activeColor: number; // index into design.palette.colors
  tool: ToolId;
  pasteMode: boolean;
  selection: Rect | null;
  clipboard: Stamp | null;
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
  setHighlightRow: (r: number | null) => void;

  // painting — callers push history once at the start of a stroke
  paintCells: (cells: Array<[number, number]>, value: number) => void;
  paintLine: (c0: number, r0: number, c1: number, r1: number, value: number) => void;
  paintRect: (rect: Rect, value: number, filled: boolean) => void;
  bucketFill: (c: number, r: number) => void;
  pickAt: (c: number, r: number) => void;

  // clipboard (self-managed history)
  copySelection: () => void;
  cutSelection: () => void;
  deleteSelection: () => void;
  pasteAt: (c: number, r: number) => void;

  // region transforms (self-managed history)
  flip: (axis: 'h' | 'v', scope: 'all' | 'selection') => void;
  rotate180: (scope: 'all' | 'selection') => void;

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
  data: s.design.cells.data.map((r) => r.slice()),
  activeColor: s.activeColor,
});

const applySnap = (s: StoreState, snp: Snapshot): Partial<StoreState> => ({
  design: {
    ...s.design,
    loom: structuredClone(snp.loom),
    palette: structuredClone(snp.palette),
    background: snp.background,
    cells: { ...s.design.cells, data: snp.data.map((r) => r.slice()) },
  },
  activeColor: clamp(snp.activeColor, 0, snp.palette.colors.length - 1),
  selection: null,
  dirty: true,
});

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
    activeColor: 0,
    tool: 'pen',
    pasteMode: false,
    selection: null,
    clipboard: null,
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
    setSelection: (r) => set({ selection: r }),
    selectAll: () =>
      set((s) => ({
        tool: 'select',
        selection: {
          c0: 0,
          r0: 0,
          c1: s.design.loom.columns - 1,
          r1: s.design.loom.rows - 1,
        },
      })),
    setHighlightRow: (r) => set({ highlightRow: r }),

    paintCells: (cells, value) =>
      set((s) => {
        if (!cells.length) return {};
        const { columns, rows } = s.design.loom;
        const data = s.design.cells.data;
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
        return {
          design: { ...s.design, cells: { ...s.design.cells, data: next } },
          dirty: true,
        };
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
        const next = floodFill(s.design.cells.data, c, r, s.activeColor);
        if (next === s.design.cells.data) return {};
        return {
          design: { ...s.design, cells: { ...s.design.cells, data: next } },
          dirty: true,
        };
      }),

    pickAt: (c, r) =>
      set((s) => {
        const v = s.design.cells.data[r]?.[c] ?? -1;
        return v >= 0 ? { activeColor: v } : {};
      }),

    copySelection: () =>
      set((s) =>
        s.selection
          ? { clipboard: readStamp(s.design.cells.data, s.selection) }
          : {},
      ),

    cutSelection: () => {
      const s = get();
      if (!s.selection) return;
      s.pushHistory();
      set({ clipboard: readStamp(s.design.cells.data, s.selection) });
      const { c0, r0, c1, r1 } = s.selection;
      const cells: Array<[number, number]> = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push([c, r]);
      s.paintCells(cells, EMPTY);
    },

    deleteSelection: () => {
      const s = get();
      if (!s.selection) return;
      s.pushHistory();
      const { c0, r0, c1, r1 } = s.selection;
      const cells: Array<[number, number]> = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push([c, r]);
      s.paintCells(cells, EMPTY);
    },

    pasteAt: (c, r) => {
      const st = get().clipboard;
      if (!st) return;
      get().pushHistory();
      set((s) => {
        const { columns, rows } = s.design.loom;
        const data = s.design.cells.data;
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
        return {
          design: { ...s.design, cells: { ...s.design.cells, data: next } },
          selection: sel,
          dirty: true,
        };
      });
    },

    flip: (axis, scope) => {
      get().pushHistory();
      set((s) => {
        const { columns, rows } = s.design.loom;
        const region: Rect =
          scope === 'selection' && s.selection
            ? s.selection
            : { c0: 0, r0: 0, c1: columns - 1, r1: rows - 1 };
        const src = s.design.cells.data;
        const out = src.map((row) => row.slice());
        const w = region.c1 - region.c0 + 1;
        const h = region.r1 - region.r0 + 1;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const sx = axis === 'h' ? w - 1 - x : x;
            const sy = axis === 'v' ? h - 1 - y : y;
            out[region.r0 + y][region.c0 + x] = src[region.r0 + sy][region.c0 + sx];
          }
        return {
          design: { ...s.design, cells: { ...s.design.cells, data: out } },
          dirty: true,
        };
      });
    },

    rotate180: (scope) => {
      get().pushHistory();
      set((s) => {
        const { columns, rows } = s.design.loom;
        const region: Rect =
          scope === 'selection' && s.selection
            ? s.selection
            : { c0: 0, r0: 0, c1: columns - 1, r1: rows - 1 };
        const src = s.design.cells.data;
        const out = src.map((row) => row.slice());
        const w = region.c1 - region.c0 + 1;
        const h = region.r1 - region.r0 + 1;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            out[region.r0 + y][region.c0 + x] =
              src[region.r0 + (h - 1 - y)][region.c0 + (w - 1 - x)];
        return {
          design: { ...s.design, cells: { ...s.design.cells, data: out } },
          dirty: true,
        };
      });
    },

    setColumns: (n) =>
      set((s) => {
        const cols = clamp(Math.round(n), 1, 400);
        if (cols === s.design.loom.columns) return {};
        return {
          design: {
            ...s.design,
            loom: { ...s.design.loom, columns: cols },
            cells: {
              ...s.design.cells,
              data: resizeGrid(s.design.cells.data, cols, s.design.loom.rows),
            },
          },
          selection: null,
          dirty: true,
        };
      }),

    setRows: (n) =>
      set((s) => {
        const rows = clamp(Math.round(n), 1, 1000);
        if (rows === s.design.loom.rows) return {};
        return {
          design: {
            ...s.design,
            loom: { ...s.design.loom, rows },
            cells: {
              ...s.design.cells,
              data: resizeGrid(s.design.cells.data, s.design.loom.columns, rows),
            },
          },
          selection: null,
          dirty: true,
        };
      }),

    clearAll: () => {
      get().pushHistory();
      set((s) => ({
        design: {
          ...s.design,
          cells: {
            ...s.design.cells,
            data: emptyGrid(s.design.loom.columns, s.design.loom.rows),
          },
        },
        selection: null,
        dirty: true,
      }));
    },

    fillAll: () => {
      get().pushHistory();
      set((s) => {
        const { columns, rows } = s.design.loom;
        const v = s.activeColor;
        return {
          design: {
            ...s.design,
            cells: {
              ...s.design.cells,
              data: Array.from({ length: rows }, () =>
                Array.from({ length: columns }, () => v),
              ),
            },
          },
          dirty: true,
        };
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
        const data = s.design.cells.data.map((row) =>
          row.map((v) => (v === idx ? EMPTY : v > idx ? v - 1 : v)),
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
            cells: { ...s.design.cells, data },
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
        const data = s.design.cells.data.map((row) =>
          row.map((v) => (v === i ? j : v === j ? i : v)),
        );
        const active = s.activeColor === i ? j : s.activeColor === j ? i : s.activeColor;
        return {
          design: {
            ...s.design,
            palette: { ...s.design.palette, colors: cs },
            cells: { ...s.design.cells, data },
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

        // Update cell data with new indices
        const data = s.design.cells.data.map((row) =>
          row.map((v) => (indexMap.has(v) ? indexMap.get(v)! : v)),
        );

        // Update active color index if needed
        const newActiveIdx = indexMap.get(s.activeColor) ?? s.activeColor;

        return {
          design: {
            ...s.design,
            palette: { ...s.design.palette, colors: newColors },
            cells: { ...s.design.cells, data },
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
        const data = s.design.cells.data.map((row) =>
          row.map((v) => (v >= 0 && v < n ? v : EMPTY)),
        );
        return {
          design: {
            ...s.design,
            palette: structuredClone(p),
            cells: { ...s.design.cells, data },
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
        return {
          design: freshDesign({
            columns: opts?.columns,
            rows: opts?.rows,
            name: opts?.name,
            palette,
          }),
          designKey: uid(),
          fitNonce: s.fitNonce + 1,
          undoStack: [],
          redoStack: [],
          selection: null,
          clipboard: null,
          pasteMode: false,
          activeColor: 0,
          highlightRow: null,
          dirty: false,
        };
      }),

    loadDesignObject: (raw) =>
      set((s) => ({
        design: validateDesign(raw),
        designKey: uid(),
        fitNonce: s.fitNonce + 1,
        undoStack: [],
        redoStack: [],
        selection: null,
        clipboard: null,
        pasteMode: false,
        activeColor: 0,
        highlightRow: null,
        dirty: false,
      })),

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
