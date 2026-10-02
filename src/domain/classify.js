import { CALENDARS, TYPES } from './types.js';
import { SEP } from './titles.js';

const ARZT_REGELN = [
  ['impfung', /impf/],
  ['ekp', /eltern-?kind-?pass|mutter-?kind-?pass|\bekp\b|\bmkp\b/],
  ['augenarzt', /augen/],
  ['zahnarzt', /zahn/],
  ['kinderarzt', /kinderarzt|kinderärzt|pädiater/],
  ['sonstiger_arzt', /arzt|ärztin|ordination|doktor|\bdr\./],
];

function arztSubtyp(text) {
  return ARZT_REGELN.find(([, regel]) => regel.test(text))?.[0] ?? null;
}

function typAusTitel(text, calendar) {
  switch (calendar) {
    case CALENDARS.ANWESENHEIT:
      return /ohne\s+essen/.test(text) ? 'kita_ohne' : 'kita_essen';
    case CALENDARS.ABWESENHEIT:
      if (/urlaub/.test(text)) return 'urlaub';
      if (/krank/.test(text)) return 'krank';
      if (/schlie(ß|ss)tag|geschlossen/.test(text)) return 'schliess';
      return 'abwesend';
    case CALENDARS.TERMINE:
      if (/urlaub-check/.test(text)) return 'urlaub_check';
      return arztSubtyp(text) ? 'arzt' : 'familie';
    default:
      throw new Error(`Unbekannter Kalender: ${calendar}`);
  }
}

/**
 * Bestimmt den Typ eines Google-Ereignisses. Der Kalender, in dem es liegt, legt die Typfamilie fest;
 * versteckte Felder haben Vorrang, sonst entscheiden Stichwörter im ersten Titelsegment.
 * Nur das erste Segment zählt, damit „🎒 … Impfpass“ keinen Kinderarzt-Termin zur Impfung macht.
 */
export function classifyEvent(event, calendar) {
  const privat = event.extendedProperties?.private ?? {};
  const text = (event.summary ?? '').split(SEP)[0].toLowerCase();

  let typ;
  let quelle;
  if (privat.fk && TYPES[privat.typ] && TYPES[privat.typ].calendar === calendar) {
    typ = privat.typ;
    quelle = 'app';
  } else {
    typ = typAusTitel(text, calendar);
    quelle = 'titel';
  }
  const subtyp = typ === 'arzt' ? (arztSubtyp(text) ?? 'sonstiger_arzt') : null;
  return { typ, subtyp, quelle };
}
