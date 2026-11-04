import type { Engine } from '../engine';
import type { BookItem, Evaluation, Listing, MarketItem, Settings, TooltipRead, UsualSource } from '../lib/types';
import { isRough } from '../market/marketIndex';
import { statValue } from '../tooltip/statValue';
import { sightingStats } from './priceBook';

export interface Usual { value: number; src: UsualSource; rough: boolean }

/** Your typed price wins; otherwise the lower (safer) of the market price and your own sightings. */
export function usualPrice(it: BookItem | null | undefined, mk: MarketItem | null, settings: Settings, now: number): Usual | null {
  if (it?.manualRef) return { value: it.manualRef, src: 'yours', rough: false };
  const st = sightingStats(it, now);
  const seen = st.n >= settings.minSeen ? (settings.base === 'q25' ? st.q25 : st.median) : null;
  const mkt = settings.market !== 'off' && mk?.p ? mk.p : null;
  if (mkt != null && (seen == null || mkt <= seen)) return { value: mkt, src: 'market', rough: isRough(mk) };
  if (seen != null) return { value: seen, src: 'seen', rough: false };
  return null;
}

export type Judged = Listing & { tip?: TooltipRead };

export function evaluate(e: Engine, row: Judged): Evaluation {
  const it = e.book.items[row.key];
  const mk = e.market.get(row.key);
  let u = usualPrice(it, mk, e.settings, e.now());
  // stats read from the hover tooltip scale the usual price, and settle a "rough" market price
  const stats = row.tip ? statValue(row.tip, { statPct: e.settings.statPct, slotWorth: e.settings.slotWorth, maxSlotsSeen: it?.maxSlots }) : null;
  const usualBase = u && stats ? u.value : null;
  if (u && stats) u = { ...u, value: u.value * stats.mult, rough: false };
  const out: Evaluation = {
    verdict: 'new', usual: u?.value ?? null, usualBase, usualSrc: u?.src ?? null, stats,
    pct: null, profit: null, target: false, why: '',
  };
  if (row.greyed) return { ...out, verdict: 'sold' };
  if (u) {
    out.pct = row.unit / u.value - 1;
    out.profit = Math.round(u.value * row.units * (1 - e.settings.fee / 100) - row.price);
    if (out.pct <= -e.settings.discount / 100 && out.profit >= e.settings.minProfit) out.verdict = 'deal';
    else if (out.pct >= 0.15) out.verdict = 'high';
    else out.verdict = 'fair';
  }
  if (out.verdict === 'deal' && u?.rough) {
    out.verdict = 'unsure';
    out.why = (mk?.f ?? '').includes('w')
      ? 'Copies of this item sell for very different prices. Check its stats before buying.'
      : 'The market price comes from fewer than 5 sales.';
  }
  if (it?.buyUnder && row.unit <= it.buyUnder) { out.verdict = 'deal'; out.target = true; out.why = ''; }
  if (row.unsure && out.verdict === 'deal') { out.verdict = 'unsure'; out.why = "The price didn't read cleanly."; }
  return out;
}
