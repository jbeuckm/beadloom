// The kinds of grid a design can be laid out on. A document stores only its
// `loom.cellAspect`; the grid type is looked up from that.

export interface GridType {
  id: string;
  label: string;
  cellAspect: number; // cell height / cell width
  inPerCol?: number; // physical length of one column, when it's known
}

export const GRID_TYPES: GridType[] = [
  // ~11/0 seed beads: 74 columns is about 6 inches
  { id: 'seed-11', label: '11/0 seed beads', cellAspect: 0.8, inPerCol: 6 / 74 },
  { id: 'square', label: 'Square', cellAspect: 1 },
];

export const DEFAULT_GRID_TYPE = GRID_TYPES[0];

/** The grid type a document's cell aspect corresponds to, if any. */
export function gridTypeFor(cellAspect: number): GridType | undefined {
  return GRID_TYPES.find((t) => Math.abs(t.cellAspect - cellAspect) < 0.005);
}
