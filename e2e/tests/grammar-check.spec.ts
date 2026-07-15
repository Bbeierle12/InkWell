import { test, expect } from '@playwright/test';

/**
 * Grammar-check smoke test — runs against the PRODUCTION static export.
 *
 * Regression guard for the bug where harper's WorkerLinter, running in a
 * blob-origin Web Worker, could not fetch a root-relative WASM URL — so
 * `setup()` rejected, `check()` rejected, the plugin's scan `.catch` swallowed
 * it, and grammar check silently rendered nothing in every built app (static
 * export, Edge launcher, Tauri webview). See
 * packages/grammar/src/engine.ts `createWorkerEngine` / `toAbsoluteWasmUrl`.
 *
 * This test MUST run against the export, not `next dev` — the bug does not
 * reproduce in dev. Use playwright.export.config.ts (build + serve-export.mjs).
 */
test('renders spelling squiggles from the local engine, with no worker/WASM errors', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const failedWasm: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (/\.wasm|worker|harper/i.test(r.url())) {
      failedWasm.push(`${r.failure()?.errorText ?? 'FAILED'}  ${r.url()}`);
    }
  });

  await page.goto('/', { waitUntil: 'networkidle' });

  const editor = page.locator('.ProseMirror').first();
  await expect(editor).toBeVisible();

  // Native browser spellcheck must be OFF (so no double underline).
  await expect(editor).toHaveAttribute('spellcheck', 'false');

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type('This sentance has an obvius mistake.', { delay: 20 });

  // The engine's first run compiles WASM + builds harper's dictionary (slow),
  // then the scan is debounced ~500ms. Wait for the squiggles to appear rather
  // than a fixed sleep.
  const spelling = page.locator('.inkwell-grammar-spelling');
  await expect(spelling).toHaveCount(2, { timeout: 20_000 });

  // Both flagged tokens anchor to the right text (the safety invariant, observed).
  await expect(spelling.nth(0)).toHaveText('sentance');
  await expect(spelling.nth(1)).toHaveText('obvius');

  // The failure mode we shipped was silent — assert the engine did not error.
  expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  expect(failedWasm, `failed wasm/worker requests:\n${failedWasm.join('\n')}`).toEqual([]);
});
