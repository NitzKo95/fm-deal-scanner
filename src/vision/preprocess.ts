import type { Region } from '../lib/types';
import type { GrayImage } from '../listing/parseListing';
import type { Pixels } from './pixels';

/** A source rectangle in frame pixels. */
export interface Rect { sx: number; sy: number; sw: number; sh: number }

/** A region (fractions of the frame) in whole frame pixels, kept inside the frame. */
export function toRect(r: Region, fw: number, fh: number): Rect {
  const sx = Math.max(0, Math.round(r.x * fw)), sy = Math.max(0, Math.round(r.y * fh));
  return { sx, sy, sw: Math.min(fw - sx, Math.round(r.w * fw)), sh: Math.min(fh - sy, Math.round(r.h * fh)) };
}

/** The text reader does best with list text about 900 pixels across the list. */
export const listScale = (sw: number): number => Math.max(1, Math.min(3, 900 / sw));

/** ...and with tooltip lines about 40 pixels apart. */
export const tooltipScale = (sp: number): number => Math.max(1, Math.min(3, 40 / sp));

export const MIN_LIST_PX = 20;
export const MIN_TOOLTIP_PX = 40;

/**
 * Grayscale from the brightest channel, not luminance: the orange selected row and the blue-gray
 * rows both come out light, so dark text reads the same on either. Writes the gray back into the
 * pixels (for the reader) and returns it (for the sold-row check and the change signature).
 */
export function listGray(px: Pixels): GrayImage {
  const d = px.data, gray = new Uint8Array(px.width * px.height);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    const l = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
    gray[p] = l; d[i] = l; d[i + 1] = l; d[i + 2] = l;
  }
  return { gray, w: px.width, h: px.height };
}

/** Tooltip text is light on a dark see-through box: inverted, the reader gets dark on light. */
export function tooltipGray(px: Pixels): void {
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 255 - Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
    d[i] = l; d[i + 1] = l; d[i + 2] = l;
  }
}

/** A small grayscale thumbnail, to tell whether the tooltip changed since the last read. */
export function thumbSignature(px: Pixels, n = 48): Float32Array {
  const out = new Float32Array(n * n);
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const x = Math.floor(((gx + 0.5) * px.width) / n), y = Math.floor(((gy + 0.5) * px.height) / n);
      out[gy * n + gx] = px.data[(y * px.width + x) * 4] ?? 0;
    }
  }
  return out;
}
