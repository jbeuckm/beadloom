import type { ColorLibrary, MakerColor } from './types';

/**
 * Harrisville Designs (Harrisville, New Hampshire) wool yarns.
 *
 * Names and colour numbers come from harrisville.com's own product data. The
 * code is the number in Harrisville's SKU: Shetland (YSS###) and Highland
 * (YHS###) share one 64-colour range with the same numbers, so they are one
 * library here. WATERshed is sold in its own 20 colours (YWS9##).
 *
 * Colours were measured from Harrisville's skein photos, yarn pixels only
 * (page and grey card removed). `hex` is the colour the yarn reads as: the lit
 * surface for dark and very pale yarns, a band below the sheen for mid-dark
 * ones, the middle band for light mid-tones (whose brightest fibres are
 * bleached highlight) — Shetland and Highland photos averaged. `heather` is
 * the fibre mix (k-means over the same pixels, weights summing to 1) that the
 * app draws as a wool texture. Preview only; heathered wool always varies.
 */
const SHETLAND_HIGHLAND: MakerColor[] = [
  // neutrals
  { name: 'White', code: '044', hex: '#F0DEC5', heather: [['#F0DEC1', 0.47], ['#F6E8D4', 0.33], ['#FBF2E7', 0.11], ['#F1D8B2', 0.09]] },
  { name: 'Oatmeal', code: '046', hex: '#DAC4B3', heather: [['#CBB5A3', 0.49], ['#E4CDBA', 0.28], ['#E7D6C8', 0.23]] },
  { name: 'Sand', code: '043', hex: '#E9C6A5', heather: [['#F1D0AF', 0.4], ['#E5B78F', 0.26], ['#DAB598', 0.25], ['#F1D9C1', 0.09]] },
  { name: 'Silver Mist', code: '053', hex: '#BBB3AA', heather: [['#A39C94', 0.27], ['#D2CBC1', 0.25], ['#C1B9AF', 0.25], ['#B2AAA0', 0.23]] },
  { name: 'Pebble', code: '055', hex: '#BBA484', heather: [['#B0997A', 0.33], ['#CEB78F', 0.32], ['#9A866B', 0.18], ['#AA926C', 0.17]] },
  { name: 'Jade', code: '056', hex: '#BAAD86', heather: [['#BCAF86', 0.49], ['#9E8E6C', 0.28], ['#D2C799', 0.13], ['#D4C8A7', 0.11]] },
  { name: 'Suede', code: '047', hex: '#AB9991', heather: [['#C1B0A7', 0.31], ['#AB9890', 0.29], ['#9E8D84', 0.21], ['#8A7971', 0.19]] },
  { name: 'Camel', code: '042', hex: '#C38B64', heather: [['#BE8158', 0.47], ['#DDA378', 0.35], ['#B08164', 0.16], ['#BCA08E', 0.02]] },
  { name: 'Charcoal', code: '049', hex: '#5E5B59', heather: [['#4C4847', 0.37], ['#5F5C5A', 0.28], ['#777370', 0.18], ['#3E3B3A', 0.17]] },
  { name: 'Toffee', code: '052', hex: '#856554', heather: [['#7A5B4B', 0.32], ['#644537', 0.31], ['#977666', 0.2], ['#896551', 0.16]] },
  { name: 'Walnut', code: '051', hex: '#604A3E', heather: [['#4F382B', 0.74], ['#785E4C', 0.21], ['#A99D96', 0.03], ['#9E8E85', 0.03]] },
  { name: 'Teak', code: '038', hex: '#533028', heather: [['#4C241B', 0.45], ['#3F1B12', 0.23], ['#301812', 0.22], ['#733B2D', 0.11]] },
  { name: 'Ebony', code: '085', hex: '#333132', heather: [['#252324', 0.43], ['#171516', 0.3], ['#323133', 0.17], ['#4D4B4C', 0.1]] },
  { name: 'Black', code: '050', hex: '#2C2728', heather: [['#1D1718', 0.44], ['#120B0B', 0.35], ['#2E282B', 0.15], ['#4E474A', 0.06]] },
  // reds
  { name: 'Scarlet', code: '063', hex: '#E6202A', heather: [['#D51021', 0.36], ['#EB1E27', 0.31], ['#F42A32', 0.31], ['#CD4C56', 0.01]] },
  { name: 'Poppy', code: '065', hex: '#DB2B25', heather: [['#E12626', 0.39], ['#C91F1D', 0.37], ['#EE3C2A', 0.22], ['#C2524C', 0.01]] },
  { name: 'Zinnia', code: '075', hex: '#EB3C39', heather: [['#EC2F2E', 0.5], ['#F35042', 0.21], ['#EE3A3C', 0.15], ['#E1353A', 0.14]] },
  { name: 'Red', code: '002', hex: '#D40E25', heather: [['#E9122C', 0.39], ['#D00620', 0.32], ['#BA0419', 0.28], ['#B5404E', 0.02]] },
  { name: 'Chianti', code: '035', hex: '#9B1642', heather: [['#830528', 0.34], ['#82103C', 0.3], ['#A60838', 0.22], ['#B31450', 0.14]] },
  { name: 'Garnet', code: '036', hex: '#702B3D', heather: [['#64223A', 0.28], ['#5A0A1B', 0.25], ['#6D1B2E', 0.23], ['#58162A', 0.23]] },
  { name: 'Russet', code: '039', hex: '#802E2C', heather: [['#691D1B', 0.53], ['#7B1D1A', 0.22], ['#962F2C', 0.13], ['#A5322D', 0.12]] },
  { name: 'Topaz', code: '040', hex: '#A13922', heather: [['#952D1B', 0.49], ['#B73D25', 0.26], ['#893B28', 0.16], ['#B95031', 0.1]] },
  { name: 'Adobe', code: '054', hex: '#95514F', heather: [['#844140', 0.35], ['#824F4B', 0.29], ['#AE6762', 0.26], ['#9C464D', 0.1]] },
  // oranges
  { name: 'Melon', code: '066', hex: '#E6642D', heather: [['#E25624', 0.44], ['#F57A36', 0.27], ['#F16B2C', 0.18], ['#D65A2E', 0.11]] },
  { name: 'Foliage', code: '080', hex: '#A45A2C', heather: [['#8F421B', 0.3], ['#995026', 0.29], ['#C4793F', 0.22], ['#844B28', 0.19]] },
  // yellows
  { name: 'Gold', code: '004', hex: '#ED9B20', heather: [['#EA9019', 0.35], ['#F6A71E', 0.3], ['#D87C15', 0.19], ['#FAB928', 0.16]] },
  { name: 'Mustard', code: '081', hex: '#D58C31', heather: [['#E9A740', 0.28], ['#D57B1A', 0.26], ['#EB9D27', 0.26], ['#C88837', 0.2]] },
  { name: 'Straw', code: '082', hex: '#CA9243', heather: [['#B77B2F', 0.32], ['#B4834A', 0.24], ['#DBA03D', 0.23], ['#D69E4E', 0.22]] },
  { name: 'Marigold', code: '067', hex: '#F4C22D', heather: [['#FDD320', 0.33], ['#E09A11', 0.23], ['#FCE043', 0.23], ['#F0AD10', 0.22]] },
  { name: 'Goldenrod', code: '061', hex: '#DCAC31', heather: [['#CDA534', 0.27], ['#C58B19', 0.25], ['#E7C035', 0.24], ['#DB9E14', 0.24]] },
  { name: 'Cornsilk', code: '006', hex: '#FDF1A9', heather: [['#FDF2AC', 0.35], ['#FCEC91', 0.33], ['#FDF8C1', 0.19], ['#FBF7D7', 0.13]] },
  // greens
  { name: 'Lime', code: '084', hex: '#E8DC8B', heather: [['#E2D579', 0.48], ['#E8E19A', 0.21], ['#E2D38A', 0.17], ['#E3CE59', 0.14]] },
  { name: 'Tundra', code: '007', hex: '#BDAF76', heather: [['#AFA168', 0.45], ['#CBBE78', 0.26], ['#B5A87F', 0.17], ['#D3C78C', 0.12]] },
  { name: 'Grass', code: '083', hex: '#A19E34', heather: [['#93861D', 0.31], ['#B6B542', 0.24], ['#BCAE27', 0.23], ['#91902F', 0.23]] },
  { name: 'Kiwi', code: '060', hex: '#46A13A', heather: [['#308F2F', 0.38], ['#40AF41', 0.34], ['#62AE39', 0.2], ['#579149', 0.09]] },
  { name: 'Seagreen', code: '012', hex: '#57B198', heather: [['#42B490', 0.37], ['#3A9881', 0.22], ['#4AA289', 0.21], ['#71CAB0', 0.2]] },
  { name: 'Spruce', code: '010', hex: '#106E49', heather: [['#09653D', 0.33], ['#176048', 0.25], ['#0F8758', 0.24], ['#085735', 0.19]] },
  { name: 'Woodsmoke', code: '014', hex: '#588987', heather: [['#558F96', 0.32], ['#58797A', 0.24], ['#4C7272', 0.24], ['#78A6A3', 0.19]] },
  { name: 'Hemlock', code: '008', hex: '#4F5430', heather: [['#3D401F', 0.6], ['#485023', 0.22], ['#656939', 0.09], ['#6F7741', 0.09]] },
  { name: 'Cypress', code: '069', hex: '#484836', heather: [['#2A291F', 0.29], ['#40402F', 0.25], ['#4D4D2C', 0.24], ['#34341D', 0.21]] },
  { name: 'Evergreen', code: '009', hex: '#264538', heather: [['#143327', 0.75], ['#255840', 0.21], ['#859993', 0.05]] },
  // blues
  { name: 'Aegean', code: '025', hex: '#249BBA', heather: [['#2B8EA7', 0.31], ['#2FB2CD', 0.27], ['#20A8C8', 0.26], ['#0F85AF', 0.16]] },
  { name: 'Peacock', code: '013', hex: '#208E97', heather: [['#197477', 0.27], ['#178788', 0.25], ['#1B7486', 0.25], ['#248595', 0.23]] },
  { name: 'Azure', code: '030', hex: '#1F86BB', heather: [['#0E76B4', 0.36], ['#2495CB', 0.22], ['#156EA1', 0.21], ['#168FC8', 0.2]] },
  { name: 'Cobalt', code: '031', hex: '#215E8D', heather: [['#165182', 0.41], ['#25587C', 0.25], ['#2A73A5', 0.23], ['#22669A', 0.11]] },
  { name: 'Cornflower', code: '027', hex: '#8A9FC2', heather: [['#7C94BE', 0.36], ['#A7B9D8', 0.23], ['#93AECF', 0.22], ['#7688A5', 0.19]] },
  { name: 'Loden Blue', code: '015', hex: '#374A52', heather: [['#253841', 0.71], ['#3E5862', 0.23], ['#919FA4', 0.03], ['#77888E', 0.03]] },
  { name: 'Midnight Blue', code: '033', hex: '#2D3548', heather: [['#212B41', 0.4], ['#131928', 0.24], ['#161E37', 0.19], ['#39455F', 0.16]] },
  // purples
  { name: 'Chicory', code: '059', hex: '#797DB1', heather: [['#6C71AA', 0.4], ['#686A95', 0.22], ['#9196D0', 0.2], ['#8D90C0', 0.19]] },
  { name: 'Iris', code: '028', hex: '#595AA8', heather: [['#4E5096', 0.41], ['#5C54AF', 0.27], ['#676DBF', 0.23], ['#5D5D98', 0.09]] },
  { name: 'Hyacinth', code: '071', hex: '#4A4974', heather: [['#353A5F', 0.39], ['#3F3668', 0.37], ['#5C5E90', 0.21], ['#9C9AB2', 0.03]] },
  { name: 'Periwinkle', code: '024', hex: '#A985B3', heather: [['#9877A4', 0.31], ['#C09BCB', 0.27], ['#AC7CB5', 0.25], ['#A18BAB', 0.17]] },
  { name: 'Violet', code: '021', hex: '#6E458C', heather: [['#603A7C', 0.4], ['#7D4395', 0.27], ['#75549F', 0.23], ['#5C467C', 0.1]] },
  { name: 'Delphinium', code: '058', hex: '#66526E', heather: [['#55405C', 0.54], ['#7A6383', 0.25], ['#5A4C62', 0.11], ['#63476F', 0.1]] },
  { name: 'Aubergine', code: '018', hex: '#3A304D', heather: [['#291D3C', 0.76], ['#4C3D64', 0.2], ['#9793A5', 0.02], ['#7A768D', 0.02]] },
  { name: 'Plum', code: '022', hex: '#852C7C', heather: [['#7E2075', 0.48], ['#6B1964', 0.2], ['#A83999', 0.18], ['#742567', 0.15]] },
  { name: 'Blackberry', code: '019', hex: '#503240', heather: [['#3D1F2B', 0.64], ['#4A2138', 0.16], ['#6D4356', 0.11], ['#613D4C', 0.09]] },
  { name: 'Black Cherry', code: '057', hex: '#562843', heather: [['#461733', 0.7], ['#6A2C52', 0.26], ['#9F8697', 0.03], ['#8D6C82', 0.02]] },
  // pinks
  { name: 'Lilac', code: '072', hex: '#CDA6BD', heather: [['#DCB7CC', 0.38], ['#B895A9', 0.3], ['#CA96B7', 0.22], ['#CFB5C7', 0.1]] },
  { name: 'Water Lily', code: '062', hex: '#EAB1C1', heather: [['#F1BFCE', 0.53], ['#E99CB5', 0.24], ['#DBA4B1', 0.23]] },
  { name: 'Aster', code: '034', hex: '#CA7C9C', heather: [['#CE75A0', 0.31], ['#E096B4', 0.28], ['#C6718D', 0.28], ['#B37590', 0.13]] },
  { name: 'Pink', code: '088', hex: '#E0065D', heather: [['#EA035E', 0.32], ['#D30244', 0.29], ['#F30877', 0.2], ['#CA1059', 0.19]] },
  { name: 'Raspberry', code: '064', hex: '#CE1352', heather: [['#C6073C', 0.31], ['#E11765', 0.29], ['#BC154E', 0.24], ['#D70C50', 0.16]] },
  { name: 'Magenta', code: '023', hex: '#941B69', heather: [['#7D0E53', 0.35], ['#931366', 0.33], ['#AD1D7E', 0.23], ['#791D5C', 0.09]] },
];

const WATERSHED: MakerColor[] = [
  { name: 'Birch Bark', code: '901', hex: '#C7CBCD', heather: [['#D1D3D6', 0.34], ['#BABEBF', 0.3], ['#C6D0CC', 0.19], ['#BEC2CC', 0.16]] },
  { name: 'Driftwood', code: '965', hex: '#BEA799', heather: [['#A69084', 0.29], ['#D5BEAF', 0.28], ['#BB9E8D', 0.21], ['#BDAA9F', 0.21]] },
  { name: 'Granite', code: '969', hex: '#635E61', heather: [['#534E51', 0.52], ['#676366', 0.3], ['#7E7A7C', 0.18]] },
  { name: 'Stonewall', code: '961', hex: '#555054', heather: [['#3F393F', 0.65], ['#60595E', 0.26], ['#979295', 0.09]] },
  { name: 'Penstock', code: '959', hex: '#353132', heather: [['#252023', 0.77], ['#46403F', 0.19], ['#8B8B8E', 0.04]] },
  { name: 'Gatehouse', code: '951', hex: '#513F38', heather: [['#3E271D', 0.4], ['#3D2D2C', 0.34], ['#64493C', 0.19], ['#9D928D', 0.07]] },
  { name: 'Elm', code: '949', hex: '#5D3931', heather: [['#4C261F', 0.75], ['#794A3B', 0.2], ['#A18B87', 0.05]] },
  { name: 'Spoonwood', code: '929', hex: '#615541', heather: [['#50442F', 0.73], ['#7D6D50', 0.2], ['#A0998D', 0.07]] },
  { name: 'Farwell', code: '945', hex: '#512B2F', heather: [['#361014', 0.51], ['#561A20', 0.34], ['#5F3339', 0.11], ['#AA9498', 0.05]] },
  { name: 'Barn Door', code: '941', hex: '#8E2A2F', heather: [['#86191F', 0.47], ['#7F292E', 0.25], ['#B32E34', 0.23], ['#C49294', 0.05]] },
  { name: 'Monarch', code: '939', hex: '#8F3824', heather: [['#772615', 0.35], ['#8C2F1A', 0.33], ['#A5381D', 0.19], ['#753325', 0.13]] },
  { name: 'Meadows', code: '955', hex: '#C48C65', heather: [['#B17654', 0.32], ['#D39B6F', 0.3], ['#AF8367', 0.22], ['#C98555', 0.16]] },
  { name: 'Eastview', code: '931', hex: '#BB7E3C', heather: [['#AD793D', 0.34], ['#B96E2E', 0.29], ['#D1903C', 0.29], ['#A5845E', 0.08]] },
  { name: 'Mallard', code: '921', hex: '#3B4944', heather: [['#31413C', 0.55], ['#24342E', 0.36], ['#818B87', 0.09]] },
  { name: 'Bancroft', code: '909', hex: '#6A767C', heather: [['#586369', 0.6], ['#7F8C93', 0.4]] },
  { name: 'Cheshire', code: '911', hex: '#4B5965', heather: [['#3A4754', 0.69], ['#576A78', 0.24], ['#909CA4', 0.07]] },
  { name: 'Canal', code: '919', hex: '#2F313E', heather: [['#1B1B25', 0.42], ['#1D1E34', 0.4], ['#3E4152', 0.14], ['#9699A1', 0.04]] },
  { name: 'Aquifer', code: '975', hex: '#415380', heather: [['#3F5185', 0.68], ['#384E6D', 0.23], ['#8394B3', 0.09]] },
  { name: 'Silver Lake', code: '971', hex: '#747085', heather: [['#655F75', 0.61], ['#89859B', 0.39]] },
  { name: 'Nelson', code: '979', hex: '#403950', heather: [['#28263B', 0.4], ['#362544', 0.38], ['#504966', 0.17], ['#9794A4', 0.05]] },
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
