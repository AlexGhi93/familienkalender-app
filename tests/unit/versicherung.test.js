// Versicherung (Privatarzt): Polizze, Rechnungen je Kalenderjahr – Speicherformat, Prüfen, reine Änderungen, Rückgängig.
// Testdaten: erfunden (Kind „Mia“, keine Polizzennummer).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FASSUNG, fassungJetzt, versicherungTeilText as teilTextFuer } from '../../src/domain/versicherung.js';
import {
  MAX_POLIZZEN,
  TEXT_POLIZZEN_MAX,
  TEXT_POLIZZE_HAT_RECHNUNGEN,
  TEXT_POLIZZE_WEG,
  aktivePolizzen,
  polizzeBeenden,
  polizzeEntfernen,
  polizzeVonRechnung,
  MAX_VERSICHERUNG_TEIL_ZEICHEN,
  MAX_VERSICHERUNG_ZEICHEN,
  POLIZZE_VORLAGEN,
  TEXT_VERSICHERUNG_TEIL_VOLL,
  TEXT_VERSICHERUNG_VOLL,
  erstattungSetzen,
  leererVersicherungTeil,
  leereVersicherung,
  neueVersicherungId,
  normalisierePolizze,
  normalisiereRechnung,
  polizzeAendern,
  polizzeAnlegen,
  polizzeAusVorlage,
  polizzePruefen,
  polizzeVorlage,
  pruefeVersicherung,
  pruefeVersicherungTeil,
  quartalVon,
  rechnungJahr,
  rechnungQuartal,
  rechnungLoeschen,
  rechnungPruefen,
  rechnungSetzen,
  rechnungSpur,
  rechnungTeilWechseln,
  rechnungWiederherstellen,
  versicherungGesperrtFehler,
  versicherungJahrBekannt,
  versicherungJahrEintragen,
  versicherungTeilGesperrtFehler,
  versicherungTeilText,
  versicherungTeilWarnungen,
  versicherungText,
  versicherungWarnungen,
} from '../../src/domain/versicherung.js';

const HEUTE = '2026-11-08';
const P = polizzeAusVorlage('medplusBasic', { person: 'Mia', beginn: '2026-09-01' }, { zufall: () => 0 });
const MIT = polizzeAnlegen(leereVersicherung(), P);

const rechnung = (mehr = {}) => ({ id: 'rech0001', kategorie: 'physio', datum: '2026-10-28', betragCent: 9000, eingereichtAm: '2026-10-30', ...mehr });
const tiefKopie = (x) => JSON.parse(JSON.stringify(x));

/** Ein Eintrag einer neueren Version (unbekanntes Feld) – muss beim Schreiben unverändert bleiben. */
const FREMD_RECHNUNG = { i: 'neu00001', k: 'physio', d: '2026-03-01', b: 100, e: '2026-03-02', zz: { tiefer: [1, 'zwei'] } };
const FREMD_KATEGORIE = { i: 'zahn', n: 'Zahn', l: 10000, q: 1 };

describe('Versicherung: Vorlage, Kennungen, leere Daten', () => {
  test('leere Daten; Kennungen aus 0-9 und a-v', () => {
    assert.deepEqual(leereVersicherung(), { v: 2, polizzen: [], stamm: null, ab: null });
    assert.deepEqual(leererVersicherungTeil(2026, 4), { v: 1, jahr: 2026, quartal: 4, rechnungen: [] });
    assert.notEqual(leererVersicherungTeil(2026, 4).rechnungen, leererVersicherungTeil(2026, 4).rechnungen);
    assert.deepEqual(['2026-01-01', '2026-03-31', '2026-04-01', '2026-06-30', '2026-07-01', '2026-09-30', '2026-10-01', '2026-12-31'].map(quartalVon), [1, 1, 2, 2, 3, 3, 4, 4]);
    for (let i = 0; i < 50; i += 1) assert.match(neueVersicherungId(), /^[0-9a-v]{8}$/);
    assert.equal(neueVersicherungId(() => 0.9999999), 'vvvvvvvv');
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
      beginn: '2026-09-01',
      kategorien: POLIZZE_VORLAGEN.medplusBasic.kategorien.map((k) => ({ ...k })),
      maximumCent: 314400,
      vorlage: 'medplusBasic',
    });
    assert.equal(polizzeVorlage(P), POLIZZE_VORLAGEN.medplusBasic);
    assert.equal(polizzeVorlage({ ...P, vorlage: undefined }), null);
    assert.throws(() => polizzeAusVorlage('gibtsnicht', { beginn: '2026-09-01' }), /Vorlage/);
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
    assert.deepEqual(Object.keys(roh), ['v', 'l', 'h', 'j']);
    assert.equal(roh.j, 2026);
    assert.deepEqual(Object.keys(roh.l[0].k[1]), ['i', 'n', 'o', 'l']);
    assert.deepEqual(pruefeVersicherung(text), { daten: d, unlesbar: false });
    assert.deepEqual(pruefeVersicherung(''), { daten: leereVersicherung(), unlesbar: false });
    assert.deepEqual(pruefeVersicherung(null), { daten: leereVersicherung(), unlesbar: false });
    assert.equal(versicherungText(leereVersicherung()), '{"v":2,"l":[]}');
    assert.deepEqual(pruefeVersicherung('{"v":2,"l":[]}'), { daten: leereVersicherung(), unlesbar: false });
  });

  test('kaputt, andere Version, Polizze nicht verstanden oder falscher Index → unlesbar (nie überschreiben)', () => {
    const gut = JSON.parse(versicherungText(MIT));
    const p0 = gut.l[0];
    const mit = (p) => JSON.stringify({ ...gut, l: [p] });
    for (const kaputt of ['{kaputt', '[]', JSON.stringify({ v: 3, l: [] }), mit({ ...p0, zz: 1 }), mit({ ...p0, n: '' }), mit('x'), JSON.stringify({ ...gut, j: 'x' }), JSON.stringify({ ...gut, j: 1999 }), mit({ ...p0, k: 'x' }), JSON.stringify({ v: 1, p: { ...p0, x: 1 } })]) {
      assert.deepEqual(pruefeVersicherung(kaputt), { daten: leereVersicherung(), unlesbar: true }, kaputt);
    }
    assert.equal(versicherungWarnungen({ unlesbar: true }).length, 1);
    assert.match(versicherungWarnungen({ unlesbar: true })[0], /unlesbar/);
    assert.equal(versicherungGesperrtFehler().name, 'VersicherungGesperrt');
    assert.equal(versicherungTeilGesperrtFehler().name, 'VersicherungTeilGesperrt');
  });

  test('fremd: unbekannte oder doppelte Kategorien bleiben roh erhalten, unverändert mitgeschrieben, mit Warnung', () => {
    const roh = JSON.parse(versicherungText(MIT));
    roh.l[0].k.push(FREMD_KATEGORIE, { i: 'arzt', n: 'Doppelt', l: 1 });
    const g = pruefeVersicherung(JSON.stringify(roh));
    assert.equal(g.unlesbar, false);
    const p = g.daten.polizzen[0];
    assert.equal(p.kategorien.length, 5);
    assert.deepEqual(g.daten.fremd, { k: { [P.id]: [FREMD_KATEGORIE, { i: 'arzt', n: 'Doppelt', l: 1 }] } });
    assert.equal(versicherungWarnungen(g).length, 1);
    assert.match(versicherungWarnungen(g)[0], /^2 Kategorien/);
    const geaendert = polizzeAendern(g.daten, { ...p, person: 'Mia M.' });
    const zurueck = JSON.parse(versicherungText(geaendert));
    assert.deepEqual(zurueck.l[0].k.slice(-2), [FREMD_KATEGORIE, { i: 'arzt', n: 'Doppelt', l: 1 }]);
    assert.equal(zurueck.l[0].w, 'Mia M.');
    assert.throws(() => polizzeAendern(g.daten, { ...p, kategorien: [...p.kategorien, { id: 'zahn', name: 'Z', limitCent: 1 }] }), /neueren App-Version/);
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
    const fremd = { ...MIT, fremd: { k: { [P.id]: Array.from({ length: 5 }, (_, i) => ({ i: `f${i}`, n: 'x'.repeat(1200), q: 1 })) } } };
    assert.throws(() => polizzeAendern(fremd, { ...P, person: 'Mia M.' }), (e) => e.message === TEXT_VERSICHERUNG_VOLL);
    assert.throws(() => polizzeAendern({ ...MIT, fremd: { k: { [P.id]: [{ i: 'f', q: 1 }] } } }, { ...P, kategorien: viele }), /Höchstens 12/);
  });
});

describe('Versicherung: Polizze anlegen und ändern (rein, wiederholbar)', () => {
  test('polizzeAnlegen: einmal; zweimal = einmal; eine andere dazu → beide (1.5.0); Argument unverändert', () => {
    const leer = leereVersicherung();
    const vorher = tiefKopie(leer);
    const d = polizzeAnlegen(leer, P);
    assert.deepEqual(leer, vorher);
    assert.deepEqual([d.polizzen, d.stamm], [[P], P.id]);
    assert.equal(polizzeAnlegen(d, P), d);
    const andere = { ...P, id: '11111111', name: 'Eigene' };
    const beide = polizzeAnlegen(d, andere);
    assert.deepEqual([beide.polizzen.map((p) => p.id), beide.stamm], [[P.id, '11111111'], P.id], 'zwei Telefone legen gleichzeitig an: beide bleiben');
    assert.equal(polizzeAnlegen(leer, { ...P, beendet: true }).polizzen[0].beendet, undefined, 'neu angelegt ist sie immer aktiv');
    assert.throws(() => polizzeAnlegen(leer, { ...P, name: '' }), /Namen/);
  });

  test('polizzeAendern: gleiche Kennung nötig; gleich → dieselben Daten; Limits und Maximum änderbar', () => {
    assert.throws(() => polizzeAendern(leereVersicherung(), P), /gibt es nicht mehr/);
    assert.throws(() => polizzeAendern(MIT, { ...P, id: '11111111' }), /gibt es nicht mehr/);
    assert.equal(polizzeAendern(MIT, P), MIT);
    const neu = polizzeAendern(MIT, { ...P, maximumCent: 300000, kategorien: P.kategorien.map((k) => (k.id === 'heil' ? { ...k, limitCent: 30000 } : k)) });
    assert.equal(neu.polizzen[0].maximumCent, 300000);
    assert.equal(neu.polizzen[0].kategorien[4].limitCent, 30000);
    assert.equal(polizzeAendern(neu, neu.polizzen[0]), neu, 'zweimal = einmal');
  });

  test('normalisierePolizze: bereinigt Leerzeichen, leere Felder fallen weg, Zusatzfelder fallen weg', () => {
    const n = normalisierePolizze({ ...P, name: '  MedPLUS   Basic ', person: '  ', egal: 1, kategorien: [{ id: 'arzt', name: ' Arzt ', info: '', limitCent: 5, extra: 2 }] });
    assert.deepEqual(n, { id: P.id, name: 'MedPLUS Basic', beginn: '2026-09-01', kategorien: [{ id: 'arzt', name: 'Arzt', limitCent: 5 }], maximumCent: 314400, vorlage: 'medplusBasic' });
    assert.equal(normalisierePolizze({ ...P, id: undefined }), null);
  });
});

describe('Versicherung: Rechnungen je Quartal (C1)', () => {
  const Q4 = () => leererVersicherungTeil(2026, 4);

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
    assert.match(rechnungPruefen(rechnung({ datum: '2026-08-15', eingereichtAm: '2026-08-16' }), { heute: HEUTE, polizze: P }).warnung, /vor dem Beginn/);
    assert.throws(() => rechnungPruefen(rechnung(), {}), /heute/i);
  });

  test('Abschluss-Review M2: Rechnungsdatum mehr als ein Jahr vor dem Jahr des Beginns → Fehler (Tippfehler im Jahr); das Vorjahr nur Warnung', () => {
    // P beginnt 2026: 2025 geht (mit Warnung), 2024 und früher nicht – sonst sinkt `ab` für immer und jedes Lesen holt alle Jahre dazwischen
    const vorjahr = rechnungPruefen(rechnung({ datum: '2025-01-01', eingereichtAm: '2025-01-02' }), { heute: HEUTE, polizze: P });
    assert.equal(vorjahr.fehler, null);
    assert.match(vorjahr.warnung, /vor dem Beginn/);
    for (const datum of ['2024-12-31', '2016-10-12']) {
      const r = rechnungPruefen(rechnung({ datum, eingereichtAm: '2026-10-28' }), { heute: HEUTE, polizze: P });
      assert.equal(r.fehler, 'Das Rechnungsdatum liegt mehr als ein Jahr vor dem Beginn der Polizze (01.09.2026). Bitte das Jahr prüfen.', datum);
      assert.equal(r.warnung, null);
    }
    assert.equal(rechnungPruefen(rechnung({ datum: '2016-10-12', eingereichtAm: '2026-10-28' }), { heute: HEUTE }).fehler, null, 'ohne Polizze: nur das Format');
  });

  test('Teil: hin und zurück mit kurzen Schlüsseln, Daten als Zahl JJJJMMTT; anderes Jahr/Quartal im Text → unlesbar', () => {
    const r = rechnung({ erstattetCent: 7200, erstattetAm: '2026-11-05', stelle: 'Praxis am Park', notiz: 'Serie 1/3' });
    const t = rechnungSetzen(Q4(), r, { heute: HEUTE, polizze: P });
    const text = versicherungTeilText(t);
    assert.deepEqual(JSON.parse(text), { v: 1, j: 2026, q: 4, r: [{ i: 'rech0001', k: 'physio', d: 20261028, b: 9000, e: 20261030, r: 7200, t: 20261105, s: 'Praxis am Park', n: 'Serie 1/3', p: P.id }] });
    assert.deepEqual(pruefeVersicherungTeil(text, { jahr: 2026, quartal: 4 }), { teil: t, unlesbar: false });
    assert.deepEqual(pruefeVersicherungTeil(text, { jahr: 2025, quartal: 4 }), { teil: leererVersicherungTeil(2025, 4), unlesbar: true });
    assert.deepEqual(pruefeVersicherungTeil(text, { jahr: 2026, quartal: 3 }), { teil: leererVersicherungTeil(2026, 3), unlesbar: true });
    assert.deepEqual(pruefeVersicherungTeil(null, { jahr: 2026, quartal: 4 }), { teil: Q4(), unlesbar: false });
    for (const kaputt of ['{kaputt', JSON.stringify({ v: 2, j: 2026, q: 4, r: [] }), JSON.stringify({ v: 1, j: 2026, q: 4, r: 'x' }), JSON.stringify({ v: 1, j: 2026, r: [] }), JSON.stringify({ v: 1, j: 2026, q: 5, r: [] }), JSON.stringify({ v: 1, q: 4, r: [] })]) {
      assert.deepEqual(pruefeVersicherungTeil(kaputt, { jahr: 2026, quartal: 4 }), { teil: Q4(), unlesbar: true }, kaputt);
    }
    assert.match(versicherungTeilWarnungen({ teil: Q4(), unlesbar: true })[0], /4\. Quartal 2026.*unlesbar/);
    assert.equal(normalisiereRechnung({ ...r, id: undefined }), null);
    assert.deepEqual([rechnungJahr(r), rechnungQuartal(r)], [2026, 4]);
    assert.throws(() => versicherungTeilText({ ...Q4(), quartal: 5 }), /Quartal/);
  });

  test('fremd: unbekannte, kaputte (auch Datum als Text) oder doppelte Rechnungen bleiben roh erhalten und werden mitgeschrieben', () => {
    const fremdQ1 = { ...FREMD_RECHNUNG, d: 20260301, e: 20260302 };
    const roh = { v: 1, j: 2026, q: 1, r: [fremdQ1, { i: 'kaputt01', k: 'physio', d: 20260230, b: 1, e: 20260301 }, { i: 'text0001', k: 'physio', d: 20260301, b: '100', e: 20260301 }, { i: 'text0002', k: 'physio', d: '2026-03-01', b: 100, e: 20260301 }] };
    const g = pruefeVersicherungTeil(JSON.stringify(roh), { jahr: 2026, quartal: 1 });
    assert.deepEqual([g.unlesbar, g.teil.rechnungen, g.teil.fremd.r.length], [false, [], 4]);
    assert.match(versicherungTeilWarnungen(g)[0], /4 Einträge/);
    const neu = rechnung({ datum: '2026-02-10', eingereichtAm: '2026-02-11' });
    const t = rechnungSetzen(g.teil, neu, { heute: HEUTE, polizze: P });
    const zurueck = JSON.parse(versicherungTeilText(t));
    assert.deepEqual(zurueck.r.slice(1), roh.r);
    assert.throws(() => rechnungSetzen(g.teil, { ...neu, id: 'neu00001' }, { heute: HEUTE }), /neueren App-Version/);
    const kurz = zurueck.r[0];
    const doppelt = pruefeVersicherungTeil(JSON.stringify({ v: 1, j: 2026, q: 1, r: [kurz, kurz] }), { jahr: 2026, quartal: 1 });
    assert.deepEqual([doppelt.teil.rechnungen.length, doppelt.teil.fremd.r.length], [1, 1]);
  });

  test('rechnungSetzen: anlegen, ändern an derselben Stelle, zweimal = einmal; falsches Jahr oder Quartal wird abgelehnt', () => {
    const leer = Q4();
    const vorher = tiefKopie(leer);
    const t1 = rechnungSetzen(leer, rechnung(), { heute: HEUTE, polizze: P });
    assert.deepEqual(leer, vorher, 'Argument unverändert');
    const t2 = rechnungSetzen(t1, rechnung({ id: 'rech0002', kategorie: 'medi', betragCent: 1250 }), { heute: HEUTE, polizze: P });
    assert.equal(rechnungSetzen(t2, rechnung({ id: 'rech0002', kategorie: 'medi', betragCent: 1250 }), { heute: HEUTE, polizze: P }), t2);
    const t3 = rechnungSetzen(t2, rechnung({ betragCent: 9500 }), { heute: HEUTE, polizze: P });
    assert.deepEqual(t3.rechnungen.map((r) => [r.id, r.betragCent]), [['rech0001', 9500], ['rech0002', 1250]]);
    assert.throws(() => rechnungSetzen(t3, rechnung({ datum: '2025-12-30', eingereichtAm: '2026-01-02' }), { heute: HEUTE }), /anderes Quartal/);
    assert.throws(() => rechnungSetzen(t3, rechnung({ datum: '2026-09-30', eingereichtAm: '2026-10-02' }), { heute: HEUTE }), /anderes Quartal/);
    assert.throws(() => rechnungSetzen(t3, rechnung({ betragCent: -1 }), { heute: HEUTE }), /Betrag/);
  });

  test('erstattungSetzen: nur die Erstattung der neuesten Fassung (andere Felder bleiben); null entfernt sie; weg → Fehler', () => {
    const t = rechnungSetzen(Q4(), rechnung({ notiz: 'vom anderen Telefon' }), { heute: HEUTE });
    const e = erstattungSetzen(t, 'rech0001', { erstattetCent: 7200, erstattetAm: '2026-11-05' }, { heute: HEUTE });
    assert.deepEqual([e.rechnungen[0].erstattetCent, e.rechnungen[0].erstattetAm, e.rechnungen[0].notiz], [7200, '2026-11-05', 'vom anderen Telefon']);
    assert.equal(erstattungSetzen(e, 'rech0001', { erstattetCent: 7200, erstattetAm: '2026-11-05' }, { heute: HEUTE }), e);
    const ohne = erstattungSetzen(e, 'rech0001', null, { heute: HEUTE });
    assert.deepEqual(ohne.rechnungen[0], t.rechnungen[0]);
    assert.throws(() => erstattungSetzen(t, 'gibtsnix', { erstattetCent: 1, erstattetAm: '2026-11-05' }, { heute: HEUTE }), /gibt es nicht mehr/);
    assert.throws(() => erstattungSetzen(t, 'rech0001', { erstattetCent: 1, erstattetAm: '2026-10-01' }, { heute: HEUTE }), /vor dem Einreichen/);
  });

  test('löschen + Rückgängig: genau derselbe Teil an derselben Stelle; schon wieder da → derselbe Teil', () => {
    let t = Q4();
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
    assert.throws(() => rechnungWiederherstellen(leererVersicherungTeil(2025, 4), spur), /Ungültige Rechnung/);
    assert.throws(() => rechnungWiederherstellen(leererVersicherungTeil(2026, 3), spur), /Ungültige Rechnung/);
    assert.deepEqual(rechnungWiederherstellen(Q4(), spur).rechnungen, [spur.rechnung], 'ohne Zukunfts-Prüfung');
  });

  test('rechnungTeilWechseln: Plan aus zwei reinen Schritten – erst in den neuen Teil, dann aus dem alten; gleicher Teil → null', () => {
    const alt = rechnungSetzen(Q4(), rechnung(), { heute: HEUTE });
    // über das Jahr: 2026/Q4 → 2025/Q4
    const verschoben = rechnung({ datum: '2025-12-30', eingereichtAm: '2026-01-02' });
    const plan = rechnungTeilWechseln(verschoben, { jahr: 2026, quartal: 4 }, { heute: HEUTE, polizze: P });
    assert.deepEqual([plan.von, plan.nach], [{ jahr: 2026, quartal: 4 }, { jahr: 2025, quartal: 4 }]);
    const neu = plan.inNeu(leererVersicherungTeil(2025, 4));
    assert.deepEqual(neu.rechnungen, [{ ...normalisiereRechnung(verschoben), polizze: P.id }], 'mit Polizze: sie trägt deren Kennung');
    assert.equal(plan.inNeu(neu), neu, 'wiederholbar');
    const altOhne = plan.ausAlt(alt);
    assert.deepEqual(altOhne.rechnungen, []);
    assert.equal(plan.ausAlt(altOhne), altOhne, 'wiederholbar');
    assert.throws(() => plan.inNeu(Q4()), /anderes Quartal/);
    // im selben Jahr, anderes Quartal: 2026/Q4 → 2026/Q3
    const q3 = rechnungTeilWechseln(rechnung({ datum: '2026-09-29', eingereichtAm: '2026-10-30' }), { jahr: 2026, quartal: 4 }, { heute: HEUTE });
    assert.deepEqual(q3.nach, { jahr: 2026, quartal: 3 });
    assert.equal(rechnungTeilWechseln(rechnung({ datum: '2026-10-01', eingereichtAm: '2026-10-30' }), { jahr: 2026, quartal: 4 }, { heute: HEUTE }), null);
    assert.throws(() => rechnungTeilWechseln(rechnung({ betragCent: -1, datum: '2025-12-30', eingereichtAm: '2026-01-02' }), { jahr: 2026, quartal: 4 }, { heute: HEUTE }), /Betrag/);
    assert.throws(() => rechnungTeilWechseln(rechnung(), { jahr: 2026, quartal: 0 }, { heute: HEUTE }), /Quartal/);
  });

  test('C1 Platz: ein Quartal-Teil fasst ≥ 45 Rechnungen mit Erstattung + 20 Zeichen „Arzt/Apotheke“ + Fassung – ein Jahr also ≥ 180', () => {
    assert.equal(MAX_VERSICHERUNG_TEIL_ZEICHEN, 6000);
    const proQuartal = [];
    for (const q of [1, 2, 3, 4]) {
      let t = leererVersicherungTeil(2026, q);
      const monat = String(q * 3).padStart(2, '0');
      let n = 0;
      assert.throws(() => {
        for (;;) {
          // ungünstig: lange Kategorie, sechsstellige Beträge, Kennungen mit 8 Zeichen, siebenstellige Fassung (bis ins Jahr 2045)
          t = rechnungSetzen(t, { id: `${q}${String(n).padStart(7, '0')}`, kategorie: 'physio', datum: `2026-${monat}-28`, betragCent: 999_999, eingereichtAm: `2026-${monat}-29`, erstattetCent: 799_999, erstattetAm: `2026-${monat}-30`, stelle: 'Apotheke am Platz 12', fassung: 9_999_999 }, { heute: '2026-12-31' });
          n += 1;
        }
      }, (e) => e.message === TEXT_VERSICHERUNG_TEIL_VOLL);
      assert.ok(versicherungTeilText(t).length <= 6000);
      proQuartal.push(n);
    }
    const jahr = proQuartal.reduce((a, b) => a + b, 0);
    assert.ok(proQuartal.every((n) => n >= 45), proQuartal.join(','));
    assert.ok(jahr >= 180, `je Jahr ${jahr}`);
  });
});

describe('Versicherung: Fix-Runde 2 (Review I1, M1, M5)', () => {
  /** Hauptteil wie von einer neueren App-Version: jede Kategorie hat ein Feld `x`, das diese Version nicht kennt. */
  const NEUERE_VERSION = JSON.stringify({ v: 1, p: { i: 'abcd1234', n: 'MedPLUS', b: '2026-09-01', k: [{ i: 'arzt', n: 'Arzt', l: 160000, x: 1 }, { i: 'heil', n: 'Heil', l: 22400, x: 2 }], m: 314400 }, j: 2026 });

  test('I1: keine verstandene Kategorie (neuere Version gibt jeder ein Feld) → ganzer Hauptteil unlesbar, nie überschrieben', () => {
    assert.deepEqual(pruefeVersicherung(NEUERE_VERSION), { daten: leereVersicherung(), unlesbar: true });
    // eine verstandene und eine fremde Kategorie bleibt lesbar (fremd wird mitgeschrieben)
    const gemischt = JSON.parse(NEUERE_VERSION);
    delete gemischt.p.k[1].x;
    const g = pruefeVersicherung(JSON.stringify(gemischt));
    assert.deepEqual([g.unlesbar, g.daten.polizzen[0].kategorien.map((k) => k.id), g.daten.fremd.k.abcd1234.length], [false, ['heil'], 1]);
    const geschrieben = JSON.parse(versicherungText(versicherungJahrEintragen(g.daten, 2025)));
    assert.deepEqual([geschrieben.j, geschrieben.l[0].k], [2025, [{ i: 'heil', n: 'Heil', l: 22400 }, gemischt.p.k[0]]], 'ein Jahr eintragen (jetzt als v:2): Polizze und fremde Kategorie bleiben');
  });

  test('I1: mehr als 12 verstandene Kategorien → unlesbar; genau 12 → lesbar', () => {
    const kategorien = (n) => Array.from({ length: n }, (_, i) => ({ i: `k${i}`, n: `K${i}`, l: 100 }));
    const text = (n) => JSON.stringify({ v: 1, p: { i: 'abcd1234', n: 'Eigene', b: '2026-09-01', k: kategorien(n), m: 1000 }, j: 2026 });
    assert.equal(pruefeVersicherung(text(13)).unlesbar, true);
    assert.equal(pruefeVersicherung(text(12)).unlesbar, false);
    assert.equal(pruefeVersicherung(text(12)).daten.polizzen[0].kategorien.length, 12);
    assert.equal(pruefeVersicherung(JSON.stringify({ v: 2, l: [JSON.parse(text(13)).p], h: 'abcd1234' })).unlesbar, true, 'ebenso in v:2');
  });

  test('I1: versicherungText wirft bei einer Polizze, die nicht normalisierbar ist, statt sie still wegzulassen', () => {
    for (const kaputt of [{ ...P, kategorien: [] }, { ...P, name: '' }, { ...P, id: 'X' }, { ...P, kategorien: Array.from({ length: 13 }, (_, i) => ({ id: `k${i}`, name: 'K', limitCent: 1 })) }]) {
      assert.throws(() => versicherungText({ v: 2, polizzen: [kaputt], stamm: kaputt.id, ab: 2026 }), /Polizze/, JSON.stringify(kaputt).slice(0, 60));
      assert.throws(() => versicherungJahrEintragen({ v: 2, polizzen: [kaputt], stamm: kaputt.id, ab: 2026 }, 2025), /Polizze/);
    }
    assert.throws(() => versicherungText({ v: 2, polizzen: [P, P], stamm: P.id, ab: 2026 }), /doppelt/);
    assert.throws(() => versicherungText({ v: 2, polizzen: [P], stamm: '11111111', ab: 2026 }), /Stamm/);
    assert.equal(versicherungText({ v: 2, polizzen: [], stamm: null, ab: 2026 }), '{"v":2,"l":[],"j":2026}', 'ohne Polizze bleibt es erlaubt');
  });

  test('M1: eine Rechnung, deren Datum nicht zum Teil passt, bleibt lesbar – mit Hinweis', () => {
    const roh = { v: 1, j: 2026, q: 4, r: [{ i: 'falsch01', k: 'physio', d: 20250115, b: 100, e: 20250116 }] };
    const g = pruefeVersicherungTeil(JSON.stringify(roh), { jahr: 2026, quartal: 4 });
    assert.deepEqual([g.unlesbar, g.teil.rechnungen.map((r) => r.datum)], [false, ['2025-01-15']]);
    assert.match(versicherungTeilWarnungen(g).join(' | '), /1 Rechnung im 4\. Quartal 2026 .*anderen Quartal/);
    assert.deepEqual(JSON.parse(versicherungTeilText(g.teil)), roh, 'unverändert mitgeschrieben');
    assert.deepEqual(rechnungLoeschen(g.teil, 'falsch01').rechnungen, [], 'löschbar am falschen Ort');
  });

  test('M5: der Plan sagt, welches Jahr der Hauptteil zuerst kennen muss (jahrEintragen)', () => {
    const zurueck = rechnungTeilWechseln(rechnung({ datum: '2025-12-30', eingereichtAm: '2026-01-02' }), { jahr: 2026, quartal: 4 }, { heute: HEUTE });
    assert.equal(zurueck.jahrEintragen, 2025, 'ohne Daten: immer das neue Jahr, wenn es wechselt (versicherungJahrEintragen ist wiederholbar)');
    const ab2026 = versicherungJahrEintragen(MIT, 2026);
    assert.equal(rechnungTeilWechseln(rechnung({ datum: '2025-12-30', eingereichtAm: '2026-01-02' }), { jahr: 2026, quartal: 4 }, { heute: HEUTE, daten: ab2026 }).jahrEintragen, 2025);
    const ab2024 = versicherungJahrEintragen(MIT, 2024);
    assert.equal(rechnungTeilWechseln(rechnung({ datum: '2025-12-30', eingereichtAm: '2026-01-02' }), { jahr: 2026, quartal: 4 }, { heute: HEUTE, daten: ab2024 }).jahrEintragen, null, 'schon bekannt');
    const vor = rechnungTeilWechseln(rechnung(), { jahr: 2025, quartal: 4 }, { heute: HEUTE });
    assert.deepEqual([vor.nach, vor.jahrEintragen], [{ jahr: 2026, quartal: 4 }, 2026]);
    assert.equal(rechnungTeilWechseln(rechnung(), { jahr: 2025, quartal: 4 }, { heute: HEUTE, daten: ab2024 }).jahrEintragen, null);
    const gleichesJahr = rechnungTeilWechseln(rechnung({ datum: '2026-09-29', eingereichtAm: '2026-10-30' }), { jahr: 2026, quartal: 4 }, { heute: HEUTE });
    assert.equal(gleichesJahr.jahrEintragen, null);
    // so wendet Task 2 den Plan an
    const haupt = zurueck.jahrEintragen === null ? ab2026 : versicherungJahrEintragen(ab2026, zurueck.jahrEintragen);
    assert.equal(versicherungJahrBekannt(haupt, zurueck.nach.jahr), true);
  });
});

describe('Versicherung: Fassung je Rechnung (Fix-Runde 1 Task 2: I2, M3)', () => {
  const teil4 = (...rs) => rs.reduce((t, r) => rechnungSetzen(t, r, { heute: HEUTE }), leererVersicherungTeil(2026, 4));

  test('fassungJetzt: Minuten ab 01.01.2026 (UTC), nie negativ', () => {
    assert.equal(fassungJetzt(new Date('2026-01-01T00:00:00Z')), 0);
    assert.equal(fassungJetzt(new Date('2026-01-01T01:30:59Z')), 90);
    assert.equal(fassungJetzt(new Date('2025-06-01T00:00:00Z')), 0);
    assert.equal(fassungJetzt(new Date('2026-11-08T07:00:00Z')), 448_260);
  });

  test('wird kurz als `z` gespeichert und gelesen; ungültig → Fehler bzw. fremd', () => {
    const t = teil4(rechnung({ fassung: 1234 }));
    const text = teilTextFuer(t);
    assert.equal(JSON.parse(text).r[0].z, 1234);
    assert.equal(pruefeVersicherungTeil(text, { jahr: 2026, quartal: 4 }).teil.rechnungen[0].fassung, 1234);
    for (const f of [-1, 1.5, '12', MAX_FASSUNG + 1]) assert.match(rechnungPruefen(rechnung({ fassung: f }), { heute: HEUTE }).fehler, /Fassung/, String(f));
    const alsText = JSON.stringify({ v: 1, j: 2026, q: 4, r: [{ i: 'rech0001', k: 'physio', d: 20261028, b: 1, e: 20261030, z: '12' }] });
    assert.equal(pruefeVersicherungTeil(alsText, { jahr: 2026, quartal: 4 }).teil.fremd.r.length, 1);
    assert.equal(pruefeVersicherungTeil(teilTextFuer(teil4(rechnung())), { jahr: 2026, quartal: 4 }).teil.rechnungen[0].fassung, undefined, 'ohne Fassung (ältere Daten) bleibt ohne');
  });

  test('rechnungSetzen mit `fassung`: mindestens jetzt, größer als die geänderte und die im Teil stehende (Uhr, die nachgeht)', () => {
    const r = (t) => t.rechnungen[0].fassung;
    assert.equal(r(rechnungSetzen(leererVersicherungTeil(2026, 4), rechnung(), { heute: HEUTE, fassung: 500 })), 500);
    assert.equal(r(rechnungSetzen(leererVersicherungTeil(2026, 4), rechnung({ fassung: 800 }), { heute: HEUTE, fassung: 500 })), 801, 'Uhr hinter der vorigen Fassung');
    assert.equal(r(rechnungSetzen(teil4(rechnung({ fassung: 900 })), rechnung({ fassung: 800 }), { heute: HEUTE, fassung: 500 })), 901, 'neuer als die im Teil');
    assert.equal(r(rechnungSetzen(teil4(rechnung({ fassung: 7 })), rechnung({ betragCent: 1 }), { heute: HEUTE })), undefined, 'ohne `fassung` bleibt die übergebene');
    assert.equal(r(erstattungSetzen(teil4(rechnung({ fassung: 40 })), 'rech0001', { erstattetCent: 1, erstattetAm: HEUTE }, { heute: HEUTE, fassung: 10 })), 41);
    const plan = rechnungTeilWechseln(rechnung({ fassung: 60, datum: '2026-09-30' }), { jahr: 2026, quartal: 4 }, { heute: HEUTE, fassung: 50 });
    assert.equal(r(plan.inNeu(leererVersicherungTeil(2026, 3))), 61, 'die verschobene Fassung ist neuer als die alte');
  });

  test('Fix-Runde 2: Verschieben ist neuer als die frisch gelesene alte Fassung; das Löschen im alten Teil nur, wenn die alte älter ist', () => {
    const plan = rechnungTeilWechseln(rechnung({ fassung: 60, datum: '2026-09-30' }), { jahr: 2026, quartal: 4 }, { heute: HEUTE, fassung: 50 });
    assert.equal(plan.inNeu(leererVersicherungTeil(2026, 3), { vorigeFassung: 90 }).rechnungen[0].fassung, 91, 'frisch gelesen 90 (anderes Telefon) → 91');
    assert.equal(plan.inNeu(leererVersicherungTeil(2026, 3), { vorigeFassung: 10 }).rechnungen[0].fassung, 61, 'kleiner als die angezeigte: zählt nicht');
    const alt = (f) => teil4(rechnung(f === undefined ? {} : { fassung: f }));
    assert.deepEqual(plan.ausAlt(alt(60), { nurAelterAls: 61 }).rechnungen, [], 'älter → gelöscht');
    for (const [f, grenze] of [[61, 61], [70, 61], [undefined, -1]]) {
      const t = alt(f);
      assert.equal(plan.ausAlt(t, { nurAelterAls: grenze }), t, `${f} gegen ${grenze}: bleibt`);
    }
    assert.deepEqual(plan.ausAlt(alt(99)).rechnungen, [], 'ohne Grenze wie bisher');
  });
});

describe('Versicherung v:2: mehrere Polizzen (1.5.0)', () => {
  // Ein Hauptteil, wie ihn 1.4.x schreibt: v:1 mit einer Polizze (eine Kategorie einer neueren Version dabei) und dem ersten Jahr.
  const V1_POLIZZE = { i: 'abcd1234', n: 'MedPLUS Privatarzt Basic', w: 'Mia', b: '2026-09-01', k: [{ i: 'arzt', n: 'Arzt', l: 160000 }, { i: 'physio', n: 'Physio', o: 'inkl. Logopädie', l: 49000 }, FREMD_KATEGORIE], m: 314400, v: 'medplusBasic' };
  const V1_TEXT = JSON.stringify({ v: 1, p: V1_POLIZZE, j: 2026 });
  const B = { ...polizzeAusVorlage('medplusBasic', { person: 'Mia', beginn: '2026-01-01' }, { zufall: () => 0.5 }), id: 'polb0001', name: 'Zweite' };
  const eigene = (id, mehr = {}) => ({ id, name: `Eigene ${id}`, beginn: '2026-01-01', kategorien: [{ id: 'arzt', name: 'Arzt', limitCent: 1000 }], maximumCent: 1000, ...mehr });

  test('leere Daten im neuen Format', () => {
    assert.deepEqual(leereVersicherung(), { v: 2, polizzen: [], stamm: null, ab: null });
    assert.equal(versicherungText(leereVersicherung()), '{"v":2,"l":[]}');
    assert.deepEqual(pruefeVersicherung('{"v":2,"l":[]}'), { daten: leereVersicherung(), unlesbar: false });
  });

  test('v:1 mit Polizze → beim Lesen eine Polizze, Stamm; geschrieben als v:2', () => {
    const { daten, unlesbar } = pruefeVersicherung(V1_TEXT);
    assert.equal(unlesbar, false);
    assert.equal(daten.polizzen.length, 1);
    assert.equal(daten.stamm, daten.polizzen[0].id);
    assert.equal(daten.stamm, 'abcd1234');
    assert.equal(daten.ab, 2026);
    assert.deepEqual(daten.polizzen[0].kategorien.map((k) => k.id), ['arzt', 'physio']);
    assert.deepEqual(daten.fremd, { k: { abcd1234: [FREMD_KATEGORIE] } }, 'die fremde Kategorie bleibt bei ihrer Polizze');
    assert.equal(daten.ausV1, true, 'Merker für den Store: der Hauptteil im Kalender ist noch v:1');
    const roh = JSON.parse(versicherungText(daten));
    assert.equal(roh.v, 2);
    assert.equal(roh.l.length, 1);
    assert.equal(roh.h, daten.stamm);
    assert.equal(roh.j, 2026);
    assert.deepEqual(Object.keys(roh).sort(), ['h', 'j', 'l', 'v'], 'ausV1 wird nicht geschrieben');
    assert.deepEqual(roh.l[0], V1_POLIZZE, 'nichts verloren: dieselbe Polizze, die fremde Kategorie am Ende');
    const wieder = pruefeVersicherung(versicherungText(daten));
    assert.equal(wieder.daten.ausV1, undefined);
    assert.deepEqual(wieder, { daten: { v: 2, polizzen: daten.polizzen, stamm: 'abcd1234', ab: 2026, fremd: daten.fremd }, unlesbar: false });
  });

  test('v:1 ohne Polizze → keine Polizze, kein Stamm, das erste Jahr bleibt', () => {
    assert.deepEqual(pruefeVersicherung('{"v":1,"j":2025}'), { daten: { v: 2, polizzen: [], stamm: null, ab: 2025, ausV1: true }, unlesbar: false });
    assert.equal(versicherungText(pruefeVersicherung('{"v":1}').daten), '{"v":2,"l":[]}');
  });

  test('v:2 hin und zurück: zwei Polizzen, eine beendet (x: 1), Stamm', () => {
    const d = polizzeBeenden(polizzeAnlegen(polizzeAnlegen(leereVersicherung(), P), B), B.id, true);
    const roh = JSON.parse(versicherungText(d));
    assert.deepEqual([roh.v, roh.h, roh.l.map((p) => p.i), roh.l.map((p) => p.x)], [2, P.id, [P.id, B.id], [undefined, 1]]);
    const g = pruefeVersicherung(versicherungText(d));
    assert.deepEqual(g, { daten: d, unlesbar: false });
    assert.equal(g.daten.polizzen[1].beendet, true);
  });

  test('v:2 mit unbekanntem Feld oder v:3 → unlesbar', () => {
    const gut = JSON.parse(versicherungText(polizzeAnlegen(polizzeAnlegen(leereVersicherung(), P), B)));
    assert.equal(pruefeVersicherung(JSON.stringify(gut)).unlesbar, false);
    const kaputt = [
      { ...gut, v: 3 },
      { ...gut, neu: 1 },
      { ...gut, p: gut.l[0] },
      { ...gut, l: [{ ...gut.l[0], q: 1 }, gut.l[1]] },
      { ...gut, l: [{ ...gut.l[0], x: 2 }, gut.l[1]] },
      { ...gut, l: [gut.l[0], gut.l[0]] },
      { ...gut, h: 'zzzz0000' },
      { ...gut, h: 'abcdefgh' },
      { v: 2, l: gut.l },
      { v: 2, l: [], h: P.id },
      { v: 2 },
      { ...gut, l: 'x' },
      { ...gut, j: 1999 },
      { ...gut, l: [...gut.l, ...['a', 'b', 'c', 'd'].map((c) => ({ ...gut.l[0], i: `${c}0000000` }))] },
    ];
    for (const roh of kaputt) assert.deepEqual(pruefeVersicherung(JSON.stringify(roh)), { daten: leereVersicherung(), unlesbar: true }, JSON.stringify(roh).slice(0, 80));
  });

  test('höchstens 5 Polizzen; zu voll → TEXT_VERSICHERUNG_VOLL', () => {
    assert.equal(MAX_POLIZZEN, 5);
    assert.equal(TEXT_POLIZZEN_MAX, 'Höchstens 5 Versicherungen.');
    let d = leereVersicherung();
    for (const id of ['pola0001', 'pola0002', 'pola0003', 'pola0004', 'pola0005']) d = polizzeAnlegen(d, eigene(id));
    assert.deepEqual([d.polizzen.length, d.stamm], [5, 'pola0001'], 'die erste wird Stamm');
    assert.throws(() => polizzeAnlegen(d, eigene('pola0006')), { message: TEXT_POLIZZEN_MAX });
    assert.equal(polizzeAnlegen(d, eigene('pola0003')), d, 'dieselbe noch einmal = einmal');
    // groß: 12 Kategorien mit vollem Namen und Hinweis (≈ 1950 Zeichen) – zwei passen, die dritte nicht mehr
    const gross = (id) => eigene(id, { kategorien: Array.from({ length: 12 }, (_, i) => ({ id: `k${i}`, name: 'N'.repeat(50), info: 'I'.repeat(80), limitCent: 1 })) });
    let g = leereVersicherung();
    for (const id of ['grob0001', 'grob0002']) g = polizzeAnlegen(g, gross(id));
    assert.equal(g.polizzen.length, 2);
    assert.throws(() => polizzeAnlegen(g, gross('grob0003')), { message: TEXT_VERSICHERUNG_VOLL });
    // fremde Kategorien je Polizze zählen mit (Pre-flight C1)
    const fremd = JSON.parse(versicherungText(polizzeAnlegen(leereVersicherung(), eigene('frem0001'))));
    fremd.l[0].k.push(...Array.from({ length: 30 }, (_, i) => ({ i: `f${i}`, n: 'F'.repeat(150), l: 1, q: 1 })));
    const gelesen = pruefeVersicherung(JSON.stringify(fremd));
    assert.equal(gelesen.daten.fremd.k.frem0001.length, 30);
    assert.throws(() => polizzeAnlegen(gelesen.daten, gross('grob0005')), { message: TEXT_VERSICHERUNG_VOLL });
  });

  test('polizzeAendern: je Polizze, fremde Kategorien bleiben bei ihrer Polizze; beendet bleibt; unbekannt → TEXT_POLIZZE_WEG', () => {
    const d = polizzeBeenden(polizzeAnlegen(pruefeVersicherung(V1_TEXT).daten, B), B.id, true);
    const neu = polizzeAendern(d, { ...B, maximumCent: 200000 });
    assert.deepEqual([neu.polizzen[1].maximumCent, neu.polizzen[1].beendet, neu.polizzen[0]], [200000, true, d.polizzen[0]]);
    assert.equal(polizzeAendern(neu, { ...B, maximumCent: 200000 }), neu, 'zweimal = einmal');
    assert.ok(polizzeAendern(d, { ...B, kategorien: [...B.kategorien.slice(0, 4), { id: 'zahn', name: 'Z', limitCent: 1 }] }), 'zahn ist nur bei der ersten Polizze fremd');
    assert.throws(() => polizzeAendern(d, { ...d.polizzen[0], kategorien: [...d.polizzen[0].kategorien, { id: 'zahn', name: 'Z', limitCent: 1 }] }), /neueren App-Version/);
    assert.throws(() => polizzeAendern(d, eigene('fehl0001')), { message: TEXT_POLIZZE_WEG });
    assert.deepEqual(JSON.parse(versicherungText(neu)).l[0].k.at(-1), FREMD_KATEGORIE);
  });

  test('Rechnung ohne p gehört der Stamm-Polizze; neue Rechnung trägt p', () => {
    const d = polizzeAnlegen(pruefeVersicherung(V1_TEXT).daten, B);
    const alt = pruefeVersicherungTeil(JSON.stringify({ v: 1, j: 2026, q: 4, r: [{ i: 'rech0001', k: 'physio', d: 20261028, b: 9000, e: 20261030 }] }), { jahr: 2026, quartal: 4 });
    assert.equal(alt.unlesbar, false);
    assert.equal(alt.teil.rechnungen[0].polizze, undefined);
    assert.equal(polizzeVonRechnung(d, alt.teil.rechnungen[0]), 'abcd1234');
    const t = rechnungSetzen(alt.teil, rechnung({ id: 'rech0002' }), { heute: HEUTE, polizze: B });
    const roh = JSON.parse(versicherungTeilText(t));
    assert.equal(roh.v, 1, 'der Teil bleibt v:1');
    assert.equal(roh.r[0].p, undefined, 'die alte Rechnung bleibt, wie sie war');
    assert.equal(roh.r[1].p, 'polb0001');
    const wieder = pruefeVersicherungTeil(versicherungTeilText(t), { jahr: 2026, quartal: 4 }).teil.rechnungen[1];
    assert.deepEqual([wieder.polizze, polizzeVonRechnung(d, wieder)], ['polb0001', 'polb0001']);
    assert.throws(() => rechnungSetzen(alt.teil, rechnung({ id: 'rech0003', polizze: 'abcd1234' }), { heute: HEUTE, polizze: B }), /Polizze/);
    assert.equal(normalisiereRechnung(rechnung({ polizze: 'KAPUTT' })), null);
    assert.equal(polizzeVonRechnung(leereVersicherung(), alt.teil.rechnungen[0]), null);
    // Erstattung eintragen: die Polizze der Rechnung bleibt
    assert.equal(JSON.parse(versicherungTeilText(erstattungSetzen(t, 'rech0002', { erstattetCent: 100, erstattetAm: '2026-11-05' }, { heute: HEUTE }))).r[1].p, 'polb0001');
  });

  test('Löschen nur ohne Rechnungen; Beenden und Zurückholen gehen; Stamm rückt nach', () => {
    assert.equal(TEXT_POLIZZE_HAT_RECHNUNGEN, 'Diese Polizze hat Rechnungen – sie lässt sich nur beenden, nicht löschen.');
    const d = polizzeAnlegen(polizzeAnlegen(pruefeVersicherung(V1_TEXT).daten, B), eigene('polc0001'));
    const vorher = tiefKopie(d);
    assert.throws(() => polizzeEntfernen(d, 'abcd1234', { hatRechnungen: true }), { message: TEXT_POLIZZE_HAT_RECHNUNGEN });
    const beendet = polizzeBeenden(d, 'abcd1234', true);
    assert.deepEqual(aktivePolizzen(beendet).map((p) => p.id), ['polb0001', 'polc0001']);
    assert.equal(beendet.stamm, 'abcd1234', 'Beenden ändert den Stamm nicht');
    assert.equal(polizzeBeenden(beendet, 'abcd1234', true), beendet, 'zweimal = einmal');
    const zurueck = polizzeBeenden(beendet, 'abcd1234', false);
    assert.deepEqual(zurueck.polizzen, d.polizzen);
    assert.throws(() => polizzeBeenden(d, 'fehl0001', true), { message: TEXT_POLIZZE_WEG });
    const ohne = polizzeEntfernen(d, 'abcd1234', { hatRechnungen: false });
    assert.deepEqual([ohne.polizzen.map((p) => p.id), ohne.stamm, ohne.fremd], [['polb0001', 'polc0001'], 'polb0001', undefined]);
    assert.equal(polizzeEntfernen(ohne, 'abcd1234', { hatRechnungen: false }), ohne, 'schon weg → dieselben Daten');
    const nurB = polizzeEntfernen(ohne, 'polc0001', { hatRechnungen: false });
    assert.equal(nurB.stamm, 'polb0001', 'eine andere entfernt → Stamm bleibt');
    const leer = polizzeEntfernen(nurB, 'polb0001', { hatRechnungen: false });
    assert.deepEqual([leer.polizzen, leer.stamm, leer.ab], [[], null, 2026]);
    assert.equal(versicherungText(leer), '{"v":2,"l":[],"j":2026}');
    assert.deepEqual(d, vorher, 'Argument unverändert');
  });
});
