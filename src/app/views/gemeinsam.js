import { TYPES, ARZT_SUBTYPEN } from '../../domain/types.js';
import { buildDayTitle, buildArztTitle, buildFamilieTitle } from '../../domain/titles.js';
import { spanDays } from '../../domain/span.js';
import { euroText } from '../../domain/format.js';

export const BETREUUNG = Object.freeze(['kita_essen', 'kita_ohne']);
export const ABWESENHEIT = Object.freeze(['abwesend', 'krank', 'schliess']);
export const TAGES_TYPEN_REIHENFOLGE = Object.freeze(['kita_essen', 'kita_ohne', 'abwesend', 'krank', 'schliess']);
export const FEIERTAG_FARBE = '#A7A2B2';
export const FEIERTAG_EMOJI = '🎉';

export function tageMitTyp(state, typen) {
  return new Set(Object.keys(state.tage).filter((d) => typen.includes(state.tage[d].typ)));
}

export function urlaubTageSet(state) {
  return new Set(state.urlaub.flatMap((u) => spanDays(u)));
}

export function schliessTageListe(state) {
  return [...tageMitTyp(state, ['schliess'])];
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

export function kostenText(kosten) {
  if (!kosten) return null;
  return kosten.kostenlos ? 'kostenlos' : euroText(kosten.betrag);
}

/** Termin für die Anzeige: Emoji, Beschriftung, Uhrzeit, Mitnehmen, Kosten und der Titel, wie er im Kalender steht. */
export function terminAnzeige(t) {
  const sub = t.typ === 'arzt' ? ARZT_SUBTYPEN[t.subtyp] : null;
  const titel =
    t.typ === 'arzt'
      ? buildArztTitle({ subtyp: t.subtyp, time: t.time, mitnehmen: t.mitnehmen, kosten: t.kosten })
      : buildFamilieTitle({ text: t.label, time: t.time, mitnehmen: t.mitnehmen, kosten: t.kosten });
  return {
    id: t.id,
    typ: t.typ,
    subtyp: t.subtyp ?? null,
    emoji: sub ? sub.emoji : TYPES.familie.emoji,
    label: sub ? sub.label : t.label,
    date: t.date,
    time: t.time ?? null,
    mitnehmen: t.mitnehmen ?? [],
    kosten: kostenText(t.kosten),
    farbe: TYPES[t.typ].farbe,
    titel,
  };
}

export function termineAm(state, date) {
  return state.termine
    .filter((t) => t.date === date)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
    .map(terminAnzeige);
}

/** Die nächsten Termine nach `ab` (ausschließlich), nach Datum und Uhrzeit sortiert. */
export function naechsteTermine(state, ab, anzahl) {
  return state.termine
    .filter((t) => t.date > ab)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
    .slice(0, anzahl)
    .map(terminAnzeige);
}
