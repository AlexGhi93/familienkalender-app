// Sachen für Krabbelstube/Kindergarten als Serie: gültige Betreuungstage, Verschieben, Überspringen, Zusammenfassung.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SERIEN_WOCHEN, kitaTagStatus, naechsterKitaTag, naechsterWochentag, serieZusammenfassung, wochenSerie } from '../../src/app/serie.js';
import { zustand } from './hilfen.js';

const state = zustand({
  urlaub: [{ id: 'u1', start: '2026-11-02', end: '2026-11-06' }],
  tage: { '2026-10-21': { typ: 'schliess' }, '2026-10-20': { typ: 'krank' } },
  settings: { erwartung: [0, 1, 2, 3] }, // freitags nicht
});

describe('kitaTagStatus', () => {
  const faelle = [
    ['2026-10-19', { ok: true }],
    ['2026-10-20', { ok: true }], // krank ändert nichts daran, dass man etwas bringen kann
    ['2026-10-17', { ok: false, grund: 'Wochenende' }],
    ['2026-10-26', { ok: false, grund: 'Feiertag' }],
    ['2026-11-03', { ok: false, grund: 'Urlaub' }],
    ['2026-10-21', { ok: false, grund: 'Schließtag' }],
    ['2026-10-23', { ok: false, grund: 'kein Betreuungstag' }],
  ];
  for (const [datum, erwartet] of faelle) {
    test(`${datum} → ${erwartet.grund ?? 'ok'}`, () => assert.deepEqual(kitaTagStatus(state, datum), erwartet));
  }
});

describe('nächste Tage', () => {
  test('naechsterKitaTag: strikt danach, überspringt alles Ungültige', () => {
    assert.equal(naechsterKitaTag(state, '2026-10-19'), '2026-10-20');
    assert.equal(naechsterKitaTag(state, '2026-10-22'), '2026-10-27'); // Fr kein Tag, Wochenende, Mo Feiertag
    assert.equal(naechsterKitaTag(state, '2026-10-30'), '2026-11-09'); // Urlaub
  });

  test('naechsterKitaTag wirft ohne Betreuungstage', () => {
    assert.throws(() => naechsterKitaTag(zustand({ settings: { erwartung: [] } }), '2026-10-19'), /Kein Betreuungstag/);
  });

  test('naechsterWochentag: strikt danach', () => {
    assert.equal(naechsterWochentag('2026-10-14', 2), '2026-10-21');
    assert.equal(naechsterWochentag('2026-10-14', 0), '2026-10-19');
    assert.equal(naechsterWochentag('2026-10-14', 4), '2026-10-16');
  });
});

describe('wochenSerie', () => {
  test('Hinbringen rutscht nach vorne, Heimholen nach hinten (innerhalb der Woche)', () => {
    const hin = wochenSerie(state, { start: '2026-10-19', wochen: 2, richtung: 'hin' });
    assert.deepEqual(hin.eintraege, [{ date: '2026-10-19' }, { date: '2026-10-27', verschobenVon: '2026-10-26', grund: 'Feiertag' }]);
    const heim = wochenSerie(state, { start: '2026-10-22', wochen: 1, richtung: 'heim' });
    assert.deepEqual(heim.eintraege, [{ date: '2026-10-22' }]);
    const heimMi = wochenSerie(state, { start: '2026-10-21', wochen: 1, richtung: 'heim' });
    assert.deepEqual(heimMi.eintraege, [{ date: '2026-10-20', verschobenVon: '2026-10-21', grund: 'Schließtag' }]);
  });

  test('ganze Woche im Urlaub oder in der Vergangenheit wird übersprungen', () => {
    const r = wochenSerie(state, { start: '2026-10-26', wochen: 3, richtung: 'hin', heute: '2026-10-28' });
    assert.deepEqual(r.uebersprungen, [{ date: '2026-10-26', grund: 'in der Vergangenheit' }, { date: '2026-11-02', grund: 'Urlaub' }]);
    assert.deepEqual(r.eintraege, [{ date: '2026-11-09' }]);
  });

  test('Heimholen springt nie vor heute zurück', () => {
    const r = wochenSerie(state, { start: '2026-10-22', wochen: 1, richtung: 'heim', heute: '2026-10-22' });
    assert.deepEqual(r.eintraege, [{ date: '2026-10-22' }]);
    const davor = wochenSerie(zustand({ tage: { '2026-10-22': { typ: 'schliess' } } }), { start: '2026-10-22', wochen: 1, richtung: 'heim', heute: '2026-10-22' });
    assert.deepEqual(davor, { eintraege: [], uebersprungen: [{ date: '2026-10-22', grund: 'Schließtag' }] });
  });

  test('Prüfungen', () => {
    for (const wochen of [0, MAX_SERIEN_WOCHEN + 1, 1.5, '2']) {
      assert.throws(() => wochenSerie(state, { start: '2026-10-19', wochen, richtung: 'hin' }), /Wochen: bitte 1 bis 26/);
    }
    assert.throws(() => wochenSerie(state, { start: '2026-10-19', wochen: 1, richtung: 'weg' }), /Unbekannte Richtung/);
  });
});

describe('serieZusammenfassung', () => {
  test('Einzahl, Mehrzahl, verschoben, Gründe gezählt', () => {
    assert.equal(serieZusammenfassung({ eintraege: [{ date: 'a' }], uebersprungen: [] }), '1 Erinnerung');
    assert.equal(
      serieZusammenfassung({
        eintraege: [{ date: 'a' }, { date: 'b', verschobenVon: 'x' }, { date: 'c' }],
        uebersprungen: [{ grund: 'Urlaub' }, { grund: 'Feiertag' }, { grund: 'Urlaub' }],
      }),
      '3 Erinnerungen · 1 verschoben · 3 übersprungen (Urlaub ×2, Feiertag)',
    );
    assert.equal(serieZusammenfassung({ eintraege: [], uebersprungen: [{ grund: 'Urlaub' }] }), '0 Erinnerungen · 1 übersprungen (Urlaub)');
  });
});
