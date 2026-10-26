// Leistung der Bewegung (Spec 6: „Verifikation mit Playwright auf 4× verlangsamter CPU“): Glas und Bento, Bewegung AN, CPU 4× langsamer
// (CDP Emulation.setCPUThrottlingRate). Abläufe: Tabwechsel, Blatt öffnen/schließen, Konto umschalten, Schicht malen. Gemessen werden
// lange Aufgaben (PerformanceObserver „longtask“, > 50 ms) und Bilder (requestAnimationFrame-Abstände; ein Abstand über 1,5 × 16,7 ms
// zählt als verlorene Bilder). Jeder Ablauf läuft zum Vergleich auch mit „Bewegung: Reduziert“: was dort genauso lang dauert, ist
// Zeichnen/Rechnen der App, nicht die Animation. Ziel: keine lange Aufgabe > 200 ms durch Animation.
// Aufruf: node tests/visuell/leistung.mjs [--port 8146] [--drossel 4] [--details]   (Ende 1, wenn eine Aufgabe > 200 ms auf die
// Bewegung geht: Skripte von bewegung.js in einem langen Bild, oder mit Bewegung > 40 ms länger als ohne)
import { chromium } from '@playwright/test';
import { KONFIG_DEMO, neuerKontext, ruhe, speicherVorbelegen, starteServer, telefon } from './werkzeug.js';

/** Demo ohne feste Uhr: page.clock ersetzt requestAnimationFrame durch einen 16-ms-Takt – die Bildabstände wären dann nicht echt. */
async function starteDemo(page, { route = '#/heute' } = {}) {
  await speicherVorbelegen(page, { 'fk.config.v1': KONFIG_DEMO });
  await page.goto(`/${route}`);
  await page.locator('nav.tabs').waitFor();
}

function argument(name, standard) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : standard;
}
const port = Number(argument('port', 8146));
const drossel = Number(argument('drossel', 4));
const GRENZE_MS = 200;

/** Läuft vor den Skripten der Seite: lange Aufgaben und Bildabstände sammeln, solange window.__messen gesetzt ist. */
function beobachten() {
  const m = { lang: [], bilder: [], rahmen: [] };
  Object.defineProperty(window, '__leistung', { value: m });
  try {
    new PerformanceObserver((liste) => {
      if (!window.__messen) return;
      for (const e of liste.getEntries()) m.lang.push(Math.round(e.duration));
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    // ohne Long Tasks API
  }
  // lange Bilder (Long Animation Frames, Chrome ≥ 123): Dauer, Sperrzeit und welche Skripte darin liefen (Datei, Funktion)
  try {
    new PerformanceObserver((liste) => {
      if (!window.__messen) return;
      for (const e of liste.getEntries()) {
        m.rahmen.push({
          dauer: Math.round(e.duration),
          sperre: Math.round(e.blockingDuration),
          stil: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
          skripte: e.scripts.map((sk) => ({ quelle: (sk.sourceURL || '').split('/').pop(), funktion: sk.sourceFunctionName, dauer: Math.round(sk.duration) })),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch {
    // ohne LoAF
  }
  let vorher = null;
  const bild = (t) => {
    if (window.__messen && vorher !== null) m.bilder.push(t - vorher);
    vorher = t;
    requestAnimationFrame(bild);
  };
  requestAnimationFrame(bild);
}

const ABLAEUFE = {
  async tabs(page) {
    await starteDemo(page);
    return async () => {
      for (const name of ['Monat', 'Einkauf', 'Schicht', 'Urlaub', 'Konto', 'Mehr', 'Heute']) {
        await page.locator('nav.tabs').getByRole('link', { name }).click();
        await page.waitForTimeout(700);
      }
    };
  },
  async blatt(page) {
    await starteDemo(page, { route: '#/monat' });
    await page.locator('.raster').waitFor();
    return async () => {
      for (const tag of ['Donnerstag, 22. Oktober', 'Freitag, 23. Oktober', 'Montag, 19. Oktober']) {
        await page.locator('.raster').getByRole('button', { name: tag }).click();
        await page.getByRole('dialog', { name: tag }).waitFor();
        await page.waitForTimeout(600);
        await page.getByRole('dialog', { name: tag }).getByRole('button', { name: 'Schließen' }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page.waitForTimeout(400);
      }
    };
  },
  async konto(page) {
    await starteDemo(page, { route: '#/konto' });
    const knopf = (name) => page.getByRole('group', { name: 'Ansicht im Konto' }).getByRole('button', { name });
    await knopf('Kontostand').waitFor();
    return async () => {
      for (const name of ['Fixkosten', 'Sparziele', 'Kontostand', 'Sparziele', 'Fixkosten', 'Kontostand']) {
        await knopf(name).click();
        await page.waitForTimeout(800);
      }
    };
  },
  async schicht(page) {
    await starteDemo(page, { route: '#/schicht' });
    await page.getByRole('button', { name: '✏️ Eintragen' }).click();
    await page.locator('.sp-pinsel').getByRole('button', { name: 'F Frühdienst', exact: true }).click();
    return async () => {
      for (const tag of [5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20]) {
        await page.locator(`.sp-zelle[data-datum="2026-10-${String(tag).padStart(2, '0')}"]`).click();
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(600);
    };
  },
};

async function miss(browser, url, aussehen, bewegung, name) {
  const kontext = await neuerKontext(browser, { url, aussehen, bewegung: true, geraet: telefon({ dpr: 3 }) });
  if (!bewegung) {
    await kontext.addInitScript(() => {
      try {
        localStorage.setItem('fk.bewegung.v1', 'reduziert');
      } catch {
        // ohne Speicher
      }
    });
  }
  await kontext.addInitScript(beobachten);
  const page = await kontext.newPage();
  const ablauf = await ABLAEUFE[name](page);
  await ruhe(page);
  const cdp = await kontext.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: drossel });
  await page.evaluate(() => (window.__messen = true));
  await ablauf();
  await page.evaluate(() => (window.__messen = false));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const { lang, bilder, rahmen } = await page.evaluate(() => structuredClone(window.__leistung));
  await kontext.close();
  const verloren = bilder.reduce((n, dt) => n + (dt > 25 ? Math.round(dt / 16.67) - 1 : 0), 0);
  const sortiert = [...bilder].sort((a, b) => a - b);
  const bewegungMs = (r) => r.skripte.filter((sk) => /bewegung|schicht-bewegung/.test(sk.quelle)).reduce((n, sk) => n + sk.dauer, 0);
  const ueber = rahmen.filter((r) => r.dauer > GRENZE_MS);
  return {
    rahmenMax: rahmen.length ? Math.max(...rahmen.map((r) => r.dauer)) : 0,
    laengste: [...rahmen].sort((a, b) => b.dauer - a.dauer)[0] ?? null,
    durchBewegung: ueber.filter((r) => bewegungMs(r) > 0).map((r) => `${r.dauer} ms (Bewegung-Skripte ${bewegungMs(r)} ms)`),
    lang: lang.length,
    langMax: lang.length ? Math.max(...lang) : 0,
    ueber200: lang.filter((d) => d > GRENZE_MS).length,
    bilder: bilder.length,
    verloren,
    anteil: bilder.length ? Math.round((100 * verloren) / (bilder.length + verloren)) : 0,
    p95: Math.round(sortiert[Math.floor(sortiert.length * 0.95)] ?? 0),
    schlechtestes: Math.round(sortiert.at(-1) ?? 0),
  };
}

const server = await starteServer(port);
const browser = await chromium.launch();
let fehler = 0;
console.log(`CPU ${drossel}× langsamer · lange Aufgaben (> 50 ms): Anzahl / längste · Bilder: gezeichnet / verloren (%) / p95 / schlechtestes (ms)`);
try {
  for (const aussehen of ['glas', 'bento']) {
    for (const name of Object.keys(ABLAEUFE)) {
      const an = await miss(browser, server.url, aussehen, true, name);
      const aus = await miss(browser, server.url, aussehen, false, name);
      const zeile = (r) => `${String(r.lang).padStart(2)} / ${String(r.langMax).padStart(3)} ms · ${String(r.bilder).padStart(4)} / ${String(r.verloren).padStart(3)} (${String(r.anteil).padStart(2)} %) / ${String(r.p95).padStart(3)} / ${String(r.schlechtestes).padStart(3)}`;
      console.log(`${aussehen.padEnd(6)} ${name.padEnd(8)} Bewegung an: ${zeile(an)}   reduziert: ${zeile(aus)}`);
      if (process.argv.includes('--details') && an.laengste) {
        const l = an.laengste;
        console.log(`  längstes Bild (an): ${l.dauer} ms, Stil/Layout ${l.stil} ms, Skripte: ${l.skripte.map((sk) => `${sk.quelle}:${sk.funktion || '?'} ${sk.dauer} ms`).join(', ') || '–'}`);
      }
      // Auf die Animation ginge eine lange Aufgabe > 200 ms, wenn in einem langen Bild Skripte der Bewegung laufen (LoAF) oder wenn
      // die längste Aufgabe mit Bewegung deutlich länger ist als ohne (> 40 ms: mehr als die Streuung zwischen zwei Läufen)
      const deutlich = an.langMax > GRENZE_MS && an.langMax - aus.langMax > 40;
      if (an.durchBewegung.length || deutlich) {
        fehler += 1;
        console.log(`  !! lange Aufgabe durch Bewegung: ${an.durchBewegung.join('; ') || `${an.langMax} ms mit, ${aus.langMax} ms ohne Bewegung`}`);
      }
    }
  }
} finally {
  await browser.close();
  await server.stop();
}
process.exitCode = fehler === 0 ? 0 : 1;
