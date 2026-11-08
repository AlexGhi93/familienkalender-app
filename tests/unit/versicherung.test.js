// Versicherung (Privatarzt): Polizze, Rechnungen je Kalenderjahr – Speicherformat, Prüfen, reine Änderungen, Rückgängig.
// Testdaten: erfunden (Kind „Mia“, keine Polizzennummer).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../../src/domain/index.js';
import {
  MAX_JAHR_ZEICHEN,
  MAX_VERSICHERUNG_ZEICHEN,
  POLIZZE_VORLAGEN,
  TEXT_JAHR_VOLL,
  TEXT_VERSICHERUNG_VOLL,
  erstattungSetzen,
  jahrGesperrtFehler,
  jahrText,
  jahrWarnungen,
  leeresJahr,
  leereVersicherung,
  neueVersicherungId,
  normalisierePolizze,
  normalisiereRechnung,
  polizzeAendern,
  polizzeAnlegen,
  polizzeAusVorlage,
  polizzePruefen,
  polizzeVorlage,
  pruefeJahr,
  pruefeVersicherung,
  rechnungJahr,
  rechnungJahrWechseln,
  rechnungLoeschen,
  rechnungPruefen,
  rechnungSetzen,
  rechnungSpur,
  rechnungWiederherstellen,
  versicherungGesperrtFehler,
  versicherungJahrBekannt,
  versicherungJahrEintragen,
  versicherungText,
  versicherungWarnungen,
} from '../../src/domain/versicherung.js';

const HEUTE = '2026-11-08';
const P = polizzeAusVorlage('medplusBasic', { person: 'Mia', beginn: '2026-10-20' }, { zufall: () => 0 });
const MIT = polizzeAnlegen(leereVersicherung(), P);

const rechnung = (mehr = {}) => ({ id: 'rech0001', kategorie: 'physio', datum: '2026-10-28', betragCent: 9000, eingereichtAm: '2026-10-30', ...mehr });
const tiefKopie = (x) => JSON.parse(JSON.stringify(x));

/** Ein Eintrag einer neueren Version (unbekanntes Feld) – muss beim Schreiben unverändert bleiben. */
const FREMD_RECHNUNG = { i: 'neu00001', k: 'physio', d: '2026-03-01', b: 100, e: '2026-03-02', zz: { tiefer: [1, 'zwei'] } };
const FREMD_KATEGORIE = { i: 'zahn', n: 'Zahn', l: 10000, q: 1 };

describe('Versicherung: Vorlage, Kennungen, leere Daten', () => {
  test('leere Daten; Kennungen aus 0-9 und a-v; domain/index.js', () => {
    assert.deepEqual(leereVersicherung(), { v: 1, polizze: null, ab: null });
    assert.deepEqual(leeresJahr(2026), { v: 1, jahr: 2026, rechnungen: [] });
    assert.notEqual(leeresJahr(2026).rechnungen, leeresJahr(2026).rechnungen);
    for (let i = 0; i < 50; i += 1) assert.match(neueVersicherungId(), /^[0-9a-v]{8}$/);
    assert.equal(neueVersicherungId(() => 0.9999999), 'vvvvvvvv');
    for (const name of ['polizzeAnlegen', 'rechnungSetzen', 'versicherungText', 'pruefeJahr', 'jahresStand', 'offeneErstattungen']) assert.equal(typeof domain[name], 'function', name);
    assert.equal(typeof domain.autoSetzen, 'function', 'Autos weiter erreichbar');
    assert.equal(domain.MAX_NOTIZ, 300, 'Termin-Notiz unverändert');
  });

  test('POLIZZE_VORLAGEN.medplusBasic: 5 Kategorien mit den Limits der Polizze (Spec §2), Maximum, Hinweis; eingefroren', () => {
    const v = POLIZZE_VORLAGEN.medplusBasic;
    assert.equal(v.name, 'MedPLUS Privatarzt Basic');
    assert.deepEqual(v.kategorien.map((k) => [k.id, k.name, k.limitCent]), [
      ['arzt', 'Schul-/Alternativmedizin beim Privatarzt', 160000],
      ['physio', 'Physiotherapie', 49000],
      ['psycho', 'Psychotherapie', 41500],
      ['medi', 'Medikamente/Rezeptgebühren', 41500],
      ['heil', 'Heilbehelfe', 22400],
    ]);
    assert.equal(v.maximumCent, 314400);
    assert.match(v.kategorien[1].info, /Logopädie.*Osteopathie/);
    assert.match(v.kategorien[4].info, /Brillen.*Einlagen.*Bandagen/);
    assert.match(v.hinweis, /80 %/);
    assert.match(v.hinweis, /ÖGK/);
    assert.ok(Object.isFrozen(v) && Object.isFrozen(v.kategorien) && Object.isFrozen(v.kategorien[0]));
  });

  test('polizzeAusVorlage: neue Kennung, Kategorien und Limits der Vorlage, Person und Beginn aus den Feldern', () => {
    assert.deepEqual(P, {
      id: '00000000',
      name: 'MedPLUS Privatarzt Basic',
      person: 'Mia',
      beginn: '2026-10-20',
      kategorien: POLIZZE_VORLAGEN.medplusBasic.kategorien.map((k) => ({ ...k })),
      maximumCent: 314400,
      vorlage: 'medplusBasic',
    });
    assert.equal(polizzeVorlage(P), POLIZZE_VORLAGEN.medplusBasic);
    assert.equal(polizzeVorlage({ ...P, vorlage: undefined }), null);
    assert.throws(() => polizzeAusVorlage('gibtsnicht', { beginn: '2026-10-20' }), /Vorlage/);
    assert.throws(() => polizzeAusVorlage('medplusBasic', {}), /Beginn/);
  });

  test('polizzePruefen: Pflicht Name, Beginn, ≥ 1 Kategorie, Limits/Maximum in ganzen Cent; Person freiwillig', () => {
    assert.equal(polizzePruefen(P), null);
    assert.equal(polizzePruefen({ ...P, person: '' }), null);
    const fehler = [
      [{ name: ' ' }, /Namen/],
      [{ beginn: '2026-02-30' }, /Beginn/],
      [{ kategorien: [] }, /Kategorie/],
      [{ maximumCent: -1 }, /Maximum/],
      [{ maximumCent: 12.5 }, /Maximum/],
      [{ maximumCent: '314400' }, /Maximum/],
      [{ person: 'x'.repeat(31) }, /Person/],
      [{ kategorien: [{ id: 'arzt', name: 'A', limitCent: 1 }, { id: 'arzt', name: 'B', limitCent: 1 }] }, /doppelt/],
      [{ kategorien: [{ id: 'arzt', name: '', limitCent: 1 }] }, /Namen/],
      [{ kategorien: [{ id: 'arzt', name: 'A', limitCent: -5 }] }, /Limit/],
      [{ kategorien: [{ id: 'ARZT', name: 'A', limitCent: 5 }] }, /Kennung/],
      [{ id: 'xyz!' }, /Kennung/],
    ];
    for (const [mehr, muster] of fehler) assert.match(polizzePruefen({ ...P, ...mehr }) ?? 'null', muster, JSON.stringify(mehr));
  });
});

describe('Versicherung: Hauptteil lesen und schreiben', () => {
  test('hin und zurück mit kurzen Schlüsseln; leer → leer; ohne Polizze und Jahr', () => {
    const d = versicherungJahrEintragen(MIT, 2026);
    const text = versicherungText(d);
    const roh = JSON.parse(text);
    assert.deepEqual(Object.keys(roh), ['v', 'p', 'j']);
    assert.equal(roh.j, 2026);
    assert.deepEqual(Object.keys(roh.p.k[1]), ['i', 'n', 'o', 'l']);
    assert.deepEqual(pruefeVersicherung(text), { daten: d, unlesbar: false });
    assert.deepEqual(pruefeVersicherung(''), { daten: leereVersicherung(), unlesbar: false });
    assert.deepEqual(pruefeVersicherung(null), { daten: leereVersicherung(), unlesbar: false });
    assert.equal(versicherungText(leereVersicherung()), '{"v":1}');
    assert.deepEqual(pruefeVersicherung('{"v":1}'), { daten: leereVersicherung(), unlesbar: false });
  });

  test('kaputt, andere Version, Polizze nicht verstanden oder falscher Index → unlesbar (nie überschreiben)', () => {
    const gut = JSON.parse(versicherungText(MIT));
    for (const kaputt of ['{kaputt', '[]', JSON.stringify({ v: 2 }), JSON.stringify({ ...gut, p: { ...gut.p, zz: 1 } }), JSON.stringify({ ...gut, p: { ...gut.p, n: '' } }), JSON.stringify({ ...gut, p: 'x' }), JSON.stringify({ ...gut, j: 'x' }), JSON.stringify({ ...gut, j: 1999 }), JSON.stringify({ ...gut, p: { ...gut.p, k: 'x' } })]) {
      assert.deepEqual(pruefeVersicherung(kaputt), { daten: leereVersicherung(), unlesbar: true }, kaputt);
    }
    assert.equal(versicherungWarnungen({ unlesbar: true }).length, 1);
    assert.match(versicherungWarnungen({ unlesbar: true })[0], /unlesbar/);
    assert.equal(versicherungGesperrtFehler().name, 'VersicherungGesperrt');
    assert.equal(jahrGesperrtFehler().name, 'VersicherungJahrGesperrt');
  });

  test('fremd: unbekannte oder doppelte Kategorien bleiben roh erhalten, unverändert mitgeschrieben, mit Warnung', () => {
    const roh = JSON.parse(versicherungText(MIT));
    roh.p.k.push(FREMD_KATEGORIE, { i: 'arzt', n: 'Doppelt', l: 1 });
    const g = pruefeVersicherung(JSON.stringify(roh));
    assert.equal(g.unlesbar, false);
    assert.equal(g.daten.polizze.kategorien.length, 5);
    assert.deepEqual(g.daten.fremd, { k: [FREMD_KATEGORIE, { i: 'arzt', n: 'Doppelt', l: 1 }] });
    assert.equal(versicherungWarnungen(g).length, 1);
    const geaendert = polizzeAendern(g.daten, { ...g.daten.polizze, person: 'Mia M.' });
    const zurueck = JSON.parse(versicherungText(geaendert));
    assert.deepEqual(zurueck.p.k.slice(-2), [FREMD_KATEGORIE, { i: 'arzt', n: 'Doppelt', l: 1 }]);
    assert.equal(zurueck.p.w, 'Mia M.');
    assert.throws(() => polizzeAendern(g.daten, { ...g.daten.polizze, kategorien: [...g.daten.polizze.kategorien, { id: 'zahn', name: 'Z', limitCent: 1 }] }), /neueren App-Version/);
  });

  test('M3: der Hauptteil merkt sich nur das ERSTE Jahr – seine Größe wächst nicht mit den Jahren', () => {
    let d = versicherungJahrEintragen(MIT, 2026);
    const laenge = versicherungText(d).length;
    for (let j = 2027; j <= 2100; j += 1) d = versicherungJahrEintragen(d, j);
    assert.equal(versicherungText(d).length, laenge);
    assert.equal(d.ab, 2026);
    d = versicherungJahrEintragen(d, 2024);
    assert.equal(d.ab, 2024, 'ein früheres Jahr wird das neue erste');
    assert.equal(versicherungText(d).length, laenge);
    assert.equal(versicherungJahrEintragen(d, 2030), d, 'schon bekannt → dieselben Daten');
    assert.equal(versicherungJahrBekannt(d, 2030), true);
    assert.equal(versicherungJahrBekannt(d, 2023), false);
    assert.equal(versicherungJahrBekannt(leereVersicherung(), 2026), false);
    assert.throws(() => versicherungJahrEintragen(d, 1999), /Jahr/);
    assert.throws(() => versicherungJahrEintragen(d, '2026'), /Jahr/);
  });

  test('zu voll → klare Meldung, nichts wird gekürzt', () => {
    assert.equal(MAX_VERSICHERUNG_ZEICHEN, 6000);
    const viele = Array.from({ length: 12 }, (_, i) => ({ id: `k${i}`, name: 'K'.repeat(50), info: 'I'.repeat(80), limitCent: 1 }));
    assert.ok(versicherungText(polizzeAendern(MIT, { ...P, kategorien: viele })).length < 6000, 'volle 12 Kategorien passen');
    const fremd = { ...MIT, fremd: { k: Array.from({ length: 5 }, (_, i) => ({ i: `f${i}`, n: 'x'.repeat(1200), q: 1 })) } };
    assert.throws(() => polizzeAendern(fremd, { ...P, person: 'Mia M.' }), (e) => e.message === TEXT_VERSICHERUNG_VOLL);
    assert.throws(() => polizzeAendern({ ...MIT, fremd: { k: [{ i: 'f', q: 1 }] } }, { ...P, kategorien: viele }), /Höchstens 12/);
  });
});

describe('Versicherung: Polizze anlegen und ändern (rein, wiederholbar)', () => {
  test('polizzeAnlegen: einmal; zweimal = einmal; eine andere schon da → die erste gilt; Argument unverändert', () => {
    const leer = leereVersicherung();
    const vorher = tiefKopie(leer);
    const d = polizzeAnlegen(leer, P);
    assert.deepEqual(leer, vorher);
    assert.deepEqual(d.polizze, P);
    assert.equal(polizzeAnlegen(d, P), d);
    const andere = { ...P, id: '11111111', name: 'Eigene' };
    assert.equal(polizzeAnlegen(d, andere), d, 'zwei Telefone legen gleichzeitig an: die zuerst gespeicherte bleibt');
    assert.throws(() => polizzeAnlegen(leer, { ...P, name: '' }), /Namen/);
  });

  test('polizzeAendern: gleiche Kennung nötig; gleich → dieselben Daten; Limits und Maximum änderbar', () => {
    assert.throws(() => polizzeAendern(leereVersicherung(), P), /gibt es nicht mehr/);
    assert.throws(() => polizzeAendern(MIT, { ...P, id: '11111111' }), /gibt es nicht mehr/);
    assert.equal(polizzeAendern(MIT, P), MIT);
    const neu = polizzeAendern(MIT, { ...P, maximumCent: 300000, kategorien: P.kategorien.map((k) => (k.id === 'heil' ? { ...k, limitCent: 30000 } : k)) });
    assert.equal(neu.polizze.maximumCent, 300000);
    assert.equal(neu.polizze.kategorien[4].limitCent, 30000);
    assert.equal(polizzeAendern(neu, neu.polizze), neu, 'zweimal = einmal');
  });

  test('normalisierePolizze: bereinigt Leerzeichen, leere Felder fallen weg, Zusatzfelder fallen weg', () => {
    const n = normalisierePolizze({ ...P, name: '  MedPLUS   Basic ', person: '  ', egal: 1, kategorien: [{ id: 'arzt', name: ' Arzt ', info: '', limitCent: 5, extra: 2 }] });
    assert.deepEqual(n, { id: P.id, name: 'MedPLUS Basic', beginn: '2026-10-20', kategorien: [{ id: 'arzt', name: 'Arzt', limitCent: 5 }], maximumCent: 314400, vorlage: 'medplusBasic' });
    assert.equal(normalisierePolizze({ ...P, id: undefined }), null);
  });
});

describe('Versicherung: Rechnungen je Jahr', () => {
  test('rechnungPruefen: Pflichtfelder, ganze Cent, Daten-Reihenfolge, Zukunft > 1 Tag; Warnungen halten nicht auf', () => {
    assert.deepEqual(rechnungPruefen(rechnung(), { heute: HEUTE, polizze: P }), { fehler: null, warnung: null });
    const fehler = [
      [{ kategorie: '' }, /Kategorie/],
      [{ kategorie: 'zahn' }, /Kategorie/],
      [{ datum: '2026-13-01' }, /Rechnungsdatum/],
      [{ datum: '2026-11-10', eingereichtAm: '2026-11-10' }, /Zukunft/],
      [{ betragCent: -1 }, /Betrag/],
      [{ betragCent: 10.5 }, /Betrag/],
      [{ betragCent: 10_000_000 }, /Betrag/],
      [{ eingereichtAm: '2026-10-27' }, /vor dem Rechnungsdatum/],
      [{ eingereichtAm: '2026-11-10' }, /Zukunft/],
      [{ erstattetCent: 100 }, /Erstattung/],
      [{ erstattetAm: '2026-11-01' }, /Erstattung/],
      [{ erstattetCent: 100, erstattetAm: '2026-10-29' }, /vor dem Einreichen/],
      [{ erstattetCent: 100, erstattetAm: '2026-11-10' }, /Zukunft/],
      [{ stelle: 'x'.repeat(41) }, /Arzt\/Apotheke/],
      [{ notiz: 'x'.repeat(121) }, /Notiz/],
      [{ id: 'ABC' }, /Kennung/],
    ];
    for (const [mehr, muster] of fehler) assert.match(rechnungPruefen(rechnung(mehr), { heute: HEUTE, polizze: P }).fehler ?? 'null', muster, JSON.stringify(mehr));
    assert.equal(rechnungPruefen(rechnung({ datum: '2026-11-09', eingereichtAm: '2026-11-09' }), { heute: HEUTE, polizze: P }).fehler, null, 'morgen geht noch (Zeitzonen)');
    assert.equal(rechnungPruefen(rechnung({ betragCent: 0 }), { heute: HEUTE }).fehler, null, '0 € geht');
    assert.equal(rechnungPruefen(rechnung({ kategorie: 'zahn' }), { heute: HEUTE }).fehler, null, 'ohne Polizze: nur das Format');
    assert.match(rechnungPruefen(rechnung({ erstattetCent: 9500, erstattetAm: '2026-11-05' }), { heute: HEUTE, polizze: P }).warnung, /höher als der Rechnungsbetrag/);
    assert.match(rechnungPruefen(rechnung({ datum: '2026-10-01', eingereichtAm: '2026-10-02' }), { heute: HEUTE, polizze: P }).warnung, /vor dem Beginn/);
    assert.throws(() => rechnungPruefen(rechnung(), {}), /heute/i);
  });

  test('Jahr-Teil: hin und zurück mit kurzen Schlüsseln, alle Felder; anderes Jahr im Text → unlesbar', () => {
    const r = rechnung({ erstattetCent: 7200, erstattetAm: '2026-11-05', stelle: 'Praxis am Park', notiz: 'Serie 1/3' });
    const t = rechnungSetzen(leeresJahr(2026), r, { heute: HEUTE, polizze: P });
    const text = jahrText(t);
    assert.deepEqual(JSON.parse(text), { v: 1, j: 2026, r: [{ i: 'rech0001', k: 'physio', d: '2026-10-28', b: 9000, e: '2026-10-30', r: 7200, t: '2026-11-05', s: 'Praxis am Park', n: 'Serie 1/3' }] });
    assert.deepEqual(pruefeJahr(text, { jahr: 2026 }), { teil: t, unlesbar: false });
    assert.deepEqual(pruefeJahr(text, { jahr: 2025 }), { teil: leeresJahr(2025), unlesbar: true });
    assert.deepEqual(pruefeJahr(null, { jahr: 2026 }), { teil: leeresJahr(2026), unlesbar: false });
    for (const kaputt of ['{kaputt', JSON.stringify({ v: 2, j: 2026, r: [] }), JSON.stringify({ v: 1, j: 2026, r: 'x' }), JSON.stringify({ v: 1, r: [] })]) {
      assert.deepEqual(pruefeJahr(kaputt, { jahr: 2026 }), { teil: leeresJahr(2026), unlesbar: true }, kaputt);
    }
    assert.match(jahrWarnungen({ teil: leeresJahr(2026), unlesbar: true })[0], /2026.*unlesbar/);
    assert.equal(normalisiereRechnung({ ...r, id: undefined }), null);
    assert.equal(rechnungJahr(r), 2026);
  });

  test('fremd: unbekannte, kaputte oder doppelte Rechnungen bleiben roh erhalten und werden mitgeschrieben', () => {
    const roh = { v: 1, j: 2026, r: [FREMD_RECHNUNG, { i: 'kaputt01', k: 'physio', d: '2026-02-30', b: 1, e: '2026-03-01' }, { i: 'text0001', k: 'physio', d: '2026-03-01', b: '100', e: '2026-03-01' }] };
    const g = pruefeJahr(JSON.stringify(roh), { jahr: 2026 });
    assert.deepEqual([g.unlesbar, g.teil.rechnungen, g.teil.fremd.r.length], [false, [], 3]);
    assert.match(jahrWarnungen(g)[0], /3 Einträge/);
    const t = rechnungSetzen(g.teil, rechnung(), { heute: HEUTE, polizze: P });
    const zurueck = JSON.parse(jahrText(t));
    assert.deepEqual(zurueck.r.slice(1), roh.r);
    assert.throws(() => rechnungSetzen(g.teil, rechnung({ id: 'neu00001' }), { heute: HEUTE }), /neueren App-Version/);
    const doppelt = pruefeJahr(JSON.stringify({ v: 1, j: 2026, r: [JSON.parse(jahrText(t)).r[0], JSON.parse(jahrText(t)).r[0]] }), { jahr: 2026 });
    assert.deepEqual([doppelt.teil.rechnungen.length, doppelt.teil.fremd.r.length], [1, 1]);
  });

  test('rechnungSetzen: anlegen, ändern an derselben Stelle, zweimal = einmal; falsches Jahr wird abgelehnt', () => {
    const leer = leeresJahr(2026);
    const vorher = tiefKopie(leer);
    const t1 = rechnungSetzen(leer, rechnung(), { heute: HEUTE, polizze: P });
    assert.deepEqual(leer, vorher, 'Argument unverändert');
    const t2 = rechnungSetzen(t1, rechnung({ id: 'rech0002', kategorie: 'medi', betragCent: 1250 }), { heute: HEUTE, polizze: P });
    assert.equal(rechnungSetzen(t2, rechnung({ id: 'rech0002', kategorie: 'medi', betragCent: 1250 }), { heute: HEUTE, polizze: P }), t2);
    const t3 = rechnungSetzen(t2, rechnung({ betragCent: 9500 }), { heute: HEUTE, polizze: P });
    assert.deepEqual(t3.rechnungen.map((r) => [r.id, r.betragCent]), [['rech0001', 9500], ['rech0002', 1250]]);
    assert.throws(() => rechnungSetzen(t3, rechnung({ datum: '2025-12-30', eingereichtAm: '2026-01-02' }), { heute: HEUTE }), /anderes Jahr/);
    assert.throws(() => rechnungSetzen(t3, rechnung({ betragCent: -1 }), { heute: HEUTE }), /Betrag/);
  });

  test('erstattungSetzen: nur die Erstattung der neuesten Fassung (andere Felder bleiben); null entfernt sie; weg → Fehler', () => {
    const t = rechnungSetzen(leeresJahr(2026), rechnung({ notiz: 'vom anderen Telefon' }), { heute: HEUTE });
    const e = erstattungSetzen(t, 'rech0001', { erstattetCent: 7200, erstattetAm: '2026-11-05' }, { heute: HEUTE });
    assert.deepEqual([e.rechnungen[0].erstattetCent, e.rechnungen[0].erstattetAm, e.rechnungen[0].notiz], [7200, '2026-11-05', 'vom anderen Telefon']);
    assert.equal(erstattungSetzen(e, 'rech0001', { erstattetCent: 7200, erstattetAm: '2026-11-05' }, { heute: HEUTE }), e);
    const ohne = erstattungSetzen(e, 'rech0001', null, { heute: HEUTE });
    assert.deepEqual(ohne.rechnungen[0], t.rechnungen[0]);
    assert.throws(() => erstattungSetzen(t, 'gibtsnix', { erstattetCent: 1, erstattetAm: '2026-11-05' }, { heute: HEUTE }), /gibt es nicht mehr/);
    assert.throws(() => erstattungSetzen(t, 'rech0001', { erstattetCent: 1, erstattetAm: '2026-10-01' }, { heute: HEUTE }), /vor dem Einreichen/);
  });

  test('löschen + Rückgängig: genau derselbe Teil an derselben Stelle; schon wieder da → derselbe Teil', () => {
    let t = leeresJahr(2026);
    for (const id of ['rech0001', 'rech0002', 'rech0003']) t = rechnungSetzen(t, rechnung({ id }), { heute: HEUTE });
    const spur = rechnungSpur(t, 'rech0002');
    assert.deepEqual(spur, { rechnung: t.rechnungen[1], stelle: 1 });
    const weg = rechnungLoeschen(t, 'rech0002');
    assert.deepEqual(weg.rechnungen.map((r) => r.id), ['rech0001', 'rech0003']);
    assert.equal(rechnungLoeschen(weg, 'rech0002'), weg);
    assert.equal(rechnungSpur(weg, 'rech0002'), null);
    const zurueck = rechnungWiederherstellen(weg, spur);
    assert.deepEqual(zurueck, t);
    assert.equal(rechnungWiederherstellen(zurueck, spur), zurueck);
    assert.throws(() => rechnungWiederherstellen(leeresJahr(2025), spur), /Ungültige Rechnung/);
    // Rückgängig ohne Zukunfts-Prüfung (das Datum war beim Anlegen gültig)
    assert.deepEqual(rechnungWiederherstellen(leeresJahr(2026), spur).rechnungen, [spur.rechnung]);
  });

  test('rechnungJahrWechseln: Plan aus zwei reinen Schritten – erst ins neue Jahr, dann aus dem alten; gleiches Jahr → null', () => {
    const alt = rechnungSetzen(leeresJahr(2026), rechnung(), { heute: HEUTE });
    const verschoben = rechnung({ datum: '2025-12-30', eingereichtAm: '2026-01-02' });
    const plan = rechnungJahrWechseln(verschoben, 2026, { heute: HEUTE, polizze: P });
    assert.deepEqual([plan.vonJahr, plan.nachJahr], [2026, 2025]);
    const neu = plan.inNeu(leeresJahr(2025));
    assert.deepEqual(neu.rechnungen, [normalisiereRechnung(verschoben)]);
    assert.equal(plan.inNeu(neu), neu, 'wiederholbar');
    const altOhne = plan.ausAlt(alt);
    assert.deepEqual(altOhne.rechnungen, []);
    assert.equal(plan.ausAlt(altOhne), altOhne, 'wiederholbar');
    assert.throws(() => plan.inNeu(leeresJahr(2026)), /anderes Jahr/);
    assert.equal(rechnungJahrWechseln(rechnung(), 2026, { heute: HEUTE }), null);
    assert.throws(() => rechnungJahrWechseln(rechnung({ betragCent: -1, datum: '2025-12-30', eingereichtAm: '2026-01-02' }), 2026, { heute: HEUTE }), /Betrag/);
  });

  test('zu voller Jahr-Teil → klare Meldung', () => {
    assert.equal(MAX_JAHR_ZEICHEN, 6000);
    let t = leeresJahr(2026);
    assert.throws(() => {
      for (let i = 0; i < 200; i += 1) t = rechnungSetzen(t, rechnung({ id: `r${String(i).padStart(7, '0')}`, stelle: 'S'.repeat(40), notiz: 'N'.repeat(120) }), { heute: HEUTE });
    }, (e) => e.message === TEXT_JAHR_VOLL);
    assert.ok(jahrText(t).length <= 6000);
    assert.ok(t.rechnungen.length >= 20, `wenigstens 20 volle Rechnungen je Jahr: ${t.rechnungen.length}`);
  });
});
