export const DAY = 864e5;

const finite = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

/** 1234.5 -> "1,235" */
export const fmt = (n: number | null | undefined): string => (finite(n) ? Math.round(n).toLocaleString('en-US') : '–');

/** whole mesos from 100 up, one decimal below (arrows sell for a few mesos each) */
export const fmtEach = (n: number | null | undefined): string =>
  !finite(n) ? '–' : n >= 100 ? fmt(n) : (Math.round(n * 10) / 10).toLocaleString('en-US');

/** exact under a million, short above it: 79,999 stays 79,999, 1,850,000 becomes 1.85M */
export function fmtShort(v: number | null | undefined): string {
  if (!finite(v)) return '–';
  if (v >= 1e9) return `${+(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${+(v / 1e6).toFixed(v >= 1e8 ? 0 : v >= 1e7 ? 1 : 2)}M`;
  return fmtEach(v);
}

export const signed = (n: number): string => `${n >= 0 ? '+' : ''}${fmt(n)}`;

/** fraction -> "+12%" */
export const pctTxt = (p: number | null | undefined): string => (p == null ? '–' : `${p > 0 ? '+' : ''}${Math.round(p * 100)}%`);

export const salesTxt = (n: number): string => `${fmt(n)} sale${n === 1 ? '' : 's'}`;

export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function ago(ts: number | null | undefined, now: number = Date.now()): string {
  if (!ts) return '–';
  const s = (now - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const clock = (ts: number): string => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => ESC[c] ?? c);
