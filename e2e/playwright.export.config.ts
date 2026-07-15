import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

/**
 * Production-export test config. Unlike the default config (which runs
 * `next dev`), this builds the static export and serves it with the correct
 * WASM MIME, because the grammar-check worker/WASM bug only reproduces in the
 * production build. Run: `pnpm --filter @inkwell/e2e test:e2e:export`.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: 'grammar-check.spec.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // --disk-cache-size=0 avoids ERR_CACHE_WRITE_FAILURE aborting streaming
    // WASM compilation in constrained/headless environments.
    launchOptions: { args: ['--disk-cache-size=0', '--disable-gpu-shader-disk-cache'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build the export fresh, then serve out/ statically.
    command: 'pnpm --filter @inkwell/web build && node serve-export.mjs',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
