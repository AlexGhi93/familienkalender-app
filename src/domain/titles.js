import { TYPES, ARZT_SUBTYPEN, KITA_RICHTUNGEN } from './types.js';
import { einrichtungFor } from './modus.js';
import { euroText, werktageText, kurzDatum, zeitAusDateTime } from './format.js';

export const SEP = ' · ';
export const TITLE_LIMIT = 60;

/** Titel der Tages-Ereignisse (Anwesenheit/Abwesenheit) und von Urlaub. */
export function buildDayTitle(typ, date, settings) {
  const einrichtung = einrichtungFor(date, settings);
  switch (typ) {
    case 'kita_essen':
      return `${TYPES.kita_essen.emoji} ${einrichtung}${SEP}Mittagessen`;
    case 'kita_ohne':
      return `${TYPES.kita_ohne.emoji} ${einrichtung}${SEP}ohne Essen`;
    case 'abwesend':
      return `${TYPES.abwesend.emoji} Abwesend`;
    case 'krank':
      return `${TYPES.krank.emoji} Krank`;
    case 'schliess':
      return `${TYPES.schliess.emoji} Schließtag`;
    case 'urlaub':
      return `${TYPES.urlaub.emoji} Urlaub`;
    default:
      throw new Error(`Kein Tagestitel für Typ: ${typ}`);
  }
}

/** Nutzertext darf das Trennzeichen nicht enthalten, sonst ginge beim Zurücklesen etwas verloren. */
function bereinigt(text) {
  return text.replaceAll(SEP, ' - ').replace(/\s+/g, ' ').trim();
}

/** '<emoji> <label> <HH:MM> · 🎒 <mitnehmen> · 💶 <kosten>' */
export function buildTerminTitle({ emoji, label, time = null, mitnehmen = [], kosten = null }) {
  const teile = [[emoji, bereinigt(label), time].filter(Boolean).join(' ')];
  const eintraege = mitnehmen.map((x) => bereinigt(x.replaceAll(',', ' '))).filter(Boolean);
  if (eintraege.length > 0) teile.push(`🎒 ${eintraege.join(', ')}`);
  if (kosten) teile.push(`💶 ${kosten.kostenlos ? 'kostenlos' : euroText(kosten.betrag)}`);
  return teile.join(SEP);
}

export function buildArztTitle({ subtyp, time, mitnehmen = [], kosten = null }) {
  const s = ARZT_SUBTYPEN[subtyp];
  if (!s) throw new Error(`Unbekannter Arzt-Untertyp: ${subtyp}`);
  return buildTerminTitle({ emoji: s.emoji, label: s.label, time, mitnehmen, kosten });
}

export function buildFamilieTitle({ text, time = null, mitnehmen = [], kosten = null }) {
  return buildTerminTitle({ emoji: TYPES.familie.emoji, label: text, time, mitnehmen, kosten });
}

/** Sachen für Krabbelstube/Kindergarten: '👕 Krabbelstube hinbringen 07:30 · 🎒 Pyjamas' bzw. '👕 Von Krabbelstube heimholen 15:30 · 🎒 …'. */
export function buildKitaSacheTitle({ richtung, einrichtung, time, mitnehmen = [] }) {
  const r = KITA_RICHTUNGEN[richtung];
  if (!r) throw new Error(`Unbekannte Richtung: ${richtung}`);
  const label = richtung === 'heim' ? `Von ${einrichtung} ${r.verb}` : `${einrichtung} ${r.verb}`;
  return buildTerminTitle({ emoji: TYPES.kita_sache.emoji, label, time, mitnehmen });
}

/** Liest Richtung und Einrichtung aus dem Beschriftungs-Segment; null, wenn es keine Kita-Sache ist. */
export function parseKitaSacheLabel(label) {
  const m = /^(?:(Von) )?(Krabbelstube|Kindergarten) (hinbringen|heimholen)$/.exec(label);
  if (!m) return null;
  const richtung = m[3] === 'heimholen' ? 'heim' : 'hin';
  if ((richtung === 'heim') !== (m[1] === 'Von')) return null;
  return { richtung, einrichtung: m[2] };
}

export function buildUrlaubCheckTitle({ offen, stand }) {
  return `${TYPES.urlaub_check.emoji} Urlaub-Check: noch ${werktageText(offen)} offen (Stand ${kurzDatum(stand)})`;
}

function parseKosten(text) {
  if (text === 'kostenlos') return { kostenlos: true };
  const m = /^(\d+(?:,\d{1,2})?)\s*€$/.exec(text);
  return m ? { betrag: Number(m[1].replace(',', '.')) } : null;
}

/** Liest oben genannte Segmente zurück; unbekannte Segmente werden ignoriert. */
export function parseTerminTitle(title) {
  const [kopf, ...rest] = title.split(SEP);
  const ersteLuecke = kopf.indexOf(' ');
  const hatEmoji = ersteLuecke !== -1 && !/^[\p{L}\p{N}]/u.test(kopf);
  const emoji = hatEmoji ? kopf.slice(0, ersteLuecke) : '';
  let label = (hatEmoji ? kopf.slice(ersteLuecke + 1) : kopf).trim();
  let time = null;
  const zeit = /^(.*?)\s+(\d{2}:\d{2})$/.exec(label);
  if (zeit) {
    label = zeit[1];
    time = zeit[2];
  }
  let mitnehmen = [];
  let kosten = null;
  for (const segment of rest) {
    if (segment.startsWith('🎒 ')) {
      mitnehmen = segment
        .slice(3)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    } else if (segment.startsWith('💶 ')) {
      kosten = parseKosten(segment.slice(3).trim());
    }
  }
  return { emoji, label, time, mitnehmen, kosten };
}

const segmenter = new Intl.Segmenter('de', { granularity: 'grapheme' });

/** Länge in sichtbaren Zeichen (ein Emoji zählt 1). */
export function titleLength(title) {
  return [...segmenter.segment(title)].length;
}

export function isTitleTooLong(title, limit = TITLE_LIMIT) {
  return titleLength(title) > limit;
}

/**
 * True, wenn die Uhrzeit im Titel nicht mehr zur echten Startzeit passt.
 * Ganztags-Ereignisse (ohne startDateTime) und Titel ohne Uhrzeit bleiben unangetastet.
 */
export function needsTimeResync(title, startDateTime) {
  if (!startDateTime) return false;
  const time = parseTerminTitle(title).time;
  return time !== null && time !== zeitAusDateTime(startDateTime);
}

/** Ersetzt nur die Uhrzeit im ersten Segment; alle anderen Segmente bleiben wörtlich erhalten. */
export function withTime(title, time) {
  const [kopf, ...rest] = title.split(SEP);
  return [kopf.replace(/(\s)\d{2}:\d{2}$/, `$1${time}`), ...rest].join(SEP);
}
