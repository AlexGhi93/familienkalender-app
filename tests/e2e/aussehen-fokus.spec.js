// Tastatur-Fokus in Glas und Bento (Review M3): Wer mit Tastatur, „Tastatursteuerung“ (iOS) oder Schaltersteuerung bedient, sieht auf
// JEDEM Bedienelement der Hauptbildschirme einen Fokusring – auch auf Zellen und Knöpfen, die selbst einen gestrichelten Umriss tragen
// (Monat: heute, Konflikt; Bento: „Wer?“-Knöpfe). Sichtbar heißt: ein Umriss (≥ 2 px, nicht durchsichtig) oder ein Schatten, den das
// Element ohne Fokus nicht hat.
import { test, expect, starteDemo, WERKTAG_DATUM } from './hilfen.js';
import { seedDemo } from '../../src/app/seed.js';

test.beforeEach(({ aussehen }) => {
  test.skip(!aussehen, 'nur Glas und Bento (Klassisch bleibt wie 1.1.2)');
});

/**
 * Läuft in der Seite: ist der Fokus am aktiven Element sichtbar? Verglichen wird mit demselben Element ohne Fokus (kurz blur, dann
 * wieder focus – die Tastatur-Modalität bleibt, :focus-visible gilt weiter): Umriss oder Schatten müssen sich ändern, ein Umriss
 * muss ≥ 2 px und nicht durchsichtig sein. Ein gestrichelter Schmuck-Umriss allein zählt also nicht.
 * `innerhalb`: Selektor eines Behälters (z. B. das offene Blatt); verlässt der Fokus ihn, ist die Runde zu Ende (null).
 */
function fokusPruefen(innerhalb) {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  if (innerhalb && !el.closest(innerhalb)) return { draussen: true };
  window.__fokusGesehen ??= new WeakSet(); // wieder am selben Element: einmal herum
  if (window.__fokusGesehen.has(el)) return { draussen: true };
  window.__fokusGesehen.add(el);
  const bild = () => {
    const s = getComputedStyle(el);
    return { umriss: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`, stil: s.outlineStyle, breite: Number.parseFloat(s.outlineWidth), farbe: s.outlineColor, schatten: s.boxShadow };
  };
  const mit = bild();
  el.blur();
  const ohne = bild();
  el.focus();
  const umriss = mit.stil !== 'none' && mit.breite >= 2 && !/rgba\([^)]*,\s*0\)|transparent/.test(mit.farbe) && mit.umriss !== ohne.umriss;
  const schatten = mit.schatten !== 'none' && mit.schatten !== ohne.schatten;
  const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  return { name, klasse: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, sichtbar: umriss || schatten };
}

/** Tab durch die Seite (höchstens `max` Schritte, bis der Fokus wieder vorn ist); gibt jedes Element ohne sichtbaren Fokus zurück. */
async function ohneFokusring(page, { max = 70, innerhalb = null } = {}) {
  const fehlt = [];
  const gesehen = new Set();
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(fokusPruefen, innerhalb);
    if (!f) continue;
    if (f.draussen) break;
    const schluessel = `${f.klasse}|${f.name}`;
    gesehen.add(schluessel);
    if (!f.sichtbar && !fehlt.includes(schluessel)) fehlt.push(schluessel);
  }
  return { fehlt, anzahl: gesehen.size };
}

for (const route of ['#/heute', '#/monat', '#/schicht', '#/konto', '#/einkauf', '#/urlaub', '#/mehr', '#/neu']) {
  test(`${route}: jedes Bedienelement zeigt beim Tab einen Fokusring`, async ({ page }) => {
    const demo = seedDemo(WERKTAG_DATUM);
    demo.tage = { ...demo.tage, '2026-10-20': { typ: 'krank', konflikt: true, andere: ['kita_essen'] } }; // Konflikt-Zelle im Monat
    await starteDemo(page, { route, speicher: { 'fk.demo.v1': demo } });
    const { fehlt, anzahl } = await ohneFokusring(page);
    expect(anzahl, 'es gibt Bedienelemente').toBeGreaterThan(5);
    expect(fehlt).toEqual([]);
  });
}

test('Tagesblatt (Bringen & Abholen mit „Wer?“): jedes Bedienelement zeigt beim Tab einen Fokusring', async ({ page }) => {
  await starteDemo(page, { route: '#/monat' });
  await page.locator('.raster').getByRole('button', { name: 'Donnerstag, 22. Oktober' }).click();
  const blatt = page.getByRole('dialog', { name: 'Donnerstag, 22. Oktober' });
  await expect(blatt).toBeVisible();
  await page.keyboard.press('Tab'); // Tastatur benutzt: das folgende focus() zählt als :focus-visible
  await blatt.getByRole('button', { name: 'Schließen' }).focus();
  await page.keyboard.press('Shift+Tab');
  const { fehlt, anzahl } = await ohneFokusring(page, { innerhalb: '[role=dialog]' });
  expect(anzahl).toBeGreaterThan(5);
  expect(fehlt).toEqual([]);
});
