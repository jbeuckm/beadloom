#!/usr/bin/env node
// Draw the favicon: a solid Selburose (the same star the app draws, from
// src/lib/shapes.ts) with a colour per petal in the Home logo's colours, and
// a dark outline so the pale petals hold up on a light browser tab.
//
//   node scripts/make-favicon.mjs
//
// Writes public/favicon.svg (sharp at any size) and public/favicon.png
// (48 px, rendered by Playwright's Chromium) for browsers that want a bitmap.

import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// the app's own Selburose code, bundled for Node
const bundled = await build({
  entryPoints: [resolve(root, 'src/lib/shapes.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const { selburosePetals } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
);

// the Home logo's colours (src/components/Brand.tsx HERO_COLOURS), and an outline
const COLOURS = ['#f6ead4', '#2e9c95', '#d99a3a', '#5b2d3b'];
const OUTLINE = '#3a1822';

const N = 16;
const pad = 1; // room for the outline
const fill = new Map();
selburosePetals(N).forEach((cells, i) => {
  for (const [x, y] of cells) fill.set(`${x + pad},${y + pad}`, COLOURS[i % COLOURS.length]);
});
// the outline: a stroke along the star's edge (every cell edge not shared with
// another star cell), drawn under the cells so only its outer half shows —
// thin, and it keeps the notches between the points
const edges = new Map();
const toggle = (k, d) => (edges.has(k) ? edges.delete(k) : edges.set(k, d));
for (const k of fill.keys()) {
  const [x, y] = k.split(',').map(Number);
  toggle(`h${x},${y}`, `M${x} ${y}h1`);
  toggle(`h${x},${y + 1}`, `M${x} ${y + 1}h1`);
  toggle(`v${x},${y}`, `M${x} ${y}v1`);
  toggle(`v${x + 1},${y}`, `M${x + 1} ${y}v1`);
}
const size = N + pad * 2;
const rect = (k, colour) => {
  const [x, y] = k.split(',');
  return `<rect x="${x}" y="${y}" width="1" height="1" fill="${colour}"/>`;
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
<path d="${[...edges.values()].join('')}" stroke="${OUTLINE}" stroke-width="1.1" stroke-linecap="square" fill="none"/>
<g shape-rendering="crispEdges">
${[...fill].map(([k, c]) => rect(k, c)).join('\n')}
</g>
</svg>
`;
writeFileSync(resolve(root, 'public/favicon.svg'), svg);

// a 48 px bitmap of it, on a transparent background
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 48, height: 48 } });
await page.setContent(
  `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="48" height="48" style="display:block;image-rendering:pixelated"></body></html>`,
);
await page.screenshot({ path: resolve(root, 'public/favicon.png'), omitBackground: true });
await browser.close();
console.log('Wrote public/favicon.svg and public/favicon.png');
