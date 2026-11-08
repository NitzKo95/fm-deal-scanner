// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appraiseEntry } from '../src/appraisal/appraise';
import { entryFor } from '../src/appraisal/entries';
import { DEFAULT_SETTINGS, type Listing, type MarketItem, type TooltipRead } from '../src/lib/types';
import { npcSellPrice } from '../src/market/marketIndex';
import { parseTrackerPage } from '../src/market/parseTrackerPage';
import { evaluate } from '../src/pricing/evaluate';
import { ShopSession } from '../src/shop/session';
import { appraisalRowHtml } from '../src/ui/appraisalViews';
import { dealLine, marketInfo, shopRowHtml } from '../src/ui/views';
import { engine, market, NOW } from './helpers/market';

const item = (n: string, p: number | null, npc: number | undefined, over: Partial<MarketItem> = {}): MarketItem =>
  ({ id: `basil:0${Math.abs(n.length * 7919)}`, n, c: 'Equips', p, s: 100, d: 0, w: 0, ...(npc ? { npc } : {}), ...over });

/**
 * Fine Cape: the market says 30,000, an NPC shop charges 20,000, so an NPC pays 10,000, under the market. Cheap Boots:
 * the market says 12,000 and an NPC would pay 12,000. Junk Cap: the market says 3,000 but half its shop price is
 * 10,000, so the guess is contradicted (nobody sells under what an NPC pays). Plain Gloves have no market price.
 */
const ITEMS: MarketItem[] = [
  item('Fine Cape', 30000, 20000),
  item('Cheap Boots', 12000, 24000),
  item('Junk Cap', 3000, 20000),
  item('Plain Gloves', null, 8000),
  item('Free Hat', 500, undefined),
  item('Wolbi Throwing Stars', 2499, 4000, { c: 'Stars' }),
  item('Red Potion', 40, 50, { c: 'Use' }),
];
const e = (over: Parameters<typeof engine>[0] = {}) => engine({ items: ITEMS, ...over });
const listing = (o: Partial<Listing> & { key: string; price: number }): Listing => ({
  name: o.key, truncated: false, nameConf: 95, cy: 0, qty: 1, greyed: false, unsure: false, known: true, set: false, units: o.qty ?? 1, unit: o.price / (o.qty ?? 1), ...o,
});

describe('reading NPC shop prices off the tracker page', () => {
  const html = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'tracker', 'real-sample.html'), 'utf8');
  const saved = new Date(2026, 10, 7, 22, 0).getTime();
  const m = parseTrackerPage(html, saved);
  const by = (n: string) => m.items.find((x) => x.n === n);

  it('reads the real page: its items, world and time', () => {
    expect(m.items).toHaveLength(11);
    expect(m.world).toBe('Windia');
    expect(m.updated).toBe('Nov 7, 9:30 PM');
  });

  it('takes the price an NPC shop charges, from the Source column', () => {
    expect(by('Weighted Earrings')?.npc).toBe(9000);
    expect(by('Adamantium Guards')?.npc).toBe(27600);
    expect(by('Meba')?.npc).toBe(16500);
    expect(by('Black Dragon Robe')?.npc).toBe(21600);
    expect(by('Mithril Pole Arm')?.npc).toBe(26000);
    expect(by('Hat Accuracy Scroll: Lesser')?.npc).toBe(15000);
  });

  it('reads a chip that says it is one of several shops', () => {
    expect(by('Red Potion')?.npc).toBe(50);   // "… + 8 more · 50 mesos each"
  });

  it('leaves items no NPC shop sells without one, and the rest of the row alone', () => {
    for (const n of ['Lemona', 'Overall Armor LUK Scroll: Greater', 'Cape INT Scroll: Lesser', 'Traus']) expect(by(n)?.npc, n).toBeUndefined();
    expect(by('Weighted Earrings')).toMatchObject({ p: 5617, s: 11362, c: 'Equips' });
  });

  const row = (chips: string) => `<table><tbody id="rows"><tr data-id="basil:1"><td><span class="item-name" title="X">X</span><span class="item-cat">Equips</span></td>
    <td data-col="price"><span class="meso" title="5,000 mesos">5K</span></td><td><span class="sales-count">9</span></td>
    <td data-col="from"><span class="src-chips">${chips}</span></td></tr></tbody></table>`;
  const chip = (kind: string, text: string) => `<span class="src-chip src-shop" data-src-tip="${kind}|${text}"></span>`;

  it('takes the lowest when several NPC shops sell it', () => {
    const p = parseTrackerPage(row(chip('NPC shop', 'A (Town) · 26,000 mesos each') + chip('NPC shop', 'B (Town) · 24,500 mesos each')), saved);
    expect(p.items[0]?.npc).toBe(24500);
  });

  it('does not take other prices on the row for an NPC shop price', () => {
    const p = parseTrackerPage(row(chip('Craft it', 'Weaponcrafting L10 · ~53.3K mesos each') + chip('NPC shop', 'A (Town) · 1,000 mesos each')), saved);
    expect(p.items[0]?.npc).toBe(1000);
    expect(parseTrackerPage(row(chip('Craft it', '~53.3K mesos each')), saved).items[0]?.npc).toBeUndefined();
    expect(parseTrackerPage(row(chip('NPC shop', 'A (Town) · no price')), saved).items[0]?.npc).toBeUndefined();
    expect(parseTrackerPage(row(''), saved).items[0]?.npc).toBeUndefined();
  });
});

describe('what an NPC pays', () => {
  const mk = (npc?: number, p: number | null = null) => item('X', p, npc);
  it('is half the shop price by default, rounded down', () => {
    expect(npcSellPrice(mk(20000), 50)).toBe(10000);
    expect(npcSellPrice(mk(27601), 50)).toBe(13800);
    expect(npcSellPrice(mk(50), 50)).toBe(25);
  });
  it('follows the setting, and never goes above the shop price', () => {
    expect(npcSellPrice(mk(20000), 40)).toBe(8000);
    expect(npcSellPrice(mk(20000), 100)).toBe(20000);
    expect(npcSellPrice(mk(20000), 250)).toBe(20000);
  });
  it('is nothing with no shop price, or when turned off', () => {
    expect(npcSellPrice(mk(), 50)).toBeNull();
    expect(npcSellPrice(null, 50)).toBeNull();
    expect(npcSellPrice(mk(20000), 0)).toBeNull();
    expect(npcSellPrice(mk(20000), -5)).toBeNull();
    expect(npcSellPrice(mk(1), 50)).toBeNull();   // rounds down to nothing
    expect(DEFAULT_SETTINGS).toMatchObject({ npcRatio: 50, npcDeals: 'off' });
  });
  it('is kept while the market is at or above it, and dropped when the market is below it', () => {
    expect(npcSellPrice(mk(20000, 30000), 50)).toBe(10000);
    expect(npcSellPrice(mk(20000, 10000), 50)).toBe(10000);   // equal: nothing contradicts it
    expect(npcSellPrice(mk(20000, 9999), 50)).toBeNull();
    expect(npcSellPrice(mk(20000, 3000), 50)).toBeNull();
    // a lower share is less likely to be contradicted
    expect(npcSellPrice(mk(20000, 9999), 40)).toBe(8000);
  });

  it('is dropped for the real weapons that trade under half their shop price, kept where the market agrees', () => {
    const real = parseTrackerPage(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'tracker', 'real-sample.html'), 'utf8'), Date.now());
    const pay = (n: string) => npcSellPrice(real.items.find((x) => x.n === n)!, 50);
    // thousands of sales at about 10,000 while an NPC shop charges 26,000: an NPC cannot be paying 13,000
    expect(real.items.find((x) => x.n === 'Mithril Pole Arm')).toMatchObject({ p: 10000, npc: 26000 });
    expect(pay('Mithril Pole Arm')).toBeNull();
    // the market is above what half the shop price says
    expect(pay('Adamantium Guards')).toBe(13800);   // market 45,999
    expect(pay('Meba')).toBe(8250);                 // market 12,000
    expect(pay('Black Dragon Robe')).toBe(10800);   // market 12,999
    expect(pay('Weighted Earrings')).toBe(4500);    // market 5,617
  });
});

describe('a shop listing and an NPC', () => {
  const on = { npcDeals: 'on' as const };

  describe('by default', () => {
    it('is judged by the market and your sightings alone: the NPC price changes no verdict and no profit', () => {
      const boots = evaluate(e(), listing({ key: 'cheap boots', price: 9000 }));   // 25% under 12,000, but only 2,640 profit
      expect(boots).toMatchObject({ npcFlip: false, profit: Math.round(12000 * 0.97 - 9000) });
      expect(boots.verdict).not.toBe('deal');
      expect(evaluate(e(), listing({ key: 'plain gloves', price: 1000 }))).toMatchObject({ verdict: 'new', profit: null, usual: null, npcFlip: false });
    });

    it('still shows what an NPC pays, and what selling to one would make', () => {
      expect(evaluate(e(), listing({ key: 'cheap boots', price: 9000 }))).toMatchObject({ npc: 12000, npcProfit: 3000 });
      expect(evaluate(e(), listing({ key: 'plain gloves', price: 1000 }))).toMatchObject({ npc: 4000, npcProfit: 3000 });
      expect(evaluate(e(), listing({ key: 'cheap boots', price: 15000 }))).toMatchObject({ npc: 12000, npcProfit: -3000 });
    });

    it('does not alert for an NPC flip', () => {
      const deals: string[] = [];
      const s = new ShopSession(e(), { onDeal: (d) => deals.push(d.name) });
      s.read([{ name: 'Plain Gloves', truncated: false, nameConf: 95, cy: null, qty: 1, price: 1000, greyed: false, unsure: false }], false);
      expect(deals).toEqual([]);
    });
  });

  describe('where an NPC price is contradicted by the market', () => {
    it('is not shown or used at all, even with NPC deals on', () => {
      for (const settings of [{}, on]) {
        expect(evaluate(e({ settings }), listing({ key: 'junk cap', price: 1000 }))).toMatchObject({ npc: null, npcProfit: null, npcFlip: false });
      }
    });
  });

  describe('with NPC flips counted as deals', () => {
    const ev = (key: string, price: number, over: Partial<Listing> = {}, settings: object = {}) => evaluate(e({ settings: { ...on, ...settings } }), listing({ key, price, ...over }));

    it('is a deal when an NPC pays at least the minimum profit more than it costs, with no market involved', () => {
      expect(ev('plain gloves', 1000)).toMatchObject({ verdict: 'deal', npcFlip: true, usual: null, npc: 4000, profit: 3000 });
      expect(ev('cheap boots', 9000)).toMatchObject({ verdict: 'deal', npcFlip: true, profit: 3000 });   // the market alone says fair
    });

    it('is not a deal when the profit is under the minimum, or the listing costs more', () => {
      expect(ev('cheap boots', 11000)).toMatchObject({ npcFlip: false, npcProfit: 1000 });
      expect(ev('cheap boots', 15000)).toMatchObject({ npcFlip: false });
      expect(ev('cheap boots', 11000, {}, { minProfit: 500 })).toMatchObject({ verdict: 'deal', npcFlip: true, profit: 1000 });
    });

    it('stays an ordinary deal, with its own profit, when the usual price already makes it one', () => {
      const d = ev('fine cape', 15000);   // 50% under the market's 30,000; an NPC pays 10,000
      expect(d).toMatchObject({ verdict: 'deal', npcFlip: false });
      expect(d.profit).toBe(Math.round(30000 * 0.97 - 15000));
    });

    it('counts a stack: an NPC pays for every one', () => {
      expect(ev('plain gloves', 5000, { qty: 5, units: 5, unit: 1000 })).toMatchObject({ npcFlip: true, profit: 15000 });   // 5 × 4,000 − 5,000
    });

    it('does not depend on the stats of the copy', () => {
      const tip: TooltipRead = { key: 'cheap boots', name: 'Cheap Boots', type: 'Shoes', remaining: 3, stats: [{ label: 'att', weight: 1, total: 50, base: 60, delta: -10 }] };
      const d = evaluate(e({ settings: on }), { ...listing({ key: 'cheap boots', price: 9000 }), tip });
      expect(d).toMatchObject({ npc: 12000, npcFlip: true, profit: 3000 });
    });

    it('is ignored for a row read doubtfully, a sold row and a set', () => {
      expect(ev('plain gloves', 1000, { unsure: true }).npcFlip).toBe(false);
      expect(ev('plain gloves', 1000, { greyed: true })).toMatchObject({ verdict: 'sold', npcFlip: false });
      expect(ev('wolbi throwing stars', 100, { set: true, qty: 800, units: 1, unit: 100 })).toMatchObject({ npc: null, npcFlip: false });
    });

    it('does nothing for an item no NPC shop sells, or when NPC prices are turned off', () => {
      expect(ev('free hat', 100)).toMatchObject({ npc: null, npcFlip: false });
      expect(ev('plain gloves', 1000, {}, { npcRatio: 0 })).toMatchObject({ npc: null, npcFlip: false, verdict: 'new' });
      expect(evaluate(engine(), listing({ key: 'traus', price: 40000 })).npc).toBeNull();
    });

    it('alerts like any deal, and says why', () => {
      const en = e({ settings: on });
      const deals: string[] = [];
      const s = new ShopSession(en, { onDeal: (d) => deals.push(d.name) });
      s.read([{ name: 'Plain Gloves', truncated: false, nameConf: 95, cy: null, qty: 1, price: 1000, greyed: false, unsure: false }], false);
      expect(deals).toEqual(['Plain Gloves']);
      const d = s.deals[0]!;
      expect(dealLine(d, en.market)).toMatchObject({ why: 'an NPC pays 4,000 each for it', profit: '+3,000', profitNote: 'selling to an NPC' });
      expect(dealLine({ ...d, npcFlip: false }, en.market).profitNote).toBe('after fee');
    });
  });

  it('shows what an NPC pays under the usual price, and what selling to one would make beside the profit', () => {
    const en = e();
    const s = new ShopSession(en);
    const read = (name: string, price: number) => ({ name, truncated: false, nameConf: 95, cy: null, qty: 1, price, greyed: false, unsure: false });
    s.read([read('Cheap Boots', 9000), read('Cheap Boots', 15000), read('Free Hat', 400), read('Junk Cap', 1000)], false);
    const rows = s.displayRows(), html = (n: string, price: number) => shopRowHtml(rows.find((r) => r.name === n && r.price === price)!, en.market);
    const cheap = html('Cheap Boots', 9000);
    expect(cheap).toContain('<span class="sub">NPC 12,000</span>');
    expect(cheap).toContain('NPC +3,000');
    expect(cheap).toContain('An NPC pays about 12,000 each for it (half its shop price), more than this listing costs.');
    // it costs more than an NPC pays: the NPC price is shown, but nothing is made
    const dear = html('Cheap Boots', 15000);
    expect(dear).toContain('NPC 12,000');
    expect(dear).not.toContain('NPC +');
    // no NPC shop, or the market contradicts the guess: nothing
    expect(html('Free Hat', 400)).not.toContain('NPC');
    expect(html('Junk Cap', 1000)).not.toContain('NPC');
  });
});

describe('an item in the appraisal and an NPC', () => {
  const en = e();
  const line = (name: string, qty = 1, over = {}) => appraiseEntry(en, { ...entryFor(en, name, qty), ...over }, 'fair');

  it('is worth what an NPC pays when nothing else prices it, marked as a floor', () => {
    expect(line('Plain Gloves', 2)).toMatchObject({ unit: 4000, src: 'npc', tag: 'rough', total: 8000, npc: 4000 });
  });

  it('keeps the market price: the tracker is the truth, an NPC is only a fallback', () => {
    expect(line('Fine Cape')).toMatchObject({ unit: 30000, src: 'market', tag: 'priced', npc: 10000 });
    expect(line('Cheap Boots')).toMatchObject({ unit: 12000, src: 'market', npc: 12000 });
    // the market is under half the shop price: the NPC price is not believed, and does not lift it
    expect(line('Junk Cap')).toMatchObject({ unit: 3000, src: 'market', npc: null });
  });

  it('lifts a price that stats brought below what an NPC pays, not one the person typed', () => {
    const tip: TooltipRead = { key: 'fine cape', name: 'Fine Cape', type: 'Cape', remaining: 0, stats: [{ label: 'att', weight: 1, total: 20, base: 60, delta: -40 }] };
    expect(line('Fine Cape', 1, { tip })).toMatchObject({ unit: 10000, src: 'npc' });   // 30,000 × 0.25 would be 7,500
    expect(line('Fine Cape', 1, { price: 500 })).toMatchObject({ unit: 500, src: 'line', npc: 10000 });
  });

  it('does not apply to a set, to an item no NPC shop sells, or when turned off', () => {
    expect(line('Wolbi Throwing Stars', 2)).toMatchObject({ unit: 2499, src: 'market', npc: null });
    expect(line('Free Hat')).toMatchObject({ unit: 500, npc: null });
    const off = appraiseEntry(e({ settings: { npcRatio: 0 } }), entryFor(en, 'Plain Gloves'), 'fair');
    expect(off).toMatchObject({ unit: null, tag: 'unpriced', npc: null });
  });

  it('is the same in every appraisal mode', () => {
    expect(appraiseEntry(en, entryFor(en, 'Plain Gloves'), 'greedy')).toMatchObject({ unit: 4000, src: 'npc' });
  });

  it('shows what the NPC pays, and where the price came from', () => {
    const html = appraisalRowHtml(line('Plain Gloves'), en.market);
    expect(html).toContain('NPC pays 4,000');
    expect(html).toContain('<span class="sub">NPC price</span>');
    expect(html).toContain('what an NPC pays for it: the least it is worth');
    expect(appraisalRowHtml(line('Free Hat'), en.market)).not.toContain('NPC');
    expect(appraisalRowHtml(line('Junk Cap'), en.market)).not.toContain('NPC');
  });
});

describe('the market line', () => {
  it('says how many items have an NPC price, or asks for the page again', () => {
    expect(marketInfo(e().market, NOW)).toContain('6 have an NPC shop price.');
    const none = market();   // the other tests' items have no NPC shop price
    expect(marketInfo(none, NOW)).toContain('No NPC prices: load the tracker page again to get them.');
    expect(none.withNpc).toBe(0);
  });
});
