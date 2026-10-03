// Uhrzeit und Datum, die man mit der Zifferntastatur schreibt: lesen (tolerant), beim Tippen formatieren, anzeigen.
// Rein und ohne DOM; die Eingabefelder in src/ui/eingabefelder.js benutzen das.
import { addDays, isValidDate } from './dates.js';

const pad2 = (n) => String(n).padStart(2, '0');

/** '0730', '730', '7:30', '7.30', '7 30', '19' → 'HH:MM'; Ungültiges → null. Zwei Ziffern oder weniger sind volle Stunden. */
export function zeitAusEingabe(text) {
  const t = String(text ?? '').trim();
  let stunde;
  let minute;
  const mit = /^(\d{1,2})\s*[:.\s]\s*(\d{2})$/.exec(t);
  if (mit) {
    stunde = Number(mit[1]);
    minute = Number(mit[2]);
  } else if (/^\d{1,4}$/.test(t)) {
    if (t.length <= 2) {
      stunde = Number(t);
      minute = 0;
    } else if (t.length === 3) {
      stunde = Number(t[0]);
      minute = Number(t.slice(1));
    } else {
      stunde = Number(t.slice(0, 2));
      minute = Number(t.slice(2));
    }
  } else {
    return null;
  }
  return stunde <= 23 && minute <= 59 ? `${pad2(stunde)}:${pad2(minute)}` : null;
}

/** Formatiert beim Tippen: vier Ziffern bekommen den Doppelpunkt; mit eigenem Trenner bleibt der Text, nur Unzulässiges fliegt raus. */
export function zeitWaehrendTippen(text) {
  const roh = String(text ?? '');
  if (/[:.\s]/.test(roh)) return roh.replace(/[^\d:.\s]/g, '').slice(0, 5);
  const ziffern = roh.replace(/\D/g, '').slice(0, 4);
  return ziffern.length === 4 ? `${ziffern.slice(0, 2)}:${ziffern.slice(2)}` : ziffern;
}

/**
 * '03.10.2026', '3.10.26', '03102026', '3.10.' … → 'JJJJ-MM-TT'; Ungültiges → null.
 * Ohne Jahr gilt das aktuelle Jahr; läge das Datum dadurch mehr als ein halbes Jahr in der Vergangenheit, das nächste Jahr.
 */
export function datumAusEingabe(text, { heute }) {
  const t = String(text ?? '').trim();
  let tag;
  let monat;
  let jahrText = null;
  const mit = /^(\d{1,2})[.\-/\s]+(\d{1,2})(?:[.\-/\s]+(\d{4}|\d{2}))?[.\-/\s]*$/.exec(t);
  if (mit) {
    [tag, monat, jahrText] = [Number(mit[1]), Number(mit[2]), mit[3] ?? null];
  } else if (/^\d{4}$/.test(t)) {
    [tag, monat] = [Number(t.slice(0, 2)), Number(t.slice(2))];
  } else if (/^\d{6}$/.test(t) || /^\d{8}$/.test(t)) {
    [tag, monat, jahrText] = [Number(t.slice(0, 2)), Number(t.slice(2, 4)), t.slice(4)];
  } else {
    return null;
  }
  const bau = (jahr) => `${String(jahr).padStart(4, '0')}-${pad2(monat)}-${pad2(tag)}`;
  let jahr;
  if (jahrText === null) {
    jahr = Number(heute.slice(0, 4));
    if (isValidDate(bau(jahr)) && bau(jahr) < addDays(heute, -183)) jahr += 1;
  } else {
    jahr = jahrText.length === 2 ? 2000 + Number(jahrText) : Number(jahrText);
  }
  if (jahr < 2000 || jahr > 2100) return null;
  const iso = bau(jahr);
  return isValidDate(iso) ? iso : null;
}

/** Formatiert beim Tippen: acht Ziffern bekommen die Punkte; mit eigenem Trenner bleibt der Text. */
export function datumWaehrendTippen(text) {
  const roh = String(text ?? '');
  if (/[./\-\s]/.test(roh)) return roh.replace(/[^\d./\-\s]/g, '').slice(0, 10);
  const z = roh.replace(/\D/g, '').slice(0, 8);
  return z.length === 8 ? `${z.slice(0, 2)}.${z.slice(2, 4)}.${z.slice(4)}` : z;
}

/** 'JJJJ-MM-TT' → 'TT.MM.JJJJ'; Ungültiges oder Leeres → ''. */
export function datumAnzeige(iso) {
  return typeof iso === 'string' && isValidDate(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
}
