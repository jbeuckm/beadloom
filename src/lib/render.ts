import type { BeadDesign } from '../types';

export interface View {
  scale: number; // px per column width (already includes zoom)
  offX: number; // px offset of the grid's left edge
  offY: number; // px offset of the grid's top edge
}

export interface BaseOpts {
  showGrid: boolean;
  showRowNumbers: boolean;
  highlightRow: number | null;
}

/**
 * Draws the "document" layer: piece background, coloured beads, grid lines,
 * outer border, optional row/column numbers and a highlighted working row.
 * Shared by the interactive canvas and the PNG exporter so they stay in sync.
 * Assumes the context is already scaled for devicePixelRatio.
 */
export function drawBase(
  ctx: CanvasRenderingContext2D,
  design: BeadDesign,
  view: View,
  cssW: number,
  cssH: number,
  opts: BaseOpts,
): void {
  const { columns: cols, rows, cellAspect: asp } = design.loom;
  const { scale, offX, offY } = view;
  const cellH = scale * asp;
  const colors = design.palette.colors;
  const data = design.cells.data;

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
      ctx.fillStyle = col.hex;
      // +0.6 to close hairline seams between adjacent cells.
      ctx.fillRect(offX + c * scale, offY + r * cellH, scale + 0.6, cellH + 0.6);
    }
  }

  if (
    opts.highlightRow != null &&
    opts.highlightRow >= 0 &&
    opts.highlightRow < rows
  ) {
    ctx.fillStyle = 'rgba(255, 200, 0, 0.28)';
    ctx.fillRect(offX, offY + opts.highlightRow * cellH, cols * scale, cellH);
  }

  if (opts.showGrid && scale >= 5) {
    ctx.lineWidth = 1;
    for (let c = c0; c <= c1 + 1; c++) {
      const x = Math.round(offX + c * scale) + 0.5;
      ctx.strokeStyle = c % 10 === 0 ? 'rgba(0,0,0,0.34)' : 'rgba(0,0,0,0.13)';
      ctx.beginPath();
      ctx.moveTo(x, offY);
      ctx.lineTo(x, offY + rows * cellH);
      ctx.stroke();
    }
    for (let r = r0; r <= r1 + 1; r++) {
      const y = Math.round(offY + r * cellH) + 0.5;
      ctx.strokeStyle = r % 10 === 0 ? 'rgba(0,0,0,0.34)' : 'rgba(0,0,0,0.13)';
      ctx.beginPath();
      ctx.moveTo(offX, y);
      ctx.lineTo(offX + cols * scale, y);
      ctx.stroke();
    }
  }

  // Outer border.
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(offX + 0.5, offY + 0.5, cols * scale, rows * cellH);

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
