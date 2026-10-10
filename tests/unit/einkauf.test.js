// Einkaufsliste: hinzufügen (ohne Doppelte), abhaken, löschen, „Gekaufte entfernen“ mit Rückgängig, „Oft gekauft“, strenge Prüfung.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ARTIKEL,
  MAX_HAEUFIG,
  MAX_MENGE,
  MAX_TEXT,
  einkaufAusText,
  einkaufText,
  entfernen,
  erledigteEntfernen,
  haeufigeVorschlaege,
  hinzufuegen,
  leereListe,
  normalisiereListe,
  sortiert,
  umschalten,
  wiederherstellen,
} from '../../src/domain/einkauf.js';

const T0 = 1_760_000_000_000; // Millisekunden
const s = (ms) => Math.floor(ms / 1000);

function liste(...artikel) {
  return { v: 1, e: artikel.map(([i, t, g = 0, z = 1, m = '']) => ({ i, t, m, g, z })), h: {} };
}

describe('hinzufuegen', () => {
  test('neuer Artikel mit Menge und Zeitpunkt in Sekunden', () => {
    const l = hinzufuegen(leereListe(), { text: '  Milch ', menge: ' 2  L ' }, { jetzt: T0, id: 'a1' });
    assert.deepEqual(l.e, [{ i: 'a1', t: 'Milch', m: '2 L', g: 0, z: s(T0) }]);
  });

  test('derselbe Name (Groß/Klein egal) steht nur einmal da; neue Menge ersetzt die alte, leere behält sie', () => {
    let l = hinzufuegen(leereListe(), { text: 'Milch', menge: '1 L' }, { jetzt: T0, id: 'a1' });
    l = hinzufuegen(l, { text: 'milch', menge: '2 L' }, { jetzt: T0 + 5000, id: 'a2' });
    assert.deepEqual(l.e, [{ i: 'a1', t: 'Milch', m: '2 L', g: 0, z: s(T0) }]);
    l = hinzufuegen(l, { text: 'MILCH' }, { jetzt: T0 + 9000, id: 'a3' });
    assert.equal(l.e[0].m, '2 L');
  });

  test('ein abgehakter Artikel kommt zurück auf „offen“ (mit neuem Zeitpunkt)', () => {
    const l = hinzufuegen(liste(['a1', 'Brot', 1, 5]), { text: 'brot' }, { jetzt: T0, id: 'x' });
    assert.deepEqual(l.e, [{ i: 'a1', t: 'Brot', m: '', g: 0, z: s(T0) }]);
  });

  test('Prüfungen mit deutscher Meldung', () => {
    assert.throws(() => hinzufuegen(leereListe(), { text: '   ' }, { jetzt: T0, id: 'a' }), /Artikel eingeben/);
    assert.throws(() => hinzufuegen(leereListe(), { text: 'x'.repeat(MAX_TEXT + 1) }, { jetzt: T0, id: 'a' }), /zu lang/);
    assert.throws(() => hinzufuegen(leereListe(), { text: 'Milch', menge: 'x'.repeat(MAX_MENGE + 1) }, { jetzt: T0, id: 'a' }), /Menge ist zu lang/);
    const voll = liste(...Array.from({ length: MAX_ARTIKEL }, (_, i) => [`i${i}`, `Ding ${i}`]));
    assert.throws(() => hinzufuegen(voll, { text: 'Noch eins' }, { jetzt: T0, id: 'neu' }), /Liste ist voll/);
    // ein vorhandener Name geht auch bei voller Liste
    assert.equal(hinzufuegen(voll, { text: 'ding 3', menge: '2' }, { jetzt: T0, id: 'neu' }).e[3].m, '2');
  });

  test('zu langer Text für den Kalender wird abgelehnt', () => {
    const lang = liste(...Array.from({ length: 79 }, (_, i) => [`i${i}`, `${'x'.repeat(36)}${String(i).padStart(3, '0')}`]));
    assert.throws(() => hinzufuegen(lang, { text: 'y'.repeat(40), menge: 'z'.repeat(12) }, { jetzt: T0, id: 'neu' }), /Liste ist zu lang/);
    assert.throws(() => einkaufText({ v: 1, e: [], h: { x: 'y'.repeat(7000) } }), /zu lang/);
  });
});

describe('umschalten / entfernen', () => {
  test('abhaken und zurücknehmen; unbekannte Kennung ändert nichts', () => {
    const l = liste(['a1', 'Milch']);
    const an = umschalten(l, 'a1', T0);
    assert.deepEqual([an.e[0].g, an.e[0].z], [1, s(T0)]);
    assert.equal(umschalten(an, 'a1', T0 + 1000).e[0].g, 0);
    assert.equal(umschalten(l, 'zz', T0), l);
  });

  test('entfernen', () => {
    const l = liste(['a1', 'Milch'], ['a2', 'Brot']);
    assert.deepEqual(entfernen(l, 'a1').e.map((a) => a.i), ['a2']);
    assert.equal(entfernen(l, 'zz'), l);
  });
});

describe('Gekaufte entfernen und Rückgängig', () => {
  test('zählt für „Oft gekauft“ (gleicher Name, Groß/Klein egal) und lässt sich rückgängig machen', () => {
    const l = { ...liste(['a1', 'milch', 1], ['a2', 'Brot', 0], ['a3', 'Eier', 1]), h: { Milch: 2 } };
    const r = erledigteEntfernen(l);
    assert.deepEqual(r.liste.e.map((a) => a.i), ['a2']);
    assert.deepEqual(r.liste.h, { Milch: 3, Eier: 1 });
    assert.deepEqual(r.entfernt.map((a) => a.i), ['a1', 'a3']);
    assert.deepEqual(r.hVorher, { Milch: 2 });

    const zurueck = wiederherstellen(r.liste, r);
    assert.deepEqual(zurueck.e.map((a) => a.i), ['a2', 'a1', 'a3']);
    assert.deepEqual(zurueck.h, { Milch: 2 });
  });

  test('Rückgängig bringt nichts doppelt zurück (inzwischen neu eingetragen)', () => {
    const l = liste(['a1', 'Milch', 1]);
    const r = erledigteEntfernen(l);
    const neu = hinzufuegen(r.liste, { text: 'MILCH' }, { jetzt: T0, id: 'b1' });
    assert.deepEqual(wiederherstellen(neu, r).e.map((a) => a.i), ['b1']);
  });

  test('ohne Abgehakte ändert sich nichts', () => {
    const l = liste(['a1', 'Milch']);
    const r = erledigteEntfernen(l);
    assert.equal(r.liste, l);
    assert.deepEqual(r.entfernt, []);
  });
});

describe('Oft gekauft / Sortierung', () => {
  test('häufigste zuerst, bei Gleichstand alphabetisch, ohne was schon auf der Liste steht', () => {
    const l = { ...liste(['a1', 'joghurt']), h: { Joghurt: 9, Äpfel: 3, Eier: 3, Brot: 1 } };
    assert.deepEqual(haeufigeVorschlaege(l), ['Äpfel', 'Eier', 'Brot']);
    assert.deepEqual(haeufigeVorschlaege(l, 1), ['Äpfel']);
  });

  test('offen in Reihenfolge des Eintragens, gekauft mit dem zuletzt Abgehakten zuerst', () => {
    const l = liste(['a', 'A', 0, 30], ['b', 'B', 1, 10], ['c', 'C', 0, 20], ['d', 'D', 1, 40]);
    const { offen, gekauft } = sortiert(l);
    assert.deepEqual(offen.map((a) => a.i), ['c', 'a']);
    assert.deepEqual(gekauft.map((a) => a.i), ['d', 'b']);
  });
});

describe('normalisiereListe / einkaufAusText', () => {
  test('Unbrauchbares ergibt die leere Liste', () => {
    for (const roh of [null, [], 'x', { v: 2, e: [] }, { v: 1, e: {} }]) assert.deepEqual(normalisiereListe(roh), leereListe());
    assert.deepEqual(einkaufAusText('{kaputt'), leereListe());
    assert.deepEqual(einkaufAusText('   '), leereListe());
    assert.deepEqual(einkaufAusText(null), leereListe());
  });

  test('ungültige Artikel und Häufigkeiten werden einzeln verworfen', () => {
    const roh = {
      v: 1,
      e: [
        { i: 'a1', t: ' Milch ', m: ' 2 L ', g: 0, z: 5 },
        { i: 'a1', t: 'doppelt', m: '', g: 0, z: 5 },
        { i: 'a 2', t: 'Leerzeichen in Kennung', m: '', g: 0, z: 5 },
        { i: 'a3', t: '', m: '', g: 0, z: 5 },
        { i: 'a4', t: 'Brot', m: '', g: 2, z: 5 },
        { i: 'a5', t: 'Eier', m: '', g: 1, z: -1 },
        { i: 'a6', t: 'Käse', m: 'x'.repeat(13), g: 0, z: 1 },
        'Unsinn',
      ],
      h: { Milch: 2, ' ': 3, Brot: 0, Eier: 1.5, Käse: 1000, Butter: 4 },
    };
    assert.deepEqual(normalisiereListe(roh), { v: 1, e: [{ i: 'a1', t: 'Milch', m: '2 L', g: 0, z: 5 }], h: { Milch: 2, Butter: 4 } });
  });

  test('höchstens MAX_ARTIKEL Artikel und MAX_HAEUFIG Häufigkeiten (die häufigsten, bei Gleichstand die neueren)', () => {
    const h = Object.fromEntries(Array.from({ length: MAX_HAEUFIG + 5 }, (_, i) => [`Ding ${i}`, i < 5 ? 9 : 1]));
    const n = normalisiereListe({ v: 1, e: Array.from({ length: MAX_ARTIKEL + 3 }, (_, i) => ({ i: `i${i}`, t: `T${i}`, m: '', g: 0, z: i })), h });
    assert.equal(n.e.length, MAX_ARTIKEL);
    assert.equal(Object.keys(n.h).length, MAX_HAEUFIG);
    for (let i = 0; i < 5; i += 1) assert.ok(`Ding ${i}` in n.h);
    assert.equal('Ding 5' in n.h, false); // ältester mit Anzahl 1 fliegt zuerst
    assert.ok(`Ding ${MAX_HAEUFIG + 4}` in n.h);
  });

  test('einkaufText / einkaufAusText hin und zurück', () => {
    const l = { ...liste(['a1', 'Milch', 1, 7, '2 L']), h: { Milch: 3 } };
    assert.deepEqual(einkaufAusText(einkaufText(l)), l);
  });
});
