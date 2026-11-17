import { TYPES } from '../../domain/types.js';
import { buildDayTitle } from '../../domain/titles.js';
import { spanDays } from '../../domain/span.js';
import { terminAnzeige } from '../../domain/termin-anzeige.js';

export const FEIERTAG_FARBE = '#A7A2B2';
export const FEIERTAG_EMOJI = '🎉';

export function urlaubTageSet(state) {
  return new Set(state.urlaub.flatMap((u) => spanDays(u)));
}

/** Wirksamer Tagestyp: Urlaub schlägt einen Tageseintrag (Vorrang aus dem Design). */
export function tagTyp(state, date, urlaubSet = urlaubTageSet(state)) {
  if (urlaubSet.has(date)) return 'urlaub';
  return state.tage[date]?.typ ?? null;
}

/** Emoji und Text eines Tagestyps, z. B. { emoji: '🏫', text: 'Krabbelstube · Mittagessen' }. */
export function typText(typ, date, settings) {
  const emoji = TYPES[typ].emoji;
  return { emoji, text: buildDayTitle(typ, date, settings).slice(emoji.length + 1) };
}

export function termineAm(state, date) {
  return state.termine
    .filter((t) => t.date === date)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
    .map((t) => terminAnzeige(t, state.settings));
}

/** Die nächsten Termine nach `ab` (ausschließlich), nach Datum und Uhrzeit sortiert; Sachen für die Einrichtung zählen nicht dazu. */
export function naechsteTermine(state, ab, anzahl) {
  return state.termine
    .filter((t) => t.date > ab && t.typ !== 'kita_sache')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
    .slice(0, anzahl)
    .map((t) => terminAnzeige(t, state.settings));
}
