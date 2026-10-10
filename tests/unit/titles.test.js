// Kalendertitel bauen und zurücklesen (die einzige Quelle für Mitnehmen und Kosten im Kalender), „Für wen“.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEP,
  TITLE_LIMIT,
  buildArztTitle,
  buildDayTitle,
  buildFamilieTitle,
  buildKitaSacheTitle,
  buildTerminTitle,
  buildUrlaubCheckTitle,
  isTitleTooLong,
  needsTimeResync,
  ohneKlammer,
  parseKitaSacheLabel,
  parseTerminTitle,
  titleLength,
  withTime,
} from '../../src/domain/titles.js';
import { fuerAusText, fuerAuswahl, fuerName } from '../../src/domain/fuer.js';
import { euroText, kurzDatum, werktageText, zeitAusDateTime } from '../../src/domain/format.js';
import { einrichtungFor } from '../../src/domain/modus.js';

const krabbelstube = { wechseldatum: null };
const kindergarten = { wechseldatum: '2026-09-01' };

describe('buildDayTitle', () => {
  test('alle Tagestypen', () => {
    assert.equal(buildDayTitle('kita_essen', '2026-10-14', krabbelstube), '🏫 Krabbelstube · Mittagessen');
    assert.equal(buildDayTitle('kita_ohne', '2026-10-14', krabbelstube), '🏫 Krabbelstube · ohne Essen');
    assert.equal(buildDayTitle('abwesend', '2026-10-14', krabbelstube), '🧸 Abwesend');
    assert.equal(buildDayTitle('krank', '2026-10-14', krabbelstube), '🤒 Krank');
    assert.equal(buildDayTitle('schliess', '2026-10-14', krabbelstube), '🔒 Schließtag');
    assert.equal(buildDayTitle('urlaub', '2026-10-14', krabbelstube), '✈️ Urlaub');
    assert.throws(() => buildDayTitle('arzt', '2026-10-14', krabbelstube), /Kein Tagestitel/);
  });

  test('ab dem Wechseldatum heißt es Kindergarten', () => {
    assert.equal(buildDayTitle('kita_essen', '2026-08-31', kindergarten), '🏫 Krabbelstube · Mittagessen');
    assert.equal(buildDayTitle('kita_essen', '2026-09-01', kindergarten), '🏫 Kindergarten · Mittagessen');
    assert.equal(einrichtungFor('2030-01-01', krabbelstube), 'Krabbelstube');
  });
});

describe('buildTerminTitle', () => {
  test('alle Segmente in fester Reihenfolge', () => {
    assert.equal(
      buildTerminTitle({ emoji: '🩺', label: 'Kinderarzt', fuer: 'Iris', time: '09:15', mitnehmen: ['e-card', 'MuKi-Pass'], kosten: { betrag: 12.5 } }),
      '🩺 Kinderarzt (Iris) 09:15 · 🎒 e-card, MuKi-Pass · 💶 12,50 €',
    );
    assert.equal(buildTerminTitle({ emoji: '🎈', label: 'Fest' }), '🎈 Fest');
    assert.equal(buildTerminTitle({ emoji: '🎈', label: 'Fest', kosten: { kostenlos: true } }), '🎈 Fest · 💶 kostenlos');
  });

  test('Nutzertext kann das Trennzeichen, Kommas und Klammern nicht einschleusen', () => {
    const titel = buildTerminTitle({ emoji: '🎈', label: 'Oma · Opa', fuer: 'Max (klein)', mitnehmen: ['Brot, Butter', ' ', 'Kuchen · Torte'] });
    assert.equal(titel, '🎈 Oma - Opa (Max klein) · 🎒 Brot Butter, Kuchen - Torte');
    assert.equal(titel.split(SEP).length, 2);
  });
});

describe('Bauen und Zurücklesen', () => {
  test('Arzttermin mit Für wen, Mitnehmen und Kosten', () => {
    const titel = buildArztTitle({ subtyp: 'kinderarzt', fuer: 'Kind', time: '09:15', mitnehmen: ['e-card', 'MuKi-Pass', 'Impfpass'], kosten: { kostenlos: true } });
    assert.equal(titel, '🩺 Kinderarzt (Kind) 09:15 · 🎒 e-card, MuKi-Pass, Impfpass · 💶 kostenlos');
    assert.deepEqual(parseTerminTitle(titel), { emoji: '🩺', label: 'Kinderarzt', time: '09:15', mitnehmen: ['e-card', 'MuKi-Pass', 'Impfpass'], kosten: { kostenlos: true }, fuer: 'Kind', fuerSchluessel: 'kind' });
  });

  test('Mutter-Kind-Pass (Untertyp „ekp“)', () => {
    const titel = buildArztTitle({ subtyp: 'ekp', time: '08:00', mitnehmen: ['e-card', 'MuKi-Pass'] });
    assert.equal(titel, '📒 Mutter-Kind-Pass 08:00 · 🎒 e-card, MuKi-Pass');
    assert.deepEqual(parseTerminTitle(titel), { emoji: '📒', label: 'Mutter-Kind-Pass', time: '08:00', mitnehmen: ['e-card', 'MuKi-Pass'], kosten: null });
    assert.throws(() => buildArztTitle({ subtyp: 'tierarzt', time: '08:00' }), /Unbekannter Arzt-Untertyp/);
  });

  test('Name des Kindes wird als „kind“ erkannt, unbekannte Namen bleiben in der Bezeichnung', () => {
    const titel = buildFamilieTitle({ text: 'Schwimmkurs', fuer: 'Iris', time: '16:00' });
    assert.equal(titel, '🎈 Schwimmkurs (Iris) 16:00');
    assert.deepEqual(parseTerminTitle(titel, { kindname: 'Iris' }), { emoji: '🎈', label: 'Schwimmkurs', time: '16:00', mitnehmen: [], kosten: null, fuer: 'Iris', fuerSchluessel: 'kind' });
    const fremd = parseTerminTitle('🎈 Kaffee (Oma) 15:00');
    assert.equal(fremd.label, 'Kaffee (Oma)');
    assert.equal(fremd.fuerSchluessel, undefined);
  });

  test('Termin mit eigenem Symbol, ohne Uhrzeit, mit Betrag', () => {
    const titel = buildFamilieTitle({ text: 'Finanzamt', symbol: '🏛️', fuer: 'Mama', mitnehmen: ['Ausweis'], kosten: { betrag: 15 } });
    assert.equal(titel, '🏛️ Finanzamt (Mama) · 🎒 Ausweis · 💶 15 €');
    assert.deepEqual(parseTerminTitle(titel), { emoji: '🏛️', label: 'Finanzamt', time: null, mitnehmen: ['Ausweis'], kosten: { betrag: 15 }, fuer: 'Mama', fuerSchluessel: 'mama' });
  });

  test('Titel ohne Emoji, unbekannte Segmente, unlesbare Kosten', () => {
    assert.deepEqual(parseTerminTitle('Zahnarzt 10:00'), { emoji: '', label: 'Zahnarzt', time: '10:00', mitnehmen: [], kosten: null });
    assert.deepEqual(parseTerminTitle('🎈 Fest · irgendwas · 💶 viel'), { emoji: '🎈', label: 'Fest', time: null, mitnehmen: [], kosten: null });
    assert.deepEqual(parseTerminTitle('🎈 Fest · 💶 0,5 €').kosten, { betrag: 0.5 });
    assert.deepEqual(parseTerminTitle('🎈 Fest · 🎒 a, , b ').mitnehmen, ['a', 'b']);
  });

  test('Kita-Sachen: Richtung und Einrichtung', () => {
    assert.equal(buildKitaSacheTitle({ richtung: 'hin', einrichtung: 'Krabbelstube', time: '07:30', mitnehmen: ['Pyjamas'] }), '👕 Krabbelstube hinbringen 07:30 · 🎒 Pyjamas');
    const heim = buildKitaSacheTitle({ richtung: 'heim', einrichtung: 'Kindergarten', time: '15:30', mitnehmen: ['Pyjamas', 'Hausschuhe'] });
    assert.equal(heim, '👕 Von Kindergarten heimholen 15:30 · 🎒 Pyjamas, Hausschuhe');
    assert.deepEqual(parseKitaSacheLabel(parseTerminTitle(heim).label), { richtung: 'heim', einrichtung: 'Kindergarten' });
    assert.deepEqual(parseKitaSacheLabel('Krabbelstube hinbringen'), { richtung: 'hin', einrichtung: 'Krabbelstube' });
    assert.equal(parseKitaSacheLabel('Von Krabbelstube hinbringen'), null);
    assert.equal(parseKitaSacheLabel('Kindergarten heimholen'), null);
    assert.equal(parseKitaSacheLabel('Schule hinbringen'), null);
    assert.throws(() => buildKitaSacheTitle({ richtung: 'weg', einrichtung: 'Krabbelstube', time: '07:30' }), /Unbekannte Richtung/);
  });

  test('Urlaub-Check', () => {
    assert.equal(buildUrlaubCheckTitle({ offen: 7, stand: '2026-03-01' }), '🏖️ Urlaub-Check: noch 1 Woche 2 Tage offen (Stand 01.03.)');
  });
});

describe('Hilfen rund um den Titel', () => {
  test('ohneKlammer entfernt nur eine Klammer am Ende', () => {
    assert.equal(ohneKlammer('Arzt (Mama)'), 'Arzt');
    assert.equal(ohneKlammer('Arzt (Mama) Termin'), 'Arzt (Mama) Termin');
  });

  test('Länge in sichtbaren Zeichen (Emoji = 1)', () => {
    assert.equal(titleLength('🩺 Arzt'), 6);
    assert.equal(titleLength('👁️ Augen'), 7);
    assert.equal(TITLE_LIMIT, 60);
    assert.equal(isTitleTooLong('x'.repeat(60)), false);
    assert.equal(isTitleTooLong('x'.repeat(61)), true);
    assert.equal(isTitleTooLong('🩺'.repeat(60)), false);
  });

  test('needsTimeResync / withTime', () => {
    assert.equal(needsTimeResync('🩺 Arzt 09:00', '2026-10-14T10:00:00+02:00'), true);
    assert.equal(needsTimeResync('🩺 Arzt 09:00', '2026-10-14T09:00:00+02:00'), false);
    assert.equal(needsTimeResync('🩺 Arzt', '2026-10-14T09:00:00+02:00'), false);
    assert.equal(needsTimeResync('🩺 Arzt 09:00', undefined), false);
    assert.equal(withTime('🩺 Arzt 09:00 · 🎒 e-card · 💶 12:00 €', '10:30'), '🩺 Arzt 10:30 · 🎒 e-card · 💶 12:00 €');
  });
});

describe('Für wen', () => {
  test('fuerName', () => {
    assert.equal(fuerName('kind', { kindname: ' Iris ' }), 'Iris');
    assert.equal(fuerName('kind', { kindname: '' }), 'Kind');
    assert.equal(fuerName('kind'), 'Kind');
    assert.equal(fuerName('mama'), 'Mama');
    assert.equal(fuerName('alle'), null);
    assert.equal(fuerName(null), null);
    assert.throws(() => fuerName('oma'), /Unbekannt/);
  });

  test('fuerAusText', () => {
    assert.equal(fuerAusText('Kind'), 'kind');
    assert.equal(fuerAusText('Iris', { kindname: 'Iris' }), 'kind');
    assert.equal(fuerAusText('Iris'), null);
    assert.equal(fuerAusText(' Papa '), 'papa');
    assert.equal(fuerAusText(''), null);
    assert.equal(fuerAusText(undefined), null);
  });

  test('fuerAuswahl: Kind, Mama, Papa, Alle zuletzt', () => {
    assert.deepEqual(fuerAuswahl({ kindname: 'Iris' }).map((f) => [f.id, f.label]), [['kind', 'Iris'], ['mama', 'Mama'], ['papa', 'Papa'], ['alle', 'Alle']]);
  });
});

describe('Formate', () => {
  test('werktageText', () => {
    assert.equal(werktageText(0), '0 Tage');
    assert.equal(werktageText(1), '1 Tag');
    assert.equal(werktageText(5), '1 Woche');
    assert.equal(werktageText(7), '1 Woche 2 Tage');
    assert.equal(werktageText(11), '2 Wochen 1 Tag');
    assert.equal(werktageText(25), '5 Wochen');
    assert.throws(() => werktageText(-1));
    assert.throws(() => werktageText(1.5));
  });

  test('euroText rundet auf Cent', () => {
    assert.equal(euroText(15), '15 €');
    assert.equal(euroText(12.5), '12,50 €');
    assert.equal(euroText(0.1 + 0.2), '0,30 €');
    assert.equal(euroText(0), '0 €');
    assert.throws(() => euroText(-1));
    assert.throws(() => euroText(Number.NaN));
  });

  test('kurzDatum / zeitAusDateTime', () => {
    assert.equal(kurzDatum('2026-10-01'), '01.10.');
    assert.equal(zeitAusDateTime('2026-10-08T09:15:00+02:00'), '09:15');
  });
});
