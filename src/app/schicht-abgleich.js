// Schichtplan aktuell halten: solange die Seite „Schichtplan“ offen ist, werden alle 30 Sekunden die sichtbaren Monate und die
// Schichtarten neu geholt (wie bei der Einkaufsliste). So sieht man, was das andere Telefon eingetragen hat.

export const SCHICHT_INTERVALL_MS = 30_000;

/**
 * `aktiv()` → true, solange geholt werden soll (Seite sichtbar, Google verbunden); ist es gerade false, wird dieser Takt
 * übersprungen und der Zeitgeber läuft weiter. `holen()` holt (Fehler stören nicht, nächster Versuch beim nächsten Takt).
 * `start()` beim Öffnen der Seite (mehrfach unschädlich), `stop()` beim Verlassen. `uhr` = { setTimeout, clearTimeout } (für Tests).
 */
export function createSchichtAbgleich({ aktiv, holen, intervallMs = SCHICHT_INTERVALL_MS, uhr = globalThis }) {
  let an = false;
  let zeitgeber = null;

  function stellen() {
    zeitgeber = uhr.setTimeout(tick, intervallMs);
  }

  async function tick() {
    zeitgeber = null;
    if (!an) return;
    if (aktiv()) {
      try {
        await holen();
      } catch {
        // nächster Versuch beim nächsten Takt
      }
    }
    if (an && zeitgeber === null) stellen(); // erst nach dem Holen neu stellen: nie zwei Abfragen gleichzeitig
  }

  return {
    start() {
      if (an) return;
      an = true;
      stellen();
    },
    stop() {
      an = false;
      uhr.clearTimeout(zeitgeber);
      zeitgeber = null;
    },
    laeuft: () => an,
  };
}
