// Galerie aller Bildschirme (tests/visuell/bildschirme.js) in Klassisch, Glas und Bento × Hell/Dunkel, zum Durchblättern für die Eltern:
// Fotos plus eine kleine index.html (eine Datei, ohne Anfragen nach außen) im Zielordner.
// Aufruf: node tests/visuell/galerie.mjs [--ordner <pfad>] [--browser chromium|webkit] [--aussehen glas,bento] [--modus hell,dunkel]
//         [--bildschirm heute,monat] [--breite 390] [--port 8149]
// Mit --browser webkit: Safari-Engine als iPhone 17 Pro (402 × 874), zum Vergleich mit Chromium (390 × 844).
import { chromium, webkit } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BILDSCHIRME } from './bildschirme.js';
import { AUSSEHEN, MODI, WURZEL, neuerKontext, ruhe, starteServer, telefon } from './werkzeug.js';

function argument(name, standard) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : standard;
}
const liste = (wert, alle) => (wert ? wert.split(',').map((s) => s.trim()) : alle);

const browserName = argument('browser', 'chromium');
const ordner = resolve(argument('ordner', join(WURZEL, '.superpowers/sdd/2026-10-26-design-themen-plan/screens/task-10')));
const aussehenListe = liste(argument('aussehen'), AUSSEHEN);
const modusListe = liste(argument('modus'), MODI);
const bildschirme = BILDSCHIRME.filter((b) => liste(argument('bildschirm'), BILDSCHIRME.map((x) => x.name)).includes(b.name));
const port = Number(argument('port', 8149));
const breite = Number(argument('breite', browserName === 'webkit' ? 402 : 390));
const geraet = telefon({ breite, hoehe: browserName === 'webkit' ? 874 : Math.round(breite * 2.164), dpr: 2 });

const NAMEN = { klassisch: 'Klassisch', glas: 'Glas & Licht', bento: 'Bento bunt', hell: 'Hell', dunkel: 'Dunkel' };
const datei = (b, a, m) => `${a}-${m}-${b.name}.png`;

await mkdir(ordner, { recursive: true });
const server = await starteServer(port);
const browser = await (browserName === 'webkit' ? webkit : chromium).launch();
const fehler = [];
try {
  for (const aussehen of aussehenListe) {
    for (const modus of modusListe) {
      for (const b of bildschirme) {
        const kontext = await neuerKontext(browser, { url: server.url, aussehen, modus, geraet });
        const page = await kontext.newPage();
        try {
          await b.oeffne(page);
          await ruhe(page);
          await page.screenshot({ path: join(ordner, datei(b, aussehen, modus)), fullPage: !b.blatt, animations: 'disabled', caret: 'hide' });
          process.stdout.write('.');
        } catch (e) {
          fehler.push(`${aussehen}/${modus}/${b.name}: ${e.message.split('\n')[0]}`);
          process.stdout.write('x');
        } finally {
          await kontext.close();
        }
      }
    }
  }
} finally {
  await browser.close();
  await server.stop();
}

// ---------- index.html: Raster Bildschirm × (Aussehen, Modus), Filter, Großansicht ----------
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const spalten = aussehenListe.flatMap((a) => modusListe.map((m) => [a, m]));
const zeilen = bildschirme
  .map(
    (b) => `<section class="zeile" id="${esc(b.name)}"><h2>${esc(b.titel)}</h2><div class="bilder">${spalten
      .map(
        ([a, m]) =>
          `<figure data-aussehen="${a}" data-modus="${m}"><button type="button" class="bild" data-gross="${esc(datei(b, a, m))}" aria-label="${esc(`${b.titel} – ${NAMEN[a]}, ${NAMEN[m]}`)}"><img loading="lazy" src="${esc(datei(b, a, m))}" alt=""></button><figcaption>${esc(NAMEN[a])} · ${esc(NAMEN[m])}</figcaption></figure>`,
      )
      .join('')}</div></section>`,
  )
  .join('\n');
const filter = (art, werte) =>
  `<div class="filter" role="group" aria-label="${art === 'aussehen' ? 'Aussehen' : 'Hell oder Dunkel'}">${werte
    .map((w) => `<button type="button" aria-pressed="true" data-${art}="${w}">${esc(NAMEN[w])}</button>`)
    .join('')}</div>`;
const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Familienkalender 1.2.0 – Galerie</title>
<style>
  :root { color-scheme: light dark; --bg: #f4f2fa; --karte: #fff; --ink: #1d1830; --ink-2: #575170; --akzent: #5a3ccf; --linie: #ddd8ee; }
  @media (prefers-color-scheme: dark) { :root { --bg: #14111d; --karte: #221d31; --ink: #f5f2ff; --ink-2: #c9c3e0; --akzent: #b9a5ff; --linie: #3b3453; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  header { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; padding: 14px 16px; background: var(--bg); border-bottom: 1px solid var(--linie); }
  h1 { margin: 0; font-size: 1.25rem; }
  .filter { display: flex; gap: 6px; flex-wrap: wrap; }
  .filter button { min-height: 44px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--linie); background: var(--karte); color: var(--ink-2); font: inherit; cursor: pointer; }
  .filter button[aria-pressed='true'] { background: var(--akzent); border-color: var(--akzent); color: var(--bg); font-weight: 700; }
  nav { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 16px 0; }
  nav a { color: var(--akzent); font-size: 0.9rem; padding: 6px 4px; }
  main { padding: 8px 16px 40px; }
  .zeile { margin-top: 22px; }
  h2 { margin: 0 0 10px; font-size: 1.1rem; }
  .bilder { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
  figure { margin: 0; flex: none; width: 190px; }
  figure[hidden] { display: none; }
  .bild { display: block; width: 100%; height: 340px; padding: 0; border: 1px solid var(--linie); border-radius: 14px; overflow: hidden; background: var(--karte); cursor: zoom-in; }
  .bild img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
  figcaption { margin-top: 6px; font-size: 0.875rem; color: var(--ink-2); }
  dialog { padding: 0; border: 0; border-radius: 16px; background: var(--karte); color: var(--ink); max-width: min(96vw, 520px); max-height: 94vh; }
  dialog::backdrop { background: rgb(0 0 0 / 0.6); }
  dialog img { display: block; width: 100%; height: auto; }
  dialog .kopf { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 8px 8px 14px; background: var(--karte); }
  dialog button { min-width: 44px; min-height: 44px; border-radius: 999px; border: 1px solid var(--linie); background: var(--karte); color: var(--ink); font: inherit; cursor: pointer; }
</style>
</head>
<body>
<header>
  <h1>Familienkalender 1.2.0 – alle Bildschirme</h1>
  ${filter('aussehen', aussehenListe)}
  ${filter('modus', modusListe)}
</header>
<nav aria-label="Bildschirme">${bildschirme.map((b) => `<a href="#${esc(b.name)}">${esc(b.titel)}</a>`).join('')}</nav>
<main>
${zeilen}
</main>
<dialog id="gross" aria-label="Großansicht"><div class="kopf"><span id="gross-titel"></span><button type="button" id="zu" aria-label="Schließen">✕</button></div><img id="gross-bild" alt=""></dialog>
<script>
  const aktiv = { aussehen: new Set(${JSON.stringify(aussehenListe)}), modus: new Set(${JSON.stringify(modusListe)}) };
  const zeige = () => document.querySelectorAll('figure').forEach((f) => (f.hidden = !(aktiv.aussehen.has(f.dataset.aussehen) && aktiv.modus.has(f.dataset.modus))));
  document.querySelectorAll('.filter button').forEach((k) => k.addEventListener('click', () => {
    const art = 'aussehen' in k.dataset ? 'aussehen' : 'modus';
    const wert = k.dataset[art];
    const an = k.getAttribute('aria-pressed') !== 'true';
    k.setAttribute('aria-pressed', String(an));
    if (an) aktiv[art].add(wert); else aktiv[art].delete(wert);
    zeige();
  }));
  const dialog = document.getElementById('gross');
  document.querySelectorAll('.bild').forEach((k) => k.addEventListener('click', () => {
    document.getElementById('gross-bild').src = k.dataset.gross;
    document.getElementById('gross-titel').textContent = k.getAttribute('aria-label');
    dialog.showModal();
  }));
  document.getElementById('zu').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
</script>
</body>
</html>
`;
await writeFile(join(ordner, 'index.html'), html);
console.log(`\n${bildschirme.length * spalten.length - fehler.length} Fotos in ${ordner} (${browserName}), dazu index.html`);
for (const f of fehler) console.log(`  FEHLER ${f}`);
process.exitCode = fehler.length ? 1 : 0;
