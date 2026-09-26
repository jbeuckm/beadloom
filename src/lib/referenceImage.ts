// Session-only cache of decoded image-layer bitmaps + their pixels, keyed by
// object-URL. Kept outside the Zustand store so bitmaps never get cloned into
// history snapshots or serialised. One entry per placed image layer.

interface Entry {
  img: HTMLImageElement | null;
  pixels: ImageData | null;
  loading: boolean;
  eqLut?: Float32Array | null; // luma → equalised luma, built on first use
}

const cache = new Map<string, Entry>();
const subscribers = new Set<() => void>();
let epoch = 0;

/** Bumped whenever a bitmap finishes decoding or is revoked — lets pure
 *  consumers (trace caches) know their inputs changed. */
export function imageEpoch(): number {
  return epoch;
}

function notify() {
  epoch++;
  for (const fn of subscribers) fn();
}

export function subscribeImages(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/** Kick off an async decode + rasterise for `src` if it hasn't been seen. */
export function ensureImage(src: string): void {
  if (!src || cache.has(src)) return;
  const entry: Entry = { img: null, pixels: null, loading: true };
  cache.set(src, entry);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const e = cache.get(src);
    if (!e) return; // revoked before it loaded
    e.img = img;
    e.loading = false;
    try {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        e.pixels = ctx.getImageData(0, 0, cv.width, cv.height);
      }
    } catch {
      e.pixels = null; // tainted canvas — drawing still works, tracing won't
    }
    notify();
  };
  img.onerror = () => {
    const e = cache.get(src);
    if (e) e.loading = false;
    notify();
  };
  img.src = src;
}

export function getBitmap(src: string): HTMLImageElement | null {
  return cache.get(src)?.img ?? null;
}

export function bitmapReady(src: string): boolean {
  return !!cache.get(src)?.pixels;
}

/** Revoke an image layer's object URL and forget its bitmap. */
export function revokeImage(src: string): void {
  if (!cache.has(src)) return;
  cache.delete(src);
  epoch++;
  try {
    URL.revokeObjectURL(src);
  } catch {
    /* not an object URL, or already gone */
  }
}

/** Nearest-pixel sample in image-pixel space; null if outside or not decoded. */
export function sampleImage(
  src: string,
  ix: number,
  iy: number,
): [number, number, number, number] | null {
  const pixels = cache.get(src)?.pixels;
  if (!pixels) return null;
  const x = Math.floor(ix);
  const y = Math.floor(iy);
  if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return null;
  const o = (y * pixels.width + x) * 4;
  const d = pixels.data;
  return [d[o], d[o + 1], d[o + 2], d[o + 3]];
}

/** Up to `max` evenly-spaced opaque pixels of an image, for palette extraction. */
export function imageSamples(
  src: string,
  max = 4000,
): Array<[number, number, number]> {
  const pixels = cache.get(src)?.pixels;
  if (!pixels) return [];
  const total = pixels.width * pixels.height;
  const step = Math.max(1, Math.floor(total / max));
  const d = pixels.data;
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < total; i += step) {
    const o = i * 4;
    if (d[o + 3] < 16) continue;
    out.push([d[o], d[o + 1], d[o + 2]]);
  }
  return out;
}

/**
 * Histogram-equalisation lookup for an image: index by luma (0..255), get the
 * luma that value maps to when the opaque pixels' tones are spread evenly.
 * Null until the bitmap has decoded.
 */
export function lumaEqualizer(src: string): Float32Array | null {
  const e = cache.get(src);
  if (!e?.pixels) return null;
  if (e.eqLut) return e.eqLut;
  const d = e.pixels.data;
  const hist = new Uint32Array(256);
  let total = 0;
  for (let o = 0; o < d.length; o += 4) {
    if (d[o + 3] < 16) continue;
    hist[Math.round(0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2])]++;
    total++;
  }
  const lut = new Float32Array(256);
  let cdf = 0;
  let cdfMin = -1;
  for (let v = 0; v < 256; v++) {
    cdf += hist[v];
    if (cdfMin < 0 && cdf > 0) cdfMin = cdf;
    const span = total - cdfMin;
    lut[v] = span > 0 ? (Math.max(0, cdf - cdfMin) / span) * 255 : v;
  }
  e.eqLut = lut;
  return lut;
}
