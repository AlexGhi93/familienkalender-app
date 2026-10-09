import { todayVienna } from '../domain/dates.js';
import { normalizeSettings } from '../domain/settings.js';
import { leereListe, normalisiereListe } from '../domain/einkauf.js';
import { leeresKonto, normalisiereKonto } from '../domain/konto.js';
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
    istDemo: true, // der Store erlaubt „Beispieldaten entfernen“ nur mit einem Adapter, der das von sich sagt
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
        else {
          daten.einkauf = normalisiereListe(daten.einkauf ?? leereListe()); // Demo-Speicher aus einer älteren Version hat noch keine Liste
          daten.konto = normalisiereKonto(daten.konto ?? leeresKonto()); // … und noch keine Kontostände
        }
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
    /** Kontostände ändern: `aenderung(konto)` → neues Konto (wie beim Google-Adapter); gibt das gespeicherte Konto zurück. */
    async aendereKonto(aenderung) {
      const neu = aenderung(daten.konto ?? leeresKonto());
      if (!neu) return null;
      daten.konto = neu;
      sichern();
      return structuredClone(neu);
    },
    /** Einkaufsliste ändern: `aenderung(liste)` → neue Liste (wie beim Google-Adapter); gibt die gespeicherte Liste zurück. */
    async aendereEinkauf(aenderung) {
      const neu = aenderung(daten.einkauf ?? leereListe());
      if (!neu) return null;
      daten.einkauf = neu;
      sichern();
      return structuredClone(neu);
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
