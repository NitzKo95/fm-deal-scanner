import { createWorker, type Worker } from 'tesseract.js';
import type { OcrLine } from '../lib/types';
import type { Ocr } from '../scan/scanner';
import { OCR_PARAMS, toLines } from './lines';

/** The reader's files, served by this site (see scripts/copy-ocr-assets.mjs). */
const asset = (p: string) => new URL(`${import.meta.env.BASE_URL}ocr/${p}`, location.href).href;

/** The text reader in a web worker. Loads once, about 3 MB, on first use. */
export class Reader implements Ocr<HTMLCanvasElement> {
  private worker: Promise<Worker> | null = null;
  ready = false;

  load(): Promise<Worker> {
    this.worker ??= (async () => {
      const w = await createWorker('eng', 1, {
        workerPath: asset('worker.min.js'),
        corePath: asset('core'),
        langPath: asset('lang'),
        // the browser caches the files; the reader's own IndexedDB cache would keep a second copy
        cacheMethod: 'none',
      });
      await w.setParameters(OCR_PARAMS);
      this.ready = true;
      return w;
    })().catch((e: unknown) => { this.worker = null; throw e; });
    return this.worker;
  }

  async recognize(img: HTMLCanvasElement): Promise<OcrLine[]> {
    const w = await this.load();
    return toLines((await w.recognize(img)).data);
  }
}
