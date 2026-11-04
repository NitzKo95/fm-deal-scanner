import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { loadPng, placeOn, scaleBy } from '../tests/helpers/image';
import type { Pixels } from '../src/vision/pixels';

/** A screen-sized PNG with a fixture drawn on it, as a file for the screenshot picker. */
function screenFile(name: string, frame: Pixels) {
  const png = new PNG({ width: frame.width, height: frame.height });
  png.data = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
  return { name, mimeType: 'image/png', buffer: PNG.sync.write(png) };
}

function hoverOverShop(f: number, sw: number, sh: number): Pixels {
  const tip = scaleBy(loadPng('tooltip-traus.png'), f);
  const frame = placeOn(scaleBy(loadPng('shop-list.png'), f), sw, sh, 100, 100);
  const at = { x: Math.round(100 + 300 * f), y: Math.round(100 + 120 * f) };
  for (let y = 0; y < tip.height && at.y + y < sh; y++) for (let x = 0; x < tip.width && at.x + x < sw; x++) {
    const s = (y * tip.width + x) * 4, o = ((at.y + y) * sw + at.x + x) * 4;
    frame.data[o] = tip.data[s]!; frame.data[o + 1] = tip.data[s + 1]!; frame.data[o + 2] = tip.data[s + 2]!;
  }
  return frame;
}

/** A saved tracker page, made up: the parts of the table the importer reads. */
const TRACKER = `<!doctype html><html><body><div id="world"><span>Windia</span></div>
<button id="updated" title="Last updated Nov 4, 9:00 AM"></button><table><tbody id="rows">
${[
  ['01472013', 'Dark Guardian', 'Weapons', 120000, 300, '🗡️'],
  ['01072044', 'Bronze Chain Boots', 'Equips', 12000, 60, '👢'],
  ['01082003', 'Lemona', 'Equips', 21000, 50, '🧤'],
  ['02041019', 'Cape INT Scroll: Lesser', 'Scrolls', 65000, 955, '📜'],
  ['02040703', 'Shoes Speed Scroll: Chaos', 'Scrolls', 21000, 120, '📜'],
  ['01302012', 'Traus', 'Weapons', 55000, 94, '⚔️'],
  ['02070006', 'Wolbi Throwing Stars', 'Stars', 2499, 7359, '⭐'],
].map(([id, n, c, p, s, e]) => `<tr data-id="basil:${id}"><td><img data-fallback="${e}"><span class="item-name" title="${n}">${n}</span><span class="item-cat">${c}</span></td>
<td data-col="price"><span class="meso" title="${Number(p).toLocaleString('en-US')} mesos">x</span></td><td><span class="sales-count">${s}</span></td></tr>`).join('\n')}
</tbody></table></body></html>`;

/** The item names the build fetches from maplestory.io, a few of them, so the tests don't depend on it. */
const CATALOG = { source: 'test', fetched: '2026-11-04T00:00:00Z', items: { lemona: 1082003, traus: 1302012 } };

/** Icons come from maplestory.io; the tests serve a stand-in so they don't depend on it. */
const ICON = PNG.sync.write(Object.assign(new PNG({ width: 4, height: 4 }), { data: Buffer.alloc(64, 200) }));

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const icons: string[] = [];
  await page.route('https://maplestory.io/**', (r) => { icons.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'image/png', body: ICON }); });
  await page.route('**/fm-deal-scanner/items.json', (r) => r.fulfill({ json: CATALOG }));
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  return { errors, icons };
}

async function loadShot(page: Page, file: ReturnType<typeof screenFile>) {
  const before = Number(await page.evaluate(() => document.body.dataset.scans ?? 0));
  await page.setInputFiles('#fileShot', file);
  await page.waitForFunction((n) => Number(document.body.dataset.scans ?? 0) > n, before, { timeout: 90_000 });
}

const shopNames = (page: Page) => page.locator('#shopTable tbody .nm-n').allTextContents();

test('loads with no errors and serves the reader from the site', async ({ page }) => {
  const { errors } = await open(page);
  await expect(page.locator('#statusText')).toContainText('Not capturing');
  const ocr = await page.request.get('ocr/lang/eng.traineddata.gz');
  expect(ocr.ok()).toBe(true);
  expect(errors).toEqual([]);
});

test('reads a shop from a screenshot and flags the deal', async ({ page }) => {
  const { errors, icons } = await open(page);
  await page.setInputFiles('#fileMarket', { name: 'tracker.html', mimeType: 'text/html', buffer: Buffer.from(TRACKER) });
  await expect(page.locator('#marketMsg')).toContainText('Loaded 7 market prices for Windia');

  await loadShot(page, screenFile('shop.png', placeOn(scaleBy(loadPng('shop-list.png'), 0.5), 1440, 900, 400, 200)));
  const names = await shopNames(page);
  expect(names.map((n) => n.trim()).sort()).toEqual([
    'Bronze Chain Boots', 'Bronze Chain Boots', 'Cape INT Scroll: Lesser', 'Dark Guardian', 'Lemona', 'Shoes Speed Scroll: Chaos',
  ]);
  await expect(page.locator('#statusText')).toContainText('Shop open, 6 listings');
  // Dark Guardian usually 120,000: 79,999 is a third off
  await expect(page.locator('#dealBanner')).toBeVisible();
  await expect(page.locator('#dealWhat')).toContainText('Dark Guardian');
  await expect(page.locator('#dealList li')).toHaveCount(1);
  const deal = page.locator('#shopTable tbody tr.v-deal');
  await expect(deal).toHaveCount(1);
  await expect(deal.locator('.chip')).toHaveText('Deal');
  // item pictures by item id, from Classic World's data
  await expect.poll(() => icons).toContain('https://maplestory.io/api/MCW/1/item/1472013/icon');
  // the sighting is in the price book
  await expect(page.locator('#bookTable tbody')).toContainText('Dark Guardian');
  expect(errors).toEqual([]);
});

test('reads the stats off a hover tooltip', async ({ page }) => {
  const { errors } = await open(page);
  await page.setInputFiles('#fileMarket', { name: 'tracker.html', mimeType: 'text/html', buffer: Buffer.from(TRACKER) });
  await loadShot(page, screenFile('hover.png', hoverOverShop(1, 2560, 1600)));
  const hover = page.locator('#hoverLine');
  await expect(hover).toBeVisible();
  await expect(hover).toContainText('Traus: −2 att, 7 slots left');
  await expect(hover).toContainText('Worth about 46,200 (usual 55,000)');
  expect(errors).toEqual([]);
});

test('keeps your data from the single-file scanner', async ({ page }) => {
  const { icons } = await open(page);
  const backup = {
    version: 1, exported: '2026-11-03T10:00:00.000Z',
    db: { items: { lemona: { name: 'Lemona', manualRef: 25000, buyUnder: 15000, s: [[Date.now() - 3600e3, 19999, 1]] } } },
    settings: {}, region: null,
  };
  await page.setInputFiles('#fileImport', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#dataMsg')).toHaveText('Imported 1 item.');
  const row = page.locator('#bookTable tbody tr', { hasText: 'Lemona' });
  await expect(row.locator('input[data-field="manualRef"]')).toHaveValue('25,000');
  await expect(row.locator('input[data-field="buyUnder"]')).toHaveValue('15,000');
  // its picture shows with no tracker page loaded, found by name in the game data
  await expect(row.locator('.ico img')).toHaveAttribute('src', 'https://maplestory.io/api/MCW/1/item/1082003/icon');
  await expect.poll(() => icons).toContain('https://maplestory.io/api/MCW/1/item/1082003/icon');
  // and it is still there after a reload
  await page.reload();
  await expect(page.locator('#bookTable tbody tr', { hasText: 'Lemona' })).toHaveCount(1);
});

test('fits a phone screen without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('reads shops at every game and screen size', async ({ page }) => {
  test.setTimeout(600_000);
  await open(page);
  await page.setInputFiles('#fileMarket', { name: 'tracker.html', mimeType: 'text/html', buffer: Buffer.from(TRACKER) });
  const WANT: Record<string, string[]> = {
    'shop-list.png': ['Bronze Chain Boots|9,999', 'Bronze Chain Boots|16,999', 'Cape INT Scroll: Lesser|99,999', 'Dark Guardian|79,999', 'Lemona|19,999', 'Shoes Speed Scroll: Chaos|29,999'],
    'shop-selected-row.png': Array<string>(5).fill('Wolbi Throwing Stars|2,999'),
  };
  const SIZES: [number, number, number][] = [
    [0.4, 1280, 800], [0.5, 1440, 900], [0.6, 1512, 982], [0.7, 1920, 1080], [0.8, 1920, 1200],
    [0.9, 2560, 1440], [1.0, 3024, 1964], [1.25, 3024, 1964], [1.5, 3456, 2234],
  ];
  let total = 0, read = 0, wrong = 0;
  const misses: string[] = [];
  for (const [file, want] of Object.entries(WANT)) {
    for (const [f, sw, sh] of SIZES) {
      await loadShot(page, screenFile('shot.png', placeOn(scaleBy(loadPng(file), f), sw, sh, Math.round(sw * 0.3), Math.round(sh * 0.2))));
      // one table row per listing, ×N for identical ones
      const got = await page.locator('#shopTable tbody tr').evaluateAll((trs) => trs.flatMap((tr) => {
        const name = tr.querySelector('.nm-n')?.childNodes[0]?.textContent?.trim() ?? '';
        const n = Number(tr.querySelector('.cnt')?.textContent?.replace('×', '') ?? 1);
        const price = (tr.querySelector('.sub')?.textContent ?? '').match(/for ([\d,]+)/)?.[1] ?? '';
        return Array<string>(n).fill(`${name}|${price}`);
      }));
      const left = [...want];
      for (const g of got) { const i = left.indexOf(g); if (i >= 0) left.splice(i, 1); else wrong++; }
      total += want.length; read += want.length - left.length;
      if (left.length || got.length !== want.length) misses.push(`${file} at ${f}: got ${JSON.stringify(got)}`);
    }
  }
  console.log(`browser: read ${read}/${total}, wrong ${wrong}\n${misses.join('\n')}`);
  expect(read / total).toBeGreaterThanOrEqual(0.97);
  expect(wrong / total).toBeLessThanOrEqual(0.02);
});
