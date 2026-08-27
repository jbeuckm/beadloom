import type { Page } from '@playwright/test';

/** Mirrors PX_PER_COL / cellAspect in the app. */
export const PX_PER_COL = 26;
export const CELL_ASPECT = 0.8;

/** The subset of store state we read in tests. */
export async function snapshot(page: Page) {
  return page.evaluate(() => {
    // @ts-expect-error injected by src/main.tsx in dev
    const s = window.__beadloom.getState();
    let beads = 0;
    const used = new Set<number>();
    for (const row of s.design.cells.data)
      for (const v of row)
        if (v >= 0) {
          beads++;
          used.add(v);
        }
    return {
      columns: s.design.loom.columns,
      rows: s.design.loom.rows,
      cellAspect: s.design.loom.cellAspect,
      beads,
      coloursUsed: used.size,
      paletteSize: s.design.palette.colors.length,
      paletteName: s.design.palette.name,
      activeColor: s.activeColor,
      background: s.design.background,
      tool: s.tool,
      pasteMode: s.pasteMode,
      selection: s.selection,
      hasClipboard: !!s.clipboard,
      clipboard: s.clipboard ? { w: s.clipboard.w, h: s.clipboard.h } : null,
      highlightRow: s.highlightRow,
      settings: s.settings,
      undo: s.undoStack.length,
      redo: s.redoStack.length,
      name: s.design.meta.name,
      view: s.view,
      format: s.design.format,
    };
  });
}

export async function cellValue(page: Page, c: number, r: number): Promise<number> {
  return page.evaluate(
    ({ c, r }) =>
      // @ts-expect-error injected
      window.__beadloom.getState().design.cells.data[r][c] as number,
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
  await page.getByRole('button', { name: 'Library' }).click();
  await page.locator('.modal', { hasText: 'Palette Library' }).waitFor();
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
