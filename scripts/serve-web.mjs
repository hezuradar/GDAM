// Minimal static server for the web export (dist/) with the cross-origin isolation
// headers that expo-sqlite needs on the web. No dependencies: `node scripts/serve-web.mjs`.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'dist');
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Resolves a URL path inside ROOT; falls back to index.html for client-side routes. */
function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = normalize(join(ROOT, decoded));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null; // path traversal
  if (isFile(candidate)) return candidate;
  if (isFile(join(candidate, 'index.html'))) return join(candidate, 'index.html');
  return join(ROOT, 'index.html');
}

createServer((req, res) => {
  // require-corp (not credentialless): Safari on iPhone only supports require-corp.
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  let file;
  try {
    file = resolvePath(req.url ?? '/');
  } catch {
    file = null;
  }
  if (!file || !isFile(file)) {
    res.writeHead(file ? 404 : 400).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, HOST, () => {
  process.stdout.write(`Compras web: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (sirviendo ${ROOT})\n`);
});
