import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /<repo>/. BASE_PATH overrides it (for example "/" locally).
const base = process.env.BASE_PATH ?? '/fm-deal-scanner/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // the accuracy benchmark runs the real text reader: npm run bench
    exclude: ['tests/ocr/**', 'node_modules/**'],
    // the image tests resample full screens in plain JS
    testTimeout: 60_000,
  },
});
