// Alles, was Seite und Karte der Einkaufsliste brauchen, als einfache Daten.
import { MAX_ARTIKEL, haeufigeVorschlaege, leereListe, sortiert } from '../../domain/einkauf.js';
import { instantZuWien } from '../../domain/instant.js';
import { standText } from '../format-de.js';

export const EINKAUF_FARBE = '#E08A3C';
const VORSCHAU = 4;

const mitMenge = (a) => (a.m ? `${a.t} (${a.m})` : a.t);

/** { offen, gekauft, anzahlOffen, vorschau (die ersten vier Namen), mehr (wie viele weitere), vorschlaege („Oft gekauft“), voll } */
export function einkaufModel(state) {
  const liste = state.einkauf ?? leereListe();
  const { offen, gekauft } = sortiert(liste);
  return {
    offen,
    gekauft,
    anzahlOffen: offen.length,
    vorschau: offen.slice(0, VORSCHAU).map(mitMenge),
    mehr: Math.max(0, offen.length - VORSCHAU),
    vorschlaege: haeufigeVorschlaege(liste, 8),
    voll: liste.e.length >= MAX_ARTIKEL,
  };
}

/** Zeile unter dem Titel: „Aktualisiert um 14:32“ (Wiener Zeit); war es nicht heute, mit Datum. Leer, solange kein Abgleich bekannt ist. */
export function aktualisiertText(ms, jetztMs) {
  if (ms == null) return '';
  const wann = instantZuWien(ms);
  return wann.date === instantZuWien(jetztMs).date ? `Aktualisiert um ${wann.time}` : `Aktualisiert: ${standText(new Date(ms).toISOString())}`;
}
