// Konto in Glas/Bento MIT Bewegung (sonst laufen alle Tests mit reducedMotion: 'reduce'): der Tropfen/Blob des Umschalters gleitet nur
// direkt nach dem Umschalten (data-von), Überschrift und Umschalter kommen dabei nicht noch einmal herein; die Köpfe der Fixkosten und
// Sparziele zählen hoch und enden beim genauen Betrag; die Balken der Sparziele füllen sich über scaleX; in Bento fliegt Konfetti, wenn ein
// Sparziel erreicht wird – einmal je Ziel und Besuch. Klassisch: nichts davon (Text sofort, Balken mit Breite in %, kein Konfetti).
import { test, expect, starteDemo } from './hilfen.js';

test.use({ contextOptions: { reducedMotion: 'no-preference' } });

const ansicht = (page, name) => page.getByRole('group', { name: 'Ansicht im Konto' }).getByRole('button', { name });
const dialog = (page, name) => page.getByRole('dialog', { name });

/** Zählt jedes Konfetti, das in die Seite kommt (die Teilchen sind nach 1,5 s wieder weg). */
function konfettiZaehlen() {
  const z = { wolken: 0 };
  Object.defineProperty(window, '__konfetti', { value: z });
  new MutationObserver((liste) => {
    for (const m of liste) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('bw-konfetti')) z.wolken += 1;
  }).observe(document, { subtree: true, childList: true });
}

/**
 * Läuft vor den Skripten der Seite: `__messen(n)` nimmt n Bilder lang (rAF) je Bild auf, was man sieht – den Betrag im Kopf (während
 * des Zählens die sichtbare Anzeige), das scaleX des ersten Sparziel-Balkens, ob der Bildschirm einblendet, wo der Tropfen/Blob steht
 * (px) und data-von. `__umschalten(i, n)` drückt den Knopf i des Umschalters und misst ab dem ersten Bild danach.
 */
function bilderMessen() {
  const messen = (anzahl) =>
    new Promise((fertig) => {
      const liste = [];
      const schritt = () => {
        const seg = document.querySelector('.konto-segment');
        const tr = seg ? getComputedStyle(seg, '::before').transform : 'none';
        const zahl = document.querySelector('.fk-kopf .fk-gross');
        const fuellung = document.querySelector('.sz-ziel .sz-balken > span');
        liste.push({
          text: zahl ? (zahl.querySelector('[aria-hidden="true"]') ?? zahl).textContent : null,
          balken: fuellung ? new DOMMatrixReadOnly(getComputedStyle(fuellung).transform === 'none' ? undefined : getComputedStyle(fuellung).transform).a : null,
          einblenden: Boolean(document.querySelector('#inhalt > .screen.bw-einblenden')),
          x: tr && tr !== 'none' ? new DOMMatrixReadOnly(tr).m41 : 0,
          von: seg?.getAttribute('data-von') ?? null,
        });
        if (liste.length >= anzahl) fertig(liste);
        else requestAnimationFrame(schritt);
      };
      requestAnimationFrame(schritt);
    });
  Object.defineProperty(window, '__messen', { value: messen });
  Object.defineProperty(window, '__umschalten', {
    value: (i, anzahl) => {
      const bilder = messen(anzahl);
      document.querySelectorAll('.konto-segment-knopf')[i].click();
      return bilder;
    },
  });
}

/**
 * Demo mit der echten Uhr: die Messungen je Bild brauchen echte Bildwechsel (requestAnimationFrame, performance.now); die feste Uhr
 * von starteDemo ersetzt die Zeitgeber der Seite. Die Prüfungen hängen nicht vom Datum ab (sie lesen das Ziel aus der Seite).
 */
async function starteDemoEchteUhr(page, route) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('fk.test.vorbelegt')) return;
    sessionStorage.setItem('fk.test.vorbelegt', '1');
    localStorage.setItem('fk.config.v1', JSON.stringify({ v: 1, modus: 'demo' }));
  });
  await page.goto(`/${route}`);
  await expect(page.locator('nav.tabs')).toBeVisible();
}

/** Alle Bewegungen der ersten Anzeige sind vorbei (Einblenden ≤ 1,4 s, Zählen 0,7 s, Balken ≤ 1,3 s). */
const ausklingen = (page) => page.waitForTimeout(1800);

/** Animationen des ::before am Umschalter (Tropfen/Blob). */
const tropfenAnimationen = (page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.target?.classList?.contains('konto-segment') && a.effect.pseudoElement === '::before')
      .map((a) => a.animationName),
  );

test('Umschalter: der Tropfen/Blob gleitet nur nach dem Umschalten; Überschrift und Umschalter bleiben stehen', async ({ page, aussehen }) => {
  test.skip(!aussehen, 'nur Glas und Bento');
  await starteDemo(page, { route: '#/konto/kontostand' });
  await expect(page.locator('.konto-segment')).not.toHaveAttribute('data-von');
  expect(await tropfenAnimationen(page)).toEqual([]);

  await ansicht(page, 'Sparziele').click();
  const segment = page.locator('.konto-segment');
  await expect(segment).toHaveAttribute('data-von', 'kontostand');
  expect(await tropfenAnimationen(page)).toEqual([aussehen === 'glas' ? 'kt-tropfen' : 'kt-blob']);
  // die Inhalte darunter kommen herein, Überschrift und Umschalter nicht
  const animiert = await page.evaluate(() => ['.screen > .gruss', '.screen > .konto-segment'].map((s) => getComputedStyle(document.querySelector(s)).animationName));
  expect(animiert).toEqual(['none', 'none']);
  // der Tropfen steht unter „Sparziele“ (dritter Knopf)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const knopf = document.querySelectorAll('.konto-segment-knopf')[2].getBoundingClientRect();
        const seg = document.querySelector('.konto-segment');
        const vorher = getComputedStyle(seg, '::before');
        return Math.abs(new DOMMatrix(vorher.transform).m41 + seg.getBoundingClientRect().left + parseFloat(vorher.left) - knopf.left) < 1.5;
      }),
    )
    .toBe(true);
});

test('Köpfe zählen hoch und enden beim genauen Betrag; die Balken der Sparziele füllen sich über scaleX', async ({ page, aussehen }) => {
  await starteDemo(page, { route: '#/konto/fixkosten' });
  const fix = page.locator('.fk-kopf .fk-gross');
  await expect(fix).toHaveText('1.459,39 €');
  await expect(fix.locator('[aria-hidden="true"]')).toHaveCount(0); // fertig gezählt: nur noch der Text

  await ansicht(page, 'Sparziele').click();
  const balken = page.locator('.sz-ziel').first().locator('.sz-balken > span');
  const breite = Number(await page.locator('.sz-ziel').first().locator('.sz-balken').getAttribute('aria-valuenow'));
  if (aussehen) {
    await expect(balken).toHaveClass(/bw-fortschritt/);
    await expect.poll(() => balken.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)).toBeCloseTo(breite / 100, 3);
    // die Füllung ist voll breit (die Breite steckt im scaleX)
    const [innen, aussen] = await Promise.all([balken.evaluate((el) => el.offsetWidth), page.locator('.sz-ziel').first().locator('.sz-balken').evaluate((el) => el.clientWidth)]);
    expect(innen).toBe(aussen);
  } else {
    await expect(balken).not.toHaveClass(/bw-fortschritt/);
    expect(await balken.evaluate((el) => el.style.width)).toBe(`${breite}%`);
    expect(await balken.evaluate((el) => el.style.transform)).toBe('');
  }
  await expect(page.locator('.sz-kopf .fk-gross [aria-hidden="true"]')).toHaveCount(0);
  await expect(page.locator('.sz-kopf .fk-gross')).toHaveText(/^\d{1,3}(\.\d{3})*(,\d{2})? €$/);
});

test('Sparziel erreicht: Konfetti in Bento (einmal je Ziel und Besuch), sonst nie', async ({ page, aussehen }) => {
  await page.addInitScript(konfettiZaehlen);
  await starteDemo(page, { route: '#/konto/sparziele' });
  // ein kleines Ziel anlegen und aus „Frei“ ganz füllen
  await page.getByRole('button', { name: '＋ Neues Sparziel' }).click();
  const neu = dialog(page, 'Neues Sparziel');
  await neu.getByLabel('Name', { exact: true }).fill('Kleinigkeit');
  await neu.getByLabel('Monat', { exact: true }).selectOption({ label: 'September' });
  await neu.getByLabel('Jahr').selectOption('2027');
  await neu.getByLabel('Zielbetrag in Euro').fill('10');
  await neu.getByRole('button', { name: 'Speichern' }).click();
  await expect(neu).toBeHidden();
  expect(await page.evaluate(() => window.__konfetti.wolken)).toBe(0);

  await page.getByRole('button', { name: 'Zu Ziel verschieben' }).click();
  const schieben = dialog(page, 'Zu Ziel verschieben');
  const wert = await schieben.getByLabel('Zu welchem Ziel?').locator('option', { hasText: 'Kleinigkeit' }).getAttribute('value');
  await schieben.getByLabel('Zu welchem Ziel?').selectOption(wert);
  await schieben.getByLabel('Betrag in Euro').fill('10');
  await schieben.getByRole('button', { name: 'Verschieben' }).click();
  await expect(schieben).toBeHidden();
  const ziel = page.locator('.sz-ziel', { hasText: 'Kleinigkeit' });
  await expect(ziel.locator('.sz-status')).toHaveText('🎉 Ziel erreicht');

  if (aussehen === 'bento') {
    await expect.poll(() => page.evaluate(() => window.__konfetti.wolken)).toBe(1);
    const teile = await page.evaluate(() => document.querySelectorAll('.bw-konfetti .bw-konfetti-teil').length);
    expect(teile).toBeGreaterThan(0);
    expect(teile).toBeLessThanOrEqual(80);
    await expect(page.locator('.bw-konfetti')).toHaveCount(0, { timeout: 4000 }); // nach ≤ 1,5 s wieder weg
    // Neuzeichnen und Umschalten im selben Besuch: kein zweites Mal
    await ansicht(page, 'Fixkosten').click();
    await ansicht(page, 'Sparziele').click();
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__konfetti.wolken)).toBe(1);
    // neuer Besuch (andere Seite und zurück): das erreichte Ziel wird wieder gefeiert
    await page.locator('nav.tabs a[href="#/heute"]').click();
    await page.locator('nav.tabs a[href="#/konto"]').click();
    await expect.poll(() => page.evaluate(() => window.__konfetti.wolken)).toBe(2);
  } else {
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__konfetti.wolken)).toBe(0);
  }
});

test('„Bewegung: Reduziert“: kein Konfetti, kein Gleiten, Zahlen und Balken gleich am Ziel', async ({ page, aussehen }) => {
  test.skip(aussehen !== 'bento', 'Konfetti gibt es nur in Bento');
  await page.addInitScript(konfettiZaehlen);
  await starteDemo(page, { route: '#/konto/kontostand', speicher: { 'fk.bewegung.v1': 'reduziert' } });
  await ansicht(page, 'Sparziele').click();
  expect(await tropfenAnimationen(page)).toEqual([]);
  await expect(page.locator('.sz-kopf .fk-gross [aria-hidden="true"]')).toHaveCount(0);
  const balken = page.locator('.sz-ziel').first().locator('.sz-balken > span');
  expect(await balken.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
});

test.describe('Öffnen von Fixkosten und Sparziele: alles spielt einmal – auch wenn sie gleich nach dem Öffnen neu zeichnen (Laden)', () => {
  test.beforeEach(async ({ page, aussehen, browserName }) => {
    test.skip(!aussehen, 'nur Glas und Bento');
    // Safari/WebKit (nur lokal, npm run test:webkit): der WebKit-Port für Windows malt deutlich seltener (oft > 80 ms je Bild), und das
    // erste Bild kommt schon vor dem Neuzeichnen nach dem Laden – die Proben je Bild hier sind dafür zu grob. Das Gleiten selbst ist
    // dort per Bildschirmfoto mit verlangsamter Wiedergabe geprüft (Bericht Task 10).
    test.skip(browserName === 'webkit', 'WebKit (Windows): zu wenige Bilder für die Proben je Bild');
    await page.addInitScript(bilderMessen);
  });

  /** Prüft die gemessenen Bilder eines Öffnens: Tropfen unterwegs, Betrag zählt, Bildschirm blendet ein, Balken wachsen. */
  async function pruefeOeffnen(page, bilder, { balken, frueh = 12 }) {
    const ende = bilder.at(-1);
    const zielText = await page.locator('.fk-kopf .fk-gross').textContent();
    // Tropfen/Blob: in einem frühen Bild zwischen Start (Kontostand, 0) und Ziel
    expect(ende.x, 'der Tropfen steht am Ende unter der neuen Wahl').toBeGreaterThan(20);
    const unterwegs = (b) => b.x > 2 && Math.abs(b.x - ende.x) > 2; // auch Bilder, in denen der Blob über das Ziel hinausschwingt
    const wege = `${bilder.slice(0, 20).map((b) => Math.round(b.x)).join(', ')} … → ${Math.round(ende.x)}`;
    expect(bilder.slice(0, frueh).some(unterwegs), `früh unterwegs: ${wege}`).toBe(true);
    expect(bilder.filter(unterwegs).length, `sichtbar unterwegs (mehrere Bilder): ${wege}`).toBeGreaterThanOrEqual(3);
    // Betrag: Zwischenwerte, am Ende genau
    const texte = bilder.map((b) => b.text).filter(Boolean);
    expect(texte.at(-1)).toBe(zielText);
    expect(new Set(texte).size, `Zwischenwerte: ${[...new Set(texte)].slice(0, 5).join(' | ')}`).toBeGreaterThan(3);
    expect(texte.slice(0, 3).some((t) => t !== zielText), 'zu Beginn noch nicht am Ziel').toBe(true);
    // Einblenden
    expect(bilder.some((b) => b.einblenden), 'der Bildschirm bekommt .bw-einblenden').toBe(true);
    // Balken: beginnen unter ihrem Endstand
    if (balken) {
      const endstand = Number(await page.locator('.sz-ziel').first().locator('.sz-balken').getAttribute('aria-valuenow')) / 100;
      expect(ende.balken).toBeCloseTo(endstand, 2);
      expect(bilder[0].balken, 'der Balken beginnt unter dem Endstand').toBeLessThan(endstand - 0.02);
    }
  }

  for (const [name, index, balken] of [
    ['Fixkosten', 1, false],
    ['Sparziele', 2, true],
  ]) {
    test(`${name}: Tropfen gleitet, Betrag zählt, Karten kommen herein${balken ? ', Balken wachsen' : ''}; späteres Neuzeichnen spielt nichts erneut`, async ({ page }) => {
      await starteDemoEchteUhr(page, '#/konto/kontostand');
      await ausklingen(page);
      const bilder = await page.evaluate(([i]) => window.__umschalten(i, 75), [index]);
      await pruefeOeffnen(page, bilder, { balken });

      // ein späteres Neuzeichnen im Hintergrund (Rückkehr in die App): nichts zählt, gleitet, wächst oder blendet erneut ein
      await ausklingen(page);
      const zielText = await page.locator('.fk-kopf .fk-gross').textContent();
      const danach = await page.evaluate(() => {
        const bilder = window.__messen(30);
        document.dispatchEvent(new Event('visibilitychange'));
        return bilder;
      });
      expect(danach.every((b) => b.text === zielText), 'kein Zählen').toBe(true);
      expect(danach.every((b) => !b.einblenden), 'kein Einblenden').toBe(true);
      expect(danach.every((b) => b.von === null), 'kein Gleiten').toBe(true);
      expect(new Set(danach.map((b) => Math.round(b.x))).size, 'der Tropfen steht').toBe(1);
      if (balken) expect(new Set(danach.map((b) => b.balken.toFixed(4))).size, 'die Balken stehen').toBe(1);
    });
  }

  test('auch mit 4× langsamerer CPU: Tropfen unterwegs, Betrag zählt, Balken wachsen beim Öffnen der Sparziele', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU-Drossel nur über das Chrome DevTools Protocol');
    await starteDemoEchteUhr(page, '#/konto/kontostand');
    await ausklingen(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    try {
      const bilder = await page.evaluate(() => window.__umschalten(2, 60));
      await pruefeOeffnen(page, bilder, { balken: true, frueh: 8 });
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
  });

  test('schnell zweimal umschalten: der zweite Weg beginnt dort, wo der Tropfen gerade ist (kein Sprung)', async ({ page }) => {
    await starteDemoEchteUhr(page, '#/konto/kontostand');
    await ausklingen(page);
    const bilder = await page.evaluate(async () => {
      const erste = await window.__umschalten(2, 5); // unterwegs nach „Sparziele“
      const zweite = await window.__umschalten(1, 40); // gleich weiter zu „Fixkosten“
      return { erste, zweite };
    });
    const vorher = bilder.erste.at(-1).x;
    const nachher = bilder.zweite[0].x;
    expect(Math.abs(nachher - vorher), `vorher ${Math.round(vorher)} px, erstes Bild danach ${Math.round(nachher)} px`).toBeLessThan(25);
    const ziel = await page.evaluate(() => {
      const knopf = document.querySelectorAll('.konto-segment-knopf')[1];
      return knopf.offsetLeft - parseFloat(getComputedStyle(knopf.parentElement).paddingLeft);
    });
    expect(Math.abs(bilder.zweite.at(-1).x - ziel), 'am Ende genau unter „Fixkosten“').toBeLessThan(2);
  });
});
