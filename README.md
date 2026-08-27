# BeadLoom Studio

An iPad-first pattern designer for **bead loom work** — React + TypeScript, no backend.
Everything (autosave, saved designs, saved palettes) lives in the browser.

The grid is vertical warp **columns** of bead **rows**. Each bead cell is drawn
**80% as tall as it is wide** (`cellAspect: 0.8`), matching real seed/Delica beads
on a loom.

## Features

- **Loom grid** with live column / row controls: sliders + steppers in the top
  bar, or just **drag the dashed handles** on the right / bottom edge of the grid.
- **Tools** (mimicking BeadTool / Bead Draw / DB-BEAD): Pen, Eraser, Fill
  (flood), Eyedropper, Line, Rectangle (outline & filled), Marquee **Select →
  Copy / Cut / Paste**, Pan.
- **Mirror H / V** and **Rotate 180°** — whole design or just the selection.
- **Palettes**: build / edit / reorder / delete colours (name, hex, optional bead
  code). Default is a **10-colour rainbow**. The **Palette Library** dialog holds
  presets — including a curated **Toho Round 11/0** seed-bead library (with the
  real Toho colour numbers) — plus every palette you've saved in the browser, and
  import / export as `*.beadloom-palette.json`.
- **Per-colour bead counts** shown on each swatch (a "word chart" style report).
- **Working-row highlight**: tap a row number in the left gutter to mark where
  you are while beading.
- **Undo / redo** (60 steps), pinch-zoom & two-finger pan, Apple-Pencil-only mode
  for palm rejection.
- **Designs**: New / Save / Open (in-browser slots) plus **Import / Export** as a
  custom `*.beadloom.json` file, and **Export PNG**. Large multi-colour designs
  are fully supported and round-trip losslessly.
- Autosaves continuously; add to your iPad Home Screen to run full-screen.

## Run it

```bash
cd ~/Documents/beadloom-studio
npm install
npm run dev            # http://localhost:5173  (also printed on your LAN IP)
```

On the iPad, open the LAN URL Vite prints (e.g. `http://192.168.x.x:5173`) in
Safari, then **Share → Add to Home Screen** for a full-screen app.

```bash
npm run build          # type-check + production build in dist/
npm run preview        # serve the production build
npm run make:example   # writes examples/spectrum-sampler.beadloom.json (30 colours)
```

## File format

Full spec: [`docs/FILE_FORMAT.md`](docs/FILE_FORMAT.md). In short, a design file
embeds a `palette` that **specifies every colour used** (name, `#RRGGBB`, optional
bead code), and `cells.data` is a row-major 2-D array of integer indices into that
palette (`-1` = empty). There is also a standalone `beadloom-palette` file for
reusable colour sets. An example design lives in `examples/` after you run
`npm run make:example`.

## Project layout

```
src/
  types.ts            domain types + the file-format contract
  util.ts             colour / id / misc helpers
  help.ts             shortcut list + format spec text (shown in-app)
  lib/
    palettes.ts       default rainbow, colour factory, preset list
    tohoPalettes.ts   curated Toho Round 11/0 seed-bead colour library
    grid.ts           flood fill, Bresenham, resize, stamp, usage counts
    render.ts         shared canvas draw of the "document" layer (screen + PNG)
    designFormat.ts   (de)serialise + validate + file download / picker + PNG
    storage.ts        localStorage slots (designs, palettes, autosave, settings)
  store/useStore.ts   single Zustand store: design, tools, history, view
  components/
    App.tsx           layout + keyboard shortcuts
    TopBar.tsx         File menu, name, column/row controls
    Toolbar.tsx        left tool rail
    LoomCanvas.tsx     the interactive grid (canvas + pointer + edge handles)
    PalettePanel.tsx   swatches, palette name/save, background colour
    PaletteLibrary.tsx presets (Toho, rainbow), saved palettes, import/export
    PaletteEditor.tsx  per-colour editor modal
    icons.tsx          inline monochrome line-art icon set
    StatusBar.tsx      counts, selection, zoom
    Dialogs.tsx        New / Open / Save As / Resize / Help
    Menu.tsx  Modal.tsx
```
