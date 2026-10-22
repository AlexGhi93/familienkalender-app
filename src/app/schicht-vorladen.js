// Schichtplan und Fixkosten im Hintergrund vorladen (Schichtarten, drei Monate ab dem laufenden, die vier Teile der Fixkosten; für die
// Erinnerungen an Zusätze und Kündigungsfristen, siehe store.schichtVorladen und push/plan.js planQuellen): ohne Vorladen für den
// laufenden Monat geht kein Push-Plan hinaus.
// Wann: jedes Mal, wenn die App frisch nutzbar wird (Start, Verbinden), nach einem Monatswechsel bei offener App und – ist es
// gescheitert – still noch einmal nach 30 s, 2 min, 10 min und dann alle 10 min, solange die App offen ist. Nie zwei gleichzeitig.

export const VORLADEN_WARTEN_MS = Object.freeze([30_000, 120_000, 600_000]);

/**
 * `bereit()` → true, wenn geladen werden darf (Google verbunden bzw. Demo geladen); `vorladen()` lädt (Promise; Fehler stören nicht);
 * `vorgeladen()` → Monat, für den zuletzt vollständig vorgeladen wurde ('JJJJ-MM' oder null); `monat()` → der laufende Monat (Wien).
 * `anstossen({ nochmal })` bei jeder Änderung des Zustands, regelmäßig (Monatswechsel) und beim Zurückkehren in die App (`nochmal`:
 * dann sofort, statt eine laufende Wartezeit abzuwarten). `uhr` = { setTimeout, clearTimeout } (für Tests).
 */
export function createSchichtVorlader({ bereit, vorladen, vorgeladen, monat, warten = VORLADEN_WARTEN_MS, uhr = globalThis }) {
  let warBereit = false;
  let laeuft = false;
  let zeitgeber = null;
  let fehlversuche = 0;

  const fehlt = () => vorgeladen() !== monat();

  function warteAb() {
    if (zeitgeber !== null) uhr.clearTimeout(zeitgeber);
    zeitgeber = null;
  }

  async function versuchen() {
    warteAb();
    laeuft = true;
    try {
      await vorladen();
    } catch {
      // still: der nächste Versuch folgt nach der Wartezeit
    }
    laeuft = false;
    if (!bereit()) return;
    if (!fehlt()) {
      fehlversuche = 0;
      return;
    }
    const ms = warten[Math.min(fehlversuche, warten.length - 1)];
    fehlversuche += 1;
    zeitgeber = uhr.setTimeout(() => {
      zeitgeber = null;
      if (bereit() && !laeuft && fehlt()) return versuchen();
      return undefined;
    }, ms);
  }

  function anstossen({ nochmal = false } = {}) {
    const istBereit = Boolean(bereit());
    const frisch = istBereit && !warBereit; // Start oder neu verbunden: Schichtarten und Monate neu lesen, auch wenn der Monat stimmt
    warBereit = istBereit;
    if (!istBereit) {
      warteAb();
      fehlversuche = 0;
      return;
    }
    if (laeuft) return;
    if (!frisch && !fehlt()) {
      warteAb();
      fehlversuche = 0;
      return;
    }
    if (!frisch && zeitgeber !== null && !nochmal) return; // nach einem Fehler: die Wartezeit läuft
    if (frisch) fehlversuche = 0;
    versuchen();
  }

  return { anstossen };
}
