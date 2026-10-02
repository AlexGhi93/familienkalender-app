import { addDays } from './dates.js';

const pad2 = (n) => String(n).padStart(2, '0');

/** Ostersonntag (Gauß/Meeus-Algorithmus), als 'JJJJ-MM-TT'. */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

const cache = new Map();

/** Bundesweite gesetzliche Feiertage Österreichs: Map von Datum auf Name. */
export function feiertageAT(year) {
  if (cache.has(year)) return cache.get(year);
  const ostern = easterSunday(year);
  const eintraege = [
    [`${year}-01-01`, 'Neujahr'],
    [`${year}-01-06`, 'Heilige Drei Könige'],
    [addDays(ostern, 1), 'Ostermontag'],
    [`${year}-05-01`, 'Staatsfeiertag'],
    [addDays(ostern, 39), 'Christi Himmelfahrt'],
    [addDays(ostern, 50), 'Pfingstmontag'],
    [addDays(ostern, 60), 'Fronleichnam'],
    [`${year}-08-15`, 'Mariä Himmelfahrt'],
    [`${year}-10-26`, 'Nationalfeiertag'],
    [`${year}-11-01`, 'Allerheiligen'],
    [`${year}-12-08`, 'Mariä Empfängnis'],
    [`${year}-12-25`, 'Christtag'],
    [`${year}-12-26`, 'Stefanitag'],
  ];
  const map = new Map(eintraege);
  cache.set(year, map);
  return map;
}

export function feiertagName(date) {
  return feiertageAT(Number(date.slice(0, 4))).get(date) ?? null;
}

export function isFeiertag(date) {
  return feiertagName(date) !== null;
}
