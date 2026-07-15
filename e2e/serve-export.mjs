/**
 * Minimal static server for the PRODUCTION static export (apps/web/out).
 *
 * Why not `next dev`? The grammar-check WASM-URL bug this exists to guard
 * only manifests in the production build: in dev, harper's
 * `new URL(wasm, import.meta.url)` resolves to an absolute origin URL (which a
 * blob worker can fetch), while the export produces a root-relative URL (which
 * it cannot). A regression test must therefore run against `out/`, not dev.
 *
 * Correct MIME for `.wasm` (application/wasm) is essential — a wrong type makes
 * WebAssembly.compileStreaming reject and reproduces a *different* failure.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';

const ROOT = fileURLToPath(new URL('../apps/web/out/', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

async function tryFile(path) {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  // Strip query, decode, and prevent path traversal.
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath.includes('..')) {
    res.writeHead(400).end('Bad request');
    return;
  }

  // Candidate resolution for a Next static export:
  //   "/"            -> index.html
  //   "/_next/x.js"  -> file as-is
  //   "/foo"         -> foo.html, then foo/index.html
  const candidates = [];
  if (urlPath === '/' || urlPath.endsWith('/')) {
    candidates.push(join(ROOT, urlPath, 'index.html'));
  } else if (extname(urlPath)) {
    candidates.push(join(ROOT, urlPath));
  } else {
    candidates.push(join(ROOT, `${urlPath}.html`));
    candidates.push(join(ROOT, urlPath, 'index.html'));
  }

  for (const file of candidates) {
    const body = await tryFile(file);
    if (body) {
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
      return;
    }
  }

  // SPA-ish fallback to the shell so client routing still boots.
  const shell = await tryFile(join(ROOT, 'index.html'));
  if (shell) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(shell);
    return;
  }
  res.writeHead(404).end('Not found');
});

server.listen(PORT, () => {
  console.log(`[serve-export] serving ${ROOT} on http://localhost:${PORT}`);
});
