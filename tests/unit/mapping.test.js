// Google-Kalender ↔ App: Ereignisse bauen und zurücklesen (Tage, Urlaub, Termine, Sachen, versteckte Ereignisse, Uhrzeit-Korrektur).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  EINKAUF_ID,
  EINSTELLUNGEN_ID,
  ERINNERUNG_VORHER,
  FIX_IDS,
  GERAETE_ID,
  KONTO_ID,
  MAX_EINSTELLUNGEN_ZEICHEN,
  SCHICHTARTEN_ID,
  TEST_ID,
  einkaufAusEreignis,
  einkaufZuEreignis,
  einstellungenAusEreignis,
  einstellungenZuEreignis,
  endeAus,
  fixShardAusEreignis,
  fixShardId,
  fixShardZuEreignis,
  istFixId,
  ereignisZuEintrag,
  geraeteAusEreignis,
  geraeteZuEreignis,
  kontoAusEreignis,
  kontoZuEreignis,
  istSchichtId,
  schichtartenAusEreignis,
  schichtartenZuEreignis,
  schichtMonatAusEreignis,
  schichtMonatId,
  schichtMonatZuEreignis,
  tagZuEreignis,
  terminZuEreignis,
  urlaubCheckZuEreignis,
  urlaubZuEreignis,
} from '../../src/calendar/mapping.js';
import { ereignisseZuZustand } from '../../src/calendar/zustand.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { leereListe } from '../../src/domain/einkauf.js';
import { leeresKonto } from '../../src/domain/konto.js';
import { leererShard, postenArchivieren, postenSetzen, shardText } from '../../src/domain/fixkosten.js';
import { katalogText, leererMonat, monatText, setzeNotiz, setzeSchicht, standardKatalog } from '../../src/domain/schicht.js';

const settings = normalizeSettings();
const mitName = normalizeSettings({ kindname: 'Iris' });

/** Ein gebautes Ereignis so, wie Google es zurückgibt (Zeitzone im dateTime statt im Feld). */
function wieVonGoogle({ body }) {
  const zeit = (z) => (z?.dateTime ? { dateTime: `${z.dateTime}+02:00` } : z);
  return { ...body, start: zeit(body.start), end: zeit(body.end), status: 'confirmed' };
}

describe('Ereignisse bauen', () => {
  test('endeAus rechnet auf der Uhr, auch über Mitternacht', () => {
    assert.deepEqual(endeAus('2026-10-14', '09:00', 30), { date: '2026-10-14', time: '09:30' });
    assert.deepEqual(endeAus('2026-12-31', '23:45', 30), { date: '2027-01-01', time: '00:15' });
  });

  test('Tag: Ganztag mit fester ID, im richtigen Kalender, ohne Erinnerung', () => {
    const e = tagZuEreignis('krank', '2026-10-14', settings);
    assert.deepEqual([e.kalender, e.id, e.body.summary, e.body.start, e.body.end, e.body.colorId], ['abwesenheit', 'fk20261014', '🤒 Krank', { date: '2026-10-14' }, { date: '2026-10-15' }, '11']);
    assert.deepEqual(e.body.reminders, { useDefault: false, overrides: [] });
    assert.deepEqual(e.body.extendedProperties.private, { fk: '1', typ: 'krank', v: '1' });
    assert.equal(tagZuEreignis('kita_ohne', '2026-10-14', settings).kalender, 'anwesenheit');
  });

  test('Urlaub: ein Ereignis über den ganzen Zeitraum', () => {
    const e = urlaubZuEreignis({ id: 'u1abc', start: '2026-11-02', end: '2026-11-13' }, settings);
    assert.deepEqual([e.kalender, e.body.summary, e.body.start, e.body.end], ['abwesenheit', '✈️ Urlaub', { date: '2026-11-02' }, { date: '2026-11-14' }]);
  });

  test('Termin mit Uhrzeit: 30 Minuten, Wiener Zeit, 1 Tag und 1 Stunde vorher; Für wen und Notiz versteckt', () => {
    const e = terminZuEreignis({ id: 't1abc', typ: 'arzt', subtyp: 'ekp', fuer: 'kind', notiz: 'Gewicht', date: '2026-10-14', time: '09:00', mitnehmen: ['e-card', 'MuKi-Pass'], kosten: null }, mitName);
    assert.equal(e.kalender, 'termine');
    assert.equal(e.body.summary, '📒 Mutter-Kind-Pass (Iris) 09:00 · 🎒 e-card, MuKi-Pass');
    assert.deepEqual(e.body.start, { dateTime: '2026-10-14T09:00:00', timeZone: 'Europe/Vienna' });
    assert.deepEqual(e.body.end, { dateTime: '2026-10-14T09:30:00', timeZone: 'Europe/Vienna' });
    assert.deepEqual(e.body.reminders.overrides, ERINNERUNG_VORHER);
    assert.deepEqual(e.body.extendedProperties.private, { fk: '1', typ: 'arzt', v: '1', w: 'kind' });
    assert.equal(e.body.description, 'Gewicht');
  });

  test('Termin ohne Uhrzeit: ganztägig, Erinnerung am Vortag 09:00; Sachen ohne Für wen/Notiz, mit Serie', () => {
    const f = terminZuEreignis({ id: 'f1abc', typ: 'familie', label: 'Fest', date: '2026-10-14', mitnehmen: [], kosten: null }, settings);
    assert.deepEqual([f.body.start, f.body.end, f.body.reminders.overrides, f.body.extendedProperties.private.w, f.body.description], [{ date: '2026-10-14' }, { date: '2026-10-15' }, [{ method: 'popup', minutes: 900 }], 'alle', '']);
    const s = terminZuEreignis({ id: 's1abc', typ: 'kita_sache', richtung: 'hin', date: '2026-10-14', time: '07:30', mitnehmen: ['Pyjamas'], kosten: null, serie: 'serie1' }, settings);
    assert.deepEqual(s.body.extendedProperties.private, { fk: '1', typ: 'kita_sache', v: '1', s: 'serie1' });
    assert.equal('description' in s.body, false);
  });

  test('Urlaub-Check: 09:00 in „Termine“ mit fester ID', () => {
    const e = urlaubCheckZuEreignis({ date: '2027-03-01', title: '🏖️ Urlaub-Check: noch 5 Wochen offen (Stand 14.10.)' });
    assert.deepEqual([e.kalender, e.id, e.body.start.dateTime, e.body.end.dateTime], ['termine', 'fkc20270301', '2027-03-01T09:00:00', '2027-03-01T09:30:00']);
  });

  test('versteckte Ereignisse am 2000-01-01 in „Anwesenheit“', () => {
    for (const [e, id] of [[einstellungenZuEreignis(settings), EINSTELLUNGEN_ID], [einkaufZuEreignis(leereListe()), EINKAUF_ID], [kontoZuEreignis(leeresKonto()), KONTO_ID], [geraeteZuEreignis({ v: 1, fid: 'f', schluessel: 's', geraete: [] }), GERAETE_ID]]) {
      assert.deepEqual([e.kalender, e.id, e.body.start, e.body.transparency], ['anwesenheit', id, { date: '2000-01-01' }, 'transparent']);
      assert.match(e.body.summary, /\(nicht löschen\)$/);
    }
    assert.doesNotMatch(kontoZuEreignis({ v: 1, p: { papa: { '2026-09': 2071100 }, mama: {} }, x: [] }).body.summary, /\d/); // keine Beträge im Titel
  });

  test('die größten erlaubten Einstellungen passen in den Kalender', () => {
    const viel = normalizeSettings({ mitnehmen: Object.fromEntries(['kinderarzt', 'impfung', 'augenarzt', 'zahnarzt', 'ekp', 'sonstiger_arzt'].map((k) => [k, Array.from({ length: 8 }, (_, i) => `${'x'.repeat(28)}${k.slice(0, 1)}${i}`)])), sachenEigene: Array.from({ length: 20 }, (_, i) => `${'y'.repeat(28)}${i}`) });
    assert.ok(einstellungenZuEreignis(viel).body.description.length <= MAX_EINSTELLUNGEN_ZEICHEN);
  });
});

describe('ereignisZuEintrag', () => {
  test('ignoriert: abgesagt, ohne Start, Test, Geräte, Einkauf, Konto', () => {
    assert.deepEqual(ereignisZuEintrag({ id: 'x', status: 'cancelled', start: { date: '2026-10-14' } }, 'termine', settings), { art: 'ignorieren' });
    assert.deepEqual(ereignisZuEintrag({ id: 'x', summary: 'x' }, 'termine', settings), { art: 'ignorieren' });
    for (const id of [TEST_ID, GERAETE_ID, EINKAUF_ID, KONTO_ID]) assert.deepEqual(ereignisZuEintrag({ id, start: { date: '2000-01-01' } }, 'anwesenheit', settings), { art: 'ignorieren' });
  });

  test('Tage, auch mehrtägig von Hand eingetragen', () => {
    assert.deepEqual(ereignisZuEintrag(wieVonGoogle(tagZuEreignis('kita_ohne', '2026-10-14', settings)), 'anwesenheit', settings), { art: 'tag', id: 'fk20261014', typ: 'kita_ohne', tage: ['2026-10-14'], quelle: 'app' });
    assert.deepEqual(ereignisZuEintrag({ id: 'hand', summary: 'Krank', start: { date: '2026-10-14' }, end: { date: '2026-10-17' } }, 'abwesenheit', settings), { art: 'tag', id: 'hand', typ: 'krank', tage: ['2026-10-14', '2026-10-15', '2026-10-16'], quelle: 'titel' });
  });

  test('Urlaub', () => {
    assert.deepEqual(ereignisZuEintrag(wieVonGoogle(urlaubZuEreignis({ id: 'u1abc', start: '2026-11-02', end: '2026-11-13' }, settings)), 'abwesenheit', settings), { art: 'urlaub', id: 'u1abc', start: '2026-11-02', end: '2026-11-13' });
  });

  test('Urlaub-Check: nur die eigenen (feste ID)', () => {
    const e = wieVonGoogle(urlaubCheckZuEreignis({ date: '2027-03-01', title: '🏖️ Urlaub-Check: noch 5 Wochen offen (Stand 14.10.)' }));
    assert.deepEqual(ereignisZuEintrag(e, 'termine', settings), { art: 'urlaubcheck', id: 'fkc20270301', date: '2027-03-01', titel: e.summary });
    assert.deepEqual(ereignisZuEintrag({ ...e, id: 'handgemacht', extendedProperties: undefined }, 'termine', settings), { art: 'ignorieren' });
  });

  test('Arzttermin hin und zurück (Für wen, Notiz, Kosten, Mitnehmen)', () => {
    const termin = { id: 't1abc', typ: 'arzt', subtyp: 'kinderarzt', fuer: 'kind', notiz: 'Nüchtern kommen', date: '2026-10-14', time: '09:00', mitnehmen: ['e-card', 'MuKi-Pass', 'Impfpass'], kosten: { betrag: 12.5 } };
    const r = ereignisZuEintrag(wieVonGoogle(terminZuEreignis(termin, mitName)), 'termine', mitName);
    assert.deepEqual(r, { art: 'termin', termin, resync: null });
  });

  test('Mutter-Kind-Pass hin und zurück, auch der alte Titel „EKP-Untersuchung“', () => {
    const termin = { id: 't2abc', typ: 'arzt', subtyp: 'ekp', date: '2026-10-14', time: '08:00', mitnehmen: ['e-card', 'MuKi-Pass'], kosten: null };
    assert.deepEqual(ereignisZuEintrag(wieVonGoogle(terminZuEreignis(termin, settings)), 'termine', settings).termin, termin);
    const alt = { id: 'alt12', summary: '📒 EKP-Untersuchung 08:00 · 🎒 e-card, Mutter-Kind-Pass', start: { dateTime: '2026-10-14T08:00:00+02:00' }, end: { dateTime: '2026-10-14T08:30:00+02:00' }, extendedProperties: { private: { fk: '1', typ: 'arzt', v: '1' } } };
    const r = ereignisZuEintrag(alt, 'termine', settings).termin;
    assert.deepEqual([r.subtyp, r.mitnehmen], ['ekp', ['e-card', 'Mutter-Kind-Pass']]);
  });

  test('Termin mit Symbol hin und zurück; Standard-Symbol wird nicht gespeichert', () => {
    const termin = { id: 'f1abc', typ: 'familie', label: 'Finanzamt', symbol: '🏛️', fuer: 'mama', date: '2026-10-14', time: null, mitnehmen: ['Ausweis'], kosten: { kostenlos: true } };
    assert.deepEqual(ereignisZuEintrag(wieVonGoogle(terminZuEreignis(termin, settings)), 'termine', settings).termin, termin);
    const ohne = { id: 'f2abc', typ: 'familie', label: 'Fest', date: '2026-10-14', time: null, mitnehmen: [], kosten: null };
    assert.deepEqual(ereignisZuEintrag(wieVonGoogle(terminZuEreignis({ ...ohne, symbol: '🎈' }, settings)), 'termine', settings).termin, ohne);
  });

  test('Sachen hin und zurück (Richtung, Serie); ohne Uhrzeit gilt die Bring-/Abholzeit', () => {
    const termin = { id: 's1abc', typ: 'kita_sache', richtung: 'heim', date: '2026-10-14', time: '15:30', mitnehmen: ['Pyjamas'], kosten: null, serie: 'serie1' };
    assert.deepEqual(ereignisZuEintrag(wieVonGoogle(terminZuEreignis(termin, settings)), 'termine', settings).termin, termin);
    const ganztags = { id: 's2abc', summary: '👕 Von Krabbelstube heimholen · 🎒 Body', start: { date: '2026-10-14' }, end: { date: '2026-10-15' }, extendedProperties: { private: { fk: '1', typ: 'kita_sache' } } };
    assert.deepEqual(ereignisZuEintrag(ganztags, 'termine', settings).termin, { id: 's2abc', typ: 'kita_sache', date: '2026-10-14', time: '15:30', mitnehmen: ['Body'], kosten: null, richtung: 'heim' });
  });

  test('in Google verschobene Uhrzeit: echte Startzeit gilt, der Titel wird korrigiert', () => {
    const e = { ...wieVonGoogle(terminZuEreignis({ id: 't3abc', typ: 'arzt', subtyp: 'zahnarzt', date: '2026-10-14', time: '09:00', mitnehmen: ['e-card'], kosten: null }, settings)), start: { dateTime: '2026-10-14T10:15:00+02:00' } };
    const r = ereignisZuEintrag(e, 'termine', settings);
    assert.equal(r.termin.time, '10:15');
    assert.deepEqual(r.resync, { id: 't3abc', kalender: 'termine', summary: '🦷 Zahnarzt 10:15 · 🎒 e-card' });
  });

  test('Für wen: verstecktes Feld vor dem Titel; „alle“ im Feld schlägt einen Namen im Titel', () => {
    const basis = { id: 'x1abc', start: { dateTime: '2026-10-14T09:00:00+02:00' } };
    // Name des Kindes geändert: das Feld weiß es noch, die alte Klammer fällt weg
    assert.deepEqual(ereignisZuEintrag({ ...basis, summary: '🎈 Schwimmen (Lotte) 09:00', extendedProperties: { private: { fk: '1', typ: 'familie', w: 'kind' } } }, 'termine', mitName).termin, { id: 'x1abc', typ: 'familie', date: '2026-10-14', time: '09:00', mitnehmen: [], kosten: null, label: 'Schwimmen', fuer: 'kind' });
    assert.equal(ereignisZuEintrag({ ...basis, summary: '🎈 Schwimmen (Mama) 09:00', extendedProperties: { private: { fk: '1', typ: 'familie', w: 'alle' } } }, 'termine', settings).termin.fuer, undefined);
    // von Hand in Google geschrieben: der Name im Titel zählt
    assert.equal(ereignisZuEintrag({ ...basis, summary: 'Zahnarzt (Papa) 09:00' }, 'termine', settings).termin.fuer, 'papa');
  });

  test('Notiz aus HTML-Beschreibung', () => {
    const r = ereignisZuEintrag({ id: 'x2abc', summary: 'Fest', start: { date: '2026-10-14' }, description: 'Erster<br>Zweiter' }, 'termine', settings);
    assert.equal(r.termin.notiz, 'Erster\nZweiter');
  });
});

describe('versteckte Ereignisse zurücklesen', () => {
  test('Einstellungen: gültig, leer, kaputtes JSON, einzelne ungültige Felder', () => {
    const gut = einstellungenZuEreignis(mitName).body;
    assert.deepEqual(ereignisZuEintrag({ ...gut, status: 'confirmed' }, 'anwesenheit', settings), { art: 'einstellungen', settings: mitName, warnungen: [] });
    assert.deepEqual(einstellungenAusEreignis({ description: '' }), { settings, warnungen: [] });
    assert.deepEqual(einstellungenAusEreignis({ description: '{kaputt' }), { settings, warnungen: ['JSON'] });
    assert.deepEqual(einstellungenAusEreignis({ description: '[1,2]' }), { settings, warnungen: ['JSON'] });
    const teils = einstellungenAusEreignis({ description: JSON.stringify({ v: 1, kindname: 'Iris', bringzeit: '7 Uhr', zielWochen: 99, unbekannt: 1 }) });
    assert.deepEqual(teils.warnungen, ['bringzeit', 'zielWochen']);
    assert.deepEqual([teils.settings.kindname, teils.settings.bringzeit, teils.settings.zielWochen], ['Iris', '07:30', 5]);
  });

  test('Einkauf, Konto, Geräte', () => {
    assert.deepEqual(einkaufAusEreignis(einkaufZuEreignis({ v: 1, e: [{ i: 'a', t: 'Milch', m: '', g: 0, z: 1 }], h: {} }).body).liste.e[0].t, 'Milch');
    assert.deepEqual(einkaufAusEreignis(undefined), { liste: leereListe() });
    assert.deepEqual(kontoAusEreignis({ description: 'kaputt' }), { konto: leeresKonto() });
    assert.deepEqual(geraeteAusEreignis({ description: '' }), { register: null });
    assert.deepEqual(geraeteAusEreignis({ description: '{' }), { register: null, warnung: 'JSON' });
    assert.deepEqual(geraeteAusEreignis({ description: '{"v":2}' }), { register: null });
  });
});

describe('ereignisseZuZustand', () => {
  test('Konflikte, Doppelte, Sortierung, Einstellungen, Korrekturen', () => {
    const ereignisse = [
      { kalender: 'anwesenheit', event: wieVonGoogle(tagZuEreignis('kita_essen', '2026-10-14', settings)) },
      { kalender: 'abwesenheit', event: wieVonGoogle(tagZuEreignis('krank', '2026-10-14', settings)) },
      { kalender: 'abwesenheit', event: wieVonGoogle(tagZuEreignis('krank', '2026-10-14', settings)) }, // doppelt geliefert
      { kalender: 'anwesenheit', event: wieVonGoogle(tagZuEreignis('kita_ohne', '2026-10-13', settings)) },
      { kalender: 'termine', event: { ...wieVonGoogle(terminZuEreignis({ id: 'spaet', typ: 'arzt', subtyp: 'zahnarzt', date: '2026-10-15', time: '11:00', mitnehmen: [], kosten: null }, settings)), start: { dateTime: '2026-10-15T12:00:00+02:00' } } },
      { kalender: 'termine', event: wieVonGoogle(terminZuEreignis({ id: 'frueh', typ: 'familie', label: 'A', date: '2026-10-15', time: '08:00', mitnehmen: [], kosten: null }, settings)) },
      { kalender: 'abwesenheit', event: wieVonGoogle(urlaubZuEreignis({ id: 'u2', start: '2026-12-01', end: '2026-12-02' }, settings)) },
      { kalender: 'abwesenheit', event: wieVonGoogle(urlaubZuEreignis({ id: 'u1', start: '2026-11-01', end: '2026-11-02' }, settings)) },
      { kalender: 'anwesenheit', event: { ...einstellungenZuEreignis(mitName).body, status: 'confirmed' } },
      { kalender: 'termine', event: wieVonGoogle(urlaubCheckZuEreignis({ date: '2027-05-01', title: 'b' })) },
      { kalender: 'termine', event: wieVonGoogle(urlaubCheckZuEreignis({ date: '2027-03-01', title: 'a' })) },
    ];
    const z = ereignisseZuZustand({ ereignisse, settings });
    assert.deepEqual(z.tage, { '2026-10-13': { typ: 'kita_ohne' }, '2026-10-14': { typ: 'krank', konflikt: true, andere: ['kita_essen'] } });
    assert.deepEqual(Object.keys(z.tage), ['2026-10-13', '2026-10-14']);
    assert.deepEqual(z.konflikte, ['2026-10-14']);
    assert.deepEqual(z.termine.map((t) => [t.id, t.time]), [['frueh', '08:00'], ['spaet', '12:00']]);
    assert.deepEqual(z.resync.map((r) => r.id), ['spaet']);
    assert.deepEqual(z.urlaub.map((u) => u.id), ['u1', 'u2']);
    assert.deepEqual(z.urlaubChecks.map((c) => c.id), ['fkc20270301', 'fkc20270501']);
    assert.equal(z.einstellungen.settings.kindname, 'Iris');
  });

  test('ohne Ereignisse', () => {
    assert.deepEqual(ereignisseZuZustand({ ereignisse: [], settings }), { tage: {}, urlaub: [], termine: [], einstellungen: null, resync: [], urlaubChecks: [], konflikte: [] });
  });
});

describe('Schichtplan: versteckte Ereignisse', () => {
  const GOOGLE_ID = /^[0-9a-v]+$/; // Google erlaubt in Ereignis-IDs nur 0-9 und a-v
  const monat = setzeNotiz(setzeSchicht(leererMonat('2026-10'), { person: 'papa', tag: 3, k: 'A' }), { person: 'mama', tag: 13, text: 'Dienst 12' });

  test('IDs: fkschichtarten und fksch<JJJJMM>, nur erlaubte Zeichen', () => {
    assert.equal(SCHICHTARTEN_ID, 'fkschichtarten');
    assert.match(SCHICHTARTEN_ID, GOOGLE_ID);
    assert.equal(schichtMonatId('2026-10'), 'fksch202610');
    assert.match(schichtMonatId('2026-10'), GOOGLE_ID);
    assert.equal(schichtMonatId('2027-01'), 'fksch202701');
    assert.equal(istSchichtId('fksch202610'), true);
    assert.equal(istSchichtId(SCHICHTARTEN_ID), true);
    assert.equal(istSchichtId('fk20261014'), false);
    assert.equal(istSchichtId(undefined), false);
  });

  test('Ereignisse am 2000-01-01 in „Anwesenheit“, transparent, ohne Erinnerung, mit festen Titeln', () => {
    const arten = schichtartenZuEreignis(standardKatalog());
    const mon = schichtMonatZuEreignis(monat);
    for (const [e, id, titel, typ] of [[arten, 'fkschichtarten', '🗓️ fk Schichtarten (nicht löschen)', 'schichtarten'], [mon, 'fksch202610', '🗓️ fk Schichtplan (nicht löschen)', 'schicht']]) {
      assert.deepEqual([e.kalender, e.id, e.body.id, e.body.summary], ['anwesenheit', id, id, titel]);
      assert.deepEqual([e.body.start, e.body.end, e.body.transparency], [{ date: '2000-01-01' }, { date: '2000-01-02' }, 'transparent']);
      assert.deepEqual(e.body.reminders, { useDefault: false, overrides: [] });
      assert.deepEqual(e.body.extendedProperties.private, { fk: '1', typ, v: '1' });
    }
    assert.equal(arten.body.description, katalogText(standardKatalog()));
    assert.equal(mon.body.description, monatText(monat));
  });

  test('zurücklesen: gleicher Katalog, gleicher Monat', () => {
    assert.deepEqual(schichtartenAusEreignis(schichtartenZuEreignis(standardKatalog()).body), { katalog: standardKatalog(), warnungen: [] });
    assert.deepEqual(schichtMonatAusEreignis(schichtMonatZuEreignis(monat).body, '2026-10'), { monat, warnungen: [] });
  });

  test('kaputte Beschreibung: leerer Monat bzw. Standardarten mit Warnung, ohne Ausnahme', () => {
    const m = schichtMonatAusEreignis({ description: '{kaputt' }, '2026-10');
    assert.deepEqual(m.monat, leererMonat('2026-10'));
    assert.equal(m.warnungen.length, 1);
    const k = schichtartenAusEreignis({ description: '[1,2' });
    assert.deepEqual(k.katalog, standardKatalog());
    assert.equal(k.warnungen.length, 1);
    assert.deepEqual(schichtMonatAusEreignis(undefined, '2026-02'), { monat: leererMonat('2026-02'), warnungen: [] });
  });

  test('ereignisZuEintrag ignoriert Schichtarten und alle Schichtmonate', () => {
    for (const e of [schichtartenZuEreignis(standardKatalog()).body, schichtMonatZuEreignis(monat).body, { id: 'fksch209912', summary: 'Krank', start: { date: '2000-01-01' } }]) {
      assert.deepEqual(ereignisZuEintrag(e, 'anwesenheit', settings), { art: 'ignorieren' });
    }
  });
});

describe('Fixkosten: versteckte Ereignisse (4 Teile)', () => {
  const GOOGLE_ID = /^[a-v0-9]{5,1024}$/;
  const p = (id, name, aenderung = {}) => ({ id, name, cents: 5900, ungefaehr: false, intervall: 1, tag: '1', start: '2026-10', kategorie: 'versicherung', person: 'papa', ...aenderung });
  const shard = postenArchivieren(postenSetzen(postenSetzen(leererShard(), p('kfa00001', 'Kfz-Versicherung Papa', { vertrag: { bis: '2026-12-31', verlaengerung: 12, frist: '1m' }, notiz: 'Polizze 47' })), p('aaaa0001', 'Altvertrag')), 'aaaa0001', '2026-09-01');

  test('IDs: fkfest0 … fkfest3 (fkfix ginge nicht: x ist bei Google verboten), nur erlaubte Zeichen; andere Nummern werden abgelehnt', () => {
    assert.deepEqual(FIX_IDS, ['fkfest0', 'fkfest1', 'fkfest2', 'fkfest3']);
    assert.ok(Object.isFrozen(FIX_IDS));
    for (const [nr, id] of FIX_IDS.entries()) {
      assert.equal(fixShardId(nr), id);
      assert.match(id, GOOGLE_ID);
      assert.equal(istFixId(id), true);
    }
    for (const falsch of [-1, 4, 1.5, '1', null, undefined]) assert.throws(() => fixShardId(falsch), /Ungültiger Teil der Fixkosten/);
    for (const andere of ['fk20261014', 'fkc20261014', 'fkkonto', 'fksch202610', 'fkfe', 'fkfix0', undefined, null]) assert.equal(istFixId(andere), false, String(andere));
  });

  test('Ereignis am 2000-01-01 in „Anwesenheit“, transparent, ohne Erinnerung; der Titel nennt weder Namen noch Beträge', () => {
    for (const nr of [0, 1, 2, 3]) {
      const e = fixShardZuEreignis(nr, shard);
      assert.deepEqual([e.kalender, e.id, e.body.id, e.body.summary], ['anwesenheit', `fkfest${nr}`, `fkfest${nr}`, '💶 fk Fixkosten (nicht löschen)']);
      assert.deepEqual([e.body.start, e.body.end, e.body.transparency], [{ date: '2000-01-01' }, { date: '2000-01-02' }, 'transparent']);
      assert.deepEqual(e.body.reminders, { useDefault: false, overrides: [] });
      assert.deepEqual(e.body.extendedProperties.private, { fk: '1', typ: 'fixkosten', v: '1' });
      assert.equal(e.body.description, shardText(shard));
      for (const inhalt of ['Kfz', 'Papa', '59', 'Polizze']) assert.ok(!e.body.summary.includes(inhalt), inhalt);
    }
  });

  test('zu voller Teil wird vor dem Schreiben abgelehnt', () => {
    const riesig = { v: 1, posten: Array.from({ length: 60 }, (_, i) => p(`v${String(i).padStart(7, '0')}`, 'N'.repeat(40), { notiz: 'Z'.repeat(80) })) };
    assert.throws(() => fixShardZuEreignis(0, riesig), /Dieser Teil der Fixkosten ist voll/);
  });

  test('zurücklesen: gleicher Teil, ohne Warnung; kaputt → leerer Teil mit Warnung, ohne Ausnahme', () => {
    assert.deepEqual(fixShardAusEreignis(fixShardZuEreignis(2, shard).body), { shard, warnungen: [] });
    const kaputt = fixShardAusEreignis({ description: '{kaputt' });
    assert.deepEqual(kaputt.shard, leererShard());
    assert.equal(kaputt.warnungen.length, 1);
    assert.deepEqual(fixShardAusEreignis(undefined), { shard: leererShard(), warnungen: [] });
    const beschaedigt = fixShardAusEreignis({ description: JSON.stringify({ v: 1, p: [{ i: 'aaaa1', n: { toString: 1 }, c: 1 }] }) });
    assert.deepEqual(beschaedigt.shard, leererShard());
    assert.equal(beschaedigt.warnungen.length, 1);
  });

  test('ereignisZuEintrag ignoriert alle vier Teile (auch mit fremdem Titel)', () => {
    for (const nr of [0, 1, 2, 3]) assert.deepEqual(ereignisZuEintrag(fixShardZuEreignis(nr, shard).body, 'anwesenheit', settings), { art: 'ignorieren' });
    assert.deepEqual(ereignisZuEintrag({ id: 'fkfest1', summary: 'Krank', start: { date: '2000-01-01' } }, 'anwesenheit', settings), { art: 'ignorieren' });
  });
});
