// Offener Diensttausch (1.6.0): nur ein Tag (übernommen oder abgegeben), Rückgabe bis zur Frist (+12 Monate), danach geschlossen in 1.5.0-Form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAUSCH_FRIST_MONATE, TAUSCH_RICHTUNGEN, TEXT_TAUSCH_WEG, leererTausch, tauschAm, tauschAnwenden, tauschAusText, tauschEntfernen, tauschErsetzen,
  tauschFrist, tauschHinzufuegen, tauschIstOffen, tauschOffenEintrag, tauschOffenPruefen, tauschOffenTag, tauschPartnerMonate, tauschPruefen,
  tauschRueckgabeEintrag, tauschRueckgabePruefen, tauschSeiten, tauschText, tauschZuruecknehmen, tauschZustand,
} from '../../src/domain/schicht-tausch.js';
import { leererMonat, schichtAm, setzeSchicht, setzeTagZeiten, standardKatalog, tagZeitenAm } from '../../src/domain/schicht.js';

const katalog = standardKatalog();
const sk = (person, kuerzel) => katalog.arten[person].find((x) => x.kuerzel === kuerzel).k;
// Früh-, Spät-/Schulungs-, Nachtdienst und Urlaub der Demo-Person
const [F, S, N, U] = ['F', 'S', 'N', 'U'].map((kuerzel) => sk('papa', kuerzel));
const monateAus = (...liste) => (jm) => liste.find((m) => m?.jm === jm) ?? null;
const GETAUSCHT = 'Dieser Tag ist schon getauscht – bitte zuerst den Tausch rückgängig machen.';
const FALSCH = { message: 'Falscher Monat für den Diensttausch.' };
const schicht = (m, tag, k) => setzeSchicht(m, { person: 'papa', tag, k });
const zeiten = (m, tag, von, bis) => setzeTagZeiten(m, { person: 'papa', tag, von, bis }, katalog);

// Februar 2026: am 06. Frühdienst mit eigenen Zeiten, am 10. Nachtdienst mit eigenen Zeiten, am 12. frei, am 14. Urlaub
const mFeb = schicht(zeiten(schicht(zeiten(schicht(leererMonat('2026-02'), 6, F), 6, '06:00', '14:00'), 10, N), 10, '20:00', '06:00'), 14, U);
// März 2026: am 03. Schulung mit eigenen Zeiten, sonst frei
const mMar = zeiten(schicht(leererMonat('2026-03'), 3, S), 3, '08:00', '12:00');
const heute = '2026-02-01';
const ab = tauschOffenEintrag({ person: 'papa', richtung: 'abgegeben', tag: '2026-02-06', mitWem: '  Kollege ' }, { id: 'offen001', monat: mFeb, heute });
const ueb = tauschOffenEintrag({ person: 'papa', richtung: 'uebernommen', tag: '2026-02-06', kb: S }, { id: 'offen002', monat: mFeb, heute });
// ein geschlossener Tausch in 1.5.0-Form
const alt150 = { id: 'abcd1234', person: 'papa', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, am: '2026-12-01' };

test('Konstanten und Grundfunktionen des offenen Tauschs', () => {
  assert.deepEqual(TAUSCH_RICHTUNGEN, ['uebernommen', 'abgegeben']);
  assert.equal(TAUSCH_FRIST_MONATE, 12);
  assert.equal(TEXT_TAUSCH_WEG, 'Diesen Diensttausch gibt es nicht mehr.');
  assert.deepEqual(ab, { id: 'offen001', person: 'papa', richtung: 'abgegeben', frist: '2027-02-06', a: '2026-02-06', ka: F, za: ['06:00', '14:00'], mitWem: 'Kollege', am: heute });
  assert.deepEqual(ueb, { id: 'offen002', person: 'papa', richtung: 'uebernommen', frist: '2027-02-06', b: '2026-02-06', kb: S, vb: F, zb: ['06:00', '14:00'], am: heute });
  assert.equal(tauschIstOffen(ab), true);
  assert.equal(tauschIstOffen(ueb), true);
  assert.equal(tauschIstOffen(alt150), false);
  assert.deepEqual(tauschSeiten(alt150), ['a', 'b']);
  assert.deepEqual(tauschSeiten(ab), ['a']);
  assert.deepEqual(tauschSeiten(ueb), ['b']);
  assert.equal(tauschOffenTag(ab), '2026-02-06');
  assert.equal(tauschOffenTag(ueb), '2026-02-06');
});

test('Hülle: offener Eintrag (beide Richtungen) hin und zurück; im Text r und f, v bleibt 1', () => {
  const d = { ...leererTausch(), eintraege: [ab, ueb, alt150] };
  const text = tauschText(d);
  const j = JSON.parse(text);
  assert.equal(j.v, 1);
  assert.equal(j.l[0].r, 'abgegeben');
  assert.equal(j.l[0].f, '2027-02-06');
  assert.deepEqual(j.l[0], { i: 'offen001', p: 'papa', r: 'abgegeben', f: '2027-02-06', a: '2026-02-06', ka: F, za: ['06:00', '14:00'], m: 'Kollege', t: heute });
  assert.deepEqual(j.l[1], { i: 'offen002', p: 'papa', r: 'uebernommen', f: '2027-02-06', b: '2026-02-06', kb: S, vb: F, zb: ['06:00', '14:00'], t: heute });
  assert.deepEqual(j.l[2], { i: 'abcd1234', p: 'papa', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, t: '2026-12-01' });
  const r = tauschAusText(text);
  assert.deepEqual(r, { daten: d, unlesbar: false, warnungen: [] });
  assert.equal(tauschText(r.daten), text);
  // übernommen auf einen vorher freien Tag: vb null
  const frei = tauschOffenEintrag({ person: 'papa', richtung: 'uebernommen', tag: '2026-02-12', kb: N }, { id: 'offen003', monat: mFeb, heute });
  assert.deepEqual(frei, { id: 'offen003', person: 'papa', richtung: 'uebernommen', frist: '2027-02-12', b: '2026-02-12', kb: N, vb: null, am: heute });
  assert.deepEqual(tauschAusText(tauschText({ v: 1, eintraege: [frei] })).daten.eintraege, [frei]);
  // ungültiger offener Eintrag im Speicher wirft beim Schreiben
  assert.throws(() => tauschText({ v: 1, eintraege: [{ ...ab, b: '2026-03-03' }] }), { message: 'Ungültiger Diensttausch.' });
  assert.throws(() => tauschText({ v: 1, eintraege: [{ ...alt150, frist: '2027-12-30' }] }), { message: 'Ungültiger Diensttausch.' });
});

test('1.5.0-Kompatibilität: jeder offene Kurzeintrag hat einen Schlüssel außerhalb der 1.5.0-Liste, ein geschlossener nicht', () => {
  const ALT = new Set(['i', 'p', 'a', 'b', 'ka', 'kb', 'vb', 'za', 'zb', 'm', 't']); // eingefroren aus 1.5.0 (e17ec59)
  const geschlossen = tauschRueckgabeEintrag(ab, { tag: '2026-03-03', kb: N }, { monat: mMar });
  const l = JSON.parse(tauschText({ v: 1, eintraege: [ab, ueb, geschlossen, alt150] })).l;
  for (const offen of [l[0], l[1]]) assert.equal(Object.keys(offen).some((k) => !ALT.has(k)), true);
  for (const zu of [l[2], l[3]]) assert.equal(Object.keys(zu).every((k) => ALT.has(k)), true);
  // die neuen Schlüssel sind genau r und f
  assert.deepEqual(Object.keys(l[0]).filter((k) => !ALT.has(k)), ['r', 'f']);
  assert.deepEqual(Object.keys(l[1]).filter((k) => !ALT.has(k)), ['r', 'f']);
});

test('Hülle: ungültige Mischformen (r mit beiden Seiten, f ohne r, unbekannte r) → roh in fremd.l', () => {
  const basisAb = { i: 'misch001', p: 'papa', r: 'abgegeben', f: '2027-02-06', a: '2026-02-06', ka: F, t: heute };
  const basisUeb = { i: 'misch002', p: 'papa', r: 'uebernommen', f: '2027-02-06', b: '2026-02-06', kb: S, vb: null, t: heute };
  const roh = [
    { ...basisAb, b: '2026-03-03', kb: N, vb: null }, // r mit beiden Seiten
    { ...basisUeb, a: '2026-01-02', ka: F }, // r mit beiden Seiten
    { ...basisAb, zb: ['08:00', '12:00'] }, // Zeiten der anderen Seite
    { ...basisUeb, za: ['08:00', '12:00'] },
    { i: 'misch003', p: 'papa', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, f: '2027-12-30', t: '2026-12-01' }, // f ohne r
    { ...basisAb, r: 'getauscht' }, // unbekannte r
    { ...basisAb, f: undefined, i: 'misch004' }, // r ohne f
    { ...basisAb, f: '06.02.2027' }, // f kein Datum
    { ...basisUeb, vb: undefined }, // übernommen ohne vb
  ].map((w) => JSON.parse(JSON.stringify(w)));
  const r = tauschAusText(JSON.stringify({ v: 1, l: roh }));
  assert.equal(r.unlesbar, false);
  assert.deepEqual(r.daten.eintraege, []);
  assert.deepEqual(r.daten.fremd, { l: roh });
  assert.deepEqual(JSON.parse(tauschText(r.daten)).l, roh);
  // die gültigen Grundformen werden gelesen
  assert.equal(tauschAusText(JSON.stringify({ v: 1, l: [basisAb, basisUeb] })).daten.eintraege.length, 2);
});

test('tauschFrist: +1 Jahr, 29.02. → 28.02.', () => {
  assert.equal(tauschFrist('2026-02-06'), '2027-02-06');
  assert.equal(tauschFrist('2028-02-29'), '2029-02-28');
});

test('tauschZustand offen: nur der eigene Monat zählt (anderer null); ganz, offen, gebrochen, unbekannt; nie halb', () => {
  const abFertig = tauschAnwenden(mFeb, ab, 'a');
  const uebFertig = tauschAnwenden(mFeb, ueb, 'b');
  const uebermalt = schicht(mFeb, 6, N);
  assert.equal(tauschZustand(ab, abFertig, null), 'ganz');
  assert.equal(tauschZustand(ab, mFeb, null), 'offen');
  assert.equal(tauschZustand(ab, uebermalt, null), 'gebrochen');
  assert.equal(tauschZustand(ab, null, mFeb), 'unbekannt');
  assert.equal(tauschZustand(ueb, null, uebFertig), 'ganz');
  assert.equal(tauschZustand(ueb, null, mFeb), 'offen');
  assert.equal(tauschZustand(ueb, null, uebermalt), 'gebrochen');
  assert.equal(tauschZustand(ueb, uebFertig, null), 'unbekannt');
  for (const x of [null, mFeb, abFertig, uebFertig, uebermalt, schicht(mFeb, 6, null)]) {
    for (const y of [null, mFeb, abFertig, uebFertig, uebermalt]) {
      assert.notEqual(tauschZustand(ab, x, y), 'halb');
      assert.notEqual(tauschZustand(ueb, x, y), 'halb');
    }
  }
});

test('tauschOffenEintrag + tauschAnwenden/Zuruecknehmen: übernommen ersetzt den Tag und bringt Schicht und eigene Zeiten (zt) exakt zurück', () => {
  const uebFertig = tauschAnwenden(mFeb, ueb, 'b');
  assert.equal(schichtAm(uebFertig, 'papa', 6), S);
  assert.equal(tagZeitenAm(uebFertig, 'papa', 6), null);
  assert.equal(tauschAnwenden(uebFertig, ueb, 'b'), uebFertig);
  const zurueck = tauschZuruecknehmen(tauschZuruecknehmen(uebFertig, ueb, 'b'), ueb, 'b');
  assert.equal(schichtAm(zurueck, 'papa', 6), F);
  assert.deepEqual(tagZeitenAm(zurueck, 'papa', 6), { von: '06:00', bis: '14:00' });
  assert.deepEqual(zurueck, mFeb);
  // abgegeben: Tag frei, zurück mit Schicht und Zeiten
  const abFertig = tauschAnwenden(mFeb, ab, 'a');
  assert.equal(schichtAm(abFertig, 'papa', 6), null);
  assert.deepEqual(tauschZuruecknehmen(abFertig, ab, 'a'), mFeb);
  // die fehlende Seite gibt es nicht
  assert.throws(() => tauschAnwenden(mFeb, ab, 'b'), { message: 'Ungültige Seite.' });
  assert.throws(() => tauschZuruecknehmen(mFeb, ueb, 'a'), { message: 'Ungültige Seite.' });
  // falscher oder fehlender Monat; abgegeben ohne Dienst
  assert.throws(() => tauschOffenEintrag({ person: 'papa', richtung: 'abgegeben', tag: '2026-02-06' }, { id: 'x1', monat: mMar, heute }), FALSCH);
  assert.throws(() => tauschOffenEintrag({ person: 'papa', richtung: 'uebernommen', tag: '2026-02-06', kb: N }, { id: 'x1', monat: null, heute }), FALSCH);
  assert.throws(() => tauschOffenEintrag({ person: 'papa', richtung: 'abgegeben', tag: '2026-02-12' }, { id: 'x1', monat: mFeb, heute }), { message: 'Am abgegebenen Tag ist kein Dienst eingetragen.' });
});

test('tauschOffenPruefen: alle Meldungen', () => {
  const opt = { daten: { v: 1, eintraege: [] }, monate: monateAus(mFeb), katalog, heute };
  const abE = { person: 'papa', richtung: 'abgegeben', tag: '2026-02-06' };
  const uebE = { person: 'papa', richtung: 'uebernommen', tag: '2026-02-12', kb: S };
  assert.equal(tauschOffenPruefen(abE, opt), null);
  assert.equal(tauschOffenPruefen(uebE, opt), null);
  assert.equal(tauschOffenPruefen({ ...uebE, tag: '2026-02-06', kb: N }, opt), null);
  assert.equal(tauschOffenPruefen({ ...abE, tag: '2026-02-12' }, opt), 'Am abgegebenen Tag ist kein Dienst eingetragen.');
  assert.equal(tauschOffenPruefen({ ...abE, tag: '2026-02-14' }, opt), 'Am abgegebenen Tag ist kein Dienst eingetragen.');
  assert.equal(tauschOffenPruefen({ ...uebE, kb: U }, opt), 'Bitte einen Dienst für den übernommenen Tag wählen.');
  assert.equal(tauschOffenPruefen({ ...uebE, kb: undefined }, opt), 'Bitte einen Dienst für den übernommenen Tag wählen.');
  assert.equal(tauschOffenPruefen({ ...uebE, kb: 'z' }, opt), 'Bitte einen Dienst für den übernommenen Tag wählen.');
  const archiviert = { ...katalog, arten: { ...katalog.arten, papa: katalog.arten.papa.map((x) => (x.k === N ? { ...x, archiv: true } : x)) } };
  assert.equal(tauschOffenPruefen({ ...uebE, kb: N }, { ...opt, katalog: archiviert }), 'Bitte einen Dienst für den übernommenen Tag wählen.');
  assert.equal(tauschOffenPruefen({ ...uebE, tag: '2026-02-06', kb: F }, opt), 'Am übernommenen Tag steht schon dieser Dienst.');
  // Tag in einem aktiven Tausch der Person (auch einem offenen, auch lange nach dem Eintragen)
  const aktiv = { ...opt, daten: { v: 1, eintraege: [ab] }, monate: monateAus(tauschAnwenden(mFeb, ab, 'a')) };
  assert.equal(tauschOffenPruefen({ ...uebE, tag: '2026-02-06', kb: N }, aktiv), GETAUSCHT);
  assert.equal(tauschOffenPruefen({ ...uebE, tag: '2026-02-06', kb: N }, { ...aktiv, monate: monateAus(mFeb), heute: '2026-12-01' }), GETAUSCHT);
  assert.equal(tauschOffenPruefen({ ...abE, person: 'mama', tag: '2026-02-06' }, { ...aktiv, monate: monateAus(setzeSchicht(mFeb, { person: 'mama', tag: 6, k: sk('mama', 'T') })) }), null);
  assert.equal(tauschOffenPruefen({ ...uebE, mitWem: 'x'.repeat(25) }, opt), '„Mit wem“ darf höchstens 24 Zeichen haben.');
  assert.equal(tauschOffenPruefen({ ...uebE, mitWem: ' ' + 'x'.repeat(24) + ' ' }, opt), null);
  const RICHTUNG = 'Bitte „Dienst übernehmen“ oder „Dienst abgeben“ wählen.';
  assert.equal(tauschOffenPruefen({ ...uebE, richtung: 'getauscht' }, opt), RICHTUNG);
  assert.equal(tauschOffenPruefen({ ...uebE, richtung: undefined }, opt), RICHTUNG);
});

test('tauschAm: offener ganz-Tausch ist am eigenen Tag sichtbar (offen: true), blockiert den Tag; gebrochen blockiert nicht', () => {
  const daten = { v: 1, eintraege: [ab] };
  const abFertig = schicht(tauschAnwenden(mFeb, ab, 'a'), 20, N);
  assert.deepEqual(tauschAm(daten, monateAus(abFertig), 'papa', '2026-02-06'), { eintrag: ab, zustand: 'ganz', rolle: 'a', offen: true });
  assert.equal(tauschAm(daten, monateAus(mFeb), 'papa', '2026-02-06'), null); // offen (noch nicht geschrieben)
  assert.equal(tauschAm(daten, monateAus(abFertig), 'mama', '2026-02-06'), null);
  assert.equal(tauschAm(daten, monateAus(abFertig), 'papa', '2026-02-07'), null);
  assert.equal(tauschAm(daten, monateAus(), 'papa', '2026-02-06'), null);
  const uebDaten = { v: 1, eintraege: [ueb] };
  assert.deepEqual(tauschAm(uebDaten, monateAus(tauschAnwenden(mFeb, ueb, 'b')), 'papa', '2026-02-06'), { eintrag: ueb, zustand: 'ganz', rolle: 'b', offen: true });
  // blockiert: auch ein geschlossener Tausch (1.5.0) kann den Tag nicht nehmen
  const opt = { daten, monate: monateAus(abFertig), katalog, heute };
  assert.equal(tauschPruefen({ person: 'papa', a: '2026-02-20', b: '2026-02-06', kb: F }, opt), GETAUSCHT);
  assert.equal(tauschOffenPruefen({ person: 'papa', richtung: 'uebernommen', tag: '2026-02-06', kb: N }, opt), GETAUSCHT);
  // gebrochen (Tag von Hand übermalt): nicht sichtbar, blockiert nicht
  const gebrochen = schicht(abFertig, 6, S);
  assert.equal(tauschAm(daten, monateAus(gebrochen), 'papa', '2026-02-06'), null);
  assert.equal(tauschOffenPruefen({ person: 'papa', richtung: 'abgegeben', tag: '2026-02-06' }, { ...opt, monate: monateAus(gebrochen) }), null);
  assert.equal(tauschPruefen({ person: 'papa', a: '2026-02-06', b: '2026-02-12', kb: N }, { ...opt, monate: monateAus(gebrochen) }), null);
});

test('tauschRueckgabePruefen: alle Meldungen; tauschRueckgabeEintrag schließt in 1.5.0-Form (abgegeben → b/kb/vb/zb, übernommen → a/ka/za)', () => {
  const abFeb = tauschAnwenden(mFeb, ab, 'a');
  const uebFeb = tauschAnwenden(mFeb, ueb, 'b');
  const optAb = { daten: { v: 1, eintraege: [ab] }, monate: monateAus(abFeb, mMar), katalog };
  const optUeb = { daten: { v: 1, eintraege: [ueb] }, monate: monateAus(uebFeb, mMar), katalog };
  assert.equal(tauschRueckgabePruefen(ab, { tag: '2026-03-03', kb: N }, optAb), null);
  assert.equal(tauschRueckgabePruefen(ab, { tag: '2026-02-12', kb: N }, optAb), null);
  assert.equal(tauschRueckgabePruefen(ueb, { tag: '2026-03-03' }, optUeb), null);
  assert.equal(tauschRueckgabePruefen(ueb, { tag: '2026-02-10' }, optUeb), null);
  // auch weit nach der Frist
  assert.equal(tauschRueckgabePruefen(ab, { tag: '2027-06-01', kb: N }, { ...optAb, monate: monateAus(abFeb, leererMonat('2027-06')) }), null);
  assert.equal(tauschRueckgabePruefen(alt150, { tag: '2026-03-03', kb: N }, optAb), 'Dieser Diensttausch ist schon abgeschlossen.');
  assert.equal(tauschRueckgabePruefen(ab, { tag: '2026-02-06', kb: N }, optAb), 'Bitte zwei verschiedene Tage wählen.');
  assert.equal(tauschRueckgabePruefen(ueb, { tag: '2026-02-06' }, optUeb), 'Bitte zwei verschiedene Tage wählen.');
  assert.equal(tauschRueckgabePruefen(ab, { tag: '2026-03-03', kb: U }, optAb), 'Bitte einen Dienst für den übernommenen Tag wählen.');
  assert.equal(tauschRueckgabePruefen(ab, { tag: '2026-03-03' }, optAb), 'Bitte einen Dienst für den übernommenen Tag wählen.');
  assert.equal(tauschRueckgabePruefen(ab, { tag: '2026-03-03', kb: S }, optAb), 'Am übernommenen Tag steht schon dieser Dienst.');
  assert.equal(tauschRueckgabePruefen(ueb, { tag: '2026-02-12' }, optUeb), 'Am Rückgabetag ist kein Dienst eingetragen.');
  assert.equal(tauschRueckgabePruefen(ueb, { tag: '2026-02-14' }, optUeb), 'Am Rückgabetag ist kein Dienst eingetragen.');
  // der Rückgabetag steckt in einem anderen aktiven Tausch
  const anderer = tauschOffenEintrag({ person: 'papa', richtung: 'abgegeben', tag: '2026-03-03' }, { id: 'anders01', monat: mMar, heute });
  const marAnders = tauschAnwenden(mMar, anderer, 'a');
  assert.equal(tauschRueckgabePruefen(ab, { tag: '2026-03-03', kb: N }, { ...optAb, daten: { v: 1, eintraege: [ab, anderer] }, monate: monateAus(abFeb, marAnders) }), GETAUSCHT);
  const uebAnders = tauschOffenEintrag({ person: 'papa', richtung: 'abgegeben', tag: '2026-02-10' }, { id: 'anders02', monat: uebFeb, heute });
  assert.equal(tauschRueckgabePruefen(ueb, { tag: '2026-02-10' }, { ...optUeb, daten: { v: 1, eintraege: [ueb, uebAnders] } }), GETAUSCHT);

  // abgegeben → die Person übernimmt zurück: b = Rückgabetag
  const zuAb = tauschRueckgabeEintrag(ab, { tag: '2026-03-03', kb: N }, { monat: mMar });
  assert.deepEqual(zuAb, { id: 'offen001', person: 'papa', a: '2026-02-06', b: '2026-03-03', ka: F, kb: N, vb: S, za: ['06:00', '14:00'], zb: ['08:00', '12:00'], mitWem: 'Kollege', am: heute });
  assert.equal(tauschIstOffen(zuAb), false);
  // übernommen → der Kollege gibt zurück: a = Rückgabetag (wird frei)
  const zuUeb = tauschRueckgabeEintrag(ueb, { tag: '2026-02-10' }, { monat: uebFeb });
  assert.deepEqual(zuUeb, { id: 'offen002', person: 'papa', a: '2026-02-10', b: '2026-02-06', ka: N, kb: S, vb: F, za: ['20:00', '06:00'], zb: ['06:00', '14:00'], am: heute });
  // geschlossen in 1.5.0-Form: Text hin und zurück gleich
  assert.deepEqual(tauschAusText(tauschText({ v: 1, eintraege: [zuAb, zuUeb] })).daten.eintraege, [zuAb, zuUeb]);
  // danach gilt der geschlossene Tausch: erst halb, nach dem Schreiben des Rückgabetags ganz; Rückgängig bringt beide Tage exakt zurück
  const marFertig = tauschAnwenden(mMar, zuAb, 'b');
  assert.equal(tauschZustand(zuAb, abFeb, mMar), 'halb');
  assert.equal(tauschZustand(zuAb, abFeb, marFertig), 'ganz');
  assert.deepEqual(tauschZuruecknehmen(abFeb, zuAb, 'a'), mFeb);
  assert.deepEqual(tauschZuruecknehmen(marFertig, zuAb, 'b'), mMar);
  const febBeide = tauschAnwenden(uebFeb, zuUeb, 'a');
  assert.equal(tauschZustand(zuUeb, uebFeb, uebFeb), 'halb');
  assert.equal(tauschZustand(zuUeb, febBeide, febBeide), 'ganz');
  assert.deepEqual(tauschZuruecknehmen(tauschZuruecknehmen(febBeide, zuUeb, 'b'), zuUeb, 'a'), mFeb);
  // Fehler: falscher Monat, kein Dienst am Rückgabetag, schon geschlossen
  assert.throws(() => tauschRueckgabeEintrag(ab, { tag: '2026-03-03', kb: N }, { monat: mFeb }), FALSCH);
  assert.throws(() => tauschRueckgabeEintrag(ueb, { tag: '2026-02-10' }, { monat: null }), FALSCH);
  assert.throws(() => tauschRueckgabeEintrag(ueb, { tag: '2026-02-12' }, { monat: uebFeb }), { message: 'Am Rückgabetag ist kein Dienst eingetragen.' });
  assert.throws(() => tauschRueckgabeEintrag(zuAb, { tag: '2026-03-04', kb: N }, { monat: mMar }), { message: 'Dieser Diensttausch ist schon abgeschlossen.' });
});

test('tauschErsetzen: ersetzt am Platz, wiederholbar, weg → TEXT_TAUSCH_WEG, schon anders geschlossen → Meldung', () => {
  const x = { ...alt150, id: 'xxxx0001', a: '2026-01-10', b: '2026-01-12' };
  const y = { ...alt150, id: 'yyyy0001', a: '2026-02-20', b: '2026-02-22' };
  const daten = { v: 1, eintraege: [x, ab, y], fremd: { l: [{ q: 1 }] } };
  const opt = { heute: '2026-03-01', zustand: () => 'ganz' };
  const zu = tauschRueckgabeEintrag(ab, { tag: '2026-03-03', kb: N }, { monat: mMar });
  const r = tauschErsetzen(daten, zu, opt);
  assert.deepEqual(r.eintraege, [x, zu, y]);
  assert.deepEqual(r.fremd, daten.fremd);
  assert.equal(tauschErsetzen(r, zu, opt), r);
  assert.equal(tauschErsetzen(r, { ...zu, vb: S }, opt), r); // gleicher Inhalt, anderes Objekt
  assert.equal(tauschErsetzen(daten, ab, opt), daten);
  // offen durch offen (z. B. mit wem geändert) ist erlaubt
  assert.deepEqual(tauschErsetzen(daten, { ...ab, mitWem: 'Kollegin' }, opt).eintraege[1].mitWem, 'Kollegin');
  assert.throws(() => tauschErsetzen({ v: 1, eintraege: [x, y] }, zu, opt), { message: TEXT_TAUSCH_WEG });
  assert.throws(() => tauschErsetzen(r, { ...zu, b: '2026-03-04' }, opt), { message: 'Die Rückgabe wurde inzwischen schon eingetragen.' });
  // räumt auf wie tauschHinzufuegen: der alte geschlossene fällt weg, der ersetzte bleibt
  const r2 = tauschErsetzen(daten, zu, { heute: '2027-02-01', zustand: () => 'ganz' });
  assert.deepEqual(r2.eintraege.map((e) => e.id), ['offen001', 'yyyy0001']);
});

test('Aufräumen: offene Einträge fallen nie weg (älter als 12 Monate, Zustand offen seit Tagen); geschlossene wie bisher', () => {
  const altAb = { ...ab, id: 'altab001', a: '2024-01-10', frist: '2025-01-10', am: '2024-01-01' };
  const altUeb = { ...ueb, id: 'altub001', b: '2024-01-12', frist: '2025-01-12', am: '2024-01-01' };
  const altZu = { ...alt150, id: 'altzu001', a: '2024-01-10', b: '2024-01-12', am: '2024-01-01' };
  const offenZu = { ...alt150, id: 'offzu001', am: '2026-11-01' };
  // der Zustand-Rückruf des Aufrufers kennt nur geschlossene Tausche (er liest Monat A und B) – für offene wird er nie gefragt
  const zustand = (e) => {
    if (tauschIstOffen(e)) throw new Error('für offene nicht gefragt');
    return 'offen';
  };
  const opt = { heute: '2026-12-01', zustand };
  const daten = { v: 1, eintraege: [altAb, altZu, altUeb, offenZu] };
  const neu = { ...alt150, id: 'neu00001', am: '2026-12-01' };
  assert.deepEqual(tauschHinzufuegen(daten, neu, opt).eintraege.map((e) => e.id), ['altab001', 'altub001', 'neu00001']);
  assert.deepEqual(tauschEntfernen(daten, 'nichtda1', opt).eintraege.map((e) => e.id), ['altab001', 'altub001']);
  assert.deepEqual(tauschEntfernen(daten, 'altab001', opt).eintraege.map((e) => e.id), ['altub001']);
});

test('tauschPartnerMonate ignoriert offene Einträge', () => {
  const zu = { ...alt150, a: '2026-02-06', b: '2026-04-01' };
  const daten = { v: 1, eintraege: [ab, ueb, { ...ab, id: 'ab000002', a: '2026-05-01' }, zu] };
  assert.deepEqual(tauschPartnerMonate(daten, ['2026-02']), ['2026-04']);
  assert.deepEqual(tauschPartnerMonate(daten, ['2026-05']), []);
});
