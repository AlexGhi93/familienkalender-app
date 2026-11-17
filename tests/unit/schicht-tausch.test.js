// Diensttausch: die Hülle des versteckten Ereignisses „fkschtausch“ (Text hin und zurück, fremde Felder und Einträge bleiben erhalten).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MIT_WEM, MAX_TAUSCH_ZEICHEN, TAUSCH_BEHALTEN_MONATE, TAUSCH_OFFEN_TAGE, TEXT_TAUSCH_VOLL, leererTausch, tauschAm, tauschAnwenden,
  tauschAusText, tauschEintrag, tauschEntfernen, tauschErsetzt, tauschHinzufuegen, tauschPartnerMonate, tauschPruefen, tauschText, tauschZuruecknehmen, tauschZustand,
} from '../../src/domain/schicht-tausch.js';
import {
  leererMonat, monatZaehlung, schichtAm, setzeNotiz, setzeSchicht, setzeTagZeiten, standardKatalog, tagZeitenAm, zusatzHinzufuegen,
} from '../../src/domain/schicht.js';

const eintrag = { id: 'abcd1234', person: 'papa', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, am: '2026-12-01' };

test('Tausch-Hülle: Text hin und zurück, fremd bleibt', () => {
  const d = { ...leererTausch(), eintraege: [eintrag] };
  const r = tauschAusText(JSON.stringify({ ...JSON.parse(tauschText(d)), neu: 1 }));
  assert.equal(r.unlesbar, false);
  assert.deepEqual(r.daten.eintraege, d.eintraege);
  assert.deepEqual(JSON.parse(tauschText(r.daten)).neu, 1);
});

test('Tausch-Hülle: Kurzform im Text, alle Felder (auch die freiwilligen) kommen gleich zurück', () => {
  const voll = { id: 'efgh5678', person: 'mama', a: '2026-12-02', b: '2026-12-09', ka: 'A', kb: 'B', vb: 'C', za: ['07:00', '17:45'], zb: ['17:30', '07:00'], mitWem: 'Kollegin', am: '2026-11-30' };
  const text = tauschText({ ...leererTausch(), eintraege: [eintrag, voll] });
  assert.deepEqual(JSON.parse(text), {
    v: 1,
    l: [
      { i: 'abcd1234', p: 'papa', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, t: '2026-12-01' },
      { i: 'efgh5678', p: 'mama', a: '2026-12-02', b: '2026-12-09', ka: 'A', kb: 'B', vb: 'C', za: ['07:00', '17:45'], zb: ['17:30', '07:00'], m: 'Kollegin', t: '2026-11-30' },
    ],
  });
  const r = tauschAusText(text);
  assert.deepEqual(r, { daten: { v: 1, eintraege: [eintrag, voll] }, unlesbar: false, warnungen: [] });
  assert.equal(tauschText(r.daten), text);
});

test('Tausch-Hülle: leer → leererTausch, nicht unlesbar', () => {
  assert.deepEqual(tauschAusText(null), { daten: leererTausch(), unlesbar: false, warnungen: [] });
  assert.deepEqual(tauschAusText('  '), { daten: leererTausch(), unlesbar: false, warnungen: [] });
  assert.deepEqual(leererTausch(), { v: 1, eintraege: [] });
  assert.equal(tauschText(leererTausch()), '{"v":1,"l":[]}');
});

test('Tausch-Hülle: v:2 oder kaputtes JSON → unlesbar; zu groß → TEXT_TAUSCH_VOLL', () => {
  assert.equal(tauschAusText('{"v":2,"l":[]}').unlesbar, true);
  assert.equal(tauschAusText('{kaputt').unlesbar, true);
  assert.equal(tauschAusText('{"v":1}').unlesbar, true); // ohne Liste
  assert.equal(tauschAusText('[1]').unlesbar, true);
  assert.equal(MAX_TAUSCH_ZEICHEN, 6000);
  assert.throws(() => tauschText({ v: 1, eintraege: [], fremd: { x: 'a'.repeat(6000) } }), { message: TEXT_TAUSCH_VOLL });
  assert.equal(TEXT_TAUSCH_VOLL, 'Im Kalender ist kein Platz mehr für weitere Diensttausche – bitte alte rückgängig machen.');
});

test('Tausch-Hülle: unbekannte Eintrags-Schlüssel → fremd.l, unverändert zurückgeschrieben', () => {
  const roh = { i: 'zz001122', p: 'papa', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, t: '2026-12-01', q: 1 };
  const r = tauschAusText(JSON.stringify({ v: 1, l: [roh] }));
  assert.equal(r.unlesbar, false);
  assert.deepEqual(r.daten.eintraege, []);
  assert.deepEqual(r.daten.fremd, { l: [roh] });
  assert.deepEqual(JSON.parse(tauschText(r.daten)).l, [roh]);
  // mit einem neuen eigenen Eintrag: erst die bekannten, dann die fremden in ihrer Reihenfolge; fremde Felder vor `l`
  const mehr = tauschAusText(JSON.stringify({ v: 1, l: [roh, { anders: true }], neu: 'x' }));
  const text = tauschText({ ...mehr.daten, eintraege: [eintrag] });
  assert.deepEqual(Object.keys(JSON.parse(text)), ['v', 'neu', 'l']);
  assert.deepEqual(JSON.parse(text).l, [JSON.parse(tauschText({ ...leererTausch(), eintraege: [eintrag] })).l[0], roh, { anders: true }]);
  assert.deepEqual(tauschAusText(text).daten.fremd, { neu: 'x', l: [roh, { anders: true }] });
});

test('Tausch-Hülle: ungültiger Eintrag bleibt roh in fremd.l (mit Warnung); „fremd“ im Text ist reserviert', () => {
  const kaputt = { i: 'zz001122', p: 'oma', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, t: '2026-12-01' };
  const r = tauschAusText(JSON.stringify({ v: 1, l: [kaputt, 'text'], fremd: { boese: 1 } }));
  assert.equal(r.unlesbar, false);
  assert.deepEqual(r.daten.eintraege, []);
  assert.deepEqual(r.daten.fremd, { l: [kaputt, 'text'] });
  assert.equal(r.warnungen.length, 2);
  assert.deepEqual(JSON.parse(tauschText(r.daten)), { v: 1, l: [kaputt, 'text'] });
});

// ---------- Die Regeln des Diensttauschs ----------
const katalog = standardKatalog();
const sk = (person, kuerzel) => katalog.arten[person].find((x) => x.kuerzel === kuerzel).k;
const F = sk('papa', 'F');
const S = sk('papa', 'S');
const N = sk('papa', 'N');
const U = sk('papa', 'U');
// Tag A: 30.12.2026 Frühdienst mit eigenen Zeiten; Tag B: 04.01.2027 vorher Schulung mit eigenen Zeiten
const mA = setzeTagZeiten(setzeSchicht(leererMonat('2026-12'), { person: 'papa', tag: 30, k: F }), { person: 'papa', tag: 30, von: '06:00', bis: '14:00' }, katalog);
const mB = setzeTagZeiten(setzeSchicht(leererMonat('2027-01'), { person: 'papa', tag: 4, k: S }), { person: 'papa', tag: 4, von: '08:00', bis: '12:00' }, katalog);
const heute = '2026-12-01';
const entwurf = { person: 'papa', a: '2026-12-30', b: '2027-01-04', kb: F, mitWem: '  Kollege  ' };
const e = tauschEintrag(entwurf, { id: 'tausch01', monatA: mA, monatB: mB, heute });
const monateAus = (...liste) => (jm) => liste.find((m) => m.jm === jm) ?? null;
const GETAUSCHT = 'Dieser Tag ist schon getauscht – bitte zuerst den Tausch rückgängig machen.';

test('tauschEintrag merkt sich ka, vb, za, zb und mit wem', () => {
  assert.deepEqual(e, {
    id: 'tausch01', person: 'papa', a: '2026-12-30', b: '2027-01-04', ka: F, kb: F, vb: S, za: ['06:00', '14:00'], zb: ['08:00', '12:00'], mitWem: 'Kollege', am: heute,
  });
  const nacht = setzeSchicht(mA, { person: 'papa', tag: 30, k: N });
  const ohne = tauschEintrag({ ...entwurf, mitWem: ' ' }, { id: 'tausch02', monatA: nacht, monatB: leererMonat('2027-01'), heute });
  assert.deepEqual(ohne, { id: 'tausch02', person: 'papa', a: '2026-12-30', b: '2027-01-04', ka: N, kb: F, vb: null, am: heute });
  assert.equal(MAX_MIT_WEM, 24);
  assert.equal(TAUSCH_BEHALTEN_MONATE, 12);
  assert.equal(TAUSCH_OFFEN_TAGE, 1);
});

test('tauschZustand: ganz, halb, offen, gebrochen, unbekannt', () => {
  const aFertig = tauschAnwenden(mA, e, 'a');
  const bFertig = tauschAnwenden(mB, e, 'b');
  assert.equal(tauschZustand(e, aFertig, bFertig), 'ganz');
  assert.equal(tauschZustand(e, aFertig, mB), 'halb');
  assert.equal(tauschZustand(e, mA, bFertig), 'halb');
  assert.equal(tauschZustand(e, mA, mB), 'offen');
  assert.equal(tauschZustand(e, setzeSchicht(mA, { person: 'papa', tag: 30, k: N }), bFertig), 'gebrochen');
  assert.equal(tauschZustand(e, aFertig, setzeSchicht(mB, { person: 'papa', tag: 4, k: N })), 'gebrochen');
  assert.equal(tauschZustand(e, null, bFertig), 'unbekannt');
  assert.equal(tauschZustand(e, aFertig, null), 'unbekannt');
});

test('Anwenden und Zurücknehmen sind wiederholbar und stellen B exakt wieder her (auch eine vorherige Schicht in B)', () => {
  const a2 = tauschAnwenden(tauschAnwenden(mA, e, 'a'), e, 'a');
  assert.equal(schichtAm(a2, 'papa', 30), null);
  assert.equal(schichtAm(tauschZuruecknehmen(tauschAnwenden(mB, e, 'b'), e, 'b'), 'papa', 4), e.vb);
  const b2 = tauschAnwenden(tauschAnwenden(mB, e, 'b'), e, 'b');
  assert.equal(schichtAm(b2, 'papa', 4), F);
  assert.deepEqual(tauschZuruecknehmen(tauschZuruecknehmen(b2, e, 'b'), e, 'b'), mB);
  assert.deepEqual(tauschZuruecknehmen(tauschZuruecknehmen(a2, e, 'a'), e, 'a'), mA);
  // schon im Ausgangszustand: Zurücknehmen gibt denselben Monat zurück
  assert.equal(tauschZuruecknehmen(mA, e, 'a'), mA);
  assert.equal(tauschZuruecknehmen(mB, e, 'b'), mB);
  // B war leer: Zurücknehmen macht B wieder leer
  const leer = leererMonat('2027-01');
  const e2 = tauschEintrag({ ...entwurf, kb: N }, { id: 'tausch03', monatA: mA, monatB: leer, heute });
  assert.deepEqual(tauschZuruecknehmen(tauschAnwenden(leer, e2, 'b'), e2, 'b'), leer);
  // A und B im selben Monat
  const gleich = setzeSchicht(setzeSchicht(leererMonat('2026-12'), { person: 'papa', tag: 2, k: F }), { person: 'papa', tag: 9, k: S });
  const e3 = tauschEintrag({ person: 'papa', a: '2026-12-02', b: '2026-12-09', kb: N }, { id: 'tausch04', monatA: gleich, monatB: gleich, heute });
  const beide = tauschAnwenden(tauschAnwenden(gleich, e3, 'a'), e3, 'b');
  assert.equal(tauschZustand(e3, beide, beide), 'ganz');
  assert.deepEqual(tauschZuruecknehmen(tauschZuruecknehmen(beide, e3, 'b'), e3, 'a'), gleich);
});

test('manuell überschriebener Tag: Anwenden wirft, Zustand gebrochen, kein ⇄', () => {
  const aAnders = setzeSchicht(mA, { person: 'papa', tag: 30, k: N });
  const bAnders = setzeSchicht(mB, { person: 'papa', tag: 4, k: U });
  assert.throws(() => tauschAnwenden(aAnders, e, 'a'), { message: 'Der Dienst am 30.12. wurde inzwischen geändert.' });
  assert.throws(() => tauschAnwenden(bAnders, e, 'b'), { message: 'Der Dienst am 04.01. wurde inzwischen geändert.' });
  assert.throws(() => tauschZuruecknehmen(aAnders, e, 'a'), { message: 'Der Dienst am 30.12. wurde inzwischen geändert.' });
  assert.throws(() => tauschZuruecknehmen(bAnders, e, 'b'), { message: 'Der Dienst am 04.01. wurde inzwischen geändert.' });
  const bFertig = tauschAnwenden(mB, e, 'b');
  assert.equal(tauschZustand(e, aAnders, bFertig), 'gebrochen');
  const daten = { v: 1, eintraege: [e] };
  assert.equal(tauschAm(daten, monateAus(aAnders, bFertig), 'papa', '2026-12-30'), null);
  assert.equal(tauschAm(daten, monateAus(aAnders, bFertig), 'papa', '2027-01-04'), null);
});

test('tauschAm: nur ganz oder halb, mit Rolle; offen, unbekannt und andere Person zeigen nichts', () => {
  const daten = { v: 1, eintraege: [e] };
  const aFertig = tauschAnwenden(mA, e, 'a');
  const bFertig = tauschAnwenden(mB, e, 'b');
  assert.deepEqual(tauschAm(daten, monateAus(aFertig, bFertig), 'papa', '2026-12-30'), { eintrag: e, zustand: 'ganz', rolle: 'a' });
  assert.deepEqual(tauschAm(daten, monateAus(aFertig, bFertig), 'papa', '2027-01-04'), { eintrag: e, zustand: 'ganz', rolle: 'b' });
  assert.deepEqual(tauschAm(daten, monateAus(aFertig, mB), 'papa', '2027-01-04'), { eintrag: e, zustand: 'halb', rolle: 'b' });
  assert.deepEqual(tauschAm(daten, monateAus(aFertig, mB), 'papa', '2026-12-30'), { eintrag: e, zustand: 'halb', rolle: 'a' });
  assert.equal(tauschAm(daten, monateAus(mA, mB), 'papa', '2026-12-30'), null);
  assert.equal(tauschAm(daten, monateAus(aFertig, bFertig), 'mama', '2026-12-30'), null);
  assert.equal(tauschAm(daten, monateAus(aFertig, bFertig), 'papa', '2026-12-31'), null);
  assert.equal(tauschAm(daten, monateAus(aFertig), 'papa', '2026-12-30'), null);
});

test('Zeiten: gleiche Art nimmt die Tageszeiten mit, andere nicht; Rückgängig bringt beide zurück', () => {
  const aFertig = tauschAnwenden(mA, e, 'a');
  const bFertig = tauschAnwenden(mB, e, 'b');
  assert.equal(tagZeitenAm(aFertig, 'papa', 30), null);
  assert.equal(aFertig.zt, undefined);
  assert.deepEqual(tagZeitenAm(bFertig, 'papa', 4), { von: '06:00', bis: '14:00' });
  const eN = tauschEintrag({ ...entwurf, kb: N }, { id: 'tausch05', monatA: mA, monatB: mB, heute });
  const bN = tauschAnwenden(mB, eN, 'b');
  assert.equal(schichtAm(bN, 'papa', 4), N);
  assert.equal(tagZeitenAm(bN, 'papa', 4), null);
  assert.deepEqual(tagZeitenAm(tauschZuruecknehmen(aFertig, e, 'a'), 'papa', 30), { von: '06:00', bis: '14:00' });
  assert.deepEqual(tagZeitenAm(tauschZuruecknehmen(bFertig, e, 'b'), 'papa', 4), { von: '08:00', bis: '12:00' });
  assert.deepEqual(tagZeitenAm(tauschZuruecknehmen(bN, eN, 'b'), 'papa', 4), { von: '08:00', bis: '12:00' });
});

test('tauschPruefen: alle Meldungen', () => {
  const opt = { daten: { v: 1, eintraege: [] }, monate: monateAus(mA, mB), katalog, heute };
  assert.equal(tauschPruefen(entwurf, opt), null);
  assert.equal(tauschPruefen({ ...entwurf, b: entwurf.a }, opt), 'Bitte zwei verschiedene Tage wählen.');
  assert.equal(tauschPruefen({ ...entwurf, a: '2026-12-29' }, opt), 'Am abgegebenen Tag ist kein Dienst eingetragen.');
  const urlaub = setzeSchicht(mA, { person: 'papa', tag: 30, k: U });
  assert.equal(tauschPruefen(entwurf, { ...opt, monate: monateAus(urlaub, mB) }), 'Am abgegebenen Tag ist kein Dienst eingetragen.');
  assert.equal(tauschPruefen({ ...entwurf, kb: U }, opt), 'Bitte einen Dienst für den übernommenen Tag wählen.');
  assert.equal(tauschPruefen({ ...entwurf, kb: undefined }, opt), 'Bitte einen Dienst für den übernommenen Tag wählen.');
  assert.equal(tauschPruefen({ ...entwurf, kb: 'z' }, opt), 'Bitte einen Dienst für den übernommenen Tag wählen.');
  const archiviert = { ...katalog, arten: { ...katalog.arten, papa: katalog.arten.papa.map((x) => (x.k === N ? { ...x, archiv: true } : x)) } };
  assert.equal(tauschPruefen({ ...entwurf, kb: N }, { ...opt, katalog: archiviert }), 'Bitte einen Dienst für den übernommenen Tag wählen.');
  const aktiv = { ...opt, daten: { v: 1, eintraege: [e] }, monate: monateAus(setzeSchicht(tauschAnwenden(mA, e, 'a'), { person: 'papa', tag: 31, k: N }), tauschAnwenden(mB, e, 'b')) };
  assert.equal(tauschPruefen({ ...entwurf, a: '2026-12-31', b: '2027-01-04' }, aktiv), GETAUSCHT);
  assert.equal(tauschPruefen({ ...entwurf, mitWem: 'x'.repeat(25) }, opt), '„Mit wem“ darf höchstens 24 Zeichen haben.');
  assert.equal(tauschPruefen({ ...entwurf, mitWem: ' ' + 'x'.repeat(24) + ' ' }, opt), null);
});

test('tauschPruefen: am übernommenen Tag steht schon derselbe Dienst → abgelehnt (sonst „halb“ statt „offen“)', () => {
  const opt = { daten: { v: 1, eintraege: [] }, monate: monateAus(mA, mB), katalog, heute };
  assert.equal(tauschPruefen({ ...entwurf, kb: S }, opt), 'Am übernommenen Tag steht schon dieser Dienst.');
  assert.equal(tauschPruefen({ ...entwurf, kb: N }, opt), null);
  // nach „schon getauscht“ geprüft: ein belegter Tag meldet weiterhin das
  const aktiv = { ...opt, daten: { v: 1, eintraege: [e] }, monate: monateAus(tauschAnwenden(mA, e, 'a'), tauschAnwenden(mB, e, 'b')) };
  assert.equal(tauschPruefen({ person: 'papa', a: '2027-01-04', b: '2026-12-31', kb: F }, aktiv), GETAUSCHT);
});

test('tauschEintrag wirft bei fehlendem Monat A oder B und bei einem Monat, der nicht der des Tages ist', () => {
  const FALSCH = { message: 'Falscher Monat für den Diensttausch.' };
  assert.throws(() => tauschEintrag(entwurf, { id: 'x1', monatA: null, monatB: mB, heute }), FALSCH);
  assert.throws(() => tauschEintrag(entwurf, { id: 'x1', monatA: mA, monatB: undefined, heute }), FALSCH);
  assert.throws(() => tauschEintrag(entwurf, { id: 'x1', monatA: mB, monatB: mB, heute }), FALSCH);
  assert.throws(() => tauschEintrag(entwurf, { id: 'x1', monatA: mA, monatB: leererMonat('2026-12'), heute }), FALSCH);
  assert.equal(tauschEintrag(entwurf, { id: 'x1', monatA: mA, monatB: leererMonat('2027-01'), heute }).vb, null);
});

test('ein Tag in einem aktiven Tausch bietet keinen zweiten an; ein gebrochener blockiert nicht', () => {
  const aFertig = setzeSchicht(tauschAnwenden(mA, e, 'a'), { person: 'papa', tag: 31, k: N });
  const bFertig = tauschAnwenden(mB, e, 'b');
  const ganz = { daten: { v: 1, eintraege: [e] }, monate: monateAus(aFertig, bFertig), katalog, heute };
  // ganz: A (jetzt frei) und B sind belegt, als abgegebener wie als übernommener Tag
  assert.equal(tauschPruefen({ person: 'papa', a: '2026-12-31', b: '2026-12-30', kb: N }, ganz), GETAUSCHT);
  assert.equal(tauschPruefen({ person: 'papa', a: '2027-01-04', b: '2026-12-31', kb: N }, ganz), GETAUSCHT);
  // halb: blockiert
  assert.equal(tauschPruefen({ person: 'papa', a: '2027-01-04', b: '2026-12-31', kb: N }, { ...ganz, monate: monateAus(aFertig, mB) }), GETAUSCHT);
  // offen: höchstens einen Tag alt blockiert, älter nicht
  const offen = { ...ganz, monate: monateAus(setzeSchicht(mA, { person: 'papa', tag: 31, k: N }), mB) };
  assert.equal(tauschPruefen({ person: 'papa', a: '2026-12-30', b: '2026-12-31', kb: F }, { ...offen, heute: '2026-12-02' }), GETAUSCHT);
  assert.equal(tauschPruefen({ person: 'papa', a: '2026-12-30', b: '2026-12-31', kb: F }, { ...offen, heute: '2026-12-03' }), null);
  // Partnermonat unbekannt: zählt als aktiv
  assert.equal(tauschPruefen({ person: 'papa', a: '2026-12-31', b: '2026-12-30', kb: N }, { ...ganz, monate: monateAus(aFertig) }), GETAUSCHT);
  // gebrochen (A übermalt): blockiert nicht
  const gebrochen = setzeSchicht(aFertig, { person: 'papa', tag: 30, k: S });
  assert.equal(tauschPruefen({ person: 'papa', a: '2026-12-30', b: '2026-12-31', kb: F }, { ...ganz, monate: monateAus(gebrochen, bFertig) }), null);
  // andere Person: blockiert nicht
  const mama = setzeSchicht(aFertig, { person: 'mama', tag: 30, k: sk('mama', 'T') });
  assert.equal(tauschPruefen({ person: 'mama', a: '2026-12-30', b: '2027-01-04', kb: sk('mama', 'N') }, { ...ganz, monate: monateAus(mama, bFertig) }), null);
});

test('tauschErsetzt: sagt, was am übernommenen Tag ersetzt wird', () => {
  assert.equal(tauschErsetzt(entwurf, mB, katalog), 'Ersetzt am 04.01.: Schulung');
  assert.equal(tauschErsetzt(entwurf, leererMonat('2027-01'), katalog), null);
  assert.equal(tauschErsetzt(entwurf, setzeSchicht(mB, { person: 'papa', tag: 4, k: 'z' }), katalog), 'Ersetzt am 04.01.: z');
});

test('Aufräumen: älter als 12 Monate und offen seit über einem Tag fallen weg; unbekannt bleibt', () => {
  const alt = { ...e, id: 'alt00001', a: '2025-11-10', b: '2025-11-30', am: '2025-11-01' };
  const grenze = { ...e, id: 'grenze01', a: '2025-11-10', b: '2025-12-01', am: '2025-11-01' };
  const offenAlt = { ...e, id: 'offen001', am: '2026-11-29' };
  const offenNeu = { ...e, id: 'offen002', am: '2026-11-30' };
  const unbekannt = { ...e, id: 'unbek001', am: '2026-10-01' };
  const zustaende = { offen001: 'offen', offen002: 'offen', unbek001: 'unbekannt', alt00001: 'unbekannt', grenze01: 'unbekannt' };
  const opt = { heute: '2026-12-01', zustand: (x) => zustaende[x.id] ?? 'ganz' };
  const daten = { v: 1, eintraege: [alt, grenze, offenAlt, offenNeu, unbekannt], fremd: { l: [{ q: 1 }] } };
  const neu = { ...e, id: 'neu00001', am: '2026-12-01' };
  const r = tauschHinzufuegen(daten, neu, opt);
  assert.deepEqual(r.eintraege.map((x) => x.id), ['grenze01', 'offen002', 'unbek001', 'neu00001']);
  assert.deepEqual(r.fremd, daten.fremd);
  assert.deepEqual(tauschHinzufuegen(r, neu, opt), r);
  const ohne = tauschEntfernen(daten, 'unbek001', opt);
  assert.deepEqual(ohne.eintraege.map((x) => x.id), ['grenze01', 'offen002']);
  assert.equal(tauschEntfernen(ohne, 'unbek001', opt), ohne);
  // ohne `zustand` fällt kein offener weg
  assert.deepEqual(tauschEntfernen(daten, 'nichtda1', { heute: '2026-12-01' }).eintraege.map((x) => x.id), ['grenze01', 'offen001', 'offen002', 'unbek001']);
  // zu groß → TEXT_TAUSCH_VOLL
  assert.throws(() => tauschHinzufuegen({ v: 1, eintraege: [], fremd: { x: 'a'.repeat(5990) } }, neu, opt), { message: TEXT_TAUSCH_VOLL });
});

test('Zusätze und Notizen bleiben unberührt; monatZaehlung zählt B, nicht A', () => {
  const zusatz = { person: 'papa', k: S, von: '18:00', bis: '19:00' };
  const mitA = setzeNotiz(zusatzHinzufuegen(mA, { ...zusatz, tag: 30 }), { person: 'papa', tag: 30, text: 'Notiz A' });
  const mitB = setzeNotiz(zusatzHinzufuegen(mB, { ...zusatz, tag: 4 }), { person: 'papa', tag: 4, text: 'Notiz B' });
  const aFertig = tauschAnwenden(mitA, e, 'a');
  const bFertig = tauschAnwenden(mitB, e, 'b');
  assert.deepEqual([aFertig.z, aFertig.n], [mitA.z, mitA.n]);
  assert.deepEqual([bFertig.z, bFertig.n], [mitB.z, mitB.n]);
  assert.equal(monatZaehlung(mitA, katalog, 'papa').dienste, 1);
  assert.equal(monatZaehlung(aFertig, katalog, 'papa').dienste, 0);
  assert.deepEqual(monatZaehlung(bFertig, katalog, 'papa').jeArt, [{ k: F, kuerzel: 'F', anzahl: 1 }]);
});

test('tauschPartnerMonate: nur die fehlenden Monate von Tauschen, die einen der Monate berühren, ohne Doppelte', () => {
  const e = (a, b) => ({ person: 'papa', a, b });
  const daten = { v: 1, eintraege: [e('2026-12-05', '2027-02-10'), e('2026-12-20', '2027-02-01'), e('2027-03-01', '2026-11-30'), e('2026-12-01', '2026-12-02'), e('2027-05-01', '2027-06-01')] };
  assert.deepEqual(tauschPartnerMonate(daten, ['2026-11', '2026-12', '2027-01']), ['2027-02', '2027-03']);
  assert.deepEqual(tauschPartnerMonate(daten, ['2027-01', '2027-02', '2027-03']), ['2026-11', '2026-12']);
  assert.deepEqual(tauschPartnerMonate(null, ['2026-12']), []);
});
