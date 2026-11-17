// „Urlaub“ (Stand, Jahreswahl, planen, löschen).
import { test, expect, starteDemo, erwarteToast } from './hilfen.js';

test.describe('Urlaub', () => {
  test('Stand im Kindergartenjahr mit Ring und Zeiträumen', async ({ page }) => {
    await starteDemo(page, { route: '#/urlaub' });
    await expect(page.getByRole('heading', { name: 'Urlaub 🏖️' })).toBeVisible();
    await expect(page.locator('.jahr-titel')).toContainText('Kindergartenjahr 2026/27');
    await expect(page.locator('.jahr-titel small')).toHaveText('aktuelles Jahr');
    await expect(page.locator('.gross-ring svg.ring')).toHaveAttribute('aria-label', '15 von 25 Urlaubstagen');
    await expect(page.locator('.ring-text')).toContainText('Noch 2 Wochen offen');
    await expect(page.locator('.ring-text')).toContainText('Genommen: 1 Woche');
    await expect(page.locator('.ring-text')).toContainText('✅ 2 Wochen am Stück');
    await expect(page.getByRole('heading', { name: 'Eingetragen in 2026/27' })).toBeVisible();
    await expect(page.locator('.liste .zeile b')).toHaveText(['Mo 21. Sep. – Fr 25. Sep.', 'Mo 2. Nov. – Fr 13. Nov.']);
    await expect(page.locator('.liste .zeile small')).toHaveText(['5 Urlaubstage · vorbei', '10 Urlaubstage · geplant']);
  });

  test('Jahr wechseln und zurück zum aktuellen', async ({ page }) => {
    await starteDemo(page, { route: '#/urlaub' });
    await page.getByRole('button', { name: 'Vorheriges Kindergartenjahr' }).click();
    await expect(page.locator('.jahr-titel b')).toHaveText('Kindergartenjahr 2025/26');
    await expect(page.getByText('In diesem Jahr ist noch kein Urlaub eingetragen.')).toBeVisible();
    await page.getByRole('button', { name: 'Zurück zum aktuellen Jahr' }).click();
    await expect(page.locator('.jahr-titel b')).toHaveText('Kindergartenjahr 2026/27');
    for (let i = 0; i < 6; i += 1) await page.getByRole('button', { name: 'Nächstes Kindergartenjahr' }).click();
    await expect(page.getByRole('button', { name: 'Nächstes Kindergartenjahr' })).toBeDisabled();
  });

  test('Urlaub planen: Vorschau, speichern, löschen', async ({ page }) => {
    await starteDemo(page, { route: '#/urlaub' });
    await page.getByRole('button', { name: 'Urlaub planen' }).click();
    await expect(page.locator('.formular .karte-text b')).toHaveText('Urlaub');
    await page.getByRole('textbox', { name: 'Von', exact: true }).fill('21.12.2026');
    await page.getByRole('textbox', { name: 'Bis', exact: true }).fill('08.01.2027');
    await expect(page.locator('.formular .info p')).toHaveText(['12 Urlaubstage (ohne Wochenenden und Feiertage).', 'Danach: noch 0 Tage offen (Kindergartenjahr 2026/27).', '✅ Zwei Wochen am Stück erfüllt.']);
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await erwarteToast(page, 'Urlaub gespeichert ✓');
    await expect(page).toHaveURL(/#\/urlaub$/);
    await expect(page.locator('.ring-text b')).toHaveText('Alles eingetragen 🎉');
    await expect(page.locator('.liste .zeile')).toHaveCount(3);

    const zeile = page.locator('.liste .zeile').filter({ hasText: '21. Dez.' });
    await zeile.getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('dialog', { name: 'Urlaub löschen?' }).getByRole('button', { name: 'Urlaub löschen' }).click();
    await erwarteToast(page, 'Gelöscht ✓');
    await expect(page.locator('.liste .zeile')).toHaveCount(2);
  });

  test('Urlaub löschen: „Gelöscht ✓ · Rückgängig“ bringt den Zeitraum zurück (bleibt nach dem Neuladen)', async ({ page }) => {
    await starteDemo(page, { route: '#/urlaub' });
    const zeile = page.locator('.liste .zeile').filter({ hasText: '2. Nov.' });
    await zeile.getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('dialog', { name: 'Urlaub löschen?' }).getByRole('button', { name: 'Urlaub löschen' }).click();
    const meldung = page.locator('.toast').filter({ hasText: 'Gelöscht ✓' });
    await expect(meldung.getByRole('button', { name: 'Rückgängig' })).toBeVisible();
    await expect(page.locator('.liste .zeile')).toHaveCount(1);
    await meldung.getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Wiederhergestellt ✓');
    await expect(page.locator('.liste .zeile b')).toHaveText(['Mo 21. Sep. – Fr 25. Sep.', 'Mo 2. Nov. – Fr 13. Nov.']);
    await page.reload();
    await expect(page.locator('.liste .zeile b')).toHaveText(['Mo 21. Sep. – Fr 25. Sep.', 'Mo 2. Nov. – Fr 13. Nov.']);
  });

  test('„Bis“ vor „Von“ wird abgefangen', async ({ page }) => {
    await starteDemo(page, { route: '#/urlaub' });
    await page.getByRole('button', { name: 'Urlaub planen' }).click();
    await page.getByRole('textbox', { name: 'Von', exact: true }).fill('21.12.2026');
    await page.getByRole('textbox', { name: 'Bis', exact: true }).fill('20.12.2026');
    await expect(page.locator('.formular .info')).toHaveText('„Bis“ liegt vor „Von“.');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await erwarteToast(page, 'Bitte den Zeitraum prüfen.');
  });

  test('Urlaub bearbeiten auf der Urlaub-Seite', async ({ page }) => {
    await starteDemo(page, { route: '#/urlaub' });
    const zeile = page.locator('.liste .zeile').filter({ hasText: '2. Nov.' });
    await zeile.getByRole('button', { name: 'Bearbeiten' }).click();
    await expect(page.locator('.formular .karte-text b')).toHaveText('Urlaub bearbeiten');
    await expect(page.getByRole('textbox', { name: 'Von', exact: true })).toHaveValue('02.11.2026');
    await expect(page.getByRole('textbox', { name: 'Bis', exact: true })).toHaveValue('13.11.2026');
    await page.getByRole('textbox', { name: 'Bis', exact: true }).fill('11.11.2026');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await erwarteToast(page, 'Urlaub geändert ✓');
    await expect(page).toHaveURL(/#\/urlaub$/);
    await expect(page.locator('.liste .zeile')).toHaveCount(2);
    await expect(page.locator('.liste .zeile b')).toHaveText(['Mo 21. Sep. – Fr 25. Sep.', 'Mo 2. Nov. – Mi 11. Nov.']);
    await page.reload();
    await expect(page.locator('.liste .zeile b')).toHaveText(['Mo 21. Sep. – Fr 25. Sep.', 'Mo 2. Nov. – Mi 11. Nov.']);
  });

  test('Urlaub bearbeiten im Tagesblatt', async ({ page }) => {
    await starteDemo(page, { route: '#/monat' });
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await page.locator('.raster').getByRole('button', { name: 'Mittwoch, 4. November', exact: false }).click();
    const tag = page.getByRole('dialog', { name: 'Mittwoch, 4. November' });
    await tag.getByRole('button', { name: 'Bearbeiten' }).click();
    await expect(page.locator('.formular .karte-text b')).toHaveText('Urlaub bearbeiten');
    await expect(page.getByRole('textbox', { name: 'Von', exact: true })).toHaveValue('02.11.2026');
    await page.getByRole('textbox', { name: 'Bis', exact: true }).fill('12.11.2026');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await erwarteToast(page, 'Urlaub geändert ✓');
    await expect(page.locator('.liste .zeile b')).toHaveText(['Mo 21. Sep. – Fr 25. Sep.', 'Mo 2. Nov. – Do 12. Nov.']);
  });

  test('Rückgängig nach dem Bearbeiten', async ({ page }) => {
    await starteDemo(page, { route: '#/urlaub' });
    const zeile = page.locator('.liste .zeile').filter({ hasText: '2. Nov.' });
    await zeile.getByRole('button', { name: 'Bearbeiten' }).click();
    await page.getByRole('textbox', { name: 'Bis', exact: true }).fill('11.11.2026');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    const meldung = page.locator('.toast').filter({ hasText: 'Urlaub geändert ✓' });
    await meldung.getByRole('button', { name: 'Rückgängig' }).click();
    await erwarteToast(page, 'Rückgängig gemacht');
    await expect(page.locator('.liste .zeile b')).toHaveText(['Mo 21. Sep. – Fr 25. Sep.', 'Mo 2. Nov. – Fr 13. Nov.']);
  });
});
