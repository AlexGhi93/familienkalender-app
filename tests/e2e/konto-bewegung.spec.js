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
