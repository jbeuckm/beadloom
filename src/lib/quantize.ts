// Median-cut colour quantisation — reduce a bag of sampled pixels to N
// representative colours, used to lift a palette straight off a reference image.

type RGB = [number, number, number];

function bounds(box: RGB[]) {
  const mn: RGB = [255, 255, 255];
  const mx: RGB = [0, 0, 0];
  for (const p of box) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < mn[k]) mn[k] = p[k];
      if (p[k] > mx[k]) mx[k] = p[k];
    }
  }
  return { mn, mx };
}

export function medianCut(samples: RGB[], count: number): RGB[] {
  const n = Math.max(1, Math.round(count));
  if (samples.length <= n) return samples.slice();

  let boxes: RGB[][] = [samples.slice()];
  while (boxes.length < n) {
    // split the box with the widest single-channel spread
    let target = -1;
    let widest = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const { mn, mx } = bounds(boxes[i]);
      const spread = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
      if (spread > widest) {
        widest = spread;
        target = i;
      }
    }
    if (target < 0) break;

    const box = boxes[target];
    const { mn, mx } = bounds(box);
    let ch = 0;
    let best = mx[0] - mn[0];
    if (mx[1] - mn[1] > best) {
      ch = 1;
      best = mx[1] - mn[1];
    }
    if (mx[2] - mn[2] > best) ch = 2;

    box.sort((a, b) => a[ch] - b[ch]);
    const mid = box.length >> 1;
    boxes.splice(target, 1, box.slice(0, mid), box.slice(mid));
  }

  return boxes
    .filter((b) => b.length)
    .map((b) => {
      const s = [0, 0, 0];
      for (const p of b) {
        s[0] += p[0];
        s[1] += p[1];
        s[2] += p[2];
      }
      return [
        Math.round(s[0] / b.length),
        Math.round(s[1] / b.length),
        Math.round(s[2] / b.length),
      ] as RGB;
    });
}

export function rgbToHex([r, g, b]: RGB): string {
  return (
    '#' +
    [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
  );
}
