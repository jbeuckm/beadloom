# Grid Designer

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
- **Generate** (File ▸ Generate):
  - **Selburose** — a parametric star / rosette (petals, size, petal separation,
    rotation, centre; filled or outline) with a live preview, stamped in the
    active colour.
  - **Game of Life** — evolve the pattern with cellular-automaton rules
    (`B3/S23` by default, editable), toroidal wrap, adjustable speed, single-step
    or run, and a random seeder. New cells take the active colour or a vote of
    their neighbours. Every step is undoable.
  - **Reference Image** — drop a photo behind the grid and transform it directly
    on the canvas with the **Image** tool: drag the picture to move it, use the
    corner / edge / rotation handles to scale, skew and rotate. With **Live**
    trace on (default) every covered cell re-colours to its nearest palette
    colour (CIE-Lab) as you manipulate the image. The side panel also lifts an
    N-colour **palette straight off the image** (median cut). The image is a
    working aid — it is not saved into design files.
- **Palettes**: build / edit / reorder / delete colours (name, hex, optional bead
  code). Default is a **10-colour rainbow**. The **Palette Library** dialog holds
  presets — including a curated **Toho Round 11/0** seed-bead library (with the
  real Toho colour numbers) — plus every palette you've saved in the browser, and
  import / export as `*.beadloom-palette.json`.
- **Per-colour bead counts** shown on each swatch (a "word chart" style report).
- **Bead by column**: tap a column number above the grid to wash out every other
  column; step with ‹ › (or ← →) while a bar lists that column's beads bottom
  to top.
- **Undo / redo** (60 steps), pinch-zoom & two-finger pan, Apple-Pencil-only mode
  for palm rejection.
- **Designs**: New / Save / Open (in-browser slots) plus **Import / Export** as a
  custom `*.beadloom.json` file, and **Export PNG**. Large multi-colour designs
  are fully supported and round-trip losslessly.
- Autosaves continuously; add to your iPad Home Screen to run full-screen.

## Accounts and sync (optional)

Signed out, everything is saved in the browser. Set up a free [Neon](https://neon.com)
project and the app gains accounts: designs and palettes sync to the cloud on
every save and appear on every device you sign in on. It is local-first — saving
works offline and syncs when you're back.

1. Create a Neon project, enable the **Data API** on its main branch and **Neon Auth**
   with email sign-up. Add the app's URL (and `http://localhost:5847/`) to the
   allowed redirect list.
2. Copy `.env.example` to `.env`: `VITE_NEON_DATA_API_URL`, `VITE_NEON_AUTH_URL`
   (the browser's two endpoints) and `DATABASE_URL` (the connection string, used
   only by the migration runner).
3. `npm run db:migrate` applies `db/migrations/*.sql` in order, once each,
   recording them in `schema_migrations`; `-- --status` just lists them. The
   GitHub Action in `.github/workflows/migrate.yml` does the same on every push
   to `main` that touches a migration (set the `DATABASE_URL` repository secret).

The app checks the database's migration version on sign-in and refuses to sync
against an older schema, with a message saying to migrate. A new migration =
a new numbered file plus bumping `REQUIRED_SCHEMA_VERSION` in
`src/lib/cloud/schema.ts`.

With neither variable set the account button doesn't appear. `VITE_CLOUD_FAKE=1`
(or, in dev, `localStorage.beadloom.cloudFake = "1"`) swaps in an in-memory fake
cloud, which is what the tests use.

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
    life.ts           Game of Life step / rule parsing / random seed
    shapes.ts         Selburose star polygon + rasteriser
    color.ts          RGB→Lab, nearest-palette-colour match
    trace.ts          reference image → grid (inverse transform + sample)
    quantize.ts       median-cut palette extraction
    referenceImage.ts session-only decoded reference bitmap + sampler
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
    LifeDialog.tsx     Game of Life controls
    SelburoseDialog.tsx star generator with SVG preview
    ReferencePanel.tsx reference-image load / transform / trace
    icons.tsx          inline monochrome line-art icon set
    StatusBar.tsx      counts, selection, zoom
    Dialogs.tsx        New / Open / Save As / Resize / Help
    Menu.tsx  Modal.tsx
```
