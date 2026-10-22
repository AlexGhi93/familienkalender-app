// Schichtplan im Hintergrund vorladen (für die Erinnerungen an Zusätze): beim Start, beim Monatswechsel und nach einem Fehler
// mit wachsender Wartezeit (30 s, 2 min, 10 min), still. Mit falscher Uhr.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VORLADEN_WARTEN_MS, createSchichtVorlader } from '../../src/app/schicht-vorladen.js';

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
    /** Wartezeiten der offenen Zeitgeber (ms ab jetzt). */
    offen: () => [...zeitgeber.values()].map((z) => z.zeit - jetzt),
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

/** Vorlader mit einstellbarem Ergebnis: `klappt` = ob das nächste Vorladen den laufenden Monat liefert. */
function aufbau({ bereit = true, monat = '2026-10' } = {}) {
  const t = { bereit, monat, vorgeladen: null, klappt: true, wirft: false, aufrufe: 0, uhr: uhrAttrappe() };
  t.vorlader = createSchichtVorlader({
    bereit: () => t.bereit,
    monat: () => t.monat,
    vorgeladen: () => t.vorgeladen,
    vorladen: async () => {
      t.aufrufe++;
      await Promise.resolve();
      if (t.wirft) throw new Error('Netz');
      if (t.klappt) t.vorgeladen = t.monat;
    },
    uhr: t.uhr,
  });
  return t;
}

const fertig = () => new Promise((r) => setImmediate(r));

test('lädt, sobald bereit, genau einmal; danach nichts mehr, solange der Monat stimmt', async () => {
  const t = aufbau({ bereit: false });
  t.vorlader.anstossen();
  assert.equal(t.aufrufe, 0, 'noch nicht bereit');
  t.bereit = true;
  t.vorlader.anstossen();
  t.vorlader.anstossen(); // läuft schon: nicht doppelt
  await fertig();
  assert.equal(t.aufrufe, 1);
  assert.equal(t.vorgeladen, '2026-10');
  t.vorlader.anstossen();
  t.vorlader.anstossen({ nochmal: true });
  await fertig();
  assert.equal(t.aufrufe, 1);
  assert.deepEqual(t.uhr.offen(), [], 'kein Zeitgeber nach Erfolg');
});

test('Fehler: neuer Versuch nach 30 s, 2 min, 10 min und dann alle 10 min; still, bis es klappt', async () => {
  assert.deepEqual(VORLADEN_WARTEN_MS, [30_000, 120_000, 600_000]);
  const t = aufbau();
  t.klappt = false;
  t.vorlader.anstossen();
  await fertig();
  assert.equal(t.aufrufe, 1);
  assert.deepEqual(t.uhr.offen(), [30_000]);
  t.vorlader.anstossen(); // jede Änderung am Zustand meldet sich: die Wartezeit läuft trotzdem weiter
  await fertig();
  assert.equal(t.aufrufe, 1);
  await t.uhr.vor(29_999);
  assert.equal(t.aufrufe, 1);
  await t.uhr.vor(1);
  assert.equal(t.aufrufe, 2);
  assert.deepEqual(t.uhr.offen(), [120_000]);
  t.wirft = true; // ein geworfener Fehler zählt wie ein Fehlschlag
  await t.uhr.vor(120_000);
  assert.equal(t.aufrufe, 3);
  assert.deepEqual(t.uhr.offen(), [600_000]);
  t.wirft = false;
  await t.uhr.vor(600_000);
  assert.equal(t.aufrufe, 4);
  assert.deepEqual(t.uhr.offen(), [600_000]);
  t.klappt = true;
  await t.uhr.vor(600_000);
  assert.equal(t.aufrufe, 5);
  assert.equal(t.vorgeladen, '2026-10');
  assert.deepEqual(t.uhr.offen(), []);
  // ein späterer Fehler (neuer Monat) beginnt wieder bei 30 s
  t.monat = '2026-11';
  t.klappt = false;
  t.vorlader.anstossen();
  await fertig();
  assert.equal(t.aufrufe, 6);
  assert.deepEqual(t.uhr.offen(), [30_000]);
});

test('Rückkehr in die App (nochmal) versucht es sofort, statt die Wartezeit abzuwarten', async () => {
  const t = aufbau();
  t.klappt = false;
  t.vorlader.anstossen();
  await fertig();
  assert.deepEqual(t.uhr.offen(), [30_000]);
  t.klappt = true;
  t.vorlader.anstossen({ nochmal: true });
  await fertig();
  assert.equal(t.aufrufe, 2);
  assert.deepEqual(t.uhr.offen(), []);
});

test('Monatswechsel bei offener App: der neue Monat wird vorgeladen', async () => {
  const t = aufbau();
  t.vorlader.anstossen();
  await fertig();
  assert.equal(t.aufrufe, 1);
  t.monat = '2026-11';
  t.vorlader.anstossen();
  await fertig();
  assert.equal(t.aufrufe, 2);
  assert.equal(t.vorgeladen, '2026-11');
});

test('nicht mehr bereit (z. B. Anmeldung abgelaufen): kein Versuch; wieder bereit (Verbinden) → frisch vorladen, auch wenn der Monat stimmt', async () => {
  const t = aufbau();
  t.klappt = false;
  t.vorlader.anstossen();
  await fertig();
  assert.deepEqual(t.uhr.offen(), [30_000]);
  t.bereit = false;
  t.vorlader.anstossen();
  assert.deepEqual(t.uhr.offen(), [], 'Wartezeit abgebrochen');
  await t.uhr.vor(600_000);
  assert.equal(t.aufrufe, 1);
  t.bereit = true;
  t.klappt = true;
  t.vorlader.anstossen();
  await fertig();
  assert.equal(t.aufrufe, 2);
  t.bereit = false;
  t.vorlader.anstossen();
  t.bereit = true;
  t.vorlader.anstossen(); // neu verbunden: Schichtarten und Monate neu lesen
  await fertig();
  assert.equal(t.aufrufe, 3);
});
