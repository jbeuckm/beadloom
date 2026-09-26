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
import { emptyGrid, linePoints, normRect } from '../lib/grid';
import { compositeLayers } from '../lib/layers';
import { rgbToLab, type Lab } from '../lib/color';
import { adjustRgb, traceImageLayer } from '../lib/trace';
import { paletteFromImage, rgbToHex } from '../lib/quantize';
import {
  pointInPolygon,
  selburoseInsetShift,
  selburoseParallelograms,
  shapeGridBBox,
  snapSelburoseCenter,
} from '../lib/shapes';
import type {
  BeadDesign,
  ImageLayer,
  SelburoseObject,
  ShapeObject,
} from '../types';
import { EMPTY, PX_PER_COL, type Rect } from '../types';
import { clamp } from '../util';
import {
  ensureImage,
  getBitmap,
  imageSamples,
  subscribeImages,
} from '../lib/referenceImage';

type RefMode = 'move' | 'scale' | 'rotate' | 'skewX' | 'skewY';

/** Forward transform: image-local pixel (lx, ly) → screen point. */
function refForwardScreen(
  ref: ImageLayer,
  panX: number,
  panY: number,
  sc: number,
) {
  const deg = Math.PI / 180;
  const th = ref.rotationDeg * deg;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const bx = Math.tan(ref.skewXDeg * deg);
  const by = Math.tan(ref.skewYDeg * deg);
  return (lx: number, ly: number): [number, number] => {
    const px = (lx - ref.w / 2) * ref.scaleX;
    const py = (ly - ref.h / 2) * ref.scaleY;
    const sx = px + bx * py;
    const sy = by * px + py;
    const rx = sx * cos - sy * sin;
    const ry = sx * sin + sy * cos;
    return [panX + (rx + ref.x) * sc, panY + (ry + ref.y) * sc];
  };
}

function refHandles(ref: ImageLayer, panX: number, panY: number, sc: number) {
  const f = refForwardScreen(ref, panX, panY, sc);
  const corners: Array<[number, number]> = [
    f(0, 0),
    f(ref.w, 0),
    f(ref.w, ref.h),
    f(0, ref.h),
  ];
  const edges: Array<[number, number]> = [
    f(ref.w / 2, 0),
    f(ref.w, ref.h / 2),
    f(ref.w / 2, ref.h),
    f(0, ref.h / 2),
  ];
  const centre = f(ref.w / 2, ref.h / 2);
  const tm = edges[0];
  const dx = tm[0] - centre[0];
  const dy = tm[1] - centre[1];
  const L = Math.hypot(dx, dy) || 1;
  const rot: [number, number] = [tm[0] + (dx / L) * 24, tm[1] + (dy / L) * 24];
  return { corners, edges, centre, rot };
}

function hitRefHandle(
  sx: number,
  sy: number,
  ref: ImageLayer,
  panX: number,
  panY: number,
  sc: number,
): RefMode | 'none' {
  const { corners, edges, rot } = refHandles(ref, panX, panY, sc);
  const near = (p: [number, number], t = 13) =>
    Math.hypot(sx - p[0], sy - p[1]) <= t;
  if (near(rot)) return 'rotate';
  if (corners.some((c) => near(c))) return 'scale';
  if (near(edges[0]) || near(edges[2])) return 'skewX';
  if (near(edges[1]) || near(edges[3])) return 'skewY';
  if (pointInPolygon(sx, sy, corners)) return 'move';
  return 'none';
}

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
  const selectionMask = useStore((s) => s.selectionMask);
  const clipboard = useStore((s) => s.clipboard);
  const settings = useStore((s) => s.settings);
  const highlightRow = useStore((s) => s.highlightRow);
  const view = useStore((s) => s.view);
  const pasteMode = useStore((s) => s.pasteMode);
  const cursor = useStore((s) => s.cursor);
  const editingImage = useStore((s) => s.editingImage);
  const selectedSelburoseId = useStore((s) => s.selectedSelburoseId);
  const selectedShapeId = useStore((s) => s.selectedShapeId);
  const [refNonce, setRefNonce] = useState(0);

  // Redraw when any image-layer bitmap finishes decoding.
  useEffect(() => subscribeImages(() => setRefNonce((n) => n + 1)), []);

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
  const refGesture = useRef<null | {
    id: string; // image layer being transformed
    mode: RefMode;
    edge: number; // +1 top/right handle, -1 bottom/left
    gx0: number;
    gy0: number;
    x0: number;
    y0: number;
    sx0: number; // scaleX at gesture start
    sy0: number; // scaleY at gesture start
    qx0: number; // grab point in the image's un-rotated frame
    qy0: number;
    rot0: number;
    d0: number;
    ang0: number;
  }>(null);

  const pendingPaint = useRef<Array<[number, number]>>([]);
  const paintRaf = useRef(false);
  const cursorRaf = useRef(false);

  // selburose interaction
  const objDrag = useRef<null | {
    id: string;
    gx0: number;
    gy0: number;
    ox: number;
    oy: number;
  }>(null);
  // line / box / poly shape interaction: move the whole shape, an end / corner,
  // or one polygon vertex
  const shapeGesture = useRef<null | {
    id: string;
    mode: 'move' | 'p0' | 'p1' | 'vertex';
    vi: number; // vertex index for 'vertex'
    gx0: number;
    gy0: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    pts0: Array<[number, number]>; // poly vertices at gesture start
  }>(null);
  // dragging the pixels inside a marquee/wand selection
  const selMove = useRef<null | {
    gx0: number;
    gy0: number;
    c0: number;
    r0: number;
    moved: boolean;
  }>(null);
  const lastTap = useRef<null | { id: string; t: number }>(null);
  // memoised proposed palette for the edited image's preview
  const proposedRef = useRef<null | { key: string; hex: string[]; labs: Lab[] }>(
    null,
  );

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

  /** Continuous cell position: x in column units, y in row units. */
  const toCellF = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const v = S().view;
      const sc = PX_PER_COL * v.zoom;
      return {
        cx: (clientX - rect.left - v.panX) / sc,
        cy: (clientY - rect.top - v.panY) / (sc * asp),
      };
    },
    [asp],
  );

  /** Continuous position in grid column-units (both axes), for the reference image. */
  const toGridUnits = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const v = S().view;
    const sc = PX_PER_COL * v.zoom;
    return {
      gx: (clientX - rect.left - v.panX) / sc,
      gy: (clientY - rect.top - v.panY) / sc,
    };
  }, []);

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

    const composite = compositeLayers(design);
    const off = { scale, offX: view.panX, offY: view.panY };
    drawBase(ctx, design, composite, off, size.w, size.h, {
      showGrid: settings.showGrid,
      showRowNumbers: settings.showRowNumbers,
      highlightRow,
    });

    const cellH = scale * asp;
    const cols = design.loom.columns;
    const rows = design.loom.rows;
    const px = (c: number) => view.panX + c * scale;
    const py = (r: number) => view.panY + r * cellH;

    // An image layer's palette-matched trace is already in `composite` (it stays
    // there while you edit other layers). The layer being edited additionally
    // shows the bitmap + transform handles, and — in "proposed" mode — a preview
    // of the N-colour palette it would lift off the image.
    void refNonce;
    const deg = Math.PI / 180;
    {
      const edited = design.layers.find(
        (l): l is ImageLayer => l.kind === 'image' && l.id === editingImage,
      );
      if (edited) {
        ensureImage(edited.src);
        const bmp = getBitmap(edited.src);

        let hex: string[] = [];
        let labs: Lab[] = [];
        if (edited.paletteMode === 'proposed') {
          const key = [
            edited.src,
            edited.paletteColors,
            edited.contrast,
            edited.brightness,
            edited.warmth,
            edited.equalize,
          ].join('|');
          if (!proposedRef.current || proposedRef.current.key !== key) {
            const smp = imageSamples(edited.src).map((c) => adjustRgb(c, edited));
            const pal = smp.length
              ? paletteFromImage(smp, edited.paletteColors)
              : [];
            proposedRef.current = {
              key,
              hex: pal.map(rgbToHex),
              labs: pal.map((c) => rgbToLab(c[0], c[1], c[2])),
            };
          }
          hex = proposedRef.current.hex;
          labs = proposedRef.current.labs;
        }

        if (labs.length && bmp) {
          const preview = traceImageLayer(
            emptyGrid(cols, rows),
            edited,
            labs,
            cols,
            rows,
            asp,
          );
          ctx.save();
          for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++) {
              const v = preview[r][c];
              if (v < 0) continue;
              ctx.fillStyle = hex[v] ?? '#000';
              ctx.fillRect(px(c), py(r), scale + 0.6, cellH + 0.6);
            }
          ctx.restore();
        }

        // the bitmap itself, semi-transparent, for reference while positioning
        if (bmp) {
          const dw = edited.w * edited.scaleX;
          const dh = edited.h * edited.scaleY;
          ctx.save();
          ctx.translate(view.panX, view.panY);
          ctx.scale(scale, scale);
          ctx.translate(edited.x, edited.y);
          ctx.rotate(edited.rotationDeg * deg);
          ctx.transform(
            1,
            Math.tan(edited.skewYDeg * deg),
            Math.tan(edited.skewXDeg * deg),
            1,
            0,
            0,
          );
          ctx.globalAlpha = clamp(edited.opacity, 0, 1);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(bmp, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
        }
      }

      // transform box + handles for the image being edited (screen space)
      if (edited && tool === 'reference') {
        const { corners, edges, rot } = refHandles(
          edited,
          view.panX,
          view.panY,
          scale,
        );
        ctx.save();
        ctx.strokeStyle = '#1268ff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(corners[0][0], corners[0][1]);
        for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(edges[0][0], edges[0][1]);
        ctx.lineTo(rot[0], rot[1]);
        ctx.stroke();

        const dot = (p: [number, number], r: number, fill: string) => {
          ctx.beginPath();
          ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = '#1268ff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        };
        const box = (p: [number, number]) => {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#1268ff';
          ctx.lineWidth = 1.5;
          ctx.fillRect(p[0] - 5, p[1] - 5, 10, 10);
          ctx.strokeRect(p[0] - 5, p[1] - 5, 10, 10);
        };
        corners.forEach(box);
        edges.forEach((p) => dot(p, 5, '#dbe7ff'));
        dot(rot, 6, '#fff');
        ctx.restore();
      }
    }

    // Selburose layers are already in the composite; draw the selection box.
    if (selectedSelburoseId) {
      const sel = starById(design, selectedSelburoseId);
      if (sel) {
        const b = selburoseGridBBox(sel);
        ctx.save();
        ctx.strokeStyle = '#1268ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
          px(b.minX),
          py(b.minY),
          (b.maxX - b.minX) * scale,
          (b.maxY - b.minY) * cellH,
        );
        ctx.restore();
      }
    }

    // Shape (line / box / poly) layers: selection box + editable handles.
    if (selectedShapeId) {
      const sh = shapeById(design, selectedShapeId);
      if (sh) {
        const b = shapeGridBBox({
          kind: sh.kind,
          x0: sh.x0,
          y0: sh.y0,
          x1: sh.x1,
          y1: sh.y1,
          points: sh.points,
          closed: sh.closed,
          thickness: sh.thickness,
          fill: sh.fill,
        });
        ctx.save();
        ctx.strokeStyle = '#1268ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
          px(b.minX),
          py(b.minY),
          (b.maxX - b.minX) * scale,
          (b.maxY - b.minY) * cellH,
        );
        ctx.setLineDash([]);
        const handles: Array<[number, number]> =
          sh.kind === 'poly'
            ? sh.points
            : [
                [sh.x0, sh.y0],
                [sh.x1, sh.y1],
              ];
        if (sh.kind === 'poly' && sh.points.length > 1) {
          // trace the spine so vertices are easy to see while editing
          ctx.beginPath();
          ctx.moveTo(px(sh.points[0][0] + 0.5), py(sh.points[0][1] + 0.5));
          for (let i = 1; i < sh.points.length; i++)
            ctx.lineTo(px(sh.points[i][0] + 0.5), py(sh.points[i][1] + 0.5));
          if (sh.closed) ctx.closePath();
          ctx.strokeStyle = 'rgba(18,104,255,0.6)';
          ctx.setLineDash([4, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.strokeStyle = '#1268ff';
        for (const [hx, hy] of handles) {
          const cxp = px(hx + 0.5);
          const cyp = py(hy + 0.5);
          ctx.beginPath();
          ctx.arc(cxp, cyp, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // selection: a wand mask draws the region outline, otherwise a rect marquee
    if (selection && selectionMask) {
      ctx.save();
      const has = (c: number, r: number) => selectionMask.has(r * cols + c);
      ctx.fillStyle = 'rgba(18,104,255,0.12)';
      for (let r = selection.r0; r <= selection.r1; r++)
        for (let c = selection.c0; c <= selection.c1; c++)
          if (has(c, r)) ctx.fillRect(px(c), py(r), scale + 0.5, cellH + 0.5);
      ctx.beginPath();
      for (let r = selection.r0; r <= selection.r1; r++) {
        for (let c = selection.c0; c <= selection.c1; c++) {
          if (!has(c, r)) continue;
          const x = px(c);
          const y = py(r);
          if (!has(c - 1, r)) { ctx.moveTo(x, y); ctx.lineTo(x, y + cellH); }
          if (!has(c + 1, r)) { ctx.moveTo(x + scale, y); ctx.lineTo(x + scale, y + cellH); }
          if (!has(c, r - 1)) { ctx.moveTo(x, y); ctx.lineTo(x + scale, y); }
          if (!has(c, r + 1)) { ctx.moveTo(x, y + cellH); ctx.lineTo(x + scale, y + cellH); }
        }
      }
      ctx.strokeStyle = '#1268ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.restore();
    } else if (selection) {
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
        tool === 'wand' ||
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
    selectionMask,
    drag,
    settings,
    highlightRow,
    activeColor,
    clipboard,
    pasteMode,
    cursor,
    tool,
    editingImage,
    refNonce,
    selectedSelburoseId,
    selectedShapeId,
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

    // reference tool: transform the edited image layer via its on-canvas handles
    if (tool === 'reference') {
      const ref = d.layers.find(
        (l): l is ImageLayer =>
          l.kind === 'image' && l.id === S().editingImage && l.visible,
      );
      if (!ref) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const vv = S().view;
      const sc = PX_PER_COL * vv.zoom;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const mode = hitRefHandle(sx, sy, ref, vv.panX, vv.panY, sc);
      if (mode === 'none') return;
      const g = toGridUnits(e.clientX, e.clientY);
      const { edges } = refHandles(ref, vv.panX, vv.panY, sc);
      let edge = 1;
      if (mode === 'skewX') {
        edge =
          Math.hypot(sx - edges[2][0], sy - edges[2][1]) <
          Math.hypot(sx - edges[0][0], sy - edges[0][1])
            ? -1
            : 1;
      } else if (mode === 'skewY') {
        edge =
          Math.hypot(sx - edges[3][0], sy - edges[3][1]) <
          Math.hypot(sx - edges[1][0], sy - edges[1][1])
            ? -1
            : 1;
      }
      S().pushHistory();
      {
        const th = (ref.rotationDeg * Math.PI) / 180;
        const cos = Math.cos(-th);
        const sin = Math.sin(-th);
        const dx = g.gx - ref.x;
        const dy = g.gy - ref.y;
        refGesture.current = {
          id: ref.id,
          mode,
          edge,
          gx0: g.gx,
          gy0: g.gy,
          x0: ref.x,
          y0: ref.y,
          sx0: ref.scaleX,
          sy0: ref.scaleY,
          qx0: dx * cos - dy * sin,
          qy0: dx * sin + dy * cos,
          rot0: ref.rotationDeg,
          d0: Math.max(1e-3, Math.hypot(g.gx - ref.x, g.gy - ref.y)),
          ang0: Math.atan2(g.gy - ref.y, g.gx - ref.x),
        };
      }
      return;
    }

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
      case 'wand': {
        if (inb) S().selectWand(c, r);
        else {
          S().setSelection(null);
        }
        break;
      }
      case 'eyedropper': {
        const g = toCellF(e.clientX, e.clientY);
        const stars = visibleStars(d);
        const hit = hitSelburose(stars, g.cx, g.cy);
        if (hit) {
          const o = stars.find((x) => x.id === hit)!;
          S().setActiveColor(o.colorIndex);
          break;
        }
        const shp = hitShape(visibleShapes(d), g.cx, g.cy);
        if (shp) {
          S().setActiveColor(shapeById(d, shp)!.colorIndex);
          break;
        }
        if (inb) S().pickAt(c, r);
        break;
      }
      case 'select': {
        const g = toCellF(e.clientX, e.clientY);

        // ---- line / box shapes: end / corner handles first, then the body
        const grab = 0.6 + 9 / (PX_PER_COL * S().view.zoom);
        const sSel = selectedShapeId ? shapeById(d, selectedShapeId) : undefined;
        if (sSel) {
          const near = (hx: number, hy: number) =>
            Math.hypot(g.cx - (hx + 0.5), g.cy - (hy + 0.5)) <= grab;

          // ---- polygon vertex editing ----
          if (sSel.kind === 'poly') {
            const vi = sSel.points.findIndex((p) => near(p[0], p[1]));
            if (vi >= 0) {
              if (e.altKey || e.button === 2) {
                S().removeShapePoint(sSel.id, vi);
                return;
              }
              S().pushHistory();
              shapeGesture.current = {
                id: sSel.id,
                mode: 'vertex',
                vi,
                gx0: g.cx,
                gy0: g.cy,
                x0: 0,
                y0: 0,
                x1: 0,
                y1: 0,
                pts0: [],
              };
              return;
            }
            // click on an edge -> insert a new vertex there
            const n = sSel.points.length;
            const segs = sSel.closed ? n : n - 1;
            for (let i = 0; i < segs; i++) {
              const a = sSel.points[i];
              const bb = sSel.points[(i + 1) % n];
              if (
                distToSegment(
                  g.cx,
                  g.cy,
                  a[0] + 0.5,
                  a[1] + 0.5,
                  bb[0] + 0.5,
                  bb[1] + 0.5,
                ) <=
                Math.max(0.7, sSel.thickness / 2 + 0.4)
              ) {
                S().insertShapePoint(sSel.id, i + 1, [
                  Math.round(g.cx - 0.5),
                  Math.round(g.cy - 0.5),
                ]);
                const nsh = shapeById(S().design, sSel.id);
                S().pushHistory();
                shapeGesture.current = {
                  id: sSel.id,
                  mode: 'vertex',
                  vi: i + 1,
                  gx0: g.cx,
                  gy0: g.cy,
                  x0: 0,
                  y0: 0,
                  x1: 0,
                  y1: 0,
                  pts0: [],
                };
                void nsh;
                return;
              }
            }
          }

          const endMode: 'p0' | 'p1' | null = near(sSel.x0, sSel.y0)
            ? 'p0'
            : near(sSel.x1, sSel.y1)
              ? 'p1'
              : null;
          const b = shapeGridBBox({
            kind: sSel.kind,
            x0: sSel.x0,
            y0: sSel.y0,
            x1: sSel.x1,
            y1: sSel.y1,
            points: sSel.points,
            closed: sSel.closed,
            thickness: sSel.thickness,
            fill: sSel.fill,
          });
          const inBox =
            g.cx >= b.minX - 0.5 &&
            g.cx <= b.maxX + 0.5 &&
            g.cy >= b.minY - 0.5 &&
            g.cy <= b.maxY + 0.5;
          if ((sSel.kind !== 'poly' && endMode) || inBox) {
            S().pushHistory();
            shapeGesture.current = {
              id: sSel.id,
              mode: sSel.kind !== 'poly' && endMode ? endMode : 'move',
              vi: -1,
              gx0: g.cx,
              gy0: g.cy,
              x0: sSel.x0,
              y0: sSel.y0,
              x1: sSel.x1,
              y1: sSel.y1,
              pts0: sSel.points.map((p): [number, number] => [p[0], p[1]]),
            };
            return;
          }
        }
        const shpHit = hitShape(visibleShapes(d), g.cx, g.cy);
        if (shpHit) {
          const now = Date.now();
          if (
            lastTap.current &&
            lastTap.current.id === shpHit &&
            now - lastTap.current.t < 350
          ) {
            lastTap.current = null;
            S().selectShape(shpHit);
            S().openShapeEditor(shpHit);
            return;
          }
          lastTap.current = { id: shpHit, t: now };
          const o = shapeById(d, shpHit)!;
          S().selectShape(shpHit);
          S().pushHistory();
          shapeGesture.current = {
            id: shpHit,
            mode: 'move',
            vi: -1,
            gx0: g.cx,
            gy0: g.cy,
            x0: o.x0,
            y0: o.y0,
            x1: o.x1,
            y1: o.y1,
            pts0: o.points.map((p): [number, number] => [p[0], p[1]]),
          };
          return;
        }

        const stars = visibleStars(d);
        const hit = hitSelburose(stars, g.cx, g.cy);
        if (hit) {
          const now = Date.now();
          if (
            lastTap.current &&
            lastTap.current.id === hit &&
            now - lastTap.current.t < 350
          ) {
            lastTap.current = null;
            S().selectSelburose(hit);
            S().openSelburoseEditor(hit);
            return;
          }
          lastTap.current = { id: hit, t: now };
          const o = stars.find((x) => x.id === hit)!;
          S().selectSelburose(hit);
          S().pushHistory();
          objDrag.current = { id: hit, gx0: g.cx, gy0: g.cy, ox: o.cx, oy: o.cy };
          return;
        }
        // click inside an existing selection -> drag its pixels around
        const curSel = S().selection;
        if (
          curSel &&
          c >= curSel.c0 &&
          c <= curSel.c1 &&
          r >= curSel.r0 &&
          r <= curSel.r1 &&
          (!S().selectionMask ||
            S().selectionMask!.has(r * d.loom.columns + c))
        ) {
          selMove.current = {
            gx0: g.cx,
            gy0: g.cy,
            c0: curSel.c0,
            r0: curSel.r0,
            moved: false,
          };
          return;
        }
        S().selectSelburose(null);
        S().selectShape(null);
        anchor.current = { c, r };
        setDrag({ mode: 'select', ax: c, ay: r, bx: c, by: r });
        break;
      }
      case 'line':
      case 'rect':
      case 'rectFill': {
        anchor.current = { c, r };
        setDrag({ mode: tool as Drag['mode'], ax: c, ay: r, bx: c, by: r });
        break;
      }
      case 'poly': {
        if (!inb) return;
        const g = toCellF(e.clientX, e.clientY);
        const draft =
          selectedShapeId && shapeById(d, selectedShapeId)?.kind === 'poly'
            ? shapeById(d, selectedShapeId)!
            : null;
        if (!draft) {
          S().addShape({
            kind: 'poly',
            x0: c,
            y0: r,
            x1: c,
            y1: r,
            points: [[c, r]],
            closed: false,
            thickness: S().lineThickness,
            fill: false,
            colorIndex: S().activeColor,
          });
          break;
        }
        // click on / near the first vertex closes the path and finishes
        const first = draft.points[0];
        if (
          draft.points.length >= 3 &&
          Math.hypot(g.cx - (first[0] + 0.5), g.cy - (first[1] + 0.5)) <= 1.2
        ) {
          S().updateShape(draft.id, { closed: true });
          S().setTool('select');
          S().selectShape(draft.id);
          break;
        }
        // a second click on the last point (or on top of it) ends an open line
        const last = draft.points[draft.points.length - 1];
        if (
          draft.points.length >= 2 &&
          Math.abs(c - last[0]) <= 1 &&
          Math.abs(r - last[1]) <= 1
        ) {
          S().setTool('select');
          S().selectShape(draft.id);
          break;
        }
        S().appendShapePoint(draft.id, [c, r]);
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

    if (refGesture.current) {
      const g = refGesture.current;
      const p = toGridUnits(e.clientX, e.clientY);
      const ref = S().design.layers.find(
        (l): l is ImageLayer => l.kind === 'image' && l.id === g.id,
      );
      if (!ref) return;

      let patch: Partial<ImageLayer> = {};
      if (g.mode === 'move') {
        patch = { x: g.x0 + (p.gx - g.gx0), y: g.y0 + (p.gy - g.gy0) };
      } else if (g.mode === 'scale') {
        // read the grab point in the image's un-rotated frame
        const th = (g.rot0 * Math.PI) / 180;
        const cos = Math.cos(-th);
        const sin = Math.sin(-th);
        const dx = p.gx - g.x0;
        const dy = p.gy - g.y0;
        const qx = dx * cos - dy * sin;
        const qy = dx * sin + dy * cos;
        const minX = 2 / ref.w;
        const minY = 2 / ref.h;
        if (e.shiftKey) {
          // Shift locks the aspect ratio — one uniform factor.
          const f =
            Math.hypot(qx, qy) / Math.max(1e-6, Math.hypot(g.qx0, g.qy0));
          patch = {
            scaleX: Math.max(g.sx0 * f, minX),
            scaleY: Math.max(g.sy0 * f, minY),
          };
        } else {
          // default — each axis follows its own edge freely
          const fx = qx / (Math.abs(g.qx0) < 1e-6 ? 1e-6 : g.qx0);
          const fy = qy / (Math.abs(g.qy0) < 1e-6 ? 1e-6 : g.qy0);
          patch = {
            scaleX: Math.max(g.sx0 * fx, minX),
            scaleY: Math.max(g.sy0 * fy, minY),
          };
        }
      } else if (g.mode === 'rotate') {
        const ang = Math.atan2(p.gy - g.y0, p.gx - g.x0);
        let deg = g.rot0 + ((ang - g.ang0) * 180) / Math.PI;
        deg = ((((deg + 180) % 360) + 360) % 360) - 180;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15; // snap to 15° steps
        patch = { rotationDeg: deg };
      } else {
        // skew — undo translate + rotation, then read the offset in skew-space
        const th = (g.rot0 * Math.PI) / 180;
        const cos = Math.cos(-th);
        const sin = Math.sin(-th);
        const dx = p.gx - g.x0;
        const dy = p.gy - g.y0;
        const qx = dx * cos - dy * sin;
        const qy = dx * sin + dy * cos;
        if (g.mode === 'skewX') {
          const bx = (-g.edge * 2 * qx) / (ref.h * g.sy0 || 1e-6);
          patch = { skewXDeg: clamp((Math.atan(bx) * 180) / Math.PI, -70, 70) };
        } else {
          const by = (g.edge * 2 * qy) / (ref.w * g.sx0 || 1e-6);
          patch = { skewYDeg: clamp((Math.atan(by) * 180) / Math.PI, -70, 70) };
        }
      }
      S().updateImageLayer(g.id, patch);
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

    if (objDrag.current) {
      const od = objDrag.current;
      const g = toCellF(e.clientX, e.clientY);
      const o = starById(S().design, od.id);
      const m = o?.center ?? 'cell';
      S().moveSelburose(
        od.id,
        snapSelburoseCenter(od.ox + (g.cx - od.gx0), m),
        snapSelburoseCenter(od.oy + (g.cy - od.gy0), m),
      );
      return;
    }

    if (selMove.current) {
      const sm = selMove.current;
      const g = toCellF(e.clientX, e.clientY);
      const sel = S().selection;
      if (sel) {
        const wantC0 = sm.c0 + Math.round(g.cx - sm.gx0);
        const wantR0 = sm.r0 + Math.round(g.cy - sm.gy0);
        const stepDx = wantC0 - sel.c0;
        const stepDy = wantR0 - sel.r0;
        if (stepDx || stepDy) {
          S().moveSelection(stepDx, stepDy, sm.moved);
          sm.moved = true;
        }
      }
      return;
    }

    if (shapeGesture.current) {
      const sg = shapeGesture.current;
      const g = toCellF(e.clientX, e.clientY);
      const ddx = Math.round(g.cx - sg.gx0);
      const ddy = Math.round(g.cy - sg.gy0);
      const { columns, rows } = S().design.loom;
      if (sg.mode === 'vertex') {
        S().moveShapePoint(sg.id, sg.vi, [
          clamp(Math.round(g.cx - 0.5), 0, columns - 1),
          clamp(Math.round(g.cy - 0.5), 0, rows - 1),
        ]);
      } else if (sg.mode === 'move') {
        // absolute from the gesture-start geometry — no compounding
        if (sg.pts0.length) {
          const xs = sg.pts0.map((p) => p[0]);
          const ys = sg.pts0.map((p) => p[1]);
          const dx = Math.round(
            clamp(ddx, -Math.min(...xs), columns - 1 - Math.max(...xs)),
          );
          const dy = Math.round(
            clamp(ddy, -Math.min(...ys), rows - 1 - Math.max(...ys)),
          );
          S().updateShape(sg.id, {
            points: sg.pts0.map((p): [number, number] => [p[0] + dx, p[1] + dy]),
          });
        } else {
          const minX = Math.min(sg.x0, sg.x1);
          const maxX = Math.max(sg.x0, sg.x1);
          const minY = Math.min(sg.y0, sg.y1);
          const maxY = Math.max(sg.y0, sg.y1);
          const dx = Math.round(clamp(ddx, -minX, columns - 1 - maxX));
          const dy = Math.round(clamp(ddy, -minY, rows - 1 - maxY));
          S().updateShape(sg.id, {
            x0: sg.x0 + dx,
            y0: sg.y0 + dy,
            x1: sg.x1 + dx,
            y1: sg.y1 + dy,
          });
        }
      } else {
        const cx = clamp((sg.mode === 'p0' ? sg.x0 : sg.x1) + ddx, 0, columns - 1);
        const cy = clamp((sg.mode === 'p0' ? sg.y0 : sg.y1) + ddy, 0, rows - 1);
        S().updateShape(
          sg.id,
          sg.mode === 'p0' ? { x0: cx, y0: cy } : { x1: cx, y1: cy },
        );
      }
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
    refGesture.current = null;

    if (objDrag.current) {
      objDrag.current = null;
      return;
    }

    if (shapeGesture.current) {
      shapeGesture.current = null;
      return;
    }

    if (selMove.current) {
      selMove.current = null;
      return;
    }

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
      } else if (!(ax === bx && ay === by) || mode === 'line') {
        // Each line / box becomes its own live, re-editable shape layer.
        const { columns, rows } = d.loom;
        const cl = (v: number, m: number) => clamp(v, 0, m - 1);
        S().addShape({
          kind: mode === 'line' ? 'line' : 'box',
          x0: cl(ax, columns),
          y0: cl(ay, rows),
          x1: cl(bx, columns),
          y1: cl(by, rows),
          points: [],
          closed: false,
          thickness: mode === 'line' ? S().lineThickness : 1,
          fill: mode === 'rectFill',
          colorIndex: S().activeColor,
        });
      }
      setDrag(null);
      anchor.current = null;
    }
  };

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
    </div>
  );
}

function selburoseParams(o: SelburoseObject) {
  return {
    cx: o.cx,
    cy: o.cy,
    outerR: o.size,
    rotationDeg: o.rotationDeg,
    gap: o.gap,
  };
}

/** Stars from visible selburose layers, bottom → top. */
function visibleStars(design: BeadDesign): SelburoseObject[] {
  const out: SelburoseObject[] = [];
  for (const l of design.layers)
    if (l.kind === 'selburose' && l.visible) out.push(l.star);
  return out;
}

function starById(design: BeadDesign, id: string): SelburoseObject | undefined {
  const l = design.layers.find((x) => x.kind === 'selburose' && x.id === id);
  return l && l.kind === 'selburose' ? l.star : undefined;
}

function selburoseGridBBox(o: SelburoseObject) {
  const quads = selburoseParallelograms(selburoseParams(o));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of quads)
    for (const [x, y] of q) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  return { minX, minY, maxX, maxY };
}

/** Topmost object whose body — or central hole — is under the point. */
function hitSelburose(
  objs: SelburoseObject[],
  gx: number,
  gy: number,
): string | null {
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    const quads = selburoseParallelograms(selburoseParams(o));
    if (quads.some((q) => pointInPolygon(gx, gy, q))) return o.id;
    // the central hole reads as part of the star: allow grabbing it there
    const hole = selburoseInsetShift(o.gap) + 0.75;
    if (Math.hypot(gx - o.cx, gy - o.cy) <= hole) return o.id;
  }
  return null;
}

/** Shapes from visible shape layers, bottom → top. */
function visibleShapes(design: BeadDesign): ShapeObject[] {
  const out: ShapeObject[] = [];
  for (const l of design.layers)
    if (l.kind === 'shape' && l.visible) out.push(l.shape);
  return out;
}

function shapeById(design: BeadDesign, id: string): ShapeObject | undefined {
  const l = design.layers.find((x) => x.kind === 'shape' && x.id === id);
  return l && l.kind === 'shape' ? l.shape : undefined;
}

/** Distance from point (px,py) to segment (ax,ay)-(bx,by), all in cell units. */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Topmost shape under the point (cell-space), or null. */
function hitShape(shapes: ShapeObject[], gx: number, gy: number): string | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.kind === 'poly') {
      const pts = s.points;
      if (s.closed && s.fill && pts.length >= 3) {
        if (pointInPolygon(gx, gy, pts.map((p) => [p[0] + 0.5, p[1] + 0.5])))
          return s.id;
      }
      const r = Math.max(0.7, s.thickness / 2 + 0.4);
      const segs = s.closed ? pts.length : pts.length - 1;
      for (let k = 0; k < segs; k++) {
        const a = pts[k];
        const b = pts[(k + 1) % pts.length];
        if (
          distToSegment(gx, gy, a[0] + 0.5, a[1] + 0.5, b[0] + 0.5, b[1] + 0.5) <=
          r
        )
          return s.id;
      }
      continue;
    }
    if (s.kind === 'line') {
      const r = Math.max(0.6, s.thickness / 2 + 0.4);
      if (distToSegment(gx, gy, s.x0 + 0.5, s.y0 + 0.5, s.x1 + 0.5, s.y1 + 0.5) <= r)
        return s.id;
    } else {
      const c0 = Math.min(s.x0, s.x1);
      const c1 = Math.max(s.x0, s.x1) + 1;
      const r0 = Math.min(s.y0, s.y1);
      const r1 = Math.max(s.y0, s.y1) + 1;
      const inside = gx >= c0 && gx <= c1 && gy >= r0 && gy <= r1;
      if (!inside) continue;
      if (s.fill) return s.id;
      const t = Math.max(1, s.thickness) + 0.6;
      if (gx - c0 <= t || c1 - gx <= t || gy - r0 <= t || r1 - gy <= t)
        return s.id;
    }
  }
  return null;
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
