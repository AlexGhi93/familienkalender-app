// Gemeinsame Bewegung (src/ui/bewegung.js) MIT Bewegung (sonst laufen alle Tests mit reducedMotion: 'reduce'):
// Glas und Bento – ein Tab wechselt sofort, Tipps gleich danach (während #inhalt noch einblendet) treffen die neue Seite, ein Blatt
// lässt sich gleich wieder schließen, Schreiben im Tagesblatt des Schichtplans übersteht das Vorladen im Hintergrund (Fokus und Text
// bleiben, die Karten kommen nicht noch einmal herein), die Ersparnis zählt hoch und endet beim genauen Betrag.
// Klassisch: keine Klasse der Bewegung; mit „Bewegung: Reduziert“ sind auch die alten Animationen (Mehr, Einkauf, Blatt) sofort.
import { test, expect, starteDemo, googleAttrappe, tab, KONFIG_GOOGLE, WERKTAG, NETZFEHLER } from './hilfen.js';

test.use({ contextOptions: { reducedMotion: 'no-preference' } });

/**
 * Läuft vor den Skripten der Seite: merkt sich jede Klasse „bw-…“, die irgendwo auftaucht, wie oft `bw-einblenden` gesetzt wurde,
 * jeden sichtbaren Text eines Elements mit data-bw-schluessel (Hochzählen), jede View Transition (es darf keine geben) und für jeden
 * Tipp (pointerdown/touchstart), ob #inhalt da gerade noch einblendete und welches Element ihn bekam.
 */
function bewegungBeobachten() {
  const bw = { klassen: [], eingeblendet: 0, zahlen: [], uebergaenge: 0, tipps: [] };
  Object.defineProperty(window, '__bw', { value: bw });
  const merke = (el) => {
    for (const k of el.classList ?? []) if (k.startsWith('bw-') && !bw.klassen.includes(k)) bw.klassen.push(k);
  };
  new MutationObserver((liste) => {
    for (const m of liste) {
      if (m.type === 'attributes') {
        merke(m.target);
        if (m.target.classList.contains('bw-einblenden') && !(m.oldValue ?? '').includes('bw-einblenden')) bw.eingeblendet += 1;
      }
      for (const n of m.addedNodes) if (n.nodeType === 1) merke(n);
      const zahl = (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest?.('[data-bw-schluessel]');
      if (zahl && m.type !== 'attributes') bw.zahlen.push((zahl.querySelector('[aria-hidden="true"]') ?? zahl).textContent);
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true, childList: true, characterData: true });
  const tipp = (e) => {
    const laeuft = (document.getElementById('inhalt')?.getAnimations() ?? []).some((a) => a.animationName === 'bw-seite-rein' && a.playState === 'running');
    bw.tipps.push({ art: e.type, laeuft, ziel: e.target?.closest?.('a, button, input')?.getAttribute('aria-label') ?? e.target?.closest?.('a')?.querySelector('.tab-text')?.textContent ?? e.target?.tagName });
  };
  addEventListener('pointerdown', tipp, true);
  addEventListener('touchstart', tipp, { capture: true, passive: true });
  const start = Document.prototype.startViewTransition;
  if (start) {
    Document.prototype.startViewTransition = function (...a) {
      bw.uebergaenge += 1;
      return start.apply(this, a);
    };
  }
}

const bw = (page) => page.evaluate(() => structuredClone(window.__bw));

/** Mitte eines Elements (die Tab-Leiste wird bei jedem Zeichnen ersetzt: so lange fragen, bis es eine gibt). */
async function mitte(locator) {
  let box = null;
  await expect.poll(async () => (box = await locator.boundingBox().catch(() => null)) !== null).toBe(true);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
const html = (page) => page.locator('html');

test.describe('Glas und Bento mit Bewegung', () => {
  test.beforeEach(async ({ page, aussehen }) => {
    test.skip(!aussehen, 'nur in den Projekten telefon-glas und telefon-bento');
    await page.addInitScript(bewegungBeobachten);
  });

  test('erstes Zeichnen blendet ein; Tab-Wechsel zeichnen sofort, Tipps gleich danach (noch im Einblenden) treffen die neue Seite', async ({ page }) => {
    await starteDemo(page);
    await expect.poll(async () => (await bw(page)).eingeblendet, 'Heute kommt beim ersten Zeichnen herein').toBe(1);
    // langes Einblenden (5 s statt ≤ 0,26 s), damit jeder Tipp unten sicher hinein fällt (Token; Inline-<style> verbietet die CSP)
    await page.evaluate(() => document.documentElement.style.setProperty('--dauer-tab', '5s'));

    await tab(page, 'Monat');
    await expect(page.locator('.screen .raster')).toHaveCount(1); // schon gezeichnet
    await expect(html(page)).toHaveClass(/bw-tabwechsel/);
    // Tipp an die Stelle des nächsten Tabs, ohne zu warten (kein Warten auf „bedienbar“ wie bei locator.click)
    const einkauf = await mitte(page.locator('nav.tabs').getByRole('link', { name: 'Einkauf' }));
    await page.mouse.click(einkauf.x, einkauf.y);
    await expect(page).toHaveURL(/#\/einkauf$/, { timeout: 1000 });
    await expect(page.locator('.screen.einkauf')).toHaveCount(1, { timeout: 1000 });

    // gleich danach: ins Feld tippen (Maus), schreiben, ＋ mit dem Finger (Touch)
    const feld = await mitte(page.getByRole('textbox', { name: 'Artikel' }));
    await page.mouse.click(feld.x, feld.y);
    await expect(page.getByRole('textbox', { name: 'Artikel' })).toBeFocused();
    await page.keyboard.type('Brot');
    const plus = await mitte(page.getByRole('button', { name: 'Zur Liste hinzufügen' }));
    await page.touchscreen.tap(plus.x, plus.y);
    await expect(page.getByRole('heading', { name: 'Zu kaufen · 4' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Artikel' })).toHaveValue('');

    // nicht leer bestanden: jeder dieser Tipps fiel mitten in das Einblenden der Seite und kam am gemeinten Element an
    const { tipps, uebergaenge, klassen } = await bw(page);
    const waehrend = tipps.filter((t) => t.laeuft);
    expect(waehrend.map((t) => t.ziel)).toEqual(expect.arrayContaining(['Einkauf', 'Artikel', 'Zur Liste hinzufügen']));
    expect(waehrend.some((t) => t.art === 'touchstart'), 'auch ein Finger-Tipp').toBe(true);
    expect(tipps.filter((t) => t.ziel === 'Einkauf' || t.ziel === 'Artikel' || t.ziel === 'Zur Liste hinzufügen').every((t) => t.laeuft)).toBe(true);
    expect(uebergaenge, 'keine View Transitions').toBe(0);
    expect(klassen).toContain('bw-tabwechsel');
    await expect(html(page)).not.toHaveClass(/bw-tabwechsel/, { timeout: 8000 });
  });

  test('Blatt öffnen und gleich mit ✕ schließen: zu, ohne Fehler, die Seite bleibt bedienbar', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    const tag = page.locator('.raster').getByRole('button', { name: 'Donnerstag, 22. Oktober', exact: false });
    // ✕ hat beim Öffnen den Fokus: Enter tippt es an, noch bevor das Blatt hereingeglitten ist
    await tag.click();
    await page.keyboard.press('Enter');
    await expect(page.locator('.blatt-huelle')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // noch einmal: Tipp auf ✕ mitten im Hereingleiten (als Klick genau auf ✕, ohne zu warten, bis das Blatt steht)
    await tag.click();
    await page.locator('.blatt-zu').dispatchEvent('click');
    await expect(page.locator('.blatt-huelle')).toHaveCount(0);
    // und Escape, danach gleich ein anderer Tab
    await tag.click();
    await page.keyboard.press('Escape');
    await tab(page, 'Heute');
    await expect(page).toHaveURL(/#\/heute$/);
    await expect(page.locator('.blatt-huelle')).toHaveCount(0);
  });

  test('Ersparnis zählt hoch und endet beim genauen Betrag; zurück auf derselben Seite zählt nichts erneut', async ({ page }) => {
    await starteDemo(page, { route: '#/konto' });
    const wert = page.locator('.konto-kachel-wert').first();
    await expect(wert).toHaveText('+4.213,50 €');
    const gezaehlt = (await bw(page)).zahlen;
    expect(gezaehlt[0], 'beginnt bei ±0').toBe('±0 €');
    expect(new Set(gezaehlt).size, 'Zwischenwerte').toBeGreaterThan(2);
    expect(gezaehlt.at(-1)).toBe('+4.213,50 €');

    await page.getByRole('group', { name: 'Ansicht im Konto' }).getByRole('button', { name: 'Fixkosten' }).click();
    await page.getByRole('group', { name: 'Ansicht im Konto' }).getByRole('button', { name: 'Kontostand' }).click();
    await expect(wert).toHaveText('+4.213,50 €');
    expect((await bw(page)).zahlen.slice(gezaehlt.length).filter((t) => t !== '+4.213,50 €'), 'gleicher Wert: sofort, ohne Zählen').toEqual([]);
  });

  test.describe('Schreiben im Tagesblatt des Schichtplans, während das Vorladen fertig wird (Review Focus 1)', () => {
    test.use({ viewport: { width: 375, height: 812 }, erlaubteFehler: NETZFEHLER });

    test('Fokus und Text bleiben, die Karten kommen nicht noch einmal herein', async ({ page }) => {
      await page.clock.setFixedTime(new Date(WERKTAG));
      const google = await googleAttrappe(page);
      // das Vorladen des Dezembers wartet, bis der Test es freigibt (dann antwortet die Attrappe wie sonst)
      let freigeben;
      const tor = new Promise((r) => (freigeben = r));
      await page.route(/\/events\/fksch202612/, async (route) => {
        await tor;
        await route.fallback();
      });
      await page.addInitScript((konfig) => {
        if (sessionStorage.getItem('fk.test.vorbelegt')) return;
        sessionStorage.setItem('fk.test.vorbelegt', '1');
        localStorage.setItem('fk.config.v1', konfig);
      }, JSON.stringify(KONFIG_GOOGLE));
      await page.goto('/#/schicht');
      await page.getByRole('button', { name: 'Mit Google anmelden' }).click();
      await expect(page.locator('.sp-zelle')).toHaveCount(31);
      await expect.poll(() => google.anfragen.some((a) => a.includes('/events/fksch202612')), 'Vorladen wartet am Dezember').toBe(false);
      await expect.poll(async () => (await bw(page)).eingeblendet, 'der Schichtplan kam beim ersten Zeichnen herein').toBe(1);

      await page.locator('.sp-zelle[data-datum="2026-10-21"]').click();
      const notiz = page.locator('.sp-tag-karte[data-person="papa"]').getByRole('textbox', { name: 'Notiz (optional)' });
      await notiz.click();
      await page.keyboard.type('Dienst 1');
      // die Seite darunter markieren: nach dem Neuzeichnen ist sie ersetzt
      await page.evaluate(() => document.querySelector('#inhalt > .screen').setAttribute('data-alt', ''));
      const vorher = (await bw(page)).eingeblendet;

      freigeben();
      await expect.poll(() => google.anfragen.some((a) => a.includes('/events/fksch202612')), 'Dezember gelesen').toBe(true);
      await expect(page.locator('#inhalt > .screen[data-alt]'), 'die Seite wurde im Hintergrund neu gezeichnet').toHaveCount(0);

      await expect(notiz).toBeFocused();
      await page.keyboard.type('2');
      await expect(notiz).toHaveValue('Dienst 12');
      expect((await bw(page)).eingeblendet, 'kein zweites Einblenden').toBe(vorher);
      await expect(page.locator('#inhalt .bw-einblenden')).toHaveCount(0);
    });
  });
});

test.describe('Klassisch mit Bewegung', () => {
  test.beforeEach(async ({ page, aussehen }) => {
    test.skip(Boolean(aussehen), 'nur im Projekt telefon-chromium (Klassisch)');
    await page.addInitScript(bewegungBeobachten);
  });

  test('keine Klasse der Bewegung, kein Übergang, der Betrag steht sofort', async ({ page }) => {
    await starteDemo(page);
    for (const name of ['Monat', 'Einkauf', 'Schicht', 'Urlaub', 'Konto', 'Mehr', 'Heute']) {
      await tab(page, name);
      await expect(page.locator('#inhalt > .screen')).toHaveCount(1);
    }
    await tab(page, 'Konto');
    await expect(page.locator('.konto-kachel-wert').first()).toHaveText('+4.213,50 €');
    const stand = await bw(page);
    expect(stand.klassen).toEqual([]);
    expect(stand.eingeblendet).toBe(0);
    expect(stand.uebergaenge).toBe(0);
    expect(stand.zahlen.every((t) => t === '+4.213,50 €'), 'kein Hochzählen').toBe(true);
  });

  test('ohne Wahl (Standard) gleitet ein geschlossenes Blatt wie bisher noch kurz hinaus', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    await expect(html(page)).not.toHaveAttribute('data-bewegung');
    await page.locator('.raster').getByRole('button', { name: 'Donnerstag, 22. Oktober', exact: false }).click();
    const gleichDanach = await page.evaluate(() => {
      document.querySelector('.blatt-zu').click();
      return document.querySelectorAll('.blatt-huelle').length;
    });
    expect(gleichDanach).toBe(1);
    await expect(page.locator('.blatt-huelle')).toHaveCount(0);
  });
});

test.describe('Klassisch mit „Bewegung: Reduziert“ (System ohne Wunsch)', () => {
  test.beforeEach(({ aussehen }) => test.skip(Boolean(aussehen), 'nur im Projekt telefon-chromium (Klassisch)'));

  const reduziert = { 'fk.bewegung.v1': 'reduziert' };

  test('Mehr: die Symbole spielen keine Animation', async ({ page }) => {
    await starteDemo(page, { speicher: reduziert });
    await expect(html(page)).toHaveAttribute('data-bewegung', 'reduziert');
    await expect(html(page)).not.toHaveAttribute('data-aussehen');
    await tab(page, 'Mehr');
    await expect(page.locator('.menue-symbol')).toHaveCount(11);
    expect(await page.locator('.menue-symbol').evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName))).toEqual(Array(11).fill('none'));
    expect(await page.evaluate(() => document.getAnimations().length), 'keine laufende Animation auf der Seite').toBe(0);
  });

  test('Einkauf: Herunterziehen folgt dem Finger nicht gedämpft (feste Höhe), ohne Übergang', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf', speicher: reduziert });
    const anzeige = page.locator('.ek-ziehen');
    expect(await anzeige.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    const cdp = await page.context().newCDPSession(page);
    const box = await page.getByRole('heading', { name: 'Einkaufsliste 🛒' }).boundingBox();
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 5; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 10 }] });
    await expect(anzeige).toHaveAttribute('data-phase', 'ziehen');
    expect(await anzeige.evaluate((el) => el.style.getPropertyValue('--zug'))).toBe('44px'); // mit Bewegung wären es 30px (60 % von 50)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await expect(anzeige).toHaveAttribute('data-phase', 'ruhe');
  });

  test('Blatt: ✕ nimmt es sofort weg (nichts gleitet), Escape ebenso', async ({ page }) => {
    await starteDemo(page, { route: '#/monat', speicher: reduziert });
    const tag = page.locator('.raster').getByRole('button', { name: 'Donnerstag, 22. Oktober', exact: false });
    await tag.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.locator('.blatt').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    const gleichDanach = await page.evaluate(() => {
      document.querySelector('.blatt-zu').click();
      return document.querySelectorAll('.blatt-huelle').length;
    });
    expect(gleichDanach).toBe(0);
    await tag.click();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.querySelectorAll('.blatt-huelle').length)).toBe(0);
  });
});
