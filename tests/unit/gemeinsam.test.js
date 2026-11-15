// Gemeinsame kleine Helfer (domain/gemeinsam.js) und pad2 aus domain/dates.js: ein Ort, ein Verhalten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fremdeKennung, istDatum, istMonat, istObjekt, jahrVon, sauber, sauberText, tiefFrieren, zeichen } from '../../src/domain/gemeinsam.js';
import { pad2, plusMonate } from '../../src/domain/dates.js';
import { datumText } from '../../src/domain/format.js';

test('sauber: NFC, Leerraum, Nicht-Text', () => {
  assert.equal(sauber('A\u0308pfel   rot '), '\u00C4pfel rot');
  assert.equal(sauber(5), '');
  assert.equal(sauberText(5), '5');
  assert.equal(sauberText(null), '');
});

test('pad2, istMonat, istDatum, zeichen', () => {
  assert.equal(pad2(7), '07');
  assert.equal(istMonat('2026-13'), false);
  assert.equal(istDatum('2026-02-30'), false);
  assert.equal(zeichen('Ü👍'), 2);
});

test('istObjekt, tiefFrieren, fremdeKennung, jahrVon, datumText, plusMonate', () => {
  assert.equal(istObjekt({}), true);
  assert.equal(istObjekt([]), false);
  assert.equal(istObjekt(null), false);
  const x = tiefFrieren({ a: { b: [1] } });
  assert.ok(Object.isFrozen(x.a.b));
  assert.equal(fremdeKennung([{ i: 'ab12' }], 'ab12'), true);
  assert.equal(fremdeKennung(undefined, 'ab12'), false);
  assert.equal(jahrVon('2026-10-29'), 2026);
  assert.equal(datumText('2026-10-29'), '29.10.2026');
  assert.equal(plusMonate('2026-01-31', 1), '2026-02-28');
  assert.equal(plusMonate('2026-09-30', 1, true), '2026-10-31');
});
