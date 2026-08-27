# BeadLoom file formats

Two JSON formats, both plain UTF-8 text and safe to hand-edit.

| File | `format` value | Contents |
| --- | --- | --- |
| `*.beadloom.json` | `beadloom-design` | a full pattern (loom + palette + every cell) |
| `*.beadloom-palette.json` | `beadloom-palette` | a reusable colour set only |

---

## `beadloom-design`

```jsonc
{
  "format": "beadloom-design",   // fixed
  "version": 1,                   // integer; the app refuses versions it doesn't know

  "meta": {
    "name": "Thunderbird Band",
    "created":  "2026-08-26T15:04:00.000Z",  // ISO-8601
    "modified": "2026-08-26T15:40:12.512Z",
    "app": "BeadLoom Studio 1.0.0",
    "notes": "optional; free text"            // optional key
  },

  "loom": {
    "stitch": "loom",
    "columns": 24,        // warp threads — the count you set "left to right"
    "rows": 60,           // bead rows down the length of the piece
    "cellAspect": 0.8     // cell height ÷ cell width; 0.8 = bead 80% as tall as wide
  },

  // ─── The colours used by the design. This section fully specifies every
  //     colour: nothing outside "palette.colors" is referenced by the grid. ───
  "palette": {
    "id": "thunderbird",
    "name": "Thunderbird",
    "colors": [
      { "id": "c1", "name": "Jet",        "hex": "#141414" },
      { "id": "c2", "name": "Bone",       "hex": "#EFE7D2" },
      { "id": "c3", "name": "Turquoise",  "hex": "#2FB6A8", "code": "DB-0759" },
      { "id": "c4", "name": "Coral",      "hex": "#E1533B", "code": "DB-2103" }
      // …no practical limit; designs with 100+ colours load and export fine
    ]
  },

  "background": "#FFFFFF",   // drawn behind every empty cell

  // The layer stack, bottom → top. Composited for display and export.
  "layers": [
    {
      "id": "l1", "kind": "raster", "name": "Layer 1", "visible": true,
      "data": [
        [ 0, 0, 2, 2, -1, 3, 3, … ],  // row 1 — exactly loom.columns entries
        [ 0, 2, 2, 3, -1, -1, 3, … ], // …loom.rows rows; -1 = transparent
      ]
    },
    {
      "id": "sel1", "kind": "selburose", "name": "Selburose 1", "visible": true,
      "star": {
        "cx": 50, "cy": 12,     // centre in cell units (fractional allowed)
        "size": 9,              // tip radius, in cells (square grid; half the star's height)
        "rotationDeg": 0,       // 0 = the star stands on two points
        "gap": 0.5,             // per-edge inset of each parallelogram (apparent gap = 2×)
        "coverage": 0.5,        // 0..1 — fraction of a cell the shape must cover
        "center": "cell",       // "cell" (middle bead) | "border" (mirror axis between beads)
        "mode": "fill",         // "fill" | "outline"
        "colorIndex": 3         // index into palette.colors
      }
    }
  ],

  "cells": { "encoding": "rows-index", "empty": -1, "data": [ … ] }
  // ^ derived, read-only mirror of the flattened visible stack
}
```

### Rules & guarantees

- **The layer stack is authoritative.** `layers` is an ordered list, bottom → top.
  A `raster` layer carries its own `data` grid (`-1` = transparent); a `selburose`
  layer carries a live `star` and is never baked into pixels until "Flatten to
  beads" converts it to a raster layer. Higher layers win where cells overlap.
- **`cells`** in the serialized file is a *derived*, read-only mirror of the
  flattened visible composite — kept for older readers and external tooling. On
  load it is ignored when `layers` is present.
- **Cell values** are 0-based integer indices into `palette.colors`, or `-1` for
  an empty cell. `data[r][c]` = row `r` (from the top), column `c` (from the left).
- **Palette order is authoritative.** Reordering or deleting colours in the app
  rewrites every affected index (in every raster layer and every star) so the
  picture is preserved.
- **Colours** are `#RRGGBB` (upper-cased on save). `name` is required, `code`
  (a bead product reference such as a Miyuki Delica `DB-` number) is optional.
- **Forgiving import.** On load the app clamps `columns`/`rows` to sane bounds,
  pads/trims every layer's grid to match, drops out-of-range indices to `-1`, and
  fills in missing `meta`. A legacy file with only `format`, `loom`, `palette`,
  `cells` (and optionally `selburoses`) opens as a single "Background" raster
  layer plus one layer per star.
- **Round-trips losslessly** for anything the app itself produces.

---

## `beadloom-palette`

```jsonc
{
  "format": "beadloom-palette",
  "version": 1,
  "palette": {
    "id": "desert",
    "name": "Desert",
    "colors": [
      { "id": "c1", "name": "Sand",  "hex": "#D9BE8C" },
      { "id": "c2", "name": "Clay",  "hex": "#A85B3B", "code": "DB-2107" }
    ]
  }
}
```

Applying a palette to an existing design keeps cell indices where they are and
turns any now-out-of-range index into an empty cell.
