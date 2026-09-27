import type { ColorLibrary, MakerColor } from './types';

/**
 * Miyuki Round Rocailles 11/0 seed beads.
 *
 * Codes and names were checked against Barrel of Beads' Miyuki 11/0 catalogue
 * (11-0401/0402/0408 also against Aura Crystals and John Bead). Suffixes are
 * Miyuki's: F = matte, D = dark. Hex values were averaged from retailer bead
 * photos (glare and shadow trimmed); galvanized / metallic finishes are the
 * roughest. Preview approximations only — match real beads against a card.
 */
const COLORS: MakerColor[] = [
  // light neutrals
  { name: 'Opaque White', code: '11-0402', hex: '#F4F3F7' },
  { name: 'Matte Opaque White', code: '11-0402F', hex: '#ECEBEF' },
  { name: 'White Pearl Ceylon', code: '11-0420', hex: '#EEEFEC' },
  { name: 'Ivory Pearl Ceylon', code: '11-0591', hex: '#E5DCCD' },
  { name: 'Matte Opaque Cream', code: '11-2021', hex: '#EAD5B7' },
  { name: 'Opaque Dark Cream', code: '11-0492', hex: '#E6CBA5' },
  { name: 'Light Caramel Ceylon', code: '11-0593', hex: '#D2AB89' },
  { name: 'Crystal', code: '11-0131', hex: '#BEBDC6' },
  { name: 'Opaque Cement Grey', code: '11-0498', hex: '#878698' },
  { name: 'Silver Gray Ceylon', code: '11-0526', hex: '#7E8088' },
  { name: 'Opaque Falcon Grey', code: '11-0499', hex: '#61605D' },
  { name: 'Silver Lined Gray', code: '11-0021', hex: '#51504D' },
  // browns / darks
  { name: 'Duracoat Opaque Toast', code: '11-4460', hex: '#91621F' },
  { name: 'Duracoat Opaque Cognac', code: '11-4492', hex: '#6F4B26' },
  { name: 'Opaque Red Brown', code: '11-0419', hex: '#621D1F' },
  { name: 'Opaque Chocolate', code: '11-0409', hex: '#4B2423' },
  { name: 'Transparent Root Beer', code: '11-0135', hex: '#3A2A22' },
  { name: 'Matte Opaque Black', code: '11-0401F', hex: '#2F2F30' },
  { name: 'Opaque Black', code: '11-0401', hex: '#181818' },
  // reds
  { name: 'Opaque Vermillion Red', code: '11-0407', hex: '#D82216' },
  { name: 'Opaque Red', code: '11-0408', hex: '#BB0E17' },
  { name: 'Matte Opaque Red', code: '11-0408F', hex: '#C62939' },
  { name: 'Silver Lined Flame Red', code: '11-0010', hex: '#9E211D' },
  { name: 'Silver Lined Ruby', code: '11-0011', hex: '#8D1D1E' },
  { name: 'Transparent Ruby', code: '11-0141', hex: '#850E14' },
  { name: 'Duracoat Opaque Maroon', code: '11-4470', hex: '#722D26' },
  // oranges
  { name: 'Opaque Orange', code: '11-0406', hex: '#F14A0D' },
  { name: 'Transparent Orange', code: '11-0138', hex: '#E7570C' },
  { name: 'Opaque Tangerine', code: '11-0405', hex: '#F9850D' },
  { name: 'Duracoat Opaque Kumquat', code: '11-4454', hex: '#E08216' },
  { name: 'Silver Lined Orange', code: '11-0008', hex: '#BC551A' },
  { name: 'Matte Opaque Terra Cotta', code: '11-2315', hex: '#C4574D' },
  // yellows
  { name: 'Opaque Yellow', code: '11-0404', hex: '#F3D604' },
  { name: 'Opaque Dark Yellow', code: '11-0404D', hex: '#E1A603' },
  { name: 'Silver Lined Yellow', code: '11-0006', hex: '#C0A213' },
  { name: 'Matte Opaque Mustard', code: '11-2312', hex: '#B9913B' },
  // greens
  { name: 'Opaque Chartreuse', code: '11-0416', hex: '#98AC3F' },
  { name: 'Silver Lined Chartreuse', code: '11-0014', hex: '#979C30' },
  { name: 'Mint Green Ceylon', code: '11-0520', hex: '#7AC0A5' },
  { name: 'Duracoat Opaque Fiji Green', code: '11-4476', hex: '#34914E' },
  { name: 'Opaque Green', code: '11-0411', hex: '#4C7F42' },
  { name: 'Silver Lined Green', code: '11-0016', hex: '#275E31' },
  { name: 'Silver Lined Emerald', code: '11-0017', hex: '#1E5946' },
  { name: 'Transparent Emerald', code: '11-0147', hex: '#0D3D29' },
  { name: 'Matte Opaque Olive', code: '11-2318', hex: '#6A6E55' },
  { name: 'Opaque Avocado', code: '11-0501', hex: '#4D563D' },
  // turquoise / blues
  { name: 'Opaque Turquoise Green', code: '11-0412', hex: '#278C8A' },
  { name: 'Silver Lined Teal', code: '11-2425', hex: '#1C534D' },
  { name: 'Opaque Turquoise Blue', code: '11-0413', hex: '#1C9BCD' },
  { name: 'Silver Lined Aqua', code: '11-0018', hex: '#4C91A7' },
  { name: 'Sky Blue Ceylon', code: '11-0524', hex: '#9EBCE1' },
  { name: 'Duracoat Opaque Delphinium', code: '11-4484', hex: '#1C70BE' },
  { name: 'Silver Lined Sapphire', code: '11-0019', hex: '#345B94' },
  { name: 'Opaque Periwinkle', code: '11-0417', hex: '#4F5DA8' },
  { name: 'Opaque Cobalt', code: '11-0414', hex: '#241677' },
  { name: 'Silver Lined Cobalt', code: '11-0020', hex: '#2C246F' },
  { name: 'Duracoat Opaque Navy', code: '11-4493', hex: '#343F80' },
  // purples
  { name: 'Lilac Ceylon', code: '11-0538', hex: '#8180B8' },
  { name: 'Duracoat Opaque Crocus', code: '11-4486', hex: '#9175A0' },
  { name: 'Dyed Opaque Bright Purple', code: '11-1477', hex: '#4E4FAE' },
  { name: 'Silver Lined Amethyst', code: '11-0024', hex: '#594A58' },
  { name: 'Dyed Silver Lined Dark Purple', code: '11-1426', hex: '#382E40' },
  // pinks
  { name: 'Opaque Light Pink Luster', code: '11-0427', hex: '#F3DBDF' },
  { name: 'Dyed Opaque Cotton Candy Pink', code: '11-0415', hex: '#F6B4D8' },
  { name: 'Duracoat Opaque Carnation', code: '11-4467', hex: '#EB7591' },
  { name: 'Carnation Pink Ceylon', code: '11-0535', hex: '#D57D93' },
  { name: 'Opaque Mauve', code: '11-0410', hex: '#937785' },
  { name: 'Opaque Burgundy', code: '11-0425', hex: '#954A5D' },
  { name: 'Duracoat Galvanized Hot Pink', code: '11-4210', hex: '#9A5C76' },
  { name: 'Dyed Silver Lined Fuchsia', code: '11-1340', hex: '#76185C' },
  // metallics
  { name: 'Duracoat Galvanized Silver', code: '11-4201', hex: '#C4C0B4' },
  { name: 'Duracoat Galvanized Light Pewter', code: '11-4221', hex: '#86807A' },
  { name: 'Duracoat Galvanized Champagne', code: '11-4204', hex: '#9C7D63' },
  { name: 'Duracoat Galvanized Gold', code: '11-4202', hex: '#B38B4C' },
  { name: '24kt Gold Plated', code: '11-0191', hex: '#B38637' },
  { name: 'Copper Plated', code: '11-0187', hex: '#A17164' },
  { name: 'Metallic Dark Bronze', code: '11-0457', hex: '#59442F' },
  { name: 'Metallic Gold Iris', code: '11-0462', hex: '#5B3E2F' },
  { name: 'Gunmetal', code: '11-0451', hex: '#383C48' },
];

export const MIYUKI_ROUND_11: ColorLibrary = {
  id: 'miyuki-round-11',
  maker: 'Miyuki',
  line: 'Round 11/0',
  kind: 'Bead colours',
  fullName: 'Miyuki Round 11/0',
  essentialsName: 'Miyuki Round Essentials',
  colors: COLORS,
  essentials: [
    '11-0402', // white
    '11-0401', // black
    '11-0498', // grey
    '11-0593', // tan
    '11-0409', // brown
    '11-0408', // red
    '11-0406', // orange
    '11-0404', // yellow
    '11-0411', // green
    '11-0412', // turquoise green
    '11-0413', // turquoise blue
    '11-0414', // cobalt
    '11-4493', // navy
    '11-1477', // purple
    '11-0535', // pink
    '11-4202', // gold
  ],
};
