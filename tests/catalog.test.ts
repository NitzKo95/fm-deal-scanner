import { describe, expect, it } from 'vitest';
import { buildCatalog, loadCatalog, parseCatalog } from '../src/market/catalog';
import { catalogOf, market } from './helpers/market';

describe('item catalog', () => {
  it('keeps one id and name per item, sorted by name', () => {
    expect(buildCatalog([{ id: 2040801, name: 'Gloves Attack Scroll: Intermediate' }, { id: 1302012, name: ' Traus ' }]))
      .toEqual([[2040801, 'Gloves Attack Scroll: Intermediate'], [1302012, 'Traus']]);
  });
  it('prefers the regular item over a cash one, then the lowest id, when names repeat', () => {
    expect(buildCatalog([
      { id: 1702100, name: 'Pink Umbrella', isCash: true },
      { id: 1302016, name: 'Pink Umbrella' },
      { id: 1302015, name: 'Pink Umbrella', isCash: true },
      { id: 1012009, name: 'Mask', isCash: true },
      { id: 1012001, name: 'Mask', isCash: true },
    ])).toEqual([[1012001, 'Mask'], [1302016, 'Pink Umbrella']]);
  });
  it('skips rows without a name or a usable id', () => {
    expect(buildCatalog([{ id: 1, name: '' }, { id: 0, name: 'Zero' }, { id: 1.5, name: 'Half' }, { id: 3, name: null }])).toEqual([]);
  });
  it('reads the served file by normalized name, ignoring junk', () => {
    const c = parseCatalog({ source: 'x', fetched: 'y', items: [[1302012, 'Traus'], [2040801, 'Gloves Attack Scroll: Intermediate'], ['no', 'Bad'], [-1, 'Neg'], [5, 7], 'junk'] });
    expect([...c]).toEqual([['traus', { id: 1302012, name: 'Traus' }], ['gloves attack scroll intermediate', { id: 2040801, name: 'Gloves Attack Scroll: Intermediate' }]]);
    expect(parseCatalog(null).size).toBe(0);
    expect(parseCatalog({ items: { traus: 1302012 } }).size).toBe(0);
  });
  it('is empty, not an error, when the file is missing or the request fails', async () => {
    const missing = (async () => new Response('not found', { status: 404 })) as typeof fetch;
    const offline = (async () => { throw new TypeError('offline'); }) as typeof fetch;
    expect((await loadCatalog('items.json', missing)).size).toBe(0);
    expect((await loadCatalog('items.json', offline)).size).toBe(0);
    const ok = (async () => Response.json({ items: [[1302012, 'Traus']] })) as typeof fetch;
    expect((await loadCatalog('items.json', ok)).get('traus')).toEqual({ id: 1302012, name: 'Traus' });
  });
});

describe('picture ids', () => {
  it("uses the tracker's id first, then the game data's by exact name", () => {
    const m = market().withCatalog(catalogOf([[999, 'Traus'], [1082002, 'Brown Work Gloves']]));
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

describe('real names', () => {
  it("gives the tracker's spelling, else the game data's", () => {
    const m = market().withCatalog(catalogOf([[1082002, 'Work Gloves']]));
    expect(m.knownName('traus')).toBe('Traus');
    expect(m.knownName('work gloves')).toBe('Work Gloves');
    expect(m.knownName('mystery')).toBeNull();
  });
});
