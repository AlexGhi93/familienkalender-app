import { parseDate } from './dates.js';

const pad2 = (n) => String(n).padStart(2, '0');

/** 11 Werktage -> '2 Wochen 1 Tag' (eine Woche = 5 Werktage). */
export function werktageText(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Ungültige Werktage: ${n}`);
  const wochen = Math.floor(n / 5);
  const tage = n % 5;
  const teile = [];
  if (wochen > 0) teile.push(`${wochen} ${wochen === 1 ? 'Woche' : 'Wochen'}`);
  if (tage > 0 || wochen === 0) teile.push(`${tage} ${tage === 1 ? 'Tag' : 'Tage'}`);
  return teile.join(' ');
}

/** 12.5 -> '12,50 €', 15 -> '15 €' */
export function euroText(betrag) {
  if (typeof betrag !== 'number' || !Number.isFinite(betrag) || betrag < 0) {
    throw new Error(`Ungültiger Betrag: ${betrag}`);
  }
  const cents = Math.round(betrag * 100);
  const euro = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? `${euro} €` : `${euro},${pad2(rest)} €`;
}

/** '2026-10-01' -> '01.10.' */
export function kurzDatum(s) {
  const { m, d } = parseDate(s);
  return `${pad2(d)}.${pad2(m)}.`;
}

/** '2026-10-08T09:15:00+02:00' -> '09:15' */
export function zeitAusDateTime(dateTime) {
  return dateTime.slice(11, 16);
}
