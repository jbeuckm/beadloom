import type { BeadDesign } from '../types';
import { TILE, VARIANTS, woolPattern } from './woolTexture';

export interface View {
  scale: number; // px per column width (already includes zoom)
  offX: number; // px offset of the grid's left edge
  offY: number; // px offset of the grid's top edge
}

export interface BaseOpts {
  showGrid: boolean;
  showRowNumbers: boolean;
  workColumn: number | null; // wash out every other column
}

/**
 * Draws the "document" layer: piece background, coloured beads, grid lines,
 * outer border, optional row/column numbers, and a working column (every other
 * column washed out).
 * Shared by the interactive canvas and the PNG exporter so they stay in sync.
 * Assumes the context is already scaled for devicePixelRatio.
 */
export function drawBase(
  ctx: CanvasRenderingContext2D,
  design: BeadDesign,
  grid: number[][],
  view: View,
  cssW: number,
  cssH: number,
  opts: BaseOpts,
): void {
  const { columns: cols, rows, cellAspect: asp } = design.loom;
  const { scale, offX, offY } = view;
  const cellH = scale * asp;
  const colors = design.palette.colors;
  const data = grid;

  ctx.clearRect(0, 0, cssW, cssH);

  // Piece background (behind empty cells).
  ctx.fillStyle = design.background;
  ctx.fillRect(offX, offY, cols * scale, rows * cellH);

  // Only iterate the cells that can actually be on screen.
  const c0 = Math.max(0, Math.floor((0 - offX) / scale));
  const c1 = Math.min(cols - 1, Math.ceil((cssW - offX) / scale));
  const r0 = Math.max(0, Math.floor((0 - offY) / cellH));
  const r1 = Math.min(rows - 1, Math.ceil((cssH - offY) / cellH));

  for (let r = r0; r <= r1; r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = c0; c <= c1; c++) {
      const v = row[c] ?? -1;
      if (v < 0) continue;
      const col = colors[v];
      if (!col) continue;
      const x = offX + c * scale;
      const y = offY + r * cellH;
      // heathered wool: one texture tile per cell (a few variants, so
      // neighbouring cells don't repeat); too small to see → flat colour
      const pat = col.heather && scale >= 6 ? woolPattern(ctx, col, (c * 7 + r * 13) % VARIANTS) : null;
      if (pat) {
        pat.setTransform(new DOMMatrix([scale / TILE, 0, 0, cellH / TILE, x, y]));
        ctx.fillStyle = pat;
      } else ctx.fillStyle = col.hex;
      // +0.6 to close hairline seams between adjacent cells.
      ctx.fillRect(x, y, scale + 0.6, cellH + 0.6);
    }
  }

  if (opts.showGrid && scale >= 5) {
    ctx.lineWidth = 1;
    for (let c = c0; c <= c1 + 1; c++) {
      const x = Math.round(offX + c * scale) + 0.5;
      ctx.strokeStyle = c % 5 === 0 ? 'rgba(0,0,0,0.34)' : 'rgba(0,0,0,0.13)';
      ctx.beginPath();
      ctx.moveTo(x, offY);
      ctx.lineTo(x, offY + rows * cellH);
      ctx.stroke();
    }
    for (let r = r0; r <= r1 + 1; r++) {
      const y = Math.round(offY + r * cellH) + 0.5;
      ctx.strokeStyle = r % 5 === 0 ? 'rgba(0,0,0,0.34)' : 'rgba(0,0,0,0.13)';
      ctx.beginPath();
      ctx.moveTo(offX, y);
      ctx.lineTo(offX + cols * scale, y);
      ctx.stroke();
    }
  }

  // Working column: wash out everything else so the column being beaded
  // stands out, then outline it.
  const wc = opts.workColumn;
  if (wc != null && wc >= 0 && wc < cols) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.fillRect(offX, offY, wc * scale, rows * cellH);
    ctx.fillRect(offX + (wc + 1) * scale, offY, (cols - wc - 1) * scale, rows * cellH);
  }

  // Outer border.
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(offX + 0.5, offY + 0.5, cols * scale, rows * cellH);
  if (wc != null && wc >= 0 && wc < cols) {
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(offX + wc * scale, offY - 1, scale, rows * cellH + 2);
  }

  if (opts.showRowNumbers && cellH >= 9) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.font = `${Math.min(12, Math.floor(cellH * 0.72))}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let r = r0; r <= r1; r++)
      ctx.fillText(String(r + 1), offX - 6, offY + r * cellH + cellH / 2);
    if (scale >= 13) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (let c = c0; c <= c1; c++)
        if (c % 5 === 0 || c === cols - 1)
          ctx.fillText(String(c + 1), offX + c * scale + scale / 2, offY - 5);
    }
  }
}
