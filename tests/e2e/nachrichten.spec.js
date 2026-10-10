// Nachrichten an die Krabbelstube bzw. den Kindergarten: Blatt mit 14 Situationen, Heute/Morgen, Angaben, änderbarem Text und
// Senden per WhatsApp, SMS, E-Mail, Teilen oder Kopieren; Wege dorthin (Heute, Meldung nach „Krank“/„Abwesend“, Mehr) und Einstellungen.
import { test, expect, starteDemo, tab, erwarteToast, WERKTAG_DATUM } from './hilfen.js';
import { seedDemo } from '../../src/app/seed.js';

const SITUATIONEN = [
  '🤒 Fühlt sich nicht wohl',
  '😴 Schlecht geschlafen',
  '🌡️ Fieber',
  '🤢 Magen-Darm',
  '🤧 Stark erkältet',
  '🦠 Ansteckende Krankheit',
  '📅 Länger krank',
  '💪 Wieder gesund',
  '🕘 Kommt später',
  '🩺 Arzttermin',
  '🏃 Früher abholen',
  '👵 Jemand anderes holt ab',
  '🏖️ Urlaub / freie Tage',
  '👪 Familiäre Gründe',
];
const KONTAKT = { einrichtungTelefon: '0664 1234567', einrichtungEmail: 'gruppe@beispiel.at' };
const STANDARD_TEXT = 'Liebes Krabbelstuben-Team,\n\nUnser Kind fühlt sich leider nicht wohl und bleibt deshalb heute zu Hause. Wir melden uns, sobald unser Kind wieder in die Krabbelstube kommen kann.\n\nLiebe Grüße\nDie Eltern';

const blatt = (page) => page.getByRole('dialog', { name: /^Nachricht an / });
const textfeld = (page) => blatt(page).getByRole('textbox', { name: 'Nachricht', exact: true });
const situation = (page, titel) => blatt(page).locator('.nachricht-gruppe .chip', { hasText: titel });
const wann = (page) => blatt(page).locator('.feld').filter({ has: page.locator('span', { hasText: /^Wann\?$/ }) });
const senden = (page) => blatt(page).locator('.nachricht-senden');
const link = (page, name) => senden(page).getByRole('link', { name });

/** Demo mit diesen Einstellungen (als wären sie in „Mehr“ schon eingetragen). */
function demoMit(settings) {
  const demo = seedDemo(WERKTAG_DATUM);
  return { 'fk.demo.v1': { ...demo, settings: { ...demo.settings, ...settings } } };
}

async function oeffneVonHeute(page) {
  await page.getByRole('button', { name: 'Krabbelstube benachrichtigen', exact: true }).click();
  await expect(blatt(page)).toBeVisible();
}

test('Heute: „📨 Krabbelstube benachrichtigen“ öffnet das Blatt mit 14 Situationen in drei Gruppen', async ({ page }) => {
  await starteDemo(page);
  const knopf = page.locator('section.abschnitt').filter({ has: page.getByRole('heading', { name: 'Heute', exact: true }) }).getByRole('button', { name: 'Krabbelstube benachrichtigen', exact: true });
  await expect(knopf).toHaveText('📨 Krabbelstube benachrichtigen'); // das Symbol ist nur Schmuck (aria-hidden)
  await knopf.click();
  await expect(page.getByRole('dialog', { name: 'Nachricht an die Krabbelstube' })).toBeVisible();
  await expect(blatt(page).locator('.blatt-kopf h2')).toHaveText('Nachricht an die Krabbelstube');
  await expect(blatt(page).locator('.nachricht-gruppe-titel')).toHaveText(['Krank', 'Bringen & Abholen', 'Sonstiges']);
  await expect(blatt(page).locator('.nachricht-gruppe .chip')).toHaveText(SITUATIONEN);
  await expect(blatt(page).locator('.nachricht-gruppe .chip.aktiv')).toHaveText('🤒 Fühlt sich nicht wohl');
  await expect(wann(page).locator('.chip')).toHaveText(['Heute', 'Morgen']);
  await expect(wann(page).locator('.chip.aktiv')).toHaveText('Heute');
  await expect(textfeld(page)).toHaveValue(STANDARD_TEXT);

  // ohne Kontakt: Hinweis und nur „Kopieren“ (Teilen gibt es nur, wo das Telefon es kann)
  await expect(blatt(page).locator('.nachricht-kontakt')).toContainText('Noch kein Kontakt der Krabbelstube eingetragen.');
  await expect(senden(page).locator('a')).toHaveCount(0);
  await expect(senden(page).getByRole('button')).toHaveText(['📋 Kopieren']);

  await wann(page).getByRole('button', { name: 'Morgen' }).click();
  await expect(wann(page).locator('.chip.aktiv')).toHaveText('Morgen');
  await expect(textfeld(page)).toHaveValue(/bleibt deshalb morgen zu Hause\./);

  // eine Situation ohne Heute/Morgen
  await situation(page, 'Schlecht geschlafen').click();
  await expect(blatt(page).locator('.nachricht-gruppe .chip.aktiv')).toHaveText('😴 Schlecht geschlafen');
  await expect(wann(page)).toHaveCount(0);
  await expect(textfeld(page)).toHaveValue(/Unser Kind hat heute Nacht leider nicht genug geschlafen/);

  await page.keyboard.press('Escape');
  await expect(blatt(page)).toHaveCount(0);
});

test('Angaben je Situation landen im Text: Uhrzeit, wer abholt, Datum, Krankheit', async ({ page }) => {
  await starteDemo(page);
  await oeffneVonHeute(page);

  await situation(page, 'Kommt später').click();
  await blatt(page).getByRole('textbox', { name: 'Kommt gegen', exact: true }).fill('09:30');
  await expect(textfeld(page)).toHaveValue(/Unser Kind kommt heute etwas später in die Krabbelstube, voraussichtlich gegen 09:30 Uhr\./);

  await situation(page, 'Jemand anderes holt ab').click();
  // die Uhrzeit bleibt beim Wechsel der Situation stehen (Feld und Text), der Name fehlt noch
  await expect(blatt(page).getByRole('textbox', { name: 'Abholen gegen (optional)', exact: true })).toHaveValue('09:30');
  await expect(textfeld(page)).toHaveValue(/Heute holt … unser Kind gegen 09:30 Uhr ab\. … kann sich bei Bedarf gern ausweisen\./);
  await blatt(page).getByRole('textbox', { name: 'Wer holt ab?' }).fill('Oma Maria');
  await blatt(page).getByRole('textbox', { name: 'Abholen gegen (optional)', exact: true }).fill('14:00');
  await expect(textfeld(page)).toHaveValue(/Heute holt Oma Maria unser Kind gegen 14:00 Uhr ab\. Oma Maria kann sich bei Bedarf gern ausweisen\./);
  await wann(page).getByRole('button', { name: 'Morgen' }).click();
  await expect(textfeld(page)).toHaveValue(/Morgen holt Oma Maria unser Kind gegen 14:00 Uhr ab\./);

  // Freitag krank: zurück am nächsten Werktag (Montag)
  await situation(page, 'Länger krank').click();
  await blatt(page).getByRole('textbox', { name: 'Krank bis einschließlich', exact: true }).fill('16.10.2026');
  await expect(textfeld(page)).toHaveValue(/bleibt voraussichtlich bis einschließlich Freitag, 16\. Oktober zu Hause\. Unser Kind kommt dann am Montag, 19\. Oktober wieder\./);

  await situation(page, 'Ansteckende Krankheit').click();
  const krankheit = blatt(page).getByRole('textbox', { name: 'Welche Krankheit?' });
  await expect(textfeld(page)).toHaveValue(/Unser Kind hat leider eine ansteckende Krankheit \(ärztlich bestätigt\)/);
  await blatt(page).locator('.feld .chip', { hasText: /^Scharlach$/ }).click();
  await expect(blatt(page).locator('.feld .chip.aktiv')).toHaveText('Scharlach');
  await expect(krankheit).toHaveValue('Scharlach');
  await expect(textfeld(page)).toHaveValue(/Unser Kind hat leider Scharlach \(ärztlich bestätigt\)/);
  await krankheit.fill('die Windpocken');
  await expect(blatt(page).locator('.feld .chip.aktiv')).toHaveText('die Windpocken'); // der passende Vorschlag leuchtet mit
  await expect(textfeld(page)).toHaveValue(/Unser Kind hat leider die Windpocken/);
});

test('Kontakt in Mehr → Nachrichten: WhatsApp (wa.me mit 43 …), SMS und E-Mail tragen den Text, auch den geänderten', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await page.locator('.menue-eintrag[data-id="nachrichten"] .menue-zeile').click();
  const tafel = page.locator('#menue-nachrichten');
  const telefon = tafel.getByRole('textbox', { name: 'Telefon' });
  await telefon.fill('0664 1234567');
  await telefon.press('Enter');
  await erwarteToast(page, 'Gespeichert ✓');
  const email = tafel.getByRole('textbox', { name: 'E-Mail' });
  await email.fill('gruppe@beispiel.at');
  await email.press('Enter');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).settings.einrichtungEmail)).toBe('gruppe@beispiel.at');
  await expect(telefon).toHaveValue('0664 1234567');

  await tafel.getByRole('button', { name: 'Nachricht schreiben' }).click();
  await expect(blatt(page)).toBeVisible();
  await expect(blatt(page).locator('.nachricht-kontakt')).toHaveCount(0);
  await expect(senden(page).locator('a, button')).toHaveText(['💬 WhatsApp', '✉️ SMS', '📧 E-Mail', '📋 Kopieren']);
  await expect(link(page, 'WhatsApp')).toHaveClass(/primaer/);
  await expect(link(page, 'WhatsApp')).toHaveAttribute('target', '_blank');
  await expect(link(page, 'WhatsApp')).toHaveAttribute('rel', 'noopener');

  /** Prüft alle drei Links gegen den Text im Feld und den Betreff. */
  async function linksPassenZu(betreff) {
    const text = await textfeld(page).inputValue();
    const wa = new URL(await link(page, 'WhatsApp').getAttribute('href'));
    expect(wa.origin + wa.pathname).toBe('https://wa.me/436641234567');
    expect(wa.searchParams.get('text')).toBe(text);
    expect(await link(page, 'SMS').getAttribute('href')).toBe(`sms:06641234567?&body=${encodeURIComponent(text)}`);
    expect(await link(page, 'E-Mail').getAttribute('href')).toBe(`mailto:gruppe@beispiel.at?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`);
  }
  await expect(textfeld(page)).toHaveValue(STANDARD_TEXT);
  await linksPassenZu('Unser Kind: Fühlt sich nicht wohl');

  // den Text vor dem Senden ändern: die Links folgen sofort
  await textfeld(page).fill('Liebes Team,\n\nwir kommen heute um 10 Uhr – Zahnarzt & Co.\n\nLG');
  await linksPassenZu('Unser Kind: Fühlt sich nicht wohl');
  expect(await link(page, 'SMS').getAttribute('href')).toContain(encodeURIComponent('Zahnarzt & Co.'));

  await situation(page, 'Fieber').click();
  await expect(textfeld(page)).toHaveValue(/Unser Kind hat Fieber und bleibt heute zu Hause\./);
  await linksPassenZu('Unser Kind: Fieber');
});

test('Telefon mit Ländervorwahl und „(0)“: wa.me bekommt nur die Ziffern', async ({ page }) => {
  await starteDemo(page, { speicher: demoMit({ einrichtungTelefon: '+43 (0)664 123 45 67' }) });
  await oeffneVonHeute(page);
  expect(new URL(await link(page, 'WhatsApp').getAttribute('href')).pathname).toBe('/436641234567');
  expect(await link(page, 'SMS').getAttribute('href')).toMatch(/^sms:\+436641234567\?&body=/);
  await expect(link(page, 'E-Mail')).toHaveCount(0); // ohne E-Mail-Adresse kein E-Mail-Knopf
});

test('Mehr → Nachrichten: ungültige Angaben werden gemeldet und nicht gespeichert', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await page.locator('.menue-eintrag[data-id="nachrichten"] .menue-zeile').click();
  const tafel = page.locator('#menue-nachrichten');
  const gespeichert = () => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).settings);
  const telefon = tafel.getByRole('textbox', { name: 'Telefon' });
  await telefon.fill('0664 abc');
  await telefon.press('Enter');
  await erwarteToast(page, 'Telefon: bitte nur Ziffern, Leerzeichen und + - / ( ) verwenden.');
  await expect(telefon).toHaveAttribute('aria-invalid', 'true');
  await telefon.fill('1234567');
  await telefon.press('Enter');
  await erwarteToast(page, 'Telefon: bitte die ganze Nummer mit Vorwahl eingeben, z. B. 0664 1234567 oder +43 664 1234567.');
  const email = tafel.getByRole('textbox', { name: 'E-Mail' });
  await email.fill('gruppe@');
  await email.press('Enter');
  await erwarteToast(page, 'E-Mail: das ist keine gültige Adresse (so sieht eine aus: name@beispiel.at).');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  expect(await gespeichert()).toMatchObject({ einrichtungTelefon: '', einrichtungEmail: '' });
});

test.describe('Kopieren', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('„Kopieren“ legt den (geänderten) Text in die Zwischenablage', async ({ page }) => {
    await starteDemo(page);
    await oeffneVonHeute(page);
    await senden(page).getByRole('button', { name: 'Kopieren' }).click();
    await erwarteToast(page, 'Kopiert ✓');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(STANDARD_TEXT);

    await textfeld(page).fill('Liebes Team,\nheute etwas später.\nLG');
    await senden(page).getByRole('button', { name: 'Kopieren' }).click();
    await erwarteToast(page, 'Kopiert ✓');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Liebes Team,\nheute etwas später.\nLG');
  });
});

test('„Teilen …“ erscheint, wo das Telefon teilen kann, und übergibt den Text', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.share = async (daten) => {
      window.geteilt = daten;
    };
  });
  await starteDemo(page);
  await oeffneVonHeute(page);
  await expect(senden(page).getByRole('button')).toHaveText(['📤 Teilen …', '📋 Kopieren']);
  await textfeld(page).fill('Geteilter Text');
  await senden(page).getByRole('button', { name: 'Teilen …' }).click();
  await expect.poll(() => page.evaluate(() => window.geteilt)).toEqual({ text: 'Geteilter Text' });
});

test('nach „Krank“ bietet die Meldung „Benachrichtigen“ an: das Blatt öffnet mit „Fühlt sich nicht wohl“', async ({ page }) => {
  await starteDemo(page);
  await page.locator('.aktionen button', { hasText: 'Krank' }).click();
  const meldung = page.locator('.toast').filter({ hasText: 'Eingetragen ✓' });
  await expect(meldung.getByRole('button', { name: 'Benachrichtigen' })).toBeVisible();
  await meldung.getByRole('button', { name: 'Benachrichtigen' }).click();
  await expect(blatt(page)).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(blatt(page).locator('.nachricht-gruppe .chip.aktiv')).toHaveText('🤒 Fühlt sich nicht wohl');
  await expect(wann(page).locator('.chip.aktiv')).toHaveText('Heute');
  await expect(textfeld(page)).toHaveValue(STANDARD_TEXT);
});

test('nach „Abwesend“ öffnet „Benachrichtigen“ mit „Familiäre Gründe“; nach „Anwesend“ gibt es nichts zu melden', async ({ page }) => {
  await starteDemo(page);
  await page.locator('.aktionen button', { hasText: 'Abwesend' }).click();
  await page.locator('.toast').getByRole('button', { name: 'Benachrichtigen' }).click();
  await expect(blatt(page).locator('.nachricht-gruppe .chip.aktiv')).toHaveText('👪 Familiäre Gründe');
  await expect(textfeld(page)).toHaveValue(/Unser Kind bleibt heute aus familiären Gründen zu Hause\./);
  await page.keyboard.press('Escape');

  // derselbe Tag noch einmal, diesmal „Anwesend“: die Meldung kommt ohne „Benachrichtigen“
  await page.getByRole('button', { name: 'Ändern' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eintrag löschen' }).click();
  await erwarteToast(page, 'Eintrag gelöscht');
  await page.keyboard.press('Escape');
  await page.locator('.aktionen button', { hasText: /Anwesend\s*mit Mittagessen/ }).click();
  await erwarteToast(page, 'Eingetragen ✓');
  await expect(page.locator('.toast').getByRole('button')).toHaveCount(0);
});

test('Name, „Das Kind ist“, Grußformel und Unterschrift aus Mehr stehen in der Nachricht', async ({ page }) => {
  await starteDemo(page, { route: '#/mehr' });
  await page.locator('.menue-eintrag[data-id="familie"] .menue-zeile').click();
  const familie = page.locator('#menue-familie');
  await familie.getByRole('textbox', { name: 'Name des Kindes' }).fill('Iris');
  await familie.getByRole('textbox', { name: 'Name des Kindes' }).blur();
  await erwarteToast(page, 'Gespeichert ✓');
  const geschlecht = familie.locator('.feld').filter({ hasText: 'Das Kind ist' });
  await expect(geschlecht.locator('.chip')).toHaveText(['👧 Mädchen', '👦 Junge', 'Keine Angabe']);
  await expect(geschlecht.locator('.chip.aktiv')).toHaveText('Keine Angabe');
  await expect(geschlecht).toContainText('Für „sie“ bzw. „er“ in den Nachrichten an die Krabbelstube.');
  await geschlecht.getByRole('button', { name: '👧 Mädchen' }).click();
  await expect(page.locator('#menue-familie .feld').filter({ hasText: 'Das Kind ist' }).locator('.chip.aktiv')).toHaveText('👧 Mädchen');

  await page.locator('.menue-eintrag[data-id="nachrichten"] .menue-zeile').click();
  const nachrichten = page.locator('#menue-nachrichten');
  await expect(nachrichten.locator('.chip.aktiv')).toHaveText('Liebe Grüße');
  await nachrichten.getByRole('button', { name: 'Viele Grüße' }).click();
  await expect(page.locator('#menue-nachrichten .chip.aktiv')).toHaveText('Viele Grüße');
  const unterschrift = page.locator('#menue-nachrichten').getByRole('textbox', { name: 'Unterschrift' });
  await expect(unterschrift).toHaveAttribute('placeholder', 'Die Eltern von Iris');
  await unterschrift.fill('Anna und Tom');
  await unterschrift.press('Enter');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fk.demo.v1')).settings.nachrichtUnterschrift)).toBe('Anna und Tom');

  await page.locator('#menue-nachrichten').getByRole('button', { name: 'Nachricht schreiben' }).click();
  await expect(textfeld(page)).toHaveValue(
    'Liebes Krabbelstuben-Team,\n\nIris fühlt sich leider nicht wohl und bleibt deshalb heute zu Hause. Wir melden uns, sobald sie wieder in die Krabbelstube kommen kann.\n\nViele Grüße\nAnna und Tom',
  );
  await page.keyboard.press('Escape');
  await expect(blatt(page)).toHaveCount(0);
  await page.locator('.menue-eintrag[data-id="familie"] .menue-zeile').click();
  await page.locator('#menue-familie').getByRole('button', { name: '👦 Junge' }).click();
  await expect(page.locator('#menue-familie .chip.aktiv')).toHaveText('👦 Junge');
  await tab(page, 'Heute');
  await oeffneVonHeute(page);
  await expect(textfeld(page)).toHaveValue(/Wir melden uns, sobald er wieder in die Krabbelstube kommen kann\./);
});

test('ohne Kontakt führt „Kontakt eintragen“ zu Mehr, die Zeile „Nachrichten“ ist aufgeklappt', async ({ page }) => {
  await starteDemo(page);
  await oeffneVonHeute(page);
  await blatt(page).getByRole('button', { name: 'Kontakt eintragen' }).click();
  await expect(blatt(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/mehr$/);
  await expect(page.locator('#menue-nachrichten')).toBeVisible();
  await expect(page.locator('.menue-eintrag[data-id="nachrichten"] .menue-zeile')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#menue-nachrichten').getByRole('textbox', { name: 'Telefon' })).toBeVisible();
});

test('im Kindergarten heißt es „an den Kindergarten“; am Tag vor dem Wechsel schon für „Morgen“', async ({ page }) => {
  await starteDemo(page, { speicher: demoMit({ wechseldatum: '2026-10-15' }) });
  await expect(page.locator('.kopf .pille')).toHaveText('Krabbelstube');
  await oeffneVonHeute(page);
  await expect(blatt(page)).toHaveAccessibleName('Nachricht an die Krabbelstube');
  await wann(page).getByRole('button', { name: 'Morgen' }).click();
  await expect(blatt(page)).toHaveAccessibleName('Nachricht an den Kindergarten');
  await expect(blatt(page).locator('.blatt-kopf h2')).toHaveText('Nachricht an den Kindergarten');
  await expect(textfeld(page)).toHaveValue(/^Liebes Kindergarten-Team,\n\nUnser Kind fühlt sich leider nicht wohl und bleibt deshalb morgen zu Hause\. Wir melden uns, sobald unser Kind wieder in den Kindergarten kommen kann\./);
  await page.keyboard.press('Escape');

  await page.clock.setFixedTime(new Date('2026-10-15T08:00:00+02:00'));
  await page.reload();
  await expect(page.locator('.kopf .pille')).toHaveText('Kindergarten');
  await page.getByRole('button', { name: 'Kindergarten benachrichtigen', exact: true }).click();
  await expect(blatt(page)).toHaveAccessibleName('Nachricht an den Kindergarten');
});
