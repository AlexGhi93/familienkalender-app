// Blätter (Dialoge von unten) nach unten wischen zum Schließen – echte Touch-Ereignisse über das DevTools-Protokoll –
// und kein Neuladen der Seite durch Herunterziehen, solange ein Blatt offen ist.
import { test, expect, starteDemo } from './hilfen.js';

const zelle = (page, datum) => page.locator(`.sp-zelle[data-datum="${datum}"]`);
const tafel = (page) => page.locator('.blatt').last(); // das oberste Blatt
/** Verschiebung des Blatts nach unten in px (aus der berechneten Transformation). */
const verschiebung = (page) => tafel(page).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42);
const warte = (ms) => new Promise((r) => setTimeout(r, ms)); // nur für die Geschwindigkeit eines Zugs (echte Zeit zwischen den Ereignissen)

/**
 * Ein Finger auf dem Bildschirm (Touch über CDP, wie auf dem Telefon) bei `ort` ({ x, y } oder ein Locator, dann dessen Mitte).
 * `ziehe(dy, { dx, schritte, pause })` bewegt ihn in Schritten (mit `pause` ms dazwischen), `loslassen()` hebt ihn ab.
 */
async function finger(page, ort) {
  const cdp = await page.context().newCDPSession(page);
  let x;
  let y;
  if (typeof ort.boundingBox === 'function') {
    const box = await ort.boundingBox();
    x = Math.round(box.x + box.width / 2);
    y = Math.round(box.y + box.height / 2);
  } else ({ x, y } = ort);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  return {
    async ziehe(dy, { dx = 0, schritte = 5, pause = 0 } = {}) {
      const [x0, y0] = [x, y];
      for (let i = 1; i <= schritte; i += 1) {
        if (pause) await warte(pause);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + (dx * i) / schritte), y: Math.round(y0 + (dy * i) / schritte) }] });
      }
      [x, y] = [x0 + dx, y0 + dy];
    },
    async loslassen() {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    },
  };
}

/** Öffnet ein Blatt über die echte Komponente; `window.__zu` zählt die Aufrufe von `beimSchliessen`. */
async function testBlatt(page, { zeilen = 3, mitFeld = false, titel = 'Testblatt' } = {}) {
  await page.evaluate(
    async ({ zeilen, mitFeld, titel }) => {
      const { blatt } = await import('/src/ui/components.js');
      const { h } = await import('/src/ui/dom.js');
      window.__zu ??= {};
      window.__zu[titel] = 0;
      window.__blaetter ??= {};
      window.__blaetter[titel] = blatt({
        titel,
        beimSchliessen: () => {
          window.__zu[titel] += 1;
        },
        render: () => [
          mitFeld ? h('input', { class: 'test-feld', type: 'text', 'aria-label': 'Testfeld' }) : null,
          Array.from({ length: zeilen }, (_, i) => h('p', { class: 'test-zeile' }, `Zeile ${i + 1}`)),
        ],
      });
    },
    { zeilen, mitFeld, titel },
  );
  await expect(page.getByRole('dialog', { name: titel })).toBeVisible();
  await expect.poll(() => verschiebung(page)).toBe(0);
}
const zuGezaehlt = (page, titel = 'Testblatt') => page.evaluate((t) => window.__zu[t], titel);

test.describe('nach unten wischen', () => {
  test('Tagesblatt im Schichtplan: am Griff 150 px nach unten → folgt dem Finger, schließt, Notiz gespeichert (beimSchliessen)', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-21').click();
    const blatt = page.getByRole('dialog', { name: 'Mittwoch, 21. Oktober' });
    await expect(blatt).toBeVisible();
    await page.locator('.sp-tag-karte[data-person="papa"]').getByRole('textbox', { name: 'Notiz (optional)' }).fill('Dienst 12');

    const f = await finger(page, page.locator('.blatt-griff'));
    await f.ziehe(150);
    expect(await verschiebung(page)).toBeGreaterThan(120); // das Blatt geht mit dem Finger mit
    await f.loslassen();
    await expect(blatt).toHaveCount(0);
    await expect(zelle(page, '2026-10-21').locator('.sp-notiz')).toHaveText('✎');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).schicht.monate['2026-10'].n.papa['21'])).toBe('Dienst 12');
  });

  test('Tagesblatt im Monat: an der Überschrift nach unten ziehen schließt', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    await page.locator('.raster').getByRole('button', { name: 'Donnerstag, 15. Oktober', exact: false }).click();
    const blatt = page.getByRole('dialog', { name: /15\. Oktober/ });
    await expect(blatt).toBeVisible();
    const f = await finger(page, blatt.locator('.blatt-kopf h2'));
    await f.ziehe(160);
    await f.loslassen();
    await expect(blatt).toHaveCount(0);
  });

  test('irgendwo im Inhalt, solange er ganz oben steht, schließt das Ziehen ebenfalls', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await testBlatt(page);
    const f = await finger(page, page.locator('.test-zeile').nth(1));
    await f.ziehe(140);
    await f.loslassen();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await zuGezaehlt(page)).toBe(1);
  });

  test('40 px langsam gezogen: bleibt offen und springt zurück auf 0', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await testBlatt(page);
    const f = await finger(page, page.locator('.blatt-griff'));
    await f.ziehe(40, { schritte: 5, pause: 100 });
    expect(await verschiebung(page)).toBeGreaterThan(25);
    await f.loslassen();
    await expect(page.getByRole('dialog', { name: 'Testblatt' })).toBeVisible();
    await expect.poll(() => verschiebung(page)).toBe(0);
    expect(await zuGezaehlt(page)).toBe(0);
  });

  test('kurz und schnell nach unten geworfen (50 px) schließt', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await testBlatt(page);
    const f = await finger(page, page.locator('.blatt-griff'));
    await f.ziehe(50, { schritte: 3 });
    await f.loslassen();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await zuGezaehlt(page)).toBe(1);
  });

  test('Inhalt nach unten gescrollt: Ziehen nach unten scrollt den Inhalt, das Blatt bleibt', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await testBlatt(page, { zeilen: 60 });
    const scroller = tafel(page);
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 300)).toBe(true);
    await scroller.evaluate((el) => {
      el.scrollTop = 400;
    });
    const f = await finger(page, { x: 195, y: 450 });
    await f.ziehe(150, { schritte: 10 });
    expect(await verschiebung(page)).toBe(0);
    await f.loslassen();
    await expect(page.getByRole('dialog', { name: 'Testblatt' })).toBeVisible();
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeLessThan(400);
    expect(await verschiebung(page)).toBe(0);
    expect(await zuGezaehlt(page)).toBe(0);
  });

  test('seitlich ziehen und ein Zug aus einem Eingabefeld bewegen das Blatt nicht; Tippen auf Knöpfe wirkt weiter', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await testBlatt(page, { mitFeld: true });
    const seitlich = await finger(page, page.locator('.test-zeile').first());
    await seitlich.ziehe(10, { dx: 150 });
    expect(await verschiebung(page)).toBe(0);
    await seitlich.loslassen();

    const ausFeld = await finger(page, page.locator('.test-feld'));
    await ausFeld.ziehe(150);
    expect(await verschiebung(page)).toBe(0);
    await ausFeld.loslassen();
    await expect(page.getByRole('dialog', { name: 'Testblatt' })).toBeVisible();
    expect(await zuGezaehlt(page)).toBe(0);

    await page.locator('.blatt-zu').tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await zuGezaehlt(page)).toBe(1);
  });
});

test.describe('jeder Weg zum Schließen ruft beimSchliessen genau einmal', () => {
  test('✕, Escape, Hintergrund und Wischen; danach ändert ein weiterer Versuch nichts', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    const wege = {
      '✕': () => page.getByRole('button', { name: 'Schließen' }).click(),
      Escape: () => page.keyboard.press('Escape'),
      Hintergrund: () => page.mouse.click(195, 20),
      Wischen: async () => {
        const f = await finger(page, page.locator('.blatt-griff'));
        await f.ziehe(150);
        await f.loslassen();
      },
    };
    for (const [weg, schliessen] of Object.entries(wege)) {
      await testBlatt(page, { titel: weg });
      await schliessen();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.evaluate((t) => window.__blaetter[t].schliessen(), weg);
      expect(await zuGezaehlt(page, weg), weg).toBe(1);
    }
  });

  test('reduzierte Bewegung: nach dem Wischen sofort weg, ohne Übergang', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await testBlatt(page);
    const f = await finger(page, page.locator('.blatt-griff'));
    await f.ziehe(150);
    await f.loslassen();
    expect(await page.evaluate(() => document.querySelectorAll('.blatt-huelle').length)).toBe(0);
  });
});

test.describe('mit Bewegung', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('nach dem Wischen gleitet das Blatt hinaus (Übergang), danach ist es weg; zu kurz gleitet es zurück', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await testBlatt(page);
    const kurz = await finger(page, page.locator('.blatt-griff'));
    await kurz.ziehe(40, { schritte: 4, pause: 100 });
    expect(await tafel(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s'); // folgt dem Finger ohne Verzögerung
    await kurz.loslassen();
    expect(await tafel(page).evaluate((el) => getComputedStyle(el).transitionDuration)).not.toBe('0s');
    await expect.poll(() => verschiebung(page)).toBe(0);

    const f = await finger(page, page.locator('.blatt-griff'));
    await f.ziehe(150);
    await f.loslassen();
    const zustand = await page.evaluate(() => {
      const huelle = document.querySelector('.blatt-huelle');
      const t = huelle?.querySelector('.blatt');
      return huelle && { zu: huelle.classList.contains('zu'), inline: t.style.transform, dauer: getComputedStyle(t).transitionDuration };
    });
    expect(zustand).toEqual({ zu: true, inline: '', dauer: expect.not.stringMatching(/^0s$/) });
    await expect(page.locator('.blatt-huelle')).toHaveCount(0);
    expect(await zuGezaehlt(page)).toBe(1);
  });
});

test.describe('kein Neuladen durch Herunterziehen', () => {
  const ueberzug = (page) =>
    page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY]);

  test('solange ein Blatt offen ist (auch zwei übereinander), ist das Überscrollen von html/body aus; danach wie vorher', async ({ page }) => {
    await starteDemo(page, { route: '#/heute' });
    expect(await ueberzug(page)).toEqual(['auto', 'auto']);
    await testBlatt(page, { titel: 'Erstes' });
    expect(await ueberzug(page)).toEqual(['none', 'none']);
    expect(await tafel(page).evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe('contain');
    await testBlatt(page, { titel: 'Zweites' });
    await page.evaluate(() => window.__blaetter.Zweites.schliessen());
    await expect(page.getByRole('dialog')).toHaveCount(1);
    expect(await ueberzug(page)).toEqual(['none', 'none']);
    await page.evaluate(() => window.__blaetter.Erstes.schliessen());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await ueberzug(page)).toEqual(['auto', 'auto']);
  });

  test('auf der Einkaufsliste gilt das Blatt vor ihrer eigenen Regel; nach dem Schließen wieder „contain“', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf' });
    expect((await ueberzug(page))[0]).toBe('contain');
    await testBlatt(page);
    expect(await ueberzug(page)).toEqual(['none', 'none']);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await ueberzug(page))[0]).toBe('contain');
  });
});
