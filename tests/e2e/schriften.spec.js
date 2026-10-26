// Nichts verlässt die App: in jedem Aussehen (Projekte telefon-chromium, telefon-glas, telefon-bento) geht keine Anfrage an einen
// anderen Ursprung – auch nicht für Schriften (sie liegen in fonts/, siehe fonts/LIZENZ.md). Klassisch lädt die neuen Schriften nie.
import { test, expect, starteDemo, tab } from './hilfen.js';

const SCHRIFTEN = [
  ['FK Onest', '/fonts/onest.woff2'],
  ['FK Fredoka', '/fonts/fredoka.woff2'],
  ['FK Nunito', '/fonts/nunito.woff2'],
];

test('keine Anfrage an einen anderen Ursprung, auf jeder Seite und beim Laden der Schriften', async ({ page, baseURL, aussehen }) => {
  const eigen = new URL(baseURL).origin;
  const fremd = [];
  const schriften = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== eigen) fremd.push(r.url());
    else if (url.pathname.startsWith('/fonts/')) schriften.push(url.pathname);
  });

  await starteDemo(page);
  for (const name of ['Monat', 'Einkauf', 'Neu', 'Schicht', 'Urlaub', 'Konto', 'Mehr', 'Heute']) {
    await tab(page, name);
    await expect(page.locator('nav.tabs .tab.aktiv')).toContainText(name);
  }
  await page.goto('/#/app');
  await expect(page.getByRole('button', { name: 'Demo zurücksetzen' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if (!aussehen) expect(schriften, 'Klassisch lädt keine der neuen Schriften').toEqual([]);

  // Jede Schrift lässt sich laden (mit Umlauten, ß und €) – und kommt vom eigenen Server.
  const geladen = await page.evaluate(async (namen) => {
    const ergebnis = [];
    for (const name of namen) ergebnis.push((await document.fonts.load(`16px "${name}"`, 'ÄÖÜäöüß€„“')).length);
    return ergebnis;
  }, SCHRIFTEN.map(([name]) => name));
  expect(geladen).toEqual([1, 1, 1]);
  expect(schriften).toEqual(expect.arrayContaining(SCHRIFTEN.map(([, pfad]) => pfad)));
  expect(fremd, 'Anfragen an andere Ursprünge').toEqual([]);
});

test('die Schriftdateien kommen als font/woff2', async ({ request }) => {
  for (const [, pfad] of SCHRIFTEN) {
    const antwort = await request.get(pfad);
    expect(antwort.ok(), pfad).toBe(true);
    expect(antwort.headers()['content-type'], pfad).toBe('font/woff2');
  }
});
