import { todayVienna } from '../domain/dates.js';
import { normalizeSettings } from '../domain/settings.js';
import { seedDemo } from './seed.js';

const KEY = 'fk.demo.v1';

/**
 * Kalender-Adapter für den Demo-Modus: hält alles in `localStorage` und kennt weder Google noch das Netz.
 * Schnittstelle (die später auch der Google-Adapter erfüllt):
 * laden, setzeTag, loescheTag, speichereUrlaub, loescheUrlaub, speichereTermin, loescheTermin, speichereSettings, zuruecksetzen.
 */
export function createDemoAdapter({ speicher = globalThis.localStorage, jetzt = () => new Date() } = {}) {
  let daten = null;

  function sichern() {
    try {
      speicher.setItem(KEY, JSON.stringify(daten));
    } catch {
      // privater Modus oder voller Speicher: die Demo läuft im Arbeitsspeicher weiter
    }
  }

  function neuErzeugen() {
    daten = seedDemo(todayVienna(jetzt()));
    sichern();
  }

  return {
    async laden() {
      if (!daten) {
        try {
          daten = JSON.parse(speicher.getItem(KEY) ?? 'null');
        } catch {
          daten = null;
        }
        if (daten) {
          try {
            daten.settings = normalizeSettings(daten.settings);
          } catch {
            daten = null;
          }
        }
        if (!daten) neuErzeugen();
      }
      return structuredClone(daten);
    },
    async setzeTag(date, typ) {
      daten.tage[date] = { typ };
      sichern();
    },
    async loescheTag(date) {
      delete daten.tage[date];
      sichern();
    },
    async speichereUrlaub(urlaub) {
      daten.urlaub = [...daten.urlaub.filter((u) => u.id !== urlaub.id), urlaub];
      sichern();
    },
    async loescheUrlaub(id) {
      daten.urlaub = daten.urlaub.filter((u) => u.id !== id);
      sichern();
    },
    async speichereTermin(termin) {
      daten.termine = [...daten.termine.filter((t) => t.id !== termin.id), termin];
      sichern();
    },
    async loescheTermin(id) {
      daten.termine = daten.termine.filter((t) => t.id !== id);
      sichern();
    },
    async speichereSettings(settings) {
      daten.settings = normalizeSettings({ ...daten.settings, ...settings });
      sichern();
    },
    async zuruecksetzen() {
      neuErzeugen();
      return structuredClone(daten);
    },
  };
}
