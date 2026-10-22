// View-Modell der Seite „Fixkosten“ im Konto-Tab (ohne DOM): Kopf, Filter, „Diesen Monat fällig“, Kategorien, Abzeichen der Verträge,
// Kündigungsfristen, Fixkosten und Ersparnis, Archiv, Warnungen/unlesbare Teile/fremde Posten, Formular-Entwurf und gemerkte Ansicht.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  KONTO_ANSICHT_SCHLUESSEL,
  entwurfZuPosten,
  fixEntwurf,
  fixkostenModel,
  kontoAnsichtLesen,
  kontoAnsichtSpeichern,
  startMonate,
  vertragAbzeichen,
  vertragVorschau,
  vorlageAnwenden,
} from '../../src/app/views/fixkosten-model.js';
import { TEXT_TEIL_GESPERRT } from '../../src/domain/fixkosten.js';
import { speicherAttrappe, zustand } from './hilfen.js';

const HEUTE = '2026-10-14';

/** Posten wie im Speicher (gültig, mit Kennung). */
const p = (id, name, cents, mehr = {}) => ({ id, name, cents, ungefaehr: false, intervall: 1, tag: '1', start: '2026-01', kategorie: 'sonstiges', person: 'gemeinsam', ...mehr });

/** Zustand mit den Posten in Teil 0 (oder je Teil, wenn `teile` angegeben ist). */
const mit = (posten, { teile = null, status = 'geladen', warnungen = [], unlesbar = [], konto, settings } = {}) =>
  zustand({
    ...(konto ? { konto } : {}),
    ...(settings ? { settings } : {}),
    fixkosten: { shards: teile ?? [{ v: 1, posten }, { v: 1, posten: [] }, { v: 1, posten: [] }, { v: 1, posten: [] }], status, warnungen, unlesbar },
  });

const MIETE = p('miete001', 'Miete', 105000, { kategorie: 'wohnen' });
const STROM = p('strom001', 'Strom', 7400, { kategorie: 'wohnen', ungefaehr: true, tag: '15' });
const FERNW = p('fernw001', 'Fernwärme', 17800, { kategorie: 'wohnen', intervall: 2, tag: '20', start: '2026-10' });
const ORF = p('orf00001', 'ORF-Beitrag', 18360, { kategorie: 'wohnen', intervall: 12, tag: '15', start: '2026-01' });
const KFZ = p('kfa00001', 'Kfz-Versicherung Papa', 5900, { kategorie: 'versicherung', person: 'papa', vertrag: { bis: '2026-12-31', verlaengerung: 12, frist: '1m' } });
const FIT = p('fit00001', 'Fitnessstudio', 2990, { kategorie: 'freizeit', person: 'mama', tag: 'letzter', vertrag: { bis: '2027-06-30', verlaengerung: 12, frist: '2m' } });
const KIND = p('kind0001', 'Schwimmkurs', 4500, { kategorie: 'kind', person: 'kind', tag: '3' });
const ALT = p('alt00001', 'Zeitung', 2000, { archiv: '2026-05-01' });
const ALLE = [MIETE, STROM, FERNW, ORF, KFZ, FIT, KIND, ALT];

describe('Ansicht im Konto-Tab merken (fk.konto.ansicht.v1)', () => {
  test('ohne Eintrag: Kontostand; gespeichert und gelesen; Unsinn → Kontostand', () => {
    const s = speicherAttrappe();
    assert.equal(KONTO_ANSICHT_SCHLUESSEL, 'fk.konto.ansicht.v1');
    assert.equal(kontoAnsichtLesen(s), 'kontostand');
    assert.equal(kontoAnsichtSpeichern('fixkosten', s), 'fixkosten');
    assert.equal(s.daten.get('fk.konto.ansicht.v1'), 'fixkosten');
    assert.equal(kontoAnsichtLesen(s), 'fixkosten');
    assert.equal(kontoAnsichtSpeichern('quatsch', s), 'kontostand');
    assert.equal(kontoAnsichtLesen(speicherAttrappe({ 'fk.konto.ansicht.v1': 'xyz' })), 'kontostand');
  });

  test('gesperrter Speicher (privater Modus): kein Wurf', () => {
    const kaputt = speicherAttrappe({}, { kaputt: true });
    assert.equal(kontoAnsichtLesen(kaputt), 'kontostand');
    assert.equal(kontoAnsichtSpeichern('fixkosten', kaputt), 'fixkosten');
    assert.equal(kontoAnsichtLesen(null), 'kontostand');
  });
});

describe('fixkostenModel: Kopf und Filter', () => {
  test('Ø pro Monat, im Jahr, Anzahl, diesen Monat fällig – aktive Posten, Archiv zählt nicht', () => {
    const m = fixkostenModel(mit(ALLE), HEUTE);
    // Ø: 1050 + 74 + 89 + 15,30 + 59 + 29,90 + 45 = 1.362,20 €
    assert.equal(m.kopf.monatlich, '1.362,20 €');
    assert.equal(m.kopf.jahrText, '= 16.346,40 € im Jahr · 7 Posten');
    // Oktober: Miete 1050, Strom 74, Fernwärme 178, Kfz 59, Fitness 29,90, Schwimmkurs 45 (ORF erst im Jänner)
    assert.equal(m.kopf.faellig, '1.435,90 €');
    assert.equal(m.zustand, 'ok');
  });

  test('Filter mit Teilsummen (immer alle Posten); Kind heißt wie in den Einstellungen, sonst „Kind“', () => {
    const m = fixkostenModel(mit(ALLE), HEUTE);
    assert.deepEqual(
      m.filter.map((f) => [f.id, f.text, f.betrag, f.aktiv]),
      [
        ['alle', 'Alle', '1.362,20 €', true],
        ['papa', '👨 Papa', '59 €', false],
        ['mama', '👩 Mama', '29,90 €', false],
        ['gemeinsam', '🏠 Gemeinsam', '1.228,30 €', false],
        ['kind', '👧 Kind', '45 €', false],
      ],
    );
    const benannt = fixkostenModel(mit(ALLE, { settings: { kindname: 'Krümel' } }), HEUTE);
    assert.equal(benannt.filter[4].text, '👧 Krümel');
  });

  test('gefiltert: Kopf, fällig, Kategorien, Fristen und Archiv nur dieser Person; Filterknöpfe bleiben ungefiltert', () => {
    const m = fixkostenModel(mit(ALLE), HEUTE, { filter: 'papa' });
    assert.equal(m.kopf.monatlich, '59 €');
    assert.equal(m.kopf.titel, 'Fixkosten pro Monat (Ø) · 👨 Papa');
    assert.equal(m.kopf.faellig, '59 €');
    assert.deepEqual(m.kategorien.map((k) => k.titel), ['🛡️ Versicherungen']);
    assert.deepEqual(m.faellig.eintraege.map((e) => e.name), ['Kfz-Versicherung Papa']);
    assert.deepEqual(m.fristen.map((f) => f.name), ['Kfz-Versicherung Papa']);
    assert.deepEqual(m.archiv, []);
    assert.equal(m.filter[0].betrag, '1.362,20 €');
    assert.equal(m.filter.find((f) => f.aktiv).id, 'papa');
    assert.equal(fixkostenModel(mit(ALLE), HEUTE, { filter: 'unsinn' }).filter.find((f) => f.aktiv).id, 'alle');
  });

  test('Ø Ersparnis (6 Monate) aus dem Kontostand-Modell; ohne Kontostände: keine Zahl', () => {
    const konto = { v: 1, p: { papa: { '2026-07': 100000, '2026-08': 150000, '2026-09': 140000 }, mama: { '2026-07': 50000, '2026-08': 60000, '2026-09': 61000 } }, x: [] };
    assert.equal(fixkostenModel(mit(ALLE, { konto }), HEUTE).kopf.ersparnis, '+255 €');
    assert.equal(fixkostenModel(mit(ALLE), HEUTE).kopf.ersparnis, null);
  });
});

describe('fixkostenModel: Listen', () => {
  test('Diesen Monat fällig: nach Tag, tatsächlicher Betrag, „~“ bei ungefähr, ohne bezahlt-Haken', () => {
    const m = fixkostenModel(mit(ALLE), HEUTE);
    assert.equal(m.faellig.titel, '📅 Diesen Monat fällig');
    assert.equal(m.faellig.summe, '1.435,90 €');
    assert.deepEqual(
      m.faellig.eintraege.map((e) => [e.tag, e.name, e.unter, e.betrag]),
      [
        ['1.', 'Kfz-Versicherung Papa', '👨 Papa', '59 €'],
        ['1.', 'Miete', '🏠 Gemeinsam', '1.050 €'],
        ['3.', 'Schwimmkurs', '👧 Kind', '45 €'],
        ['15.', 'Strom', '🏠 Gemeinsam', '~ 74 €'],
        ['20.', 'Fernwärme', '🏠 Gemeinsam · alle 2 Monate', '178 €'],
        ['31.', 'Fitnessstudio', '👩 Mama', '29,90 €'],
      ],
    );
    assert.ok(m.faellig.eintraege.every((e) => !('bezahlt' in e) && !('offen' in e)));
  });

  test('Kategorien in fester Reihenfolge mit Teilsumme; Zeile: Person (Kürzel), Intervall, Tag, Ø pro Monat', () => {
    const m = fixkostenModel(mit(ALLE), HEUTE);
    assert.deepEqual(
      m.kategorien.map((k) => [k.titel, k.summe]),
      [
        ['🏠 Wohnen & Energie', '1.228,30 €'],
        ['🛡️ Versicherungen', '59 €'],
        ['👧 Kind', '45 €'],
        ['🎬 Freizeit & Abos', '29,90 €'],
      ],
    );
    const wohnen = m.kategorien[0].posten;
    assert.deepEqual(
      wohnen.map((z) => [z.name, z.person.kuerzel, z.unter, z.betrag, z.proMonat]),
      [
        ['Miete', 'GEM', 'monatlich · am 1.', '1.050 €', false],
        ['Fernwärme', 'GEM', 'alle 2 Monate 178 € · am 20.', '89 €', true],
        ['Strom', 'GEM', 'monatlich · am 15. · ~ ungefähr', '~ 74 €', false],
        ['ORF-Beitrag', 'GEM', 'jährlich 183,60 € · am 15.', '15,30 €', true],
      ],
    );
    assert.equal(m.kategorien[3].posten[0].unter, 'monatlich · am Monatsletzten');
    const kind = fixkostenModel(mit(ALLE, { settings: { kindname: 'Krümel' } }), HEUTE).kategorien[2].posten[0].person;
    assert.deepEqual([kind.id, kind.kuerzel, kind.name], ['kind', 'KRÜMEL', 'Krümel']);
  });

  test('Beschriftung der Zeilen für Vorleseprogramme: Name, Person, Betrag und Abzeichen (⚠-Frist hörbar)', () => {
    const m = fixkostenModel(mit(ALLE), HEUTE);
    const zeilen = m.kategorien.flatMap((k) => k.posten);
    assert.equal(zeilen.find((z) => z.name === 'Kfz-Versicherung Papa').beschriftung, 'Kfz-Versicherung Papa, Papa, 59 € pro Monat, monatlich · am 1., ⚠ Kündbar bis 30.11. – in 47 Tagen – bearbeiten');
    assert.equal(zeilen.find((z) => z.name === 'Fernwärme').beschriftung, 'Fernwärme, Gemeinsam, 89 € pro Monat, alle 2 Monate 178 € · am 20. – bearbeiten');
    assert.equal(zeilen.find((z) => z.name === 'Strom').beschriftung, 'Strom, Gemeinsam, ungefähr 74 € pro Monat, monatlich · am 15. · ~ ungefähr – bearbeiten');
    assert.equal(m.fristen[0].beschriftung, 'Kfz-Versicherung Papa, Vertrag bis 31.12.2026, ⚠ Kündbar bis 30.11. – in 47 Tagen – bearbeiten');
    assert.equal(fixkostenModel(mit([MIETE, ALT]), HEUTE).archiv[0].beschriftung, 'Zeitung, archiviert ab 01.05.2026 · 20 € monatlich – zurückholen oder endgültig löschen');
  });

  test('Abzeichen: „Kündbar bis“, ⚠ ab 60 Tagen davor', () => {
    const m = fixkostenModel(mit(ALLE), HEUTE);
    const zeile = (name) => m.kategorien.flatMap((k) => k.posten).find((z) => z.name === name);
    assert.deepEqual(zeile('Kfz-Versicherung Papa').abzeichen, { text: '⚠ Kündbar bis 30.11. – in 47 Tagen', warn: true });
    assert.deepEqual(zeile('Fitnessstudio').abzeichen, { text: '📝 Kündbar bis 30.04.2027', warn: false });
    assert.equal(zeile('Miete').abzeichen, null);
  });

  test('vertragAbzeichen: Grenze 60 Tage, heute, morgen, beendet, endet ohne Verlängerung, monatlich kündbar', () => {
    const v = (bis, verlaengerung, frist) => p('v0000001', 'V', 100, { vertrag: { bis, verlaengerung, frist } });
    assert.deepEqual(vertragAbzeichen(v('2026-12-14', 12, '1m'), HEUTE), { text: '⚠ Kündbar bis 14.11. – in 31 Tagen', warn: true });
    assert.equal(vertragAbzeichen(v('2027-01-13', 12, '1m'), HEUTE).text, '⚠ Kündbar bis 13.12. – in 60 Tagen');
    assert.equal(vertragAbzeichen(v('2027-01-14', 12, '1m'), HEUTE).text, '📝 Kündbar bis 14.12.2026');
    assert.equal(vertragAbzeichen(v('2026-11-14', 12, '1m'), HEUTE).text, '⚠ Kündbar bis 14.10. – heute');
    assert.equal(vertragAbzeichen(v('2026-11-15', 12, '1m'), HEUTE).text, '⚠ Kündbar bis 15.10. – morgen');
    assert.deepEqual(vertragAbzeichen(v('2026-09-30', 0, '1m'), HEUTE), { text: '📝 Vertrag beendet', warn: false });
    assert.deepEqual(vertragAbzeichen(v('2026-10-31', 0, '1m'), HEUTE), { text: '📝 Vertrag endet am 31.10.2026', warn: false });
    // Verlängerung unter 3 Monaten (monatlich): nie ⚠, keine Erinnerung – nur „monatlich kündbar“
    assert.deepEqual(vertragAbzeichen(v('2025-03-31', 1, '1m'), HEUTE), { text: '📝 monatlich kündbar', warn: false });
    assert.deepEqual(vertragAbzeichen(v('2026-11-30', 1, '1m'), HEUTE), { text: '📝 Kündbar bis 30.10.2026, danach monatlich kündbar', warn: false });
    assert.equal(vertragAbzeichen(p('x0000001', 'X', 1), HEUTE), null);
  });

  test('Kündigungsfristen: nächste zuerst, „Vertrag bis“; monatlich kündbare am Ende; beendete und archivierte fehlen', () => {
    const handy = p('handy001', 'Handy', 1500, { vertrag: { bis: '2025-03-31', verlaengerung: 1, frist: '1m' } });
    const weg = p('weg00001', 'Altvertrag', 1000, { vertrag: { bis: '2026-01-31', verlaengerung: 0, frist: '1m' } });
    const archiviert = p('arch0001', 'Gekündigt', 1000, { archiv: '2026-10-01', vertrag: { bis: '2026-12-31', verlaengerung: 12, frist: '1m' } });
    const m = fixkostenModel(mit([handy, FIT, KFZ, weg, archiviert]), HEUTE);
    assert.deepEqual(
      m.fristen.map((f) => [f.name, f.unter, f.abzeichen.text]),
      [
        ['Kfz-Versicherung Papa', 'Vertrag bis 31.12.2026', '⚠ Kündbar bis 30.11. – in 47 Tagen'],
        ['Fitnessstudio', 'Vertrag bis 30.06.2027', '📝 Kündbar bis 30.04.2027'],
        ['Handy', 'verlängert sich monatlich', '📝 monatlich kündbar'],
      ],
    );
  });

  test('Archiv: neueste zuerst, nicht in Summen; ein künftiges Archivdatum zählt bis dahin noch (mit Abzeichen)', () => {
    const bald = p('bald0001', 'Zeitschrift', 1200, { archiv: '2026-12-01' });
    const m = fixkostenModel(mit([MIETE, ALT, bald]), HEUTE);
    assert.deepEqual(
      m.archiv.map((a) => [a.name, a.unter, a.aktiv]),
      [
        ['Zeitschrift', 'archiviert ab 01.12.2026 · 12 € monatlich', true],
        ['Zeitung', 'archiviert ab 01.05.2026 · 20 € monatlich', false],
      ],
    );
    assert.equal(m.kopf.monatlich, '1.062 €');
    const zeile = m.kategorien.flatMap((k) => k.posten).find((z) => z.name === 'Zeitschrift');
    assert.deepEqual([zeile.archiviert, zeile.abzeichen.text], [true, '🗄️ archiviert ab 01.12.2026']);
  });

  test('Fixkosten und Ersparnis: höchstens 6 Monate (neueste zuerst), erst ab dem ersten Startmonat; Ersparnis aus dem Kontostand', () => {
    const konto = { v: 1, p: { papa: { '2026-08': 100000, '2026-09': 130000 }, mama: { '2026-08': 50000, '2026-09': 40000 } }, x: [] };
    const m = fixkostenModel(mit([p('a0000001', 'Miete', 100000, { start: '2026-07' }), p('b0000001', 'ORF', 18000, { intervall: 12, start: '2026-09' })], { konto }), HEUTE);
    assert.deepEqual(
      m.diagramm.monate.map((x) => [x.text, x.faellig, x.ersparnis]),
      [
        ['Oktober 2026', 'Fixkosten fällig 1.000 €', 'Ersparnis: Kontostand am Monatsende'],
        ['September 2026', 'Fixkosten fällig 1.180 €', 'Ersparnis +200 €'],
        ['August 2026', 'Fixkosten fällig 1.000 €', 'Ersparnis: keine Angabe'],
        ['Juli 2026', 'Fixkosten fällig 1.000 €', 'Ersparnis: keine Angabe'],
      ],
    );
    assert.equal(m.diagramm.hinweis, 'Wird mit jedem Monat länger (bis 6 Monate).');
    const sep = m.diagramm.monate[1];
    assert.ok(sep.fixBreite > 0 && sep.sparBreite > 0 && sep.fixBreite + sep.sparBreite <= 100);
    assert.equal(m.diagramm.monate[0].sparBreite, 0);
    assert.equal(fixkostenModel(mit([]), HEUTE).diagramm, null);
    const voll = fixkostenModel(mit([p('a0000001', 'Miete', 100000, { start: '2025-01' })]), HEUTE).diagramm;
    assert.deepEqual([voll.monate.length, voll.hinweis], [6, null]);
  });

  test('negative Ersparnis: kein grüner Teil, Text mit Minus', () => {
    const konto = { v: 1, p: { papa: { '2026-08': 100000, '2026-09': 90000 }, mama: { '2026-08': 0, '2026-09': 0 } }, x: [] };
    const m = fixkostenModel(mit([p('a0000001', 'Miete', 100000, { start: '2026-09' })], { konto }), HEUTE);
    assert.deepEqual([m.diagramm.monate[1].ersparnis, m.diagramm.monate[1].sparBreite, m.diagramm.monate[1].minus], ['Ersparnis −100 €', 0, true]);
  });
});

describe('fixkostenModel: Zustand, Warnungen, unlesbare Teile, fremde Posten', () => {
  test('noch nicht gelesen / lädt / Fehler ohne Daten; Fehler mit Daten: alter Stand mit Hinweis', () => {
    const roh = (fixkosten) => zustand({ fixkosten });
    assert.equal(fixkostenModel(roh({ shards: null, status: null, warnungen: [], unlesbar: [] }), HEUTE).zustand, 'nichtGeladen');
    assert.equal(fixkostenModel(roh({ shards: null, status: 'laedt', warnungen: [], unlesbar: [] }), HEUTE).zustand, 'laedt');
    assert.equal(fixkostenModel(roh({ shards: null, status: 'fehler', warnungen: [], unlesbar: [] }), HEUTE).zustand, 'fehler');
    assert.equal(fixkostenModel(zustand(), HEUTE).zustand, 'nichtGeladen');
    const alt = fixkostenModel(mit(ALLE, { status: 'fehler' }), HEUTE);
    assert.deepEqual([alt.zustand, alt.veraltet], ['ok', true]);
    assert.equal(fixkostenModel(mit([]), HEUTE).leer, true);
  });

  test('unlesbarer Teil: eigene Meldung je Teil, Posten darin gesperrt (Grund = Meldung des Stores); doppelte Warnung fällt weg', () => {
    const teile = [{ v: 1, posten: [MIETE] }, { v: 1, posten: [] }, { v: 1, posten: [STROM] }, { v: 1, posten: [] }];
    const warnungen = ['Ein Teil der Fixkosten ist unlesbar (beschädigt oder von einer neueren App-Version); er wird leer gezeigt und lässt sich nicht ändern.', 'Die Notiz bei „Miete“ war unlesbar und wurde entfernt.'];
    const m = fixkostenModel(mit(null, { teile, unlesbar: [2], warnungen }), HEUTE);
    assert.deepEqual(m.unlesbar, [{ nr: 2, titel: 'Teil 3 von 4 der Fixkosten ist unlesbar', text: TEXT_TEIL_GESPERRT }]);
    assert.deepEqual(m.warnungen, ['Die Notiz bei „Miete“ war unlesbar und wurde entfernt.']);
    const zeilen = m.kategorien.flatMap((k) => k.posten);
    assert.deepEqual(zeilen.map((z) => [z.name, z.gesperrt]), [['Miete', false], ['Strom', true]]);
    assert.equal(m.gesperrtText, TEXT_TEIL_GESPERRT);
  });

  test('fremde Posten: nicht gezeigt, nicht gezählt; ein Hinweis nur bei N > 0; die gleichbedeutende Warnung fällt weg', () => {
    const teile = [{ v: 1, posten: [MIETE], fremd: [{ i: 'neu00001', n: 'Neu', z: 1 }] }, { v: 1, posten: [], fremd: [{ i: 'neu00002' }] }, { v: 1, posten: [] }, { v: 1, posten: [] }];
    const warnungen = ['1 Fixkosten-Posten konnte nicht gelesen werden (beschädigt oder von einer neueren App-Version); er bleibt gespeichert, wird hier aber nicht gezeigt.'];
    const m = fixkostenModel(mit(null, { teile, warnungen }), HEUTE);
    assert.equal(m.fremdHinweis, '2 Posten von einer neueren App-Version ausgeblendet – bitte App aktualisieren');
    assert.deepEqual(m.warnungen, []);
    assert.equal(m.kopf.jahrText, '= 12.600 € im Jahr · 1 Posten');
    assert.equal(fixkostenModel(mit([MIETE]), HEUTE).fremdHinweis, null);
  });
});

describe('Formular: Entwurf, Vorlagen, nächste Zahlung, Vorschau des Vertrags', () => {
  test('neuer Entwurf: leer, monatlich, am 1., Gemeinsam, ohne Vertrag', () => {
    const e = fixEntwurf(null, HEUTE);
    assert.deepEqual(
      { name: e.name, betrag: e.betrag, intervall: e.intervall, tag: e.tag, naechste: e.naechste, kategorie: e.kategorie, person: e.person, ungefaehr: e.ungefaehr, mitVertrag: e.mitVertrag, notiz: e.notiz },
      { name: '', betrag: '', intervall: 1, tag: '1', naechste: '2026-10', kategorie: 'sonstiges', person: 'gemeinsam', ungefaehr: false, mitVertrag: false, notiz: '' },
    );
  });

  test('Vorlage „Kfz-Versicherung“ füllt Name, Kategorie, Intervall und Vertrag (Verlängerung, Frist) samt Hinweis; ein eigener Name bleibt', () => {
    const e = vorlageAnwenden(fixEntwurf(null, HEUTE), 'kfz', HEUTE);
    assert.deepEqual([e.name, e.kategorie, e.intervall, e.mitVertrag, e.verlaengerung, e.frist, e.ungefaehr], ['Kfz-Versicherung', 'versicherung', 1, true, 12, '1m', false]);
    assert.match(e.hinweis, /laut Polizze prüfen/);
    const strom = vorlageAnwenden(e, 'strom', HEUTE);
    assert.deepEqual([strom.name, strom.kategorie, strom.ungefaehr, strom.frist], ['Strom', 'wohnen', true, '2w']); // Name der vorigen Vorlage wird ersetzt
    const eigen = vorlageAnwenden({ ...fixEntwurf(null, HEUTE), name: 'Kfz Mama' }, 'kfz', HEUTE);
    assert.equal(eigen.name, 'Kfz Mama');
    const orf = vorlageAnwenden(fixEntwurf(null, HEUTE), 'orf', HEUTE);
    assert.deepEqual([orf.intervall, orf.mitVertrag], [12, false]);
  });

  test('nächste Zahlung: Auswahl der Monate ab jetzt (ein Intervall lang)', () => {
    assert.deepEqual(startMonate(1, HEUTE).map((x) => x.wert), ['2026-10']);
    assert.deepEqual(startMonate(2, HEUTE), [{ wert: '2026-10', text: 'Oktober 2026' }, { wert: '2026-11', text: 'November 2026' }]);
    assert.equal(startMonate(12, HEUTE).at(-1).wert, '2027-09');
  });

  test('Entwurf eines vorhandenen Postens: Betrag als Text, nächste Fälligkeit, Vertrag', () => {
    const e = fixEntwurf(ORF, HEUTE);
    assert.deepEqual([e.id, e.betrag, e.intervall, e.naechste, e.mitVertrag], ['orf00001', '183,60', 12, '2027-01', false]);
    const k = fixEntwurf(KFZ, HEUTE);
    assert.deepEqual([k.betrag, k.mitVertrag, k.bis, k.verlaengerung, k.frist], ['59', true, '2026-12-31', 12, '1m']);
    assert.equal(fixEntwurf(MIETE, HEUTE).betrag, '1.050');
  });

  test('entwurfZuPosten: Betrag lesen, Startmonat, Vertrag; Fehler mit der Meldung der Prüfung', () => {
    const neu = { ...fixEntwurf(null, HEUTE), name: 'Fernwärme', betrag: '178,00', intervall: 2, naechste: '2026-11', kategorie: 'wohnen' };
    assert.deepEqual(entwurfZuPosten(neu, null, HEUTE), { posten: { name: 'Fernwärme', cents: 17800, ungefaehr: false, intervall: 2, tag: '1', start: '2026-11', kategorie: 'wohnen', person: 'gemeinsam', notiz: '' } });
    assert.deepEqual(entwurfZuPosten({ ...neu, betrag: '' }, null, HEUTE), { fehler: 'Bitte einen Betrag zwischen 0,01 € und 99.999,99 € eingeben.' });
    assert.deepEqual(entwurfZuPosten({ ...neu, betrag: '-5' }, null, HEUTE), { fehler: 'Bitte einen Betrag zwischen 0,01 € und 99.999,99 € eingeben.' });
    assert.deepEqual(entwurfZuPosten({ ...neu, name: ' ' }, null, HEUTE), { fehler: 'Bitte einen Namen eingeben.' });
    assert.deepEqual(entwurfZuPosten({ ...neu, mitVertrag: true, bis: '' }, null, HEUTE), { fehler: 'Bitte angeben, bis wann der Vertrag läuft.' });
    const mitV = entwurfZuPosten({ ...neu, intervall: 1, mitVertrag: true, bis: '2026-12-31', verlaengerung: 12, frist: '1m' }, null, HEUTE);
    assert.deepEqual([mitV.posten.start, mitV.posten.vertrag], ['2026-10', { bis: '2026-12-31', verlaengerung: 12, frist: '1m' }]);
  });

  test('ändern: Kennung bleibt; derselbe Rhythmus behält den alten Startmonat, ein anderer nimmt die gewählte nächste Zahlung', () => {
    const e = fixEntwurf(ORF, HEUTE);
    assert.deepEqual(entwurfZuPosten({ ...e, betrag: '190' }, ORF, HEUTE).posten, { id: 'orf00001', name: 'ORF-Beitrag', cents: 19000, ungefaehr: false, intervall: 12, tag: '15', start: '2026-01', kategorie: 'wohnen', person: 'gemeinsam', notiz: '' });
    assert.equal(entwurfZuPosten({ ...e, naechste: '2027-03' }, ORF, HEUTE).posten.start, '2027-03');
    assert.equal(entwurfZuPosten({ ...fixEntwurf(MIETE, HEUTE), betrag: '1.100' }, MIETE, HEUTE).posten.start, '2026-01');
    const ohne = entwurfZuPosten({ ...fixEntwurf(KFZ, HEUTE), mitVertrag: false }, KFZ, HEUTE).posten;
    assert.equal('vertrag' in ohne, false);
  });

  test('Vorschau des Vertrags: Kündbar bis, Erinnerung an beide 1 Monat vorher; monatlich kündbar ohne Erinnerung; beendet', () => {
    const e = { ...fixEntwurf(null, HEUTE), mitVertrag: true, bis: '2026-12-31', verlaengerung: 12, frist: '1m' };
    assert.deepEqual(vertragVorschau(e, HEUTE), { kuendbarBis: '30.11.2026', erinnerung: '30.10.2026', monatlich: false, beendet: false });
    assert.deepEqual(vertragVorschau({ ...e, bis: '2026-11-20' }, HEUTE), { kuendbarBis: '20.10.2026', erinnerung: null, monatlich: false, beendet: false });
    assert.deepEqual(vertragVorschau({ ...e, verlaengerung: 1, bis: '2025-01-31' }, HEUTE), { kuendbarBis: '30.10.2026', erinnerung: null, monatlich: true, beendet: false });
    assert.deepEqual(vertragVorschau({ ...e, verlaengerung: 0, bis: '2026-01-31' }, HEUTE), { kuendbarBis: '31.12.2025', erinnerung: null, monatlich: false, beendet: true });
    assert.equal(vertragVorschau({ ...e, bis: '' }, HEUTE), null);
    assert.equal(vertragVorschau({ ...e, mitVertrag: false }, HEUTE), null);
  });
});
