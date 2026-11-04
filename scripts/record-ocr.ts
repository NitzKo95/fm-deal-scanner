// Records what the text reader makes of a fixture screenshot, for the parser tests:
//   npm run record-ocr -- <image in tests/fixtures/img> [<image> ...]
// Each image goes through the scanner's own find-crop-prepare steps; the reader's lines for the list
// and for the tooltip are written to tests/fixtures/ocr/<name>.{list,tooltip}.lines.json.
import { writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { OcrLine } from '../src/lib/types';
import { Scanner, type Ocr } from '../src/scan/scanner';
import { ShopSession } from '../src/shop/session';
import { FIXTURES, loadPng } from '../tests/helpers/image';
import { engine } from '../tests/helpers/market';
import { nodeOcr, pixelsAdapter } from '../tests/helpers/pipeline';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: npm run record-ocr -- <image.png> ...'); process.exit(1); }

const ocr = await nodeOcr();
for (const file of files) {
  const e = engine();
  const seen: OcrLine[][] = [];
  const recording: Ocr<Buffer> = { recognize: async (img) => { const l = await ocr.recognize(img); seen.push(l); return l; } };
  const scanner = new Scanner(pixelsAdapter, recording, new ShopSession(e), e);
  const p = scanner.prepare(loadPng(file), { auto: true, region: null, readStats: true, live: false, force: true });
  await scanner.read(p);
  const name = basename(file, '.png');
  const parts: [string, boolean][] = [['list', !!p.list], ['tooltip', !!p.tip]];
  for (const [part, present] of parts) {
    if (!present) continue;
    const lines = seen.shift()!;
    const out = join(FIXTURES, 'ocr', `${name}.${part}.lines.json`);
    writeFileSync(out, JSON.stringify(lines, null, 1) + '\n');
    console.log(`${out}\n${lines.map((l) => `  ${Math.round(l.confidence).toString().padStart(3)} ${l.text.trim()}`).join('\n')}`);
  }
}
await ocr.terminate();
