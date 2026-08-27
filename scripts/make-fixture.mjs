// Writes tests/fixtures/trace-quad.png — a 4×4 image split into four solid
// colour quadrants (red / blue / green / yellow), used by the reference-image
// trace e2e test. Run once; the PNG is committed.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const W = 4;
const H = 4;
const quad = (x, y) => {
  const left = x < W / 2;
  const top = y < H / 2;
  if (top && left) return [220, 40, 40]; // red
  if (top && !left) return [40, 90, 210]; // blue
  if (!top && left) return [50, 170, 80]; // green
  return [240, 210, 60]; // yellow
};

// raw RGBA scanlines, each prefixed with a 0 filter byte
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  for (let x = 0; x < W; x++) {
    const [r, g, b] = quad(x, y);
    const o = y * (1 + W * 4) + 1 + x * 4;
    raw[o] = r;
    raw[o + 1] = g;
    raw[o + 2] = b;
    raw[o + 3] = 255;
  }
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
// 10,11,12 = compression / filter / interlace = 0

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(new URL('../tests/fixtures/', import.meta.url), { recursive: true });
const out = new URL('../tests/fixtures/trace-quad.png', import.meta.url);
writeFileSync(out, png);
console.log('wrote', out.pathname, png.length, 'bytes');
