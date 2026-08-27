// Generates examples/spectrum-sampler.beadloom.json — a 30-colour pattern
// used to sanity-check multi-colour editing / import / export.
import { writeFileSync, mkdirSync } from 'node:fs';

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

const N = 30;
const cols = 30;
const rows = 40;

const colors = Array.from({ length: N }, (_, i) => ({
  id: `c${i + 1}`,
  name: `Spectrum ${i + 1}`,
  hex: hslToHex((i * 360) / N, 72, 55),
}));

const data = [];
for (let r = 0; r < rows; r++) {
  const row = [];
  for (let c = 0; c < cols; c++) {
    if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) row.push(0);
    else if ((r + c) % 7 === 0) row.push(-1);
    else row.push((c + r * 2) % N);
  }
  data.push(row);
}

const now = new Date().toISOString();
const design = {
  format: 'beadloom-design',
  version: 1,
  meta: {
    name: 'Spectrum Sampler',
    created: now,
    modified: now,
    app: 'BeadLoom Studio 1.0.0',
    notes:
      'Auto-generated 30-colour sampler to exercise multi-colour editing, import and export.',
  },
  loom: { stitch: 'loom', columns: cols, rows, cellAspect: 0.8 },
  palette: { id: 'spectrum-30', name: 'Spectrum 30', colors },
  background: '#FFFFFF',
  cells: { encoding: 'rows-index', empty: -1, data },
};

mkdirSync(new URL('../examples/', import.meta.url), { recursive: true });
const out = new URL('../examples/spectrum-sampler.beadloom.json', import.meta.url);
writeFileSync(out, JSON.stringify(design, null, 2));
console.log('wrote', out.pathname);
