// Termine aus dem Formular: prüfen, Entwurf, Richtung, Rohdaten und Live-Vorschau (Länge für die Benachrichtigung).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BETRAG, MAX_MITNEHMEN, MAX_NOTIZ, MAX_TITEL, betragAusText, mitRichtung, normalisiereTermin, terminAusEntwurf, terminEntwurf, terminVorschau } from '../../src/app/termin.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { titleLength } from '../../src/domain/titles.js';
import { zustand } from './hilfen.js';

const settings = normalizeSettings();
const heute = '2026-10-14'; // Mittwoch
const arzt = { typ: 'arzt', subtyp: 'kinderarzt', date: heute, time: '09:00', mitnehmen: ['e-card'], kosten: null };
const familie = { typ: 'familie', label: 'Finanzamt', date: heute, time: '', mitnehmen: [], kosten: null };
const sache = { typ: 'kita_sache', richtung: 'hin', date: heute, time: '07:30', mitnehmen: ['Pyjamas'] };

describe('betragAusText', () => {
  test('Komma, Punkt, Euro-Zeichen, leer', () => {
    assert.equal(betragAusText('12,50'), 12.5);
    assert.equal(betragAusText('12.5'), 12.5);
    assert.equal(betragAusText(' 15 € '), 15);
    assert.equal(betragAusText(String(MAX_BETRAG)), MAX_BETRAG);
    assert.equal(betragAusText(''), null);
    assert.equal(betragAusText(undefined), null);
  });

  test('Unsinn, negativ, zu viele Nachkommastellen, zu groß → NaN', () => {
    for (const t of ['abc', '-5', '12,505', '1.234,50', String(MAX_BETRAG + 1)]) assert.ok(Number.isNaN(betragAusText(t)), t);
  });
});

describe('normalisiereTermin', () => {
  test('Arzttermin: Pflichtfelder und Ergebnisform', () => {
    assert.deepEqual(normalisiereTermin({ ...arzt, fuer: 'kind', notiz: ' Impfung  besprechen ' }), { typ: 'arzt', date: heute, time: '09:00', mitnehmen: ['e-card'], kosten: null, fuer: 'kind', notiz: 'Impfung  besprechen', subtyp: 'kinderarzt' });
    assert.throws(() => normalisiereTermin({ ...arzt, subtyp: 'tierarzt' }), /Art des Arzttermins/);
    assert.throws(() => normalisiereTermin({ ...arzt, time: '' }), /Uhrzeit angeben/);
  });

  test('Termin: Titel bereinigt, Länge begrenzt, Symbol aus der Liste', () => {
    assert.deepEqual(normalisiereTermin({ ...familie, label: '  Oma  ·  Opa ', symbol: '🏛️' }), { typ: 'familie', date: heute, time: null, mitnehmen: [], kosten: null, label: 'Oma - Opa', symbol: '🏛️' });
    assert.throws(() => normalisiereTermin({ ...familie, label: '  ' }), /Titel eingeben/);
    assert.throws(() => normalisiereTermin({ ...familie, label: 'x'.repeat(MAX_TITEL + 1) }), /Titel ist zu lang/);
    assert.throws(() => normalisiereTermin({ ...familie, symbol: '🦄' }), /Symbol aus der Liste/);
    assert.equal('symbol' in normalisiereTermin({ ...familie, symbol: '' }), false);
  });

  test('gemeinsame Prüfungen', () => {
    assert.throws(() => normalisiereTermin(null), /Unbekannte Art/);
    assert.throws(() => normalisiereTermin({ ...arzt, typ: 'urlaub' }), /Unbekannte Art/);
    assert.throws(() => normalisiereTermin({ ...arzt, date: '2026-02-30' }), /gültiges Datum/);
    assert.throws(() => normalisiereTermin({ ...arzt, time: '9:00' }), /Uhrzeit ist ungültig/);
    assert.throws(() => normalisiereTermin({ ...arzt, date: '2026-03-29', time: '02:30' }), /Zeitumstellung/);
    assert.throws(() => normalisiereTermin({ ...arzt, fuer: 'oma' }), /Für wen/);
    assert.throws(() => normalisiereTermin({ ...arzt, notiz: 'x'.repeat(MAX_NOTIZ + 1) }), /Notiz ist zu lang/);
    assert.throws(() => normalisiereTermin({ ...arzt, notiz: 42 }), /Notiz ist ungültig/);
    assert.throws(() => normalisiereTermin({ ...arzt, kosten: { betrag: Number.NaN } }), /Betrag ist ungültig/);
    assert.throws(() => normalisiereTermin({ ...arzt, kosten: { betrag: -1 } }), /Betrag ist ungültig/);
    assert.throws(() => normalisiereTermin({ ...arzt, mitnehmen: 'e-card' }), /Mitnehmen ist ungültig/);
    assert.throws(() => normalisiereTermin({ ...arzt, mitnehmen: ['x'.repeat(31)] }), /zu lang/);
    assert.throws(() => normalisiereTermin({ ...arzt, mitnehmen: Array.from({ length: MAX_MITNEHMEN + 1 }, (_, i) => `D${i}`) }), /Höchstens 8/);
  });

  test('„Alle“, leere Notiz und Doppeltes werden nicht gespeichert', () => {
    const t = normalisiereTermin({ ...arzt, fuer: 'alle', notiz: '  ', mitnehmen: ['e-card', 'e-card', ' ', 'a, b', 'x · y'], kosten: { betrag: 12.3456 } });
    assert.equal('fuer' in t, false);
    assert.equal('notiz' in t, false);
    assert.deepEqual(t.mitnehmen, ['e-card', 'a b', 'x - y']);
    assert.deepEqual(t.kosten, { betrag: 12.35 });
    assert.deepEqual(normalisiereTermin({ ...arzt, kosten: { kostenlos: true, betrag: 5 } }).kosten, { kostenlos: true });
  });

  test('Sachen: Richtung, Uhrzeit, mindestens eine Sache, gültige Serie; keine Kosten', () => {
    assert.deepEqual(normalisiereTermin({ ...sache, serie: 'u0123456789a', kosten: { betrag: 5 } }), { typ: 'kita_sache', richtung: 'hin', date: heute, time: '07:30', mitnehmen: ['Pyjamas'], kosten: null, serie: 'u0123456789a' });
    assert.throws(() => normalisiereTermin({ ...sache, richtung: 'weg' }), /Richtung wählen/);
    assert.throws(() => normalisiereTermin({ ...sache, time: '' }), /Uhrzeit angeben/);
    assert.throws(() => normalisiereTermin({ ...sache, mitnehmen: [] }), /mindestens eine Sache/);
    assert.throws(() => normalisiereTermin({ ...sache, serie: 'SERIE!' }), /Serie ist ungültig/);
  });
});

describe('terminEntwurf', () => {
  test('neuer Arzttermin: für das Kind, 09:00, Mitnehmen aus den Einstellungen (als Kopie)', () => {
    const e = terminEntwurf('arzt', { settings, heute });
    assert.deepEqual(e, { auswahl: 'arzt', bearbeiten: null, subtyp: 'kinderarzt', label: '', fuer: 'kind', notiz: '', symbol: '📌', date: heute, time: '09:00', mitnehmen: ['e-card', 'MuKi-Pass', 'Impfpass'], kosten: { art: 'keine', text: '' } });
    e.mitnehmen.push('x');
    assert.deepEqual(terminEntwurf('arzt', { settings, heute }).mitnehmen, ['e-card', 'MuKi-Pass', 'Impfpass']);
    const eigen = normalizeSettings({ mitnehmen: { kinderarzt: ['Trinkflasche'] } });
    assert.deepEqual(terminEntwurf('arzt', { settings: eigen, heute }).mitnehmen, ['Trinkflasche']);
  });

  test('neuer Termin: für alle, ohne Uhrzeit, erstes Symbol', () => {
    const e = terminEntwurf('familie', { settings, heute });
    assert.deepEqual([e.fuer, e.time, e.symbol, e.mitnehmen], ['alle', '', '📌', []]);
  });

  test('neue Sachen: nächster Betreuungstag, Bringzeit', () => {
    const state = zustand({ urlaub: [{ id: 'u', start: '2026-10-15', end: '2026-10-16' }] });
    const e = terminEntwurf('kita_sache', { settings, heute, state });
    assert.equal(e.date, '2026-10-19'); // Do/Fr Urlaub, dann Wochenende
    assert.deepEqual([e.richtung, e.time, e.zeitGeaendert, e.wiederholen], ['hin', '07:30', false, { art: 'einmalig', wochen: 8 }]);
    assert.equal(terminEntwurf('kita_sache', { settings, heute }).date, '2026-10-15');
    const ohneTage = zustand({ settings: { erwartung: [] } });
    assert.equal(terminEntwurf('kita_sache', { settings: ohneTage.settings, heute, state: ohneTage }).date, '2026-10-15');
  });

  test('vorhandenen Termin bearbeiten: Kosten als Text mit Komma', () => {
    const t = { id: 't1', typ: 'arzt', subtyp: 'ekp', fuer: 'mama', notiz: 'Notiz', date: heute, time: '08:00', mitnehmen: ['e-card'], kosten: { betrag: 12.5 } };
    const e = terminEntwurf(null, { settings, heute, termin: t });
    assert.deepEqual([e.auswahl, e.bearbeiten, e.subtyp, e.fuer, e.notiz, e.kosten], ['arzt', 't1', 'ekp', 'mama', 'Notiz', { art: 'betrag', text: '12,5' }]);
    assert.deepEqual(terminEntwurf(null, { settings, heute, termin: { ...t, kosten: { kostenlos: true } } }).kosten, { art: 'kostenlos', text: '' });
    assert.deepEqual(terminEntwurf(null, { settings, heute, termin: { ...t, kosten: null, fuer: undefined } }).fuer, 'alle');
    const s = terminEntwurf(null, { settings, heute, termin: { id: 's1', typ: 'kita_sache', richtung: 'heim', serie: 'abcde', date: heute, time: '15:30', mitnehmen: ['Pyjamas'], kosten: null } });
    assert.deepEqual([s.richtung, s.serie, s.zeitGeaendert], ['heim', 'abcde', true]);
  });
});

describe('mitRichtung / terminAusEntwurf', () => {
  test('die Uhrzeit folgt der Richtung, solange sie nicht von Hand geändert wurde', () => {
    const e = terminEntwurf('kita_sache', { settings, heute });
    assert.equal(mitRichtung(e, 'heim', settings).time, '15:30');
    assert.equal(mitRichtung({ ...e, zeitGeaendert: true, time: '12:00' }, 'heim', settings).time, '12:00');
  });

  test('Rohdaten aus dem Entwurf', () => {
    const e = { ...terminEntwurf('familie', { settings, heute }), label: 'Friseur', kosten: { art: 'betrag', text: '20' } };
    assert.deepEqual(terminAusEntwurf(e), { typ: 'familie', date: heute, time: '', mitnehmen: [], kosten: { betrag: 20 }, fuer: 'alle', notiz: '', symbol: '📌', label: 'Friseur' });
    assert.throws(() => terminAusEntwurf({ ...e, kosten: { art: 'betrag', text: '' } }), /Betrag eingeben/);
    assert.deepEqual(terminAusEntwurf({ ...e, kosten: { art: 'kostenlos', text: '' } }).kosten, { kostenlos: true });
    const s = { ...terminEntwurf('kita_sache', { settings, heute }), mitnehmen: ['Socken'], serie: 'abcde' };
    assert.deepEqual(terminAusEntwurf(s), { typ: 'kita_sache', richtung: 'hin', date: '2026-10-15', time: '07:30', mitnehmen: ['Socken'], kosten: null, serie: 'abcde' });
  });
});

describe('terminVorschau', () => {
  test('so steht der Arzttermin im Kalender: 57 von 60 Zeichen', () => {
    const v = terminVorschau(terminEntwurf('arzt', { settings, heute }));
    assert.deepEqual(v, { ok: true, titel: '🩺 Kinderarzt (Kind) 09:00 · 🎒 e-card, MuKi-Pass, Impfpass', laenge: 57, limit: 60, zuLang: false });
  });

  test('Mutter-Kind-Pass', () => {
    const e = { ...terminEntwurf('arzt', { settings, heute }), subtyp: 'ekp', mitnehmen: ['e-card', 'MuKi-Pass'] };
    assert.equal(terminVorschau(e).titel, '📒 Mutter-Kind-Pass (Kind) 09:00 · 🎒 e-card, MuKi-Pass');
  });

  test('mit dem Namen des Kindes aus den Einstellungen', () => {
    const mitName = normalizeSettings({ kindname: 'Iris' });
    assert.equal(terminVorschau(terminEntwurf('arzt', { settings: mitName, heute }), mitName).titel, '🩺 Kinderarzt (Iris) 09:00 · 🎒 e-card, MuKi-Pass, Impfpass');
  });

  test('zu lang für die Benachrichtigung', () => {
    const e = { ...terminEntwurf('familie', { settings, heute }), label: 'Elternabend Kindergarten', time: '19:30', mitnehmen: ['Kalender', 'Unterschriebene Formulare', 'Kuchen'], kosten: { art: 'betrag', text: '12,50' } };
    const v = terminVorschau(e);
    assert.equal(v.ok, true);
    assert.equal(v.zuLang, true);
    assert.equal(v.laenge, titleLength(v.titel));
    assert.ok(v.laenge > v.limit);
  });

  test('ungültige Eingaben ergeben die Meldung statt einer Vorschau', () => {
    assert.deepEqual(terminVorschau(terminEntwurf('familie', { settings, heute })), { ok: false, meldung: 'Bitte einen Titel eingeben.' });
    assert.deepEqual(terminVorschau({ ...terminEntwurf('arzt', { settings, heute }), kosten: { art: 'betrag', text: 'viel' } }), { ok: false, meldung: 'Der Betrag ist ungültig.' });
  });
});
