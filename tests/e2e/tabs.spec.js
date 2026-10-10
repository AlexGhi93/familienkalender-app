// Tab-Leiste: sieben Registerkarten (drei links, „＋ Neu“ genau in der Mitte, drei rechts), Fenstertitel je Seite,
// Einkauf und Kontostand als Registerkarten ohne „Zurück“, Lage der Leiste auf schmalen Telefonen.
import { test, expect, starteDemo, tab } from './hilfen.js';

const TABS = [
  ['heute', '🏠', 'Heute', 'Heute'],
  ['monat', '📅', 'Monat', 'Monat'],
  ['einkauf', '🛒', 'Einkauf', 'Einkauf'],
  ['neu', '＋', 'Neu', 'Neu'],
  ['urlaub', '✈️', 'Urlaub', 'Urlaub'],
  ['konto', '💶', 'Konto', 'Kontostand'], // „Kontostand“ passt nicht in die Leiste; der Fenstertitel sagt es ganz
  ['mehr', '⚙️', 'Mehr', 'Mehr'],
];

const leiste = (page) => page.locator('nav.tabs');
const tabs = (page) => leiste(page).locator('a.tab');

test('sieben Registerkarten in fester Reihenfolge, „Neu“ als runder Hauptknopf', async ({ page }) => {
  await starteDemo(page);
  await expect(leiste(page)).toHaveAccessibleName('Hauptmenü');
  await expect(tabs(page)).toHaveCount(7);
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

for (const breite of [375, 390]) {
  test.describe(`Telefon mit ${breite} px Breite`, () => {
    test.use({ viewport: { width: breite, height: 812 } });

    test('„＋ Neu“ steht genau in der Mitte, links und rechts je drei gleich breite Karten, nichts ragt hinaus', async ({ page }) => {
      await starteDemo(page);
      const masse = await leiste(page).evaluate((nav) => {
        const r = (el) => el.getBoundingClientRect();
        return {
          fenster: document.documentElement.clientWidth,
          leiste: { links: r(nav).left, rechts: r(nav).right, ueberlauf: nav.scrollWidth - nav.clientWidth },
          tabs: [...nav.querySelectorAll('a.tab')].map((a) => ({ links: r(a).left, rechts: r(a).right, breite: r(a).width })),
          fab: r(nav.querySelector('a.fab')),
          kreis: r(nav.querySelector('a.fab .tab-symbol')),
          texte: [...nav.querySelectorAll('.tab-text')].map((t) => ({ links: r(t).left, rechts: r(t).right })),
        };
      });
      expect(masse.fenster).toBe(breite);
      expect(masse.leiste.links).toBeCloseTo(0, 1);
      expect(masse.leiste.rechts).toBeCloseTo(breite, 1);
      expect(masse.leiste.ueberlauf).toBe(0);
      const mitte = breite / 2;
      expect(Math.abs(masse.fab.left + masse.fab.width / 2 - mitte)).toBeLessThan(0.5);
      expect(Math.abs(masse.kreis.left + masse.kreis.width / 2 - mitte)).toBeLessThan(0.5);
      expect(masse.kreis.width).toBe(54);
      // drei links, drei rechts, alle gleich breit; lückenlos von Rand zu Rand
      const seiten = masse.tabs.filter((_, i) => i !== 3).map((t) => t.breite);
      for (const b of seiten) expect(Math.abs(b - seiten[0])).toBeLessThan(0.5);
      expect(masse.tabs[0].links).toBeCloseTo(0, 1);
      expect(Math.abs(masse.tabs[6].rechts - breite)).toBeLessThan(0.5);
      for (let i = 1; i < 7; i += 1) expect(Math.abs(masse.tabs[i].links - masse.tabs[i - 1].rechts)).toBeLessThan(0.5);
      // jede Beschriftung passt in ihre Karte
      masse.texte.forEach((t, i) => {
        expect(t.links).toBeGreaterThanOrEqual(masse.tabs[i].links - 0.5);
        expect(t.rechts).toBeLessThanOrEqual(masse.tabs[i].rechts + 0.5);
      });
      // die Seite selbst scrollt nicht seitwärts
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(breite);
    });
  });
}
