// Was im Hintergrund vorgeladen oder nachgelesen wird (Schichtplan, Fixkosten, Sparziele, Autos, Versicherung), zeichnet nur die Ansicht neu, die es zeigt.
// Sonst ginge z. B. beim Eintippen des Kontostands die Tastatur zu, sobald das Vorladen der Fixkosten oder das Nachlesen der Sparziele
// fertig ist (Neuzeichnen nimmt den Fokus).
import { todayVienna } from '../domain/dates.js';
import { autoKarteModel } from './views/autos-faellig.js';

/** Inhalt der Karte „🚗 Auto“ auf Heute als Text (zum Vergleichen). */
const autoKarte = (state, heute) => JSON.stringify(autoKarteModel(state?.autos, heute ?? todayVienna()));

/**
 * Teile des Zustands, die im Hintergrund vorgeladen werden, und wann sie sichtbar sind (`seite`, `kontoAnsicht`, `heute` wie in der
 * Shell; `a`, `b` = alter und neuer Zustand).
 */
const SICHTBAR = {
  schicht: ({ seite }) => seite === 'schicht',
  fixkosten: ({ seite, kontoAnsicht }) => seite === 'konto' && kontoAnsicht === 'fixkosten',
  ziele: ({ seite, kontoAnsicht }) => seite === 'konto' && kontoAnsicht === 'sparziele',
  // Autos: auf ihrer Seite immer; auf Heute nur, wenn sich die Karte „🚗 Auto“ ändert (Laden, gleiche Daten, Nicht-Fälliges → nicht)
  // (in „Mehr“ nie: dort beschriftet die Shell nur die Marke „N fällig“ neu, siehe ui.autosMarkeZeichnen)
  autos: ({ seite, heute }, a, b) => seite === 'autos' || (seite === 'heute' && autoKarte(a, heute) !== autoKarte(b, heute)),
  // Versicherung: nur in ihrer Konto-Ansicht (keine Karte auf Heute, keine Marke in „Mehr“)
  versicherung: ({ seite, kontoAnsicht }) => seite === 'konto' && kontoAnsicht === 'versicherung',
};

/** Unterscheiden sich zwei Zustände nur in vorgeladenen Teilen, die gerade nicht zu sehen sind? (Dann nicht neu zeichnen.) */
export function nurHintergrundGeaendert(a, b, ansicht) {
  const geaendert = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
  return geaendert.length > 0 && geaendert.every((k) => SICHTBAR[k] && !SICHTBAR[k](ansicht, a, b));
}
