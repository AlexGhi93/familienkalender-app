// einmal(halter, lauf): ein Speichern läuft je Entwurf nur einmal gleichzeitig (Doppeltipp auf „Speichern“).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { einmal } from '../../src/app/einmal.js';

test('zweiter Aufruf während des ersten läuft nicht; danach wieder frei', async () => {
  const halter = {};
  let n = 0;
  let fertig;
  const erster = einmal(halter, () => new Promise((f) => { n += 1; fertig = f; }));
  assert.equal(await einmal(halter, async () => { n += 1; }), undefined);
  assert.equal(halter.speichert, true);
  fertig('a');
  assert.equal(await erster, 'a');
  assert.equal(halter.speichert, false);
  assert.equal(n, 1);
  assert.equal(await einmal(halter, async () => 'b'), 'b');
});

test('ein Wurf gibt den Halter wieder frei und wird weitergereicht', async () => {
  const halter = {};
  await assert.rejects(einmal(halter, async () => { throw new Error('Titel fehlt'); }), /Titel fehlt/);
  assert.equal(halter.speichert, false);
  await assert.rejects(einmal(halter, () => { throw new Error('sofort'); }), /sofort/);
  assert.equal(halter.speichert, false);
});
