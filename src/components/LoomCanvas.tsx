import type React from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useStore } from '../store/useStore';
import { drawBase } from '../lib/render';
import { linePoints, normRect } from '../lib/grid';
import { EMPTY, PX_PER_COL, type Rect } from '../types';
import { clamp } from '../util';

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 14;

type Drag = {
  mode: 'line' | 'rect' | 'rectFill' | 'select';
  ax: number;
  ay: number;
  bx: number;
  by: number;
};

const S = useStore.getState;

export default function LoomCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);

  // Re-render triggers (subscribed slices).
  const design = useStore((s) => s.design);
  const designKey = useStore((s) => s.designKey);
  const fitNonce = useStore((s) => s.fitNonce);
  const tool = useStore((s) => s.tool);
  const activeColor = useStore((s) => s.activeColor);
  const selection = useStore((s) => s.selection);
  const clipboard = useStore((s) => s.clipboard);
  const settings = useStore((s) => s.settings);
  const highlightRow = useStore((s) => s.highlightRow);
  const view = useStore((s) => s.view);
  const pasteMode = useStore((s) => s.pasteMode);
  const cursor = useStore((s) => s.cursor);

  const asp = design.loom.cellAspect;
  const scale = PX_PER_COL * view.zoom;

  // ---- interaction refs (do not trigger renders) --------------------------
  const pointers = useRef<Map<number, { x: number; y: number; type: string }>>(
    new Map(),
  );
  const painting = useRef(false);
  const strokeValue = useRef(0);
  const lastCell = useRef<{ c: number; r: number } | null>(null);
  const anchor = useRef<{ c: number; r: number } | null>(null);
  const pinch = useRef<
    | null
    | {
        dist: number;
        zoom: number;
        panX: number;
        panY: number;
        cx: number;
        cy: number;
      }
  >(null);
  const panLast = useRef<{ x: number; y: number } | null>(null);
  const resizing = useRef<null | 'cols' | 'rows'>(null);

  const pendingPaint = useRef<Array<[number, number]>>([]);
  const paintRaf = useRef(false);
  const cursorRaf = useRef(false);

  // ---- coordinate helpers ----------------------------------------------
  const toCell = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const v = S().view;
      const sc = PX_PER_COL * v.zoom;
      return {
        c: Math.floor((x - v.panX) / sc),
        r: Math.floor((y - v.panY) / (sc * asp)),
        localX: x,
      };
    },
    [asp],
  );

  const flushPaint = useCallback(() => {
    paintRaf.current = false;
    const pts = pendingPaint.current;
    pendingPaint.current = [];
    if (pts.length) S().paintCells(pts, strokeValue.current);
  }, []);
  const queuePaint = useCallback(
    (pts: Array<[number, number]>) => {
      if (!pts.length) return;
      pendingPaint.current.push(...pts);
      if (paintRaf.current) return;
      paintRaf.current = true;
      requestAnimationFrame(flushPaint);
    },
    [flushPaint],
  );

  // ---- container size --------------------------------------------------
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize({ w, h });
      S().setViewport(w, h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- fit to view ---------------------------------------------------
  const doFit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    const d = S().design;
    const pad = 60;
    const gw = d.loom.columns * PX_PER_COL;
    const gh = d.loom.rows * PX_PER_COL * d.loom.cellAspect;
    const z = clamp(Math.min((w - pad) / gw, (h - pad) / gh), MIN_ZOOM, 5);
    const sc = PX_PER_COL * z;
    S().setView({
      zoom: z,
      panX: (w - d.loom.columns * sc) / 2,
      panY: (h - d.loom.rows * sc * d.loom.cellAspect) / 2,
    });
  }, []);

  useEffect(() => {
    doFit();
  }, [doFit, designKey, fitNonce]);
  useEffect(() => {
    if (
      size.w &&
      size.h &&
      view.zoom === 1 &&
      view.panX === 0 &&
      view.panY === 0
    )
      doFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  // ---- non-passive wheel + iOS gesture guards -------------------------
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const v = S().view;
      const factor = Math.exp(-e.deltaY * 0.0016);
      const z = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const s0 = PX_PER_COL * v.zoom;
      const s1 = PX_PER_COL * z;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const worldX = (px - v.panX) / s0;
      const worldY = (py - v.panY) / (s0 * asp);
      S().setView({
        zoom: z,
        panX: px - worldX * s1,
        panY: py - worldY * s1 * asp,
      });
    };
    const prevent = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', prevent as EventListener);
    el.addEventListener('gesturechange', prevent as EventListener);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', prevent as EventListener);
      el.removeEventListener('gesturechange', prevent as EventListener);
    };
  }, [asp]);

  // ---- draw ---------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = size.w + 'px';
    canvas.style.height = size.h + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const off = { scale, offX: view.panX, offY: view.panY };
    drawBase(ctx, design, off, size.w, size.h, {
      showGrid: settings.showGrid,
      showRowNumbers: settings.showRowNumbers,
      highlightRow,
    });

    const cellH = scale * asp;
    const cols = design.loom.columns;
    const rows = design.loom.rows;
    const px = (c: number) => view.panX + c * scale;
    const py = (r: number) => view.panY + r * cellH;

    // selection marquee
    if (selection) {
      const x = px(selection.c0);
      const y = py(selection.r0);
      const w = (selection.c1 - selection.c0 + 1) * scale;
      const h = (selection.r1 - selection.r0 + 1) * cellH;
      ctx.save();
      ctx.fillStyle = 'rgba(18,104,255,0.10)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#1268ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.restore();
    }

    // shape / select preview
    if (drag) {
      ctx.save();
      if (drag.mode === 'select') {
        const r = normRect({ c: drag.ax, r: drag.ay }, { c: drag.bx, r: drag.by });
        ctx.strokeStyle = '#1268ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(
          px(r.c0) + 1,
          py(r.r0) + 1,
          (r.c1 - r.c0 + 1) * scale - 2,
          (r.r1 - r.r0 + 1) * cellH - 2,
        );
      } else {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = design.palette.colors[activeColor]?.hex ?? '#000';
        const pts: Array<[number, number]> =
          drag.mode === 'line'
            ? [...linePoints(drag.ax, drag.ay, drag.bx, drag.by)]
            : rectCells(
                drag.ax,
                drag.ay,
                drag.bx,
                drag.by,
                drag.mode === 'rectFill',
              );
        for (const [c, r] of pts) ctx.fillRect(px(c), py(r), scale, cellH);
      }
      ctx.restore();
    }

    // paste stamp preview
    if (pasteMode && clipboard && cursor) {
      ctx.save();
      ctx.globalAlpha = 0.78;
      for (let y = 0; y < clipboard.h; y++)
        for (let x = 0; x < clipboard.w; x++) {
          const v = clipboard.data[y][x];
          if (v < 0) continue;
          ctx.fillStyle = design.palette.colors[v]?.hex ?? '#000';
          ctx.fillRect(px(cursor.c + x), py(cursor.r + y), scale, cellH);
        }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#1268ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        px(cursor.c),
        py(cursor.r),
        clipboard.w * scale,
        clipboard.h * cellH,
      );
      ctx.restore();
    }

    // hover cell outline
    if (
      cursor &&
      !drag &&
      !pasteMode &&
      cursor.c >= 0 &&
      cursor.r >= 0 &&
      cursor.c < cols &&
      cursor.r < rows &&
      (tool === 'pen' ||
        tool === 'eraser' ||
        tool === 'fill' ||
        tool === 'eyedropper')
    ) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px(cursor.c) + 1, py(cursor.r) + 1, scale - 2, cellH - 2);
      ctx.restore();
    }
  }, [
    design,
    scale,
    asp,
    view.panX,
    view.panY,
    size.w,
    size.h,
    selection,
    drag,
    settings,
    highlightRow,
    activeColor,
    clipboard,
    pasteMode,
    cursor,
    tool,
  ]);

  // ---- pointer handlers ------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events may not have a capturable pointer */
    }
    pointers.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType,
    });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const v = S().view;
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: v.zoom,
        panX: v.panX,
        panY: v.panY,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
      painting.current = false;
      setDrag(null);
      return;
    }

    const { c, r, localX } = toCell(e.clientX, e.clientY);
    const v = S().view;
    const d = S().design;
    const inb = c >= 0 && r >= 0 && c < d.loom.columns && r < d.loom.rows;

    // pan: pan tool, middle button, or (in pencil-only) a finger touch
    if (
      tool === 'pan' ||
      e.button === 1 ||
      (settings.pencilOnly && e.pointerType === 'touch')
    ) {
      panLast.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // left gutter tap -> set the working row highlight
    if (localX < v.panX && r >= 0 && r < d.loom.rows) {
      S().setHighlightRow(S().highlightRow === r ? null : r);
      return;
    }

    if (pasteMode) {
      S().pasteAt(c, r);
      return;
    }

    switch (tool) {
      case 'pen':
      case 'eraser': {
        if (!inb) return;
        S().pushHistory();
        painting.current = true;
        strokeValue.current = tool === 'eraser' ? EMPTY : S().activeColor;
        lastCell.current = { c, r };
        queuePaint([[c, r]]);
        break;
      }
      case 'fill': {
        if (!inb) return;
        S().pushHistory();
        S().bucketFill(c, r);
        break;
      }
      case 'eyedropper': {
        if (inb) S().pickAt(c, r);
        break;
      }
      case 'line':
      case 'rect':
      case 'rectFill':
      case 'select': {
        anchor.current = { c, r };
        setDrag({ mode: tool as Drag['mode'], ax: c, ay: r, bx: c, by: r });
        break;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        type: e.pointerType,
      });

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = canvasRef.current!.getBoundingClientRect();
      const p = pinch.current;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const z = clamp(p.zoom * (dist / p.dist), MIN_ZOOM, MAX_ZOOM);
      const s0 = PX_PER_COL * p.zoom;
      const s1 = PX_PER_COL * z;
      const worldX = (p.cx - rect.left - p.panX) / s0;
      const worldY = (p.cy - rect.top - p.panY) / (s0 * asp);
      S().setView({
        zoom: z,
        panX: midX - rect.left - worldX * s1,
        panY: midY - rect.top - worldY * s1 * asp,
      });
      return;
    }

    if (panLast.current) {
      const dx = e.clientX - panLast.current.x;
      const dy = e.clientY - panLast.current.y;
      panLast.current = { x: e.clientX, y: e.clientY };
      const v = S().view;
      S().setView({ panX: v.panX + dx, panY: v.panY + dy });
      return;
    }

    const { c, r } = toCell(e.clientX, e.clientY);

    if (!cursorRaf.current) {
      cursorRaf.current = true;
      requestAnimationFrame(() => {
        cursorRaf.current = false;
        const cur = S().cursor;
        if (!cur || cur.c !== c || cur.r !== r) S().setCursor({ c, r });
      });
    }

    if (painting.current && (tool === 'pen' || tool === 'eraser')) {
      const last = lastCell.current;
      if (last && (last.c !== c || last.r !== r)) {
        queuePaint([...linePoints(last.c, last.r, c, r)]);
        lastCell.current = { c, r };
      } else if (!last) {
        lastCell.current = { c, r };
      }
      return;
    }

    if (drag) setDrag({ ...drag, bx: c, by: r });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (pointers.current.size < 2) pinch.current = null;
    panLast.current = null;

    if (painting.current) {
      painting.current = false;
      lastCell.current = null;
      flushPaint();
    }

    if (drag) {
      const { mode, ax, ay, bx, by } = drag;
      const d = S().design;
      if (mode === 'select') {
        if (ax === bx && ay === by) {
          S().setSelection(null);
        } else {
          const rn = normRect({ c: ax, r: ay }, { c: bx, r: by });
          S().setSelection({
            c0: clamp(rn.c0, 0, d.loom.columns - 1),
            r0: clamp(rn.r0, 0, d.loom.rows - 1),
            c1: clamp(rn.c1, 0, d.loom.columns - 1),
            r1: clamp(rn.r1, 0, d.loom.rows - 1),
          });
        }
      } else {
        S().pushHistory();
        if (mode === 'line') S().paintLine(ax, ay, bx, by, S().activeColor);
        else
          S().paintRect(
            normRect({ c: ax, r: ay }, { c: bx, r: by }),
            S().activeColor,
            mode === 'rectFill',
          );
      }
      setDrag(null);
      anchor.current = null;
    }
  };

  // ---- edge resize handles ------------------------------------------
  const onHandleDown = (axis: 'cols' | 'rows') => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    S().pushHistory();
    resizing.current = axis;
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!resizing.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const v = S().view;
    if (resizing.current === 'cols') {
      const n = Math.round((e.clientX - rect.left - v.panX) / (PX_PER_COL * v.zoom));
      S().setColumns(clamp(n, 1, 400));
    } else {
      const n = Math.round(
        (e.clientY - rect.top - v.panY) / (PX_PER_COL * v.zoom * asp),
      );
      S().setRows(clamp(n, 1, 1000));
    }
  };
  const onHandleUp = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    resizing.current = null;
  };

  const cellH = scale * asp;
  const gridRight = view.panX + design.loom.columns * scale;
  const gridBottom = view.panY + design.loom.rows * cellH;
  const gridTop = clamp(view.panY, 0, size.h);
  const gridLeft = clamp(view.panX, 0, size.w);
  const gridVisH = clamp(gridBottom, 0, size.h) - gridTop;
  const gridVisW = clamp(gridRight, 0, size.w) - gridLeft;

  return (
    <div
      className="canvas-wrap"
      ref={wrapRef}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {gridRight > -40 && gridRight < size.w + 40 && gridVisH > 20 && (
        <div
          className="edge-handle right"
          style={{ left: gridRight - 11, top: gridTop, height: gridVisH }}
          onPointerDown={onHandleDown('cols')}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          title="Drag to add / remove columns"
        >
          <span className="pip">
            {resizing.current === 'cols' ? design.loom.columns : '⋮'}
          </span>
        </div>
      )}
      {gridBottom > -40 && gridBottom < size.h + 40 && gridVisW > 20 && (
        <div
          className="edge-handle bottom"
          style={{ top: gridBottom - 11, left: gridLeft, width: gridVisW }}
          onPointerDown={onHandleDown('rows')}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          title="Drag to add / remove rows"
        >
          <span>{resizing.current === 'rows' ? design.loom.rows : '⋯'}</span>
        </div>
      )}
    </div>
  );
}

function rectCells(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  filled: boolean,
): Array<[number, number]> {
  const c0 = Math.min(ax, bx);
  const c1 = Math.max(ax, bx);
  const r0 = Math.min(ay, by);
  const r1 = Math.max(ay, by);
  const out: Array<[number, number]> = [];
  for (let y = r0; y <= r1; y++)
    for (let x = c0; x <= c1; x++)
      if (filled || y === r0 || y === r1 || x === c0 || x === c1) out.push([x, y]);
  return out;
}
