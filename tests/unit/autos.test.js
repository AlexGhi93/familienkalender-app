// Autos: Fahrzeuge, Regeln, Reifensätze, Verlauf je Jahr (Speicherformat, Prüfen, reine Änderungen) und die Rechnungen
// (km-Schätzung, Fälligkeiten, Reifen-km, Vignette, Saison). Testdaten: nur Zahlen, keine echten Namen, FIN oder Kennzeichen.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../../src/domain/dates.js';
import {
  ARBEIT_TYPEN,
  AUTO_FARBEN,
  AUTO_VORLAGEN,
  MAX_AUTOS,
  MAX_AUTOS_ZEICHEN,
  TEXT_AUTOS_VOLL,
  TEXT_HISTORIE_VOLL,
  arbeitLoeschen,
  arbeitPruefen,
  arbeitSetzen,
  arbeitSpur,
  arbeitWiederherstellen,
  autoAnlegen,
  autoAusVorlage,
  autoLoeschen,
  autoPruefen,
  autoSetzen,
  autoSpur,
  autoWiederherstellen,
  autosLesen,
  autosText,
  autosWarnungen,
  historieJahrEintragen,
  historieLesen,
  historieText,
  kmEintragen,
  kmLoeschen,
  kmPruefen,
  kmText,
  leereAutos,
  leereHistorie,
  neueAutoId,
  neueArbeitId,
  normalisiereAutos,
  regelLoeschen,
  regelPruefen,
  regelSetzen,
  regelVorlage,
  satzLoeschen,
  satzPruefen,
  satzSetzen,
} from '../../src/domain/autos.js';
import {
  arbeitenVon,
  autoUebersicht,
  faelligkeit,
  kmPunkte,
  kmSchaetzung,
  radmutternHinweis,
  reifenStand,
  saisonHinweis,
  vignettenFrist,
} from '../../src/domain/autos-rechnung.js';
import * as domain from '../../src/domain/index.js';

// ---------------------------------------------------------------- Testdaten (nur Zahlen)

const HEUTE = '2026-11-01';
const T = 'tesla001';
const F = 'fiat0001';
const SOMMER = 'sa000001';
const WINTER = 'sa000002';

function tiefFrieren(x) {
  if (x && typeof x === 'object') {
    Object.values(x).forEach(tiefFrieren);
    Object.freeze(x);
  }
  return x;
}

const teslaAuto = () => ({ id: T, name: 'Tesla Model 3', farbeKennung: 'grau', marke: 'Tesla', handelsbezeichnung: 'Model 3', antrieb: 'Elektro', ezDatum: '2025-07-16', neuGekauft: true, haltung: 'Leasing', vorlage: 'tesla3' });
const fiatAuto = () => ({ id: F, name: 'Fiat 500', farbeKennung: 'rot', marke: 'Fiat', handelsbezeichnung: '500', antrieb: 'Benzin', ezDatum: '2017-07-24', neuGekauft: false, haltung: 'Eigentum', vorlage: 'fiat500' });
const saetze = () => [
  { id: SOMMER, auto: T, name: 'Sommer', art: 'sommer' },
  { id: WINTER, auto: T, name: 'Winter', art: 'winter' },
];
const wechsel = (id, datum, km, satz, extra = {}) => ({ id, auto: T, typ: 'reifenwechsel', datum, km, details: { montiert: satz, rotiert: false }, ...extra });
const rotation = (id, datum, km, satz) => ({ id, auto: T, typ: 'rotation', datum, km, details: satz ? { satzId: satz } : {} });

/** Die echten Zahlen: Sommer 0 → ca. 5.000 (geschätzt), Winter → 8.877, Sommer → 21.693, seitdem Winter. */
const teslaWechsel = () => [
  wechsel('arb00001', '2025-07-16', 0, SOMMER),
  wechsel('arb00002', '2025-11-15', 5000, WINTER, { kmGeschaetzt: true }),
  wechsel('arb00003', '2026-03-31', 8877, SOMMER),
  wechsel('arb00004', '2026-10-29', 21693, WINTER),
];
const kmBei = (km, extra = {}) => ({ km, geschaetzt: false, proTag: null, datum: '2026-10-29', letzterKm: km, warnung: null, ...extra });

const regel = (felder) => ({ id: 'regel001', auto: F, aktiv: true, ...felder });
const oelRegel = () => regel({ typ: 'oelwechsel', name: 'Ölwechsel', intervallMonate: 12, intervallKm: 15000 });
const oel = (datum, km) => ({ id: 'oel00001', auto: F, typ: 'oelwechsel', datum, km, details: { filter: true } });

function datenMitTesla() {
  let d = leereAutos();
  d = autoSetzen(d, teslaAuto());
  for (const s of saetze()) d = satzSetzen(d, s);
  return d;
}

function teslaHistorie() {
  let h25 = leereHistorie(T, 2025);
  let h26 = leereHistorie(T, 2026);
  for (const a of teslaWechsel()) {
    if (a.datum.startsWith('2025')) h25 = arbeitSetzen(h25, a, { heute: HEUTE });
    else h26 = arbeitSetzen(h26, a, { heute: HEUTE });
  }
  return [h25, h26];
}

// ---------------------------------------------------------------- Grundlagen

describe('Autos: Konstanten, Kennungen, Vorlagen', () => {
  test('leere Daten, Kennungen aus 0-9 und a-v, domain/index.js', () => {
    assert.deepEqual(leereAutos(), { v: 1, autos: [], regeln: [], saetze: [], jahre: {} });
    assert.notEqual(leereAutos().autos, leereAutos().autos);
    assert.deepEqual(leereHistorie(T, 2026), { v: 1, auto: T, jahr: 2026, arbeiten: [], km: [] });
    for (let i = 0; i < 50; i += 1) assert.match(neueAutoId(), /^[0-9a-v]{8}$/);
    assert.equal(neueArbeitId(() => 0), '00000000');
    assert.equal(neueAutoId(() => 0.9999999), 'vvvvvvvv');
    for (const name of ['autoSetzen', 'arbeitSetzen', 'autosText', 'historieLesen', 'kmSchaetzung', 'faelligkeit', 'reifenStand', 'vignettenFrist', 'autoUebersicht']) assert.equal(typeof domain[name], 'function', name);
    assert.equal(typeof domain.zielPruefen, 'function'); // Sparziele weiter erreichbar
  });

  test('ARBEIT_TYPEN: alle 14 Typen mit Emoji, Name und Detailfeldern; eingefroren', () => {
    assert.deepEqual(
      ARBEIT_TYPEN.map((t) => t.id),
      ['oelwechsel', 'reifenwechsel', 'rotation', 'vignette', 'pickerl', 'bremsfluessigkeit', 'zuendkerzen', 'luftfilter', 'innenraumfilter', 'bremssattel', 'wischer', 'keilriemen', 'dualogic', 'sonstiges'],
    );
    for (const t of ARBEIT_TYPEN) {
      assert.ok(t.emoji && t.name && Array.isArray(t.details), t.id);
      assert.ok(Object.isFrozen(t) && Object.isFrozen(t.details), t.id);
    }
    assert.deepEqual(ARBEIT_TYPEN.find((t) => t.id === 'oelwechsel').details.map((d) => d.feld), ['oelSorte', 'menge', 'filter']);
    assert.deepEqual(ARBEIT_TYPEN.find((t) => t.id === 'reifenwechsel').details.map((d) => d.feld), ['montiert', 'rotiert']);
    assert.deepEqual(ARBEIT_TYPEN.find((t) => t.id === 'vignette').details.map((d) => d.feld), ['jahr', 'art', 'gekauftAm', 'gueltigBis']);
    assert.deepEqual(ARBEIT_TYPEN.find((t) => t.id === 'pickerl').details.map((d) => d.feld), ['naechsterMonat']);
    assert.throws(() => ARBEIT_TYPEN.push({}));
    assert.ok(AUTO_FARBEN.some((f) => f.id === 'grau'));
  });

  test('AUTO_VORLAGEN: Tesla Model 3 und Fiat 500 TwinAir, Regeln mit Quelle, Pickerl als fester Monat', () => {
    const tesla = AUTO_VORLAGEN.find((v) => v.id === 'tesla3');
    const fiat = AUTO_VORLAGEN.find((v) => v.id === 'fiat500');
    assert.ok(tesla && fiat);
    assert.ok(Object.isFrozen(tesla) && Object.isFrozen(tesla.regeln) && Object.isFrozen(tesla.regeln[0]));
    assert.equal(tesla.auto.antrieb, 'Elektro');
    assert.deepEqual([tesla.auto.neuGekauft, fiat.auto.neuGekauft], [true, false]); // I2
    assert.equal(fiat.auto.antrieb, 'Benzin');
    for (const v of [tesla, fiat]) {
      assert.equal(v.auto.kennzeichen, undefined); // nur Modelldaten
      assert.equal(v.auto.fin, undefined);
      for (const r of v.regeln) {
        if (r.autoDatum) continue; // Leasing-Ende kommt aus dem Vertrag, nicht aus einer Recherche
        assert.match(r.quelle, /^https:\/\//, `${v.id}/${r.vorlage}`);
        assert.equal(regelPruefen({ ...r, id: 'regel001', auto: T, aktiv: true }), null, `${v.id}/${r.vorlage}`);
      }
    }
    const t = (s) => tesla.regeln.find((r) => r.vorlage === s);
    assert.equal(t('rotation').intervallKm, 10000);
    assert.deepEqual([t('bremssattel').intervallMonate, t('bremssattel').intervallKm], [12, 20000]);
    assert.equal(t('innenraumfilter').intervallMonate, 24);
    assert.equal(t('bremsfluessigkeit').intervallMonate, 48);
    assert.equal(t('wischer').intervallMonate, 12);
    assert.equal(t('pickerl').fixMonat, '2028-07');
    assert.ok(t('vignette') && t('reifen'));
    assert.equal(t('leasing').autoDatum, 'leasingEnde');
    const f = (s) => fiat.regeln.find((r) => r.vorlage === s);
    assert.deepEqual([f('oel').intervallMonate, f('oel').intervallKm], [12, 15000]);
    assert.match(f('oel').info, /0W-30/);
    assert.match(f('oel').info, /9\.55535-GS1/);
    assert.equal(f('bremsfluessigkeit').intervallMonate, 24);
    assert.deepEqual([f('zuendkerzen').intervallKm, f('zuendkerzen').intervallMonate], [30000, 24]); // I5: 30.000 km ODER 2 Jahre
    assert.match(f('zuendkerzen').info, /NGK ILKR9G8/);
    assert.match(f('zuendkerzen').info, /46344791/);
    assert.deepEqual([f('luftfilter').intervallMonate, f('luftfilter').intervallKm], [24, 30000]);
    assert.equal(f('innenraumfilter').intervallMonate, 12);
    assert.equal(f('dualogic').intervallMonate, 12);
    assert.ok(f('keilriemen') && f('vignette') && f('reifen'));
    assert.deepEqual([f('pickerl').fixMonat, f('pickerl').intervallMonate], ['2027-07', 12]);
  });

  test('autoAusVorlage + autoAnlegen: Auto, Regeln und Reifensätze auf einmal, wiederholbar', () => {
    const paket = autoAusVorlage('tesla3', { name: 'Unser Tesla', ezDatum: '2025-07-16', kennzeichen: 'W-12345' });
    assert.equal(paket.auto.marke, 'Tesla');
    assert.equal(paket.auto.name, 'Unser Tesla');
    assert.equal(paket.auto.vorlage, 'tesla3');
    assert.equal(paket.auto.neuGekauft, true);
    assert.ok(paket.regeln.every((r) => r.auto === paket.auto.id && r.aktiv));
    assert.deepEqual(paket.saetze.map((s) => s.art), ['sommer', 'winter']);
    const d = autoAnlegen(leereAutos(), paket);
    assert.equal(d.autos.length, 1);
    assert.equal(d.regeln.length, AUTO_VORLAGEN.find((v) => v.id === 'tesla3').regeln.length);
    assert.equal(autoAnlegen(d, paket), d); // zweimal angewendet = einmal
    const pickerl = d.regeln.find((r) => r.typ === 'pickerl');
    assert.equal(pickerl.fixMonat, '2028-07');
    assert.equal(regelVorlage(d.autos[0], pickerl).quelle.startsWith('https://'), true);
    assert.throws(() => autoAusVorlage('vw', {}), /Vorlage/);
  });
});

// ---------------------------------------------------------------- Prüfen

describe('Autos: Prüfen mit deutschen Meldungen', () => {
  test('autoPruefen', () => {
    assert.equal(autoPruefen(teslaAuto()), null);
    assert.equal(autoPruefen({ ...teslaAuto(), name: '  ' }), 'Bitte einen Namen eingeben.');
    assert.equal(autoPruefen({ ...teslaAuto(), name: 'x'.repeat(31) }), 'Der Name darf höchstens 30 Zeichen haben.');
    assert.equal(autoPruefen({ ...teslaAuto(), farbeKennung: 'pink' }), 'Bitte eine Farbe wählen.');
    assert.equal(autoPruefen({ ...teslaAuto(), fin: 'ABC' }), 'Die FIN hat 17 Zeichen: Ziffern und Buchstaben ohne I, O und Q.');
    assert.equal(autoPruefen({ ...teslaAuto(), fin: 'abcdefgh1jk123456' }), null); // klein geschrieben → wird groß
    assert.equal(autoPruefen({ ...teslaAuto(), ezDatum: '2025-02-30' }), 'Bitte bei „Erstzulassung“ ein gültiges Datum eingeben.');
    assert.equal(autoPruefen({ ...teslaAuto(), zulassungDatum: '2025-01-01' }), 'Die Zulassung kann nicht vor der Erstzulassung liegen.');
    assert.equal(autoPruefen({ ...teslaAuto(), leistungKw: 0 }), 'Bitte bei „Leistung (kW)“ eine ganze Zahl von 1 bis 2000 eingeben.');
    assert.equal(autoPruefen({ ...teslaAuto(), antrieb: 'Dampf' }), 'Bitte bei „Antrieb“ einen Wert aus der Liste wählen.');
    assert.equal(autoPruefen({ name: 'Nur Name', farbeKennung: 'blau' }), null); // alles aus dem Zulassungsschein ist freiwillig
    assert.equal(autoPruefen(null), 'Bitte einen Namen eingeben.');
  });

  test('regelPruefen und satzPruefen', () => {
    assert.equal(regelPruefen(oelRegel()), null);
    assert.equal(regelPruefen({ ...oelRegel(), typ: 'tanken' }), 'Bitte eine Art wählen.');
    assert.equal(regelPruefen({ ...oelRegel(), intervallMonate: 0 }), 'Bitte ein Intervall von 1 bis 240 Monaten eingeben.');
    assert.equal(regelPruefen({ ...oelRegel(), intervallKm: 50 }), 'Bitte ein Intervall von 100 bis 1.000.000 km eingeben.');
    assert.equal(regelPruefen(regel({ typ: 'wischer', name: 'Wischer' })), 'Bitte ein Intervall (Monate oder Kilometer) oder einen festen Monat angeben.');
    assert.equal(regelPruefen(regel({ typ: 'vignette', name: 'Vignette' })), null); // Vignette und Reifenwechsel haben feste Termine
    assert.equal(regelPruefen(regel({ typ: 'rotation', name: 'Rotieren' })), 'Bitte angeben, nach wie vielen Kilometern rotiert wird.');
    assert.equal(regelPruefen(regel({ typ: 'pickerl', name: 'Pickerl', fixMonat: '2027-13' })), 'Bitte einen gültigen Monat eingeben.');
    assert.equal(satzPruefen(saetze()[0]), null);
    assert.equal(satzPruefen({ ...saetze()[0], name: '' }), 'Bitte einen Namen für den Reifensatz eingeben.');
    assert.equal(satzPruefen({ ...saetze()[0], startKm: -1 }), 'Bitte bei „Kilometer vorher“ eine ganze Zahl von 0 bis 500000 eingeben.');
  });

  test('arbeitPruefen: Zukunft > 1 Tag ist ein Fehler, niedrigerer km nur eine Warnung (Review Focus 1)', () => {
    const punkte = [{ datum: '2026-10-29', km: 21693, quelle: 'arbeit', arbeit: 'arb00004' }];
    const ok = { id: 'arb00009', auto: T, typ: 'wischer', datum: '2026-11-01', km: 21800, details: {} };
    assert.deepEqual(arbeitPruefen(ok, { heute: HEUTE, punkte }), { fehler: null, warnung: null });
    assert.equal(arbeitPruefen({ ...ok, datum: '2026-11-02' }, { heute: HEUTE }).fehler, null); // morgen geht (Zeitzonen)
    assert.equal(arbeitPruefen({ ...ok, datum: '2026-11-03' }, { heute: HEUTE }).fehler, 'Das Datum liegt in der Zukunft – eingetragen wird, was schon erledigt ist.');
    const r = arbeitPruefen({ ...ok, km: 2169 }, { heute: HEUTE, punkte });
    assert.equal(r.fehler, null);
    assert.equal(r.warnung, 'Der Kilometerstand ist niedriger als ein früherer (21.693 km am 29.10.2026). Bitte prüfen – gespeichert wird er trotzdem.');
    // die eigene alte Fassung (beim Ändern) zählt nicht
    assert.equal(arbeitPruefen({ ...ok, id: 'arb00004', datum: '2026-10-29', km: 21000 }, { heute: HEUTE, punkte }).warnung, null);
    // eine ältere Arbeit nachtragen: niedriger km ist dann richtig
    assert.equal(arbeitPruefen({ ...ok, datum: '2026-06-01', km: 15000 }, { heute: HEUTE, punkte }).warnung, null);
    assert.match(arbeitPruefen({ ...ok, datum: '2026-06-01', km: 25000 }, { heute: HEUTE, punkte }).warnung, /höher als ein späterer/);
    assert.match(arbeitPruefen({ ...ok, km: 250000 }, { heute: HEUTE, punkte }).warnung, /sehr viel höher/);
    assert.equal(arbeitPruefen({ ...ok, km: 1.5 }, { heute: HEUTE }).fehler, 'Bitte einen Kilometerstand von 0 bis 2.000.000 km eingeben (ganze Kilometer).');
    assert.equal(arbeitPruefen({ ...ok, typ: 'reifenwechsel', km: undefined, details: { montiert: SOMMER } }, { heute: HEUTE }).fehler, 'Bitte den Kilometerstand beim Reifenwechsel angeben – daraus werden die Kilometer je Reifensatz gerechnet.');
    assert.equal(arbeitPruefen({ ...ok, typ: 'reifenwechsel', details: {} }, { heute: HEUTE }).fehler, 'Bitte wählen, welcher Reifensatz montiert wurde.');
    assert.equal(arbeitPruefen({ ...ok, typ: 'rotation', km: undefined }, { heute: HEUTE }).fehler, 'Bitte den Kilometerstand beim Rotieren angeben.');
    assert.equal(arbeitPruefen({ ...ok, typ: 'vignette', details: {} }, { heute: HEUTE }).fehler, 'Bitte das Jahr der Vignette angeben.');
    assert.equal(arbeitPruefen({ ...ok, kosten: -1 }, { heute: HEUTE }).fehler, 'Bitte Kosten von 0 € bis 99.999,99 € eingeben.');
    assert.equal(arbeitPruefen({ ...ok, notiz: 'x'.repeat(121) }, { heute: HEUTE }).fehler, 'Die Notiz darf höchstens 120 Zeichen haben.');
    assert.equal(arbeitPruefen({ ...ok, typ: 'oelwechsel', details: { menge: '3,2', filter: true } }, { heute: HEUTE }).fehler, null);
    assert.equal(arbeitPruefen({ ...ok, typ: 'oelwechsel', details: { menge: 'viel' } }, { heute: HEUTE }).fehler, 'Ungültige Angabe bei „Menge (Liter)“.');
    assert.throws(() => arbeitPruefen(ok, {}), /heute/);
  });

  test('kmPruefen und kmText', () => {
    assert.equal(kmText(21693), '21.693 km');
    assert.equal(kmText(0), '0 km');
    assert.equal(kmText(1234567), '1.234.567 km');
    const punkte = [{ datum: '2026-10-29', km: 21693, quelle: 'eingabe' }];
    assert.deepEqual(kmPruefen({ datum: '2026-11-01', km: 21800 }, { heute: HEUTE, punkte }), { fehler: null, warnung: null });
    assert.match(kmPruefen({ datum: '2026-11-01', km: 20000 }, { heute: HEUTE, punkte }).warnung, /niedriger/);
    assert.equal(kmPruefen({ datum: '2026-11-01', km: -5 }, { heute: HEUTE }).fehler, 'Bitte einen Kilometerstand von 0 bis 2.000.000 km eingeben (ganze Kilometer).');
    assert.equal(kmPruefen({ datum: '2026-11-05', km: 5 }, { heute: HEUTE }).fehler, 'Das Datum liegt in der Zukunft – eingetragen wird, was schon erledigt ist.');
  });
});

// ---------------------------------------------------------------- Speicherformat

describe('Autos: Speicherformat (Hauptteil und Verlauf je Jahr)', () => {
  test('Hauptteil: hin und zurück mit kurzen Schlüsseln, alle Felder', () => {
    let d = datenMitTesla();
    d = autoSetzen(d, { ...teslaAuto(), kennzeichen: 'w-12345', fin: 'abcdefgh1jk123456', typVariante: 'Long Range', motorcode: 'X1', leistungKw: 300, zulassungDatum: '2025-07-16', reifenGroessen: '235/45 R18', leasingEnde: '2028-06-30', notiz: 'Demo' });
    d = autoSetzen(d, { ...fiatAuto(), hubraum: 875 });
    d = regelSetzen(d, oelRegel());
    d = regelSetzen(d, regel({ id: 'regel002', typ: 'pickerl', name: 'Pickerl', fixMonat: '2027-07', intervallMonate: 12, aktiv: false, vorlage: 'pickerl' }));
    d = regelSetzen(d, regel({ id: 'regel003', typ: 'zuendkerzen', name: 'Zündkerzen', intervallKm: 30000, ersteFaelligkeit: '2027-03', ersteFaelligkeitKm: 90000 }));
    d = satzSetzen(d, { id: 'sa000003', auto: F, name: 'Ganzjahr', groesse: '195/45 R16', startKm: 4000, startGeschaetzt: true });
    d = historieJahrEintragen(d, T, 2026);
    d = historieJahrEintragen(d, T, 2025);
    d = historieJahrEintragen(d, T, 2026);
    const text = autosText(d);
    const roh = JSON.parse(text);
    assert.deepEqual(Object.keys(roh), ['v', 'a', 'r', 's', 'j']);
    assert.equal(roh.a[0].k, 'W-12345'); // Kennzeichen groß
    assert.equal(roh.a[0].g, 'ABCDEFGH1JK123456');
    assert.equal(roh.a[0].p, 1); // neuGekauft
    assert.equal('p' in roh.a[1], false);
    assert.equal(roh.r[1].o, 1); // nicht aktiv
    assert.deepEqual(roh.j, { [T]: [2025, 2026] });
    const { daten, unlesbar } = autosLesen(text);
    assert.equal(unlesbar, false);
    assert.deepEqual(daten, d);
    assert.equal(daten.saetze[2].art, 'ganzjahr'); // aus dem Namen
    assert.equal(daten.regeln[1].aktiv, false);
    assert.deepEqual(autosWarnungen({ daten, unlesbar }), []);
  });

  test('kaputter Text oder andere Version → unlesbar; leer → leer', () => {
    assert.deepEqual(autosLesen(''), { daten: leereAutos(), unlesbar: false });
    assert.deepEqual(autosLesen(undefined), { daten: leereAutos(), unlesbar: false });
    for (const t of ['{kaputt', '[]', '{"v":2,"a":[],"r":[],"s":[],"j":{}}', '{"v":1,"a":{}}', '{"v":1,"a":[],"j":[]}', '{"v":1,"a":[],"j":{"tesla001":"2026"}}']) {
      const r = autosLesen(t);
      assert.equal(r.unlesbar, true, t);
      assert.deepEqual(r.daten, leereAutos(), t);
    }
    assert.match(autosWarnungen({ daten: leereAutos(), unlesbar: true })[0], /unlesbar/);
    assert.equal(historieLesen('{kaputt', { auto: T, jahr: 2026 }).unlesbar, true);
    assert.equal(historieLesen('{"v":2,"a":"tesla001","j":2026,"w":[],"k":[]}', { auto: T, jahr: 2026 }).unlesbar, true);
    assert.equal(historieLesen(historieText(leereHistorie(F, 2026)), { auto: T, jahr: 2026 }).unlesbar, true); // falsches Auto
    assert.equal(historieLesen(historieText(leereHistorie(T, 2025)), { auto: T, jahr: 2026 }).unlesbar, true); // falsches Jahr
    assert.deepEqual(historieLesen('', { auto: T, jahr: 2026 }), { historie: leereHistorie(T, 2026), unlesbar: false });
  });

  test('unbekannte Einträge bleiben als fremd erhalten und werden unverändert mitgeschrieben', () => {
    const fremdesAuto = { i: 'neu00001', n: 'Zukunft', f: 'blau', q9: 'neues Feld' };
    const fremdeRegel = { i: 'regel009', a: T, y: 'tanken', n: 'Tanken', m: 1 };
    const text = JSON.stringify({ v: 1, a: [{ i: T, n: 'Tesla', f: 'grau' }, fremdesAuto], r: [fremdeRegel], s: [], j: {} });
    const { daten } = autosLesen(text);
    assert.equal(daten.autos.length, 1);
    assert.deepEqual(daten.fremd, { a: [fremdesAuto], r: [fremdeRegel], s: [] });
    assert.equal(autosWarnungen({ daten, unlesbar: false }).length, 2);
    const neu = autoSetzen(daten, fiatAuto());
    const wieder = JSON.parse(autosText(neu));
    assert.deepEqual(wieder.a.at(-1), fremdesAuto);
    assert.deepEqual(wieder.r, [fremdeRegel]);
    // eine fremde Kennung lässt sich nicht überschreiben, sie zählt auch bei der Höchstzahl
    assert.throws(() => autoSetzen(daten, { ...fiatAuto(), id: 'neu00001' }), /neueren App-Version/);
    // Verlauf: fremde Arbeit bleibt
    const fremdeArbeit = { i: 'arb00099', y: 'laden', d: '2026-10-01' };
    const ht = JSON.stringify({ v: 1, a: T, j: 2026, w: [{ i: 'arb00001', y: 'wischer', d: '2026-10-01', x: {} }, fremdeArbeit], k: [{ d: '2026-10-02', k: 21000 }, { d: 'gestern', k: 1 }] });
    const { historie } = historieLesen(ht, { auto: T, jahr: 2026 });
    assert.equal(historie.arbeiten.length, 1);
    assert.equal(historie.arbeiten[0].auto, T);
    assert.deepEqual(historie.fremd, { w: [fremdeArbeit], k: [{ d: 'gestern', k: 1 }] });
    const h2 = arbeitSetzen(historie, { id: 'arb00002', auto: T, typ: 'luftfilter', datum: '2026-10-05', details: {} }, { heute: HEUTE });
    const roh = JSON.parse(historieText(h2));
    assert.deepEqual(roh.w.at(-1), fremdeArbeit);
    assert.deepEqual(roh.k.at(-1), { d: 'gestern', k: 1 });
  });

  test('M7: doppelte Kennungen beim Lesen gehen nicht verloren, sondern bleiben als fremd erhalten', () => {
    const doppelt = { i: T, n: 'Zweiter', f: 'rot' };
    const { daten } = autosLesen(JSON.stringify({ v: 1, a: [{ i: T, n: 'Tesla', f: 'grau' }, doppelt], r: [], s: [], j: {} }));
    assert.deepEqual(daten.autos.map((a) => a.name), ['Tesla']);
    assert.deepEqual(daten.fremd.a, [doppelt]);
    assert.deepEqual(JSON.parse(autosText(daten)).a.at(-1), doppelt);
    const w = { i: 'arb00001', y: 'wischer', d: '2026-10-01', x: {} };
    const { historie } = historieLesen(JSON.stringify({ v: 1, a: T, j: 2026, w: [w, { ...w, d: '2026-10-02' }], k: [] }), { auto: T, jahr: 2026 });
    assert.equal(historie.arbeiten.length, 1);
    assert.equal(historie.fremd.w.length, 1);
  });

  test('Verlauf: hin und zurück, Details mit kurzen Schlüsseln', () => {
    let h = leereHistorie(F, 2026);
    h = arbeitSetzen(h, { id: 'oel00001', auto: F, typ: 'oelwechsel', datum: '2026-06-01', km: 80000, kosten: 12990, notiz: ' Selenia  Digitek ', regel: 'regel001', details: { oelSorte: '0W-30', menge: '3,2', filter: true } }, { heute: HEUTE });
    h = arbeitSetzen(h, { id: 'vig00001', auto: F, typ: 'vignette', datum: '2026-11-01', details: { jahr: 2027, art: 'digital', gekauftAm: '2026-11-01' } }, { heute: HEUTE });
    h = kmEintragen(h, { datum: '2026-10-31', km: 85000 }, { heute: HEUTE });
    const text = historieText(h);
    const roh = JSON.parse(text);
    assert.deepEqual(roh.w[0], { i: 'oel00001', y: 'oelwechsel', d: '2026-06-01', k: 80000, n: 'Selenia Digitek', c: 12990, r: 'regel001', x: { s: '0W-30', m: 3.2, f: 1 } });
    assert.deepEqual(roh.k, [{ d: '2026-10-31', k: 85000 }]);
    const { historie } = historieLesen(text, { auto: F, jahr: 2026 });
    assert.deepEqual(historie, h);
    assert.deepEqual(historie.arbeiten[0].details, { oelSorte: '0W-30', menge: 3.2, filter: true });
    assert.deepEqual(historie.km, [{ datum: '2026-10-31', km: 85000, quelle: 'eingabe' }]);
  });

  test('Größe: zu voll → klare Meldung, nichts wird gekürzt', () => {
    let d = leereAutos();
    for (let i = 0; i < MAX_AUTOS; i += 1) d = autoSetzen(d, { ...fiatAuto(), id: `auto000${i}`, notiz: 'x'.repeat(120), typVariante: 'y'.repeat(40) });
    assert.throws(() => autoSetzen(d, { ...fiatAuto(), id: 'auto0009' }), new RegExp(`Höchstens ${MAX_AUTOS} Autos`));
    let voll = d;
    assert.throws(() => {
      for (let i = 0; i < 200; i += 1) voll = regelSetzen(voll, regel({ id: `r${String(i).padStart(7, '0')}`, auto: 'auto0000', typ: 'sonstiges', name: 'z'.repeat(40), intervallMonate: 12 }));
    }, (e) => e.message === TEXT_AUTOS_VOLL || /Höchstens/.test(e.message));
    assert.ok(autosText(voll).length <= MAX_AUTOS_ZEICHEN);
    let h = leereHistorie(T, 2026);
    assert.throws(() => {
      for (let i = 0; i < 200; i += 1) h = arbeitSetzen(h, { id: `a${String(i).padStart(7, '0')}`, auto: T, typ: 'sonstiges', datum: '2026-05-01', notiz: 'n'.repeat(120), details: {} }, { heute: HEUTE });
    }, new RegExp(TEXT_HISTORIE_VOLL.slice(0, 20)));
    assert.ok(historieText(h).length <= 6000);
  });
});

// ---------------------------------------------------------------- Änderungen

describe('Autos: reine Änderungen', () => {
  test('autoSetzen: anlegen, ändern an derselben Stelle, gleich → dieselben Daten; Argument unverändert', () => {
    const d0 = tiefFrieren(leereAutos());
    const d1 = tiefFrieren(autoSetzen(d0, teslaAuto()));
    const d2 = tiefFrieren(autoSetzen(d1, fiatAuto()));
    assert.deepEqual(d2.autos.map((a) => a.id), [T, F]);
    assert.equal(autoSetzen(d2, teslaAuto()), d2);
    const d3 = autoSetzen(d2, { ...teslaAuto(), name: 'Tesla neu' });
    assert.deepEqual(d3.autos.map((a) => a.name), ['Tesla neu', 'Fiat 500']);
    assert.throws(() => autoSetzen(d2, { ...teslaAuto(), id: 'XYZ' }), /Ungültige Kennung/);
    assert.throws(() => autoSetzen(d2, { ...teslaAuto(), name: '' }), /Namen/);
  });

  test('regelSetzen/satzSetzen nur für ein bestehendes Auto; Löschen', () => {
    const d = datenMitTesla();
    assert.throws(() => regelSetzen(d, oelRegel()), /Dieses Auto gibt es nicht mehr/);
    const d2 = regelSetzen(autoSetzen(d, fiatAuto()), oelRegel());
    assert.equal(regelSetzen(d2, oelRegel()), d2);
    assert.equal(regelSetzen(d2, { ...oelRegel(), intervallKm: 20000 }).regeln[0].intervallKm, 20000);
    assert.equal(regelLoeschen(d2, 'regel001').regeln.length, 0);
    assert.equal(regelLoeschen(d2, 'gibtsnix'), d2);
    assert.equal(satzLoeschen(d2, SOMMER).saetze.length, 1);
    assert.throws(() => satzSetzen(d2, { id: 'sa000009', auto: 'unbekann', name: 'X' }), /Dieses Auto gibt es nicht mehr/);
  });

  test('autoLoeschen entfernt Regeln, Reifensätze und Jahre; Rückgängig stellt alles genau wieder her', () => {
    let d = autoSetzen(datenMitTesla(), fiatAuto());
    d = regelSetzen(d, oelRegel());
    d = regelSetzen(d, regel({ id: 'regel002', auto: T, typ: 'wischer', name: 'Wischer', intervallMonate: 12 }));
    d = historieJahrEintragen(d, T, 2026);
    tiefFrieren(d);
    const spur = autoSpur(d, T);
    const ohne = autoLoeschen(d, T);
    assert.deepEqual(ohne.autos.map((a) => a.id), [F]);
    assert.deepEqual(ohne.regeln.map((r) => r.id), ['regel001']);
    assert.deepEqual(ohne.saetze, []);
    assert.deepEqual(ohne.jahre, {});
    assert.equal(autoLoeschen(ohne, T), ohne);
    const zurueck = autoWiederherstellen(ohne, spur);
    assert.deepEqual(zurueck, d);
    assert.equal(autoWiederherstellen(zurueck, spur), zurueck);
    assert.equal(autoSpur(d, 'gibtsnix'), null);
  });

  test('historieJahrEintragen: nur für bestehende Autos, gültige Jahre, wiederholbar', () => {
    const d = historieJahrEintragen(datenMitTesla(), T, 2026);
    assert.equal(historieJahrEintragen(d, T, 2026), d);
    assert.throws(() => historieJahrEintragen(d, F, 2026), /Dieses Auto gibt es nicht mehr/);
    assert.throws(() => historieJahrEintragen(d, T, 1990), /Jahr/);
  });

  test('arbeitSetzen: richtiges Auto und Jahr, wiederholbar; Löschen + Rückgängig', () => {
    const h0 = tiefFrieren(leereHistorie(T, 2026));
    const a = wechsel('arb00003', '2026-03-31', 8877, SOMMER);
    const h1 = tiefFrieren(arbeitSetzen(h0, a, { heute: HEUTE }));
    assert.equal(h1.arbeiten.length, 1);
    assert.deepEqual(h1.arbeiten[0], { id: 'arb00003', auto: T, typ: 'reifenwechsel', datum: '2026-03-31', km: 8877, details: { montiert: SOMMER, rotiert: false } });
    assert.equal(arbeitSetzen(h1, a, { heute: HEUTE }), h1);
    const h2 = tiefFrieren(arbeitSetzen(h1, { ...a, id: 'arb00004', datum: '2026-10-29', km: 21693, details: { montiert: WINTER } }, { heute: HEUTE }));
    assert.throws(() => arbeitSetzen(h1, { ...a, datum: '2025-03-31' }, { heute: HEUTE }), /anderes Jahr/);
    assert.throws(() => arbeitSetzen(h1, { ...a, auto: F }, { heute: HEUTE }), /anderen Auto/);
    assert.throws(() => arbeitSetzen(h1, { ...a, datum: '2026-12-24' }, { heute: HEUTE }), /Zukunft/);
    const spur = arbeitSpur(h2, 'arb00003');
    const ohne = arbeitLoeschen(h2, 'arb00003');
    assert.deepEqual(ohne.arbeiten.map((x) => x.id), ['arb00004']);
    assert.equal(arbeitLoeschen(ohne, 'arb00003'), ohne);
    assert.deepEqual(arbeitWiederherstellen(ohne, spur), h2);
    assert.equal(arbeitWiederherstellen(h2, spur), h2);
  });

  test('kmEintragen: einer je Tag (der neue gilt), Löschen', () => {
    let h = kmEintragen(leereHistorie(T, 2026), { datum: '2026-10-30', km: 21700 }, { heute: HEUTE });
    h = kmEintragen(h, { datum: '2026-10-20', km: 21000 }, { heute: HEUTE });
    assert.deepEqual(h.km.map((p) => p.datum), ['2026-10-20', '2026-10-30']);
    const h2 = kmEintragen(h, { datum: '2026-10-30', km: 21750 }, { heute: HEUTE });
    assert.deepEqual(h2.km.map((p) => p.km), [21000, 21750]);
    assert.equal(kmEintragen(h2, { datum: '2026-10-30', km: 21750 }, { heute: HEUTE }), h2);
    assert.throws(() => kmEintragen(h, { datum: '2025-10-30', km: 1 }, { heute: HEUTE }), /anderes Jahr/);
    assert.throws(() => kmEintragen(h, { datum: '2026-10-30', km: -1 }, { heute: HEUTE }), /Kilometerstand/);
    assert.deepEqual(kmLoeschen(h2, '2026-10-30').km.map((p) => p.km), [21000]);
    assert.equal(kmLoeschen(h2, '2026-01-01'), h2);
  });
});

// ---------------------------------------------------------------- km-Schätzung

describe('Autos: Kilometerstand schätzen', () => {
  test('0, 1 und 2 Punkte (Review Focus 2: ohne Punkte keine Division durch 0)', () => {
    assert.equal(kmSchaetzung([], HEUTE), null);
    assert.equal(kmSchaetzung(undefined, HEUTE), null);
    assert.deepEqual(kmSchaetzung([{ datum: '2026-10-01', km: 1000 }], HEUTE), { km: 1000, geschaetzt: false, proTag: null, datum: '2026-10-01', letzterKm: 1000, warnung: null });
    const zwei = kmSchaetzung([{ datum: '2026-10-21', km: 2000 }, { datum: '2026-10-01', km: 1000 }], HEUTE);
    assert.deepEqual(zwei, { km: 2550, geschaetzt: true, proTag: 50, datum: '2026-10-21', letzterKm: 2000, warnung: null });
    // zwei Punkte am selben Tag: keine Geschwindigkeit
    assert.equal(kmSchaetzung([{ datum: '2026-10-21', km: 2000 }, { datum: '2026-10-21', km: 2100 }], HEUTE).proTag, null);
    assert.throws(() => kmSchaetzung([], '1.11.2026'), /heute/);
  });

  test('zuerst die letzten 90 Tage (mit ≥ 2 Punkten), sonst alle', () => {
    const punkte = [{ datum: '2025-01-01', km: 0 }, { datum: '2026-09-01', km: 10000 }, { datum: '2026-10-01', km: 11000 }, { datum: '2026-10-21', km: 12000 }];
    assert.equal(kmSchaetzung(punkte, HEUTE).proTag, 40); // 2.000 km in 50 Tagen
    const alt = kmSchaetzung([{ datum: '2026-01-01', km: 0 }, { datum: '2026-10-21', km: 2930 }], HEUTE);
    assert.equal(alt.proTag, 10); // nur 1 Punkt im Fenster → alle (293 Tage)
    assert.equal(alt.km, 3040);
  });

  test('Ruling I2 (Review T3): das Fenster endet am letzten Stand – ohne neue Eingabe bleiben Schätzung und km-Termin Tag für Tag gleich', () => {
    // 20.08. 10.000, 01.09. 10.100, 10.10. 12.400 – früher fielen die ersten Punkte mit jedem Tag aus dem Fenster (Termin sprang)
    const punkte = [{ datum: '2026-08-20', km: 10000 }, { datum: '2026-09-01', km: 10100 }, { datum: '2026-10-10', km: 12400 }];
    const oelF = regel({ typ: 'oelwechsel', name: 'Ölwechsel', intervallKm: 15000 });
    const arbeit = [{ ...oel('2026-01-20', 234) }];
    const termine = new Set();
    const tempi = new Set();
    for (let tag = '2026-10-10'; tag <= '2027-01-31'; tag = addDays(tag, 1)) {
      const kmInfo = kmSchaetzung(punkte, tag);
      tempi.add(kmInfo.proTag);
      termine.add(faelligkeit(oelF, arbeit, fiatAuto(), kmInfo, tag).datum);
    }
    assert.deepEqual([...tempi], [2400 / 51]);
    assert.equal(termine.size, 1);
    assert.deepEqual([...termine], ['2026-12-10']); // 2.834 km Rest mit ca. 47 km/Tag ab dem 10.10. = 61 Tage
  });

  test('niedrigerer Stand → Warnung, Rechnung bleibt heil und nie unter dem letzten bekannten (Review Focus 1)', () => {
    const r = kmSchaetzung([{ datum: '2026-10-01', km: 1000 }, { datum: '2026-10-11', km: 900 }, { datum: '2026-10-21', km: 2000 }], HEUTE);
    assert.equal(r.proTag, 50);
    assert.equal(r.km, 2550);
    assert.equal(r.warnung, 'Der Kilometerstand vom 11.10.2026 (900 km) ist niedriger als ein früherer (1.000 km) und wird nicht mitgerechnet – bitte prüfen.');
    const falsch = kmSchaetzung([{ datum: '2026-10-01', km: 50000 }, { datum: '2026-10-21', km: 5000 }], HEUTE);
    assert.equal(falsch.km, 50000);
    assert.ok(falsch.warnung);
  });

  test('I1: ein unplausibler Punkt (> 1.000 km/Tag) zählt nicht, spätere richtige Stände bleiben gültig', () => {
    const tippfehler = kmSchaetzung([{ datum: '2026-10-28', km: 21600 }, { datum: '2026-10-29', km: 216930 }, { datum: '2026-10-31', km: 21800 }], HEUTE);
    assert.equal(tippfehler.letzterKm, 21800);
    assert.equal(tippfehler.proTag, 200 / 3);
    assert.equal(tippfehler.km, 21867);
    assert.equal(tippfehler.warnung, 'Der Kilometerstand vom 29.10.2026 (216.930 km) ist unplausibel (mehr als 1.000 km pro Tag) und wird nicht mitgerechnet – bitte prüfen.');
    // am selben Tag zählt als 1 Tag: 1.000 km gehen, 1.001 km nicht
    assert.equal(kmSchaetzung([{ datum: '2026-10-31', km: 0 }, { datum: '2026-10-31', km: 1000 }], HEUTE).letzterKm, 1000);
    assert.equal(kmSchaetzung([{ datum: '2026-10-31', km: 0 }, { datum: '2026-10-31', km: 1001 }], HEUTE).letzterKm, 0);
    // eine lange Pause mit vielen km ist plausibel
    assert.equal(kmSchaetzung([{ datum: '2026-01-01', km: 0 }, { datum: '2026-10-31', km: 30000 }], HEUTE).warnung, null);
  });

  test('kmPunkte: Erstzulassung (0 km), Eingaben und Arbeiten mit km; geschätzte km zählen nicht', () => {
    const historie = teslaHistorie();
    const punkte = kmPunkte(historie, teslaAuto());
    assert.deepEqual(punkte.map((p) => [p.datum, p.km, p.quelle]), [
      ['2025-07-16', 0, 'ez'],
      ['2025-07-16', 0, 'arbeit'],
      ['2026-03-31', 8877, 'arbeit'],
      ['2026-10-29', 21693, 'arbeit'],
    ]);
    const k = kmSchaetzung(punkte, HEUTE);
    assert.equal(k.km, 21831); // 21.693 km in 470 Tagen ≈ 46 km/Tag, 3 Tage seitdem
    assert.equal(k.geschaetzt, true);
    assert.deepEqual(arbeitenVon(historie, T).map((a) => a.id), ['arb00001', 'arb00002', 'arb00003', 'arb00004']);
    assert.deepEqual(kmPunkte([], { id: F }), []);
  });

  test('I2: die Erstzulassung zählt nur bei einem neu gekauften Auto als 0-km-Punkt (Gebrauchtwagen: nur die eigenen Stände)', () => {
    let h = leereHistorie(F, 2026);
    h = kmEintragen(h, { datum: '2026-03-31', km: 80000 }, { heute: HEUTE });
    h = kmEintragen(h, { datum: '2026-10-31', km: 83000 }, { heute: HEUTE });
    assert.deepEqual(kmPunkte([h], fiatAuto()).map((p) => p.quelle), ['eingabe', 'eingabe']);
    const k = kmSchaetzung(kmPunkte([h], fiatAuto()), HEUTE);
    assert.equal(k.proTag, 3000 / 214); // ≈ 14,0 km/Tag statt 24,5 über die EZ
    assert.equal(k.km, 83014);
    assert.equal(kmPunkte([h], { ...fiatAuto(), neuGekauft: true })[0].quelle, 'ez');
  });
});

// ---------------------------------------------------------------- Reifen

describe('Autos: Reifensätze', () => {
  test('echte Zahlen: Sommer ≈ 17.816 km (Rotation fällig), Winter ≈ 3.877 km + seit dem Wechsel', () => {
    const [sommer, winter] = reifenStand(saetze(), teslaWechsel(), kmBei(21693));
    assert.equal(sommer.satz.id, SOMMER);
    assert.equal(sommer.montiert, false);
    assert.equal(sommer.kmGesamt, 17816);
    assert.equal(sommer.kmSeitRotation, 17816);
    assert.equal(sommer.rotationFaellig, true); // ≥ 10.000 km und nie rotiert
    assert.equal(sommer.geschaetzt, true); // endet bei den geschätzten ca. 5.000 km
    assert.equal(winter.montiert, true);
    assert.equal(winter.kmGesamt, 3877);
    assert.equal(winter.rotationFaellig, false);
    assert.equal(winter.geschaetzt, true);
    assert.equal(winter.montiertAm, '2026-10-29');
    const spaeter = reifenStand(saetze(), teslaWechsel(), kmBei(22000))[1];
    assert.equal(spaeter.kmGesamt, 3877 + 307);
  });

  test('Winter wird bei 10.000 km seit der Rotation fällig', () => {
    assert.equal(reifenStand(saetze(), teslaWechsel(), kmBei(27815))[1].rotationFaellig, false);
    const w = reifenStand(saetze(), teslaWechsel(), kmBei(27816))[1];
    assert.equal(w.kmSeitRotation, 10000);
    assert.equal(w.rotationFaellig, true);
  });

  test('Rotation setzt die km seit der Rotation zurück (eingelagerter Satz, montierter Satz, beim Wechsel)', () => {
    const eingelagert = reifenStand(saetze(), [...teslaWechsel(), rotation('rot00001', '2026-10-30', 21700, SOMMER)], kmBei(21900));
    assert.deepEqual([eingelagert[0].kmGesamt, eingelagert[0].kmSeitRotation, eingelagert[0].rotationFaellig], [17816, 0, false]);
    const montiert = reifenStand(saetze(), [...teslaWechsel(), rotation('rot00002', '2026-10-31', 21800, null)], kmBei(21900))[1];
    assert.deepEqual([montiert.kmGesamt, montiert.kmSeitRotation], [3877 + 207, 100]);
    const beimWechsel = teslaWechsel();
    beimWechsel[3] = { ...beimWechsel[3], details: { montiert: WINTER, rotiert: true } };
    const w = reifenStand(saetze(), beimWechsel, kmBei(21900))[1];
    assert.deepEqual([w.kmGesamt, w.kmSeitRotation], [3877 + 207, 207]);
  });

  test('Review Focus 3: derselbe Satz noch einmal montiert, doppelter Eintrag, Rotation ohne Wechsel → keine doppelten km', () => {
    const basis = reifenStand(saetze(), teslaWechsel(), kmBei(21693));
    const nochmal = [...teslaWechsel(), wechsel('arb00010', '2026-04-05', 9000, SOMMER), { ...teslaWechsel()[3], id: 'arb00011' }];
    assert.deepEqual(reifenStand(saetze(), nochmal, kmBei(21693)).map((s) => s.kmGesamt), basis.map((s) => s.kmGesamt));
    const mitRotation = reifenStand(saetze(), [...teslaWechsel(), rotation('rot00003', '2026-06-01', 15000, SOMMER)], kmBei(21693));
    assert.equal(mitRotation[0].kmGesamt, 17816);
    assert.equal(mitRotation[0].kmSeitRotation, 6693);
    // ein falscher (zu niedriger) km beim Wechsel: nie negativ, nichts doppelt
    const falsch = [...teslaWechsel().slice(0, 3), wechsel('arb00004', '2026-10-29', 8000, WINTER)];
    const f = reifenStand(saetze(), falsch, kmBei(9000));
    assert.ok(f.every((s) => s.kmGesamt >= 0 && s.kmSeitRotation >= 0));
    assert.equal(f[0].kmGesamt + f[1].kmGesamt, 9000);
  });

  test('Startwerte und ohne Wechsel', () => {
    const mitStart = reifenStand([{ ...saetze()[0], startKm: 12000, startGeschaetzt: true }], [], null);
    assert.deepEqual([mitStart[0].kmGesamt, mitStart[0].montiert, mitStart[0].geschaetzt, mitStart[0].rotationFaellig], [12000, false, true, true]);
    assert.equal(reifenStand([], teslaWechsel(), kmBei(21693)).length, 0);
  });

  test('saisonHinweis: Winterreifen ab 15.10., Sommerreifen ab 1.4.; Ganzjahr nie', () => {
    const [sommer, winter] = saetze();
    assert.equal(saisonHinweis('2026-10-14', sommer), null);
    assert.equal(saisonHinweis('2026-10-15', sommer).text, 'Winterreifen montieren');
    assert.equal(saisonHinweis('2026-11-01', sommer).pflicht, true);
    assert.equal(saisonHinweis('2026-10-20', sommer).pflicht, false);
    assert.equal(saisonHinweis('2027-02-01', sommer).saison, 'winter');
    assert.equal(saisonHinweis('2026-11-01', winter), null);
    assert.equal(saisonHinweis('2027-03-31', winter), null);
    assert.equal(saisonHinweis('2027-04-01', winter).text, 'Sommerreifen montieren');
    // Ruling (Review T3, I3): Winterreifen ab 1.10. und Sommerreifen ab 15.3. sind schon die richtige Saison
    assert.equal(saisonHinweis('2027-09-30', winter).saison, 'sommer');
    assert.equal(saisonHinweis('2026-10-05', winter), null);
    assert.equal(saisonHinweis('2027-10-14', winter), null);
    assert.equal(saisonHinweis('2027-03-10', sommer).saison, 'winter');
    assert.equal(saisonHinweis('2027-03-20', sommer), null);
    assert.equal(saisonHinweis('2027-01-01', { ...sommer, art: 'ganzjahr' }), null);
    assert.equal(saisonHinweis('2027-01-01', null), null);
  });

  test('radmutternHinweis: bis 7 Tage nach einem Reifenwechsel, mit Drehmoment aus der Vorlage', () => {
    const h = radmutternHinweis(teslaWechsel(), '2026-10-31', teslaAuto());
    assert.equal(h.text, 'Radmuttern nach ca. 50–100 km nachziehen (175 Nm).');
    assert.equal(h.erinnerungAm, '2026-10-31');
    assert.equal(radmutternHinweis(teslaWechsel(), '2026-11-06', teslaAuto()), null);
    assert.equal(radmutternHinweis([], HEUTE, teslaAuto()), null);
    assert.equal(radmutternHinweis(teslaWechsel(), '2026-10-30', fiatAuto()).text, 'Radmuttern nach ca. 50–100 km nachziehen.');
  });
});

// ---------------------------------------------------------------- Fälligkeiten

describe('Autos: Fälligkeiten', () => {
  test('Fiat Ölwechsel 12 Monate / 15.000 km: das frühere gilt', () => {
    const viel = faelligkeit(oelRegel(), [oel('2026-06-01', 80000)], fiatAuto(), kmBei(85100, { proTag: 100, datum: '2026-10-31', letzterKm: 85000, geschaetzt: true }), HEUTE);
    assert.deepEqual(viel, { datum: '2027-02-08', km: 95000, quelle: 'km', status: 'ok', restTage: 99, restKm: 9900 });
    const wenig = faelligkeit(oelRegel(), [oel('2026-06-01', 80000)], fiatAuto(), kmBei(85020, { proTag: 20, datum: '2026-10-31', letzterKm: 85000, geschaetzt: true }), HEUTE);
    assert.deepEqual(wenig, { datum: '2027-06-01', km: 95000, quelle: 'zeit', status: 'ok', restTage: 212, restKm: 9980 });
    assert.equal(faelligkeit(oelRegel(), [oel('2026-06-01', 80000)], fiatAuto(), kmBei(85020, { proTag: 20, datum: '2026-10-31', letzterKm: 85000 }), '2027-05-10').status, 'bald');
  });

  test('Status: bald (≤ 30 Tage oder ≤ 1.000 km), überfällig (Datum vorbei oder km überschritten)', () => {
    const arbeiten = [oel('2026-06-01', 80000)];
    assert.equal(faelligkeit(oelRegel(), arbeiten, fiatAuto(), kmBei(94200), HEUTE).status, 'bald');
    assert.equal(faelligkeit(oelRegel(), arbeiten, fiatAuto(), kmBei(95000, { datum: HEUTE }), HEUTE).status, 'bald'); // genau erreicht, heute abgelesen
    const drueber = faelligkeit(oelRegel(), arbeiten, fiatAuto(), kmBei(96000), HEUTE);
    assert.deepEqual([drueber.status, drueber.restKm, drueber.quelle, drueber.datum], ['ueberfaellig', -1000, 'km', '2026-10-29']);
    assert.equal(faelligkeit(oelRegel(), arbeiten, fiatAuto(), null, '2027-06-02').status, 'ueberfaellig');
    assert.equal(faelligkeit(oelRegel(), arbeiten, fiatAuto(), null, '2027-06-01').restTage, 0);
  });

  test('Review Focus 2 / I3: ohne Arbeit – neu gekauft ab Erstzulassung, gebraucht „Letzte Erledigung eintragen“ ohne Erinnerung', () => {
    const innen = regel({ auto: T, typ: 'innenraumfilter', name: 'Innenraumfilter', intervallMonate: 24 });
    assert.deepEqual(faelligkeit(innen, [], teslaAuto(), null, HEUTE), { datum: '2027-07-16', quelle: 'zeit', status: 'ok', restTage: 257 });
    const ohne = { datum: null, quelle: 'zeit', status: 'unbekannt', restTage: null, hinweis: 'Letzte Erledigung eintragen', ohneErinnerung: true };
    assert.deepEqual(faelligkeit(oelRegel(), [], fiatAuto(), kmBei(85000), HEUTE), ohne);
    const kerzen = regel({ typ: 'zuendkerzen', name: 'Zündkerzen', intervallKm: 30000 });
    assert.deepEqual(faelligkeit(kerzen, [], fiatAuto(), null, HEUTE), { ...ohne, quelle: 'km' });
    // neu gekauft, aber noch kein Kilometerstand: km-Regel unbekannt, ebenfalls ohne Erinnerung
    assert.deepEqual(faelligkeit({ ...kerzen, auto: T }, [], teslaAuto(), null, HEUTE), { datum: null, km: 30000, quelle: 'km', status: 'unbekannt', restTage: null, hinweis: 'Kilometerstand eintragen', ohneErinnerung: true });
    const ohneEz = faelligkeit(innen, [], { id: T, name: 'X', farbeKennung: 'blau', neuGekauft: true }, null, HEUTE);
    assert.deepEqual([ohneEz.datum, ohneEz.status, ohneEz.ohneErinnerung], [null, 'unbekannt', true]);
    // mit einer Erledigung zählt es auch beim Gebrauchtwagen
    assert.equal(faelligkeit(oelRegel(), [oel('2026-06-01', 80000)], fiatAuto(), null, HEUTE).datum, '2027-06-01');
    const erst = faelligkeit({ ...oelRegel(), ersteFaelligkeit: '2027-03' }, [], fiatAuto(), kmBei(85000), HEUTE);
    assert.deepEqual([erst.datum, erst.km, erst.status], ['2027-03-31', undefined, 'ok']);
    const erstKm = faelligkeit({ ...oelRegel(), ersteFaelligkeit: '2027-03-15', ersteFaelligkeitKm: 85500 }, [], fiatAuto(), kmBei(85000), HEUTE);
    assert.deepEqual([erstKm.datum, erstKm.km, erstKm.restKm, erstKm.status], ['2027-03-15', 85500, 500, 'bald']);
    // eine spätere Arbeit gilt vor ersteFaelligkeit
    assert.equal(faelligkeit({ ...oelRegel(), ersteFaelligkeit: '2027-03' }, [oel('2026-10-01', 84000)], fiatAuto(), null, HEUTE).datum, '2027-10-01');
  });

  test('Arbeiten zählen nach Typ oder ausdrücklich nach Regel; „Sonstiges“ nur ausdrücklich', () => {
    const fremdeArbeit = { ...oel('2026-10-01', 84000), regel: 'anderer1' };
    assert.equal(faelligkeit(oelRegel(), [oel('2026-06-01', 80000), fremdeArbeit], fiatAuto(), null, HEUTE).datum, '2027-06-01');
    const sonst = regel({ typ: 'sonstiges', name: 'Batterie testen', intervallMonate: 12 });
    const s1 = { id: 'arb00020', auto: F, typ: 'sonstiges', datum: '2026-10-01', details: {} };
    assert.equal(faelligkeit(sonst, [s1], fiatAuto(), null, HEUTE).status, 'unbekannt');
    assert.equal(faelligkeit(sonst, [{ ...s1, regel: 'regel001' }], fiatAuto(), null, HEUTE).datum, '2027-10-01');
  });

  test('km ohne Geschwindigkeit: kein geschätztes Datum, aber Rest-km', () => {
    const r = faelligkeit(regel({ typ: 'zuendkerzen', name: 'Zündkerzen', intervallKm: 30000 }), [{ id: 'z0000001', auto: F, typ: 'zuendkerzen', datum: '2026-01-10', km: 70000, details: {} }], fiatAuto(), kmBei(85000), HEUTE);
    assert.deepEqual(r, { datum: null, km: 100000, quelle: 'km', status: 'ok', restTage: null, restKm: 15000 });
  });

  test('Vignette 2027: gültig 01.12.2026–31.01.2028, kaufen bis 31.01.2027; Jahreswechsel (Review Focus 5)', () => {
    assert.deepEqual(vignettenFrist(2027), { gueltigAb: '2026-12-01', gueltigBis: '2028-01-31', kaufenBis: '2027-01-31', onlineBis: '2027-01-13' });
    const vig = regel({ auto: T, typ: 'vignette', name: 'Vignette' });
    const info = ['Online gekauft gilt sie erst ab dem 18. Tag.', 'Im Geschäft sofort gültig – bis 31.01.', 'Bis 31.12. noch zum alten Preis.'];
    // I6: Termin 13.01. (online erst ab dem 18. Tag gültig); im Geschäft bis 31.01.
    assert.deepEqual(faelligkeit(vig, [], teslaAuto(), null, HEUTE), { datum: '2027-01-13', quelle: 'fix', status: 'ok', restTage: 73, vignetteJahr: 2027, kaufenBis: '2027-01-31', info });
    assert.equal(faelligkeit(vig, [], teslaAuto(), null, '2026-12-13').status, 'ok');
    assert.equal(faelligkeit(vig, [], teslaAuto(), null, '2026-12-14').status, 'bald'); // 30 Tage vorher, also schon im Dezember
    assert.equal(faelligkeit(vig, [], teslaAuto(), null, '2026-12-31').restTage, 13);
    assert.equal(faelligkeit(vig, [], teslaAuto(), null, '2027-01-13').status, 'bald');
    const spaet = faelligkeit(vig, [], teslaAuto(), null, '2027-01-20'); // online zu spät, im Geschäft noch bis 31.01.
    assert.deepEqual([spaet.status, spaet.vignetteJahr, spaet.kaufenBis], ['ueberfaellig', 2027, '2027-01-31']);
    assert.equal(faelligkeit(vig, [], teslaAuto(), null, '2027-02-01').vignetteJahr, 2028); // ohne Eintrag: die nächste Frist
    const gekauft = (jahr, datum) => ({ id: `vig0${jahr}`, auto: T, typ: 'vignette', datum, details: { jahr, art: 'digital' } });
    const nach = faelligkeit(vig, [gekauft(2027, '2026-12-10')], teslaAuto(), null, '2026-12-15');
    assert.deepEqual([nach.datum, nach.vignetteJahr, nach.status], ['2028-01-13', 2028, 'ok']);
    // M2: ein alter Eintrag ergibt keinen uralten Termin – es gilt die nächste Frist ab heute
    const alt = faelligkeit(vig, [gekauft(2025, '2024-12-02')], teslaAuto(), null, HEUTE);
    assert.deepEqual([alt.datum, alt.status], ['2027-01-13', 'ok']);
  });

  test('Pickerl: fester Monat 07/2027, editierbar; nach dem Pickerl der nächste Monat', () => {
    const p = regel({ typ: 'pickerl', name: 'Pickerl', fixMonat: '2027-07', intervallMonate: 12 });
    assert.deepEqual(faelligkeit(p, [], fiatAuto(), null, HEUTE), { datum: '2027-07-31', quelle: 'fix', status: 'ok', restTage: 272, fixMonat: '2027-07' });
    assert.equal(faelligkeit(p, [], fiatAuto(), null, '2027-07-05').status, 'bald');
    assert.equal(faelligkeit({ ...p, fixMonat: '2027-06' }, [], fiatAuto(), null, HEUTE).datum, '2027-06-30'); // Monat von der Plakette korrigiert
    const erledigt = { id: 'pik00001', auto: F, typ: 'pickerl', datum: '2027-07-10', details: { naechsterMonat: '2028-07' } };
    assert.equal(faelligkeit(p, [erledigt], fiatAuto(), null, '2027-07-11').fixMonat, '2028-07');
    const ohneMonat = { ...erledigt, details: {} };
    assert.equal(faelligkeit(p, [ohneMonat], fiatAuto(), null, '2027-07-11').fixMonat, '2028-07'); // + 12 Monate
    const alt = { ...erledigt, datum: '2026-07-10', details: {} }; // das Pickerl des Vorjahres zählt nicht
    assert.equal(faelligkeit(p, [alt], fiatAuto(), null, HEUTE).fixMonat, '2027-07');
    assert.equal(faelligkeit({ ...p, intervallMonate: undefined }, [ohneMonat], fiatAuto(), null, '2027-08-01').status, 'ueberfaellig');
    // I4: der nächste Monat der JÜNGSTEN Pickerl-Arbeit gilt immer – auch wenn er früher ist als der Vorschlag
    const frueher = { ...erledigt, datum: '2026-05-10', details: { naechsterMonat: '2027-05' } };
    const f1 = faelligkeit(p, [frueher], fiatAuto(), null, HEUTE);
    assert.deepEqual([f1.datum, f1.fixMonat], ['2027-05-31', '2027-05']);
    // die jüngste ohne Monat nach einer mit Monat: deren Monat + Intervall
    const danach = { ...erledigt, id: 'pik00002', datum: '2027-05-20', details: {} };
    assert.equal(faelligkeit(p, [frueher, danach], fiatAuto(), null, '2027-05-21').fixMonat, '2028-05');
  });

  test('saisonaler Reifenwechsel, Reifen rotieren, Leasing-Ende', () => {
    const saison = regel({ auto: T, typ: 'reifenwechsel', name: 'Reifenwechsel' });
    const s = faelligkeit(saison, teslaWechsel(), teslaAuto(), kmBei(21693), HEUTE, { saetze: saetze() });
    assert.deepEqual([s.datum, s.saison, s.quelle, s.status], ['2027-04-15', 'sommer', 'fix', 'ok']);
    const s2 = faelligkeit(saison, teslaWechsel().slice(0, 3), teslaAuto(), kmBei(21693), '2026-10-20', { saetze: saetze() });
    assert.deepEqual([s2.datum, s2.saison, s2.status], ['2026-11-01', 'winter', 'bald']);
    assert.equal(faelligkeit(saison, teslaWechsel().slice(0, 3), teslaAuto(), null, '2026-11-02', { saetze: saetze() }).status, 'ueberfaellig');
    const ohne = faelligkeit(saison, [], teslaAuto(), null, '2026-10-20', { saetze: saetze() });
    assert.deepEqual([ohne.datum, ohne.saison], ['2026-11-01', 'winter']);
    // M3: Sommerreifen erst NACH dem 1.11. montiert → der Winter-Stichtag dieser Saison gilt (überfällig)
    const spaetSommer = [...teslaWechsel().slice(0, 3), wechsel('arb00005', '2026-11-05', 21800, SOMMER)];
    const s3 = faelligkeit(saison, spaetSommer, teslaAuto(), null, '2026-11-06', { saetze: saetze() });
    assert.deepEqual([s3.datum, s3.status], ['2026-11-01', 'ueberfaellig']);
    const imFebruar = [wechsel('arb00006', '2027-02-10', 25000, SOMMER)];
    assert.equal(faelligkeit(saison, imFebruar, teslaAuto(), null, '2027-02-11', { saetze: saetze() }).datum, '2026-11-01');
    const frueherSommer = [wechsel('arb00007', '2027-04-05', 25000, SOMMER)]; // Anfang April ist in Ordnung
    assert.equal(faelligkeit(saison, frueherSommer, teslaAuto(), null, '2027-04-06', { saetze: saetze() }).datum, '2027-11-01');
    // M4: Sommerreifen-Erinnerung erst ab 1.4. (Spec: 1.4. und 15.4.), nicht schon 30 Tage vor dem 15.4.
    const maerz = faelligkeit(saison, teslaWechsel(), teslaAuto(), null, '2027-03-20', { saetze: saetze() });
    assert.deepEqual([maerz.datum, maerz.status, maerz.erinnerungAb], ['2027-04-15', 'ok', '2027-04-01']);
    assert.equal(faelligkeit(saison, teslaWechsel(), teslaAuto(), null, '2027-04-01', { saetze: saetze() }).status, 'bald');
    // Task 3: ebenso Winterreifen erst ab 15.10. (Spec §4: „Winterreifen montieren“ am 15.10. und 1.11.), nicht schon 30 Tage vor dem 1.11.
    const oktober = faelligkeit(saison, teslaWechsel().slice(0, 3), teslaAuto(), null, '2026-10-14', { saetze: saetze() });
    assert.deepEqual([oktober.datum, oktober.saison, oktober.status, oktober.erinnerungAb], ['2026-11-01', 'winter', 'ok', '2026-10-15']);
    assert.equal(faelligkeit(saison, teslaWechsel().slice(0, 3), teslaAuto(), null, '2026-10-15', { saetze: saetze() }).status, 'bald');
    assert.equal(faelligkeit(saison, [], teslaAuto(), null, '2026-10-14', { saetze: saetze() }).status, 'ok');
    // Task 3 (Minor aus dem Re-Review T1): ein Auto ohne Reifensätze hat keinen saisonalen Reifenwechsel (kein Termin, keine Erinnerung)
    assert.equal(faelligkeit(saison, [], teslaAuto(), null, '2026-10-20', { saetze: [] }), null);
    assert.equal(faelligkeit(saison, [], teslaAuto(), null, '2026-10-20'), null);
    // M7 (Review T3): ohne eingetragenen Reifenwechsel ist unbekannt, was montiert ist
    assert.equal(ohne.montiertUnbekannt, true);
    assert.equal('montiertUnbekannt' in s2, false);
    // Ruling I3 (Review T3): Winterreifen ab 01.10. montiert = richtige Saison → nächster Stichtag 15.04., nicht „überfällig seit 15.04.“
    const imOktober = [...teslaWechsel().slice(0, 3), wechsel('arb00008', '2026-10-05', 21000, WINTER)];
    assert.deepEqual(
      ['datum', 'saison', 'status'].map((k) => faelligkeit(saison, imOktober, teslaAuto(), null, '2026-10-06', { saetze: saetze() })[k]),
      ['2027-04-15', 'sommer', 'ok'],
    );
    const imSeptember = [...teslaWechsel().slice(0, 3), wechsel('arb00009', '2026-09-30', 21000, WINTER)];
    assert.deepEqual(['datum', 'status'].map((k) => faelligkeit(saison, imSeptember, teslaAuto(), null, '2026-09-30', { saetze: saetze() })[k]), ['2026-04-15', 'ueberfaellig']);
    // … und Sommerreifen ab 15.03.: am 20.03. montiert → nächster Winter-Stichtag; am 10.03. noch die falsche Saison
    const maerzSommer = [wechsel('arb00010', '2027-03-20', 25000, SOMMER)];
    assert.deepEqual(['datum', 'status'].map((k) => faelligkeit(saison, maerzSommer, teslaAuto(), null, '2027-03-21', { saetze: saetze() })[k]), ['2027-11-01', 'ok']);
    const fruehSommer = [wechsel('arb00011', '2027-03-10', 25000, SOMMER)];
    assert.deepEqual(['datum', 'status'].map((k) => faelligkeit(saison, fruehSommer, teslaAuto(), null, '2027-03-11', { saetze: saetze() })[k]), ['2026-11-01', 'ueberfaellig']);
    // N1 (Re-Review T3): der vergangene Stichtag gilt nur, solange die falsche Saison dauert – danach zählt der Satz als richtig und
    // der nächste Stichtag ab heute (Sommerreifen bis 15.03., Winterreifen bis 01.10.)
    const stand = (liste, tagHeute) => ['datum', 'status'].map((k) => faelligkeit(saison, liste, teslaAuto(), null, tagHeute, { saetze: saetze() })[k]);
    assert.deepEqual(stand(fruehSommer, '2027-03-12'), ['2026-11-01', 'ueberfaellig']);
    assert.deepEqual(stand(fruehSommer, '2027-03-20'), ['2027-11-01', 'ok']);
    assert.deepEqual(stand(fruehSommer, '2027-07-01'), ['2027-11-01', 'ok']);
    assert.deepEqual(stand(spaetSommer, '2027-03-15'), ['2027-11-01', 'ok']);
    const septemberWinter = [...teslaWechsel().slice(0, 3), wechsel('arb00012', '2026-09-25', 21000, WINTER)];
    assert.deepEqual(stand(septemberWinter, '2026-09-28'), ['2026-04-15', 'ueberfaellig']);
    assert.deepEqual(stand(septemberWinter, '2026-10-05'), ['2027-04-15', 'ok']);
    assert.deepEqual(stand(septemberWinter, '2026-12-01'), ['2027-04-15', 'ok']);
    assert.deepEqual(stand(imSeptember, '2026-10-01'), ['2027-04-15', 'ok']);

    const rot = regel({ auto: T, typ: 'rotation', name: 'Reifen rotieren', intervallKm: 10000 });
    const kmInfo = kmBei(21831, { proTag: 21693 / 470, letzterKm: 21693, geschaetzt: true });
    const r = faelligkeit(rot, teslaWechsel(), teslaAuto(), kmInfo, HEUTE, { saetze: saetze() });
    // Winter: 3.877 km aus dem letzten Winter + 138 km seit dem Wechsel, nie rotiert → noch 5.985 km
    assert.deepEqual([r.km, r.restKm, r.status, r.quelle, r.satz], [27816, 5985, 'ok', 'km', WINTER]);
    assert.equal(r.datum, '2027-03-11'); // 6.123 km ab 29.10. mit ≈ 46 km/Tag = 133 Tage
    const sommerDrauf = faelligkeit(rot, teslaWechsel().slice(0, 3), teslaAuto(), kmBei(21693), HEUTE, { saetze: saetze() });
    assert.deepEqual([sommerDrauf.status, sommerDrauf.restKm, sommerDrauf.satz], ['ueberfaellig', -7816, SOMMER]);
    assert.equal(faelligkeit(rot, [], teslaAuto(), null, HEUTE, { saetze: saetze() }).status, 'unbekannt');

    const leasing = regel({ auto: T, typ: 'sonstiges', name: 'Leasing-Ende', autoDatum: 'leasingEnde' });
    assert.equal(faelligkeit(leasing, [], teslaAuto(), null, HEUTE), null);
    assert.deepEqual(faelligkeit(leasing, [], { ...teslaAuto(), leasingEnde: '2028-06-30' }, null, HEUTE).datum, '2028-06-30');
  });

  test('absurde Werte: riesige Rest-km bei winziger Geschwindigkeit → kein Datum statt Jahr 270000', () => {
    const r = faelligkeit(regel({ auto: T, typ: 'zuendkerzen', name: 'Zündkerzen', intervallKm: 1000000 }), [], teslaAuto(), kmBei(10, { proTag: 0.001 }), HEUTE);
    assert.equal(r.datum, null);
    assert.equal(r.restKm, 999990);
  });
});

// ---------------------------------------------------------------- Übersicht

describe('Autos: Übersicht je Auto', () => {
  test('Tesla aus der Vorlage mit den echten Reifenwechseln: sortierte Liste, Reifen, Saison', () => {
    const paket = autoAusVorlage('tesla3', { name: 'Tesla', ezDatum: '2025-07-16' });
    let daten = autoAnlegen(leereAutos(), paket);
    const [sommer, winter] = paket.saetze;
    const map = { [SOMMER]: sommer.id, [WINTER]: winter.id };
    let h25 = leereHistorie(paket.auto.id, 2025);
    let h26 = leereHistorie(paket.auto.id, 2026);
    for (const a of teslaWechsel()) {
      const neu = { ...a, auto: paket.auto.id, details: { montiert: map[a.details.montiert] } };
      if (a.datum.startsWith('2025')) h25 = arbeitSetzen(h25, neu, { heute: HEUTE });
      else h26 = arbeitSetzen(h26, neu, { heute: HEUTE });
    }
    daten = historieJahrEintragen(historieJahrEintragen(daten, paket.auto.id, 2025), paket.auto.id, 2026);
    const [u] = autoUebersicht(daten, [h25, h26], HEUTE);
    assert.equal(u.auto.id, paket.auto.id);
    assert.equal(u.kmInfo.km, 21831);
    assert.equal(u.reifen.find((r) => r.satz.id === sommer.id).kmGesamt, 17816);
    assert.equal(u.reifen.find((r) => r.montiert).satz.id, winter.id);
    assert.equal(u.saison, null); // Winter ist drauf
    assert.ok(u.radmuttern);
    const ränge = { ueberfaellig: 0, bald: 1, ok: 2, unbekannt: 3 };
    for (let i = 1; i < u.faellig.length; i += 1) assert.ok(ränge[u.faellig[i - 1].status] <= ränge[u.faellig[i].status]);
    assert.ok(u.faellig.every((f) => f.regel && f.regel.aktiv));
    assert.equal(u.faellig.filter((f) => f.regel.typ === 'vignette').length, 1);
    assert.equal(u.faellig.some((f) => f.regel.autoDatum), false); // kein Leasing-Ende eingetragen
    const wischer = u.faellig.find((f) => f.regel.typ === 'wischer');
    assert.deepEqual([wischer.datum, wischer.status], ['2026-07-16', 'ueberfaellig']);
    assert.equal(u.anzahlFaellig, u.faellig.filter((f) => f.status === 'bald' || f.status === 'ueberfaellig').length);
    assert.equal(u.naechste, u.faellig[0]);
    // abgeschaltete Regel fällt weg
    const aus = regelSetzen(daten, { ...daten.regeln.find((r) => r.typ === 'wischer'), aktiv: false });
    assert.equal(autoUebersicht(aus, [h25, h26], HEUTE)[0].faellig.some((f) => f.regel.typ === 'wischer'), false);
  });

  test('gebrauchter Fiat aus der Vorlage ohne Verlauf: nichts überfällig, unbekannt außer Pickerl, Vignette und Saison', () => {
    const paket = autoAusVorlage('fiat500', { name: 'Fiat', ezDatum: '2017-07-24' });
    assert.equal(paket.auto.neuGekauft, false);
    const daten = autoAnlegen(leereAutos(), paket);
    const h = kmEintragen(leereHistorie(paket.auto.id, 2026), { datum: '2026-10-31', km: 83000 }, { heute: HEUTE });
    const [u] = autoUebersicht(daten, [h], HEUTE);
    assert.equal(u.faellig.length, 10);
    assert.equal(u.faellig.some((f) => f.status === 'ueberfaellig'), false);
    for (const f of u.faellig) {
      if (['pickerl', 'vignette', 'reifenwechsel'].includes(f.regel.typ)) assert.notEqual(f.status, 'unbekannt', f.regel.name);
      else assert.deepEqual([f.status, f.hinweis, f.ohneErinnerung], ['unbekannt', 'Letzte Erledigung eintragen', true], f.regel.name);
    }
    assert.equal(u.kmInfo.km, 83000); // ohne EZ-Punkt nur ein Stand → keine Geschwindigkeit
    assert.equal(u.anzahlFaellig, 1); // nur „Reifenwechsel (saisonal)“: Stichtag 1.11. ist heute
  });

  test('Auto ohne alles: keine Fehler, km unbekannt', () => {
    const d = autoSetzen(leereAutos(), { id: F, name: 'Leer', farbeKennung: 'blau' });
    const [u] = autoUebersicht(d, [], HEUTE);
    assert.deepEqual([u.kmInfo, u.faellig, u.reifen, u.naechste, u.anzahlFaellig, u.warnung], [null, [], [], null, 0, null]);
    assert.deepEqual(autoUebersicht(leereAutos(), [], HEUTE), []);
    assert.throws(() => autoUebersicht(d, [], undefined), /heute/);
  });
});
