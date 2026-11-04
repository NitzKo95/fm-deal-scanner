import { norm } from '../lib/text';

/** Every item's id by its normalized name, from the game data. Gives a picture to items the tracker doesn't list. */
export type Catalog = ReadonlyMap<string, number>;

/** One row of maplestory.io's item list, the fields used. */
export interface CatalogSource { id: number; name?: string | null; isCash?: boolean }

/** The file the site serves: written at build time by scripts/fetch-items.ts. */
export interface CatalogFile { source: string; fetched: string; items: Record<string, number> }

/**
 * Names to ids. Where items share a name (common among cash items), the regular item wins over a
 * cash one, then the lowest id: either way it is the same name, so the picture is close enough.
 */
export function buildCatalog(list: readonly CatalogSource[]): Record<string, number> {
  const best = new Map<string, CatalogSource>();
  for (const it of list) {
    const k = norm(it.name ?? '');
    if (!k || !Number.isInteger(it.id) || it.id <= 0) continue;
    const had = best.get(k);
    if (!had || (!!had.isCash > !!it.isCash) || (!!had.isCash === !!it.isCash && it.id < had.id)) best.set(k, it);
  }
  return Object.fromEntries([...best].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, it]) => [k, it.id]));
}

export function parseCatalog(j: unknown): Catalog {
  const items = (j as Partial<CatalogFile> | null)?.items;
  const out = new Map<string, number>();
  if (!items || typeof items !== 'object') return out;
  for (const [k, v] of Object.entries(items)) if (Number.isInteger(v) && (v as number) > 0) out.set(k, v as number);
  return out;
}

/** The catalog the site serves; empty when it is missing, so pictures then come from tracker ids only. */
export async function loadCatalog(url: string, fetcher: typeof fetch = fetch): Promise<Catalog> {
  try {
    const r = await fetcher(url);
    return r.ok ? parseCatalog(await r.json()) : new Map();
  } catch { return new Map(); }
}
