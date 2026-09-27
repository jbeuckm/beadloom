import type { Page } from '@playwright/test';

/** Mirrors PX_PER_COL / cellAspect in the app. */
export const PX_PER_COL = 26;
export const CELL_ASPECT = 0.8;

/** The subset of store state we read in tests. */
export async function snapshot(page: Page) {
  return page.evaluate(() => {
    // @ts-expect-error injected by src/main.tsx in dev
    const s = window.__beadloom.getState();
    // @ts-expect-error injected
    const grid = window.__beadloomComposite();
    let beads = 0;
    const used = new Set<number>();
    for (const row of grid)
      for (const v of row)
        if (v >= 0) {
          beads++;
          used.add(v);
        }
    const selburoseLayers = s.design.layers.filter(
      (l: any) => l.kind === 'selburose',
    );
    let rasterBeads = 0;
    for (const l of s.design.layers)
      if (l.kind === 'raster')
        for (const row of l.data) for (const v of row) if (v >= 0) rasterBeads++;
    return {
      columns: s.design.loom.columns,
      rows: s.design.loom.rows,
      cellAspect: s.design.loom.cellAspect,
      beads,
      rasterBeads,
      coloursUsed: used.size,
      paletteSize: s.design.palette.colors.length,
      paletteName: s.design.palette.name,
      activeColor: s.activeColor,
      background: s.design.background,
      dirty: s.dirty,
      tool: s.tool,
      pasteMode: s.pasteMode,
      selection: s.selection,
      hasClipboard: !!s.clipboard,
      clipboard: s.clipboard ? { w: s.clipboard.w, h: s.clipboard.h } : null,
      workColumn: s.workColumn,
      settings: s.settings,
      layers: s.design.layers.map((l: any) => ({
        id: l.id,
        kind: l.kind,
        name: l.name,
        visible: l.visible,
        locked: !!l.locked,
      })),
      activeLayer: s.activeLayer,
      selburoses: selburoseLayers.map((l: any) => ({ ...l.star })),
      shapes: s.design.layers
        .filter((l: any) => l.kind === 'shape')
        .map((l: any) => ({ ...l.shape })),
      lineThickness: s.lineThickness,
      imageLayers: s.design.layers
        .filter((l: any) => l.kind === 'image')
        .map((l: any) => ({
          id: l.id,
          name: l.name,
          visible: l.visible,
          w: l.w,
          h: l.h,
          x: l.x,
          y: l.y,
          scaleX: l.scaleX,
          scaleY: l.scaleY,
          rotationDeg: l.rotationDeg,
          skewXDeg: l.skewXDeg,
          skewYDeg: l.skewYDeg,
          opacity: l.opacity,
          contrast: l.contrast,
          brightness: l.brightness,
          warmth: l.warmth,
          equalize: l.equalize,
          paletteMode: l.paletteMode,
          paletteColors: l.paletteColors,
          coveredOnly: l.coveredOnly,
        })),
      selectedSelburoseId: s.selectedSelburoseId,
      editingSelburose: s.editingSelburose,
      selectedImageId: s.selectedImageId,
      editingImage: s.editingImage,
      selectedShapeId: s.selectedShapeId,
      editingShape: s.editingShape,
      rightPanel: s.rightPanel,
      undo: s.undoStack.length,
      redo: s.redoStack.length,
      name: s.design.meta.name,
      slotPath: s.slotPath,
      paletteSlotPath: s.paletteSlotPath,
      brushSize: s.brushSize,
      selectionMaskSize: s.selectionMask ? s.selectionMask.size : null,
      wandMode: s.wandMode,
      backgroundColor: s.design.backgroundColor ?? null,
      view: s.view,
      format: s.design.format,
    };
  });
}

export async function cellValue(page: Page, c: number, r: number): Promise<number> {
  return page.evaluate(
    ({ c, r }) =>
      // @ts-expect-error injected
      (window.__beadloomComposite()[r][c] as number),
    { c, r },
  );
}

export async function paletteHexes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    // @ts-expect-error injected
    window.__beadloom.getState().design.palette.colors.map((c: any) => c.hex),
  );
}

export async function paletteColors(
  page: Page,
): Promise<Array<{ name: string; hex: string; code?: string }>> {
  return page.evaluate(() =>
    // @ts-expect-error injected
    window.__beadloom.getState().design.palette.colors.map((c: any) => ({
      name: c.name,
      hex: c.hex,
      code: c.code,
    })),
  );
}

/** Open the Palette Library dialog from the palette panel header. */
export async function openPaletteLibrary(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Palettes', exact: true }).click();
  await page.locator('.modal', { hasText: 'Palette Library' }).waitFor();
}

/** Screen positions of the edited image layer's transform handles (mirrors LoomCanvas). */
export async function refHandles(page: Page) {
  const box = await page.locator('.canvas-wrap canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  const s = await snapshot(page);
  const r = s.imageLayers.find((l) => l.id === s.editingImage);
  if (!r) throw new Error('no image layer being edited');
  const sc = PX_PER_COL * s.view.zoom;
  const deg = Math.PI / 180;
  const th = r.rotationDeg * deg;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const bx = Math.tan(r.skewXDeg * deg);
  const by = Math.tan(r.skewYDeg * deg);
  const f = (lx: number, ly: number) => {
    const px = (lx - r.w / 2) * r.scaleX;
    const py = (ly - r.h / 2) * r.scaleY;
    const sx = px + bx * py;
    const sy = by * px + py;
    const rx = sx * cos - sy * sin;
    const ry = sx * sin + sy * cos;
    return {
      x: box.x + s.view.panX + (rx + r.x) * sc,
      y: box.y + s.view.panY + (ry + r.y) * sc,
    };
  };
  const corners = [f(0, 0), f(r.w, 0), f(r.w, r.h), f(0, r.h)];
  const edges = [f(r.w / 2, 0), f(r.w, r.h / 2), f(r.w / 2, r.h), f(0, r.h / 2)];
  const centre = f(r.w / 2, r.h / 2);
  const tm = edges[0];
  const dx = tm.x - centre.x;
  const dy = tm.y - centre.y;
  const L = Math.hypot(dx, dy) || 1;
  const rot = { x: tm.x + (dx / L) * 24, y: tm.y + (dy / L) * 24 };
  return { corners, edges, centre, rot };
}

/** Page-pixel centre of a grid cell, using the live pan/zoom transform. */
export async function cellPoint(page: Page, c: number, r: number) {
  const box = await page.locator('.canvas-wrap canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  const view = (await snapshot(page)).view;
  const scale = PX_PER_COL * view.zoom;
  return {
    x: box.x + view.panX + (c + 0.5) * scale,
    y: box.y + view.panY + (r + 0.5) * scale * CELL_ASPECT,
  };
}

export async function tapCell(page: Page, c: number, r: number): Promise<void> {
  const p = await cellPoint(page, c, r);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
}

export async function dragCells(
  page: Page,
  a: [number, number],
  b: [number, number],
  steps = 14,
): Promise<void> {
  const pa = await cellPoint(page, a[0], a[1]);
  const pb = await cellPoint(page, b[0], b[1]);
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move(pb.x, pb.y, { steps });
  await page.mouse.up();
}

/** Wait for first paint + the initial "fit to view" transform to settle. */
export async function waitForReady(page: Page): Promise<void> {
  await page.locator('.canvas-wrap canvas').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    // @ts-expect-error injected
    const s = window.__beadloom?.getState();
    return !!s && s.viewport.w > 0 && (s.view.panX !== 0 || s.view.panY !== 0);
  });
}

/** A tool button in the left rail, matched by its exact label text. */
export function toolButton(page: Page, label: string) {
  return page
    .locator('.tool')
    .filter({ has: page.getByText(label, { exact: true }) })
    .first();
}

export async function pickTool(page: Page, label: string): Promise<void> {
  await toolButton(page, label).click();
}

export async function openFileMenu(page: Page, itemText: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: /^File/ }).click();
  await page.locator('.menu-item').filter({ hasText: itemText }).first().click();
}

/** An item in the open file browser (designs or palettes), matched by exact name. */
export function browserItem(page: Page, name: string) {
  return page
    .locator('.modal .fb-main .fb-item')
    .filter({ has: page.locator('.fb-name', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`) }) });
}

/** Palette Library → Presets (→ maker folder) → apply `label`. Closes the dialog. */
export async function applyPresetPalette(
  page: Page,
  label: string,
  group = /^Toho/.test(label) ? 'Toho' : '',
): Promise<void> {
  await openPaletteLibrary(page);
  await page.locator('.modal .fb-side-item', { hasText: 'Presets' }).click();
  if (group) {
    await browserItem(page, group).click();
    await browserItem(page, group).click(); // double-click opens the folder
  }
  await browserItem(page, label).click();
  await page.locator('.modal').getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
}
