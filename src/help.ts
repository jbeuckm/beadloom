export const SHORTCUTS: Array<[string, string]> = [
  ['B / P', 'Pen'],
  ['E', 'Eraser'],
  ['G', 'Fill (bucket)'],
  ['I', 'Eyedropper / pick colour'],
  ['L', 'Line'],
  ['R', 'Rectangle outline'],
  ['F', 'Rectangle filled'],
  ['M', 'Select (marquee)'],
  ['H', 'Pan'],
  ['K', 'Reference image (drag to move)'],
  ['⌘/Ctrl Z', 'Undo'],
  ['⌘/Ctrl ⇧ Z  ·  Ctrl Y', 'Redo'],
  ['⌘/Ctrl C / X / V', 'Copy / cut / paste selection'],
  ['⌘/Ctrl A', 'Select all'],
  ['Delete / Backspace', 'Clear selected cells / delete selected shape'],
  ['[ / ]', 'Zoom out / in'],
  ['0', 'Fit pattern to screen'],
  ['Esc', 'Cancel paste / placement / clear selection'],
];

export const FILE_FORMAT_SPEC = `{
  "format": "beadloom-design",     // fixed identifier
  "version": 1,                     // bump on breaking changes
  "meta": {
    "name": "My Pattern",
    "created": "2026-08-26T12:00:00.000Z",
    "modified": "2026-08-26T12:34:00.000Z",
    "app": "Chromattice 1.0.0",
    "notes": "optional free text"
  },
  "loom": {
    "stitch": "loom",
    "columns": 20,                  // warp count, left -> right
    "rows": 40,                     // bead rows, top -> bottom
    "cellAspect": 0.8              // cell height / width (a bead 80% as tall as wide)
  },

  // Every colour the design can use is specified here, in order.
  "palette": {
    "id": "rainbow-10",
    "name": "Rainbow 10",
    "colors": [
      { "id": "c1", "name": "Red",   "hex": "#DC3C3C" },
      { "id": "c2", "name": "Azure", "hex": "#3C7CDD", "code": "DB-0726" }
      // ...as many as you like; large palettes are fully supported
    ]
  },

  "background": "#FFFFFF",          // painted behind empty cells
  "backgroundColor": 5,             // optional palette index filling every empty cell

  // The layer stack, bottom -> top. Composited for display and export.
  "layers": [
    {
      "id": "l1", "kind": "raster", "name": "Layer 1", "visible": true,
      "locked": false,             // optional: true = no selecting or editing
      "data": [
        [ 0, 0, 1, -1, 2, ... ],    // row 1, length === loom.columns
        [ 2, 2, 2, -1, -1, ... ]    // ...loom.rows arrays total; -1 = no bead
      ]
    },
    {
      "id": "sel1", "kind": "selburose", "name": "Selburose 1", "visible": true,
      "star": {
        "cx": 50, "cy": 12,         // centre, in cell units (fractional ok)
        "size": 9,                  // tip radius, in cells (square grid; half the height)
        "rotationDeg": 0,           // 0 == stands on two points
        "gap": 0.5,                 // per-edge inset of each parallelogram (apparent gap = 2x)
        "coverage": 0.5,            // 0..1 fill threshold (fraction of a cell covered)
        "center": "cell",           // "cell" (a middle bead) | "border" (axis between beads)
        "mode": "fill",             // "fill" | "outline"
        "colorIndex": 3             // index into palette.colors
      }
    }
  ],

  "cells": { "encoding": "rows-index", "empty": -1, "data": [ ... ] }
  // ^ derived, read-only mirror of the flattened visible stack. On load,
  //   "layers" is authoritative; a file with only "cells" (+ old "selburoses")
  //   still opens as a single Background raster layer.
}

Notes
- A raster layer's data[r][c] is a palette index, or -1 for an empty (transparent) cell.
- Higher layers win where they overlap. A selburose layer is never baked into
  pixels until "Flatten to beads" converts it to a raster layer.
- Reordering the palette in the app remaps every index so colours stay put.
- On import, out-of-range indices are treated as empty and the grid is
  re-fitted to loom.columns x loom.rows, so hand-edited files still load.
- A palette on its own is saved as { "format": "beadloom-palette", "version": 1,
  "palette": { ... } }.`;
