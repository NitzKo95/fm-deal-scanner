import { PSM, type WorkerParams } from 'tesseract.js';
import type { BBox, OcrLine } from '../lib/types';

/** The parts of a tesseract.js result the parsers use. */
export interface TesseractLike {
  lines?: readonly { text: string; confidence: number; bbox?: BBox; words?: readonly { text: string; bbox: BBox }[] }[] | null;
}

/** Keeps only text, confidence and boxes: small enough to store as a test fixture. */
export function toLines(data: TesseractLike): OcrLine[] {
  return (data.lines ?? []).map((l) => ({
    text: l.text,
    confidence: l.confidence,
    ...(l.bbox ? { bbox: { x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1 } } : {}),
    words: (l.words ?? []).map((w) => ({ text: w.text, bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 } })),
  }));
}

/** Tesseract settings both readers use: a uniform block of text, keeping wide gaps between words. */
export const OCR_PARAMS: Partial<WorkerParams> = { tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' };
