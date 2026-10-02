// Lokale Konfiguration dieses Telefons: Demo oder Google, welche Kalender, welche Rolle. Nur Kalender-IDs, keine Zugangsdaten.
export const KONFIG_KEY = 'fk.config.v1';

const KALENDER_ID = /^[0-9a-z_]+@[a-z0-9.-]+$/;
const SCHLUESSEL = ['termine', 'abwesenheit', 'anwesenheit'];

/** Gibt die bereinigte Konfiguration zurück oder null, wenn sie ungültig ist. */
function pruefe(roh) {
  if (roh === null || typeof roh !== 'object' || Array.isArray(roh) || roh.v !== 1) return null;
  if (roh.modus === 'demo') return { v: 1, modus: 'demo' };
  if (roh.modus !== 'google') return null;
  if (!['besitzer', 'partner'].includes(roh.rolle)) return null;
  const k = roh.kalender;
  if (k === null || typeof k !== 'object' || !SCHLUESSEL.every((s) => typeof k[s] === 'string' && KALENDER_ID.test(k[s]))) return null;
  return { v: 1, modus: 'google', rolle: roh.rolle, kalender: Object.fromEntries(SCHLUESSEL.map((s) => [s, k[s]])) };
}

export function createKonfiguration({ speicher = globalThis.localStorage ?? null } = {}) {
  return {
    lesen() {
      if (!speicher) return null;
      try {
        return pruefe(JSON.parse(speicher.getItem(KONFIG_KEY) ?? 'null'));
      } catch {
        return null;
      }
    },
    /** Speichert eine gültige Konfiguration (ohne `v`); gibt false bei ungültigen Angaben oder nicht verfügbarem Speicher. */
    speichern(konfig) {
      const gueltig = pruefe({ v: 1, ...konfig });
      if (!speicher || !gueltig) return false;
      try {
        speicher.setItem(KONFIG_KEY, JSON.stringify(gueltig));
        return true;
      } catch {
        return false;
      }
    },
    loeschen() {
      try {
        speicher?.removeItem(KONFIG_KEY);
      } catch {
        // nichts zu tun
      }
    },
  };
}
