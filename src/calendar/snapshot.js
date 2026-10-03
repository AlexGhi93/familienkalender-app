// Lokaler Schnappschuss der zuletzt geladenen Daten (nur auf diesem Telefon): zeigt beim Start sofort etwas an
// und erlaubt Lesen ohne Anmeldung/Netz. Enthält Gesundheits-Titel; er bleibt im localStorage dieses Geräts.
import { addDays, isValidDate } from '../domain/dates.js';
import { normalizeSettings } from '../domain/settings.js';
import { normalisiereListe } from '../domain/einkauf.js';
import { TAGES_TYPEN, TYPES } from '../domain/types.js';

export const SNAPSHOT_KEY = 'fk.snapshot.v1';
export const MAX_SNAPSHOT_ZEICHEN = 200_000;
const TAGE_ZURUECK = 365;
const TERMIN_TYPEN = ['arzt', 'familie', 'kita_sache'];

const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const gueltigesDatum = (d) => typeof d === 'string' && isValidDate(d);

/** Prüft die gelesene Struktur streng; liefert die bereinigten Daten oder null. */
function pruefe(roh) {
  if (!istObjekt(roh) || roh.v !== 1 || typeof roh.gespeichertAm !== 'string' || Number.isNaN(Date.parse(roh.gespeichertAm))) return null;
  let settings;
  try {
    settings = normalizeSettings(roh.settings ?? {});
  } catch {
    return null;
  }
  if (!istObjekt(roh.tage) || !Array.isArray(roh.urlaub) || !Array.isArray(roh.termine)) return null;
  for (const [datum, eintrag] of Object.entries(roh.tage)) {
    if (!gueltigesDatum(datum) || !istObjekt(eintrag) || !TAGES_TYPEN.includes(eintrag.typ)) return null;
  }
  for (const u of roh.urlaub) {
    if (!istObjekt(u) || typeof u.id !== 'string' || !gueltigesDatum(u.start) || !gueltigesDatum(u.end) || u.end < u.start) return null;
  }
  for (const t of roh.termine) {
    if (!istObjekt(t) || typeof t.id !== 'string' || !TERMIN_TYPEN.includes(t.typ) || !TYPES[t.typ] || !gueltigesDatum(t.date) || !Array.isArray(t.mitnehmen ?? [])) return null;
  }
  const fenster = istObjekt(roh.fenster) && gueltigesDatum(roh.fenster.von) && gueltigesDatum(roh.fenster.bis) ? { von: roh.fenster.von, bis: roh.fenster.bis } : null;
  return { daten: { settings, tage: roh.tage, urlaub: roh.urlaub, termine: roh.termine, fenster, einkauf: normalisiereListe(roh.einkauf) }, gespeichertAm: roh.gespeichertAm };
}

export function createSnapshot({ speicher = globalThis.localStorage ?? null, jetzt = () => new Date() } = {}) {
  return {
    /** Speichert Tage, Urlaub, Termine und Einstellungen der letzten zwölf Monate. Gibt true zurück, wenn gespeichert wurde. */
    speichern(state, heute) {
      if (!speicher) return false;
      const grenze = addDays(heute, -TAGE_ZURUECK);
      const text = JSON.stringify({
        v: 1,
        gespeichertAm: jetzt().toISOString(),
        settings: state.settings,
        tage: Object.fromEntries(Object.entries(state.tage).filter(([d]) => d >= grenze)),
        urlaub: state.urlaub.filter((u) => u.end >= grenze),
        termine: state.termine.filter((t) => t.date >= grenze),
        fenster: state.fenster ?? null,
        einkauf: state.einkauf ?? null,
      });
      if (text.length > MAX_SNAPSHOT_ZEICHEN) return false;
      try {
        speicher.setItem(SNAPSHOT_KEY, text);
        return true;
      } catch {
        return false; // privater Modus oder voller Speicher
      }
    },

    /** { daten, gespeichertAm } oder null (nichts gespeichert, beschädigt oder aus einer anderen Version). */
    lesen() {
      if (!speicher) return null;
      try {
        return pruefe(JSON.parse(speicher.getItem(SNAPSHOT_KEY) ?? 'null'));
      } catch {
        return null;
      }
    },

    loeschen() {
      try {
        speicher?.removeItem(SNAPSHOT_KEY);
      } catch {
        // nichts zu tun
      }
    },
  };
}
