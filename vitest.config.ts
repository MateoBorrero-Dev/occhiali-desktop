import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Keep Windows/jsdom interaction tests deterministic instead of spawning one worker per file.
    maxWorkers: 2,
    coverage: {
      reporter: ['text', 'html'],
    },
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
