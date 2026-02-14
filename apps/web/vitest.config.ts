import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    // Only run test files, skip web app source that needs PostCSS
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  // Override PostCSS to avoid loading postcss.config.js
  css: {
    postcss: {
      plugins: [],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
