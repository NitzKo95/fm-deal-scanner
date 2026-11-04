import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { createWorker, type Worker } from 'tesseract.js';
import type { OcrLine } from '../../src/lib/types';
import { OCR_PARAMS, toLines } from '../../src/ocr/lines';
import type { FrameAdapter, Ocr } from '../../src/scan/scanner';
import type { Pixels } from '../../src/vision/pixels';
import type { Rect } from '../../src/vision/preprocess';
import { examine, scaleBy } from './image';

/** Frames as plain pixel arrays; the reader gets PNG files. The same steps the browser adapter takes. */
export const pixelsAdapter: FrameAdapter<Pixels, Buffer> = {
  size: (f) => ({ w: f.width, h: f.height }),
  examine: (f, width) => examine(f, width),
  crop(f, { sx, sy, sw, sh }: Rect, scale) {
    const out = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) out.set(f.data.subarray(((sy + y) * f.width + sx) * 4, ((sy + y) * f.width + sx + sw) * 4), y * sw * 4);
    const px: Pixels = { data: out, width: sw, height: sh };
    return scale === 1 ? px : scaleBy(px, scale);
  },
  toImage(px) {
    const png = new PNG({ width: px.width, height: px.height });
    png.data = Buffer.from(px.data.buffer, px.data.byteOffset, px.data.byteLength);
    return PNG.sync.write(png);
  },
};

const LANG = fileURLToPath(new URL('../../node_modules/@tesseract.js-data/eng/4.0.0_best_int', import.meta.url));

/** The real text reader, with the model the site serves. */
export async function nodeOcr(): Promise<Ocr<Buffer> & { terminate(): Promise<void> }> {
  const w: Worker = await createWorker('eng', 1, { langPath: LANG, cacheMethod: 'none', gzip: true });
  await w.setParameters(OCR_PARAMS);
  return {
    async recognize(img): Promise<OcrLine[]> { return toLines((await w.recognize(img)).data); },
    async terminate() { await w.terminate(); },
  };
}
