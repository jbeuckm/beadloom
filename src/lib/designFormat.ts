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
  type Palette,
  PALETTE_FORMAT_ID,
  type PaletteFile,
} from '../types';
import { emptyGrid } from './grid';
import { drawBase } from './render';
import { normalizeHex } from '../util';

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
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
    colors,
  };

  const src: any[] = Array.isArray(raw?.cells?.data) ? raw.cells.data : [];
  const data = emptyGrid(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = Number(src[r]?.[c]);
      data[r][c] = Number.isInteger(v) && v >= 0 && v < colors.length ? v : EMPTY;
    }
  }

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
    cells: { encoding: 'rows-index', empty: EMPTY, data },
  };
  if (raw?.meta?.notes) out.meta.notes = String(raw.meta.notes);
  return out;
}

export function serializeDesign(d: BeadDesign): string {
  const out: BeadDesign = {
    ...d,
    meta: {
      ...d.meta,
      modified: new Date().toISOString(),
      app: `${APP_NAME} ${APP_VERSION}`,
    },
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
    throw new Error('Not a BeadLoom palette file.');
  const colors = coerceColors(raw?.palette?.colors);
  return {
    id: String(raw?.palette?.id ?? 'palette'),
    name: String(raw?.palette?.name ?? 'Palette'),
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
  drawBase(ctx, design, { scale: cellPx, offX: pad, offY: pad }, w, h, {
    showGrid: true,
    showRowNumbers: false,
    highlightRow: null,
  });

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
