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
  return { tage: {}, urlaub: [], termine: [], einkauf: leereListe(), konto: leeresKonto(), schicht: { katalog: null, monate: {}, status: {} }, ...rest, settings: normalizeSettings(settings) };
}

/** Google-Kalender-API im Arbeitsspeicher (nur `ereignisse`: holen, einfuegen, schreibe, aendere); `roh(k, id)` = gespeichertes Ereignis, `log` = Zugriffe. */
export function apiAttrappe() {
  const kalender = new Map();
  const von = (k) => (kalender.has(k) || kalender.set(k, new Map()), kalender.get(k));
  const log = [];
  let laufend = 0;
  const zaehler = { maxGleichzeitig: 0 };
  const ereignisse = {
    async holen(k, id) {
      log.push(`GET ${id}`);
      laufend += 1;
      zaehler.maxGleichzeitig = Math.max(zaehler.maxGleichzeitig, laufend);
      await new Promise((r) => setImmediate(r));
      laufend -= 1;
      const e = von(k).get(id);
      return e ? structuredClone(e) : null;
    },
    async einfuegen(k, body) {
      if (von(k).has(body.id)) return { bereitsVorhanden: true };
      log.push(`POST ${body.id}`);
      von(k).set(body.id, { status: 'confirmed', ...structuredClone(body) });
      return {};
    },
    async schreibe(k, body) {
      log.push(`PUT ${body.id}`);
      von(k).set(body.id, { status: 'confirmed', ...structuredClone(body) });
    },
    async aendere(k, id, aenderung) {
      const patch = aenderung(await ereignisse.holen(k, id));
      if (patch) {
        log.push(`PATCH ${id}`);
        von(k).set(id, { ...von(k).get(id), ...patch });
      }
    },
  };
  return { api: { ereignisse }, roh: (k, id) => von(k).get(id) ?? null, log, zaehler };
}
