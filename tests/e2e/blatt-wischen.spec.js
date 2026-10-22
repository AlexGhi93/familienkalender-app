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
 * `ziehe(dy, { dx, schritte, pause })` bewegt ihn in Schritten (mit `pause` ms dazwischen), `halte(ms)` hält ihn still, `loslassen()` hebt ihn ab.
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
  // Aufsetzen nicht abwarten: so geht die erste Bewegung gleich hinterher an den Browser, auch wenn die Maschine voll ausgelastet ist
  // (sonst sähe ein langsamer Umlauf wie langes Drücken aus, und im Inhalt beginnt dann absichtlich kein Zug)
  const aufgesetzt = cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  return {
    async ziehe(dy, { dx = 0, schritte = 5, pause = 0 } = {}) {
      const [x0, y0] = [x, y];
      for (let i = 1; i <= schritte; i += 1) {
        if (pause) await warte(pause);
        const bewegt = cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + (dx * i) / schritte), y: Math.round(y0 + (dy * i) / schritte) }] });
        await Promise.all([aufgesetzt, bewegt]);
      }
      [x, y] = [x0 + dx, y0 + dy];
    },
    /** Finger `ms` lang still halten (langes Drücken) – gezählt erst ab dem tatsächlichen Aufsetzen. */
    async halte(ms) {
      await aufgesetzt;
      await warte(ms);
    },
    async loslassen() {
      await aufgesetzt;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    },
  };
}

/**
 * Ein kurzer, schneller Wurf: Aufsetzen, `schritte` Bewegungen um insgesamt `dy` px und Loslassen gehen ohne Warten hintereinander an den
 * Browser (CDP setzt keine eigene Zeit, die Geschwindigkeit ist echte Zeit – so bleibt der Wurf auch bei voller Maschine schnell).
 */
async function wurf(page, ort, dy, schritte = 3) {
  const cdp = await page.context().newCDPSession(page);
  const box = await ort.boundingBox();
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const befehle = [cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })];
  for (let i = 1; i <= schritte; i += 1) befehle.push(cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(y + (dy * i) / schritte) }] }));
  befehle.push(cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
  await Promise.all(befehle);
  await cdp.detach();
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
          mitFeld
            ? h('input', {
                class: 'test-feld',
                type: 'text',
                'aria-label': 'Testfeld',
                onBlur: () => {
                  window.__blur = (window.__blur ?? 0) + 1;
                },
              })
            : null,
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
    await wurf(page, page.locator('.blatt-griff'), 50);
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

test.describe('Nachbesserungen (Review Runde 1)', () => {
  test('Tipp in ein Uhrzeit-Feld markiert dessen Wert; Wischen am Griff schließt trotzdem', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-23').click();
    const karteMama = page.locator('.sp-tag-karte[data-person="mama"]');
    await karteMama.getByRole('button', { name: '＋ Dienstbesprechung', exact: true }).click();
    const von = karteMama.locator('.sp-tag-zusatz-form').getByRole('textbox', { name: 'Von', exact: true });
    await von.tap();
    await expect.poll(() => page.evaluate(() => String(document.getSelection()))).toBe('18:00'); // der ganze Wert ist markiert
    await tafel(page).evaluate((el) => {
      el.scrollTop = 0; // der Griff ist zu sehen (das Feld bleibt markiert)
    });
    const f = await finger(page, page.locator('.blatt-griff'));
    await f.ziehe(150);
    await f.loslassen();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('markierter Text im Inhalt verhindert das Ziehen aus dem Inhalt, nicht aber am Griff', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await testBlatt(page);
    await page.locator('.test-zeile').first().evaluate((el) => document.getSelection().selectAllChildren(el));
    const ausInhalt = await finger(page, page.locator('.test-zeile').nth(1));
    await ausInhalt.ziehe(150);
    expect(await verschiebung(page)).toBe(0);
    await ausInhalt.loslassen();
    await expect(page.getByRole('dialog', { name: 'Testblatt' })).toBeVisible();
    const amGriff = await finger(page, page.locator('.blatt-griff'));
    await amGriff.ziehe(150);
    await amGriff.loslassen();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('wird der Inhalt mitten im Zug neu gezeichnet, folgt das Blatt weiter dem Finger und hängt nie fest', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await testBlatt(page);
    const neuZeichnen = () => page.evaluate(() => window.__blaetter.Testblatt.neuZeichnen());
    // zu kurz (langsam, kein Wurf): zurück auf 0
    const kurz = await finger(page, page.locator('.test-zeile').nth(1));
    await kurz.ziehe(60, { pause: 100 });
    await neuZeichnen();
    await kurz.loslassen();
    await expect.poll(() => verschiebung(page)).toBe(0);
    await expect(page.getByRole('dialog', { name: 'Testblatt' })).toBeVisible();
    // weiter gezogen: schließt
    const weit = await finger(page, page.locator('.test-zeile').nth(1));
    await weit.ziehe(60);
    await neuZeichnen();
    await weit.ziehe(90);
    expect(await verschiebung(page)).toBeGreaterThan(120);
    await weit.loslassen();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await zuGezaehlt(page)).toBe(1);
  });

  test('lang gedrückt und dann gezogen: am Griff schließt es, im Inhalt nicht (dort ist es Markieren)', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await testBlatt(page);
    const imInhalt = await finger(page, page.locator('.test-zeile').nth(1));
    await imInhalt.halte(600);
    await imInhalt.ziehe(150);
    expect(await verschiebung(page)).toBe(0);
    await imInhalt.loslassen();
    await expect(page.getByRole('dialog', { name: 'Testblatt' })).toBeVisible();
    const amGriff = await finger(page, page.locator('.blatt-griff'));
    await amGriff.halte(600);
    await amGriff.ziehe(150);
    await amGriff.loslassen();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('Nachbesserungen mit Bewegung (Review Runde 1)', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('Schließen durch Wischen verlässt sofort das Eingabefeld (Tastatur geht zu), wie ✕', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await testBlatt(page, { mitFeld: true });
    await page.locator('.test-feld').focus();
    const f = await finger(page, page.locator('.blatt-griff'));
    await f.ziehe(150);
    await f.loslassen();
    // noch während das Blatt hinausgleitet: das Feld hat den Fokus schon abgegeben
    expect(await page.evaluate(() => [Boolean(document.querySelector('.blatt-huelle.zu')), document.activeElement?.classList.contains('test-feld') ?? false, window.__blur])).toEqual([true, false, 1]);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
