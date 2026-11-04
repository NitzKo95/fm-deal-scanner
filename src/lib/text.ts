/** The key an item name is filed under: lower case, punctuation collapsed to single spaces. */
export const norm = (n: string): string => n.toLowerCase().replace(/[^a-z0-9%+]+/g, ' ').trim();

/** Levenshtein edit distance. */
export function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array<number>(n + 1), cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n]!;
}

/** Linear-interpolated quantile of an ascending array. */
export function quantile(sorted: readonly number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** "55k", "1.2m", "75,000" -> number */
export function parseAmount(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = String(s).trim().toLowerCase().replace(/\s+/g, '').match(/^([\d.,]+)([km])?$/);
  if (!m) return null;
  const digits = m[1]!;
  let v = m[2] ? parseFloat(digits.replace(/,/g, '')) : parseFloat(digits.replace(/[,.](?=\d{3}\b)/g, '').replace(/,/g, ''));
  if (!Number.isFinite(v)) return null;
  if (m[2] === 'k') v *= 1e3;
  if (m[2] === 'm') v *= 1e6;
  return v > 0 ? v : null;
}
