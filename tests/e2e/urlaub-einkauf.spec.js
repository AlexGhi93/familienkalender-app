// „Urlaub“ (Stand, Jahreswahl, planen, löschen) und „Einkauf“ (eintragen mit Menge, abhaken, löschen, Gekaufte entfernen).
// Das Aktualisieren der Einkaufsliste (Herunterziehen, 30-Sekunden-Abgleich) steht in einkauf-aktuell.spec.js.
import { test, expect, starteDemo, tab, erwarteToast } from './hilfen.js';

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
    await erwarteToast(page, 'Urlaub gelöscht');
    await expect(page.locator('.liste .zeile')).toHaveCount(2);
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
});

test.describe('Einkauf', () => {
  const zeile = (page, name) => page.locator('.ek-zeile').filter({ has: page.locator('.ek-name', { hasText: new RegExp(`^${name}$`) }) });

  test('Artikel mit Menge eintragen, abhaken, wieder öffnen, löschen mit Rückgängig', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf' });
    await expect(page.locator('p.datum')).toHaveText('3 Artikel offen');
    await page.getByRole('textbox', { name: 'Artikel' }).fill('Kaffee');
    await page.getByRole('textbox', { name: 'Menge (optional)' }).fill('500 g');
    await page.getByRole('button', { name: 'Zur Liste hinzufügen' }).click();
    await expect(page.getByRole('heading', { name: 'Zu kaufen · 4' })).toBeVisible();
    const kaffee = zeile(page, 'Kaffee');
    await expect(kaffee.locator('small')).toHaveText('500 g');
    await expect(page.getByRole('textbox', { name: 'Artikel' })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Artikel' })).toBeFocused();

    await kaffee.getByRole('checkbox').click();
    await expect(kaffee).toHaveClass(/gekauft/);
    await expect(kaffee.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('heading', { name: 'Im Wagen · 2' })).toBeVisible();
    await kaffee.getByRole('checkbox').click();
    await expect(kaffee).toHaveClass(/offen/);

    await page.getByRole('button', { name: 'Kaffee löschen' }).click();
    await erwarteToast(page, '„Kaffee“ gelöscht');
    await expect(kaffee).toHaveCount(0);
    await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
    await expect(zeile(page, 'Kaffee').locator('small')).toHaveText('500 g');
  });

  test('Enter trägt ein; derselbe Name steht nur einmal da; leere Eingabe wird gemeldet', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf' });
    const artikel = page.getByRole('textbox', { name: 'Artikel' });
    await artikel.fill('milch');
    await page.getByRole('textbox', { name: 'Menge (optional)' }).fill('3 L');
    await page.getByRole('textbox', { name: 'Menge (optional)' }).press('Enter');
    await expect(page.locator('.ek-zeile')).toHaveCount(4);
    await expect(zeile(page, 'Milch').locator('small')).toHaveText('3 L');
    await artikel.press('Enter');
    await erwarteToast(page, 'Bitte einen Artikel eingeben.');
  });

  test('„Oft gekauft“ und „Gekaufte entfernen“ mit Rückgängig', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf' });
    const oft = page.locator('.ek-oft .chip');
    await expect(oft).toHaveText(['＋ Joghurt', '＋ Äpfel', '＋ Eier']);
    await oft.filter({ hasText: 'Joghurt' }).click();
    await expect(zeile(page, 'Joghurt')).toBeVisible();
    await expect(oft).toHaveText(['＋ Äpfel', '＋ Eier']);
    await page.getByRole('button', { name: 'Gekaufte entfernen' }).click();
    await erwarteToast(page, '1 Artikel entfernt ✓');
    await expect(zeile(page, 'Brot')).toHaveCount(0);
    await expect(oft).toContainText(['＋ Brot']);
    await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
    await expect(zeile(page, 'Brot')).toBeVisible();
  });

  test('Registerkarte ohne „Zurück“; die Karte auf Heute zählt mit', async ({ page }) => {
    await starteDemo(page, { route: '#/einkauf' });
    await expect(page.locator('nav.tabs a[aria-current="page"]')).toHaveText(/Einkauf/);
    await expect(page.getByRole('button', { name: '‹ Zurück' })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Artikel' }).fill('Butter');
    await page.getByRole('button', { name: 'Zur Liste hinzufügen' }).click();
    await expect(zeile(page, 'Butter')).toBeVisible();
    await tab(page, 'Heute');
    await expect(page).toHaveURL(/#\/heute$/);
    await expect(page.getByRole('heading', { name: '🛒 Einkauf · 4' })).toBeVisible();
    await expect(page.locator('.einkauf-karte .chip')).toHaveText(['Milch (2 L)', 'Windeln', 'Nudeln (500 g)', 'Butter']);
  });
});
