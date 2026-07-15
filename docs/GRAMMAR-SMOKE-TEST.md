# Grammar Check — Smoke Test Runbook

> **Next-session pickup.** This documents how to verify grammar check actually
> works *in a running build* — the gap that a green `pnpm build` + passing unit
> tests cannot cover. A real shipped bug (silent WASM-worker failure) slipped
> through exactly that gap on 2026-07-14; the automated test below now guards it.

## TL;DR

```bash
pnpm --filter @inkwell/e2e test:e2e:export
```

Builds the **production static export**, serves it with correct WASM MIME, drives
headless Chromium, and asserts spelling squiggles render with no worker/WASM
errors. Must be green before claiming grammar check works.

## Why the export, not `next dev`

The load-bearing bug (`fix(grammar): resolve WASM URL to absolute…`, commit
`c1715fb`) is **invisible in `next dev`** and only appears in the production
build:

- harper's `WorkerLinter` runs the WASM in a **blob-origin Web Worker**, which
  has no base URL.
- In `next dev`, `new URL(wasm, import.meta.url)` resolves to an **absolute**
  origin URL → the worker can fetch it → works.
- In the static export it resolves to a **root-relative** URL
  (`/_next/static/media/harper_wasm_bg.<hash>.wasm`) → the blob worker's
  `fetch()` throws "Failed to parse URL" → `setup()` rejects → `check()` rejects
  → the plugin's scan `.catch(() => {})` swallows it → **zero squiggles,
  silently.**

So any smoke test that runs against `next dev` gives false confidence. The
export config (`e2e/playwright.export.config.ts`) exists for this reason.

The fix lives in `packages/grammar/src/engine.ts` (`createWorkerEngine` /
`toAbsoluteWasmUrl`); it resolves the WASM URL to absolute against the page
origin, which works for both the web serve and the Tauri webview.

## What the automated test covers (and doesn't)

`e2e/tests/grammar-check.spec.ts` asserts:

- ✅ 2 spelling squiggles appear after typing `This sentance has an obvius mistake.`
- ✅ They anchor to the exact tokens (`sentance`, `obvius`) — the anchor-safety invariant, observed
- ✅ Native `spellcheck` attribute is `false` (no double underline)
- ✅ **No** page errors and **no** failed worker/WASM requests (the silent failure mode)

**Not yet automated** — still worth a manual pass (see oracle below):

- ⬜ Toggle `Spell` off → spelling squiggles vanish, grammar remain; toggle on → return instantly (cache hit)
- ⬜ Click a squiggle → popover → **Ignore** → gone → **reload** → still gone (the cold-start race fix, `a7ef30b`)
- ⬜ Click a squiggle → apply a suggestion → correct word replaced, nothing else changed
- ⬜ Type inside a flagged word → its squiggle drops immediately, never sits on wrong text

## Manual smoke (when driving a real browser)

**Do not use the Edge `--app` launcher window for automation** — it cannot host
the Claude-in-Chrome extension. Drive a normal Chrome tab at
`http://localhost:3000` instead (with the app served — see "Running the app").

Paste this oracle into the page console (or inject via Claude-in-Chrome
`javascript_tool`) to get structured verdicts instead of eyeballing:

```js
const SEL = {
  editor: '.ProseMirror',
  spelling: '.inkwell-grammar-spelling',
  grammar: '.inkwell-grammar-grammar',
  anyIssue: '[data-grammar-id]',
  popover: '.inkwell-grammar-popover',
};

// CHECK 1 — native spellcheck OFF + at least one app squiggle.
// The double-underline failure is Chrome-painted and INVISIBLE to the DOM, so
// assert the attribute, not a visible count.
function checkNativeSpellcheckOff() {
  const ed = document.querySelector(SEL.editor);
  const attr = ed?.getAttribute('spellcheck');
  const n = document.querySelectorAll(SEL.spelling).length;
  return { pass: attr === 'false' && n >= 1, spellcheckAttr: attr, spellingSquiggles: n };
}

// CHECK 2 — snapshot the issue set (call before/after a toggle).
function snapshot() {
  return [...document.querySelectorAll(SEL.anyIssue)].map((el) => ({
    id: el.getAttribute('data-grammar-id'),
    kind: el.className.includes('inkwell-grammar-spelling') ? 'spelling'
        : el.className.includes('inkwell-grammar-grammar') ? 'grammar' : '?',
    text: el.textContent,
  }));
}

// CHECK 3 — mis-anchor invariant: no squiggle on empty/whitespace/line-break text.
function checkNoMisAnchor() {
  const bad = [...document.querySelectorAll(SEL.anyIssue)]
    .map((el) => el.textContent)
    .filter((t) => t.trim() === '' || /\n/.test(t) || t !== t.trim());
  return { pass: bad.length === 0, badRanges: bad };
}

// CHECK 4 — after Ignore + reload, that word must stay unflagged.
function checkDismissed(word) {
  const stillFlagged = [...document.querySelectorAll(SEL.anyIssue)].some((el) => el.textContent === word);
  return { pass: !stillFlagged, stillFlagged };
}

({ check1: checkNativeSpellcheckOff(), snapshot: snapshot(), check3: checkNoMisAnchor() });
```

## Running the app

- **Static export (what "the desktop launcher" serves):**
  `pnpm --filter @inkwell/web build` then serve `apps/web/out` on :3000
  (`node e2e/serve-export.mjs`, or the repo's `Start InkWell.vbs` launcher →
  `serve apps/web/out` + Edge `--app`). Serve MUST return `.wasm` as
  `application/wasm`.
- **The `.bat`/`.vbs` launchers are Edge `--app` mode over the static export —
  NOT the Tauri desktop app.** The Tauri app (`apps/desktop`,
  `frontendDist: ../../web/out`) has no built binary (Rust builds blocked on
  this machine). When it does build, the same WASM-URL fix already covers its
  custom-protocol origin.

## Diagnostic recipe that found the bug

Headless Playwright driving :3000, capturing `pageerror` + `requestfailed`,
launched with `--disk-cache-size=0` (otherwise `ERR_CACHE_WRITE_FAILURE` aborts
streaming WASM compilation in constrained/headless environments). Install the
browser once with `npx playwright install chromium` from `e2e/`.

## Gotchas (hard-won)

| Symptom | Cause | Fix / guard |
|---|---|---|
| Grammar check silently does nothing in a built app | Blob worker can't fetch root-relative WASM URL | `toAbsoluteWasmUrl` in `createWorkerEngine`; `test:e2e:export` |
| Works in `next dev`, broken in export | `import.meta.url` resolves differently | Always smoke-test the **export** |
| Double red underline under a misspelling | Native browser spellcheck not suppressed | `spellcheck = spellCheck && !grammarSpelling` in `page.tsx` |
| WASM compile aborts in headless CI | `ERR_CACHE_WRITE_FAILURE` | `--disk-cache-size=0` launch arg |
| Can't automate the launcher window | Edge `--app` mode can't host the extension | Drive a normal Chrome tab |
| Dismissed squiggle reappears on cold load | setup+dictionary replay outran the first scan | `readyRef` gate in `useGrammar` (`a7ef30b`) |
