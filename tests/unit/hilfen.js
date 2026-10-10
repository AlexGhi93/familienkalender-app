// Gemeinsame Helfer der Unit-Tests (kein Test selbst).
import { normalizeSettings } from '../../src/domain/settings.js';
import { leereListe } from '../../src/domain/einkauf.js';
import { leeresKonto } from '../../src/domain/konto.js';

/** localStorage-Ersatz im Arbeitsspeicher; `kaputt: true` wirft bei jedem Zugriff (privater Modus, voller Speicher). */
export function speicherAttrappe(anfang = {}, { kaputt = false } = {}) {
  const daten = new Map(Object.entries(anfang));
  const pruefe = () => {
    if (kaputt) throw new Error('Speicher gesperrt');
  };
  return {
    daten,
    getItem: (k) => (pruefe(), daten.has(k) ? daten.get(k) : null),
    setItem: (k, v) => (pruefe(), daten.set(k, String(v))),
    removeItem: (k) => (pruefe(), daten.delete(k)),
  };
}

/** Kleiner Zustand der App mit Standard-Einstellungen; `teil` überschreibt einzelne Felder (settings werden normalisiert). */
export function zustand({ settings = {}, ...rest } = {}) {
  return { tage: {}, urlaub: [], termine: [], einkauf: leereListe(), konto: leeresKonto(), ...rest, settings: normalizeSettings(settings) };
}
