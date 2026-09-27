import type { ColorLibrary, MakerColor } from './types';

/**
 * Miyuki Delica 11/0 cylinder beads.
 *
 * Every code and name was checked against Barrel of Beads' full Delica
 * catalogue and AngularByDesign's DB table (which follows Miyuki's chart);
 * a few names are shortened ("Dyed" dropped from Duracoat names). Hex values
 * are estimates from typical retailer swatches — preview approximations only.
 */
const COLORS: MakerColor[] = [
  // light neutrals
  { name: 'Opaque White', code: 'DB-0200', hex: '#F7F7F2' },
  { name: 'Matte White', code: 'DB-0351', hex: '#F1F0EA' },
  { name: 'White Pearl Ceylon', code: 'DB-0201', hex: '#F3EFE6' },
  { name: 'Opaque Bisque White', code: 'DB-1490', hex: '#F0E8D8' },
  { name: 'Opaque Dark Cream', code: 'DB-0732', hex: '#EBD6A8' },
  { name: 'Matte Opaque Cream', code: 'DB-0352', hex: '#E7D7B5' },
  { name: 'Duracoat Opaque Beige', code: 'DB-2105', hex: '#D8C09A' },
  { name: 'Opaque Tan Luster', code: 'DB-0208', hex: '#D0B28A' },
  { name: 'Opaque Ghost Gray', code: 'DB-1139', hex: '#CDD0D0' },
  { name: 'Duracoat Opaque Mist Gray', code: 'DB-2366', hex: '#A7A9A8' },
  { name: 'Opaque Gray', code: 'DB-0731', hex: '#929494' },
  { name: 'Matte Opaque Gray', code: 'DB-0761', hex: '#878986' },
  // browns / darks
  { name: 'Dyed Opaque Gray', code: 'DB-0652', hex: '#6F7274' },
  { name: 'Duracoat Opaque Charcoal', code: 'DB-2368', hex: '#474849' },
  { name: 'Duracoat Opaque Toast', code: 'DB-2110', hex: '#A77A52' },
  { name: 'Semi-Frosted Opaque Sienna', code: 'DB-0794', hex: '#8E4B2E' },
  { name: 'Opaque Currant', code: 'DB-1134', hex: '#5C3A2E' },
  { name: 'Opaque Chocolate', code: 'DB-0734', hex: '#4A3026' },
  { name: 'Matte Black', code: 'DB-0310', hex: '#1E1E1E' },
  { name: 'Opaque Black', code: 'DB-0010', hex: '#111111' },
  // reds
  { name: 'Opaque Vermillion Red', code: 'DB-0727', hex: '#E0452B' },
  { name: 'Semi-Frosted Opaque Bright Red', code: 'DB-0791', hex: '#D32630' },
  { name: 'Silver-Lined Flame Red', code: 'DB-0043', hex: '#D01C1F' },
  { name: 'Opaque Red', code: 'DB-0723', hex: '#C4122C' },
  { name: 'Matte Opaque Red', code: 'DB-0753', hex: '#B32129' },
  { name: 'Dyed Opaque Maroon', code: 'DB-0654', hex: '#6B1C25' },
  // oranges
  { name: 'Opaque Salmon', code: 'DB-0206', hex: '#F0A08A' },
  { name: 'Opaque Mandarin', code: 'DB-1133', hex: '#F4A04C' },
  { name: 'Opaque Orange', code: 'DB-0722', hex: '#EE7621' },
  { name: 'Dyed Opaque Pumpkin', code: 'DB-0653', hex: '#E05E1C' },
  { name: 'Dyed Opaque Squash', code: 'DB-0651', hex: '#F5A623' },
  // yellows
  { name: 'Light Daffodil Ceylon', code: 'DB-0233', hex: '#F5E6A2' },
  { name: 'Opaque Canary', code: 'DB-1132', hex: '#F8DF4A' },
  { name: 'Opaque Yellow', code: 'DB-0721', hex: '#F6CE16' },
  { name: 'Silver-Lined Gold', code: 'DB-0042', hex: '#DDA024' },
  // greens
  { name: 'Mint Green Ceylon', code: 'DB-0237', hex: '#C2E4C6' },
  { name: 'Opaque Chartreuse', code: 'DB-0733', hex: '#B4C838' },
  { name: 'Opaque Avocado', code: 'DB-1135', hex: '#707C3C' },
  { name: 'Dyed Opaque Olive', code: 'DB-0663', hex: '#5A5A2C' },
  { name: 'Opaque Green', code: 'DB-0724', hex: '#2E8B45' },
  { name: 'Dyed Opaque Green', code: 'DB-0656', hex: '#1E5E3C' },
  { name: 'Duracoat Opaque Evergreen', code: 'DB-2358', hex: '#2A4A3C' },
  { name: 'Opaque Sea Opal', code: 'DB-1136', hex: '#8FCBC3' },
  { name: 'Opaque Turquoise Green', code: 'DB-0729', hex: '#1FA69B' },
  // blues
  { name: 'Silver-Lined Aqua', code: 'DB-0044', hex: '#35B4C4' },
  { name: 'Opaque Turquoise Blue', code: 'DB-0725', hex: '#29A7CB' },
  { name: 'Dark Sky Blue Ceylon', code: 'DB-0240', hex: '#8DB5DE' },
  { name: 'Opaque Agate Blue', code: 'DB-1137', hex: '#6F95B7' },
  { name: 'Opaque Periwinkle', code: 'DB-0730', hex: '#5C7CC2' },
  { name: 'Dyed Opaque Dark Turquoise Blue', code: 'DB-0659', hex: '#1C6A9A' },
  { name: 'Opaque Cobalt', code: 'DB-0726', hex: '#1F3D9C' },
  { name: 'Silver-Lined Cobalt', code: 'DB-0047', hex: '#1C3CA6' },
  { name: 'Duracoat Matte Opaque Navy', code: 'DB-2143', hex: '#1E2849' },
  // purples
  { name: 'Semi-Frosted Opaque Lavender', code: 'DB-0799', hex: '#9D8BC6' },
  { name: 'Opaque Mauve', code: 'DB-0728', hex: '#B98DB0' },
  { name: 'Dyed Opaque Dark Orchid', code: 'DB-0660', hex: '#7B3F8C' },
  { name: 'Dyed Opaque Bright Purple', code: 'DB-0661', hex: '#5B2B8C' },
  { name: 'Duracoat Opaque Grape', code: 'DB-2360', hex: '#4B2A5E' },
  { name: 'Silver-Lined Dark Violet', code: 'DB-0610', hex: '#45287A' },
  // pinks
  { name: 'Baby Pink Ceylon', code: 'DB-0234', hex: '#F3CCD3' },
  { name: 'Cotton Candy Pink Ceylon', code: 'DB-0245', hex: '#F0A4BE' },
  { name: 'Dyed Opaque Carnation Pink', code: 'DB-1371', hex: '#E96B93' },
  { name: 'Hot Pink Ceylon', code: 'DB-0247', hex: '#DE4F8C' },
  { name: 'Dyed Opaque Mulberry', code: 'DB-0662', hex: '#8A1F55' },
  // metallics
  { name: 'Duracoat Galvanized Silver', code: 'DB-1831', hex: '#C6C9CC' },
  { name: 'Duracoat Galvanized Pewter', code: 'DB-1852', hex: '#7D7F82' },
  { name: 'Duracoat Galvanized Gold', code: 'DB-1832', hex: '#D2A64A' },
  { name: '24kt Gold Plated', code: 'DB-0031', hex: '#D4AF37' },
  { name: 'Metallic Dark Bronze', code: 'DB-0022', hex: '#6A4B2C' },
  { name: 'Duracoat Galvanized Hot Pink', code: 'DB-1840', hex: '#D23B7A' },
];

export const MIYUKI_DELICA_11: ColorLibrary = {
  id: 'miyuki-delica-11',
  maker: 'Miyuki',
  line: 'Delica 11/0',
  kind: 'Bead colours',
  fullName: 'Miyuki Delica 11/0',
  essentialsName: 'Miyuki Delica Essentials',
  colors: COLORS,
  essentials: ['DB-0200', 'DB-0010', 'DB-0731', 'DB-0208', 'DB-0734', 'DB-0723', 'DB-0722', 'DB-0721', 'DB-0733', 'DB-0724', 'DB-0729', 'DB-0725', 'DB-0726', 'DB-2143', 'DB-0661', 'DB-1371'],
};
