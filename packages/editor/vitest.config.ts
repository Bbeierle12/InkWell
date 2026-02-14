import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 95,
        branches: 90,
      },
    },
  },
});
