// Sicherung als Datei: alle Daten der Familie in einem lesbaren JSON (zum Aufbewahren oder Weitergeben): rein, ohne DOM.
// Enthält Arzttermine und damit Gesundheitsdaten; die Datei bleibt dort, wo die Familie sie speichert.
import { leereListe, normalisiereListe } from '../domain/einkauf.js';
import { terminAnzeige } from './views/gemeinsam.js';

export const SICHERUNG_VERSION = 1;

const nachDatum = (a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '');

/** Sicherung aus dem Zustand (`tage`, `urlaub`, `termine`, `settings`, `einkauf`); flüchtige Felder (Fehler, Fortschritt …) fehlen bewusst. */
export function sicherungErstellen({ state, appVersion, jetzt = new Date() }) {
  return {
    app: 'familienkalender',
    sicherungVersion: SICHERUNG_VERSION,
    appVersion,
    erstelltAm: jetzt.toISOString(),
    settings: state.settings,
    tage: Object.fromEntries(
      Object.keys(state.tage)
        .sort()
        .map((d) => [d, { typ: state.tage[d].typ }]),
    ),
    urlaub: [...state.urlaub].sort((a, b) => a.start.localeCompare(b.start)),
    termine: [...state.termine].sort(nachDatum).map((t) => ({ ...t, titel: terminAnzeige(t, state.settings).titel })),
    einkauf: state.einkauf ? normalisiereListe(state.einkauf) : leereListe(),
  };
}

export const sicherungDateiname = (heute) => `familienkalender-sicherung-${heute}.json`;

export const sicherungText = (sicherung) => JSON.stringify(sicherung, null, 2);

const zahl = (n, einzahl, mehrzahl) => `${n} ${n === 1 ? einzahl : mehrzahl}`;

/** „12 Tage · 3 Urlaube · 5 Termine · 4 Artikel auf der Einkaufsliste“ */
export function sicherungAnzahlText(s) {
  return [zahl(Object.keys(s.tage).length, 'Tag', 'Tage'), zahl(s.urlaub.length, 'Urlaub', 'Urlaube'), zahl(s.termine.length, 'Termin', 'Termine'), `${s.einkauf.e.length} Artikel auf der Einkaufsliste`].join(' · ');
}
