// besuchsPlan (src/app/seiten-besuch.js): welche Seiten beim Zeichnen neu betreten werden (einmal je Besuch lesen) und welche vergessen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { besuchsPlan } from '../../src/app/seiten-besuch.js';

test('betreten einmal je Besuch; neuer Schlüssel (Monat) zählt als neuer Besuch; Verlassen vergisst', () => {
  const seiten = [{ name: 'schicht' }, { name: 'autos' }];
  assert.deepEqual(besuchsPlan(seiten, new Map([['schicht', '2026-11'], ['autos', null]]), new Map()), { betreten: ['schicht'], vergessen: [] });
  assert.deepEqual(besuchsPlan(seiten, new Map([['schicht', '2026-11'], ['autos', null]]), new Map([['schicht', '2026-11']])), { betreten: [], vergessen: [] });
  assert.deepEqual(besuchsPlan(seiten, new Map([['schicht', '2026-12'], ['autos', null]]), new Map([['schicht', '2026-11']])), { betreten: ['schicht'], vergessen: [] });
  assert.deepEqual(besuchsPlan(seiten, new Map([['schicht', null], ['autos', 'liste']]), new Map([['schicht', '2026-12']])), { betreten: ['autos'], vergessen: ['schicht'] });
});

test('fehlt eine Seite in `aktiv`, ist sie nicht offen; nie angefragt = nichts zu vergessen', () => {
  const seiten = [{ name: 'schicht' }, { name: 'autos' }];
  assert.deepEqual(besuchsPlan(seiten, new Map(), new Map([['autos', '']])), { betreten: [], vergessen: ['autos'] });
  assert.deepEqual(besuchsPlan(seiten, new Map([['autos', '']]), new Map([['autos', '']])), { betreten: [], vergessen: [] });
});
