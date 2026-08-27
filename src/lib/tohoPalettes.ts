import type { Palette } from '../types';

/**
 * A curated library of Toho Round 11/0 seed-bead colours.
 *
 * `code` is the Toho colour number (as printed on the tube). `hex` values are
 * hand-tuned approximations for on-screen preview — a loom pattern is a plan,
 * not a colour-managed proof, so match physical beads against a real card
 * before ordering.
 */
export interface TohoColor {
  name: string;
  code: string;
  hex: string;
}

export const TOHO_11: TohoColor[] = [
  { name: 'Opaque White', code: '11-0-41', hex: '#F4F3ED' },
  { name: 'Jet Black', code: '11-0-49', hex: '#1B1B1D' },
  { name: 'Opaque Light Gray', code: '11-0-53', hex: '#CBC9C0' },
  { name: 'Matte Dark Gray', code: '11-0-611', hex: '#68655F' },
  { name: 'Gunmetal', code: '11-0-81', hex: '#3A3A40' },
  { name: 'Navajo White', code: '11-0-123', hex: '#EADCC2' },
  { name: 'Ceylon Ivory', code: '11-0-147', hex: '#EFE3CE' },
  { name: 'Opaque Beige', code: '11-0-51', hex: '#D8C6A2' },
  { name: 'Pepper Red', code: '11-0-45A', hex: '#B23A31' },
  { name: 'Opaque Cherry', code: '11-0-45', hex: '#8C2A2C' },
  { name: 'Transparent Ruby', code: '11-0-5B', hex: '#A81F47' },
  { name: 'Opaque Pumpkin', code: '11-0-42D', hex: '#DF6327' },
  { name: 'Cantaloupe', code: '11-0-921', hex: '#EF9F58' },
  { name: 'Transparent Topaz', code: '11-0-2', hex: '#D79E48' },
  { name: 'Sunshine Yellow', code: '11-0-42B', hex: '#F1C12E' },
  { name: 'Opaque Dandelion', code: '11-0-42', hex: '#F4D64A' },
  { name: 'Opaque Mint', code: '11-0-47', hex: '#7DBB8A' },
  { name: 'Shamrock Green', code: '11-0-47H', hex: '#2C7742' },
  { name: 'Transparent Grass', code: '11-0-7B', hex: '#3A9557' },
  { name: 'Opaque Turquoise', code: '11-0-55', hex: '#2BA49D' },
  { name: 'Silver-Lined Aqua', code: '11-0-23', hex: '#7CCFD2' },
  { name: 'Transparent Light Sapphire', code: '11-0-13', hex: '#98BEE4' },
  { name: 'Opaque Cornflower', code: '11-0-43D', hex: '#4C70BF' },
  { name: 'Transparent Cobalt', code: '11-0-8D', hex: '#2B4CA0' },
  { name: 'Opaque Navy', code: '11-0-48', hex: '#243255' },
  { name: 'Opaque Periwinkle', code: '11-0-48L', hex: '#8A91C4' },
  { name: 'Opaque Lavender', code: '11-0-52', hex: '#B7A4CD' },
  { name: 'Transparent Light Amethyst', code: '11-0-6', hex: '#B597CF' },
  { name: 'Opaque Grape', code: '11-0-48F', hex: '#5B3A78' },
  { name: 'Opaque Fuchsia', code: '11-0-45F', hex: '#AE3676' },
  { name: 'Blush Pink', code: '11-0-763', hex: '#E6B5BE' },
  { name: 'Opaque Salmon', code: '11-0-50', hex: '#E3886F' },
  { name: 'Opaque Chocolate', code: '11-0-46', hex: '#573729' },
  { name: 'Galvanized Gold', code: '11-0-712', hex: '#C5A04A' },
  { name: 'Galvanized Silver', code: '11-0-711', hex: '#BCC0C2' },
  { name: 'Antique Bronze', code: '11-0-221', hex: '#876840' },
];

const ESSENTIALS = new Set([
  'Opaque White',
  'Jet Black',
  'Opaque Light Gray',
  'Navajo White',
  'Pepper Red',
  'Opaque Pumpkin',
  'Sunshine Yellow',
  'Shamrock Green',
  'Opaque Turquoise',
  'Opaque Cornflower',
  'Opaque Navy',
  'Opaque Grape',
  'Opaque Fuchsia',
  'Blush Pink',
]);

function toPalette(id: string, name: string, colors: TohoColor[]): Palette {
  return {
    id,
    name,
    colors: colors.map((c, i) => ({
      id: `${id}-${i + 1}`,
      name: c.name,
      hex: c.hex,
      code: c.code,
    })),
  };
}

/** A 14-colour everyday working set. */
export const tohoEssentials = (): Palette =>
  toPalette(
    'toho-essentials',
    'Toho Essentials',
    TOHO_11.filter((c) => ESSENTIALS.has(c.name)),
  );

/** The full curated library. */
export const tohoFull = (): Palette =>
  toPalette('toho-round-11', 'Toho Round 11/0', TOHO_11);
