// „Einkauf“ (eintragen mit Menge, abhaken, löschen, Gekaufte entfernen).
// Das Aktualisieren der Einkaufsliste (Herunterziehen, 30-Sekunden-Abgleich) steht in einkauf-aktuell.spec.js.
import { test, expect, starteDemo, tab, erwarteToast } from './hilfen.js';

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
