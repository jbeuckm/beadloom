// Makers' colour lines (seed beads, yarn…) offered as preset palettes.
// Each line is a data module; add one to COLOR_LIBRARIES to publish it.

import type { Palette } from '../../types';
import { hexToRgb } from '../../util';
import type { ColorLibrary, MakerColor } from './types';
import { TOHO_ROUND_11 } from './toho';
import { HARRISVILLE_SHETLAND, HARRISVILLE_WATERSHED } from './harrisville';
import { MIYUKI_DELICA_11 } from './miyukiDelica';
import { MIYUKI_ROUND_11 } from './miyukiRound';
import { PRECIOSA_11 } from './preciosa';

export type { ColorLibrary, MakerColor } from './types';

export const COLOR_LIBRARIES: ColorLibrary[] = [
  TOHO_ROUND_11,
  MIYUKI_DELICA_11,
  MIYUKI_ROUND_11,
  PRECIOSA_11,
  HARRISVILLE_SHETLAND,
  HARRISVILLE_WATERSHED,
];

function toPalette(id: string, name: string, lib: ColorLibrary, colors: MakerColor[]): Palette {
  return {
    id,
    name,
    kind: lib.kind,
    colors: colors.map((c, i) => ({
      id: `${id}-${i + 1}`,
      name: c.name,
      hex: c.hex,
      ...(c.code ? { code: c.code } : {}),
      ...(c.heather ? { heather: c.heather } : {}),
    })),
  };
}

/** The whole line as one palette. */
export const fullPalette = (lib: ColorLibrary): Palette =>
  toPalette(lib.id, lib.fullName, lib, lib.colors);

/** The everyday subset, in the line's own order. */
export function essentialsPalette(lib: ColorLibrary): Palette | null {
  if (!lib.essentials?.length || !lib.essentialsName) return null;
  const keep = new Set(lib.essentials);
  return toPalette(
    `${lib.id}-essentials`,
    lib.essentialsName,
    lib,
    lib.colors.filter((c) => keep.has(c.code || c.name)),
  );
}

// ---- browsing individual colours --------------------------------------------

export const FAMILIES = [
  'Neutrals',
  'Browns',
  'Reds',
  'Oranges',
  'Yellows',
  'Greens',
  'Blues',
  'Purples',
  'Pinks',
  'Metallics',
] as const;
export type Family = (typeof FAMILIES)[number];

// finishes whose colour comes from a metal coating (bead names only — yarn
// names like "Silver Mist" are just colour names)
const METALLIC =
  /galvani|metallic|gold[- ]plated|nickel|permafinish|hematite|gunmetal|bronze|copper|\biris\b|soft gold/i;

/** A rough colour family for filtering, from the hex (and, for beads, the finish). */
export function colorFamily(hex: string, name = '', kind = 'Bead colours'): Family {
  if (kind === 'Bead colours' && METALLIC.test(name)) return 'Metallics';
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l > 0.9 || l < 0.1 || s < 0.14 || d < 0.07) return 'Neutrals';
  let h =
    max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const warm = h >= 12 && h < 52;
  if (warm && l > 0.72 && s < 0.75) return 'Neutrals'; // creams, ivories, beiges
  if (warm && (l < 0.42 || s < 0.5)) return 'Browns'; // browns, tans, camels
  if ((h < 12 || h >= 340) && l < 0.3 && s < 0.45) return 'Browns'; // chocolate, oxblood
  if (h < 12 || h >= 340) return l > 0.62 ? 'Pinks' : 'Reds';
  if (h < 42) return 'Oranges';
  if (h < 68) return l < 0.36 ? 'Greens' : 'Yellows'; // dark yellow-greens are olives
  if (h < 170) return 'Greens';
  if (h < 255) return 'Blues';
  if (h < 325) return 'Purples';
  return 'Pinks';
}

export interface LibraryColor extends MakerColor {
  key: string; // unique across libraries: "<library id>:<code or name>"
  library: ColorLibrary;
  family: Family;
}

let flat: LibraryColor[] | null = null;
/** Every colour of every library, tagged with its line and family. */
export function allLibraryColors(): LibraryColor[] {
  flat ??= COLOR_LIBRARIES.flatMap((library) =>
    library.colors.map((c) => ({
      ...c,
      key: `${library.id}:${c.code || c.name}`,
      library,
      family: colorFamily(c.hex, c.name, library.kind),
    })),
  );
  return flat;
}
