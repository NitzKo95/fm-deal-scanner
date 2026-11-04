import type { Engine } from '../engine';
import type { Evaluation, Listing, RawListing, TooltipRead } from '../lib/types';
import { isSetItem } from '../market/marketIndex';
import { resolveKey } from '../market/matching';
import { evaluate } from '../pricing/evaluate';
import { logSighting } from '../pricing/priceBook';
import { statSig, statValue } from '../tooltip/statValue';

export interface Copy { tip: TooltipRead; ts: number }

/** One listing in the open shop; identical listings share a record and a count. */
export interface ShopRecord extends Listing, Evaluation {
  count: number;
  /** where each copy sits on screen, as fractions of the frame height */
  fys: number[];
  seenAt: number;
  /** hovered copies, by their stats */
  copies?: Map<string, Copy>;
}

/** A row of the table: a listing, one hovered copy of it, or the copies not hovered yet. */
export interface DisplayRow extends ShopRecord { sig?: string; unchecked?: boolean }
export interface Deal extends DisplayRow { ts: number }

export interface Hover { key: string; name: string; summary: string; mult: number; ts: number; rec: ShopRecord | null }

export interface SessionEvents {
  /** a new deal, worth a sound */
  onDeal?: (d: Deal) => void;
}

const keyOf = (r: Listing) => `${r.key}|${r.qty}|${r.price}|${r.greyed ? 1 : 0}`;
export const dealKey = (x: { key: string; qty: number; price: number; sig?: string }) => `${x.key}|${x.qty}|${x.price}|${x.sig ?? ''}`;
const REALERT_MS = 10 * 60e3;
const MAX_DEALS = 60;

export class ShopSession {
  open = false;
  since = 0;
  private miss = 0;
  readonly rows = new Map<string, ShopRecord>();
  private pending = new Map<string, { r: Listing; read: number }>();
  /** something new is waiting for its second read, so re-read even if the screen didn't change */
  recheck = false;
  private readNo = 0;
  deals: Deal[] = [];
  lastDeal: Deal | null = null;
  private readonly alerted = new Map<string, number>();
  hover: Hover | null = null;

  constructor(private readonly e: Engine, private readonly events: SessionEvents = {}) {}

  /** Matches listings read off the screen to items, and works out the price per unit. */
  match(raw: readonly RawListing[]): Listing[] {
    const cat = { market: this.e.market, book: this.e.book };
    return raw.map((r) => {
      const key = resolveKey(cat, r.name, r.truncated);
      const mk = this.e.market.get(key);
      const name = mk ? mk.n : r.name;   // the tracker's spelling, not the misread
      const set = isSetItem(mk, name);
      const units = set ? 1 : r.qty;
      return { ...r, key, name, truncated: mk ? false : r.truncated, known: !!mk, set, units, unit: r.price / units };
    });
  }

  /**
   * One read of the shop. A listing counts once two of the last three reads agree on it, so a frame
   * caught mid-scroll or with the mouse over a price can't invent a row or a deal, and one bad frame
   * between two good ones doesn't lose a real one. `live` is false for a still screenshot, which
   * reads the same every time. Returns whether the price book changed.
   */
  read(raw: readonly RawListing[], live: boolean): boolean {
    if (!raw.length) {
      this.miss++;
      this.pending.clear();
      this.recheck = false;
      if (this.open && this.miss >= 2) this.close();
      return false;
    }
    this.miss = 0;
    // a half-visible row reads as gibberish: drop names the reader doubts that match no known item
    const rows = this.match(raw).filter((r) => r.known || r.nameConf >= 40);
    const countNow = new Map<string, number>(), fysNow = new Map<string, number[]>();
    for (const r of rows) {
      const k = keyOf(r);
      countNow.set(k, (countNow.get(k) ?? 0) + 1);
      if (r.fy != null) (fysNow.get(k) ?? fysNow.set(k, []).get(k)!).push(r.fy);
    }

    const n = ++this.readNo;
    for (const [k, v] of this.pending) if (n - v.read > 2) this.pending.delete(k);
    const ok: Listing[] = [];
    for (const r of rows) {
      const k = keyOf(r);
      if (ok.some((x) => keyOf(x) === k)) continue;
      if (!live || this.rows.has(k)) { ok.push(r); continue; }
      const w = this.pending.get(k);
      if (w && w.read < n) { ok.push(r); this.pending.delete(k); }
      else if (!w) this.pending.set(k, { r, read: n });
    }
    this.recheck = [...this.pending.values()].some((v) => v.read === n);
    if (!ok.length) return false;

    // a confirmed list with nothing in common with the open one means a different shop
    if (this.open && this.rows.size && ok.length >= 2 && !ok.some((r) => this.rows.has(keyOf(r)))) this.rows.clear();
    if (!this.open) { this.open = true; this.since = this.e.now(); this.rows.clear(); }

    let bookChanged = false;
    for (const r of ok) {
      const k = keyOf(r);
      const existing = this.rows.get(k);
      if (existing) {
        existing.count = Math.max(existing.count, countNow.get(k) ?? 1);
        if (r.fy != null) existing.fy = r.fy;
        if (fysNow.has(k)) existing.fys = fysNow.get(k)!;
        continue;
      }
      const ev = evaluate(this.e, r);   // judged before this listing joins the history
      const rec: ShopRecord = { ...r, ...ev, count: countNow.get(k) ?? 1, fys: fysNow.get(k) ?? [], seenAt: this.e.now() };
      this.rows.set(k, rec);
      if (!r.greyed && !r.unsure) {
        const mk = this.e.market.get(r.key);
        logSighting(this.e.book, r, mk ? mk.n : r.name + (r.truncated ? '…' : ''), this.e.now());
        bookChanged = true;
      }
      if (ev.verdict === 'deal') this.alert(rec);
    }
    return bookChanged;
  }

  /** A tooltip covering the list hides rows; it doesn't mean the shop closed. */
  covered(): void { this.miss = 0; }

  close(): void {
    this.open = false;
    this.rows.clear();
    this.pending.clear();
    this.recheck = false;
  }

  listingCount(): number {
    let n = 0;
    for (const r of this.rows.values()) n += r.count || 1;
    return n;
  }

  /** Re-judges every listing, after a price or a setting changed. */
  reevaluate(): void {
    for (const rec of this.rows.values()) Object.assign(rec, evaluate(this.e, rec));
  }

  /** One listing's hovered copies, each judged with its own stats. */
  copyRows(rec: ShopRecord): DisplayRow[] {
    return [...(rec.copies ?? new Map<string, Copy>())].map(([sig, c]) => ({ ...rec, ...evaluate(this.e, { ...rec, tip: c.tip }), count: 1, sig }));
  }

  /** The table: hovered copies of a listing each get a row, plus one row for those not hovered yet. */
  displayRows(): DisplayRow[] {
    const out: DisplayRow[] = [];
    for (const rec of this.rows.values()) {
      const copies = rec.copies?.size ? this.copyRows(rec) : [];
      out.push(...copies);
      const left = (rec.count || 1) - copies.length;
      if (!copies.length) out.push(rec);
      else if (left > 0) out.push({ ...rec, count: left, unchecked: true });
    }
    return out;
  }

  /**
   * Puts stats read from a hover tooltip on the copy of the listing they belong to: the same item,
   * and among several listings of it, the one with a copy nearest the tooltip. Returns whether the
   * price book changed (it learns how many slots an item starts with).
   */
  applyTooltip(t: TooltipRead, anchor: number): boolean {
    let bookChanged = false;
    const it = this.e.book.items[t.key];
    if (it && t.remaining != null && t.remaining > (it.maxSlots ?? 0)) { it.maxSlots = t.remaining; bookChanged = true; }
    const v = statValue(t, { statPct: this.e.settings.statPct, slotWorth: this.e.settings.slotWorth, maxSlotsSeen: it?.maxSlots });
    this.hover = { key: t.key, name: t.name, summary: v.summary, mult: v.mult, ts: this.e.now(), rec: null };

    const near = (r: ShopRecord) => Math.min(...(r.fys.length ? r.fys : [r.fy ?? 9]).map((y) => Math.abs(y - anchor)));
    const cands = [...this.rows.values()].filter((r) => r.key === t.key && r.verdict !== 'sold').sort((a, b) => near(a) - near(b));
    const rec = cands[0];
    if (!rec) return bookChanged;
    const sig = statSig(t);
    const copies = rec.copies ?? (rec.copies = new Map());
    if (copies.has(sig)) copies.delete(sig);   // re-inserted below, as the newest
    else if (copies.size >= Math.max(1, rec.count)) copies.delete(copies.keys().next().value!);   // more reads than copies: a misread
    copies.set(sig, { tip: t, ts: this.e.now() });
    this.hover.rec = rec;

    // The deal log follows the stats: a copy that is a deal gets its own entry; once every copy has
    // been hovered, the listing's verdict from before any stats no longer stands on its own.
    const copy = this.copyRows(rec).find((x) => x.sig === sig)!;
    const own = this.deals.find((d) => dealKey(d) === dealKey(copy));
    const lone = rec.count === 1 ? this.deals.find((d) => dealKey(d) === dealKey(rec)) : undefined;
    if (copy.verdict === 'deal') {
      const fields = { usual: copy.usual, usualBase: copy.usualBase, usualSrc: copy.usualSrc, profit: copy.profit, pct: copy.pct, stats: copy.stats, sig };
      if (own) Object.assign(own, fields);
      else if (lone) Object.assign(lone, fields);   // a lone listing's deal just gains its stats, no second sound
      else this.alert(copy);
    } else if (own) this.dropDeal(own);
    if (copies.size >= rec.count) for (const d of this.deals.filter((d) => dealKey(d) === dealKey(rec))) this.dropDeal(d);
    return bookChanged;
  }

  clearDeals(): void { this.deals = []; this.lastDeal = null; }

  private alert(row: DisplayRow): void {
    const k = dealKey(row), now = this.e.now();
    const prev = this.alerted.get(k);
    const fresh = prev == null || now - prev >= REALERT_MS;
    if (!fresh && this.deals.some((d) => dealKey(d) === k)) return;   // already in the log
    if (fresh) this.alerted.set(k, now);
    const d: Deal = { ...row, ts: now };
    this.deals.unshift(d);
    if (this.deals.length > MAX_DEALS) this.deals.pop();
    this.lastDeal = d;
    if (fresh) this.events.onDeal?.(d);   // back in the log after a re-hover: no second sound
  }

  private dropDeal(d: Deal): void {
    this.deals = this.deals.filter((x) => x !== d);
    if (this.lastDeal === d) this.lastDeal = this.deals[0] ?? null;
  }
}
