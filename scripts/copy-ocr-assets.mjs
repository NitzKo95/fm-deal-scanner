// Copies the text reader's worker, engine and English model out of node_modules into public/ocr,
// so the site serves them itself instead of depending on a public CDN at runtime.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');

const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const files = [
  [join(pkgDir('tesseract.js'), 'dist', 'worker.min.js'), join(out, 'worker.min.js')],
  // the reader only uses the LSTM engine; the SIMD build is picked when the browser supports it
  ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'].map((f) => [join(pkgDir('tesseract.js-core'), f), join(out, 'core', f)]),
  [join(pkgDir('@tesseract.js-data/eng'), '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang', 'eng.traineddata.gz')],
];

for (const [from, to] of files) {
  if (!existsSync(from)) throw new Error(`missing ${from}; run npm install`);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}
console.log(`copied ${files.length} text reader files to public/ocr`);
