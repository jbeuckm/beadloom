import type { ColorLibrary, MakerColor } from './types';

/**
 * Toho Round 11/0 seed beads.
 *
 * `code` is the Toho colour number as printed on the tube, and `name` is
 * Toho's own name for it. Every pairing was checked against Barrel of Beads'
 * Toho 11/0 catalogue, with Beadaholique, Aura Crystals and Bead Spider as
 * spot checks. Hex values are approximations for on-screen preview (most from
 * retailer photos) — a loom pattern is a plan, not a colour-managed proof, so
 * match physical beads against a real card before ordering.
 */
const COLORS: MakerColor[] = [
  // light neutrals
  { name: 'Opaque White', code: '11-0-41', hex: '#F4F3ED' },
  { name: 'Matte Opaque White', code: '11-0-761', hex: '#F0F0EB' },
  { name: 'Ceylon Light Ivory', code: '11-0-147', hex: '#EFE3CE' },
  { name: 'Opaque-Lustered Navajo White', code: '11-0-122', hex: '#E5DBC3' },
  { name: 'Opaque Light Beige', code: '11-0-51', hex: '#D8C6A2' },
  { name: 'Opaque Gray', code: '11-0-53', hex: '#CBC9C0' },
  { name: 'Opaque Frosted Gray', code: '11-0-53F', hex: '#BEC2C1' },
  { name: 'Ceylon Smoke', code: '11-0-150', hex: '#70767C' },
  { name: 'Matte-Color Opaque Gray', code: '11-0-611', hex: '#637078' },
  { name: 'Metallic Hematite', code: '11-0-81', hex: '#3A3A40' },
  { name: 'Opaque Frosted Jet', code: '11-0-49F', hex: '#2E2E2E' },
  { name: 'Opaque Jet', code: '11-0-49', hex: '#1B1B1D' },
  // browns
  { name: 'Transparent Smoky Topaz', code: '11-0-941', hex: '#744D41' },
  { name: 'Opaque Terra Cotta', code: '11-0-46L', hex: '#AB5A40' },
  { name: 'Opaque Oxblood', code: '11-0-46', hex: '#583128' },
  { name: 'Transparent Root Beer', code: '11-0-14', hex: '#4A2512' },
  // reds
  { name: 'Opaque Cherry', code: '11-0-45A', hex: '#DD2727' },
  { name: 'Silver-Lined Ruby', code: '11-0-25C', hex: '#A83735' },
  { name: 'Transparent Siam Ruby', code: '11-0-5B', hex: '#A81F47' },
  { name: 'Opaque Pepper Red', code: '11-0-45', hex: '#7D241E' },
  // oranges
  { name: 'Opaque Light Orange', code: '11-0-42D', hex: '#DF6327' },
  { name: 'Ceylon Peach Cobbler', code: '11-0-148', hex: '#EFBB74' },
  { name: 'Opaque Pastel Frost Apricot', code: '11-0-763', hex: '#EED1AD' },
  { name: 'Opaque Pastel Frost Shrimp', code: '11-0-764', hex: '#EABAAC' },
  // yellows
  { name: 'Transparent Light Topaz', code: '11-0-2', hex: '#D79E48' },
  { name: 'Silver-Lined Light Topaz', code: '11-0-22', hex: '#E0B85C' },
  { name: 'Sunshine Yellow', code: '11-0-42B', hex: '#F1C12E' },
  { name: 'Opaque Frosted Sunshine', code: '11-0-42BF', hex: '#F9DE19' },
  { name: 'Opaque Dandelion', code: '11-0-42', hex: '#F4D64A' },
  // greens
  { name: 'Opaque Sour Apple', code: '11-0-44', hex: '#AED162' },
  { name: 'Silver-Lined Lime Green', code: '11-0-24', hex: '#A6BB37' },
  { name: 'Opaque Mint Green', code: '11-0-47', hex: '#7DBB8A' },
  { name: 'Opaque Shamrock', code: '11-0-47D', hex: '#20BD6C' },
  { name: 'Transparent Grass', code: '11-0-7B', hex: '#3A9557' },
  { name: 'Silver-Lined Green Emerald', code: '11-0-36', hex: '#427750' },
  { name: 'Silver-Lined Olivine', code: '11-0-37', hex: '#54663D' },
  { name: 'Opaque Pine Green', code: '11-0-47H', hex: '#2C5E41' },
  { name: 'Opaque Green Turquoise', code: '11-0-55D', hex: '#55947C' },
  // turquoise / blues
  { name: 'Opaque Turquoise', code: '11-0-55', hex: '#2BA49D' },
  { name: 'Silver-Lined Teal', code: '11-0-27BD', hex: '#1A494D' },
  { name: 'Silver-Lined Light Turquoise', code: '11-0-23', hex: '#63C4CE' },
  { name: 'Ceylon Aqua', code: '11-0-143', hex: '#ABD3E0' },
  { name: 'Opaque Blue Turquoise', code: '11-0-43', hex: '#73D3EF' },
  { name: 'Transparent Light Sapphire', code: '11-0-13', hex: '#98BEE4' },
  { name: 'Ceylon Virginia Bluebell', code: '11-0-921', hex: '#B9C3E3' },
  { name: 'Opaque Cornflower', code: '11-0-43D', hex: '#4C70BF' },
  { name: 'Transparent Sapphire', code: '11-0-942', hex: '#4C45BB' },
  { name: 'Transparent Dark Cobalt', code: '11-0-8D', hex: '#2B4CA0' },
  { name: 'Silver-Lined Cobalt', code: '11-0-28', hex: '#262A85' },
  { name: 'Opaque Navy Blue', code: '11-0-48', hex: '#243255' },
  { name: 'Opaque Frosted Navy Blue', code: '11-0-48F', hex: '#34405F' },
  // purples
  { name: 'Opaque Periwinkle', code: '11-0-48L', hex: '#8A91C4' },
  { name: 'Opaque Lavender', code: '11-0-52', hex: '#B7A4CD' },
  { name: 'Transparent Light Amethyst', code: '11-0-6', hex: '#B597CF' },
  { name: 'Opaque Pastel Frosted Light Lilac', code: '11-0-766', hex: '#C396A4' },
  { name: 'Silver-Lined Tanzanite', code: '11-0-39', hex: '#9B8C98' },
  { name: 'Ceylon Grape Mist', code: '11-0-151', hex: '#A08094' },
  { name: 'Silver-Lined Light Grape', code: '11-0-2219', hex: '#874D73' },
  // pinks
  { name: 'Ceylon Innocent Pink', code: '11-0-145', hex: '#F9CCDC' },
  { name: 'Silver-Lined Pink', code: '11-0-38', hex: '#ED84A7' },
  // metallics
  { name: 'Galvanized Aluminum PermaFinish', code: '11-0-PF558', hex: '#C0C0C0' },
  { name: 'Nickel-Plated', code: '11-0-711', hex: '#BCC0C2' },
  { name: 'Galvanized Starlight PermaFinish', code: '11-0-PF557', hex: '#D1B659' },
  { name: '24K Gold-Plated', code: '11-0-712', hex: '#C5A04A' },
  { name: 'Bronze', code: '11-0-221', hex: '#876840' },
  { name: 'Antique Bronze', code: '11-0-223', hex: '#99773E' },
  { name: 'Dark Bronze', code: '11-0-222', hex: '#8D4E47' },
];

export const TOHO_ROUND_11: ColorLibrary = {
  id: 'toho-round-11',
  maker: 'Toho',
  line: 'Round 11/0',
  kind: 'Bead colours',
  fullName: 'Toho Round 11/0',
  essentialsName: 'Toho Essentials',
  colors: COLORS,
  essentials: [
    '11-0-41', // Opaque White
    '11-0-49', // Opaque Jet
    '11-0-53', // Opaque Gray
    '11-0-122', // Opaque-Lustered Navajo White
    '11-0-45A', // Opaque Cherry
    '11-0-42D', // Opaque Light Orange
    '11-0-42B', // Sunshine Yellow
    '11-0-47D', // Opaque Shamrock
    '11-0-55', // Opaque Turquoise
    '11-0-43D', // Opaque Cornflower
    '11-0-48', // Opaque Navy Blue
    '11-0-2219', // Silver-Lined Light Grape
    '11-0-145', // Ceylon Innocent Pink
    '11-0-38', // Silver-Lined Pink
  ],
};
