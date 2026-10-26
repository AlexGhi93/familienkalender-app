// Zeitspannen im Schichtplan zusammenhalten („18:00–19:30“ bricht in Glas/Bento nie nach dem Strich um): Text in Teile mit und ohne
// Zeitspanne zerlegen; die Anzeige hüllt die Spannen in .sp-zeiten (white-space: nowrap). Der Text selbst bleibt unverändert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zeitTeile } from '../../src/ui/schicht-zeiten.js';

test('ohne Zeitspanne: ein Teil (leer: keiner)', () => {
  assert.deepEqual(zeitTeile('Frühdienst'), [{ text: 'Frühdienst', zeit: false }]);
  assert.deepEqual(zeitTeile(''), []);
  assert.deepEqual(zeitTeile(undefined), []);
});

test('Zeitspanne am Ende, in der Mitte und mehrere', () => {
  assert.deepEqual(zeitTeile('Dienstbesprechung 18:00–19:30'), [
    { text: 'Dienstbesprechung ', zeit: false },
    { text: '18:00–19:30', zeit: true },
  ]);
  assert.deepEqual(zeitTeile('DB Dienstbesprechung 18:00–19:30: Tage antippen.'), [
    { text: 'DB Dienstbesprechung ', zeit: false },
    { text: '18:00–19:30', zeit: true },
    { text: ': Tage antippen.', zeit: false },
  ]);
  assert.deepEqual(zeitTeile('7:00-9:30 und 16:00–20:00'), [
    { text: '7:00-9:30', zeit: true },
    { text: ' und ', zeit: false },
    { text: '16:00–20:00', zeit: true },
  ]);
});

test('eine einzelne Uhrzeit bleibt Text; die Teile ergeben wieder genau den Text', () => {
  const t = 'Nachtdienst 17:30–07:00 ☾ ab 18:00';
  assert.equal(zeitTeile(t).map((x) => x.text).join(''), t);
  assert.deepEqual(zeitTeile('ab 18:00'), [{ text: 'ab 18:00', zeit: false }]);
});
