// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { isRough, isSetItem, marketTip } from '../src/market/marketIndex';
import { canon, findKey, resolveKey } from '../src/market/matching';
import { parseTrackerPage } from '../src/market/parseTrackerPage';
import { ITEMS, market } from './helpers/market';

/** Built from the tracker table's structure, with made-up rows. */
const PAGE = `<!doctype html><html><body>
<div id="world"><span>Windia</span></div>
<button id="updated" title="Last updated Nov 1, 2:30 PM. Click to reload."></button>
<table><tbody id="rows">
  <tr data-id="basil:01302012">
    <td><div class="item-icon"><img src="./x_files/01302012.png" data-fallback="⚔️"></div>
      <span class="item-name" title="Traus">Traus</span><span class="item-cat">Weapons</span></td>
    <td data-col="price"><span class="meso" title="55,000 mesos">55K</span></td>
    <td><span class="day-pct">+2%</span> <span class="week-pct">−5%</span> <span class="sales-count">94</span></td>
  </tr>
  <tr data-id="basil:02040803">
    <td><span class="item-name" title="Gloves Attack Scroll: Chaos">Gloves Attack Scroll</span>
      <span class="item-cat">Scrolls<span class="low-data">Low data</span></span></td>
    <td data-col="price"><span class="meso" title="1,844,444 mesos">1.84M</span></td>
    <td><span class="sales-count">4</span></td>
  </tr>
  <tr data-id="basil:01332013">
    <td><span class="item-name" title="Korean Fan">Korean Fan</span><span class="item-cat">Weapons<span class="craft-check wide-range">⚠ Wide range</span></span></td>
    <td data-col="price"><span class="meso" title="68,888 mesos">68.9K</span></td>
    <td><span class="sales-count">1,240</span></td>
  </tr>
  <tr data-id="basil:01102000">
    <td><span class="item-name" title="Unsold Cape">Unsold Cape</span><span class="item-cat">Equips</span></td>
    <td data-col="price"><span class="na-chip">No sales</span></td><td></td>
  </tr>
  <tr class="more-rows"><td>Load more</td></tr>
</tbody></table></body></html>`;

describe('parseTrackerPage', () => {
  const saved = new Date(2026, 10, 1, 15, 0).getTime();
  const m = parseTrackerPage(PAGE, saved);

  it('reads every item row and skips the rest', () => {
    expect(m.items.map((i) => i.id)).toEqual(['basil:01302012', 'basil:02040803', 'basil:01332013', 'basil:01102000']);
  });
  it('takes the full name from the title and keeps the short name', () => {
    const chaos = m.items[1]!;
    expect(chaos.n).toBe('Gloves Attack Scroll: Chaos');
    expect(chaos.a).toBe('Gloves Attack Scroll');
    expect(m.items[0]!.a).toBeUndefined();
  });
  it('reads exact prices, sales and changes (with a typographic minus)', () => {
    const traus = m.items[0]!;
    expect(traus).toMatchObject({ p: 55000, s: 94, d: 0.02, w: -0.05, c: 'Weapons', e: '⚔️' });
    expect(m.items[2]!.s).toBe(1240);
    expect(m.items[3]!.p).toBeNull();
  });
  it('flags rough prices', () => {
    expect(m.items[1]!.f).toBe('l');
    expect(m.items[2]!.f).toBe('w');
    expect(m.items[0]!.f).toBeUndefined();
  });
  it('reads the world and when the prices are from', () => {
    expect(m.world).toBe('Windia');
    expect(m.updated).toBe('Nov 1, 2:30 PM');
    expect(m.asOf).toBe(new Date(2026, 10, 1, 14, 30).getTime());
  });
  it('puts a December time on a page saved in January in the year before', () => {
    const jan = new Date(2027, 0, 1, 1, 0).getTime();
    const dec = parseTrackerPage(PAGE.replace('Nov 1, 2:30 PM', 'Dec 31, 11:50 PM'), jan);
    expect(new Date(dec.asOf).getFullYear()).toBe(2026);
  });
  it('returns no items for a page without the table', () => {
    expect(parseTrackerPage('<html><body>hello</body></html>', saved).items).toEqual([]);
  });
});

describe('MarketIndex', () => {
  const mk = market();
  it('looks items up by normalized full name', () => {
    expect(mk.get('traus')?.p).toBe(55000);
    expect(mk.size).toBe(ITEMS.length);
    expect(mk.priced).toBe(ITEMS.length - 1);
  });
  it('does not alias a short name several items share', () => {
    expect(mk.has('gloves attack scroll')).toBe(false);
  });
  it('aliases a short name only one item uses', () => {
    const one = market([{ id: 'basil:1', n: 'Thing: Special', a: 'Thing', c: 'Etc', p: 1, s: 1, d: null, w: null }]);
    expect(one.get('thing')?.n).toBe('Thing: Special');
    expect(one.primaryKey('thing')).toBe('thing special');
  });
  it('knows which prices are rough and describes them', () => {
    expect(isRough(mk.get('korean fan'))).toBe(true);
    expect(isRough(mk.get('traus'))).toBe(false);
    expect(marketTip(mk.get('gloves attack scroll chaos'))).toContain('fewer than 5 sales');
  });
  it('treats stars and bullets as sets, arrows as stacks', () => {
    expect(isSetItem(mk.get('wolbi throwing stars'), 'Wolbi Throwing Stars')).toBe(true);
    expect(isSetItem(mk.get('arrows for bows'), 'Arrows for Bows')).toBe(false);
    expect(isSetItem(null, 'Mystery Throwing Stars')).toBe(true);
    expect(isSetItem(null, 'Bronze Bullets')).toBe(true);
    expect(isSetItem(null, 'Bronze Arrows')).toBe(false);
  });
});

describe('matching', () => {
  const cat = { market: market(), book: { items: {} } };
  it('matches exact names and the usual misreads', () => {
    expect(resolveKey(cat, 'Traus', false)).toBe('traus');
    expect(resolveKey(cat, 'olbi Throwing Stars', false)).toBe('wolbi throwing stars');
    expect(resolveKey(cat, 'Wolbi Throwing Start)', false)).toBe('wolbi throwing stars');
  });
  it('refuses a misread equally close to two items', () => {
    expect(resolveKey(cat, '5P Reset Scroll', false)).toBe('5p reset scroll');
    expect(resolveKey(cat, 'AP Reset Scrol', false)).toBe('ap reset scroll');
  });
  it('completes a cut-off name only when one item fits', () => {
    expect(resolveKey(cat, 'Gloves Attack Scr', true)).toBe('gloves attack scr');
    expect(resolveKey(cat, 'Soft Chocolate Fon', true)).toBe('soft chocolate fondue scepter');
  });
  it('keeps names it cannot place as their own key', () => {
    expect(resolveKey(cat, 'Mystery Rock Thing', false)).toBe('mystery rock thing');
  });
  it('prefers a price-book key over a fuzzy market match', () => {
    const withBook = { market: market(), book: { items: { 'trau s': { name: 'Trau s', manualRef: null, buyUnder: null, s: [] } } } };
    expect(resolveKey(withBook, 'Trau s', false)).toBe('trau s');
  });
  it('maps short-name keys to the full name unless the book files them', () => {
    const one = { market: market([{ id: 'basil:1', n: 'Thing: Special', a: 'Thing', c: 'Etc', p: 1, s: 1, d: null, w: null }]), book: { items: {} } };
    expect(canon(one, 'thing')).toBe('thing special');
    expect(findKey('thing specia', false, one.market.keys, (k) => canon(one, k))).toBe('thing special');
  });
});
