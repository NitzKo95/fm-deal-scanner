import type { FrameAdapter } from '../scan/scanner';
import type { Pixels, Scaled } from './pixels';
import type { Rect } from './preprocess';

/** Anything a canvas can draw: a VideoFrame from the share, an ImageBitmap of a screenshot, a video. */
export type Frame = CanvasImageSource;

export function frameSize(f: Frame): { w: number; h: number } {
  const x = f as Partial<VideoFrame & HTMLVideoElement & ImageBitmap & HTMLCanvasElement>;
  return { w: x.displayWidth || x.videoWidth || x.width || 0, h: x.displayHeight || x.videoHeight || x.height || 0 };
}

function context(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/** Frames drawn into canvases. Crops come back as ImageData; the reader gets a canvas of them. */
export const canvasAdapter: FrameAdapter<Frame, HTMLCanvasElement> = {
  size: frameSize,

  examine(f, width): Scaled {
    const { w: fw, h: fh } = frameSize(f);
    const s = Math.min(1, width / fw);
    const w = Math.max(1, Math.round(fw * s)), h = Math.max(1, Math.round(fh * s));
    const ctx = context(w, h);
    ctx.drawImage(f, 0, 0, w, h);
    return { px: ctx.getImageData(0, 0, w, h), scale: s, fw, fh };
  },

  crop(f, { sx, sy, sw, sh }: Rect, scale): Pixels {
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const ctx = context(w, h);
    ctx.drawImage(f, sx, sy, sw, sh, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  },

  toImage(px): HTMLCanvasElement {
    const ctx = context(px.width, px.height);
    // ImageData from crop() goes straight back; anything else is copied into a fresh one
    const img = px instanceof ImageData ? px : new ImageData(px.width, px.height);
    if (img !== px) img.data.set(px.data);
    ctx.putImageData(img, 0, 0);
    return ctx.canvas;
  },
};

/** Whether a frame is all black: macOS hides a window or screen from a browser that lacks permission. */
export function isBlack(f: Frame): boolean {
  const ctx = context(32, 18);
  ctx.drawImage(f, 0, 0, 32, 18);
  const px = ctx.getImageData(0, 0, 32, 18).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += px[i]! + px[i + 1]! + px[i + 2]!;
  return sum / (px.length / 4) / 3 < 4;
}

/** A frame copied into a canvas, to keep after the frame itself is closed. */
export function snapshot(f: Frame): HTMLCanvasElement {
  const { w, h } = frameSize(f);
  const ctx = context(w, h);
  ctx.drawImage(f, 0, 0);
  return ctx.canvas;
}
