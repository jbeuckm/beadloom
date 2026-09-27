import type { ColorLibrary, MakerColor } from './types';

/**
 * Harrisville Designs (Harrisville, New Hampshire) wool yarns.
 *
 * Names and colour numbers come from harrisville.com's own product data. The
 * code is the number in Harrisville's SKU: Shetland (YSS###) and Highland
 * (YHS###) share one 64-colour range with the same numbers, so they are one
 * library here. WATERshed is sold in its own 20 colours (YWS9##). Hex values
 * were averaged from Harrisville's skein photos (Shetland and Highland
 * averaged together); heathered wool reads muted, and the very dark shades
 * read a little darker on screen than in the skein. Preview only.
 */
const SHETLAND_HIGHLAND: MakerColor[] = [
  // neutrals
  { name: 'White', code: '044', hex: '#E9D4B6' },
  { name: 'Oatmeal', code: '046', hex: '#D8C0AD' },
  { name: 'Sand', code: '043', hex: '#E4BE9C' },
  { name: 'Silver Mist', code: '053', hex: '#B6AEA5' },
  { name: 'Pebble', code: '055', hex: '#B39B7A' },
  { name: 'Jade', code: '056', hex: '#AEA079' },
  { name: 'Suede', code: '047', hex: '#9A8880' },
  { name: 'Camel', code: '042', hex: '#B47953' },
  { name: 'Charcoal', code: '049', hex: '#423E3E' },
  { name: 'Toffee', code: '052', hex: '#705040' },
  { name: 'Walnut', code: '051', hex: '#3C261D' },
  { name: 'Teak', code: '038', hex: '#32130E' },
  { name: 'Ebony', code: '085', hex: '#141213' },
  { name: 'Black', code: '050', hex: '#140E10' },
  // reds
  { name: 'Scarlet', code: '063', hex: '#D81322' },
  { name: 'Poppy', code: '065', hex: '#CC1C1C' },
  { name: 'Zinnia', code: '075', hex: '#DD292C' },
  { name: 'Red', code: '002', hex: '#BE051A' },
  { name: 'Chianti', code: '035', hex: '#84062E' },
  { name: 'Garnet', code: '036', hex: '#4A0C1E' },
  { name: 'Russet', code: '039', hex: '#540F0E' },
  { name: 'Topaz', code: '040', hex: '#8C2818' },
  { name: 'Adobe', code: '054', hex: '#7E3C3C' },
  // oranges
  { name: 'Melon', code: '066', hex: '#DB5524' },
  { name: 'Foliage', code: '080', hex: '#86411A' },
  // yellows
  { name: 'Gold', code: '004', hex: '#E69016' },
  { name: 'Mustard', code: '081', hex: '#CC8024' },
  { name: 'Straw', code: '082', hex: '#BE8434' },
  { name: 'Marigold', code: '067', hex: '#F4BC16' },
  { name: 'Goldenrod', code: '061', hex: '#D4A222' },
  { name: 'Cornsilk', code: '006', hex: '#FCE685' },
  // greens
  { name: 'Lime', code: '084', hex: '#E0D276' },
  { name: 'Tundra', code: '007', hex: '#B4A66D' },
  { name: 'Grass', code: '083', hex: '#8D8A23' },
  { name: 'Kiwi', code: '060', hex: '#308C2A' },
  { name: 'Seagreen', code: '012', hex: '#48A88E' },
  { name: 'Spruce', code: '010', hex: '#085636' },
  { name: 'Woodsmoke', code: '014', hex: '#447674' },
  { name: 'Hemlock', code: '008', hex: '#2D3014' },
  { name: 'Cypress', code: '069', hex: '#282819' },
  { name: 'Evergreen', code: '009', hex: '#0B2318' },
  // blues
  { name: 'Aegean', code: '025', hex: '#1286A7' },
  { name: 'Peacock', code: '013', hex: '#0E737C' },
  { name: 'Azure', code: '030', hex: '#0E70A7' },
  { name: 'Cobalt', code: '031', hex: '#144A78' },
  { name: 'Cornflower', code: '027', hex: '#7A90B7' },
  { name: 'Loden Blue', code: '015', hex: '#1A2A32' },
  { name: 'Midnight Blue', code: '033', hex: '#101628' },
  // purples
  { name: 'Chicory', code: '059', hex: '#686CA2' },
  { name: 'Iris', code: '028', hex: '#4A4896' },
  { name: 'Hyacinth', code: '071', hex: '#28254D' },
  { name: 'Periwinkle', code: '024', hex: '#9974A4' },
  { name: 'Violet', code: '021', hex: '#5E347B' },
  { name: 'Delphinium', code: '058', hex: '#4A3551' },
  { name: 'Aubergine', code: '018', hex: '#190F28' },
  { name: 'Plum', code: '022', hex: '#6A1662' },
  { name: 'Blackberry', code: '019', hex: '#2E121F' },
  { name: 'Black Cherry', code: '057', hex: '#340C25' },
  // pinks
  { name: 'Lilac', code: '072', hex: '#C8A0B8' },
  { name: 'Water Lily', code: '062', hex: '#EAACBE' },
  { name: 'Aster', code: '034', hex: '#BD6A8C' },
  { name: 'Pink', code: '088', hex: '#C80448' },
  { name: 'Raspberry', code: '064', hex: '#BC0A42' },
  { name: 'Magenta', code: '023', hex: '#7D0C54' },
];

const WATERSHED: MakerColor[] = [
  { name: 'Birch Bark', code: '901', hex: '#C6CBCD' },
  { name: 'Driftwood', code: '965', hex: '#BAA193' },
  { name: 'Granite', code: '969', hex: '#474246' },
  { name: 'Stonewall', code: '961', hex: '#322B31' },
  { name: 'Penstock', code: '959', hex: '#181415' },
  { name: 'Gatehouse', code: '951', hex: '#2D1B17' },
  { name: 'Elm', code: '949', hex: '#391913' },
  { name: 'Spoonwood', code: '929', hex: '#3C3020' },
  { name: 'Farwell', code: '945', hex: '#28080C' },
  { name: 'Barn Door', code: '941', hex: '#6B1016' },
  { name: 'Monarch', code: '939', hex: '#712011' },
  { name: 'Meadows', code: '955', hex: '#B97E58' },
  { name: 'Eastview', code: '931', hex: '#A5672B' },
  { name: 'Mallard', code: '921', hex: '#15211E' },
  { name: 'Bancroft', code: '909', hex: '#545F66' },
  { name: 'Cheshire', code: '911', hex: '#283340' },
  { name: 'Canal', code: '919', hex: '#11111E' },
  { name: 'Aquifer', code: '975', hex: '#293966' },
  { name: 'Silver Lake', code: '971', hex: '#5A556B' },
  { name: 'Nelson', code: '979', hex: '#221A31' },
];

export const HARRISVILLE_SHETLAND: ColorLibrary = {
  id: 'harrisville-shetland-highland',
  maker: 'Harrisville Designs',
  line: 'Shetland & Highland',
  kind: 'Yarn colours',
  fullName: 'Harrisville Shetland & Highland',
  essentialsName: 'Harrisville Essentials',
  colors: SHETLAND_HIGHLAND,
  essentials: ['044', '050', '049', '046', '042', '051', '002', '066', '067', '060', '010', '025', '031', '033', '021', '062'],
};

export const HARRISVILLE_WATERSHED: ColorLibrary = {
  id: 'harrisville-watershed',
  maker: 'Harrisville Designs',
  line: 'WATERshed',
  kind: 'Yarn colours',
  fullName: 'Harrisville WATERshed',
  colors: WATERSHED,
};
