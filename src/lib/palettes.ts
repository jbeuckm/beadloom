import type { BeadColor, Palette } from '../types';
import { hslToHex, uid } from '../util';
import { COLOR_LIBRARIES, essentialsPalette } from './colorLibraries';

const RAINBOW_NAMES = [
  'Red',
  'Marigold',
  'Chartreuse',
  'Lime',
  'Spring Green',
  'Cyan',
  'Azure',
  'Indigo',
  'Violet',
  'Rose',
];

/** The default palette: an evenly spaced rainbow. */
export function makeRainbowPalette(count = 10): Palette {
  return {
    id: uid(),
    name: `Rainbow ${count}`,
    colors: Array.from({ length: count }, (_, i) => ({
      id: `c${i + 1}`,
      name: RAINBOW_NAMES[i] ?? `Color ${i + 1}`,
      hex: hslToHex((i * 360) / count, 70, 55),
    })),
  };
}

export function makeColor(hex = '#8892A6', name = 'New Color'): BeadColor {
  return { id: uid(), name, hex };
}

/** Ready-made palettes offered in the Palette Library dialog. */
export const PRESET_PALETTES: Array<{
  key: string;
  label: string;
  group?: string; // the maker, shown as a folder inside Presets
  build: () => Palette;
}> = [
  { key: 'rainbow', label: 'Rainbow 10', build: () => makeRainbowPalette(10) },
  ...COLOR_LIBRARIES.flatMap((lib) => {
    const ess = essentialsPalette(lib);
    // whole lines are browsed colour by colour (From Library), not applied
    return ess
      ? [{ key: ess.id, label: ess.name, group: lib.maker, build: () => essentialsPalette(lib)! }]
      : [];
  }),
  {
    key: 'blank',
    label: 'Blank (1 colour)',
    build: () => ({
      id: uid(),
      name: 'New Palette',
      colors: [makeColor('#1A1A1A', 'Colour 1')],
    }),
  },
];
