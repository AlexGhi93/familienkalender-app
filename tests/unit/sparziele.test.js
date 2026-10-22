// Sparziele: Ziele, Monatsaufteilung der echten Ersparnis (Kontostand Papa + Mama), „Frei verfügbar“, Abschluss, Speicherformat.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  MAX_VERSCHIEBUNGEN,
  MAX_ZIEL_CENTS,
  MAX_ZIEL_NAME,
  MAX_ZIELE_AKTIV,
  MAX_ZIELE_ZEICHEN,
  MIN_ZIEL_CENTS,
  TEXT_NICHT_LOESCHBAR,
  TEXT_VERSCHIEBUNGEN_VOLL,
  TEXT_ZIELE_VOLL,
  ZIEL_EMOJIS,
  freiVerschieben,
  leereZiele,
  neueZielId,
  normalisiereZiele,
  sparMonate,
  sparVerlauf,
  startMonat,
  zielAusblenden,
  zielBeenden,
  zieleBeginn,
  zielLoeschbar,
  zielLoeschen,
  zielPruefen,
  zielSchluss,
  zielSetzen,
  zieleLesen,
  zieleText,
  zieleWarnungen,
} from '../../src/domain/sparziele.js';
import * as domain from '../../src/domain/index.js';

// ---------------------------------------------------------------- Helfer

/** Konto aus den Gesamtständen (Papa + Mama) je Monat: Mama hat immer 1.000 €, Papa den Rest. `ohneMama` = Monate, in denen Mama fehlt. */
function kontoAus(staende, { ohneMama = [], ohnePapa = [], x = [] } = {}) {
  const papa = {};
  const mama = {};
  for (const [monat, summe] of Object.entries(staende)) {
    if (!ohnePapa.includes(monat)) papa[monat] = summe - 100000;
    if (!ohneMama.includes(monat)) mama[monat] = 100000;
  }
  return { v: 1, p: { papa, mama }, x };
}

const auto = (aenderung = {}) => ({ id: 'auto0001', name: 'Auto', emoji: '🚗', zielCents: 2300000, datum: '2028-07', vorlaeufig: false, erstellt: '2026-10', ...aenderung });
const urlaub = (aenderung = {}) => ({ id: 'url00001', name: 'Sommerurlaub', emoji: '🏖️', zielCents: 300000, datum: '2027-07', vorlaeufig: true, erstellt: '2026-10', ...aenderung });
const daten = (z, m = []) => ({ v: 1, z, m });

/** Das Beispiel aus der Skizze: Basis September, Oktober +1.000 €, November −300 €, Dezember +2.000 €, Januar −200 €. */
const BEISPIEL = { '2026-09': 800000, '2026-10': 900000, '2026-11': 870000, '2026-12': 1070000, '2027-01': 1050000 };

const monatVon = (v, monat) => v.monate.find((m) => m.monat === monat);
const zielVon = (v, id) => v.ziele.find((z) => z.id === id);
const anteil = (monat, id) => monat.zuteilung.find((t) => t.ziel === id);
const summe = (liste) => liste.reduce((a, b) => a + b, 0);

function tiefFrieren(x) {
  if (x && typeof x === 'object') {
    Object.values(x).forEach(tiefFrieren);
    Object.freeze(x);
  }
  return x;
}

/** Deterministische Zufallsquelle (LCG) – kein Math.random. */
function zufallsfolge(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

// ---------------------------------------------------------------- Konstanten und Daten

describe('Konstanten', () => {
  test('Grenzen und feste Symbolliste', () => {
    assert.equal(MAX_ZIELE_AKTIV, 20);
    assert.equal(MAX_ZIEL_NAME, 30);
    assert.equal(MIN_ZIEL_CENTS, 100);
    assert.equal(MAX_ZIEL_CENTS, 99_999_900);
    assert.equal(MAX_VERSCHIEBUNGEN, 200);
    assert.equal(MAX_ZIELE_ZEICHEN, 6000);
    assert.deepEqual(ZIEL_EMOJIS, ['🚗', '🏖️', '🏠', '🎁', '👧', '💍', '🛋️', '🎯', '🇷🇴', '✈️', '💻', '🎄']);
    assert.ok(ZIEL_EMOJIS.includes('\u{1F3D6}️') && ZIEL_EMOJIS.includes('\u{1F6CB}️') && ZIEL_EMOJIS.includes('✈️'));
    assert.ok(Object.isFrozen(ZIEL_EMOJIS));
  });

  test('leereZiele und domain/index.js', () => {
    assert.deepEqual(leereZiele(), { v: 1, z: [], m: [] });
    assert.notEqual(leereZiele().z, leereZiele().z);
    for (const name of ['zielPruefen', 'zielSetzen', 'sparVerlauf', 'sparMonate', 'startMonat', 'zieleLesen', 'zieleText', 'zielLoeschbar', 'zielAusblenden', 'zieleBeginn']) assert.equal(typeof domain[name], 'function', name);
    assert.equal(domain.MAX_ZIELE_AKTIV, 20);
    assert.equal(typeof domain.postenPruefen, 'function'); // Fixkosten weiter erreichbar
  });

  test('neueZielId: 8 Zeichen aus 0-9 und a-v, mit einspeisbarer Zufallsquelle', () => {
    const id = neueZielId(zufallsfolge(7));
    assert.match(id, /^[0-9a-v]{8}$/);
    assert.equal(neueZielId(zufallsfolge(7)), id);
  });
});

// ---------------------------------------------------------------- Prüfen

describe('zielPruefen', () => {
  const heute = '2026-10-20';
  const entwurf = (a = {}) => ({ name: 'Auto', emoji: '🚗', zielCents: 2300000, datum: '2028-07', vorlaeufig: false, ...a });

  test('gültiger Entwurf → null (Datum als Monat oder Tag, vorläufig egal)', () => {
    assert.equal(zielPruefen(entwurf(), { heute }), null);
    assert.equal(zielPruefen(entwurf({ datum: '2027-08-15', emoji: '🇷🇴', name: 'Urlaub Rumänien' }), { heute }), null);
    assert.equal(zielPruefen(entwurf({ datum: '2026-10' }), { heute }), null, 'laufender Monat geht noch');
    assert.equal(zielPruefen(entwurf({ datum: '2026-10-01' }), { heute }), null, 'Tag im laufenden Monat geht noch');
  });

  test('Name 1–30 Zeichen (Zeichen, nicht UTF-16-Einheiten)', () => {
    assert.equal(zielPruefen(entwurf({ name: '   ' }), { heute }), 'Bitte einen Namen eingeben.');
    assert.equal(zielPruefen(entwurf({ name: 42 }), { heute }), 'Bitte einen Namen eingeben.');
    assert.equal(zielPruefen(entwurf({ name: 'x'.repeat(30) }), { heute }), null);
    assert.equal(zielPruefen(entwurf({ name: 'x'.repeat(31) }), { heute }), 'Der Name darf höchstens 30 Zeichen haben.');
    assert.equal(zielPruefen(entwurf({ name: 'ä'.repeat(29) + '🎄' }), { heute }), null);
  });

  test('Symbol nur aus der Liste', () => {
    assert.equal(zielPruefen(entwurf({ emoji: '🍕' }), { heute }), 'Bitte ein Symbol wählen.');
    assert.equal(zielPruefen(entwurf({ emoji: '\u{1F3D6}' }), { heute }), 'Bitte ein Symbol wählen.', 'ohne Variantenzeichen nicht dasselbe');
  });

  test('Zielbetrag 1 € … 999.999 €, ganze Cent', () => {
    const fehler = 'Bitte einen Zielbetrag zwischen 1 € und 999.999 € eingeben.';
    assert.equal(zielPruefen(entwurf({ zielCents: 99 }), { heute }), fehler);
    assert.equal(zielPruefen(entwurf({ zielCents: 100 }), { heute }), null);
    assert.equal(zielPruefen(entwurf({ zielCents: 99_999_900 }), { heute }), null);
    assert.equal(zielPruefen(entwurf({ zielCents: 99_999_901 }), { heute }), fehler);
    assert.equal(zielPruefen(entwurf({ zielCents: 1000.5 }), { heute }), fehler);
    assert.equal(zielPruefen(entwurf({ zielCents: '1000' }), { heute }), fehler);
  });

  test('Datum: gültig und nicht vor dem laufenden Monat', () => {
    assert.equal(zielPruefen(entwurf({ datum: '2027-02-30' }), { heute }), 'Bitte angeben, bis wann gespart wird.');
    assert.equal(zielPruefen(entwurf({ datum: '2027-13' }), { heute }), 'Bitte angeben, bis wann gespart wird.');
    assert.equal(zielPruefen(entwurf({ datum: undefined }), { heute }), 'Bitte angeben, bis wann gespart wird.');
    assert.equal(zielPruefen(entwurf({ datum: '2026-09' }), { heute }), 'Das Datum liegt in der Vergangenheit – bitte einen Monat ab jetzt wählen.');
    assert.equal(zielPruefen(entwurf({ datum: '2026-09-30' }), { heute }), 'Das Datum liegt in der Vergangenheit – bitte einen Monat ab jetzt wählen.');
    // am Monatsletzten, wenn der Kontostand schon da ist, beginnt das Ziel erst im nächsten Monat: das Datum darf nicht davor liegen
    assert.equal(zielPruefen(entwurf({ datum: '2026-10', erstellt: '2026-11' }), { heute: '2026-10-31' }), 'Das Zieldatum liegt vor dem ersten Sparmonat – bitte einen späteren Monat wählen.');
    assert.equal(zielPruefen(entwurf({ datum: '2026-11-15', erstellt: '2026-11' }), { heute: '2026-10-31' }), null);
  });

  test('höchstens 20 laufende Ziele; abgeschlossene zählen nicht; ein bestehendes darf geändert werden', () => {
    const z = Array.from({ length: 20 }, (_, i) => auto({ id: `ab${String(i).padStart(4, '0')}` }));
    assert.equal(zielPruefen(entwurf({ id: 'neu00001' }), { heute, daten: daten(z) }), 'Höchstens 20 laufende Sparziele.');
    assert.equal(zielPruefen(entwurf({ id: 'ab0003' }), { heute, daten: daten(z) }), null);
    const mitAbgeschlossenen = [...z.slice(0, 19), auto({ id: 'alt00001', datum: '2026-08' }), auto({ id: 'alt00002', beendet: { monat: '2026-10', art: 'frei' } })];
    assert.equal(zielPruefen(entwurf({ id: 'neu00001' }), { heute, daten: daten(mitAbgeschlossenen) }), null);
  });

  test('Kennung, Startmonat und Abschluss werden geprüft, wenn vorhanden', () => {
    assert.equal(zielPruefen(entwurf({ id: 'XYZ!' }), { heute }), 'Ungültige Kennung.');
    assert.equal(zielPruefen(entwurf({ id: 'wxyz0001' }), { heute }), 'Ungültige Kennung.', 'w … z gibt es bei Google nicht');
    assert.equal(zielPruefen(entwurf({ erstellt: '2026-1' }), { heute }), 'Ungültiger Startmonat.');
    assert.equal(zielPruefen(entwurf({ beendet: { monat: '2026-11', art: 'weg' } }), { heute }), 'Ungültiger Abschluss.');
    assert.equal(zielPruefen(null, { heute }), 'Bitte einen Namen eingeben.');
  });
});

// ---------------------------------------------------------------- Startmonat

describe('startMonat', () => {
  test('Kontostand des Monats noch nicht komplett → dieser Monat; beide eingetragen → nächster Monat', () => {
    assert.equal(startMonat('2026-10-20', kontoAus({ '2026-09': 800000 })), '2026-10');
    assert.equal(startMonat('2026-10-31', kontoAus({ '2026-10': 800000 }, { ohneMama: ['2026-10'] })), '2026-10', 'nur Papa');
    assert.equal(startMonat('2026-10-31', kontoAus({ '2026-10': 800000 })), '2026-11');
    assert.equal(startMonat('2026-12-31', kontoAus({ '2026-12': 800000 })), '2027-01');
    assert.equal(startMonat('2026-10-20', null), '2026-10');
  });
});

// ---------------------------------------------------------------- Änderungen

describe('zielSetzen, zielBeenden, zielLoeschen, freiVerschieben', () => {
  const heute = '2026-10-20';

  test('neues Ziel: bereinigt, Argument unverändert, zweimal angewendet = einmal', () => {
    const alt = tiefFrieren(leereZiele());
    const eins = zielSetzen(alt, { ...auto(), name: '  Auto  ', extra: 1 }, { heute });
    assert.deepEqual(eins, { v: 1, beginn: '2026-10', z: [auto()], m: [] });
    assert.deepEqual(alt, leereZiele());
    assert.equal(zielSetzen(eins, auto(), { heute }), eins);
  });

  test('neues Ziel braucht Kennung und Startmonat; Fehler mit deutscher Meldung', () => {
    assert.throws(() => zielSetzen(leereZiele(), auto({ id: undefined }), { heute }), /Ungültige Kennung/);
    assert.throws(() => zielSetzen(leereZiele(), auto({ erstellt: undefined }), { heute }), /Ungültiger Startmonat/);
    assert.throws(() => zielSetzen(leereZiele(), auto({ name: '' }), { heute }), /Bitte einen Namen eingeben/);
    assert.throws(() => zielSetzen(leereZiele(), auto({ datum: '2026-09' }), { heute }), /Vergangenheit/);
    const voll = daten(Array.from({ length: 20 }, (_, i) => auto({ id: `ab${String(i).padStart(4, '0')}` })));
    assert.throws(() => zielSetzen(voll, auto({ id: 'neu00001' }), { heute }), /Höchstens 20 laufende Sparziele/);
  });

  test('ohne gültiges heute → Fehler (Zeitpunkt entscheidet über Vergangenheit und Abschluss)', () => {
    assert.throws(() => zielSetzen(leereZiele(), auto(), {}), /Ungültiges Datum/);
    assert.throws(() => zielLoeschen(daten([auto()]), 'auto0001', { heute: '2026-10' }), /Ungültiges Datum/);
  });

  test('neues Ziel ist nie schon beendet', () => {
    const d = zielSetzen(leereZiele(), auto({ beendet: { monat: '2026-10', art: 'frei' } }), { heute });
    assert.equal(d.z[0].beendet, undefined);
  });

  test('Ändern: Name, Symbol, Betrag, Datum, vorläufig; Startmonat und Abschluss bleiben', () => {
    const d = daten([auto(), urlaub()]);
    const neu = zielSetzen(d, urlaub({ name: 'Urlaub Rumänien', emoji: '🇷🇴', zielCents: 150000, datum: '2027-08-15', vorlaeufig: false, erstellt: '2027-01' }), { heute });
    assert.deepEqual(neu.z[1], { id: 'url00001', name: 'Urlaub Rumänien', emoji: '🇷🇴', zielCents: 150000, datum: '2027-08-15', vorlaeufig: false, erstellt: '2026-10' });
    assert.equal(neu.z[0], d.z[0]);
  });

  test('abgeschlossenes Ziel lässt sich nicht mehr ändern', () => {
    const d = daten([auto({ datum: '2026-08' })]);
    assert.throws(() => zielSetzen(d, auto({ datum: '2027-08' }), { heute }), /abgeschlossenes Ziel/);
  });

  test('zielBeenden: setzt { monat, art }; wiederholbar; unbekannte Kennung ändert nichts; ungültige Art wirft', () => {
    const d = daten([auto(), urlaub()]);
    const b = zielBeenden(d, 'url00001', { monat: '2026-11', art: 'frei' });
    assert.deepEqual(b.z[1].beendet, { monat: '2026-11', art: 'frei' });
    assert.equal(zielBeenden(b, 'url00001', { monat: '2026-11', art: 'frei' }), b);
    assert.equal(zielBeenden(b, 'url00001', { monat: '2026-12', art: 'ausgegeben' }), b, 'der erste Abschluss gilt');
    assert.equal(zielBeenden(d, 'gibtsnicht', { monat: '2026-11', art: 'frei' }), d);
    assert.throws(() => zielBeenden(d, 'auto0001', { monat: '2026-11', art: 'weg' }), /Ungültiger Abschluss/);
    assert.throws(() => zielBeenden(d, 'auto0001', { monat: '11/2026', art: 'frei' }), /Ungültiger Abschluss/);
  });

  test('zielLoeschen: nur ein Ziel, das nie Geld bekommen hat (auch das älteste) – kein Monat ändert sich, beginn bleibt', () => {
    const k = kontoAus(BEISPIEL);
    const heuteSpaeter = '2027-02-05';
    // „Fehler“ wurde versehentlich als ältestes Ziel angelegt (Start September, Datum Oktober 2026) und hat nie Geld bekommen:
    // im September gibt es noch keine Ersparnis, und im Oktober ist es schon abgeschlossen
    const versehen = urlaub({ id: 'fehl0001', name: 'Fehler', erstellt: '2026-09', datum: '2026-09' });
    const d = { v: 1, beginn: '2026-09', z: [versehen, auto(), urlaub()], m: [] };
    const vorher = sparVerlauf(d, k, heuteSpaeter);
    assert.equal(zielLoeschbar(d, k, heuteSpaeter, 'fehl0001'), true);
    const neu = zielLoeschen(d, 'fehl0001', { heute: heuteSpaeter, konto: k });
    assert.deepEqual(neu, { v: 1, beginn: '2026-09', z: [auto(), urlaub()], m: [] });
    assert.equal(zieleBeginn(neu), '2026-09', 'beginn rückt nicht nach hinten');
    const nachher = sparVerlauf(neu, k, heuteSpaeter);
    const ohneSpur = (v) => v.monate.map((m) => ({ ...m, abschluss: m.abschluss.filter((a) => a.ziel !== 'fehl0001') })).filter((m) => m.gespart !== null || m.abschluss.length > 0);
    assert.deepEqual(nachher.monate, ohneSpur(vorher));
    assert.equal(nachher.frei, vorher.frei);
    assert.deepEqual(nachher.ziele, vorher.ziele.slice(1));
    // ein laufendes, noch nie gefördertes Ziel (eben angelegt) lässt sich auch löschen
    const frisch = { v: 1, z: [auto(), urlaub({ id: 'neu00001', erstellt: '2027-02' })], m: [] };
    assert.equal(zielLoeschbar(frisch, k, heuteSpaeter, 'neu00001'), true);
    // unbekannte Kennung: nichts zu tun
    assert.equal(zielLoeschen(neu, 'fehl0001', { heute: heuteSpaeter, konto: k }), neu);
    assert.equal(zielLoeschbar(neu, k, heuteSpaeter, 'fehl0001'), false);
  });

  test('zielLoeschen: ein Ziel mit Geld wird abgelehnt (auch abgeschlossen, auch „ausgegeben“) – es lässt sich nur ausblenden', () => {
    const k = kontoAus(BEISPIEL);
    const d = daten([auto(), urlaub({ beendet: { monat: '2026-12', art: 'ausgegeben' } })]);
    assert.equal(zielLoeschbar(d, k, '2027-02-05', 'url00001'), false);
    assert.throws(() => zielLoeschen(d, 'url00001', { heute: '2027-02-05', konto: k }), { message: TEXT_NICHT_LOESCHBAR });
    assert.equal(TEXT_NICHT_LOESCHBAR, 'Dieses Ziel hat schon Geld bekommen – es kann nur ausgeblendet werden.');
    // Geld nur über eine Verschiebung aus „Frei“ zählt genauso
    // (Start Januar, ein Minusmonat: keine Zuteilung, aber 50 Cent aus „Frei“)
    const nurVerschoben = { v: 1, z: [auto(), urlaub({ zielCents: 100, erstellt: '2027-01' })], m: [{ id: 'v0000001', monat: '2027-01', ziel: 'url00001', cents: 50 }] };
    const v = sparVerlauf(nurVerschoben, k, '2027-02-05');
    assert.deepEqual(monatVon(v, '2027-01').zuteilung.find((t) => t.ziel === 'url00001').cents, 0);
    assert.equal(zielVon(v, 'url00001').gespart, 50);
    assert.equal(zielLoeschbar(nurVerschoben, k, '2027-02-05', 'url00001'), false);
  });

  test('zielAusblenden: nur Anzeige – die Zahlen bleiben gleich; wiederholbar; wieder einblenden', () => {
    const k = kontoAus(BEISPIEL);
    const d = daten([auto(), urlaub({ beendet: { monat: '2026-12', art: 'ausgegeben' } })]);
    const aus = zielAusblenden(d, 'url00001', true, { heute: '2027-02-05' });
    assert.equal(aus.z[1].aus, true);
    assert.equal(zielAusblenden(aus, 'url00001', true, { heute: '2027-02-05' }), aus);
    assert.equal(zielAusblenden(d, 'gibtsnicht', true, { heute: '2027-02-05' }), d);
    const mit = sparVerlauf(d, k, '2027-02-05');
    const ohne = sparVerlauf(aus, k, '2027-02-05');
    assert.deepEqual(ohne.monate, mit.monate);
    assert.equal(ohne.frei, mit.frei);
    assert.deepEqual(ohne.ziele.map(({ aus: _a, ...z }) => z), mit.ziele);
    assert.equal(ohne.ziele[1].aus, true);
    // gespeichert als h:1, gelesen zurück
    assert.equal(JSON.parse(zieleText(aus)).z[1].h, 1);
    assert.equal(zieleLesen(zieleText(aus)).daten.z[1].aus, true);
    const wieder = zielAusblenden(aus, 'url00001', false);
    assert.equal('aus' in wieder.z[1], false);
    // Ändern lässt das Flag stehen
    assert.equal(zielSetzen({ ...d, z: [{ ...d.z[0], aus: true }, d.z[1]] }, auto({ name: 'Neues Auto' }), { heute: '2026-10-20' }).z[0].aus, true);
  });

  test('freiVerschieben: gedeckelt auf „Frei“ und auf das noch Offene; wiederholbar; Prüfungen; Höchstzahl', () => {
    const k = kontoAus({ '2026-09': 800000, '2026-10': 1000000 }); // Oktober +2.000 €
    const ctx = { konto: k, heute: '2026-11-05' };
    const d = daten([auto(), urlaub({ zielCents: 50000 })]); // nötig 104.546 + 5.000, der Rest (90.454) → Frei; Urlaub offen 45.000
    const v0 = sparVerlauf(d, k, ctx.heute);
    assert.ok(v0.frei > 0);
    const offenUrlaub = v0.ziele[1].offen;
    // mehr als offen → auf offen gedeckelt
    const v = { id: 'v0000001', monat: '2026-11', ziel: 'url00001', cents: 99_999_900 };
    const eins = freiVerschieben(d, v, ctx);
    assert.deepEqual(eins.m, [{ ...v, cents: Math.min(offenUrlaub, v0.frei) }]);
    assert.equal(freiVerschieben(eins, v, ctx), eins, 'wiederholbar');
    // mehr als Frei → auf Frei gedeckelt
    const zuAuto = freiVerschieben(d, { id: 'v0000002', monat: '2026-11', ziel: 'auto0001', cents: 99_999_900 }, ctx);
    assert.equal(zuAuto.m[0].cents, v0.frei);
    // nichts mehr da / schon erreicht
    assert.throws(() => freiVerschieben(zuAuto, { id: 'v0000003', monat: '2026-11', ziel: 'url00001', cents: 100 }, ctx), /nichts zum Verschieben/);
    assert.throws(() => freiVerschieben(eins, { id: 'v0000004', monat: '2026-11', ziel: 'url00001', cents: 100 }, ctx), /schon erreicht/);
    // Prüfungen
    assert.throws(() => freiVerschieben(d, { ...v, ziel: 'gibtsnicht' }, ctx), /Sparziel gibt es nicht mehr/);
    assert.throws(() => freiVerschieben(d, { ...v, cents: 0 }, ctx), /Betrag/);
    assert.throws(() => freiVerschieben(d, { ...v, cents: 12.5 }, ctx), /Betrag/);
    assert.throws(() => freiVerschieben(d, { ...v, monat: '2026-13' }, ctx), /Ungültiger Monat/);
    assert.throws(() => freiVerschieben(d, { ...v, id: 'x' }, ctx), /Ungültige Kennung/);
    assert.throws(() => freiVerschieben(d, v, { konto: k }), /Ungültiges Datum/);
    const beendet = daten([auto(), urlaub({ beendet: { monat: '2026-11', art: 'frei' } })]);
    assert.throws(() => freiVerschieben(beendet, v, ctx), /schon abgeschlossen/);
    const spaeter = daten([auto(), urlaub({ erstellt: '2026-12' })]);
    assert.throws(() => freiVerschieben(spaeter, v, ctx), /beginnt erst später/);
    const viele = { v: 1, z: [auto()], m: Array.from({ length: MAX_VERSCHIEBUNGEN }, (_, i) => ({ id: `m${String(i).padStart(4, '0')}`, monat: '2026-12', ziel: 'auto0001', cents: 1 })) };
    assert.throws(() => freiVerschieben(viele, { ...v, ziel: 'auto0001' }, ctx), /Höchstens 200 Verschiebungen/);
  });

  test('Platz im Kalender: Anlegen und Verschieben lassen Raum, jedes Ziel zu beenden und auszublenden; Löschen ungeförderter Ziele macht Platz', () => {
    const heute = '2026-10-05';
    // Oktober +500.000 €: das lange Ziel braucht davon nur ~10.101 €, der Rest ist „Frei“
    const k = kontoAus({ '2026-09': 100000, '2026-10': 50_100_000 });
    const lang = auto({ id: 'lang0001', zielCents: 99_999_900, datum: '2034-12' });
    let d = zielSetzen(leereZiele(), lang, { heute });
    // Verschiebungen, bis keine mehr passt
    for (let n = 0; ; n += 1) {
      try {
        d = freiVerschieben(d, { id: `v${String(n).padStart(7, '0')}`, monat: '2026-10', ziel: 'lang0001', cents: 1 }, { konto: k, heute });
      } catch (e) {
        assert.equal(e.message, TEXT_VERSCHIEBUNGEN_VOLL);
        break;
      }
      if (n === 30) break; // genug Verschiebungen; der Rest des Platzes für Ziele
    }
    // Ziele mit langem Namen (Start November, also nie gefördert; jedes dritte bleibt laufend), bis kein weiteres mehr passt
    for (let i = 0; ; i += 1) {
      const z = auto({ id: `a${String(i).padStart(5, '0')}`, name: 'Ü'.repeat(30), erstellt: '2026-11', datum: '2026-11', zielCents: 99_999_900 });
      try {
        d = zielSetzen(d, z, { heute });
      } catch (e) {
        assert.equal(e.message, TEXT_ZIELE_VOLL);
        break;
      }
      if (i % 3 !== 0) d = zielBeenden(d, z.id, { monat: '2026-10', art: 'ausgegeben' }); // sofort abgeschlossen, zählt nicht als laufend
      assert.ok(i < 200, 'muss irgendwann voll sein');
    }
    // jetzt auch Verschiebungen bis zum Rand – mit der passenden Meldung
    for (let n = 100; ; n += 1) {
      try {
        d = freiVerschieben(d, { id: `v${String(n).padStart(7, '0')}`, monat: '2026-10', ziel: 'lang0001', cents: 1 }, { konto: k, heute });
      } catch (e) {
        assert.equal(e.message, TEXT_VERSCHIEBUNGEN_VOLL);
        break;
      }
      assert.ok(n < 200);
    }
    assert.ok(d.z.filter((z) => !z.beendet).length >= 5, 'einige laufen noch');
    // alle beenden und ausblenden geht, ohne die Grenze zu überschreiten
    for (const z of d.z) d = zielBeenden(d, z.id, { monat: '2026-12', art: 'ausgegeben' });
    for (const z of d.z) d = zielAusblenden(d, z.id, true, { heute: '2026-12-05' });
    assert.ok(d.z.every((z) => z.beendet && z.aus));
    assert.ok(zieleText(d).length <= MAX_ZIELE_ZEICHEN);
    // ein nie gefördertes Ziel löschen macht Platz; das geförderte nicht
    const laenge = zieleText(d).length;
    d = zielLoeschen(d, 'a00001', { heute, konto: k });
    assert.ok(zieleText(d).length < laenge);
    assert.throws(() => zielLoeschen(d, 'lang0001', { heute, konto: k }), { message: TEXT_NICHT_LOESCHBAR });
  });

  test('zieleText: zu voll → deutsche Meldung', () => {
    const viel = { v: 1, z: [auto()], m: Array.from({ length: 150 }, (_, i) => ({ id: `m${String(i).padStart(4, '0')}`, monat: '2026-12', ziel: 'auto0001', cents: 99_999_900 })) };
    assert.throws(() => zieleText(viel), { message: TEXT_ZIELE_VOLL });
    assert.match(TEXT_ZIELE_VOLL, /Sparziele sind voll/);
  });
});

// ---------------------------------------------------------------- Speicherformat

describe('zieleText / zieleLesen / normalisiereZiele', () => {
  test('hin und zurück; kurze Schlüssel; vorläufig nur wenn wahr', () => {
    const d = daten([auto(), urlaub({ beendet: { monat: '2027-02', art: 'frei' } })], [{ id: 'v0000001', monat: '2026-12', ziel: 'auto0001', cents: 20000 }]);
    const text = zieleText(d);
    assert.deepEqual(JSON.parse(text), {
      v: 1,
      a: '2026-10',
      z: [
        { i: 'auto0001', n: 'Auto', e: '🚗', c: 2300000, d: '2028-07', s: '2026-10' },
        { i: 'url00001', n: 'Sommerurlaub', e: '🏖️', c: 300000, d: '2027-07', p: 1, s: '2026-10', b: { m: '2027-02', a: 'frei' } },
      ],
      m: [{ i: 'v0000001', m: '2026-12', z: 'auto0001', c: 20000 }],
    });
    assert.deepEqual(zieleLesen(text), { daten: { ...d, beginn: '2026-10' }, unlesbar: false });
  });

  test('beginn: gespeichert als „a“, rückt nie nach hinten; alte Daten ohne „a“ → frühester Startmonat', () => {
    assert.equal(zieleBeginn(leereZiele()), null);
    assert.equal(zieleBeginn(daten([auto({ erstellt: '2026-12' }), urlaub({ erstellt: '2026-11' })])), '2026-11');
    assert.equal(zieleBeginn({ v: 1, beginn: '2026-09', z: [auto()], m: [] }), '2026-09');
    assert.equal(zieleBeginn({ v: 1, beginn: '2026-12', z: [auto()], m: [] }), '2026-10', 'ein früheres Ziel zieht ihn nach vorn');
    assert.equal(zieleBeginn({ v: 1, beginn: 'quatsch', z: [auto()], m: [] }), '2026-10');
    const alt = zieleLesen(JSON.stringify({ v: 1, z: [{ i: 'auto0001', n: 'Auto', e: '🚗', c: 2300000, d: '2028-07', s: '2026-11' }], m: [] }));
    assert.equal(alt.daten.beginn, '2026-11');
    const mitA = zieleLesen(JSON.stringify({ v: 1, a: '2026-08', z: [], m: [] }));
    assert.deepEqual(mitA, { daten: { v: 1, beginn: '2026-08', z: [], m: [] }, unlesbar: false });
    assert.equal(JSON.parse(zieleText(mitA.daten)).a, '2026-08');
    // ein neues Ziel mit späterem Start ändert beginn nicht
    assert.equal(zielSetzen(mitA.daten, auto(), { heute: '2026-10-20' }).beginn, '2026-08');
    // ohne Ziele, aber mit beginn: ab da geht alles zu „Frei“
    const v = sparVerlauf(mitA.daten, kontoAus(BEISPIEL), '2026-12-05');
    assert.equal(v.frei, 100000 - 30000 + 200000 - 20000);
  });

  test('fehlender Text → leer, nicht unlesbar; kaputtes JSON, v:2, keine Liste → leer und unlesbar', () => {
    assert.deepEqual(zieleLesen(''), { daten: leereZiele(), unlesbar: false });
    assert.deepEqual(zieleLesen(undefined), { daten: leereZiele(), unlesbar: false });
    for (const t of ['{kaputt', '{"v":2,"z":[],"m":[]}', '{"v":1,"z":{},"m":[]}', '{"v":1,"z":[],"m":3}', '[]', 'null', '"text"']) {
      assert.deepEqual(zieleLesen(t), { daten: leereZiele(), unlesbar: true }, t);
    }
    assert.deepEqual(zieleLesen('{"v":1,"z":[]}'), { daten: leereZiele(), unlesbar: false }, 'fehlende Verschiebungen = keine');
  });

  test('unbekannte Einträge bleiben als „fremd“ erhalten und werden unverändert wieder geschrieben', () => {
    const neuesFeld = { i: 'neu00001', n: 'Haus', e: '🏠', c: 500000, d: '2030-01', s: '2026-10', q: 7 };
    const fremdesSymbol = { i: 'neu00002', n: 'Pizza', e: '🍕', c: 500000, d: '2030-01', s: '2026-10' };
    const langerName = { i: 'neu00003', n: 'x'.repeat(31), e: '🏠', c: 500000, d: '2030-01', s: '2026-10' };
    const fremdeVerschiebung = { i: 'v0000009', m: '2026-12', z: 'auto0001', c: 100, w: 'papa' };
    const roh = {
      v: 1,
      z: [{ i: 'auto0001', n: 'Auto', e: '🚗', c: 2300000, d: '2028-07', s: '2026-10' }, neuesFeld, fremdesSymbol, langerName, 'quatsch', { i: 'auto0001', n: 'Doppelt', e: '🚗', c: 100, d: '2028-07', s: '2026-10' }],
      m: [{ i: 'v0000001', m: '2026-12', z: 'auto0001', c: 20000 }, fremdeVerschiebung],
    };
    const { daten: d, fremd } = normalisiereZiele(roh);
    assert.deepEqual(d.z, [auto()]);
    assert.deepEqual(d.m, [{ id: 'v0000001', monat: '2026-12', ziel: 'auto0001', cents: 20000 }]);
    assert.deepEqual(fremd, { z: [neuesFeld, fremdesSymbol, langerName, 'quatsch'], m: [fremdeVerschiebung] });
    assert.deepEqual(d.fremd, fremd);
    const gelesen = zieleLesen(JSON.stringify(roh));
    assert.equal(gelesen.unlesbar, false);
    // eine Änderung schreibt die fremden Einträge unverändert mit
    const geaendert = zielSetzen(gelesen.daten, urlaub(), { heute: '2026-10-20' });
    const text = JSON.parse(zieleText(geaendert));
    assert.deepEqual(text.z.slice(2), [neuesFeld, fremdesSymbol, langerName, 'quatsch']);
    assert.deepEqual(text.m.slice(1), [fremdeVerschiebung]);
    // ohne Fremdes kein Feld
    assert.equal('fremd' in normalisiereZiele({ v: 1, z: [], m: [] }).daten, false);
    assert.deepEqual(normalisiereZiele(null), { daten: leereZiele(), fremd: { z: [], m: [] } });
  });
});

// ---------------------------------------------------------------- Ersparnis je Monat

describe('sparMonate', () => {
  test('nur Monate mit beiden Ständen; der erste ist nur Basis; Sonderbeträge zählen nicht heraus', () => {
    const k = kontoAus(BEISPIEL, { x: [{ i: 'extra001', p: 'papa', m: '2026-12', c: 150000, t: 'Weihnachtsgeld' }] });
    assert.deepEqual(sparMonate(k), [
      { monat: '2026-10', basis: '2026-09', gespart: 100000 },
      { monat: '2026-11', basis: '2026-10', gespart: -30000 },
      { monat: '2026-12', basis: '2026-11', gespart: 200000 },
      { monat: '2027-01', basis: '2026-12', gespart: -20000 },
    ]);
    assert.deepEqual(sparMonate(null), []);
  });

  test('Lücke bei Mama: der ganze Unterschied zählt im nächsten Monat mit beiden', () => {
    const k = kontoAus({ '2026-09': 800000, '2026-10': 900000, '2026-11': 870000 }, { ohneMama: ['2026-10'] });
    assert.deepEqual(sparMonate(k), [{ monat: '2026-11', basis: '2026-09', gespart: 70000 }]);
  });
});

// ---------------------------------------------------------------- Aufteilung

describe('sparVerlauf – Beispiel aus der Skizze', () => {
  const d = daten([auto(), urlaub()]);

  test('Oktober +1.000 € bei nötig 1.345,46 € → anteilig nach Bedarf, Summe genau 1.000 €, Rundungsrest beim größten Anteil', () => {
    const v = sparVerlauf(d, kontoAus(BEISPIEL), '2026-11-05');
    const okt = monatVon(v, '2026-10');
    assert.equal(okt.gespart, 100000);
    assert.equal(okt.art, 'plus');
    assert.deepEqual(okt.zuteilung, [
      { ziel: 'auto0001', cents: 77703, noetig: 104546 }, // 2.300.000 / 22 Monate (aufgerundet); genau 77.702,79 → +1 Rest
      { ziel: 'url00001', cents: 22297, noetig: 30000 }, // 300.000 / 10 Monate; genau 22.297,20
    ]);
    assert.deepEqual(okt.frei, { cents: 0, vorher: 0, nachher: 0 });
    assert.equal(summe(okt.zuteilung.map((t) => t.cents)), 100000);
  });

  test('November −300 € bei Frei 0 → anteilig nach dem Gesparten', () => {
    const nov = monatVon(sparVerlauf(d, kontoAus(BEISPIEL), '2026-12-05'), '2026-11');
    assert.equal(nov.art, 'minus');
    assert.deepEqual(nov.zuteilung.map((t) => t.cents), [-23311, -6689]); // 30.000 × 77.703 / 100.000 = 23.310,9
    assert.deepEqual(nov.frei, { cents: 0, vorher: 0, nachher: 0 });
    assert.equal(nov.ungedeckt, 0);
  });

  test('Dezember +2.000 € → jedes Ziel bekommt genau das Nötige, der Rest geht zu Frei', () => {
    const { '2027-01': _jan, ...bisDez } = BEISPIEL;
    const v = sparVerlauf(d, kontoAus(bisDez), '2027-01-05');
    const dez = monatVon(v, '2026-12');
    assert.deepEqual(dez.zuteilung, [
      { ziel: 'auto0001', cents: 112281, noetig: 112281 }, // (2.300.000 − 54.392) / 20 Monate
      { ziel: 'url00001', cents: 35549, noetig: 35549 }, // (300.000 − 15.608) / 8 Monate
    ]);
    assert.deepEqual(dez.frei, { cents: 52170, vorher: 0, nachher: 52170 });
    assert.equal(v.frei, 52170);
    assert.equal(zielVon(v, 'auto0001').gespart, 166673);
    assert.equal(zielVon(v, 'url00001').gespart, 51157);
    assert.equal(v.summeZiele, 166673 + 51157);
  });

  test('Januar −200 € mit Frei > 0 → zuerst aus Frei, die Ziele bleiben', () => {
    const v = sparVerlauf(d, kontoAus(BEISPIEL), '2027-02-05');
    const jan = monatVon(v, '2027-01');
    assert.deepEqual(jan.zuteilung.map((t) => t.cents), [0, 0]);
    assert.deepEqual(jan.frei, { cents: -20000, vorher: 52170, nachher: 32170 });
    assert.equal(v.frei, 32170);
    assert.equal(zielVon(v, 'auto0001').gespart, 166673);
  });

  test('Verlauf: neueste zuerst; Stand-Monat; Summen', () => {
    const v = sparVerlauf(d, kontoAus(BEISPIEL), '2027-02-05');
    assert.deepEqual(v.monate.map((m) => m.monat), ['2027-01', '2026-12', '2026-11', '2026-10']);
    assert.equal(v.standMonat, '2027-01');
    assert.equal(v.summeZiele, 166673 + 51157);
    assert.equal(v.noetigGesamt, summe(v.ziele.map((z) => z.noetigProMonat)));
  });

  test('Minus größer als alles → kein Ziel unter 0, Frei 0, der Rest verfällt (ungedeckt)', () => {
    const k = kontoAus({ ...BEISPIEL, '2027-02': 1050000 - 1000000 });
    const v = sparVerlauf(d, k, '2027-03-05');
    const feb = monatVon(v, '2027-02');
    assert.deepEqual(feb.zuteilung.map((t) => t.cents), [-166673, -51157]);
    assert.deepEqual(feb.frei, { cents: -32170, vorher: 32170, nachher: 0 });
    assert.equal(feb.ungedeckt, 1000000 - 32170 - 166673 - 51157);
    assert.equal(summe(feb.zuteilung.map((t) => t.cents)) + feb.frei.cents, feb.gespart + feb.ungedeckt);
    assert.deepEqual(v.ziele.map((z) => z.gespart), [0, 0]);
    assert.equal(v.frei, 0);
  });
});

describe('sparVerlauf – Regeln', () => {
  test('nötig pro Monat = (Ziel − gespart) / verbleibende Monate (aufgerundet, mindestens 1 Monat); Plan, Status', () => {
    const nurOktober = kontoAus({ '2026-09': 800000, '2026-10': 900000 });
    const v = sparVerlauf(daten([auto(), urlaub()]), nurOktober, '2026-11-05');
    const a = zielVon(v, 'auto0001');
    // nach Oktober: 2.300.000 − 77.703 = 2.222.297 offen, November 2026 … Juli 2028 = 21 Monate
    assert.equal(a.gespart, 77703);
    assert.equal(a.offen, 2222297);
    assert.equal(a.monateRest, 21);
    assert.equal(a.noetigProMonat, Math.ceil(2222297 / 21));
    // Plan: 1 von 22 Monaten vorbei → 2.300.000 / 22 = 104.545 Soll; 26.842 dahinter
    assert.deepEqual(a.plan, { soll: 104545, rueckstand: 104545 - 77703 });
    assert.equal(a.status, 'hinter');
    assert.equal(a.abgeschlossen, null);
    // Datum im laufenden Monat → mindestens 1 Monat
    const knapp = sparVerlauf(daten([auto({ datum: '2026-11-30' })]), nurOktober, '2026-11-05');
    assert.equal(zielVon(knapp, 'auto0001').monateRest, 1);
    assert.equal(zielVon(knapp, 'auto0001').noetigProMonat, 2300000 - 100000);
  });

  test('im Plan, neu (ab nächstem Monat dabei)', () => {
    const k = kontoAus({ '2026-09': 800000, '2026-10': 2000000 });
    const v = sparVerlauf(daten([urlaub(), { id: 'rum00001', name: 'Urlaub Rumänien', emoji: '🇷🇴', zielCents: 150000, datum: '2027-08-15', vorlaeufig: false, erstellt: '2026-11' }]), k, '2026-10-31');
    assert.equal(zielVon(v, 'url00001').status, 'imPlan');
    assert.equal(zielVon(v, 'url00001').plan.rueckstand, 0);
    const r = zielVon(v, 'rum00001');
    assert.equal(r.status, 'neu');
    assert.equal(r.gespart, 0);
    assert.equal(r.monateRest, 10); // November 2026 … August 2027
    assert.equal(r.noetigProMonat, 15000);
    assert.deepEqual(r.plan, { soll: 0, rueckstand: 0 });
  });

  test('Ziel erreicht → nötig 0, bekommt nichts mehr, der Überschuss geht zu Frei; bleibt bis zum Datum', () => {
    const klein = urlaub({ zielCents: 50000 });
    const k = kontoAus({ '2026-09': 800000, '2026-10': 900000, '2026-11': 950000 });
    const v = sparVerlauf(daten([klein]), k, '2026-12-05');
    const okt = monatVon(v, '2026-10');
    assert.deepEqual(okt.zuteilung, [{ ziel: 'url00001', cents: 5000, noetig: 5000 }]);
    assert.equal(okt.frei.cents, 95000);
    const nov = monatVon(v, '2026-11');
    assert.deepEqual(nov.zuteilung, [{ ziel: 'url00001', cents: 5000, noetig: 5000 }]); // 45.000 / 9
    // mit Verschiebung aus Frei erreicht
    const mitV = sparVerlauf(daten([klein], [{ id: 'v0000001', monat: '2026-10', ziel: 'url00001', cents: 45000 }]), k, '2026-12-05');
    const z = zielVon(mitV, 'url00001');
    assert.equal(z.gespart, 50000);
    assert.equal(z.status, 'erreicht');
    assert.equal(z.noetigProMonat, 0);
    assert.equal(z.abgeschlossen, null);
    assert.deepEqual(monatVon(mitV, '2026-11').zuteilung, [{ ziel: 'url00001', cents: 0, noetig: 0 }]);
    assert.equal(monatVon(mitV, '2026-11').frei.cents, 50000);
    assert.equal(mitV.frei, 95000 - 45000 + 50000);
  });

  test('Datum vorbei → im Monat danach automatisch abgeschlossen (ausgegeben), raus aus den Summen', () => {
    const kurz = urlaub({ datum: '2026-11-15', zielCents: 100000 });
    const k = kontoAus({ '2026-09': 800000, '2026-10': 850000, '2026-11': 900000, '2026-12': 1000000 });
    const { '2026-12': _dez, ...bisNov } = k.p.papa;
    const imNov = sparVerlauf(daten([auto(), kurz]), { ...k, p: { papa: bisNov, mama: k.p.mama } }, '2026-11-30');
    assert.equal(zielVon(imNov, 'url00001').abgeschlossen, null);
    const v = sparVerlauf(daten([auto(), kurz]), k, '2026-12-31');
    const u = zielVon(v, 'url00001');
    assert.deepEqual(u.abgeschlossen, { monat: '2026-12', art: 'ausgegeben', automatisch: true });
    assert.equal(u.noetigProMonat, 0);
    assert.equal(v.summeZiele, zielVon(v, 'auto0001').gespart);
    assert.equal(v.noetigGesamt, zielVon(v, 'auto0001').noetigProMonat);
    const dez = monatVon(v, '2026-12');
    assert.deepEqual(dez.zuteilung.map((t) => t.ziel), ['auto0001']);
    assert.deepEqual(dez.abschluss, [{ ziel: 'url00001', art: 'ausgegeben', cents: u.gespart }]);
    assert.deepEqual(zielSchluss(kurz), { monat: '2026-12', art: 'ausgegeben', automatisch: true });
  });

  test('beendet „frei“ → das Gesparte geht zu Frei; „ausgegeben“ → raus aus allem', () => {
    const k = kontoAus({ '2026-09': 800000, '2026-10': 900000, '2026-11': 1000000 });
    const basis = sparVerlauf(daten([auto(), urlaub()]), k, '2026-12-05');
    const uGespart = zielVon(basis, 'url00001').gespart;
    const frei = sparVerlauf(daten([auto(), urlaub({ beendet: { monat: '2026-12', art: 'frei' } })]), k, '2026-12-05');
    assert.equal(frei.frei, basis.frei + uGespart);
    assert.deepEqual(zielVon(frei, 'url00001').abgeschlossen, { monat: '2026-12', art: 'frei', automatisch: false });
    assert.equal(zielVon(frei, 'url00001').gespart, uGespart);
    assert.equal(frei.summeZiele, zielVon(frei, 'auto0001').gespart);
    const dez = monatVon(frei, '2026-12');
    assert.equal(dez.gespart, null);
    assert.equal(dez.art, 'leer');
    assert.deepEqual(dez.frei, { cents: 0, vorher: basis.frei, nachher: basis.frei + uGespart });
    const weg = sparVerlauf(daten([auto(), urlaub({ beendet: { monat: '2026-12', art: 'ausgegeben' } })]), k, '2026-12-05');
    assert.equal(weg.frei, basis.frei);
    assert.equal(weg.summeZiele, zielVon(weg, 'auto0001').gespart);
    // beendet ab November: im November bekommt es nichts mehr
    const frueh = sparVerlauf(daten([auto(), urlaub({ beendet: { monat: '2026-11', art: 'ausgegeben' } })]), k, '2026-12-05');
    assert.deepEqual(monatVon(frueh, '2026-11').zuteilung.map((t) => t.ziel), ['auto0001']);
  });

  test('Verschiebung aus Frei: nach der Aufteilung ihres Monats, gedeckelt auf das verfügbare Frei und auf das noch Offene', () => {
    const k = kontoAus({ '2026-09': 800000, '2026-10': 1000000 });
    const klein = urlaub({ zielCents: 100000 }); // nötig 10.000, Rest 190.000 → Frei
    const v = sparVerlauf(daten([klein], [{ id: 'v0000001', monat: '2026-10', ziel: 'url00001', cents: 500000 }]), k, '2026-11-05');
    const okt = monatVon(v, '2026-10');
    assert.deepEqual(okt.verschoben, [{ id: 'v0000001', ziel: 'url00001', cents: 90000, gewuenscht: 500000 }], 'nur das Offene (90.000), nicht alles Freie');
    assert.deepEqual(okt.frei, { cents: 190000, vorher: 0, nachher: 100000 });
    assert.equal(v.frei, 100000);
    assert.equal(zielVon(v, 'url00001').gespart, 100000);
    assert.equal(zielVon(v, 'url00001').status, 'erreicht');
    // auf Frei gedeckelt: großes Ziel, 500.000 gewünscht, 190.000 frei
    const gross = sparVerlauf(daten([urlaub({ zielCents: 1000000 })], [{ id: 'v0000001', monat: '2026-10', ziel: 'url00001', cents: 500000 }]), k, '2026-11-05');
    assert.equal(monatVon(gross, '2026-10').verschoben[0].cents, 200000 - 100000);
    assert.equal(gross.frei, 0);
    // im laufenden Monat (noch kein Kontostand) wirkt sie sofort
    const jetzt = sparVerlauf(daten([klein], [{ id: 'v0000002', monat: '2026-11', ziel: 'url00001', cents: 50000 }]), k, '2026-11-05');
    assert.equal(jetzt.frei, 140000);
    assert.equal(monatVon(jetzt, '2026-11').gespart, null);
    // zu einem abgeschlossenen oder unbekannten Ziel → 0
    const nichts = sparVerlauf(daten([klein], [{ id: 'v0000003', monat: '2026-10', ziel: 'gibtsnicht', cents: 50000 }]), k, '2026-11-05');
    assert.equal(nichts.frei, 190000);
    assert.equal(monatVon(nichts, '2026-10').verschoben[0].cents, 0);
  });

  test('Lücke bei Mama → der Unterschied zählt im nächsten Monat mit beiden; nötig = k × Monatsbedarf ab dem ersten fehlenden Monat', () => {
    const k = kontoAus({ '2026-09': 800000, '2026-10': 900000, '2026-11': 1000000 }, { ohneMama: ['2026-10'] });
    const v = sparVerlauf(daten([auto(), urlaub()]), k, '2026-12-05');
    assert.deepEqual(v.monate.map((m) => m.monat), ['2026-11']);
    const nov = v.monate[0];
    assert.equal(nov.gespart, 200000);
    assert.equal(nov.basis, '2026-09');
    assert.equal(nov.luecke, 1);
    // 2 × 104.546 und 2 × 30.000 (ohne die Regel: nur 1 Monat → 57.142 in Frei)
    assert.deepEqual(nov.zuteilung, [
      { ziel: 'auto0001', cents: 155406, noetig: 209092 },
      { ziel: 'url00001', cents: 44594, noetig: 60000 },
    ]);
    assert.equal(nov.frei.cents, 0);
  });

  test('Lücke über 3 Monate (Mama fehlt Oktober bis Dezember) → Januar trägt 4 Monate; ein Ziel aus der Lücke zählt nur seine Monate', () => {
    const staende = { '2026-09': 800000, '2026-10': 900000, '2026-11': 1000000, '2026-12': 1100000, '2027-01': 1200000 };
    const k = kontoAus(staende, { ohneMama: ['2026-10', '2026-11', '2026-12'] });
    const jan = monatVon(sparVerlauf(daten([auto(), urlaub()]), k, '2027-02-05'), '2027-01');
    assert.equal(jan.gespart, 400000);
    assert.equal(jan.luecke, 3);
    assert.deepEqual(jan.zuteilung.map((t) => t.noetig), [418184, 120000]);
    assert.deepEqual(jan.zuteilung.map((t) => t.cents), [310812, 89188]);
    assert.equal(jan.frei.cents, 0);
    const rumaenien = { id: 'rum00001', name: 'Urlaub Rumänien', emoji: '🇷🇴', zielCents: 150000, datum: '2027-08', vorlaeufig: false, erstellt: '2026-12' };
    const drei = monatVon(sparVerlauf(daten([auto(), urlaub(), rumaenien]), k, '2027-02-05'), '2027-01');
    assert.deepEqual(drei.zuteilung.map((t) => t.noetig), [418184, 120000, 33334]); // Rumänien: 2 × 16.667 (Dezember, Januar)
    assert.deepEqual(drei.zuteilung.map((t) => t.cents), [292684, 83986, 23330]);
    // höchstens offen: 100 Cent, 3 Monate Rest, Lücke 3 → nicht 3 × 34 = 102
    const winzig = urlaub({ id: 'aaa1', zielCents: 100, datum: '2026-12' });
    const w = monatVon(sparVerlauf(daten([winzig]), kontoAus({ '2026-09': 800000, '2026-12': 900000 }, { ohneMama: [] }), '2027-01-05'), '2026-12');
    assert.deepEqual(w.zuteilung, [{ ziel: 'aaa1', cents: 100, noetig: 100 }]);
  });

  test('Lücke über den Beginn hinweg: der ganze Unterschied zählt, was die Ziele nicht brauchen, geht zu „Frei“', () => {
    // beide im August, Mama fehlt September und Oktober, Ziel ab Oktober, beide im November
    const k = kontoAus({ '2026-08': 700000, '2026-09': 800000, '2026-10': 900000, '2026-11': 1000000 }, { ohneMama: ['2026-09', '2026-10'] });
    const nov = monatVon(sparVerlauf(daten([urlaub()]), k, '2026-12-05'), '2026-11');
    assert.equal(nov.basis, '2026-08');
    assert.equal(nov.gespart, 300000);
    assert.equal(nov.luecke, 1, 'gezählt ab dem Beginn (Oktober)');
    assert.deepEqual(nov.zuteilung, [{ ziel: 'url00001', cents: 60000, noetig: 60000 }]);
    assert.equal(nov.frei.cents, 240000);
  });

  test('fällig: Zielmonat schon gerechnet → noch 0 Monate, nötig 0, nicht mehr in „nötig gesamt“', () => {
    const k = kontoAus({ '2026-09': 800000, '2026-10': 900000, '2026-11': 1000000 });
    const v = sparVerlauf(daten([auto(), urlaub({ datum: '2026-11-20' })]), k, '2026-11-30');
    const u = zielVon(v, 'url00001');
    assert.equal(u.faellig, true);
    assert.equal(u.abgeschlossen, null);
    assert.equal(u.monateRest, 0);
    assert.equal(u.noetigProMonat, 0);
    assert.equal(v.noetigGesamt, zielVon(v, 'auto0001').noetigProMonat);
    assert.equal(zielVon(v, 'auto0001').faellig, false);
  });

  test('ungültiges heute (undefined, Date, nur Monat) → sofort ein Fehler, nie eine Endlosschleife', () => {
    const url = pathToFileURL(`${process.cwd()}/src/domain/sparziele.js`).href;
    const code = `
      const s = await import(${JSON.stringify(url)});
      const d = { v: 1, z: [{ id: 'auto0001', name: 'Auto', emoji: '🚗', zielCents: 2300000, datum: '2028-07', vorlaeufig: false, erstellt: '2026-10' }], m: [] };
      const k = { v: 1, p: { papa: { '2026-09': 1, '2026-10': 2 }, mama: { '2026-09': 1, '2026-10': 2 } }, x: [] };
      const faelle = [];
      for (const heute of [undefined, new Date(), '2026-10', 20261020, '2026-02-30']) {
        faelle.push(() => s.sparVerlauf(d, k, heute), () => s.startMonat(heute, k), () => s.zielPruefen(d.z[0], { heute }),
          () => s.zielSetzen(d, d.z[0], { heute }), () => s.zielLoeschen(d, 'auto0001', { heute, konto: k }), () => s.zielLoeschbar(d, k, heute, 'auto0001'),
          () => s.freiVerschieben(d, { id: 'v0000001', monat: '2026-10', ziel: 'auto0001', cents: 1 }, { konto: k, heute }));
      }
      let gut = 0;
      for (const f of faelle) { try { f(); } catch (e) { if (/Ungültiges Datum/.test(e.message)) gut += 1; } }
      console.log(gut === faelle.length ? 'ok' : 'nur ' + gut + ' von ' + faelle.length);
    `;
    const lauf = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 15000 });
    assert.equal(lauf.error, undefined, 'darf nicht hängen');
    assert.equal(lauf.stdout.trim(), 'ok', lauf.stderr);
  });

  test('Korrektur eines alten Kontostands → alle späteren Monate neu gerechnet, nichts verloren, nichts negativ', () => {
    const d = daten([auto(), urlaub()]);
    const vorher = sparVerlauf(d, kontoAus(BEISPIEL), '2027-02-05');
    const korrigiert = sparVerlauf(d, kontoAus({ ...BEISPIEL, '2026-10': 700000 }), '2027-02-05'); // Oktober −1.000 € statt +1.000 €
    assert.notDeepEqual(korrigiert.ziele, vorher.ziele);
    assert.equal(monatVon(korrigiert, '2026-10').gespart, -100000);
    assert.equal(monatVon(korrigiert, '2026-11').gespart, 170000);
    for (const v of [vorher, korrigiert]) {
      for (const m of v.monate) assert.equal(summe(m.zuteilung.map((t) => t.cents)) + m.frei.cents, m.gespart + m.ungedeckt, m.monat);
      assert.ok(v.ziele.every((z) => z.gespart >= 0) && v.frei >= 0);
    }
    // Oktober −1.000 € ohne Gespartes und ohne Frei verfällt; danach zählt nur, was übrig ist
    assert.equal(monatVon(korrigiert, '2026-10').ungedeckt, 100000);
    assert.equal(korrigiert.summeZiele + korrigiert.frei, 170000 + 200000 - 20000);
    // Monat gelöscht (Nachtragen rückgängig) → auch neu gerechnet
    const { '2026-11': _weg, ...ohneNov } = BEISPIEL;
    const geloescht = sparVerlauf(d, kontoAus(ohneNov), '2027-02-05');
    assert.deepEqual(geloescht.monate.map((m) => m.monat), ['2027-01', '2026-12', '2026-10']);
    assert.equal(monatVon(geloescht, '2026-12').gespart, 170000);
  });

  test('vor dem ältesten Startmonat zählt nichts (auch kein Frei); ohne laufende Ziele geht alles zu Frei', () => {
    const k = kontoAus({ '2026-07': 500000, '2026-08': 600000, '2026-09': 800000, '2026-10': 900000, '2026-11': 1000000 });
    const v = sparVerlauf(daten([urlaub({ datum: '2026-10' })]), k, '2026-12-05');
    assert.deepEqual(v.monate.map((m) => m.monat), ['2026-11', '2026-10']);
    const nov = monatVon(v, '2026-11');
    assert.deepEqual(nov.zuteilung, []);
    assert.equal(nov.frei.cents, 100000);
    assert.deepEqual(nov.abschluss, [{ ziel: 'url00001', art: 'ausgegeben', cents: 100000 }]);
    assert.equal(v.frei, 100000);
    assert.equal(v.summeZiele, 0);
    // ohne Ziele: nichts
    assert.deepEqual(sparVerlauf(leereZiele(), k, '2026-12-05'), { monate: [], ziele: [], frei: 0, summeZiele: 0, noetigGesamt: 0, standMonat: '2026-11' });
    assert.equal(sparVerlauf(leereZiele(), null, '2026-12-05').standMonat, null);
  });

  test('Rundungsrest: nie mehr als nötig (Plus) und nie mehr als gespart (Minus) – dann geht er zum nächstgrößten Anteil', () => {
    // drei Ziele brauchen je 1 Cent (100 Cent in 100 Monaten), gespart werden 2 Cent → 1 + 1 + 0, nicht 2 + 0 + 0
    const winzig = ['aaa1', 'aaa2', 'aaa3'].map((id) => urlaub({ id, zielCents: 100, datum: '2035-01' }));
    const plus = sparVerlauf(daten(winzig), kontoAus({ '2026-09': 800000, '2026-10': 800002 }), '2026-11-05');
    assert.deepEqual(monatVon(plus, '2026-10').zuteilung, [
      { ziel: 'aaa1', cents: 1, noetig: 1 },
      { ziel: 'aaa2', cents: 1, noetig: 1 },
      { ziel: 'aaa3', cents: 0, noetig: 1 },
    ]);
    // jedes hat 1 Cent, das Minus ist 2 Cent → 1 + 1 + 0 weg, keines unter 0
    const minus = sparVerlauf(daten(winzig), kontoAus({ '2026-09': 800000, '2026-10': 800003, '2026-11': 800001 }), '2026-12-05');
    assert.deepEqual(monatVon(minus, '2026-11').zuteilung.map((t) => t.cents), [-1, -1, 0]);
    assert.deepEqual(minus.ziele.map((z) => z.gespart), [0, 0, 1]);
  });

  test('Monat mit genau ±0 → leer', () => {
    const v = sparVerlauf(daten([urlaub()]), kontoAus({ '2026-09': 800000, '2026-10': 800000 }), '2026-11-05');
    assert.equal(monatVon(v, '2026-10').art, 'leer');
    assert.deepEqual(monatVon(v, '2026-10').zuteilung, [{ ziel: 'url00001', cents: 0, noetig: 30000 }]);
  });

  test('rein und deterministisch: Eingaben bleiben unverändert, gleiches Ergebnis', () => {
    const d = tiefFrieren(daten([auto(), urlaub()], [{ id: 'v0000001', monat: '2026-12', ziel: 'auto0001', cents: 1000 }]));
    const k = tiefFrieren(kontoAus(BEISPIEL));
    assert.deepEqual(sparVerlauf(d, k, '2027-02-05'), sparVerlauf(d, k, '2027-02-05'));
  });
});

// ---------------------------------------------------------------- Eigenschaft: auf den Cent genau

describe('Eigenschaft: Σ Zuteilung + ΔFrei = Ersparnis (auf den Cent), nichts negativ, nichts verloren', () => {
  test('200 deterministische Zufallsfälle', () => {
    const zufall = zufallsfolge(20261022);
    const ganz = (a, b) => a + Math.floor(zufall() * (b - a + 1));
    const monat = (start, n) => {
      const i = 2026 * 12 + (Number(start.slice(5)) - 1) + n;
      return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
    };
    let gepruefteMonate = 0;
    let minusMonate = 0;
    let ungedeckteMonate = 0;
    let geloeschte = 0;
    for (let fall = 0; fall < 200; fall += 1) {
      const anzahl = ganz(2, 30);
      const papa = {};
      const mama = {};
      let p = ganz(0, 2_000_000);
      let m = ganz(0, 2_000_000);
      for (let i = 0; i < anzahl; i += 1) {
        const mo = monat('2026-01', i);
        p += ganz(-300_000, 400_000) - (zufall() < 0.05 ? 3_000_000 : 0);
        m += ganz(-200_000, 250_000);
        if (zufall() < 0.9) papa[mo] = p;
        if (zufall() < 0.85) mama[mo] = m;
      }
      const ziele = Array.from({ length: ganz(1, 5) }, (_, i) => {
        const erstellt = monat('2026-01', ganz(0, anzahl));
        const ende = monat(erstellt, ganz(0, 30));
        const z = { id: `a${fall}k${i}`, name: `Ziel ${i}`, emoji: ZIEL_EMOJIS[ganz(0, ZIEL_EMOJIS.length - 1)], zielCents: ganz(100, 5_000_000), datum: zufall() < 0.5 ? ende : `${ende}-${String(ganz(1, 28)).padStart(2, '0')}`, vorlaeufig: zufall() < 0.3, erstellt };
        if (zufall() < 0.2) z.beendet = { monat: monat('2026-01', ganz(0, anzahl + 2)), art: zufall() < 0.5 ? 'frei' : 'ausgegeben' };
        return z;
      });
      const verschiebungen = Array.from({ length: ganz(0, 6) }, (_, i) => ({ id: `b${fall}k${i}`, monat: monat('2026-01', ganz(0, anzahl + 1)), ziel: zufall() < 0.9 ? ziele[ganz(0, ziele.length - 1)].id : 'gibtsnicht', cents: ganz(1, 300_000) }));
      const heute = `${monat('2026-01', anzahl - 1 + ganz(0, 3))}-15`;
      const d = tiefFrieren({ v: 1, z: ziele, m: verschiebungen });
      const k = tiefFrieren({ v: 1, p: { papa, mama }, x: [] });
      const v = sparVerlauf(d, k, heute);
      assert.deepEqual(sparVerlauf(d, k, heute), v, `Fall ${fall}: deterministisch`);

      let ersparnis = 0;
      let verfallen = 0;
      for (const mo of v.monate) {
        const zu = mo.zuteilung.map((t) => t.cents);
        assert.ok(mo.frei.vorher >= 0 && mo.frei.nachher >= 0, `Fall ${fall} ${mo.monat}: Frei nie negativ`);
        const ausAbschluss = summe(mo.abschluss.filter((a) => a.art === 'frei').map((a) => a.cents));
        assert.equal(mo.frei.nachher, mo.frei.vorher + ausAbschluss + mo.frei.cents - summe(mo.verschoben.map((x) => x.cents)), `Fall ${fall} ${mo.monat}: Frei-Bilanz`);
        if (mo.gespart === null) {
          assert.deepEqual(mo.zuteilung, []);
          continue;
        }
        gepruefteMonate += 1;
        assert.equal(summe(zu) + mo.frei.cents, mo.gespart + mo.ungedeckt, `Fall ${fall} ${mo.monat}: auf den Cent`);
        ersparnis += mo.gespart;
        verfallen += mo.ungedeckt;
        if (mo.gespart >= 0) {
          assert.equal(mo.ungedeckt, 0);
          assert.ok(mo.frei.cents >= 0);
          const noetig = mo.zuteilung.map((t) => t.noetig);
          if (summe(noetig) >= mo.gespart) mo.zuteilung.forEach((t) => assert.ok(t.cents >= 0 && t.cents <= t.noetig, `Fall ${fall} ${mo.monat}: anteilig ≤ nötig`));
          else mo.zuteilung.forEach((t) => assert.equal(t.cents, t.noetig));
        } else {
          minusMonate += 1;
          assert.ok(zu.every((c) => c <= 0) && mo.frei.cents <= 0);
          if (mo.ungedeckt > 0) ungedeckteMonate += 1;
          if (zu.some((c) => c < 0)) assert.equal(mo.frei.vorher + ausAbschluss + mo.frei.cents, 0, `Fall ${fall} ${mo.monat}: erst Frei leeren`);
        }
      }
      for (const z of v.ziele) assert.ok(z.gespart >= 0 && z.gespart <= z.zielCents && z.offen >= 0 && z.noetigProMonat >= 0, `Fall ${fall} ${z.id}: nie unter 0, nie über dem Ziel`);
      // jedes löschbare Ziel: ohne es bleiben Frei und alle anderen Ziele gleich
      for (const z of ziele) {
        if (!zielLoeschbar(d, k, heute, z.id)) continue;
        geloeschte += 1;
        const ohne = sparVerlauf(zielLoeschen(d, z.id, { heute, konto: k }), k, heute);
        assert.equal(ohne.frei, v.frei, `Fall ${fall}: Löschen ändert Frei nicht`);
        assert.deepEqual(ohne.ziele, v.ziele.filter((x) => x.id !== z.id), `Fall ${fall}: Löschen ändert die anderen Ziele nicht`);
      }
      const offen = v.ziele.filter((z) => !z.abgeschlossen);
      const ausgegeben = v.ziele.filter((z) => z.abgeschlossen?.art === 'ausgegeben');
      assert.equal(v.summeZiele, summe(offen.map((z) => z.gespart)));
      assert.equal(v.noetigGesamt, summe(offen.map((z) => z.noetigProMonat)));
      assert.equal(v.frei + v.summeZiele + summe(ausgegeben.map((z) => z.gespart)), ersparnis + verfallen, `Fall ${fall}: nichts verloren`);
    }
    assert.ok(geloeschte > 20, `genug löschbare Ziele (${geloeschte})`);
    assert.ok(gepruefteMonate > 1000 && minusMonate > 300 && ungedeckteMonate > 100, `genug verschiedene Fälle (${gepruefteMonate}/${minusMonate}/${ungedeckteMonate})`);
  });
});

// ---------------------------------------------------------------- Extras aus der Nachprüfung (n-2, n-3) und Warnungen

describe('Ausblenden nur abgeschlossener Ziele (n-2), Verschieben nicht nach dem Abschluss (n-3), Warnungen', () => {
  test('n-2: ein laufendes Ziel lässt sich nicht ausblenden (klare Meldung); abgeschlossen – von Hand oder automatisch – schon', () => {
    const d = daten([auto(), urlaub({ beendet: { monat: '2026-12', art: 'ausgegeben' } }), urlaub({ id: 'url00002', datum: '2026-11' })]);
    assert.throws(() => zielAusblenden(d, 'auto0001', true, { heute: '2026-12-05' }), /Nur abgeschlossene Sparziele lassen sich ausblenden/);
    // von Hand beendet ab Dezember: im November läuft es noch, ab Dezember abgeschlossen
    assert.throws(() => zielAusblenden(d, 'url00001', true, { heute: '2026-11-30' }), /Nur abgeschlossene/);
    assert.equal(zielAusblenden(d, 'url00001', true, { heute: '2026-12-01' }).z[1].aus, true);
    // Zielmonat November: automatisch abgeschlossen ab Dezember
    assert.throws(() => zielAusblenden(d, 'url00002', true, { heute: '2026-11-15' }), /Nur abgeschlossene/);
    assert.equal(zielAusblenden(d, 'url00002', true, { heute: '2026-12-01' }).z[2].aus, true);
    // ohne gültiges „heute“ wirft es sofort; Einblenden braucht keins und geht immer
    assert.throws(() => zielAusblenden(d, 'url00001', true), /Ungültiges Datum/);
    const aus = { ...d, z: d.z.map((z) => ({ ...z, aus: true })) };
    assert.equal('aus' in zielAusblenden(aus, 'auto0001', false).z[0], false);
    // unbekannte Kennung: unverändert
    assert.equal(zielAusblenden(d, 'gibtsnicht', true, { heute: '2027-01-05' }), d);
  });

  test('n-3: Verschieben in einen Monat ab dem Abschluss des Ziels wird abgelehnt (auch wenn es heute noch läuft)', () => {
    const k = kontoAus({ '2026-09': 800000, '2026-10': 2000000 }); // Oktober +12.000 €: genug für „Frei“
    const ctx = { konto: k, heute: '2026-11-05' };
    const d = daten([auto(), urlaub({ datum: '2026-11' })]); // Urlaub: Zielmonat November → abgeschlossen ab Dezember
    assert.throws(() => freiVerschieben(d, { id: 'v0000001', monat: '2026-12', ziel: 'url00001', cents: 100 }, ctx), /schon abgeschlossen/);
    assert.throws(() => freiVerschieben(d, { id: 'v0000001', monat: '2027-03', ziel: 'url00001', cents: 100 }, ctx), /schon abgeschlossen/);
    const beendet = daten([auto({ beendet: { monat: '2026-12', art: 'frei' } })]);
    assert.throws(() => freiVerschieben(beendet, { id: 'v0000001', monat: '2026-12', ziel: 'auto0001', cents: 100 }, ctx), /schon abgeschlossen/);
    // im laufenden Monat (vor dem Abschluss) geht es
    assert.equal(freiVerschieben(d, { id: 'v0000001', monat: '2026-11', ziel: 'url00001', cents: 100 }, ctx).m.length, 1);
    assert.equal(freiVerschieben(beendet, { id: 'v0000001', monat: '2026-11', ziel: 'auto0001', cents: 100 }, ctx).m.length, 1);
  });

  test('zieleWarnungen: unlesbar → eine klare Warnung; fremde Ziele und Verschiebungen werden gezählt; sonst keine', () => {
    assert.deepEqual(zieleWarnungen({ daten: leereZiele(), unlesbar: false }), []);
    const [w] = zieleWarnungen({ daten: leereZiele(), unlesbar: true });
    assert.match(w, /Sparziele sind unlesbar/);
    const text = JSON.stringify({ v: 1, z: [{ i: 'neu00001', n: 'Neu', x: 1 }, { i: 'neu00002', n: 'Neu', x: 1 }], m: [{ i: 'neu00003', q: 1 }] });
    const w2 = zieleWarnungen(zieleLesen(text));
    assert.equal(w2.length, 2);
    assert.match(w2[0], /^2 Sparziele konnten nicht gelesen werden/);
    assert.match(w2[1], /^1 Verschiebung konnte nicht gelesen werden/);
    const eins = zieleWarnungen(zieleLesen(JSON.stringify({ v: 1, z: [{ i: 'neu00001', x: 1 }] })));
    assert.deepEqual(eins.length, 1);
    assert.match(eins[0], /^1 Sparziel konnte nicht gelesen werden/);
  });
});

describe('Task 3, Fix-Runde 1 (m-1): „ab“ je Ziel und „anteilig“ je Monat kommen aus der Rechnung', () => {
  test('ab = erster Monat, ab dem die restlichen Monate zählen: ohne gerechneten Monat der Startmonat, sonst der Monat nach dem letzten Kontostand', () => {
    const neu = sparVerlauf(daten([auto({ erstellt: '2026-11' })]), kontoAus({ '2026-09': 800000, '2026-10': 900000 }), '2026-10-31');
    assert.equal(zielVon(neu, 'auto0001').ab, '2026-11');
    const v = sparVerlauf(daten([auto()]), kontoAus(BEISPIEL), '2027-01-31');
    assert.equal(zielVon(v, 'auto0001').ab, '2027-02');
    assert.equal(zielVon(v, 'auto0001').monateRest, 18);
    const zu = sparVerlauf(daten([auto({ beendet: { monat: '2026-12', art: 'ausgegeben' } })]), kontoAus(BEISPIEL), '2027-01-31');
    assert.equal(zielVon(zu, 'auto0001').ab, null);
  });

  test('anteilig nur, wenn ein Plus-Monat weniger bringt als nötig (bei genau dem Nötigen nicht); Minus und leer nie', () => {
    const v = sparVerlauf(daten([auto(), urlaub()]), kontoAus(BEISPIEL), '2027-01-31');
    assert.deepEqual(v.monate.map((m) => [m.monat, m.anteilig]), [['2027-01', false], ['2026-12', false], ['2026-11', false], ['2026-10', true]]);
    const genau = sparVerlauf(daten([auto({ zielCents: 1_200_000, datum: '2027-09' })]), kontoAus({ '2026-09': 800000, '2026-10': 900000 }), '2026-10-31');
    assert.equal(monatVon(genau, '2026-10').anteilig, false);
  });
});
