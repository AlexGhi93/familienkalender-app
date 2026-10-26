// Merker der Bewegung im Schichtplan (Glas/Bento): Leiste federt herein, gemalter Streifen stempelt – mit eingespeister Uhr.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { merker, stempelt, PINSEL_REIN_MS, GEMALT_MS } from '../../src/ui/schicht-bewegung.js';

function uhr(start = 1000) {
  let t = start;
  return { jetzt: () => t, weiter: (ms) => (t += ms) };
}

describe('merker', () => {
  test('ohne Setzen: null', () => {
    const u = uhr();
    assert.equal(merker(600, u.jetzt).lesen(), null);
  });

  test('liefert die Daten und die vergangene Zeit, solange die Dauer läuft', () => {
    const u = uhr();
    const m = merker(600, u.jetzt);
    m.setzen({ datum: '2026-10-08', person: 'papa' });
    assert.deepEqual(m.lesen(), { datum: '2026-10-08', person: 'papa', vor: 0 });
    u.weiter(333);
    assert.deepEqual(m.lesen(), { datum: '2026-10-08', person: 'papa', vor: 333 });
    u.weiter(266);
    assert.equal(m.lesen().vor, 599);
  });

  test('nach der Dauer: null und vergessen (auch wenn die Uhr zurückginge)', () => {
    const u = uhr();
    const m = merker(600, u.jetzt);
    m.setzen({});
    u.weiter(600);
    assert.equal(m.lesen(), null);
    u.weiter(-500);
    assert.equal(m.lesen(), null);
  });

  test('löschen vergisst sofort; neu setzen beginnt von vorn', () => {
    const u = uhr();
    const m = merker(600, u.jetzt);
    m.setzen({ a: 1 });
    m.loeschen();
    assert.equal(m.lesen(), null);
    m.setzen({ a: 1 });
    u.weiter(400);
    m.setzen({ a: 2 });
    assert.deepEqual(m.lesen(), { a: 2, vor: 0 });
  });

  test('die Dauern decken die Animationen ab (Glas 0,55 s / 0,5 s, Bento 0,5 s / 0,42 s)', () => {
    assert.ok(PINSEL_REIN_MS >= 550);
    assert.ok(GEMALT_MS >= 500);
  });
});

describe('stempelt', () => {
  const g = { datum: '2026-10-08', person: 'papa', vorher: null, vor: 10 };
  const F = { k: 'f1', kuerzel: 'F' };

  test('der eben gemalte Streifen mit neuer Art stempelt', () => {
    assert.equal(stempelt(g, '2026-10-08', 'papa', F), true);
  });

  test('anderer Tag, andere Person, kein Merker: nein', () => {
    assert.equal(stempelt(g, '2026-10-09', 'papa', F), false);
    assert.equal(stempelt(g, '2026-10-08', 'mama', F), false);
    assert.equal(stempelt(null, '2026-10-08', 'papa', F), false);
  });

  test('frei (kein Streifen): nein', () => {
    assert.equal(stempelt(g, '2026-10-08', 'papa', null), false);
  });

  test('zurückgenommen (Speichern scheiterte, alte Art wieder da): nein', () => {
    assert.equal(stempelt({ ...g, vorher: 'f1' }, '2026-10-08', 'papa', F), false);
    assert.equal(stempelt({ ...g, vorher: 'm1' }, '2026-10-08', 'papa', F), true);
  });
});
