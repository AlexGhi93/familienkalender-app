// Blätter nach unten wischen: reine Entscheidungen (ohne DOM) – wann ein Zug das Blatt schließt und welche Richtung ein Zug hat.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHLIESSEN_AB_PX, TOTZONE_PX, sollSchliessen, ziehRichtung } from '../../src/ui/blatt-ziehen.js';

describe('sollSchliessen', () => {
  test('weit genug gezogen (ab 100 px) schließt, egal wie langsam', () => {
    assert.equal(SCHLIESSEN_AB_PX, 100);
    assert.equal(sollSchliessen({ dy: 150, dt: 900 }), true);
    assert.equal(sollSchliessen({ dy: 100, dt: 3000 }), true);
    assert.equal(sollSchliessen({ dy: 99, dt: 3000 }), false);
  });

  test('langsam und kurz gezogen bleibt offen', () => {
    assert.equal(sollSchliessen({ dy: 40, dt: 500 }), false);
    assert.equal(sollSchliessen({ dy: 80, dt: 600 }), false);
  });

  test('kurz und schnell nach unten geworfen schließt', () => {
    assert.equal(sollSchliessen({ dy: 50, dt: 120 }), true);
    assert.equal(sollSchliessen({ dy: 35, dt: 60 }), true);
    assert.equal(sollSchliessen({ dy: 50, dt: 0 }), true); // alles in einem Ereignis
  });

  test('ein schneller, aber winziger Ruck (unter 30 px) schließt nicht', () => {
    assert.equal(sollSchliessen({ dy: 20, dt: 20 }), false);
    assert.equal(sollSchliessen({ dy: 29, dt: 10 }), false);
  });

  test('zählt nur der letzte Wurf: erst langsam, am Ende kaum Bewegung → offen; erst langsam, dann geworfen → zu', () => {
    assert.equal(sollSchliessen({ dy: 80, dt: 100, wurf: 10 }), false);
    assert.equal(sollSchliessen({ dy: 70, dt: 100, wurf: 45 }), true);
    assert.equal(sollSchliessen({ dy: 70, dt: 400, wurf: 45 }), false);
  });

  test('nach oben oder gar nicht gezogen schließt nie', () => {
    assert.equal(sollSchliessen({ dy: 0, dt: 0 }), false);
    assert.equal(sollSchliessen({ dy: -150, dt: 50 }), false);
    assert.equal(sollSchliessen({ dy: Number.NaN, dt: 50 }), false);
  });
});

describe('ziehRichtung', () => {
  test('innerhalb der kleinen Totzone noch keine Richtung (Tippen bleibt Tippen)', () => {
    assert.ok(TOTZONE_PX >= 6 && TOTZONE_PX <= 12);
    assert.equal(ziehRichtung({ dx: 0, dy: 0 }), null);
    assert.equal(ziehRichtung({ dx: 3, dy: 4 }), null);
  });

  test('vor allem nach unten → runter, nach oben → hoch, sonst seitlich', () => {
    assert.equal(ziehRichtung({ dx: 2, dy: 12 }), 'runter');
    assert.equal(ziehRichtung({ dx: -5, dy: 9 }), 'runter');
    assert.equal(ziehRichtung({ dx: 1, dy: -12 }), 'hoch');
    assert.equal(ziehRichtung({ dx: 14, dy: 6 }), 'seitlich');
    assert.equal(ziehRichtung({ dx: -14, dy: -6 }), 'seitlich');
    assert.equal(ziehRichtung({ dx: 10, dy: 10 }), 'seitlich'); // schräg: lieber nicht ziehen
  });
});
