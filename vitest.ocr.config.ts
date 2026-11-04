import { defineConfig } from 'vitest/config';

// The accuracy benchmark: screenshots through the whole scanner with the real text reader.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/ocr/**/*.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    // one reader, used in turn
    fileParallelism: false,
  },
});
