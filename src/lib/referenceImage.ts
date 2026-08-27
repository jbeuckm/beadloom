// Session-only store for the decoded reference image + its pixels. Kept outside
// the Zustand store (which only holds the lightweight transform metadata) so the
// bitmap never has to be cloned into history snapshots or serialised.

let currentSrc = '';
let image: HTMLImageElement | null = null;
let pixels: ImageData | null = null;
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

export function subscribeReferenceImage(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getReferenceImage(): HTMLImageElement | null {
  return image;
}

export function referenceImageReady(): boolean {
  return !!pixels;
}

/** Point the loader at a new object URL / data URI. Decodes + rasterises async. */
export function setReferenceImageSrc(src: string): void {
  if (src === currentSrc) return;
  currentSrc = src;
  image = null;
  pixels = null;
  if (!src) {
    notify();
    return;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (currentSrc !== src) return; // superseded
    image = img;
    try {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        pixels = ctx.getImageData(0, 0, cv.width, cv.height);
      }
    } catch {
      pixels = null; // tainted canvas — drawing still works, tracing won't
    }
    notify();
  };
  img.onerror = () => {
    if (currentSrc === src) {
      image = null;
      pixels = null;
      notify();
    }
  };
  img.src = src;
}

if (import.meta.env.DEV) {
  (window as unknown as { __beadloomRef: unknown }).__beadloomRef = {
    ready: referenceImageReady,
  };
}

/** Nearest-pixel sample in image-pixel space; null if outside or not decoded. */
export function sampleReferenceImage(
  ix: number,
  iy: number,
): [number, number, number, number] | null {
  if (!pixels) return null;
  const x = Math.floor(ix);
  const y = Math.floor(iy);
  if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return null;
  const o = (y * pixels.width + x) * 4;
  const d = pixels.data;
  return [d[o], d[o + 1], d[o + 2], d[o + 3]];
}
