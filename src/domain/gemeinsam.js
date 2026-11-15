// Kleine gemeinsame Helfer der Domäne – EIN Ort, EIN Verhalten (vorher je Datei kopiert, und `sauber` war auseinandergelaufen).
// Rein, ohne DOM und ohne Netz; importiert nur aus dates.js. `pad2` und `plusMonate` stehen in dates.js, `datumText` in format.js.
import { isValidDate } from './dates.js';

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Ein einfaches Objekt (kein Array, nicht null)? */
export const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Bereinigter Text (NFC, Leerraum zusammengefasst, außen gekürzt); was kein Text ist (auch beschädigtes JSON wie {"toString":1}), ergibt '' – nie ein Fehler. */
export const sauber = (text) => (typeof text === 'string' ? text.normalize('NFC').replace(/\s+/g, ' ').trim() : '');

/** Wie `sauber`, nimmt aber auch Zahlen u. Ä. als Text (5 → '5'); null/undefined → ''. */
export const sauberText = (wert) => sauber(String(wert ?? ''));

/** Zeichen (nicht UTF-16-Einheiten), damit „Ü“ oder ein Emoji als eines zählt. */
export const zeichen = (text) => [...text].length;

/** Friert ein Objekt samt allem darin ein (Vorlagen und Typen sind fest). */
export function tiefFrieren(x) {
  if (x !== null && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.values(x).forEach(tiefFrieren);
    Object.freeze(x);
  }
  return x;
}

/** Ein gültiges Datum 'JJJJ-MM-TT' als Text? */
export const istDatum = (x) => typeof x === 'string' && isValidDate(x);

/** Ein Monat 'JJJJ-MM' als Text? */
export const istMonat = (x) => typeof x === 'string' && MONAT.test(x);

/** Steht die Kennung `id` in `liste` (Einträge einer neueren Version, { i: Kennung, … })? */
export const fremdeKennung = (liste, id) => (liste ?? []).some((k) => k?.i === id);

/** 'JJJJ-MM-TT' → Jahr als Zahl. */
export const jahrVon = (datum) => Number(datum.slice(0, 4));
