// Writes public/items.json: every Classic World item's id by name, from maplestory.io, so items the
// tracker doesn't list (or all of them, before a tracker page is loaded) still get their picture.
// Runs at build time in CI. If maplestory.io can't be reached it keeps the file it has, and the site
// then shows pictures by tracker id only.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_REGION, ICON_VERSION } from '../src/icons';
import { buildCatalog, type CatalogFile, type CatalogSource } from '../src/market/catalog';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'items.json');
const url = `https://maplestory.io/api/${ICON_REGION}/${ICON_VERSION}/item`;

try {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'fm-deal-scanner build' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const list = (await r.json()) as CatalogSource[];
  if (!Array.isArray(list) || list.length < 1000) throw new Error(`unexpected item list (${Array.isArray(list) ? list.length : typeof list})`);
  const file: CatalogFile = { source: url, fetched: new Date().toISOString(), items: buildCatalog(list) };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(file));
  console.log(`wrote ${Object.keys(file.items).length} item names to public/items.json`);
} catch (e) {
  const kept = existsSync(out) ? 'keeping the existing public/items.json' : 'pictures will come from tracker ids only';
  // a GitHub Actions warning when run there, a plain line elsewhere
  console.log(`${process.env.GITHUB_ACTIONS ? '::warning::' : ''}could not fetch ${url} (${(e as Error).message}); ${kept}`);
}
