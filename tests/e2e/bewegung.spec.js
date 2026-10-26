// Gemeinsame Bewegung (src/ui/bewegung.js) MIT Bewegung (sonst laufen alle Tests mit reducedMotion: 'reduce'):
// Glas und Bento – ein zweiter Tab mitten im Übergang wirkt sofort, ein Blatt lässt sich gleich wieder schließen, Schreiben im
// Tagesblatt des Schichtplans übersteht das Vorladen im Hintergrund (Fokus und Text bleiben, die Karten kommen nicht noch einmal herein),
// die Ersparnis zählt hoch und endet beim genauen Betrag. Klassisch: keine Klasse der Bewegung, kein Übergang.
import { test, expect, starteDemo, googleAttrappe, tab, KONFIG_GOOGLE, WERKTAG, NETZFEHLER } from './hilfen.js';

test.use({ contextOptions: { reducedMotion: 'no-preference' } });

/**
 * Läuft vor den Skripten der Seite: merkt sich jede Klasse „bw-…“, die irgendwo auftaucht, wie oft `bw-einblenden` gesetzt wurde,
 * jeden Text eines Elements mit data-bw-schluessel (Hochzählen) und jede View Transition.
 */
function bewegungBeobachten() {
  const bw = { klassen: [], eingeblendet: 0, zahlen: [], uebergaenge: 0 };
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
      if (zahl && m.type !== 'attributes') bw.zahlen.push(zahl.textContent);
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true, childList: true, characterData: true });
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

  test('erstes Zeichnen blendet ein; ein zweiter Tab mitten im Übergang wirkt sofort und die neue Seite ist gleich bedienbar', async ({ page }) => {
    await starteDemo(page);
    await expect.poll(async () => (await bw(page)).eingeblendet, 'Heute kommt beim ersten Zeichnen herein').toBe(1);
    // langer Übergang (2 s statt ≤ 0,26 s), damit der zweite Tipp sicher mitten hinein fällt (Token; Inline-<style> verbietet die CSP)
    await page.evaluate(() => document.documentElement.style.setProperty('--dauer-tab', '2s'));

    await tab(page, 'Monat');
    await expect(html(page)).toHaveClass(/bw-wechselt/);
    // Tipp an die Stelle des Tabs, ohne auf das Ende des Übergangs zu warten (kein Warten auf „bedienbar“ wie bei locator.click)
    const einkauf = await mitte(page.locator('nav.tabs').getByRole('link', { name: 'Einkauf' }));
    await page.mouse.click(einkauf.x, einkauf.y);
    await expect(page).toHaveURL(/#\/einkauf$/, { timeout: 1000 });
    await expect(page.locator('.screen.einkauf')).toHaveCount(1, { timeout: 1000 });

    // gleich danach (meist noch im zweiten Übergang): Artikel eintippen und mit ＋ hinzufügen – Tipps gehen durch das Bild des Übergangs hindurch
    const feld = await mitte(page.getByRole('textbox', { name: 'Artikel' }));
    await page.mouse.click(feld.x, feld.y);
    await expect(page.getByRole('textbox', { name: 'Artikel' })).toBeFocused();
    await page.keyboard.type('Brot');
    const plus = await mitte(page.getByRole('button', { name: 'Zur Liste hinzufügen' }));
    await page.mouse.click(plus.x, plus.y);
    await expect(page.getByRole('heading', { name: 'Zu kaufen · 4' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Artikel' })).toHaveValue('');

    const stand = await bw(page);
    expect(stand.uebergaenge, 'beide Wechsel als View Transition').toBeGreaterThanOrEqual(2);
    await expect(html(page)).not.toHaveClass(/bw-wechselt/, { timeout: 4000 });
    await expect(page.locator('.screen.einkauf')).toBeVisible();
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
});
