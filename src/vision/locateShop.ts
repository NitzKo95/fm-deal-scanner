import type { Region } from '../lib/types';
import type { Scaled } from './pixels';

/** Width the frame is examined at. */
export const LOCATE_WIDTH = 800;

/** Darker than this (brightest channel) is text, live or sold. */
const INK = 170;
/** Lists have 12-14% text; light stone in a game scene about 1.5%. */
const MIN_INK = 0.04;

/** The list is this many game pixels wide, at any window size. */
export const LIST_GAME_PX = 206;

/** How many frame pixels one game pixel takes, from where the list was found. */
export const gamePixel = (list: Region, fw: number): number => (list.w * fw) / LIST_GAME_PX;

/**
 * The shop's name-and-price cells are always the same blue-gray, and a selected row turns orange,
 * whatever the window or screen size.
 */
export function isCell(r: number, g: number, b: number): boolean {
  return (Math.abs(r - 206) <= 20 && Math.abs(g - 219) <= 18 && Math.abs(b - 228) <= 18 && b >= r)
    || (Math.abs(r - 218) <= 26 && Math.abs(g - 154) <= 26 && Math.abs(b - 66) <= 30);
}

/**
 * Finds the shop's item list. Every cell in the list ends at the same right edge, so: mark
 * cell-colored pixels, find the right edge the most scanlines run up to, take the rows stacked
 * along it, and walk left until the columns stop being cell-colored (that is the icon column).
 * Nothing depends on where the game window is or how big it is.
 */
export function locateShop({ px, scale: s, fw, fh }: Scaled): Region | null {
  const { data: d, width: W, height: H } = px;
  if (!W || !H) return null;
  const m = new Uint8Array(W * H);
  // text: anything clearly darker than the cells, sold rows' grey text included
  const ink = new Uint8Array(W * H);
  let any = 0;
  for (let i = 0, p = 0; p < m.length; i += 4, p++) {
    if (isCell(d[i]!, d[i + 1]!, d[i + 2]!)) { m[p] = 1; any++; }
    else if (Math.max(d[i]!, d[i + 1]!, d[i + 2]!) < INK) ink[p] = 1;
  }
  if (any < 200) return null;

  // runs of cell color on each scanline (a one-pixel break is allowed), filed by where they end
  const MINRUN = 24;
  const votes = new Map<number, number[]>();
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W;) {
      if (!m[o + x]) { x++; continue; }
      const x0 = x;
      while (x < W && (m[o + x] || (x + 1 < W && m[o + x + 1]))) x++;
      const x1 = x - 1;
      if (x1 - x0 + 1 >= MINRUN) {
        const k = (x1 / 3) | 0;
        let v = votes.get(k);
        if (!v) votes.set(k, (v = []));
        v.push(y, x1, x1 - x0 + 1);
      }
    }
  }

  // per-column running counts: how cell-colored a column is between two rows, in constant time
  const PS = new Int32Array((H + 1) * W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) PS[(y + 1) * W + x] = PS[y * W + x]! + m[y * W + x]!;
  const colDensity = (x: number, y0: number, y1: number) => (PS[(y1 + 1) * W + x]! - PS[y0 * W + x]!) / (y1 - y0 + 1);
  // the same for text, summed over areas
  const IS = new Int32Array((H + 1) * (W + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) { row += ink[y * W + x]!; IS[(y + 1) * (W + 1) + x + 1] = IS[y * (W + 1) + x + 1]! + row; }
  }
  const inkShare = (x0: number, y0: number, x1: number, y1: number) =>
    (IS[(y1 + 1) * (W + 1) + x1 + 1]! - IS[y0 * (W + 1) + x1 + 1]! - IS[(y1 + 1) * (W + 1) + x0]! + IS[y0 * (W + 1) + x0]!) / ((x1 - x0 + 1) * (y1 - y0 + 1));
  const median = (a: number[]) => a.slice().sort((p, q) => p - q)[a.length >> 1]!;

  let best: { score: number; xl: number; xr: number; y0: number; y1: number } | null = null;
  for (const k of votes.keys()) {
    const pool = [...(votes.get(k - 1) ?? []), ...votes.get(k)!, ...(votes.get(k + 1) ?? [])];
    const yset = new Set<number>(), ends: number[] = [];
    let longest = 0;
    for (let i = 0; i < pool.length; i += 3) { yset.add(pool[i]!); ends.push(pool[i + 1]!); longest = Math.max(longest, pool[i + 2]!); }
    if (yset.size < 6) continue;
    const ys = [...yset].sort((p, q) => p - q);
    const xr = median(ends);
    // a long name runs almost to the edge and leaves a gap as tall as its text: allow about a row
    const maxGap = Math.max(12, Math.round(longest * 0.3));
    let g0 = ys[0]!, gPrev = ys[0]!, gN = 1, b0 = ys[0]!, b1 = ys[0]!, bN = 1;
    for (let i = 1; i < ys.length; i++) {
      const y = ys[i]!;
      if (y - gPrev <= maxGap) gN++; else { g0 = y; gN = 1; }
      gPrev = y;
      if (gN > bN) { bN = gN; b0 = g0; b1 = y; }
    }
    const y0 = b0, y1 = b1;
    let x = xr, low = 0;
    while (x > 0) {
      if (colDensity(x, y0, y1) < 0.25) low++; else low = 0;
      if (low >= 3) break;
      x--;
    }
    const xl = x + 3, w = xr - xl + 1, h = y1 - y0 + 1;
    // too small to be a shop list: it is 206 game pixels wide, and a game pixel is a screen pixel or more
    if (w / s < 150 || h / s < 30) continue;
    // every listing has its name and price written in it: a patch of cell color without text is scenery
    if (inkShare(xl, y0, xr, y1) < MIN_INK) continue;
    let fill = 0;
    for (let c = xl; c <= xr; c++) fill += colDensity(c, y0, y1);
    fill /= w;
    const score = bN * w * (fill < 0.92 ? 1 : 0.3);   // a plain panel of that color is not a list
    if (!best || score > best.score) best = { score, xl, xr, y0, y1 };
  }
  if (!best) return null;
  const X0 = Math.max(0, best.xl / s - 1), Y0 = Math.max(0, best.y0 / s - 1);
  const X1 = Math.min(fw, (best.xr + 1) / s + 1), Y1 = Math.min(fh, (best.y1 + 1) / s + 1);
  return { x: X0 / fw, y: Y0 / fh, w: (X1 - X0) / fw, h: (Y1 - Y0) / fh };
}
