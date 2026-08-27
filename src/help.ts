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
  ['⌘/Ctrl Z', 'Undo'],
  ['⌘/Ctrl ⇧ Z  ·  Ctrl Y', 'Redo'],
  ['⌘/Ctrl C / X / V', 'Copy / cut / paste selection'],
  ['⌘/Ctrl A', 'Select all'],
  ['Delete / Backspace', 'Clear selected cells'],
  ['[ / ]', 'Zoom out / in'],
  ['0', 'Fit pattern to screen'],
  ['Esc', 'Cancel paste / clear selection'],
];

export const FILE_FORMAT_SPEC = `{
  "format": "beadloom-design",     // fixed identifier
  "version": 1,                     // bump on breaking changes
  "meta": {
    "name": "My Pattern",
    "created": "2026-08-26T12:00:00.000Z",
    "modified": "2026-08-26T12:34:00.000Z",
    "app": "BeadLoom Studio 1.0.0",
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

  "cells": {
    "encoding": "rows-index",       // row-major; value = index into palette.colors
    "empty": -1,                    // this value means "no bead"
    "data": [
      [ 0, 0, 1, -1, 2, ... ],      // row 1, length === loom.columns
      [ 2, 2, 2, -1, -1, ... ]      // row 2
      // ...loom.rows arrays total
    ]
  }
}

Notes
- cells.data[r][c] is an integer index into palette.colors, or -1 for an empty cell.
- Reordering the palette in the app remaps every index so colours stay put.
- On import, out-of-range indices are treated as empty and the grid is
  re-fitted to loom.columns x loom.rows, so hand-edited files still load.
- A palette on its own is saved as { "format": "beadloom-palette", "version": 1,
  "palette": { ... } }.`;
