import { describe, expect, it } from 'vitest';
import { buildCatalog, loadCatalog, parseCatalog } from '../src/market/catalog';
import { market } from './helpers/market';

describe('item catalog', () => {
  it('files ids under normalized names', () => {
    expect(buildCatalog([{ id: 2040801, name: 'Gloves Attack Scroll: Intermediate' }, { id: 1302012, name: 'Traus' }]))
      .toEqual({ 'gloves attack scroll intermediate': 2040801, traus: 1302012 });
  });
  it('prefers the regular item over a cash one, then the lowest id, when names repeat', () => {
    expect(buildCatalog([
      { id: 1702100, name: 'Pink Umbrella', isCash: true },
      { id: 1302016, name: 'Pink Umbrella' },
      { id: 1302015, name: 'Pink Umbrella', isCash: true },
      { id: 1012009, name: 'Mask', isCash: true },
      { id: 1012001, name: 'Mask', isCash: true },
    ])).toEqual({ mask: 1012001, 'pink umbrella': 1302016 });
  });
  it('skips rows without a name or a usable id', () => {
    expect(buildCatalog([{ id: 1, name: '' }, { id: 0, name: 'Zero' }, { id: 1.5, name: 'Half' }, { id: 3, name: null }])).toEqual({});
  });
  it('reads the served file, ignoring junk', () => {
    const c = parseCatalog({ source: 'x', fetched: 'y', items: { traus: 1302012, bad: 'no', neg: -1 } });
    expect([...c]).toEqual([['traus', 1302012]]);
    expect(parseCatalog(null).size).toBe(0);
    expect(parseCatalog({ items: 3 }).size).toBe(0);
  });
  it('is empty, not an error, when the file is missing or the request fails', async () => {
    const missing = (async () => new Response('not found', { status: 404 })) as typeof fetch;
    const offline = (async () => { throw new TypeError('offline'); }) as typeof fetch;
    expect((await loadCatalog('items.json', missing)).size).toBe(0);
    expect((await loadCatalog('items.json', offline)).size).toBe(0);
    const ok = (async () => Response.json({ items: { traus: 1302012 } })) as typeof fetch;
    expect((await loadCatalog('items.json', ok)).get('traus')).toBe(1302012);
  });
});

describe('picture ids', () => {
  it("uses the tracker's id first, then the game data's by exact name", () => {
    const m = market().withCatalog(new Map([['traus', 999], ['brown work gloves', 1082002]]));
    expect(m.iconId('traus')).toBe(1302012);
    expect(m.iconId('soft chocolate fondue scepter')).toBe(1702048);
    expect(m.iconId('brown work gloves')).toBe(1082002);
    expect(m.iconId('brown work glove')).toBeNull();
  });
  it('keeps the prices when the catalog arrives', () => {
    const m = market(), c = m.withCatalog(new Map());
    expect(c.priced).toBe(m.priced);
    expect(c.get('traus')).toEqual(m.get('traus'));
  });
});
