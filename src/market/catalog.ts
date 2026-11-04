import { norm } from '../lib/text';

/** An item in the game data. */
export interface CatalogItem { id: number; name: string }

/**
 * Every item in the game by its normalized name. Gives items the tracker doesn't list their picture,
 * and lets names read off the screen be matched and cleaned up without tracker data.
 */
export type Catalog = ReadonlyMap<string, CatalogItem>;

/** One row of maplestory.io's item list, the fields used. */
export interface CatalogSource { id: number; name?: string | null; isCash?: boolean }

/** The file the site serves: written at build time by scripts/fetch-items.ts. [id, name] per item. */
export interface CatalogFile { source: string; fetched: string; items: [number, string][] }

/**
 * One item per name. Where items share a name (common among cash items), the regular item wins over
 * a cash one, then the lowest id: either way it is the same name, so the picture is close enough.
 */
export function buildCatalog(list: readonly CatalogSource[]): [number, string][] {
  const best = new Map<string, CatalogSource & { name: string }>();
  for (const it of list) {
    const name = (it.name ?? '').trim(), k = norm(name);
    if (!k || !Number.isInteger(it.id) || it.id <= 0) continue;
    const had = best.get(k);
    if (!had || (!!had.isCash > !!it.isCash) || (!!had.isCash === !!it.isCash && it.id < had.id)) best.set(k, { ...it, name });
  }
  return [...best].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, it]) => [it.id, it.name]);
}

export function parseCatalog(j: unknown): Catalog {
  const items = (j as Partial<CatalogFile> | null)?.items;
  const out = new Map<string, CatalogItem>();
  if (!Array.isArray(items)) return out;
  for (const row of items) {
    if (!Array.isArray(row)) continue;
    const [id, name] = row as unknown[];
    const k = typeof name === 'string' ? norm(name) : '';
    if (k && Number.isInteger(id) && (id as number) > 0 && !out.has(k)) out.set(k, { id: id as number, name: (name as string).trim() });
  }
  return out;
}

/** The catalog the site serves; empty when it is missing, so the site then works from tracker data only. */
export async function loadCatalog(url: string, fetcher: typeof fetch = fetch): Promise<Catalog> {
  try {
    const r = await fetcher(url);
    return r.ok ? parseCatalog(await r.json()) : new Map();
  } catch { return new Map(); }
}
