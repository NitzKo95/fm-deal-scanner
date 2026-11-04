/** A coarse grid of a grayscale image, to tell whether the screen changed since the last read. */
export function signature(gray: Uint8Array, w: number, h: number, n = 40): Float32Array {
  const out = new Float32Array(n * n);
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const x = Math.floor(((gx + 0.5) * w) / n), y = Math.floor(((gy + 0.5) * h) / n);
      out[gy * n + gx] = gray[y * w + x] ?? 0;
    }
  }
  return out;
}

/** Mean absolute difference between two signatures; below 2 means nothing visible changed. */
export function sigDiff(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return s / a.length;
}
