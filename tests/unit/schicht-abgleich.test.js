// Schichtplan aktuell halten: alle 30 Sekunden neu holen, solange die Seite offen und sichtbar ist (mit falscher Uhr).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHICHT_INTERVALL_MS, createSchichtAbgleich } from '../../src/app/schicht-abgleich.js';

/** Uhr zum Vorspulen: `vor(ms)` lässt fällige Zeitgeber der Reihe nach laufen (und wartet auf ihre Promises). */
function uhrAttrappe() {
  let jetzt = 0;
  let naechsteId = 1;
  const zeitgeber = new Map();
  return {
    setTimeout(fn, ms) {
      const id = naechsteId++;
      zeitgeber.set(id, { fn, zeit: jetzt + ms });
      return id;
    },
    clearTimeout(id) {
      zeitgeber.delete(id);
    },
    offen: () => zeitgeber.size,
    async vor(ms) {
      const ende = jetzt + ms;
      for (;;) {
        const faellig = [...zeitgeber.entries()].filter(([, z]) => z.zeit <= ende).sort((a, b) => a[1].zeit - b[1].zeit)[0];
        if (!faellig) break;
        const [id, z] = faellig;
        zeitgeber.delete(id);
        jetzt = z.zeit;
        await z.fn();
      }
      jetzt = ende;
    },
  };
}

test('holt alle 30 Sekunden, aber nur solange aktiv() stimmt; stop() hört auf', async () => {
  assert.equal(SCHICHT_INTERVALL_MS, 30_000);
  const uhr = uhrAttrappe();
  let aktiv = true;
  let geholt = 0;
  const abgleich = createSchichtAbgleich({ aktiv: () => aktiv, holen: async () => { geholt += 1; }, uhr });
  abgleich.start();
  abgleich.start(); // zweimal starten: trotzdem nur ein Zeitgeber
  assert.equal(uhr.offen(), 1);
  await uhr.vor(29_999);
  assert.equal(geholt, 0);
  await uhr.vor(1);
  assert.equal(geholt, 1);
  await uhr.vor(30_000);
  assert.equal(geholt, 2);
  aktiv = false; // Seite unsichtbar oder verlassen
  await uhr.vor(90_000);
  assert.equal(geholt, 2);
  aktiv = true;
  await uhr.vor(30_000);
  assert.equal(geholt, 3);
  assert.equal(abgleich.laeuft(), true);
  abgleich.stop();
  assert.equal(abgleich.laeuft(), false);
  await uhr.vor(120_000);
  assert.equal(geholt, 3);
  assert.equal(uhr.offen(), 0);
});

test('Fehler beim Holen stören nicht; stop() während des Holens plant nichts mehr ein', async () => {
  const uhr = uhrAttrappe();
  let geholt = 0;
  let abgleich;
  abgleich = createSchichtAbgleich({
    aktiv: () => true,
    holen: async () => {
      geholt += 1;
      if (geholt === 1) throw new Error('Netz weg');
      abgleich.stop();
    },
    intervallMs: 1000,
    uhr,
  });
  abgleich.start();
  await uhr.vor(1000);
  assert.equal(geholt, 1);
  await uhr.vor(1000);
  assert.equal(geholt, 2);
  await uhr.vor(5000);
  assert.equal(geholt, 2);
  assert.equal(uhr.offen(), 0);
});
