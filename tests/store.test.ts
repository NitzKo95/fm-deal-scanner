// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { iconUrl, itemNumber } from '../src/icons';
import { DEFAULT_SETTINGS } from '../src/lib/types';
import { Storage } from '../src/store/storage';

describe('icons', () => {
  it('turns tracker ids into item numbers', () => {
    expect(itemNumber('basil:02040803')).toBe(2040803);
    expect(itemNumber('cash:01702048')).toBe(1702048);
    expect(itemNumber('basil:')).toBeNull();
    expect(itemNumber('nonsense')).toBeNull();
  });
  it('points at the Classic World icon for the item', () => {
    expect(iconUrl(1302012)).toBe('https://maplestory.io/api/MCW/1/item/1302012/icon');
    expect(iconUrl(null)).toBeNull();
  });
});

describe('Storage', () => {
  it('keeps the single-file scanner keys, so its data carries over', () => {
    localStorage.clear();
    localStorage.setItem('fmscan.v1.db', JSON.stringify({ items: { traus: { name: 'Traus', manualRef: null, buyUnder: null, s: [] } } }));
    localStorage.setItem('fmscan.v1.settings', JSON.stringify({ discount: 30 }));
    const st = new Storage();
    expect(Object.keys(st.loadBook().items)).toEqual(['traus']);
    expect(st.loadSettings()).toEqual({ ...DEFAULT_SETTINGS, discount: 30 });
  });
  it('falls back on missing or broken data', () => {
    localStorage.clear();
    localStorage.setItem('fmscan.v1.db', '{broken');
    localStorage.setItem('fmscan.v1.market', JSON.stringify({ items: 'no' }));
    const st = new Storage();
    expect(st.loadBook()).toEqual({ items: {} });
    expect(st.loadMarket()).toBeNull();
    expect(st.loadRegion()).toBeNull();
  });
  it('round-trips what it saves', () => {
    localStorage.clear();
    const st = new Storage();
    expect(st.saveRegion({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toBe(true);
    expect(st.loadRegion()).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  });
  it('reports a write that failed, like a full storage', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } } as unknown as globalThis.Storage;
    expect(new Storage(full).saveBook({ items: {} })).toBe(false);
    expect(new Storage(null).saveBook({ items: {} })).toBe(false);
  });
});
