// Datenschutzseite (M9, Abschluss-Review 1.3.0): nennt auch die neueren Datenarten und wo sie liegen – ohne persönliche Daten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../datenschutz.html', import.meta.url), 'utf8');
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('datenschutz.html nennt Schichtplan, Fixkosten, Sparziele und Fahrzeugdaten – versteckt im eigenen Kalender, Offline-Kopie, Sicherung', () => {
  for (const wort of ['Schichtplan', 'Fixkosten', 'Sparziele', 'Fahrzeugdaten', 'Kennzeichen', 'FIN', 'versteckt', 'Offline-Kopie', 'Sicherung']) assert.ok(text.includes(wort), wort);
  assert.match(text, /Stand: November 2026/);
  assert.doesNotMatch(text, /W-\d{3,}|[A-HJ-NPR-Z0-9]{17}/, 'keine Kennzeichen oder FIN');
});

test('datenschutz.html (1.4.0): die Rechnungen der Privatarzt-Versicherung sind Gesundheitsangaben und liegen nur versteckt im eigenen Kalender, offline und in der Sicherung', () => {
  assert.match(text, /Versicherung/);
  const satz = text.slice(text.indexOf('Gesundheitsangaben'));
  assert.ok(text.includes('Gesundheitsangaben'), 'Gesundheitsangaben');
  for (const wort of ['Beträge', 'Kategorien', 'Arzt oder Apotheke', 'Notiz', 'versteckt im eigenen Kalender', 'Offline-Kopie', 'Sicherung']) assert.ok(satz.includes(wort), wort);
  assert.match(text, /keine Polizzennummer/);
});
