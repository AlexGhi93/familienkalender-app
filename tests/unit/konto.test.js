// Kontostand: ganze Cent, Eintragen nur am letzten Tag (außer Demo/Nachtragen), Sonderbeträge und Ersparnis „ohne Extra“.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CENTS,
  MAX_EXTRAS,
  MAX_MONATE,
  betragText,
  centsAusText,
  deltaText,
  eintragbarerMonat,
  entferneExtra,
  entferneStand,
  fehlendePersonen,
  fuegeExtraHinzu,
  kontoAusText,
  kontoText,
  kontoVerlauf,
  kontoVerlaufMitExtra,
  kontoZusammenfassung,
  kontoZusammenfassungMitExtra,
  leeresKonto,
  letzterTag,
  monatVor,
  nachtragMonate,
  normalisiereKonto,
  setzeStand,
} from '../../src/domain/konto.js';

const konto = (papa = {}, mama = {}, x = []) => ({ v: 1, p: { papa, mama }, x });

describe('Monate', () => {
  test('letzterTag (auch Schaltjahre)', () => {
    assert.equal(letzterTag('2024-02'), '2024-02-29');
    assert.equal(letzterTag('2026-02'), '2026-02-28');
    assert.equal(letzterTag('2026-10'), '2026-10-31');
    assert.equal(letzterTag('2026-11'), '2026-11-30');
    assert.throws(() => letzterTag('2026-13'), /Ungültiger Monat/);
  });

  test('monatVor rückwärts und vorwärts über Jahresgrenzen', () => {
    assert.equal(monatVor('2026-01-15', 1), '2025-12');
    assert.equal(monatVor('2026-03', 14), '2025-01');
    assert.equal(monatVor('2026-03', -10), '2027-01');
    assert.equal(monatVor('2026-03', 0), '2026-03');
  });

  test('nachtragMonate: die 24 Monate vor dem laufenden, neueste zuerst', () => {
    const m = nachtragMonate('2026-10-10');
    assert.equal(m.length, 24);
    assert.equal(m[0], '2026-09');
    assert.equal(m.at(-1), '2024-10');
  });

  test('eintragbarerMonat nur am letzten Tag', () => {
    assert.equal(eintragbarerMonat('2026-10-31'), '2026-10');
    assert.equal(eintragbarerMonat('2026-10-30'), null);
    assert.equal(eintragbarerMonat('2028-02-29'), '2028-02');
    assert.equal(eintragbarerMonat('Quatsch'), null);
  });
});

describe('Beträge lesen und anzeigen', () => {
  const faelle = [
    ['1.234,56', 123456],
    ['20.711', 2071100],
    ['20711', 2071100],
    ['1234.56', 123456],
    ['1.23', 123],
    ['12,5', 1250],
    ['1.234.567,89', 123456789],
    ['20 711 €', 2071100],
    ['20.711,50€', 2071150],
    ['-350', -35000],
    ['−350', -35000],
    ['–5', -500],
    ['+5', 500],
    ['-0', 0],
    ['9999999,99', MAX_CENTS],
    ['10000000', null],
    ['1,234', null],
    ['1.2345', null],
    ['12,345', null],
    ['abc', null],
    ['', null],
    ['--5', null],
  ];
  for (const [text, cents] of faelle) {
    test(`centsAusText(${JSON.stringify(text)}) = ${cents}`, () => {
      assert.equal(centsAusText(text), cents);
    });
  }

  test('centsAusText ohne Text', () => {
    assert.equal(centsAusText(null), null);
    assert.equal(centsAusText(1234), null);
    assert.ok(Object.is(centsAusText('-0'), 0)); // keine negative Null
  });

  test('betragText / deltaText', () => {
    assert.equal(betragText(2071100), '20.711 €');
    assert.equal(betragText(12345), '123,45 €');
    assert.equal(betragText(-35000), '−350 €');
    assert.equal(betragText(5), '0,05 €');
    assert.equal(betragText(0), '0 €');
    assert.equal(betragText(123456789), '1.234.567,89 €');
    assert.equal(deltaText(0), '±0 €');
    assert.equal(deltaText(100000), '+1.000 €');
    assert.equal(deltaText(-25050), '−250,50 €');
  });
});

describe('Konto prüfen und speichern', () => {
  test('Unbrauchbares ergibt das leere Konto', () => {
    for (const roh of [null, [], 'x', { v: 2, p: {} }, { v: 1 }, { v: 1, p: [] }]) assert.deepEqual(normalisiereKonto(roh), leeresKonto());
  });

  test('ungültige Monate, Beträge und Sonderbeträge werden einzeln verworfen', () => {
    const roh = {
      v: 1,
      p: { papa: { '2026-09': 100, '2026-13': 5, '2026-08': 1.5, '2026-07': MAX_CENTS + 1, '2026-06': '7' }, mama: 'kaputt' },
      x: [
        { i: 'abcd', p: 'papa', m: '2026-09', c: 500, t: '  Bonus  ' },
        { i: 'abcd', p: 'papa', m: '2026-09', c: 600, t: 'doppelt' },
        { i: 'ab', p: 'papa', m: '2026-09', c: 500, t: 'Kennung zu kurz' },
        { i: 'efgh', p: 'oma', m: '2026-09', c: 500, t: 'Person' },
        { i: 'ijkl', p: 'mama', m: '2026-09', c: 0, t: 'Null' },
        { i: 'mnop', p: 'mama', m: '2026-09', c: 5, t: 'x'.repeat(31) },
        { i: 'qrst', p: 'mama', m: '2026-09', c: 5, t: '  ' },
        null,
      ],
    };
    assert.deepEqual(normalisiereKonto(roh), konto({ '2026-09': 100 }, {}, [{ i: 'abcd', p: 'papa', m: '2026-09', c: 500, t: 'Bonus' }]));
  });

  test('höchstens MAX_MONATE je Person (die neuesten bleiben) und MAX_EXTRAS Sonderbeträge', () => {
    const viele = Object.fromEntries(Array.from({ length: MAX_MONATE + 4 }, (_, i) => [monatVor('2030-01', i), i]));
    const n = normalisiereKonto({ v: 1, p: { papa: viele, mama: {} }, x: Array.from({ length: MAX_EXTRAS + 5 }, (_, i) => ({ i: `id${String(i).padStart(3, '0')}`, p: 'papa', m: '2026-01', c: 1, t: 'x' })) });
    assert.equal(Object.keys(n.p.papa).length, MAX_MONATE);
    assert.ok('2030-01' in n.p.papa);
    assert.equal(n.x.length, MAX_EXTRAS);
  });

  test('kontoText / kontoAusText hin und zurück; kaputtes JSON ergibt das leere Konto', () => {
    const k = konto({ '2026-09': 2071100 }, { '2026-09': -500 }, [{ i: 'abcd', p: 'mama', m: '2026-09', c: -45000, t: 'Auto' }]);
    assert.deepEqual(kontoAusText(kontoText(k)), k);
    assert.deepEqual(kontoAusText('{kaputt'), leeresKonto());
    assert.deepEqual(kontoAusText(''), leeresKonto());
    assert.deepEqual(kontoAusText(undefined), leeresKonto());
  });
});

describe('setzeStand', () => {
  const heute = '2026-10-31';

  test('am letzten Tag des Monats; das alte Konto bleibt unverändert', () => {
    const alt = leeresKonto();
    const neu = setzeStand(alt, { person: 'papa', monat: '2026-10', cents: 100 }, { heute });
    assert.deepEqual(neu.p.papa, { '2026-10': 100 });
    assert.deepEqual(alt.p.papa, {});
  });

  test('sonst nur in der Demo oder als Nachtrag', () => {
    const mitte = { heute: '2026-10-15' };
    assert.throws(() => setzeStand(leeresKonto(), { person: 'papa', monat: '2026-10', cents: 1 }, mitte), /nur am letzten Tag/);
    assert.deepEqual(setzeStand(leeresKonto(), { person: 'papa', monat: '2026-10', cents: 1 }, { ...mitte, demo: true }).p.papa, { '2026-10': 1 });
    assert.deepEqual(setzeStand(leeresKonto(), { person: 'mama', monat: '2026-09', cents: 1 }, { ...mitte, nachtrag: true }).p.mama, { '2026-09': 1 });
    assert.throws(() => setzeStand(leeresKonto(), { person: 'mama', monat: '2026-10', cents: 1 }, { ...mitte, nachtrag: true }), /laufende Monat/);
    assert.throws(() => setzeStand(leeresKonto(), { person: 'mama', monat: '2024-09', cents: 1 }, { ...mitte, nachtrag: true }), /letzten 24 Monate/);
    assert.deepEqual(setzeStand(leeresKonto(), { person: 'mama', monat: '2024-10', cents: 1 }, { ...mitte, nachtrag: true }).p.mama, { '2024-10': 1 });
  });

  test('ein vorhandener Stand darf jederzeit korrigiert werden', () => {
    const k = konto({ '2026-09': 100 });
    assert.deepEqual(setzeStand(k, { person: 'papa', monat: '2026-09', cents: 200 }, { heute: '2026-10-15' }).p.papa, { '2026-09': 200 });
  });

  test('Prüfungen', () => {
    const k = leeresKonto();
    assert.throws(() => setzeStand(k, { person: 'oma', monat: '2026-10', cents: 1 }, { heute }), /Ungültige Person/);
    assert.throws(() => setzeStand(k, { person: 'papa', monat: '2026-1', cents: 1 }, { heute }), /Ungültiger Monat/);
    assert.throws(() => setzeStand(k, { person: 'papa', monat: '2026-11', cents: 1 }, { heute }), /noch nicht begonnen/);
    assert.throws(() => setzeStand(k, { person: 'papa', monat: '2026-10', cents: 1.5 }, { heute }), /Betrag ist ungültig/);
    assert.throws(() => setzeStand(k, { person: 'papa', monat: '2026-10', cents: MAX_CENTS + 1 }, { heute }), /Betrag ist ungültig/);
    const voll = konto(Object.fromEntries(Array.from({ length: MAX_MONATE }, (_, i) => [monatVor('2026-09', i), 1])));
    assert.throws(() => setzeStand(voll, { person: 'papa', monat: '2026-10', cents: 1 }, { heute }), /Höchstens 96 Monate/);
  });
});

describe('entferneStand / Sonderbeträge', () => {
  test('entferneStand löscht genau einen Eintrag und ist wiederholbar', () => {
    const k = konto({ '2026-08': 1, '2026-09': 2 }, { '2026-09': 3 });
    const neu = entferneStand(k, { person: 'papa', monat: '2026-09' });
    assert.deepEqual(neu, konto({ '2026-08': 1 }, { '2026-09': 3 }));
    assert.equal(entferneStand(neu, { person: 'papa', monat: '2026-09' }), neu);
    assert.throws(() => entferneStand(k, { person: 'x', monat: '2026-09' }), /Ungültige Person/);
  });

  test('fuegeExtraHinzu: Prüfungen, gleiche Kennung ergibt keinen zweiten Eintrag', () => {
    const heute = '2026-10-15';
    const e = { person: 'mama', monat: '2026-10', cents: 200000, text: ' Weihnachtsgeld ', id: 'abcd1234' };
    const k = fuegeExtraHinzu(leeresKonto(), e, { heute });
    assert.deepEqual(k.x, [{ i: 'abcd1234', p: 'mama', m: '2026-10', c: 200000, t: 'Weihnachtsgeld' }]);
    assert.equal(fuegeExtraHinzu(k, e, { heute }), k);
    assert.throws(() => fuegeExtraHinzu(k, { ...e, cents: 0, id: 'neu12345' }, { heute }), /nicht 0/);
    assert.throws(() => fuegeExtraHinzu(k, { ...e, text: ' ', id: 'neu12345' }, { heute }), /Bezeichnung eingeben/);
    assert.throws(() => fuegeExtraHinzu(k, { ...e, text: 'x'.repeat(31), id: 'neu12345' }, { heute }), /zu lang/);
    assert.throws(() => fuegeExtraHinzu(k, { ...e, id: 'a!' }, { heute }), /Kennung/);
    assert.throws(() => fuegeExtraHinzu(k, { ...e, monat: '2026-11', id: 'neu12345' }, { heute }), /noch nicht begonnen/);
    const voll = { ...k, x: Array.from({ length: MAX_EXTRAS }, (_, i) => ({ i: `id${String(i).padStart(3, '0')}`, p: 'papa', m: '2026-01', c: 1, t: 'x' })) };
    assert.throws(() => fuegeExtraHinzu(voll, { ...e, id: 'neu12345' }, { heute }), /Höchstens 40/);
  });

  test('entferneExtra / fehlendePersonen', () => {
    const k = konto({ '2026-10': 1 }, {}, [{ i: 'abcd', p: 'papa', m: '2026-10', c: 5, t: 'x' }]);
    assert.deepEqual(entferneExtra(k, 'abcd').x, []);
    assert.equal(entferneExtra(k, 'zzzz'), k);
    assert.deepEqual(fehlendePersonen(k, '2026-10'), ['mama']);
    assert.deepEqual(fehlendePersonen(k, '2026-09'), ['papa', 'mama']);
  });
});

describe('Verlauf und Zusammenfassung', () => {
  const k = konto({ '2026-07': 100000, '2026-08': 150000, '2026-10': 120000 }, { '2026-07': 50000, '2026-08': 60000, '2026-10': 70000 });

  test('Veränderung je Person, „seit“ bei Lücke, Startwert', () => {
    const v = kontoVerlauf(k);
    assert.deepEqual(v.map((z) => z.monat), ['2026-10', '2026-08', '2026-07']);
    assert.deepEqual(v[0].papa, { stand: 120000, delta: -30000, seit: '2026-08', start: false });
    assert.deepEqual(v[1].papa, { stand: 150000, delta: 50000, seit: null, start: false });
    assert.deepEqual(v[2].papa, { stand: 100000, delta: null, seit: null, start: true });
    assert.deepEqual(v[1].zusammen, { stand: 210000, delta: 60000 });
    assert.deepEqual(v[2].zusammen, { stand: 150000, delta: null });
  });

  test('„Zusammen“ nur bei gleicher Basis', () => {
    const v = kontoVerlauf(konto({ '2026-07': 1, '2026-09': 5 }, { '2026-08': 1, '2026-09': 2 }));
    assert.deepEqual(v[0].zusammen, { stand: 7, delta: null });
    assert.equal(kontoVerlauf(konto({ '2026-09': 1 }, {}))[0].zusammen, null);
  });

  test('kontoZusammenfassung', () => {
    assert.deepEqual(kontoZusammenfassung(kontoVerlauf(k)), { seitBeginn: 40000, monate: 2, imPlus: 1, durchschnitt: 20000 });
    assert.deepEqual(kontoZusammenfassung([]), { seitBeginn: 0, monate: 0, imPlus: 0, durchschnitt: null });
  });

  test('Sonderbeträge werden aus der Veränderung herausgerechnet', () => {
    const mitExtra = { ...k, x: [{ i: 'abcd', p: 'papa', m: '2026-09', c: 100000, t: 'Bonus' }, { i: 'efgh', p: 'mama', m: '2026-08', c: -5000, t: 'Reparatur' }, { i: 'ijkl', p: 'papa', m: '2026-07', c: 7, t: 'Startmonat' }] };
    const v = kontoVerlaufMitExtra(mitExtra);
    // Oktober: Papa −300 € seit August, darin der Bonus vom September (+1.000 €) → ohne Extra −1.300 €
    assert.equal(v[0].papa.extra, 100000);
    assert.equal(v[0].papa.ohneExtra, -130000);
    assert.deepEqual(v[0].papa.extras.map((e) => e.t), ['Bonus']);
    assert.equal(v[0].zusammen.extra, 100000);
    assert.equal(v[0].zusammen.delta, -20000);
    assert.equal(v[0].zusammen.ohneExtra, -120000);
    // August: Mama +100 € mit −50 € Reparatur → ohne Extra +150 €
    assert.equal(v[1].mama.ohneExtra, 15000);
    assert.deepEqual([v[1].zusammen.extra, v[1].zusammen.ohneExtra], [-5000, 65000]);
    // Startmonat: keine Veränderung, Sonderbetrag dort zählt nicht
    assert.deepEqual(v[2].papa, { stand: 100000, delta: null, seit: null, start: true, extras: [], extra: 0, ohneExtra: null });
    assert.deepEqual(v[2].zusammen.ohneExtra, null);
  });

  test('kontoZusammenfassungMitExtra', () => {
    const mitExtra = { ...k, x: [{ i: 'abcd', p: 'papa', m: '2026-08', c: 60000, t: 'Bonus' }] };
    const s = kontoZusammenfassungMitExtra(kontoVerlaufMitExtra(mitExtra));
    assert.equal(s.seitBeginn, 40000);
    assert.equal(s.seitBeginnOhne, -20000);
    assert.equal(s.imPlusOhne, 0);
    assert.equal(s.durchschnittOhne, -10000);
  });
});
