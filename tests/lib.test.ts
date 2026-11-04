import { describe, expect, it } from 'vitest';
import { ago, fmt, fmtEach, fmtShort, pctTxt, salesTxt, signed } from '../src/lib/format';
import { lev, norm, parseAmount, quantile } from '../src/lib/text';

describe('format', () => {
  it('rounds and groups mesos', () => {
    expect(fmt(1234.5)).toBe('1,235');
    expect(fmt(null)).toBe('–');
    expect(fmt(Number.NaN)).toBe('–');
  });
  it('keeps a decimal for prices under 100, like arrows', () => {
    expect(fmtEach(4.25)).toBe('4.3');
    expect(fmtEach(79999)).toBe('79,999');
  });
  it('is exact under a million and short above it', () => {
    expect(fmtShort(999_999)).toBe('999,999');
    expect(fmtShort(1_000_000)).toBe('1M');
    expect(fmtShort(1_850_000)).toBe('1.85M');
    expect(fmtShort(12_500_000)).toBe('12.5M');
    expect(fmtShort(250_000_000)).toBe('250M');
    expect(fmtShort(1_200_000_000)).toBe('1.2B');
  });
  it('signs profits and percentages', () => {
    expect(signed(5550)).toBe('+5,550');
    expect(signed(-12)).toBe('-12');
    expect(pctTxt(-0.456)).toBe('-46%');
    expect(pctTxt(0.1)).toBe('+10%');
    expect(pctTxt(null)).toBe('–');
  });
  it('pluralizes sales', () => {
    expect(salesTxt(1)).toBe('1 sale');
    expect(salesTxt(2252)).toBe('2,252 sales');
  });
  it('says how long ago', () => {
    const now = 1_000_000_000;
    expect(ago(now - 10e3, now)).toBe('just now');
    expect(ago(now - 5 * 60e3, now)).toBe('5m ago');
    expect(ago(now - 3 * 3600e3, now)).toBe('3h ago');
    expect(ago(now - 2 * 864e5, now)).toBe('2d ago');
    expect(ago(null, now)).toBe('–');
  });
});

describe('text', () => {
  it('normalizes names to keys', () => {
    expect(norm('Gloves Attack Scroll: Chaos')).toBe('gloves attack scroll chaos');
    expect(norm('Shoes Speed Scroll; Chaos')).toBe('shoes speed scroll chaos');
    expect(norm('Scroll for Gloves for ATT 60%')).toBe('scroll for gloves for att 60%');
  });
  it('measures edit distance', () => {
    expect(lev('kitten', 'sitting')).toBe(3);
    expect(lev('ap reset scroll', 'sp reset scroll')).toBe(1);
    expect(lev('', 'abc')).toBe(3);
    expect(lev('same', 'same')).toBe(0);
  });
  it('interpolates quantiles', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.25)).toBe(10);
    expect(quantile([], 0.5)).toBeNull();
  });
  it('parses typed amounts', () => {
    expect(parseAmount('55k')).toBe(55_000);
    expect(parseAmount('1.2m')).toBe(1_200_000);
    expect(parseAmount('75,000')).toBe(75_000);
    expect(parseAmount('75.000')).toBe(75_000);
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('0')).toBeNull();
  });
});
