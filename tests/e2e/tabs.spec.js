// Tab-Leiste: acht Registerkarten (drei links, „＋ Neu“ als runder Hauptknopf, „Schicht“ gleich danach, dann drei), Fenstertitel je Seite,
// Einkauf und Kontostand als Registerkarten ohne „Zurück“, Lage der Leiste auf schmalen Telefonen.
import { test, expect, starteDemo, tab } from './hilfen.js';

const TABS = [
  ['heute', '🏠', 'Heute', 'Heute'],
  ['monat', '📅', 'Monat', 'Monat'],
  ['einkauf', '🛒', 'Einkauf', 'Einkauf'],
  ['neu', '＋', 'Neu', 'Neu'],
  ['schicht', '🗓️', 'Schicht', 'Schichtplan'], // der Fenstertitel sagt es ganz
  ['urlaub', '✈️', 'Urlaub', 'Urlaub'],
  ['konto', '💶', 'Konto', 'Kontostand'], // „Kontostand“ passt nicht in die Leiste; der Fenstertitel sagt es ganz
  ['mehr', '⚙️', 'Mehr', 'Mehr'],
];

const leiste = (page) => page.locator('nav.tabs');
const tabs = (page) => leiste(page).locator('a.tab');

test('acht Registerkarten in fester Reihenfolge, „Neu“ als runder Hauptknopf', async ({ page }) => {
  await starteDemo(page);
  await expect(leiste(page)).toHaveAccessibleName('Hauptmenü');
  await expect(tabs(page)).toHaveCount(8);
  await expect(tabs(page).locator('.tab-symbol')).toHaveText(TABS.map(([, symbol]) => symbol));
  await expect(tabs(page).locator('.tab-text')).toHaveText(TABS.map(([, , text]) => text));
  expect(await tabs(page).evaluateAll((els) => els.map((a) => a.getAttribute('href')))).toEqual(TABS.map(([id]) => `#/${id}`));
  await expect(leiste(page).locator('a.fab')).toHaveCount(1);
  await expect(leiste(page).locator('a.fab')).toHaveAttribute('href', '#/neu');
  await expect(tabs(page).nth(3)).toHaveClass(/fab/);
});

test('jede Registerkarte öffnet ihre Seite, ist markiert und setzt den Fenstertitel', async ({ page }) => {
  await starteDemo(page);
  for (const [id, , text, titel] of TABS) {
    await tab(page, text);
    await expect(page).toHaveURL(new RegExp(`#/${id}$`));
    await expect(page).toHaveTitle(`Familienkalender · ${titel}`);
    await expect(leiste(page).locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(leiste(page).locator('a[aria-current="page"]')).toHaveAttribute('href', `#/${id}`);
    await expect(leiste(page).locator('a.aktiv .tab-text')).toHaveText(text);
  }
  // Seiten ohne eigene Registerkarte: kein Tab markiert, eigener Fenstertitel
  await page.goto('/#/verlauf');
  await expect(page).toHaveTitle('Familienkalender · Verlauf');
  await expect(leiste(page).locator('a[aria-current="page"]')).toHaveCount(0);
  await page.goto('/#/app');
  await expect(page).toHaveTitle('Familienkalender · Konto & App');
  await expect(leiste(page).locator('a[aria-current="page"]')).toHaveCount(0);
});

test('Einkauf und Kontostand sind Registerkarten ohne „Zurück“; Verlauf und Konto & App behalten es', async ({ page }) => {
  await starteDemo(page, { route: '#/einkauf' });
  await expect(page.getByRole('heading', { name: 'Einkaufsliste 🛒' })).toBeVisible();
  await expect(page.locator('button.zurueck')).toHaveCount(0);
  await tab(page, 'Konto');
  await expect(page.getByRole('heading', { name: 'Kontostand 💶' })).toBeVisible();
  await expect(page.locator('button.zurueck')).toHaveCount(0);
  await page.goto('/#/verlauf');
  await expect(page.getByRole('button', { name: '‹ Zurück' })).toBeVisible();
  await page.goto('/#/app');
  await expect(page.getByRole('button', { name: '‹ Zurück' })).toBeVisible();
});

test('„Neu“ beginnt immer bei den Kacheln, auch mitten aus einem Formular', async ({ page }) => {
  await starteDemo(page, { route: '#/neu' });
  await page.locator('.kachel').filter({ hasText: 'Arzttermin' }).click();
  await expect(page.locator('.formular .karte-text b')).toHaveText('Arzttermin');
  await tab(page, 'Monat');
  await tab(page, 'Neu');
  await expect(page.locator('.kacheln .kachel')).toHaveCount(10);
});

for (const breite of [320, 375, 390]) {
  test.describe(`Telefon mit ${breite} px Breite`, () => {
    test.use({ viewport: { width: breite, height: 812 } });

    test('acht Karten nebeneinander, „＋ Neu“ rund an vierter Stelle, nichts abgeschnitten, nichts überlappt, nichts ragt hinaus', async ({ page }) => {
      await starteDemo(page);
      const masse = await leiste(page).evaluate((nav) => {
        const r = (el) => el.getBoundingClientRect();
        const cs = getComputedStyle(nav);
        return {
          // Klassisch: angedockt (0 px); Glas und Bento schweben mit --tabs-abstand und Innenabstand der Leiste
          abstand: parseFloat(cs.getPropertyValue('--tabs-abstand')) || 0,
          innen: { links: parseFloat(cs.paddingLeft) || 0, rechts: parseFloat(cs.paddingRight) || 0 },
          fenster: document.documentElement.clientWidth,
          leiste: { links: r(nav).left, rechts: r(nav).right, ueberlauf: nav.scrollWidth - nav.clientWidth },
          tabs: [...nav.querySelectorAll('a.tab')].map((a) => ({ links: r(a).left, rechts: r(a).right, breite: r(a).width })),
          fab: r(nav.querySelector('a.fab')),
          kreis: r(nav.querySelector('a.fab .tab-symbol')),
          texte: [...nav.querySelectorAll('.tab-text')].map((t) => ({ links: r(t).left, rechts: r(t).right, abgeschnitten: t.scrollWidth > t.clientWidth + 0.5 })),
        };
      });
      expect(masse.fenster).toBe(breite);
      expect(masse.leiste.links).toBeCloseTo(masse.abstand, 1);
      expect(masse.leiste.rechts).toBeCloseTo(breite - masse.abstand, 1);
      expect(masse.leiste.ueberlauf).toBe(0);
      expect(masse.tabs).toHaveLength(8);
      // „Neu“ ist der runde Hauptknopf an vierter Stelle; der Kreis bleibt in seiner Karte
      expect(masse.fab.left).toBeCloseTo(masse.tabs[3].links, 1);
      expect(masse.kreis.width).toBe(masse.kreis.height);
      expect(masse.kreis.width).toBeGreaterThanOrEqual(46);
      expect(masse.kreis.left).toBeGreaterThanOrEqual(masse.fab.left - 0.5);
      expect(masse.kreis.right).toBeLessThanOrEqual(masse.fab.right + 0.5);
      // die übrigen sieben gleich breit; lückenlos und ohne Überlappung von Rand zu Rand (Rand = Innenkante der Leiste)
      const seiten = masse.tabs.filter((_, i) => i !== 3).map((t) => t.breite);
      for (const b of seiten) expect(Math.abs(b - seiten[0])).toBeLessThan(0.5);
      expect(masse.tabs[0].links).toBeCloseTo(masse.abstand + masse.innen.links, 1);
      expect(Math.abs(masse.tabs[7].rechts - (breite - masse.abstand - masse.innen.rechts))).toBeLessThan(0.5);
      for (let i = 1; i < 8; i += 1) expect(Math.abs(masse.tabs[i].links - masse.tabs[i - 1].rechts)).toBeLessThan(0.5);
      // jede Beschriftung passt ganz in ihre Karte (nicht abgeschnitten, nicht in die Nachbarkarte)
      masse.texte.forEach((t, i) => {
        expect(t.abgeschnitten).toBe(false);
        expect(t.links).toBeGreaterThanOrEqual(masse.tabs[i].links - 0.5);
        expect(t.rechts).toBeLessThanOrEqual(masse.tabs[i].rechts + 0.5);
      });
      // die Seite selbst scrollt nicht seitwärts
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(breite);
    });
  });
}
