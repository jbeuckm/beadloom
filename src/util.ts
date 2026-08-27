export const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

export const uid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2, 10);

/** HSL (h in degrees, s/l in percent) -> "#RRGGBB". */
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h || '0', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Accepts "#abc", "abc", "#AABBCC", "aabbcc"; returns "#AABBCC" or null. */
export function normalizeHex(input: string): string | null {
  let h = (input || '').trim();
  if (!h.startsWith('#')) h = '#' + h;
  if (/^#[0-9a-fA-F]{3}$/.test(h))
    h =
      '#' +
      h
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('');
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : null;
}

/** Readable text colour ("#111" / "#fff") for a swatch background. */
export function contrastText(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.62 ? '#111111' : '#FFFFFF';
}

export function randomPleasantHex(): string {
  return hslToHex(Math.floor(Math.random() * 360), 62, 55);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((...a: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  }) as T;
}
