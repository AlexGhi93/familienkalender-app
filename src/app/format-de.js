import { parseDate, weekday } from '../domain/dates.js';

export const MONATE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
export const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const WOCHENTAGE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** '2026-10-01' -> 'Donnerstag, 1. Oktober' */
export function datumLang(date) {
  const { m, d } = parseDate(date);
  return `${WOCHENTAGE[weekday(date)]}, ${d}. ${MONATE[m - 1]}`;
}

/** '2026-10-01' -> 'Do 1. Okt.' (für enge Stellen) */
export function datumKurz(date) {
  const { m, d } = parseDate(date);
  return `${WOCHENTAGE_KURZ[weekday(date)]} ${d}. ${MONATE[m - 1].slice(0, 3)}.`;
}

export function monatTitel(jahr, monat) {
  return `${MONATE[monat - 1]} ${jahr}`;
}

/** Stunde (0–23) in Wien. */
export function stundeInWien(now = new Date()) {
  const teile = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  return Number(teile.find((t) => t.type === 'hour').value) % 24;
}

export function gruss(stunde) {
  if (stunde < 11) return { text: 'Guten Morgen!', emoji: '☀️' };
  if (stunde < 18) return { text: 'Guten Tag!', emoji: '🌤️' };
  return { text: 'Guten Abend!', emoji: '🌙' };
}

/** '2026-10-01T18:05:00.000Z' -> 'Do 1. Okt., 20:05' (Wiener Zeit); leer bei ungültigem Wert. */
export function standText(iso) {
  const zeit = Date.parse(iso);
  if (Number.isNaN(zeit)) return '';
  const teile = Object.fromEntries(
    new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(zeit))
      .map((t) => [t.type, t.value]),
  );
  const datum = `${teile.year}-${teile.month}-${teile.day}`;
  return `${datumKurz(datum)}, ${teile.hour}:${teile.minute}`;
}
