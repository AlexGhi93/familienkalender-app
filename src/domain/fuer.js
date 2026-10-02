// „Für wen“ bei Terminen: Namen, Auswahl fürs Formular und Rückübersetzung aus dem Kalendertitel.
import { FUER, FUER_ALLE } from './types.js';

export const FUER_SCHLUESSEL = Object.freeze(Object.keys(FUER));

/** Angezeigter Name: Kind = Name aus den Einstellungen (sonst „Kind“); null für „Alle“ (steht nicht im Titel). */
export function fuerName(schluessel, settings = {}) {
  if (schluessel == null || schluessel === 'alle') return null;
  if (!FUER[schluessel]) throw new Error(`Unbekannt: ${schluessel}`);
  if (schluessel === 'kind') return String(settings?.kindname ?? '').trim() || FUER.kind.label;
  return FUER[schluessel].label;
}

/** Liest einen Namen aus dem Titel zurück; null, wenn er nicht bekannt ist (dann bleibt die Klammer Teil der Bezeichnung). */
export function fuerAusText(text, settings = {}) {
  const t = String(text ?? '').trim();
  if (t === '') return null;
  const name = String(settings?.kindname ?? '').trim();
  if (t === FUER.kind.label || (name !== '' && t === name)) return 'kind';
  if (t === FUER.mama.label) return 'mama';
  if (t === FUER.papa.label) return 'papa';
  return null;
}

/** Auswahl fürs Formular: [{ id, emoji, label }] mit dem Namen des Kindes; „Alle“ zuletzt. */
export function fuerAuswahl(settings = {}) {
  return [
    ...FUER_SCHLUESSEL.map((id) => ({ id, emoji: FUER[id].emoji, label: fuerName(id, settings) })),
    { id: FUER_ALLE.id, emoji: FUER_ALLE.emoji, label: FUER_ALLE.label },
  ];
}
