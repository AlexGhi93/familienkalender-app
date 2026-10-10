// Kleiner statischer Server für die End-to-End-Tests: liefert das Repo-Verzeichnis aus, ohne Abhängigkeiten und ohne Zwischenspeicher.
// Aufruf: node tests/server.mjs [port]  (Standard 8141, alternativ PORT=…)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8141);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Pfad aus der Anfrage → Datei im Repo; null, wenn er aus dem Verzeichnis hinausführen würde. */
function dateiFuer(url) {
  let pfad;
  try {
    pfad = decodeURIComponent(new URL(url, 'http://x').pathname);
  } catch {
    return null;
  }
  if (pfad.endsWith('/')) pfad += 'index.html';
  const ziel = normalize(join(WURZEL, pfad));
  return ziel === WURZEL || ziel.startsWith(WURZEL + sep) ? ziel : null;
}

const server = createServer(async (req, res) => {
  const kopf = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...kopf, Allow: 'GET, HEAD' }).end();
    return;
  }
  const datei = dateiFuer(req.url ?? '/');
  if (!datei || datei.split(sep).includes('node_modules') || datei.includes(`${sep}.git`)) {
    res.writeHead(404, kopf).end('Nicht gefunden');
    return;
  }
  try {
    if (!(await stat(datei)).isFile()) throw new Error('kein File');
    const inhalt = await readFile(datei);
    res.writeHead(200, { ...kopf, 'Content-Type': MIME[extname(datei).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': inhalt.length });
    res.end(req.method === 'HEAD' ? undefined : inhalt);
  } catch {
    res.writeHead(404, { ...kopf, 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Familienkalender-Testserver: http://127.0.0.1:${PORT}/`);
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
