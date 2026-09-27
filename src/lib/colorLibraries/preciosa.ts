import type { ColorLibrary, MakerColor } from './types';

/**
 * Preciosa (Czech) Rocailles 11/0 seed beads.
 *
 * Codes are Preciosa Ornela's 5-digit colour numbers (kept as strings — many
 * start with 0); "23980M" is the retailer convention for the matte finish.
 * Every code is on Preciosa's official 11/0 sample card and/or listed by Fire
 * Mountain Gems or Auntie's Beads Direct; names are the retailers' (shortened,
 * neutral where they disagree). Hex values are approximations from swatch
 * photos, less closely measured than the Miyuki set — preview only.
 */
const COLORS: MakerColor[] = [
  // light neutrals
  { name: 'Chalk White', code: '03050', hex: '#F7F6F0' },
  { name: 'Alabaster', code: '02090', hex: '#EEEBE2' },
  { name: 'Pearl White', code: '47102', hex: '#F3EEE4' },
  { name: 'Cream Pearl', code: '47112', hex: '#EFE3C8' },
  { name: 'Crystal', code: '00050', hex: '#E8ECEE' },
  { name: 'Silver-Lined Crystal', code: '78102', hex: '#DDE3E6' },
  { name: 'Beige', code: '06012', hex: '#D9C3A0' },
  { name: 'Grey', code: '43020', hex: '#8E9296' },
  { name: 'Black Diamond', code: '40010', hex: '#5B5F63' },
  // browns / darks
  { name: 'Topaz', code: '10050', hex: '#C08A3E' },
  { name: 'Light Brown', code: '13600', hex: '#8B5A33' },
  { name: 'Medium Brown', code: '93300', hex: '#6E3F24' },
  { name: 'Dark Brown', code: '13780', hex: '#4A2C1C' },
  { name: 'Jet Black', code: '23980', hex: '#141414' },
  { name: 'Matte Black', code: '23980M', hex: '#232323' },
  // reds
  { name: 'Coral Red', code: '93170', hex: '#E0493A' },
  { name: 'Red', code: '93190', hex: '#C8171E' },
  { name: 'Ruby Red', code: '93210', hex: '#9E1622' },
  { name: 'Silver-Lined Red', code: '97070', hex: '#D0202A' },
  { name: 'Transparent Ruby', code: '90090', hex: '#8C1024' },
  // oranges
  { name: 'Light Orange', code: '93110', hex: '#F59A2A' },
  { name: 'Dark Orange', code: '93140', hex: '#E5601B' },
  // yellows
  { name: 'Lemon Yellow', code: '83110', hex: '#F7E03C' },
  { name: 'Yellow', code: '83130', hex: '#F5C518' },
  { name: 'Silver-Lined Gold', code: '17050', hex: '#D9A12B' },
  // greens
  { name: 'Pale Green', code: '53410', hex: '#B9DDA0' },
  { name: 'Mint Green', code: '53230', hex: '#8FD3A4' },
  { name: 'Lime Green', code: '53310', hex: '#8CC63E' },
  { name: 'Wasabi Green', code: '53430', hex: '#A8C43A' },
  { name: 'Green', code: '53250', hex: '#2E9A48' },
  { name: 'Emerald Green', code: '53270', hex: '#10734A' },
  { name: 'Dark Green', code: '53240', hex: '#1D5236' },
  { name: 'Transparent Green', code: '50060', hex: '#2F8F3F' },
  { name: 'Silver-Lined Green', code: '57120', hex: '#1E8A3A' },
  // blues / turquoise
  { name: 'Light Turquoise', code: '63000', hex: '#8FD8D8' },
  { name: 'Turquoise', code: '63050', hex: '#2DB5B8' },
  { name: 'Turquoise Blue', code: '63030', hex: '#1FA3C4' },
  { name: 'Powder Blue', code: '33000', hex: '#A9CBE6' },
  { name: 'Pale Blue', code: '33020', hex: '#7FB2DE' },
  { name: 'Czech Blue', code: '33050', hex: '#2C6FC2' },
  { name: 'Denim Blue', code: '33210', hex: '#4F6F99' },
  { name: 'Royal Blue', code: '33040', hex: '#2346A6' },
  { name: 'Lapis Blue', code: '33060', hex: '#1F3C8F' },
  { name: 'Navy', code: '33070', hex: '#1A2A6C' },
  { name: 'Silver-Lined Dark Aqua', code: '67150', hex: '#12808C' },
  // purples
  { name: 'Light Amethyst', code: '20010', hex: '#B79BCB' },
  { name: 'Violet', code: '23020', hex: '#7E57A8' },
  { name: 'Amethyst', code: '20060', hex: '#7A3E8E' },
  { name: 'Dark Violet', code: '23040', hex: '#4C2A6E' },
  // pinks
  { name: 'Pink Dyed Terra', code: '16398', hex: '#F2A7C0' },
  { name: 'Silver-Lined Light Pink', code: '18273', hex: '#F4A6BD' },
  { name: 'Silver-Lined Dark Pink', code: '18277', hex: '#D6457E' },
  // metallics
  { name: 'Metallic Silver', code: '18303', hex: '#C8CACC' },
  { name: 'Metallic Gold', code: '18304', hex: '#D4AF37' },
  { name: 'Soft Gold', code: '01710', hex: '#C9A45C' },
  { name: 'Soft Copper', code: '01770', hex: '#B06A3E' },
  { name: 'Hematite', code: '49102', hex: '#3E4146' },
  { name: 'Blue Iris', code: '59135', hex: '#2B3558' },
  { name: 'Purple Iris', code: '59195', hex: '#4A2F55' },
];

export const PRECIOSA_11: ColorLibrary = {
  id: 'preciosa-11',
  maker: 'Preciosa',
  line: 'Rocailles 11/0',
  kind: 'Bead colours',
  fullName: 'Preciosa Czech 11/0',
  essentialsName: 'Preciosa Essentials',
  colors: COLORS,
  essentials: [
    '03050', // white
    '23980', // black
    '43020', // grey
    '06012', // beige
    '13600', // brown
    '93190', // red
    '93140', // orange
    '83130', // yellow
    '53250', // green
    '53270', // emerald
    '63050', // turquoise
    '33050', // blue
    '33070', // navy
    '23020', // violet
    '16398', // pink
    '18304', // gold
  ],
};
