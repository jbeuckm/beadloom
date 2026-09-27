// ---------------------------------------------------------------------------
// (De)serialisation, validation/migration and file I/O for the custom formats:
//   - "beadloom-design"  (a full pattern; see docs/FILE_FORMAT.md)
//   - "beadloom-palette" (a reusable colour set)
// ---------------------------------------------------------------------------

import {
  APP_NAME,
  APP_VERSION,
  type BeadDesign,
  EMPTY,
  FORMAT_ID,
  FORMAT_VERSION,
  type Layer,
  type Palette,
  PALETTE_FORMAT_ID,
  type PaletteFile,
  type RasterLayer,
  type SelburoseObject,
  type ShapeObject,
} from '../types';
import { emptyGrid } from './grid';
import { compositeLayers } from './layers';
import { drawBase } from './render';
import { normalizeHex, uid } from '../util';

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

function num(v: unknown, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function coerceColors(raw: any[]): Palette['colors'] {
  const colors = (Array.isArray(raw) ? raw : []).map((c: any, i: number) => {
    const out: Palette['colors'][number] = {
      id: String(c?.id ?? `c${i + 1}`),
      name: String(c?.name ?? `Color ${i + 1}`),
      hex: normalizeHex(String(c?.hex ?? '')) ?? '#888888',
    };
    if (c?.code) out.code = String(c.code);
    return out;
  });
  if (colors.length === 0) colors.push({ id: 'c1', name: 'Color 1', hex: '#000000' });
  return colors;
}

/** Accepts anything, returns a clean, self-consistent BeadDesign or throws. */
export function validateDesign(raw: any): BeadDesign {
  if (!raw || typeof raw !== 'object') throw new Error('File is not a JSON object.');
  if (raw.format !== FORMAT_ID)
    throw new Error(`Unrecognised format: "${raw.format ?? '(missing)'}".`);
  if (typeof raw.version !== 'number' || raw.version > FORMAT_VERSION)
    throw new Error(`Unsupported version: ${raw.version}.`);

  const cols = clampInt(raw?.loom?.columns, 1, 400, 20);
  const rows = clampInt(raw?.loom?.rows, 1, 1000, 40);
  const aspRaw = Number(raw?.loom?.cellAspect);
  const cellAspect = Number.isFinite(aspRaw) && aspRaw > 0.1 && aspRaw < 5 ? aspRaw : 0.8;

  const colors = coerceColors(raw?.palette?.colors);
  const palette: Palette = {
    id: String(raw?.palette?.id ?? 'palette'),
    name: String(raw?.palette?.name ?? 'Palette'),
    ...(typeof raw?.palette?.kind === 'string' ? { kind: raw.palette.kind } : {}),
    colors,
  };

  const coerceGrid = (src: any): number[][] => {
    const rowsSrc: any[] = Array.isArray(src) ? src : [];
    const g = emptyGrid(cols, rows);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const v = Number(rowsSrc[r]?.[c]);
        g[r][c] = Number.isInteger(v) && v >= 0 && v < colors.length ? v : EMPTY;
      }
    return g;
  };

  const coerceShape = (o: any, i: number): ShapeObject => ({
    id: String(o?.id ?? `shp${i + 1}`),
    kind: o?.kind === 'line' ? 'line' : o?.kind === 'poly' ? 'poly' : 'box',
    x0: clampInt(o?.x0, 0, cols - 1, 0),
    y0: clampInt(o?.y0, 0, rows - 1, 0),
    x1: clampInt(o?.x1, 0, cols - 1, 0),
    y1: clampInt(o?.y1, 0, rows - 1, 0),
    points: Array.isArray(o?.points)
      ? o.points
          .filter((p: any) => Array.isArray(p) && p.length === 2)
          .map((p: any): [number, number] => [
            clampInt(p[0], 0, cols - 1, 0),
            clampInt(p[1], 0, rows - 1, 0),
          ])
      : [],
    closed: !!o?.closed,
    thickness: Math.max(1, Math.round(num(o?.thickness, 1))),
    fill: !!o?.fill,
    colorIndex: clampInt(o?.colorIndex, 0, colors.length - 1, 0),
  });

  const coerceStar = (o: any, i: number): SelburoseObject => ({
    id: String(o?.id ?? `sel${i + 1}`),
    cx: num(o?.cx, cols / 2),
    cy: num(o?.cy, rows / 2),
    size: Math.max(0.5, num(o?.size, 6)),
    rotationDeg: num(o?.rotationDeg, 0),
    gap: Math.max(0, num(o?.gap, 0.5)),
    coverage: Math.min(1, Math.max(0.02, num(o?.coverage, 0.5))),
    center: o?.center === 'border' ? 'border' : 'cell',
    mode: o?.mode === 'outline' ? 'outline' : 'fill',
    colorIndex: clampInt(o?.colorIndex, 0, colors.length - 1, 0),
  });

  let layers: Layer[];
  if (Array.isArray(raw?.layers)) {
    layers = raw.layers
      .filter(
        (l: any) => l && typeof l === 'object' && l.kind !== 'image', // images are session-only
      )
      .map((l: any, i: number): Layer => {
        const common = {
          id: String(l.id ?? `l${i + 1}`),
          name: String(l.name ?? `Layer ${i + 1}`),
          visible: l.visible !== false,
          ...(l.locked === true ? { locked: true } : {}),
        };
        if (l.kind === 'selburose')
          return { ...common, kind: 'selburose', star: coerceStar(l.star, i) };
        if (l.kind === 'shape')
          return { ...common, kind: 'shape', shape: coerceShape(l.shape, i) };
        return { ...common, kind: 'raster', data: coerceGrid(l.data) };
      });
  } else {
    // legacy shape: a single grid plus a parallel selburose list
    const base: RasterLayer = {
      id: uid(),
      kind: 'raster',
      name: 'Background',
      visible: true,
      data: coerceGrid(raw?.cells?.data),
    };
    const rawSel: any[] = Array.isArray(raw?.selburoses) ? raw.selburoses : [];
    layers = [
      base,
      ...rawSel
        .filter((o) => o && typeof o === 'object')
        .map((o, i): Layer => {
          const star = coerceStar(o, i);
          return {
            id: star.id,
            kind: 'selburose',
            name: `Selburose ${i + 1}`,
            visible: true,
            star,
          };
        }),
    ];
  }
  if (!layers.some((l) => l.kind === 'raster'))
    layers.unshift({
      id: uid(),
      kind: 'raster',
      name: 'Layer 1',
      visible: true,
      data: emptyGrid(cols, rows),
    });

  const now = new Date().toISOString();
  const out: BeadDesign = {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    meta: {
      name: String(raw?.meta?.name ?? 'Untitled Pattern'),
      created: String(raw?.meta?.created ?? now),
      modified: now,
      app: `${APP_NAME} ${APP_VERSION}`,
    },
    loom: { stitch: 'loom', columns: cols, rows, cellAspect: cellAspect },
    palette,
    background: normalizeHex(String(raw?.background ?? '#FFFFFF')) ?? '#FFFFFF',
    ...(Number.isInteger(raw?.backgroundColor) &&
    raw.backgroundColor >= 0 &&
    raw.backgroundColor < palette.colors.length
      ? { backgroundColor: raw.backgroundColor }
      : {}),
    layers,
  };
  if (raw?.meta?.notes) out.meta.notes = String(raw.meta.notes);
  return out;
}

export function serializeDesign(d: BeadDesign): string {
  const out = {
    ...d,
    meta: {
      ...d.meta,
      modified: new Date().toISOString(),
      app: `${APP_NAME} ${APP_VERSION}`,
    },
    // Image layers hold a session object URL — never persist them.
    layers: d.layers.filter((l) => l.kind !== 'image'),
    // Derived, read-only mirror: the flattened visible stack. `layers` is
    // authoritative on load; `cells` keeps older readers and tooling working.
    cells: { encoding: 'rows-index', empty: EMPTY, data: compositeLayers(d) },
  };
  return JSON.stringify(out, null, 2);
}

export function parseDesign(text: string): BeadDesign {
  return validateDesign(JSON.parse(text));
}

export function serializePalette(p: Palette): string {
  const out: PaletteFile = { format: PALETTE_FORMAT_ID, version: 1, palette: p };
  return JSON.stringify(out, null, 2);
}

export function parsePalette(text: string): Palette {
  const raw = JSON.parse(text);
  if (raw?.format !== PALETTE_FORMAT_ID)
    throw new Error('Not a Grid Designer palette file.');
  const colors = coerceColors(raw?.palette?.colors);
  return {
    id: String(raw?.palette?.id ?? 'palette'),
    name: String(raw?.palette?.name ?? 'Palette'),
    ...(typeof raw?.palette?.kind === 'string' ? { kind: raw.palette.kind } : {}),
    colors,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// --------------------------------------------------------------------------
// Browser file helpers
// --------------------------------------------------------------------------

export function downloadText(
  filename: string,
  text: string,
  type = 'application/json',
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickTextFile(
  accept = 'application/json,.json',
): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, text: String(reader.result) });
      reader.onerror = () => resolve(null);
      reader.readAsText(f);
    };
    input.click();
  });
}

/** Render the design to a PNG and trigger a download. */
export function exportPNG(design: BeadDesign, cellPx = 22): void {
  const asp = design.loom.cellAspect;
  const pad = 4;
  const w = design.loom.columns * cellPx + pad * 2;
  const h = design.loom.rows * cellPx * asp + pad * 2;
  const dpr = 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  drawBase(
    ctx,
    design,
    compositeLayers(design),
    { scale: cellPx, offX: pad, offY: pad },
    w,
    h,
    { showGrid: true, showRowNumbers: false, workColumn: null },
  );

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${design.meta.name || 'pattern'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
