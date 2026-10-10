// Kleinere Bausteine der App: Sicherung als Datei, Listen bearbeiten, Urlaub-Checks abgleichen, Versionsprüfung, deutsche Datumstexte.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SICHERUNG_VERSION, sicherungAnzahlText, sicherungDateiname, sicherungErstellen, sicherungText } from '../../src/app/sicherung.js';
import { listeMitEintrag, listeOhneEintrag } from '../../src/app/listen.js';
import { urlaubChecksAbgleich, urlaubChecksWunsch } from '../../src/app/urlaub-check.js';
import { istNeueVersionVerfuegbar } from '../../src/app/version-check.js';
import { VERSION } from '../../src/app/version.js';
import { datumKurz, datumLang, gruss, monatTitel, standText, stundeInWien } from '../../src/app/format-de.js';
import { seedDemo } from '../../src/app/seed.js';
import { leereListe } from '../../src/domain/einkauf.js';
import { leeresKonto } from '../../src/domain/konto.js';
import { zustand } from './hilfen.js';

describe('Sicherung', () => {
  const state = {
    ...seedDemo('2026-10-14'),
    tage: { '2026-10-02': { typ: 'krank', konflikt: true, andere: ['kita_essen'] }, '2026-10-01': { typ: 'kita_essen' } },
    fehler: 'flüchtig',
    fortschritt: { erledigt: 1, gesamt: 2 },
  };
  const s = sicherungErstellen({ state, appVersion: '9.9.9', jetzt: new Date('2026-10-14T06:00:00Z') });

  test('Kopf und Inhalt; flüchtige Felder fehlen', () => {
    assert.deepEqual(Object.keys(s), ['app', 'sicherungVersion', 'appVersion', 'erstelltAm', 'settings', 'tage', 'urlaub', 'termine', 'einkauf', 'konto']);
    assert.deepEqual([s.app, s.sicherungVersion, s.appVersion, s.erstelltAm], ['familienkalender', SICHERUNG_VERSION, '9.9.9', '2026-10-14T06:00:00.000Z']);
    assert.deepEqual(s.tage, { '2026-10-01': { typ: 'kita_essen' }, '2026-10-02': { typ: 'krank' } });
    assert.deepEqual(Object.keys(s.tage), ['2026-10-01', '2026-10-02']);
  });

  test('Urlaub und Termine sortiert, Termine mit lesbarem Titel', () => {
    assert.deepEqual(s.urlaub.map((u) => u.start), [...s.urlaub.map((u) => u.start)].sort());
    const daten = s.termine.map((t) => `${t.date} ${t.time ?? ''}`);
    assert.deepEqual(daten, [...daten].sort());
    const kinderarzt = s.termine.find((t) => t.id === 'demo-t1');
    assert.equal(kinderarzt.titel, '🩺 Kinderarzt (Kind) 10:00 · 🎒 e-card, MuKi-Pass, Impfpass');
  });

  test('ohne Einkauf/Konto: leere Liste und leeres Konto; die Datei ist JSON', () => {
    const leer = sicherungErstellen({ state: zustand({ einkauf: undefined, konto: undefined }), appVersion: VERSION });
    assert.deepEqual([leer.einkauf, leer.konto], [leereListe(), leeresKonto()]);
    assert.deepEqual(JSON.parse(sicherungText(s)), s);
    assert.ok(sicherungText(s).includes('\n  "app": "familienkalender"'));
  });

  test('Dateiname und Anzahl (Einzahl und Mehrzahl)', () => {
    assert.equal(sicherungDateiname('2026-10-14'), 'familienkalender-sicherung-2026-10-14.json');
    assert.equal(sicherungAnzahlText(s), '2 Tage · 2 Urlaube · 8 Termine · 4 Artikel auf der Einkaufsliste · 10 Kontostände');
    const eins = { tage: { a: 1 }, urlaub: [1], termine: [1], einkauf: { e: [1] }, konto: { p: { papa: { '2026-09': 1 }, mama: {} } } };
    assert.equal(sicherungAnzahlText(eins), '1 Tag · 1 Urlaub · 1 Termin · 1 Artikel auf der Einkaufsliste · 1 Kontostand');
  });
});

describe('Listen bearbeiten', () => {
  test('Eintrag am Ende, bereinigt', () => {
    assert.deepEqual(listeMitEintrag(['a'], '  b · c, d ', { max: 3 }), ['a', 'b - c d']);
  });

  test('Prüfungen mit deutscher Meldung', () => {
    assert.throws(() => listeMitEintrag([], '  ', { max: 3 }), /Bitte etwas eingeben/);
    assert.throws(() => listeMitEintrag([], 'x'.repeat(31), { max: 3 }), /zu lang/);
    assert.throws(() => listeMitEintrag(['Impfpass'], 'IMPFPASS', { max: 3 }), /steht schon/);
    assert.throws(() => listeMitEintrag(['a', 'b'], 'c', { max: 2 }), /Höchstens 2/);
  });

  test('listeOhneEintrag', () => {
    assert.deepEqual(listeOhneEintrag(['a', 'b', 'a'], 'a'), ['b']);
  });
});

describe('Urlaub-Checks', () => {
  test('Wunsch: nur zukünftige Daten im laufenden Kindergartenjahr, solange etwas offen ist', () => {
    const w = urlaubChecksWunsch(zustand(), '2027-04-10');
    assert.deepEqual(w.map((c) => [c.id, c.date]), [['fkc20270501', '2027-05-01'], ['fkc20270701', '2027-07-01']]);
    assert.match(w[0].title, /^🏖️ Urlaub-Check: noch 5 Wochen offen/);
    const genug = zustand({ urlaub: [{ id: 'u', start: '2026-09-07', end: '2026-10-09' }] }); // 25 Werktage
    assert.deepEqual(urlaubChecksWunsch(genug, '2027-04-10'), []);
  });

  test('Abgleich: schreiben, was fehlt oder sich inhaltlich änderte; löschen, was vorbei oder nicht mehr gewünscht ist', () => {
    const wunsch = [
      { date: '2027-05-01', title: '🏖️ Urlaub-Check: noch 1 Woche offen (Stand 10.04.)' },
      { date: '2027-07-01', title: '🏖️ Urlaub-Check: noch 1 Woche offen (Stand 10.04.)' },
    ];
    const vorhanden = [
      { id: 'fkc20270301', date: '2027-03-01', titel: 'alt' }, // vorbei
      { id: 'fkc20270410', date: '2027-04-10', titel: 'heute' }, // bleibt bis morgen
      { id: 'fkc20270501', date: '2027-05-01', titel: '🏖️ Urlaub-Check: noch 1 Woche offen (Stand 01.03.)' }, // nur der Stand ist anders
      { id: 'fkc20270601', date: '2027-06-01', titel: 'nicht mehr gewünscht' },
      { id: 'handgemacht', date: '2027-01-01', titel: 'fremd' },
    ];
    assert.deepEqual(urlaubChecksAbgleich({ wunsch, vorhanden, heute: '2027-04-10' }), {
      schreiben: [{ date: '2027-07-01', title: wunsch[1].title }],
      loeschen: ['fkc20270301', 'fkc20270601'],
    });
  });
});

describe('Versionsprüfung', () => {
  const antwort = (status, text) => async () => ({ status, text: async () => text });

  test('nur eine sicher erkannte andere Version zählt', async () => {
    assert.equal(await istNeueVersionVerfuegbar({ aktuell: '0.13.0', fetch: antwort(200, "export const VERSION = '0.14.0';") }), true);
    assert.equal(await istNeueVersionVerfuegbar({ aktuell: '0.13.0', fetch: antwort(200, "export const VERSION = '0.13.0';") }), false);
    assert.equal(await istNeueVersionVerfuegbar({ aktuell: '0.13.0', fetch: antwort(404, '') }), false);
    assert.equal(await istNeueVersionVerfuegbar({ aktuell: '0.13.0', fetch: antwort(200, '<html>') }), false);
    assert.equal(await istNeueVersionVerfuegbar({ aktuell: '0.13.0', fetch: async () => { throw new Error('offline'); } }), false);
  });

  test('fragt am Zwischenspeicher vorbei', async () => {
    let aufruf;
    await istNeueVersionVerfuegbar({ aktuell: 'x', fetch: async (...a) => { aufruf = a; return { status: 200, text: async () => '' }; } });
    assert.match(aufruf[0], /^\.\/src\/app\/version\.js\?\d+$/);
    assert.deepEqual(aufruf[1], { cache: 'no-store' });
  });

  test('VERSION hat die Form x.y.z', () => {
    assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  });
});

describe('deutsche Datumstexte', () => {
  test('datumLang / datumKurz / monatTitel', () => {
    assert.equal(datumLang('2026-10-01'), 'Donnerstag, 1. Oktober');
    assert.equal(datumKurz('2026-03-01'), 'So 1. Mär.');
    assert.equal(monatTitel(2026, 12), 'Dezember 2026');
  });

  test('Gruß nach Wiener Stunde', () => {
    assert.equal(gruss(0).text, 'Guten Morgen!');
    assert.equal(gruss(10).text, 'Guten Morgen!');
    assert.equal(gruss(11).text, 'Guten Tag!');
    assert.equal(gruss(17).text, 'Guten Tag!');
    assert.equal(gruss(18).text, 'Guten Abend!');
    assert.equal(stundeInWien(new Date('2026-10-14T22:30:00Z')), 0);
    assert.equal(stundeInWien(new Date('2026-12-14T09:30:00Z')), 10);
  });

  test('standText in Wiener Zeit', () => {
    assert.equal(standText('2026-10-01T18:05:00.000Z'), 'Do 1. Okt., 20:05');
    assert.equal(standText('2026-12-31T23:30:00Z'), 'Fr 1. Jan., 00:30');
    assert.equal(standText('kaputt'), '');
  });
});
