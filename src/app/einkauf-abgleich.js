// Einkaufsliste aktuell halten: solange die Seite „Einkauf“ offen und sichtbar ist (und Google verbunden), wird alle 30 Sekunden
// nur die Liste geholt. So sieht, wer gerade im Geschäft steht, was das andere Telefon noch dazugeschrieben hat.

export const EINKAUF_INTERVALL_MS = 30_000;

/**
 * `aktiv()` → true, solange abgeglichen werden soll (Seite, Sichtbarkeit, Google); `holen()` holt die Liste (Fehler stören nicht);
 * `zuletzt()` → Zeitpunkt (ms) des letzten Abgleichs oder null: auch Laden, Ziehen und eigenes Speichern zählen, dann wird entsprechend später geholt.
 * `pruefen()` nach jedem Zeichnen und bei jedem Wechsel der Sichtbarkeit aufrufen: startet bzw. stoppt den Zeitgeber.
 * `sofort()` holt gleich einmal (Rückkehr in die App) und zählt die 30 Sekunden von vorne. `uhr` = { setTimeout, clearTimeout } (für Tests).
 */
export function createEinkaufAbgleich({ aktiv, holen, zuletzt = () => null, jetzt = () => Date.now(), intervallMs = EINKAUF_INTERVALL_MS, uhr = globalThis }) {
  let an = false;
  let zeitgeber = null;

  function stellen(ms) {
    uhr.clearTimeout(zeitgeber);
    zeitgeber = uhr.setTimeout(tick, ms);
  }

  function stoppen() {
    an = false;
    uhr.clearTimeout(zeitgeber);
    zeitgeber = null;
  }

  /** Wartezeit bis zum nächsten Abgleich: 30 Sekunden nach dem letzten (sofort, wenn der schon länger her ist oder keiner bekannt ist). */
  function rest() {
    const z = zuletzt();
    return z == null ? 0 : Math.max(0, Math.min(intervallMs, z + intervallMs - jetzt()));
  }

  async function abgleichen() {
    uhr.clearTimeout(zeitgeber);
    zeitgeber = null;
    try {
      await holen();
    } catch {
      // nächster Versuch beim nächsten Takt
    }
    if (an && zeitgeber === null) stellen(intervallMs);
  }

  async function tick() {
    zeitgeber = null;
    if (!an) return;
    if (!aktiv()) {
      stoppen();
      return;
    }
    const warten = rest();
    if (warten > 0) stellen(warten); // inzwischen anders abgeglichen (Laden, Ziehen, eigene Änderung)
    else await abgleichen();
  }

  function pruefen() {
    const soll = aktiv();
    if (soll && !an) {
      an = true;
      stellen(rest());
    } else if (!soll && an) {
      stoppen();
    }
  }

  async function sofort() {
    pruefen();
    if (an) await abgleichen();
  }

  return { pruefen, sofort, laeuft: () => an };
}
