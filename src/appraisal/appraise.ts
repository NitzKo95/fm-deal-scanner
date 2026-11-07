import type { Engine } from '../engine';
import type { AppraisalEntry, AppraisalMode, StatValue, UsualSource } from '../lib/types';
import { isSetItem } from '../market/marketIndex';
import { usualPrice } from '../pricing/evaluate';
import { statValue } from '../tooltip/statValue';

/** What the appraisal's modes mean, in words, for the panel. */
export const APPRAISAL_MODES: Record<AppraisalMode, { label: string; blurb: string }> = {
  fair: { label: 'Fair', blurb: "the tracker's typical price" },
  greedy: { label: 'Greedy', blurb: "the higher of the tracker's typical price and the upper quarter of your own sightings" },
};

/** `line` is a price typed on that line of the appraisal. */
export type LineSource = UsualSource | 'line';
/** priced: counted; rough: counted, but from fewer than 5 sales or wildly varying ones; unpriced and ignored: not counted. */
export type LineTag = 'priced' | 'rough' | 'unpriced' | 'ignored';

export interface AppraisalLine {
  entry: AppraisalEntry;
  /** the tracker's spelling when the item is known */
  name: string;
  known: boolean;
  /** throwing stars and bullets: one item holding a count, priced per set */
  set: boolean;
  /** price each (per set for sets), with any stats applied */
  unit: number | null;
  src: LineSource | null;
  stats: StatValue | null;
  total: number | null;
  tag: LineTag;
}

export interface AppraisalResult {
  mode: AppraisalMode;
  lines: AppraisalLine[];
  /** priced and rough lines together */
  total: number;
  /** the part of the total that is rough */
  rough: number;
  /** lines with no price at all */
  unpriced: number;
  ignored: number;
  /** lines and stacks counted (ignored ones are not) */
  kinds: number;
  items: number;
  /** the percentage of the total on offer */
  bulk: number;
  /** the total at that percentage */
  quote: number;
}

/** One line: what each costs in this mode, what that makes for the stack, and how sure the price is. */
export function appraiseEntry(e: Engine, entry: AppraisalEntry, mode: AppraisalMode): AppraisalLine {
  const it = e.book.items[entry.key], mk = e.market.get(entry.key);
  const name = mk ? mk.n : entry.name;
  const set = isSetItem(mk, name);
  const typed = entry.price && entry.price > 0 ? entry.price : null;
  const u = typed != null ? { value: typed, src: 'line' as const, rough: false } : usualPrice(it, mk, e.settings, e.now(), mode);
  // stats read from a hover tooltip scale an equip's price, and settle a rough market price, as in the shop
  const stats = entry.tip && typed == null
    ? statValue(entry.tip, { statPct: e.settings.statPct, slotWorth: e.settings.slotWorth, maxSlotsSeen: it?.maxSlots })
    : null;
  const unit = u ? u.value * (stats?.mult ?? 1) : null;
  const rough = !!u?.rough && !stats;
  const total = unit == null ? null : Math.round(unit * entry.qty);
  const tag: LineTag = entry.ignored ? 'ignored' : unit == null ? 'unpriced' : rough ? 'rough' : 'priced';
  return { entry, name, known: e.market.knownName(entry.key) != null, set, unit, src: u?.src ?? null, stats, total, tag };
}

/** The whole appraisal: every line priced in `mode`, the total, and the offer at `bulk` percent of it. */
export function appraise(e: Engine, entries: readonly AppraisalEntry[], mode: AppraisalMode, bulk = 100): AppraisalResult {
  const lines = entries.map((x) => appraiseEntry(e, x, mode));
  let total = 0, rough = 0, unpriced = 0, ignored = 0, kinds = 0, items = 0;
  for (const l of lines) {
    if (l.tag === 'ignored') { ignored++; continue; }
    kinds++;
    items += l.entry.qty;
    if (l.tag === 'unpriced') { unpriced++; continue; }
    total += l.total ?? 0;
    if (l.tag === 'rough') rough += l.total ?? 0;
  }
  return { mode, lines, total, rough, unpriced, ignored, kinds, items, bulk, quote: Math.round((total * bulk) / 100) };
}
