import { cleanName } from '../listing/parseListing';
import { lev } from '../lib/text';
import type { OcrLine, StatLine, TooltipRead } from '../lib/types';

/**
 * Stat lines and how much one point of each is worth, relative to a point of attack. Labels are
 * compared letters only, allowing a misread letter or two in the long ones ("WWeapan Attack").
 */
const STAT_KINDS: readonly [string, string, number][] = [
  ['weaponattack', 'att', 1], ['magicattack', 'magic att', 1],
  ['str', 'STR', 0.5], ['dex', 'DEX', 0.5], ['int', 'INT', 0.5], ['luk', 'LUK', 0.5],
  ['accuracy', 'accuracy', 0.2], ['avoidability', 'avoid', 0.15], ['speed', 'speed', 0.2], ['jump', 'jump', 0.1],
  ['weapondefense', 'weapon def', 0.05], ['magicdefense', 'magic def', 0.05],
  ['maxhp', 'HP', 0.01], ['maxmp', 'MP', 0.01], ['hp', 'HP', 0.01], ['mp', 'MP', 0.01],
];

export function statKind(label: string): { label: string; weight: number } | null {
  const k = label.toLowerCase().replace(/[^a-z]/g, '');
  const tol = k.length >= 10 ? 2 : k.length >= 6 ? 1 : 0;
  let best: (typeof STAT_KINDS)[number] | null = null, bd = Infinity;
  for (const kind of STAT_KINDS) {
    const d = lev(kind[0], k);
    if (d < bd) { bd = d; best = kind; }
  }
  return best && bd <= tol ? { label: best[1], weight: best[2] } : null;
}

/** Letters the reader takes for digits in numbers: "(G0 +2)" is "(60 +2)". */
const toDigits = (s: string) => s.replace(/[Gb]/g, '6').replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/[Ss]/g, '5').replace(/B/g, '8').replace(/[Zz]/g, '2');

/**
 * "+62 (60 +2)": a total, its base and the difference. Each is checked against the others, so one
 * misread part (a lost minus, a base of "0" for "60") can't change the result; with no way to tell,
 * the stat counts as average.
 */
export function statNumbers(value: string): { total: number; base: number } | null {
  const m = toDigits(value).match(/^\s*\+?\s*(\d+)\s*(?:\(\s*(\d*)\s*([+-])?\s*(\d+)?\s*\)?)?/);
  if (!m) return null;
  const total = +m[1]!, base = m[2] ? +m[2] : null, sign = m[3] ?? null, mod = m[4] != null ? +m[4] : null;
  // copies differ from the base by a few points; "(602)" for "(60 2)" is not a base of 602
  const plausible = (b: number) => Math.abs(total - b) <= Math.max(10, 0.35 * b);
  if (base != null && (mod == null || Math.abs(total - base) === mod) && plausible(base)) return { total, base };
  if (mod != null && sign && plausible(total - (sign === '-' ? -mod : mod))) return { total, base: total - (sign === '-' ? -mod : mod) };
  return { total, base: total };
}

/** Resolves a name read off the screen: its key, and the tracker's spelling when it is a known item. */
export type ResolveName = (name: string) => { key: string; known: string | null };

export function parseTooltip(lines: readonly OcrLine[], resolve: ResolveName): TooltipRead | null {
  const texts = lines.map((l) => (l.text || '').replace(/[−–—~]/g, '-').trim()).filter(Boolean);
  const firstReq = texts.findIndex((t) => /\bREQ\b/i.test(t));

  // The name line, read through a see-through box, can pick up a stray word or symbol in front:
  // try it whole, then without its first word or two. Prefer a name the tracker knows.
  let key: string | null = null, name: string | null = null, known = false;
  // the name is above the requirements; with no requirements read, within the first lines
  for (const t of firstReq >= 0 ? texts.slice(0, firstReq) : texts.slice(0, 3)) {
    const words = t.split(/\s+/).length;
    for (let drop = 0; drop <= Math.min(2, words - 1) && !known; drop++) {
      // dropping words with a regex keeps the wide gaps cleanName splits on
      const c = cleanName(t.replace(new RegExp(`^(\\S+\\s+){${drop}}`), ''));
      if (c.name.length < 3 || !/[A-Za-z]{2}/.test(c.name)) continue;
      const r = resolve(c.name);
      if (r.known) { key = r.key; name = r.known; known = true; }
      else if (!name && drop === 0) { key = r.key; name = c.name; }
    }
    if (known) break;
  }

  const stats: StatLine[] = [];
  let remaining: number | null = null, type = '';
  for (const t of texts) {
    if (/\bREQ\b/i.test(t)) continue;   // requirements, not stats
    // "Remaining Enhancements: 7", also as "Femaining Enhancements 7"
    if (/emaining|nhance/i.test(t)) {
      const n = t.match(/(\d{1,2})\D*$/);
      if (n) remaining = +n[1]!;
      continue;
    }
    let mm = t.match(/type\s*[:;]\s*([A-Za-z][A-Za-z -]+)/i);
    if (mm) { type = mm[1]!.trim(); continue; }
    mm = t.match(/^[^A-Za-z]*([A-Za-z][A-Za-z .]*?)\s*[:;]\s*(.+)$/);
    if (!mm) continue;
    const kind = statKind(mm[1]!);
    const nums = kind && statNumbers(mm[2]!);
    if (!kind || !nums) continue;
    stats.push({ label: kind.label, weight: kind.weight, total: nums.total, base: nums.base, delta: nums.total - nums.base });
  }
  if (!key || !name || (!stats.length && remaining == null)) return null;
  return { key, name, type, stats, remaining };
}
