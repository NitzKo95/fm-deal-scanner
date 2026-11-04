import type { Region } from '../lib/types';
import type { Scaled } from './pixels';

/**
 * The bullets are a 3-pixel plus in game pixels, so the frame must be examined at no less than
 * about one examined pixel per game pixel, or shrinking blends them into the box behind. With the
 * game's pixel size known (from the shop list), the frame is examined at 1.5 examined pixels per
 * game pixel; without it, at full size up to this width.
 */
export const TOOLTIP_MAX_WIDTH = 3456;
const PX_PER_GAME_PX = 1.5;

export function tooltipExamineWidth(fw: number, gamePx: number | null): number {
  if (!gamePx || !(gamePx > 0)) return Math.min(fw, TOOLTIP_MAX_WIDTH);
  return Math.round(fw * Math.min(1, PX_PER_GAME_PX / gamePx));
}

export interface TooltipBox extends Region {
  /** line spacing in frame pixels */
  sp: number;
  /** top of the tooltip as a fraction of the frame height: where the mouse is */
  anchor: number;
}

/**
 * The bullet orange (237,112,45), also when partly blended into the dark box by scaling. Requirements
 * the character doesn't meet are written in red (234,51,35); `g - b` keeps their letters out.
 */
const isBullet = (r: number, g: number, b: number) => r >= 170 && g >= 70 && g <= 200 && b <= 120 && r - g >= 45 && g - b >= 30;

export interface Dot { cx: number; cy: number; size: number }

/** Small bullet-orange blobs; a bullet is a plus, so it covers about a third of its box or more. */
export function findBullets({ data: d, width: W, height: H }: Scaled['px']): Dot[] {
  if (!W || !H) return [];
  // 0 = not orange, 1 = orange, 2 = orange and visited
  const m = new Uint8Array(W * H);
  let any = 0;
  for (let i = 0, p = 0; p < m.length; i += 4, p++) if (isBullet(d[i]!, d[i + 1]!, d[i + 2]!)) { m[p] = 1; any++; }
  if (any < 3) return [];
  const dots: Dot[] = [];
  const stack: number[] = [];
  for (let p0 = 0; p0 < m.length; p0++) {
    if (m[p0] !== 1) continue;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    stack.push(p0); m[p0] = 2;
    while (stack.length) {
      const p = stack.pop()!, x = p % W, y = (p - x) / W;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (n > 400) continue;
      if (x > 0 && m[p - 1] === 1) { m[p - 1] = 2; stack.push(p - 1); }
      if (x < W - 1 && m[p + 1] === 1) { m[p + 1] = 2; stack.push(p + 1); }
      if (y > 0 && m[p - W] === 1) { m[p - W] = 2; stack.push(p - W); }
      if (y < H - 1 && m[p + W] === 1) { m[p + W] = 2; stack.push(p + W); }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w >= 2 && h >= 2 && w <= 14 && h <= 14 && w / h <= 2 && h / w <= 2 && n >= w * h * 0.3) {
      dots.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, size: Math.max(w, h) });
    }
  }
  return dots;
}

/** Orange still, after blending into the box: the hue of the bullet, at half its strength or more. */
const isFaint = (r: number, g: number, b: number) => r >= 110 && r - g >= 30 && g - b >= 8;

/** Whether a blended bullet sits where the column's next one would. */
function faintBullet({ data: d, width: W, height: H }: Scaled['px'], cx: number, cy: number, sp: number): boolean {
  const ry = Math.max(2, Math.round(sp * 0.15));
  let n = 0;
  for (let y = Math.max(0, Math.round(cy) - ry); y <= Math.min(H - 1, Math.round(cy) + ry); y++) {
    for (let x = Math.max(0, Math.round(cx) - 2); x <= Math.min(W - 1, Math.round(cx) + 2); x++) {
      const i = (y * W + x) * 4;
      if (isFaint(d[i]!, d[i + 1]!, d[i + 2]!)) n++;
    }
  }
  return n >= 2;
}

/** The longest evenly spaced vertical run of dots. */
export function bulletColumn(dots: readonly Dot[]): { n: number; cx: number; top: number; bottom: number; sp: number } | null {
  let best: { n: number; cx: number; top: number; bottom: number; sp: number } | null = null;
  for (const dot of dots) {
    const col = dots.filter((q) => Math.abs(q.cx - dot.cx) <= 2).sort((a, b) => a.cy - b.cy);
    for (let j = 0; j + 2 < col.length; j++) {
      const sp = col[j + 1]!.cy - col[j]!.cy;
      if (sp < 8 || sp > 90 || col[j]!.size > sp * 0.45) continue;
      let k = j + 1;
      while (k + 1 < col.length && Math.abs(col[k + 1]!.cy - col[k]!.cy - sp) <= Math.max(2, sp * 0.2)) k++;
      const n = k - j + 1;
      if (n >= 3 && (!best || n > best.n)) best = { n, cx: col[j]!.cx, top: col[j]!.cy, bottom: col[k]!.cy, sp };
    }
  }
  return best;
}

/**
 * Hovering an item shows a tooltip whose stat lines each start with a small orange bullet,
 * stacked at the same x and evenly spaced. That column is found by color at any size.
 */
export function findTooltip({ px, scale: s }: Scaled): TooltipBox | null {
  const { width: W, height: H } = px;
  const best = bulletColumn(findBullets(px));
  if (!best) return null;
  const { cx, sp } = best;
  // a bullet that scaling blended too far into the box behind it is still faintly orange: follow
  // the column past its ends, so a lost first or last bullet doesn't cut off a line
  let { top, bottom } = best;
  while (top - sp > 0 && faintBullet(px, cx, top - sp, sp)) top -= sp;
  while (bottom + sp < H && faintBullet(px, cx, bottom + sp, sp)) bottom += sp;
  // the name and requirements sit above the first bullet; the box runs about 15 lines wide
  const X0 = Math.max(0, cx - sp * 0.8), X1 = Math.min(W, cx + sp * 15);
  const Y0 = Math.max(0, top - sp * 9.2), Y1 = Math.min(H, bottom + sp * 1.1);
  return { x: X0 / W, y: Y0 / H, w: (X1 - X0) / W, h: (Y1 - Y0) / H, sp: sp / s, anchor: Y0 / H };
}
