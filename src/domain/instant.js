// Bürgerliche Zeit in Wien <-> Zeitpunkt (Millisekunden seit 1970, UTC). Für Erinnerungen, die zu einem festen Moment kommen müssen.
import { parseDate } from './dates.js';

const WIEN = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vienna',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Datum und Uhrzeit in Wien zu einem Zeitpunkt: { date: 'JJJJ-MM-TT', time: 'HH:MM' }. */
export function instantZuWien(ms) {
  const t = Object.fromEntries(WIEN.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { date: `${t.year}-${t.month}-${t.day}`, time: `${t.hour}:${t.minute}` };
}

/**
 * Zeitpunkt zu Datum und Uhrzeit in Wien. Wien ist UTC+1 (Winter) oder UTC+2 (Sommer): beide Möglichkeiten werden geprüft.
 * Doppelte Stunde im Herbst = erstes Vorkommen (wie bei Google); die übersprungene Stunde im Frühjahr gibt es nicht und wirft einen Fehler.
 */
export function wienZuInstant(date, time) {
  const { y, m, d } = parseDate(date);
  const [h, min] = time.split(':').map(Number);
  const nominal = Date.UTC(y, m - 1, d, h, min);
  const treffer = [2, 1].map((versatz) => nominal - versatz * 3600_000).filter((ms) => {
    const w = instantZuWien(ms);
    return w.date === date && w.time === time;
  });
  if (treffer.length === 0) throw new Error(`Diese Uhrzeit gibt es in Wien nicht (Zeitumstellung): ${date} ${time}.`);
  return Math.min(...treffer);
}
