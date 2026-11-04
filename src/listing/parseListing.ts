import type { BBox, OcrLine, RawListing } from '../lib/types';

/** A grayscale copy of the crop the text was read from. */
export interface GrayImage { gray: Uint8Array; w: number; h: number }

/**
 * "N for X mesos", tolerating the usual misreads: O/o for 0, I/l/| for 1, "tor"/"fon" for "for",
 * "rnesos"/"mcsos" for "mesos". The count is whole: "99999 for" is not read as "9999 for".
 */
export const PRICE_RE = /(?<![0-9OoIl|])([0-9OoIl|]{1,4})\s*[ft][o0][rn]\s*([0-9OoIl|,.\s]{1,18}?)\s*(?:m|rn)[e3c][s5]/i;
const FOR_WORD = /^[ft][o0][rn]$/i;
const MESOS_WORD = /^(?:m|rn)[e3c][s5]/i;

const toDigits = (s: string): string => s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');

/** The item name on a name line, without bits of the icon read as text or a cut-off tail. */
export function cleanName(t: string): { name: string; truncated: boolean } {
  let s = t.split(/\s{3,}/)[0] ?? '';
  // "o] Korean Fan", "1| Red Potion", "a Wolbi"
  s = s.replace(/^[^A-Za-z0-9(]+/, '').replace(/^[a-z0-9]{1,2}[\][)(|}{:;.,'"!]+\s*(?=[A-Z])/, '').replace(/^[a-z]\s+(?=[A-Z])/, '');
  const truncated = /(\.\.|…)\s*$/.test(s);
  s = s.replace(/[.…]+\s*$/, '').replace(/[^A-Za-z0-9)%!?'"+\]]+$/, '');
  return { name: s.replace(/\s+/g, ' ').trim(), truncated };
}

/** Darkest 3% of the price digits: dark text is a live listing, light grey text is sold. */
export function isGreyed(img: GrayImage, line: OcrLine): boolean {
  const words = (line.words ?? []).filter((w) => /\d/.test(w.text));
  const b: BBox | undefined = words.length
    ? words.reduce((a, w) => ({ x0: Math.min(a.x0, w.bbox.x0), y0: Math.min(a.y0, w.bbox.y0), x1: Math.max(a.x1, w.bbox.x1), y1: Math.max(a.y1, w.bbox.y1) }),
      { x0: 1e9, y0: 1e9, x1: -1, y1: -1 })
    : line.bbox;
  if (!b) return false;
  const x0 = Math.max(0, b.x0 | 0), x1 = Math.min(img.w, b.x1 | 0), y0 = Math.max(0, b.y0 | 0), y1 = Math.min(img.h, b.y1 | 0);
  if (x1 <= x0 || y1 <= y0) return false;
  const hist = new Uint32Array(256);
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { hist[img.gray[y * img.w + x]!]!++; n++; }
  let acc = 0;
  const target = n * 0.03;
  for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= target) return v > 120; }
  return false;
}

/**
 * A blank stretch inside "for 99,999 mesos" wider than about two characters means something
 * (the mouse, a tooltip edge, a half-drawn frame) hid digits, so "99" may really be "99,999".
 */
export function priceGap(line: OcrLine): boolean {
  const ws = (line.words ?? []).filter((w) => w.bbox && w.text.trim());
  const f = ws.findIndex((w) => FOR_WORD.test(w.text.trim()));
  const m = ws.findIndex((w, i) => i > f && MESOS_WORD.test(w.text.trim()));
  if (f < 0 || m - f < 2) return false;
  const span = ws.slice(f, m + 1);
  const h = Math.max(...span.map((w) => w.bbox.y1 - w.bbox.y0));
  let gap = 0;
  for (let i = 1; i < span.length; i++) gap = Math.max(gap, span[i]!.bbox.x0 - span[i - 1]!.bbox.x1);
  return h > 0 && gap > h * 1.2;
}

/** Pairs each "N for X mesos" line with the name line above it. */
export function parseLines(lines: readonly OcrLine[], img?: GrayImage): RawListing[] {
  const rows: RawListing[] = [];
  let pending: { name: string; truncated: boolean; conf: number; y0: number | null } | null = null;
  for (const l of lines) {
    const text = (l.text || '').trim();
    if (!text) continue;
    const m = text.match(PRICE_RE);
    if (m) {
      if (pending) {
        const qty = parseInt(toDigits(m[1]!).replace(/\D/g, ''), 10);
        const priceRaw = toDigits(m[2]!).replace(/\s+/g, '').replace(/\.(?=\d{3}\b)/g, ',');
        const price = parseInt(priceRaw.replace(/\D/g, ''), 10);
        if (qty > 0 && qty <= 10000 && price > 0) {
          const wellFormed = /^\d{1,3}(,\d{3})*$/.test(priceRaw) && (l.confidence || 0) >= 65 && !priceGap(l);
          rows.push({
            name: pending.name, truncated: pending.truncated, nameConf: pending.conf,
            cy: l.bbox ? ((pending.y0 ?? l.bbox.y0) + l.bbox.y1) / 2 : null,
            qty, price, greyed: img ? isGreyed(img, l) : false, unsure: !wellFormed,
          });
        }
      }
      pending = null;
    } else {
      const c = cleanName(text);
      if (c.name.length >= 3 && /[A-Za-z]{2}/.test(c.name)) pending = { ...c, conf: l.confidence ?? 100, y0: l.bbox ? l.bbox.y0 : null };
    }
  }
  return rows;
}
