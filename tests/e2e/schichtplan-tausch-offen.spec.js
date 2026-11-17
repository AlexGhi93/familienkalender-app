// Schichtplan: offener Diensttausch – der Dienst wird übernommen oder abgegeben, der Tag der Rückgabe kommt später. Das Formular, das ⇄ am Tag,
// die Karte „Offene Diensttausche“ und das Blatt „Rückgabe eintragen“. Die Demo hat Schichten im September, Oktober und November 2026 (heute = 14.10.).
import { test, expect, starteDemo, erwarteToast } from './hilfen.js';
import { streifen, zelle } from './schichtplan-hilfen.js';

test.describe('Offener Diensttausch', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const papaKarte = (page) => page.locator('.sp-tag-karte[data-person="papa"]');
  const tagKnopf = (page, name) => papaKarte(page).getByRole('button', { name, exact: true });
  const tagBlatt = (page, titel) => page.getByRole('dialog', { name: titel });
  const formular = (page) => page.getByRole('dialog', { name: 'Diensttausch', exact: true });
  const rueckgabe = (page) => page.getByRole('dialog', { name: 'Rückgabe eintragen', exact: true });
  const offene = (page) => page.locator('.sp-offen');
  const monatsSeite = (page) => page.locator('.sp-monat h2');
  const naechster = (page) => page.getByRole('button', { name: 'Nächster Monat' }).click();
  const vorheriger = (page) => page.getByRole('button', { name: 'Vorheriger Monat' }).click();
  const deutsch = (iso) => iso.split('-').reverse().join('.');
  const kurz = (iso) => `${iso.slice(8)}.${iso.slice(5, 7)}.`;

  /** Erster Tag des gezeigten Monats, an dem Papa einen Dienst hat (`mit`) bzw. frei ist (`!mit`), als 'JJJJ-MM-TT'; `ab` = frühestens dieser Tag. */
  const tagMitDienst = (page, mit, ab = 1) =>
    page.evaluate(
      ({ mit: m, ab: von }) =>
        [...document.querySelectorAll('.sp-zelle')].map((z) => ({ datum: z.dataset.datum, frei: z.querySelector('.sp-streifen.papa').classList.contains('leer') })).find((z) => z.frei !== m && Number(z.datum.slice(8)) >= von)?.datum,
      { mit, ab },
    );

  /** Oktober: ein freier Tag und ein Dienst von Papa; November: ein Dienst von Papa. Endet im Oktober. */
  async function tageSuchen(page) {
    await starteDemo(page, { route: '#/schicht' });
    const frei = await tagMitDienst(page, false, 15);
    const dienst = await tagMitDienst(page, true, 15);
    await naechster(page);
    await expect(monatsSeite(page)).toHaveText('November 2026');
    const november = await tagMitDienst(page, true);
    await vorheriger(page);
    await expect(monatsSeite(page)).toHaveText('Oktober 2026');
    return { frei, dienst, november };
  }

  test('freier Tag: „Dienst übernehmen“ ohne Rückgabe → ⇄ am Tag, Karte mit Zeile, Rückgabe eintragen (Tag in anderem Monat wird frei) → Zeile weg, ⇄ an beiden Tagen; Rückgängig stellt alles her', async ({ page }) => {
    const { frei, dienst, november } = await tageSuchen(page);
    expect(frei).toBeTruthy();
    expect(dienst).toBeTruthy();
    expect(november).toBeTruthy();
    await zelle(page, frei).click();
    await tagKnopf(page, '⇄ Diensttausch').click();
    const f = formular(page);
    // an einem freien Tag gibt es nur „Dienst übernehmen“; der Dienst ist gefragt, die Rückgabe freiwillig
    await expect(f.getByRole('combobox', { name: 'Richtung' }).locator('option')).toHaveText(['Dienst übernehmen']);
    await expect(f.getByRole('combobox', { name: 'Übernommener Dienst' })).toBeEnabled();
    await expect(f.getByRole('textbox', { name: 'Rückgabetag', exact: true })).toHaveValue('');
    await f.getByRole('combobox', { name: 'Übernommener Dienst' }).selectOption({ label: 'NM Nachmittagsdienst' });
    await f.getByRole('textbox', { name: 'Mit wem (optional)' }).fill('Kollegin');
    await f.getByRole('button', { name: 'Speichern' }).click();
    await erwarteToast(page, 'Diensttausch gespeichert ✓');
    await expect(f).toHaveCount(0);
    // am Tag: ⇄ mit Text und „Rückgabe eintragen“
    await expect(papaKarte(page).locator('.sp-tag-tausch')).toContainText('⇄ übernommen von Kollegin · Rückgabe offen');
    await expect(tagKnopf(page, 'Rückgabe eintragen')).toBeVisible();
    await expect(tagKnopf(page, '⇄ Diensttausch')).toHaveCount(0);
    await tagBlatt(page, /\d+\. Oktober/).getByRole('button', { name: 'Schließen' }).click();
    await expect(zelle(page, frei).locator('.sp-tausch')).toHaveText('⇄');
    await expect(streifen(page, frei, 'papa')).toHaveText('NM');
    // Karte unter der Zählung
    await expect(offene(page)).toBeVisible();
    await expect(offene(page).getByRole('heading', { name: 'Offene Diensttausche' })).toBeVisible();
    await expect(offene(page).locator('.sp-offen-zeile')).toHaveCount(1);
    await expect(offene(page).locator('.sp-offen-text')).toHaveText(`Nachmittagsdienst übernommen am ${kurz(frei)} (von Kollegin) – Rückgabe offen bis ${deutsch(frei).replace(/\.2026$/, '.2027')}`);
    await expect(page.locator('.sp-zaehlung').locator('xpath=following-sibling::*[1]')).toHaveClass(/sp-offen/);
    // der Personenfilter gilt auch für die Karte
    await page.locator('.sp-filter').getByRole('button', { name: '👩 Mama' }).click();
    await expect(offene(page)).toHaveCount(0);
    await page.locator('.sp-filter').getByRole('button', { name: 'Beide' }).click();
    await expect(offene(page)).toBeVisible();
    // nach einem Neustart steht alles noch da
    await page.reload();
    await expect(offene(page).locator('.sp-offen-zeile')).toHaveCount(1);

    // Rückgabe: ein Dienst im November wird frei
    await offene(page).getByRole('button', { name: 'Rückgabe eintragen' }).click();
    const r = rueckgabe(page);
    await expect(r).toBeVisible();
    await expect(r).toContainText('übernommen am');
    await r.getByRole('textbox', { name: 'Rückgabetag', exact: true }).fill(deutsch(november));
    await expect(r.getByRole('status')).toContainText('wird frei:');
    await r.getByRole('button', { name: 'Speichern' }).click();
    await erwarteToast(page, 'Rückgabe eingetragen ✓');
    await expect(r).toHaveCount(0);
    await expect(offene(page)).toHaveCount(0);
    await expect(zelle(page, frei).locator('.sp-tausch')).toHaveText('⇄');
    await expect(streifen(page, frei, 'papa')).toHaveText('NM');
    await naechster(page);
    await expect(zelle(page, november).locator('.sp-tausch')).toHaveText('⇄');
    await expect(streifen(page, november, 'papa')).toHaveClass(/leer/);
    await zelle(page, november).click();
    await expect(papaKarte(page).locator('.sp-tag-tausch')).toContainText(`⇄ getauscht mit Kollegin / gegen ${kurz(frei)}`);
    await expect(tagKnopf(page, 'Rückgabe eintragen')).toHaveCount(0);

    // Rückgängig: beide Tage wie vorher
    await papaKarte(page).getByRole('button', { name: 'Tausch rückgängig' }).click();
    const frage = page.getByRole('dialog', { name: 'Diensttausch rückgängig machen?' });
    await frage.getByRole('button', { name: 'Rückgängig machen' }).click();
    await expect(frage).toHaveCount(0);
    await tagBlatt(page, /\d+\. November/).getByRole('button', { name: 'Schließen' }).click();
    await expect(zelle(page, november).locator('.sp-tausch')).toHaveCount(0);
    await expect(streifen(page, november, 'papa')).not.toHaveClass(/leer/);
    await vorheriger(page);
    await expect(zelle(page, frei).locator('.sp-tausch')).toHaveCount(0);
    await expect(streifen(page, frei, 'papa')).toHaveClass(/leer/);
    await expect(offene(page)).toHaveCount(0);
  });

  test('Dienst abgeben mit Rückgabe gleich im Formular → wie 1.5.0 (verknüpft), keine Karte', async ({ page }) => {
    const { dienst, frei } = await tageSuchen(page);
    await zelle(page, dienst).click();
    await tagKnopf(page, '⇄ Diensttausch').click();
    const f = formular(page);
    await expect(f.getByRole('combobox', { name: 'Richtung' }).locator('option')).toHaveText(['Dienst abgeben', 'Dienst übernehmen']);
    await expect(f.getByRole('combobox', { name: 'Richtung' })).toHaveValue('abgegeben');
    await f.getByRole('textbox', { name: 'Übernommener Tag', exact: true }).fill(deutsch(frei));
    await f.getByRole('button', { name: 'Speichern' }).click();
    await expect(f).toHaveCount(0);
    await expect(papaKarte(page).locator('.sp-tag-tausch')).toContainText(`⇄ getauscht / gegen ${kurz(frei)}`);
    await expect(tagKnopf(page, 'Rückgabe eintragen')).toHaveCount(0);
    await expect(offene(page)).toHaveCount(0);
  });

  test('Dienst abgeben ohne Rückgabe: Karte „noch eine Schicht übernehmen bis …“; Rückgabe eintragen übernimmt dort den Dienst', async ({ page }) => {
    const { dienst, frei } = await tageSuchen(page);
    await zelle(page, dienst).click();
    await tagKnopf(page, '⇄ Diensttausch').click();
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(papaKarte(page).locator('.sp-tag-tausch')).toContainText('⇄ abgegeben · Rückgabe offen');
    await tagBlatt(page, /\d+\. Oktober/).getByRole('button', { name: 'Schließen' }).click();
    await expect(streifen(page, dienst, 'papa')).toHaveClass(/leer/);
    await expect(offene(page).locator('.sp-offen-text')).toContainText(/abgegeben am \d\d\.10\. – noch eine Schicht übernehmen bis \d\d\.10\.2027$/);
    await expect(offene(page)).not.toContainText('schuldet'); // kein „du schuldest“ (R4)
    await offene(page).getByRole('button', { name: 'Rückgabe eintragen' }).click();
    const r = rueckgabe(page);
    await r.getByRole('textbox', { name: 'Rückgabetag', exact: true }).fill(deutsch(frei));
    await r.getByRole('combobox', { name: 'Dienst am Rückgabetag' }).selectOption({ label: 'S Schulung' });
    await r.getByRole('button', { name: 'Speichern' }).click();
    await expect(r).toHaveCount(0);
    await expect(offene(page)).toHaveCount(0);
    await expect(streifen(page, frei, 'papa')).toHaveText('S');
    await expect(zelle(page, frei).locator('.sp-tausch')).toHaveText('⇄');
    await expect(zelle(page, dienst).locator('.sp-tausch')).toHaveText('⇄');
  });

  test('offen → Tausch rückgängig → Tag wie vorher (auch eigene Zeiten), Karte weg', async ({ page }) => {
    await starteDemo(page, { route: '#/schicht' });
    await zelle(page, '2026-10-08').click();
    await tagKnopf(page, 'S Schulung').click();
    const uhr = (name) => papaKarte(page).getByRole('textbox', { name, exact: true });
    await uhr('Von').fill('08:00');
    await uhr('Bis').fill('16:00');
    await uhr('Bis').press('Enter');
    await expect(papaKarte(page).locator('.sp-tag-kopf small')).toHaveText('Schulung 08:00–16:00');
    await tagKnopf(page, '⇄ Diensttausch').click();
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(papaKarte(page).locator('.sp-tag-kopf small')).toHaveText('Frei');
    await expect(offene(page)).toBeVisible();
    // „Tausch rückgängig“ fragt mit dem Text für einen Tag
    await papaKarte(page).getByRole('button', { name: 'Tausch rückgängig' }).click();
    const frage = page.getByRole('dialog', { name: 'Diensttausch rückgängig machen?' });
    await expect(frage).toContainText('Der Tag kommt genau so zurück, wie er vor dem Tausch war');
    await frage.getByRole('button', { name: 'Rückgängig machen' }).click();
    await expect(frage).toHaveCount(0);
    await expect(papaKarte(page).locator('.sp-tag-kopf small')).toHaveText('Schulung 08:00–16:00');
    await expect(papaKarte(page).locator('.sp-tag-tausch')).toHaveCount(0);
    await expect(offene(page)).toHaveCount(0);
  });

  test('auf 360 px ragen Formular, Karte und Rückgabe-Blatt nicht seitwärts hinaus; Knöpfe ≥ 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const { frei, november } = await tageSuchen(page);
    const messen = (ziel) =>
      ziel.evaluate((wurzel) => {
        const knoepfe = [...wurzel.querySelectorAll('button, input:not(.picker-unsichtbar), select')].filter((e) => e.getBoundingClientRect().width > 0);
        return {
          seite: document.documentElement.scrollWidth,
          scroll: wurzel.scrollWidth,
          breite: wurzel.clientWidth,
          rechts: Math.max(...knoepfe.map((e) => e.getBoundingClientRect().right)),
          klein: knoepfe.filter((e) => e.matches('button') && e.getBoundingClientRect().height < 43.5).map((e) => e.textContent),
        };
      });
    const passt = (m) => {
      expect(m.seite).toBeLessThanOrEqual(360);
      expect(m.scroll).toBeLessThanOrEqual(m.breite);
      expect(m.rechts).toBeLessThanOrEqual(360);
    };
    await zelle(page, frei).click();
    await tagKnopf(page, '⇄ Diensttausch').click();
    await formular(page).getByRole('textbox', { name: 'Mit wem (optional)' }).fill('x'.repeat(24));
    let m = await messen(page.locator('.blatt').last());
    passt(m);
    expect(m.klein.filter((t) => t.trim() !== '✕')).toEqual([]);
    await formular(page).getByRole('button', { name: 'Speichern' }).click();
    await expect(papaKarte(page).locator('.sp-tag-tausch')).toContainText('Rückgabe offen');
    m = await messen(page.locator('.blatt').last());
    passt(m);
    await tagBlatt(page, /\d+\. Oktober/).getByRole('button', { name: 'Schließen' }).click();
    await expect(offene(page)).toBeVisible();
    m = await messen(offene(page));
    passt(m);
    expect(m.klein).toEqual([]);
    await offene(page).getByRole('button', { name: 'Rückgabe eintragen' }).click();
    await rueckgabe(page).getByRole('textbox', { name: 'Rückgabetag', exact: true }).fill(deutsch(november));
    m = await messen(page.locator('.blatt').last());
    passt(m);
    expect(m.klein.filter((t) => t.trim() !== '✕')).toEqual([]);
  });
});
