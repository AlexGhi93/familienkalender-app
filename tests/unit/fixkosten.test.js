// Fixkosten: Posten mit Intervall, fällige Monate, Monatsdurchschnitt, Kündigungsfristen, Teile (Shards) im Kalender.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIX_FRISTEN,
  FIX_INTERVALLE,
  FIX_KATEGORIEN,
  FIX_PERSONEN,
  FIX_SHARDS,
  FIX_VERLAENGERUNG,
  FIX_VORLAGEN,
  MAX_FIX_POSTEN,
  MAX_FIX_ZEICHEN,
  faelligeImMonat,
  faelligIn,
  istAktiv,
  kuendigungsfristen,
  leererShard,
  monatlich,
  neueFixId,
  normalisierePosten,
  normalisiereShard,
  postenAnzahlPruefen,
  postenArchivieren,
  postenLoeschen,
  postenPruefen,
  postenSetzen,
  postenWiederherstellen,
  shardAusText,
  shardFuer,
  shardLesen,
  shardText,
  summen,
  vertragStatus,
} from '../../src/domain/fixkosten.js';
import * as domain from '../../src/domain/index.js';

/** Ein gültiger Posten; `aenderung` überschreibt einzelne Felder. */
const posten = (aenderung = {}) => ({
  id: 'a1b2c3d4',
  name: 'Miete',
  cents: 105000,
  ungefaehr: false,
  intervall: 1,
  tag: '1',
  start: '2026-01',
  kategorie: 'wohnen',
  person: 'gemeinsam',
  ...aenderung,
});

const vertrag = (bis, verlaengerung, frist) => posten({ id: 'kfa00001', name: 'Kfz-Versicherung', cents: 5900, kategorie: 'versicherung', vertrag: { bis, verlaengerung, frist } });

/** Deterministische Zufallsquelle für Tests. */
function zufallsfolge(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('Konstanten', () => {
  test('Kategorien, Personen, Intervalle, Fristen, Verlängerung, Grenzen', () => {
    assert.deepEqual(
      FIX_KATEGORIEN.map((k) => k.id),
      ['wohnen', 'versicherung', 'mobilitaet', 'kommunikation', 'kind', 'freizeit', 'bank', 'sonstiges'],
    );
    assert.deepEqual(FIX_KATEGORIEN[0], { id: 'wohnen', emoji: '🏠', name: 'Wohnen & Energie' });
    assert.deepEqual(
      FIX_PERSONEN.map((p) => p.id),
      ['papa', 'mama', 'gemeinsam', 'kind'],
    );
    assert.deepEqual(
      FIX_INTERVALLE.map((i) => [i.monate, i.text]),
      [
        [1, 'monatlich'],
        [2, 'alle 2 Monate'],
        [3, 'alle 3 Monate'],
        [6, 'alle 6 Monate'],
        [12, 'jährlich'],
        [24, 'alle 2 Jahre'],
      ],
    );
    assert.deepEqual(
      FIX_FRISTEN.map((f) => f.id),
      ['2w', '1m', '2m', '3m', '6m'],
    );
    assert.deepEqual(FIX_VERLAENGERUNG, [0, 1, 3, 6, 12, 24, 36]);
    assert.equal(MAX_FIX_POSTEN, 100);
    assert.equal(FIX_SHARDS, 4);
    assert.equal(MAX_FIX_ZEICHEN, 6000);
    assert.ok(Object.isFrozen(FIX_KATEGORIEN) && Object.isFrozen(FIX_VORLAGEN));
  });

  test('domain/index.js bündelt die Fixkosten-Regeln', () => {
    for (const name of ['postenPruefen', 'postenSetzen', 'shardFuer', 'faelligIn', 'vertragStatus', 'summen']) assert.equal(typeof domain[name], 'function', name);
    assert.equal(domain.MAX_FIX_POSTEN, 100);
  });

  test('Vorlagen: alle aus der Spezifikation, gültige Werte, Fristen nur als Hinweis', () => {
    assert.deepEqual(
      FIX_VORLAGEN.map((v) => v.name),
      ['Miete', 'Strom', 'Fernwärme', 'ORF-Beitrag', 'Kfz-Versicherung', 'Krankenversicherung', 'Handy', 'Internet', 'Fitnessstudio', 'Streaming', 'Friseur', 'Lotto', 'Kontoführung'],
    );
    const kategorien = FIX_KATEGORIEN.map((k) => k.id);
    for (const v of FIX_VORLAGEN) {
      assert.ok(kategorien.includes(v.kategorie), v.name);
      assert.ok(FIX_INTERVALLE.some((i) => i.monate === v.intervall), v.name);
      assert.equal(typeof v.hint, 'string');
      assert.ok(v.hint.length > 0, v.name);
      if (v.vertrag) {
        assert.ok(FIX_FRISTEN.some((f) => f.id === v.vertrag.frist), v.name);
        assert.ok(FIX_VERLAENGERUNG.includes(v.vertrag.verlaengerung), v.name);
        assert.match(v.hint, /prüfen/, v.name);
      }
    }
    const vorlage = (name) => FIX_VORLAGEN.find((v) => v.name === name);
    assert.deepEqual(vorlage('Kfz-Versicherung').vertrag, { verlaengerung: 12, frist: '1m' });
    assert.equal(vorlage('Kfz-Versicherung').kategorie, 'versicherung');
    assert.equal(vorlage('Handy').vertrag.frist, '1m');
    assert.equal(vorlage('Fitnessstudio').vertrag.frist, '2m');
    assert.equal(vorlage('Strom').vertrag.frist, '2w');
    assert.equal(vorlage('Miete').vertrag.frist, '3m');
    assert.equal(vorlage('Krankenversicherung').vertrag.frist, '3m');
    for (const name of ['ORF-Beitrag', 'Friseur', 'Lotto', 'Streaming']) assert.equal(vorlage(name).vertrag, null, name);
  });
});

describe('Monatlicher Durchschnitt', () => {
  test('Betrag geteilt durch die Monate des Intervalls', () => {
    assert.equal(monatlich(posten({ cents: 5900, intervall: 1 })), 5900);
    assert.equal(monatlich(posten({ cents: 17800, intervall: 2 })), 8900);
    assert.equal(monatlich(posten({ cents: 18360, intervall: 12 })), 1530);
    assert.equal(monatlich(posten({ cents: 10000, intervall: 3 })), 3333); // gerundet auf ganze Cent
    assert.equal(monatlich(posten({ cents: 24000, intervall: 24 })), 1000);
  });
});

describe('Fällig', () => {
  test('Start 2026-10 alle 2 Monate → Oktober, Dezember, nicht November und nicht vor dem Start', () => {
    const p = posten({ intervall: 2, start: '2026-10', tag: '15' });
    assert.deepEqual(faelligIn(p, '2026-10'), { tag: 15 });
    assert.equal(faelligIn(p, '2026-11'), null);
    assert.deepEqual(faelligIn(p, '2026-12'), { tag: 15 });
    assert.deepEqual(faelligIn(p, '2027-02'), { tag: 15 });
    assert.equal(faelligIn(p, '2026-08'), null);
  });

  test('jährlich und alle 2 Jahre', () => {
    const orf = posten({ intervall: 12, start: '2025-10', tag: '28' });
    assert.deepEqual(faelligIn(orf, '2026-10'), { tag: 28 });
    assert.equal(faelligIn(orf, '2026-09'), null);
    const zwei = posten({ intervall: 24, start: '2025-03' });
    assert.equal(faelligIn(zwei, '2026-03'), null);
    assert.deepEqual(faelligIn(zwei, '2027-03'), { tag: 1 });
  });

  test('„letzter“ und 31 werden auf das Monatsende gekürzt (Februar 28/29)', () => {
    assert.deepEqual(faelligIn(posten({ tag: 'letzter' }), '2026-02'), { tag: 28 });
    assert.deepEqual(faelligIn(posten({ tag: 'letzter' }), '2028-02'), { tag: 29 });
    assert.deepEqual(faelligIn(posten({ tag: '31' }), '2026-02'), { tag: 28 });
    assert.deepEqual(faelligIn(posten({ tag: '31' }), '2026-04'), { tag: 30 });
    assert.deepEqual(faelligIn(posten({ tag: '30' }), '2026-02'), { tag: 28 });
    assert.deepEqual(faelligIn(posten({ tag: 'letzter' }), '2026-10'), { tag: 31 });
  });

  test('archiviert ab 2026-11-01 → ab November nicht mehr fällig; Zahlung vor dem Archivdatum zählt noch', () => {
    const p = posten({ archiv: '2026-11-01' });
    assert.deepEqual(faelligIn(p, '2026-10'), { tag: 1 });
    assert.equal(faelligIn(p, '2026-11'), null);
    assert.equal(faelligIn(p, '2026-12'), null);
    const spaet = posten({ tag: '5', archiv: '2026-11-20' });
    assert.deepEqual(faelligIn(spaet, '2026-11'), { tag: 5 });
    assert.equal(faelligIn(spaet, '2026-12'), null);
  });

  test('faelligeImMonat: nach Tag sortiert, ohne Archivierte', () => {
    const liste = [posten({ id: 'aaaa1', tag: '15' }), posten({ id: 'aaaa2', tag: '1' }), posten({ id: 'aaaa3', tag: '3', archiv: '2026-09-01' }), posten({ id: 'aaaa4', intervall: 2, start: '2026-09' })];
    assert.deepEqual(
      faelligeImMonat(liste, '2026-10').map((f) => [f.posten.id, f.tag]),
      [
        ['aaaa2', 1],
        ['aaaa1', 15],
      ],
    );
  });

  test('istAktiv: nicht archiviert oder Archivdatum erst in der Zukunft', () => {
    assert.equal(istAktiv(posten(), '2026-10-22'), true);
    assert.equal(istAktiv(posten({ archiv: '2026-10-22' }), '2026-10-22'), false);
    assert.equal(istAktiv(posten({ archiv: '2026-12-31' }), '2026-10-22'), true);
  });
});

describe('Kündigungsfrist', () => {
  test('bis 2025-12-31, verlängert 12, Frist 1 Monat → Ende 2026-12-31, kündbar 2026-11-30, Erinnerung 2026-10-30', () => {
    assert.deepEqual(vertragStatus(vertrag('2025-12-31', 12, '1m'), '2026-10-22'), {
      ende: '2026-12-31',
      kuendbarBis: '2026-11-30',
      erinnerung: '2026-10-30',
      beendet: false,
      tage: 39,
    });
  });

  test('mehrfach verlängert → nächste Kündigungsmöglichkeit in der Zukunft', () => {
    const s = vertragStatus(vertrag('2021-12-31', 12, '1m'), '2026-10-22');
    assert.equal(s.ende, '2026-12-31');
    assert.equal(s.kuendbarBis, '2026-11-30');
    const monatlich1 = vertragStatus(vertrag('2026-01-31', 1, '1m'), '2026-10-22');
    assert.equal(monatlich1.ende, '2026-11-30'); // Monatsende bleibt Monatsende
    assert.equal(monatlich1.kuendbarBis, '2026-10-30');
  });

  test('Kündigungsfrist schon vorbei → der Vertrag verlängert sich, die nächste Frist zählt', () => {
    const s = vertragStatus(vertrag('2026-12-31', 12, '1m'), '2026-12-05');
    assert.equal(s.ende, '2027-12-31');
    assert.equal(s.kuendbarBis, '2027-11-30');
    assert.equal(s.beendet, false);
  });

  test('Frist 2 Wochen = 14 Tage vor Ende; Erinnerung trotzdem 1 Monat vor „kündbar bis“', () => {
    const s = vertragStatus(vertrag('2026-12-31', 1, '2w'), '2026-10-22');
    assert.equal(s.ende, '2026-12-31');
    assert.equal(s.kuendbarBis, '2026-12-17');
    assert.equal(s.erinnerung, '2026-11-17');
  });

  test('kurze Monate: 31. minus 1 Monat → 28./29. Februar; 3 und 6 Monate', () => {
    assert.equal(vertragStatus(vertrag('2027-03-31', 0, '1m'), '2026-10-22').kuendbarBis, '2027-02-28');
    assert.equal(vertragStatus(vertrag('2028-03-31', 0, '1m'), '2026-10-22').kuendbarBis, '2028-02-29');
    assert.equal(vertragStatus(vertrag('2027-05-31', 0, '3m'), '2026-10-22').kuendbarBis, '2027-02-28');
    assert.equal(vertragStatus(vertrag('2027-06-30', 0, '6m'), '2026-10-22').kuendbarBis, '2026-12-30');
    assert.equal(vertragStatus(vertrag('2027-03-31', 0, '2m'), '2026-10-22').kuendbarBis, '2027-01-31');
  });

  test('Schaltjahr: verlängert vom 29.02. bleibt Monatsende (28.02.)', () => {
    assert.equal(vertragStatus(vertrag('2024-02-29', 12, '1m'), '2026-10-22').ende, '2027-02-28');
  });

  test('ohne Verlängerung und vorbei → beendet', () => {
    const s = vertragStatus(vertrag('2026-06-30', 0, '1m'), '2026-10-22');
    assert.equal(s.beendet, true);
    assert.equal(s.ende, '2026-06-30');
    const heuteEnde = vertragStatus(vertrag('2026-10-22', 0, '1m'), '2026-10-22');
    assert.equal(heuteEnde.beendet, false); // am letzten Tag läuft er noch
  });

  test('ohne Vertrag → null', () => {
    assert.equal(vertragStatus(posten(), '2026-10-22'), null);
  });

  test('kuendigungsfristen: nur aktive, laufende Verträge, nächste zuerst', () => {
    const a = { ...vertrag('2027-08-31', 12, '1m'), id: 'kfaa1' };
    const b = { ...vertrag('2026-12-31', 12, '1m'), id: 'kfab1' };
    const weg = { ...vertrag('2026-12-31', 12, '1m'), id: 'kfac1', archiv: '2026-10-01' };
    const aus = { ...vertrag('2026-01-31', 0, '1m'), id: 'kfad1' };
    const liste = kuendigungsfristen([a, posten(), b, weg, aus], '2026-10-22');
    assert.deepEqual(
      liste.map((x) => [x.posten.id, x.status.kuendbarBis]),
      [
        ['kfab1', '2026-11-30'],
        ['kfaa1', '2027-07-31'],
      ],
    );
  });
});

describe('Summen', () => {
  const liste = [
    posten({ id: 'p0001', cents: 105000, person: 'gemeinsam', kategorie: 'wohnen' }),
    posten({ id: 'p0002', cents: 17800, intervall: 2, start: '2026-09', person: 'gemeinsam', kategorie: 'wohnen' }),
    posten({ id: 'p0003', cents: 18360, intervall: 12, start: '2025-10', tag: '28', person: 'gemeinsam', kategorie: 'wohnen' }),
    posten({ id: 'p0004', cents: 5900, person: 'mama', kategorie: 'versicherung' }),
    posten({ id: 'p0005', cents: 2500, person: 'papa', kategorie: 'kommunikation' }),
    posten({ id: 'p0006', cents: 13700, person: 'kind', kategorie: 'versicherung' }),
    posten({ id: 'p0007', cents: 1499, person: 'gemeinsam', kategorie: 'freizeit', archiv: '2026-05-01' }),
  ];

  test('alle: Ø pro Monat, im Jahr, Anzahl, diesen Monat fällig, je Person und Kategorie', () => {
    const s = summen(liste, { jm: '2026-10', heute: '2026-10-22' });
    assert.equal(s.monatlich, 105000 + 8900 + 1530 + 5900 + 2500 + 13700);
    assert.equal(s.jaehrlich, (105000 + 5900 + 2500 + 13700) * 12 + 17800 * 6 + 18360);
    assert.equal(s.anzahl, 6);
    assert.equal(s.faellig, 105000 + 18360 + 5900 + 2500 + 13700); // Fernwärme (Sept., Nov.) nicht im Oktober
    assert.deepEqual(s.jePerson, { papa: 2500, mama: 5900, gemeinsam: 105000 + 8900 + 1530, kind: 13700 });
    assert.deepEqual(s.jeKategorie, { wohnen: 105000 + 8900 + 1530, versicherung: 5900 + 13700, kommunikation: 2500 });
  });

  test('gefiltert nach Person; je Person bleibt für die Filterknöpfe vollständig', () => {
    const s = summen(liste, { jm: '2026-10', heute: '2026-10-22', person: 'kind' });
    assert.equal(s.monatlich, 13700);
    assert.equal(s.anzahl, 1);
    assert.equal(s.faellig, 13700);
    assert.equal(s.jePerson.papa, 2500);
    assert.deepEqual(s.jeKategorie, { versicherung: 13700 });
  });

  test('archivierte zählen in früheren Monaten noch als fällig', () => {
    assert.equal(summen(liste, { jm: '2026-04', heute: '2026-10-22', person: 'gemeinsam' }).faellig, 105000 + 1499);
  });
});

describe('Prüfen und Normalisieren', () => {
  test('gültiger Posten → null; Felder werden bereinigt und in fester Reihenfolge geliefert', () => {
    assert.equal(postenPruefen(posten()), null);
    const n = normalisierePosten({ ...posten({ name: '  Kfz   Versicherung ', tag: 5, notiz: '  Polizze  123 ', ungefaehr: undefined }), extra: 1 });
    assert.deepEqual(Object.keys(n), ['id', 'name', 'cents', 'ungefaehr', 'intervall', 'tag', 'start', 'kategorie', 'person', 'notiz']);
    assert.equal(n.name, 'Kfz Versicherung');
    assert.equal(n.tag, '5');
    assert.equal(n.notiz, 'Polizze 123');
    assert.equal(n.ungefaehr, false);
    assert.equal(normalisierePosten(posten({ notiz: '   ' })).notiz, undefined);
  });

  test('Fehlermeldungen', () => {
    const fehler = (a) => postenPruefen(posten(a));
    assert.equal(fehler({ name: '  ' }), 'Bitte einen Namen eingeben.');
    assert.equal(fehler({ name: 'x'.repeat(41) }), 'Der Name darf höchstens 40 Zeichen haben.');
    assert.equal(fehler({ name: 'x'.repeat(40) }), null);
    assert.equal(fehler({ cents: 0 }), 'Bitte einen Betrag zwischen 0,01 € und 99.999,99 € eingeben.');
    assert.equal(fehler({ cents: -100 }), 'Bitte einen Betrag zwischen 0,01 € und 99.999,99 € eingeben.');
    assert.equal(fehler({ cents: 10_000_000 }), 'Bitte einen Betrag zwischen 0,01 € und 99.999,99 € eingeben.');
    assert.equal(fehler({ cents: 12.5 }), 'Bitte einen Betrag zwischen 0,01 € und 99.999,99 € eingeben.');
    assert.equal(fehler({ cents: 9_999_999 }), null);
    assert.equal(fehler({ intervall: 4 }), 'Bitte wählen, wie oft der Betrag fällig ist.');
    assert.equal(fehler({ tag: '32' }), 'Bitte einen Tag von 1 bis 31 oder „Monatsletzter“ wählen.');
    assert.equal(fehler({ tag: '0' }), 'Bitte einen Tag von 1 bis 31 oder „Monatsletzter“ wählen.');
    assert.equal(fehler({ start: '2026-13' }), 'Bitte den Monat der ersten Zahlung angeben.');
    assert.equal(fehler({ kategorie: 'urlaub' }), 'Bitte eine Kategorie wählen.');
    assert.equal(fehler({ person: 'oma' }), 'Bitte wählen, zu wem der Posten gehört.');
    assert.equal(fehler({ notiz: 'x'.repeat(81) }), 'Die Notiz darf höchstens 80 Zeichen haben.');
    assert.equal(fehler({ id: 'ABC!' }), 'Ungültige Kennung.');
    assert.equal(fehler({ archiv: '2026-02-30' }), 'Ungültiges Archivdatum.');
    assert.equal(fehler({ vertrag: { verlaengerung: 12, frist: '1m' } }), 'Bitte angeben, bis wann der Vertrag läuft.');
    assert.equal(fehler({ vertrag: { bis: '2026-12-31', verlaengerung: 5, frist: '1m' } }), 'Bitte wählen, um wie viel sich der Vertrag verlängert.');
    assert.equal(fehler({ vertrag: { bis: '2026-12-31', verlaengerung: 12 } }), 'Bitte eine Kündigungsfrist wählen.');
    assert.equal(fehler({ vertrag: { bis: '2026-12-31', verlaengerung: 12, frist: '1m' } }), null);
    assert.equal(fehler({ vertrag: null }), null);
    assert.equal(postenPruefen(null), 'Bitte einen Namen eingeben.');
  });

  test('Entwurf ohne Kennung ist gültig (der Speicher vergibt sie), normalisierePosten verlangt eine', () => {
    const { id: _ohne, ...entwurf } = posten();
    assert.equal(postenPruefen(entwurf), null);
    assert.equal(normalisierePosten(entwurf), null);
    assert.equal(normalisierePosten(posten({ cents: 0 })), null);
  });

  test('neueFixId: nur 0-9 und a-v, mit eingespeistem Zufall deterministisch', () => {
    const a = neueFixId(zufallsfolge(7));
    assert.match(a, /^[0-9a-v]{8}$/);
    assert.equal(neueFixId(zufallsfolge(7)), a);
    assert.notEqual(neueFixId(zufallsfolge(8)), a);
    assert.match(neueFixId(), /^[0-9a-v]{8}$/);
  });
});

describe('Teile (Shards)', () => {
  test('shardFuer: stabil, 0 … 3, ungefähr gleich verteilt', () => {
    assert.equal(shardFuer('a1b2c3d4'), shardFuer('a1b2c3d4'));
    const zufall = zufallsfolge(3);
    const zaehler = [0, 0, 0, 0];
    for (let i = 0; i < 400; i += 1) zaehler[shardFuer(neueFixId(zufall))] += 1;
    for (const n of zaehler) assert.ok(n >= 70 && n <= 130, `Verteilung ${zaehler}`);
    // fest: ändert sich der Hash, landen gespeicherte Posten im falschen Teil
    assert.deepEqual(['a1b2c3d4', 'kfa00001', 'handy001', 'strom001', 'vvvvvvvv'].map(shardFuer), [1, 0, 2, 3, 1]);
  });

  test('Text hin und zurück mit kurzen Schlüsseln; leer oder kaputt → leerer Teil', () => {
    const p = posten({ ungefaehr: true, notiz: 'Polizze', vertrag: { bis: '2026-12-31', verlaengerung: 12, frist: '1m' }, archiv: '2026-11-01' });
    const shard = postenSetzen(leererShard(), p);
    const text = shardText(shard);
    assert.deepEqual(JSON.parse(text), {
      v: 1,
      p: [{ i: 'a1b2c3d4', n: 'Miete', c: 105000, u: 1, m: 1, d: '1', s: '2026-01', k: 'wohnen', w: 'gemeinsam', r: { b: '2026-12-31', l: 12, f: '1m' }, t: 'Polizze', a: '2026-11-01' }],
    });
    assert.deepEqual(shardAusText(text), shard);
    assert.deepEqual(shardAusText(''), leererShard());
    assert.deepEqual(shardAusText(undefined), leererShard());
    assert.deepEqual(shardAusText('{kaputt'), leererShard());
    assert.deepEqual(shardAusText('{"v":2,"p":[]}'), leererShard());
    const ohneU = JSON.parse(shardText(postenSetzen(leererShard(), posten())));
    assert.equal('u' in ohneU.p[0], false); // false wird weggelassen
  });

  test('beim Lesen: ungültige und doppelte Posten fallen weg, der Rest bleibt', () => {
    const roh = { v: 1, p: [{ i: 'aaaa1', n: 'A', c: 100, m: 1, d: '1', s: '2026-01', k: 'wohnen', w: 'papa' }, { i: 'aaaa1', n: 'B', c: 200, m: 1, d: '1', s: '2026-01', k: 'wohnen', w: 'papa' }, { i: 'aaaa2', n: '', c: 100 }, 'quatsch'] };
    const shard = shardAusText(JSON.stringify(roh));
    assert.deepEqual(
      shard.posten.map((p) => [p.id, p.name]),
      [['aaaa1', 'A']],
    );
    assert.deepEqual(normalisiereShard(null), leererShard());
    assert.deepEqual(normalisiereShard({ v: 1, posten: [posten(), { kaputt: true }] }).posten, [posten()]);
  });

  test('Grenze: ein zu voller Teil wird mit klarer Meldung abgelehnt, das Original bleibt', () => {
    let shard = leererShard();
    let i = 0;
    const lang = (n) => posten({ id: `v${String(n).padStart(7, '0')}`, name: 'N'.repeat(40), notiz: 'Z'.repeat(80), vertrag: { bis: '2026-12-31', verlaengerung: 12, frist: '1m' } });
    for (;;) {
      try {
        shard = postenSetzen(shard, lang(i));
        i += 1;
      } catch (e) {
        assert.equal(e.message, 'Dieser Teil der Fixkosten ist voll. Bitte Notizen kürzen oder archivierte Posten endgültig löschen.');
        break;
      }
    }
    assert.ok(i >= 15, `nur ${i} Posten`);
    assert.equal(shard.posten.length, i);
    assert.ok(shardText(shard).length <= MAX_FIX_ZEICHEN);
    assert.throws(() => postenSetzen(shard, lang(999)), /Dieser Teil der Fixkosten ist voll/);
    assert.throws(() => shardText({ v: 1, posten: Array.from({ length: 40 }, (_, n) => lang(n)) }), /Dieser Teil der Fixkosten ist voll/); // harte Grenze beim Schreiben
  });

  test('postenAnzahlPruefen: höchstens 100 Posten insgesamt (archivierte mitgezählt); bestehender darf geändert werden', () => {
    const shards = [0, 1, 2, 3].map((nr) => ({ v: 1, posten: Array.from({ length: 25 }, (_, j) => posten({ id: `s${nr}${String(j).padStart(4, '0')}` })) }));
    assert.equal(postenAnzahlPruefen(shards, 'neu00001'), 'Höchstens 100 Fixkosten-Posten (mit Archiv). Bitte archivierte Posten endgültig löschen.');
    assert.equal(postenAnzahlPruefen(shards, 's1' + '0003'), null);
    assert.equal(postenAnzahlPruefen([leererShard(), null, leererShard(), leererShard()], 'neu00001'), null);
  });
});

describe('Änderungen: rein und wiederholbar', () => {
  test('postenSetzen: neu anhängen, gleiche Kennung ersetzt an derselben Stelle, zweimal = einmal', () => {
    const leer = leererShard();
    const a = postenSetzen(leer, posten({ id: 'aaaa1' }));
    assert.deepEqual(leer, leererShard()); // Argument unverändert
    const b = postenSetzen(a, posten({ id: 'bbbb1', name: 'Strom' }));
    const geaendert = postenSetzen(b, posten({ id: 'aaaa1', cents: 110000 }));
    assert.deepEqual(
      geaendert.posten.map((p) => [p.id, p.cents]),
      [
        ['aaaa1', 110000],
        ['bbbb1', 105000],
      ],
    );
    assert.deepEqual(postenSetzen(geaendert, posten({ id: 'aaaa1', cents: 110000 })), geaendert);
    assert.equal(postenSetzen(geaendert, posten({ id: 'aaaa1', cents: 110000 })), geaendert); // nichts geändert → dasselbe Objekt
    assert.throws(() => postenSetzen(leer, posten({ cents: 0 })), /Betrag zwischen/);
    assert.throws(() => postenSetzen(leer, posten({ id: undefined })), /Ungültige Kennung/);
  });

  test('Archivieren, Wiederherstellen, Löschen (nur aus dem Archiv); unbekannte Kennung ändert nichts', () => {
    const s = postenSetzen(leererShard(), posten({ id: 'aaaa1' }));
    const arch = postenArchivieren(s, 'aaaa1', '2026-11-01');
    assert.equal(arch.posten[0].archiv, '2026-11-01');
    assert.equal(s.posten[0].archiv, undefined);
    assert.equal(postenArchivieren(arch, 'aaaa1', '2026-11-01'), arch);
    assert.equal(postenArchivieren(arch, 'unbekannt', '2026-11-01'), arch);
    assert.throws(() => postenArchivieren(s, 'aaaa1', '2026-02-30'), /Ungültiges Archivdatum/);
    const zurueck = postenWiederherstellen(arch, 'aaaa1');
    assert.equal('archiv' in zurueck.posten[0], false);
    assert.equal(postenWiederherstellen(zurueck, 'aaaa1'), zurueck);
    assert.throws(() => postenLoeschen(s, 'aaaa1'), /Nur archivierte Posten lassen sich endgültig löschen\./);
    const weg = postenLoeschen(arch, 'aaaa1');
    assert.deepEqual(weg.posten, []);
    assert.equal(postenLoeschen(weg, 'aaaa1'), weg);
  });

  test('zwei Geräte ändern verschiedene Posten im selben Teil → beide bleiben (auf die neueste Fassung angewendet)', () => {
    const basis = postenSetzen(leererShard(), posten({ id: 'aaaa1' }));
    const geraetA = (s) => postenSetzen(s, posten({ id: 'bbbb1', name: 'Strom' }));
    const geraetB = (s) => postenArchivieren(s, 'aaaa1', '2026-11-01');
    const remote = geraetA(basis); // A war schneller
    const ergebnis = geraetB(remote); // B wendet seine Änderung nach 412 auf die neueste Fassung an
    assert.deepEqual(
      ergebnis.posten.map((p) => [p.id, p.archiv ?? null]),
      [
        ['aaaa1', '2026-11-01'],
        ['bbbb1', null],
      ],
    );
  });
});

describe('Beschädigte Teile lesen (nie werfen)', () => {
  const k = (aenderung = {}) => ({ i: 'aaaa1', n: 'Miete', c: 100, m: 1, d: '1', s: '2026-01', k: 'wohnen', w: 'papa', ...aenderung });
  const text = (...p) => JSON.stringify({ v: 1, p });

  test('Name oder Notiz als Objekt ohne toString → kein Fehler; ohne Namen fällt der Posten weg, die Notiz wird entfernt', () => {
    const t = text(k({ i: 'aaaa1', n: {} }), k({ i: 'aaaa2', n: { toString: 1 } }), k({ i: 'aaaa3', n: 'Strom', t: { toString: 1 } }), k({ i: 'aaaa4', n: 'Handy', t: 123 }));
    assert.doesNotThrow(() => shardAusText(t));
    const shard = shardAusText(t);
    assert.deepEqual(
      shard.posten.map((p) => [p.id, p.name, p.notiz ?? null]),
      [
        ['aaaa3', 'Strom', null],
        ['aaaa4', 'Handy', null],
      ],
    );
    const { warnungen } = shardLesen(t);
    assert.equal(warnungen.length, 3, warnungen.join(' | ')); // 2 Posten weg (eine Meldung), 2 Notizen entfernt
    assert.ok(warnungen.some((w) => w.includes('2 Fixkosten-Posten')), warnungen.join(' | '));
  });

  test('zu langer Name oder zu lange Notiz wird beim Lesen gekürzt (mit Warnung), der Posten bleibt', () => {
    const { shard, warnungen } = shardLesen(text(k({ n: `${'N'.repeat(39)}😀xyz`, t: 'Z'.repeat(100) })));
    assert.equal(shard.posten.length, 1);
    assert.equal(shard.posten[0].name, `${'N'.repeat(39)}😀`); // Zeichen, nicht UTF-16-Einheiten
    assert.equal(shard.posten[0].notiz, 'Z'.repeat(80));
    assert.equal(warnungen.length, 2);
  });

  test('gültiger Teil → keine Warnung; unlesbarer Teil → leer mit Warnung; fehlender Text → leer ohne Warnung', () => {
    assert.deepEqual(shardLesen(text(k())).warnungen, []);
    assert.deepEqual(shardLesen('{kaputt'), { shard: leererShard(), warnungen: ['Ein Teil der Fixkosten ist unlesbar (beschädigt oder von einer neueren App-Version); er wird leer gezeigt und lässt sich nicht ändern.'], unlesbar: true });
    assert.deepEqual(shardLesen('{"v":2,"p":[]}').shard, leererShard());
    assert.equal(shardLesen('{"v":2,"p":[]}').warnungen.length, 1);
    assert.deepEqual(shardLesen(''), { shard: leererShard(), warnungen: [] });
    assert.deepEqual(shardLesen(undefined), { shard: leererShard(), warnungen: [] });
  });

  test('Prüfen: Name muss Text sein; eine Notiz, die kein Text ist, zählt als keine Notiz', () => {
    assert.equal(postenPruefen(posten({ name: 123 })), 'Bitte einen Namen eingeben.');
    assert.equal(postenPruefen(posten({ name: {} })), 'Bitte einen Namen eingeben.');
    assert.doesNotThrow(() => postenPruefen(posten({ name: { toString: 1 } })));
    assert.equal(postenPruefen(posten({ notiz: { toString: 1 } })), null);
    assert.equal('notiz' in normalisierePosten(posten({ notiz: 42 })), false);
  });
});

describe('Voller Teil: Archivieren geht immer', () => {
  const lang = (n) => posten({ id: `v${String(n).padStart(7, '0')}`, name: 'N'.repeat(40), notiz: 'Z'.repeat(80), vertrag: { bis: '2026-12-31', verlaengerung: 12, frist: '1m' } });
  function voll() {
    let shard = leererShard();
    for (let i = 0; ; i += 1) {
      try {
        shard = postenSetzen(shard, lang(i));
      } catch (e) {
        assert.match(e.message, /Dieser Teil der Fixkosten ist voll/);
        return shard;
      }
    }
  }

  test('bis zum Rand gefüllt → jeder Posten lässt sich archivieren (bleibt ≤ 6000 Zeichen), danach löschen', () => {
    let shard = voll();
    const anzahl = shard.posten.length;
    for (const p of shard.posten) {
      shard = postenArchivieren(shard, p.id, '2026-11-01');
      assert.ok(shardText(shard).length <= MAX_FIX_ZEICHEN);
    }
    assert.ok(shard.posten.every((p) => p.archiv === '2026-11-01'));
    shard = postenLoeschen(shard, lang(0).id);
    assert.equal(shard.posten.length, anzahl - 1);
    shard = postenSetzen(shard, lang(0)); // Platz ist wieder frei
    assert.equal(shard.posten.length, anzahl);
  });

  test('Wiederherstellen eines archivierten Postens im vollen Teil klappt ebenfalls', () => {
    let shard = voll();
    shard = postenArchivieren(shard, lang(0).id, '2026-11-01');
    assert.throws(() => postenSetzen(shard, lang(9999)), /Dieser Teil der Fixkosten ist voll/); // die Reserve ist kein neuer Platz
    shard = postenWiederherstellen(shard, lang(0).id);
    assert.equal(shard.posten[0].archiv, undefined);
    assert.doesNotThrow(() => postenArchivieren(shard, lang(1).id, '2026-11-01'));
  });
});

describe('Vorwärts-Verträglichkeit: Unbekanntes bleibt erhalten, Unlesbares wird nicht überschrieben', () => {
  const k = (aenderung = {}) => ({ i: 'aaaa1', n: 'Miete', c: 100, m: 1, d: '1', s: '2026-01', k: 'wohnen', w: 'papa', ...aenderung });
  const text = (...p) => JSON.stringify({ v: 1, p });

  test('unlesbarer Teil (kaputtes JSON, andere Version, ohne Liste): leer gezeigt, als unlesbar markiert; leerer Text nicht', () => {
    for (const t of ['{kaputt', '{"v":2,"p":[]}', '{"v":1}', '[1,2]']) {
      const r = shardLesen(t);
      assert.equal(r.unlesbar, true, t);
      assert.deepEqual(r.shard, leererShard());
      assert.equal(r.warnungen.length, 1);
    }
    assert.equal(shardLesen('').unlesbar, undefined);
    assert.equal(shardLesen(text(k())).unlesbar, undefined);
  });

  test('Posten mit unbekannter Kategorie, unbekanntem Feld oder kaputt: nicht gezeigt, aber unverändert wieder geschrieben', () => {
    const neu = k({ i: 'bbbb1', k: 'haustier' });
    const feld = k({ i: 'cccc1', x: { neu: true } });
    const vertragFeld = k({ i: 'dddd1', r: { b: '2026-12-31', l: 12, f: '1m', z: 1 } });
    const kaputt = { i: 'eeee1', n: '', c: 100 };
    const { shard, warnungen } = shardLesen(text(k(), neu, feld, vertragFeld, kaputt, 'quatsch'));
    assert.deepEqual(shard.posten.map((p) => p.id), ['aaaa1']);
    assert.deepEqual(shard.fremd, [neu, feld, vertragFeld, kaputt, 'quatsch']);
    assert.equal(warnungen.length, 1);
    assert.ok(warnungen[0].startsWith('5 Fixkosten-Posten'), warnungen[0]);
    // den gültigen ändern: die fremden stehen danach unverändert im Text
    const geaendert = postenSetzen(shard, { ...shard.posten[0], cents: 200 });
    const p = JSON.parse(shardText(geaendert)).p;
    assert.deepEqual(p.slice(1), [neu, feld, vertragFeld, kaputt, 'quatsch']);
    assert.equal(p[0].c, 200);
    for (const s of [postenArchivieren(geaendert, 'aaaa1', '2026-11-01'), postenWiederherstellen(postenArchivieren(geaendert, 'aaaa1', '2026-11-01'), 'aaaa1'), postenLoeschen(postenArchivieren(geaendert, 'aaaa1', '2026-11-01'), 'aaaa1'), postenSetzen(geaendert, posten({ id: 'ffff1' }))]) {
      assert.deepEqual(s.fremd, shard.fremd);
    }
    // wieder gelesen: gleich
    assert.deepEqual(shardLesen(shardText(geaendert)).shard.fremd, shard.fremd);
    assert.deepEqual(normalisiereShard(geaendert), geaendert);
  });

  test('fremde Posten zählen bei der Höchstzahl mit, nicht in den Summen', () => {
    const fremd = Array.from({ length: MAX_FIX_POSTEN }, (_, i) => ({ i: `x${i}`, k: 'haustier' }));
    assert.match(postenAnzahlPruefen([{ v: 1, posten: [], fremd }, null, null, null], 'neu00001'), /Höchstens 100/);
    const { shard } = shardLesen(text(k(), k({ i: 'bbbb1', k: 'haustier', c: 999999 })));
    assert.equal(summen(shard.posten, { jm: '2026-10', heute: '2026-10-14' }).monatlich, 100);
  });
});
