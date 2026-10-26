// Aussehen (Klassisch, Glas & Licht, Bento bunt) und Bewegung (An, Reduziert): reine Regeln aus src/domain/aussehen.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUSSEHEN,
  AUSSEHEN_SCHLUESSEL,
  BEWEGUNG_SCHLUESSEL,
  aussehenAttribut,
  aussehenThemeFarben,
  bewegungAttribut,
  gueltigeBewegung,
  gueltigesAussehen,
} from '../../src/domain/aussehen.js';
import { themeFarben } from '../../src/domain/darstellung.js';

describe('Aussehen', () => {
  test('drei Aussehen, eingefroren, und die Schlüssel im Speicher', () => {
    assert.deepEqual(AUSSEHEN, ['klassisch', 'glas', 'bento']);
    assert.ok(Object.isFrozen(AUSSEHEN));
    assert.equal(AUSSEHEN_SCHLUESSEL, 'fk.aussehen.v1');
    assert.equal(BEWEGUNG_SCHLUESSEL, 'fk.bewegung.v1');
  });

  test('gültige Werte bleiben, alles andere wird Klassisch', () => {
    for (const w of AUSSEHEN) assert.equal(gueltigesAussehen(w), w);
    for (const w of [null, undefined, '', 'xyz', 'Glas', ' glas', 0, {}, 'constructor', 'toString']) assert.equal(gueltigesAussehen(w), 'klassisch', String(w));
  });

  test('Bewegung: „reduziert“ bleibt, alles andere ist „an“', () => {
    assert.equal(gueltigeBewegung('reduziert'), 'reduziert');
    assert.equal(gueltigeBewegung('an'), 'an');
    for (const w of [null, undefined, '', 'aus', 'Reduziert', 1, true]) assert.equal(gueltigeBewegung(w), 'an', String(w));
  });

  test('Attribute am <html>: Klassisch und „an“ setzen keins', () => {
    assert.equal(aussehenAttribut('klassisch'), null);
    assert.equal(aussehenAttribut('glas'), 'glas');
    assert.equal(aussehenAttribut('bento'), 'bento');
    assert.equal(aussehenAttribut('xyz'), null);
    assert.equal(bewegungAttribut('an'), null);
    assert.equal(bewegungAttribut('reduziert'), 'reduziert');
    assert.equal(bewegungAttribut('xyz'), null);
  });

  test('theme-color: Klassisch genau wie bisher', () => {
    for (const d of ['auto', 'hell', 'dunkel']) assert.deepEqual(aussehenThemeFarben('klassisch', d), themeFarben(d));
    assert.deepEqual(aussehenThemeFarben('klassisch', 'auto'), [
      { farbe: '#FFF7EC', media: '(prefers-color-scheme: light)' },
      { farbe: '#1F1B2E', media: '(prefers-color-scheme: dark)' },
    ]);
  });

  test('theme-color: Glas und Bento passend zum Hintergrund, hell und dunkel', () => {
    assert.deepEqual(aussehenThemeFarben('glas', 'hell'), [{ farbe: '#F1EEFA', media: null }]);
    assert.deepEqual(aussehenThemeFarben('glas', 'dunkel'), [{ farbe: '#0D0B19', media: null }]);
    assert.deepEqual(aussehenThemeFarben('glas', 'auto'), [
      { farbe: '#F1EEFA', media: '(prefers-color-scheme: light)' },
      { farbe: '#0D0B19', media: '(prefers-color-scheme: dark)' },
    ]);
    assert.deepEqual(aussehenThemeFarben('bento', 'hell'), [{ farbe: '#F1EFFA', media: null }]);
    assert.deepEqual(aussehenThemeFarben('bento', 'dunkel'), [{ farbe: '#14111D', media: null }]);
    assert.deepEqual(aussehenThemeFarben('bento', 'auto'), [
      { farbe: '#F1EFFA', media: '(prefers-color-scheme: light)' },
      { farbe: '#14111D', media: '(prefers-color-scheme: dark)' },
    ]);
  });

  test('theme-color: unbekannte Werte fallen auf Klassisch bzw. Automatisch zurück', () => {
    assert.deepEqual(aussehenThemeFarben('xyz', 'lila'), themeFarben('auto'));
    assert.deepEqual(aussehenThemeFarben(undefined, 'hell'), themeFarben('hell'));
    assert.deepEqual(aussehenThemeFarben('glas', null), aussehenThemeFarben('glas', 'auto'));
  });
});
