// Sparziele: Ziele, Monatsaufteilung der echten Ersparnis (Kontostand Papa + Mama), „Frei verfügbar“, Abschluss, Speicherformat.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MUTARI,
  MAX_ZIEL_CENTS,
  MAX_ZIEL_NAME,
  MAX_ZIELE_AKTIV,
  MAX_ZIELE_ZEICHEN,
  MIN_ZIEL_CENTS,
  TEXT_ZIELE_VOLL,
  ZIEL_EMOJIS,
  freiVerschieben,
  leereZiele,
  neueZielId,
  normalisiereZiele,
  sparMonate,
  sparVerlauf,
  startMonat,
  zielBeenden,
  zielLoeschen,
  zielPruefen,
  zielSchluss,
  zielSetzen,
  zieleLesen,
  zieleText,
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
    assert.equal(MAX_MUTARI, 200);
    assert.equal(MAX_ZIELE_ZEICHEN, 6000);
    assert.deepEqual(ZIEL_EMOJIS, ['🚗', '🏖️', '🏠', '🎁', '👧', '💍', '🛋️', '🎯', '🇷🇴', '✈️', '💻', '🎄']);
    assert.ok(ZIEL_EMOJIS.includes('\u{1F3D6}️') && ZIEL_EMOJIS.includes('\u{1F6CB}️') && ZIEL_EMOJIS.includes('✈️'));
    assert.ok(Object.isFrozen(ZIEL_EMOJIS));
  });

  test('leereZiele und domain/index.js', () => {
    assert.deepEqual(leereZiele(), { v: 1, z: [], m: [] });
    assert.notEqual(leereZiele().z, leereZiele().z);
    for (const name of ['zielPruefen', 'zielSetzen', 'sparVerlauf', 'sparMonate', 'startMonat', 'zieleLesen', 'zieleText']) assert.equal(typeof domain[name], 'function', name);
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
    assert.deepEqual(eins, { v: 1, z: [auto()], m: [] });
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

  test('zielLoeschen: nur abgeschlossene, mit ihren Verschiebungen; unbekannte Kennung ändert nichts', () => {
    const d = daten([auto(), urlaub({ beendet: { monat: '2026-10', art: 'ausgegeben' } })], [
      { id: 'v0000001', monat: '2026-10', ziel: 'url00001', cents: 500 },
      { id: 'v0000002', monat: '2026-10', ziel: 'auto0001', cents: 700 },
    ]);
    assert.throws(() => zielLoeschen(d, 'auto0001', { heute }), /Nur abgeschlossene Ziele/);
    const neu = zielLoeschen(d, 'url00001', { heute });
    assert.deepEqual(neu, daten([auto()], [{ id: 'v0000002', monat: '2026-10', ziel: 'auto0001', cents: 700 }]));
    assert.equal(zielLoeschen(neu, 'url00001', { heute }), neu);
    // automatisch abgeschlossen (Datum vorbei) zählt auch
    assert.deepEqual(zielLoeschen(daten([auto({ datum: '2026-08' })]), 'auto0001', { heute }), leereZiele());
  });

  test('freiVerschieben: wiederholbar über die Kennung, nur zu einem vorhandenen Ziel, gültiger Betrag, Höchstzahl', () => {
    const d = daten([auto()]);
    const v = { id: 'v0000001', monat: '2026-12', ziel: 'auto0001', cents: 20000 };
    const eins = freiVerschieben(d, v);
    assert.deepEqual(eins.m, [v]);
    assert.equal(freiVerschieben(eins, v), eins);
    assert.throws(() => freiVerschieben(d, { ...v, ziel: 'url00001' }), /Sparziel gibt es nicht mehr/);
    assert.throws(() => freiVerschieben(d, { ...v, cents: 0 }), /Betrag/);
    assert.throws(() => freiVerschieben(d, { ...v, cents: 12.5 }), /Betrag/);
    assert.throws(() => freiVerschieben(d, { ...v, monat: '2026-13' }), /Ungültiger Monat/);
    assert.throws(() => freiVerschieben(d, { ...v, id: 'x' }), /Ungültige Kennung/);
    const viele = { v: 1, z: [auto()], m: Array.from({ length: MAX_MUTARI }, (_, i) => ({ id: `m${String(i).padStart(4, '0')}`, monat: '2026-12', ziel: 'auto0001', cents: 1 })) };
    assert.throws(() => freiVerschieben(viele, v), /Höchstens 200 Verschiebungen/);
  });

  test('Platz im Kalender: Anlegen lässt Raum, jedes laufende Ziel später zu beenden; Beenden und Löschen gehen immer', () => {
    let d = leereZiele();
    let i = 0;
    // Ziele mit langem Namen anlegen (jedes dritte bleibt laufend, die anderen werden gleich beendet), bis kein weiteres mehr passt
    for (;;) {
      const z = auto({ id: `a${String(i).padStart(5, '0')}`, name: 'Ü'.repeat(30), datum: '2026-10', zielCents: 99_999_900 });
      try {
        d = zielSetzen(d, z, { heute: '2026-10-01' });
      } catch (e) {
        assert.equal(e.message, TEXT_ZIELE_VOLL);
        break;
      }
      if (i % 3 !== 0) d = zielBeenden(d, z.id, { monat: '2026-10', art: 'ausgegeben' });
      i += 1;
      assert.ok(i < 200, 'muss irgendwann voll sein');
    }
    assert.ok(d.z.filter((z) => !z.beendet).length >= 5, 'einige laufen noch');
    assert.ok(zieleText(d).length <= MAX_ZIELE_ZEICHEN);
    // auch Verschiebungen lassen die Reserve stehen: so viele, bis keine mehr passt
    for (let n = 0; ; n += 1) {
      try {
        d = freiVerschieben(d, { id: `v${String(n).padStart(7, '0')}`, monat: '2026-10', ziel: d.z[0].id, cents: 99_999_900 });
      } catch (e) {
        assert.equal(e.message, TEXT_ZIELE_VOLL);
        break;
      }
      assert.ok(n < 200);
    }
    // alle laufenden beenden geht, ohne die Grenze zu überschreiten
    for (const z of d.z) d = zielBeenden(d, z.id, { monat: '2026-10', art: 'ausgegeben' });
    assert.ok(d.z.every((z) => z.beendet));
    assert.ok(zieleText(d).length <= MAX_ZIELE_ZEICHEN);
    // Löschen macht wieder Platz (am 01.11. sind alle abgeschlossen)
    d = zielLoeschen(d, d.z[0].id, { heute: '2026-11-01' });
    assert.ok(zieleText(d).length < MAX_ZIELE_ZEICHEN);
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
      z: [
        { i: 'auto0001', n: 'Auto', e: '🚗', c: 2300000, d: '2028-07', s: '2026-10' },
        { i: 'url00001', n: 'Sommerurlaub', e: '🏖️', c: 300000, d: '2027-07', p: 1, s: '2026-10', b: { m: '2027-02', a: 'frei' } },
      ],
      m: [{ i: 'v0000001', m: '2026-12', z: 'auto0001', c: 20000 }],
    });
    assert.deepEqual(zieleLesen(text), { daten: d, unlesbar: false });
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

  test('Verschiebung aus Frei: nach der Aufteilung ihres Monats, gedeckelt auf das verfügbare Frei', () => {
    const k = kontoAus({ '2026-09': 800000, '2026-10': 1000000 });
    const klein = urlaub({ zielCents: 100000 }); // nötig 10.000, Rest 190.000 → Frei
    const v = sparVerlauf(daten([klein], [{ id: 'v0000001', monat: '2026-10', ziel: 'url00001', cents: 500000 }]), k, '2026-11-05');
    const okt = monatVon(v, '2026-10');
    assert.deepEqual(okt.verschoben, [{ id: 'v0000001', ziel: 'url00001', cents: 190000, gewuenscht: 500000 }]);
    assert.deepEqual(okt.frei, { cents: 190000, vorher: 0, nachher: 0 });
    assert.equal(v.frei, 0);
    assert.equal(zielVon(v, 'url00001').gespart, 200000);
    // im laufenden Monat (noch kein Kontostand) wirkt sie sofort
    const jetzt = sparVerlauf(daten([klein], [{ id: 'v0000002', monat: '2026-11', ziel: 'url00001', cents: 50000 }]), k, '2026-11-05');
    assert.equal(jetzt.frei, 140000);
    assert.equal(monatVon(jetzt, '2026-11').gespart, null);
    // zu einem abgeschlossenen oder unbekannten Ziel → 0
    const nichts = sparVerlauf(daten([klein], [{ id: 'v0000003', monat: '2026-10', ziel: 'gibtsnicht', cents: 50000 }]), k, '2026-11-05');
    assert.equal(nichts.frei, 190000);
    assert.equal(monatVon(nichts, '2026-10').verschoben[0].cents, 0);
  });

  test('Lücke bei Mama → der Unterschied zählt im nächsten Monat mit beiden', () => {
    const k = kontoAus({ '2026-09': 800000, '2026-10': 900000, '2026-11': 1000000 }, { ohneMama: ['2026-10'] });
    const v = sparVerlauf(daten([auto(), urlaub()]), k, '2026-12-05');
    assert.deepEqual(v.monate.map((m) => m.monat), ['2026-11']);
    const nov = v.monate[0];
    assert.equal(nov.gespart, 200000);
    assert.equal(nov.basis, '2026-09');
    assert.equal(summe(nov.zuteilung.map((t) => t.cents)) + nov.frei.cents, 200000);
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
      for (const z of v.ziele) assert.ok(z.gespart >= 0 && z.offen >= 0 && z.noetigProMonat >= 0, `Fall ${fall} ${z.id}`);
      const offen = v.ziele.filter((z) => !z.abgeschlossen);
      const ausgegeben = v.ziele.filter((z) => z.abgeschlossen?.art === 'ausgegeben');
      assert.equal(v.summeZiele, summe(offen.map((z) => z.gespart)));
      assert.equal(v.noetigGesamt, summe(offen.map((z) => z.noetigProMonat)));
      assert.equal(v.frei + v.summeZiele + summe(ausgegeben.map((z) => z.gespart)), ersparnis + verfallen, `Fall ${fall}: nichts verloren`);
    }
    assert.ok(gepruefteMonate > 1000 && minusMonate > 300 && ungedeckteMonate > 100, `genug verschiedene Fälle (${gepruefteMonate}/${minusMonate}/${ungedeckteMonate})`);
  });
});
