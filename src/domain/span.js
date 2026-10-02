import { addDays, eachDay } from './dates.js';

/** Google speichert Ganztags-Ereignisse mit exklusivem Ende; wir rechnen mit inklusivem Ende. */
export function fromGoogleAllDay(startDate, endDateExclusive) {
  return { start: startDate, end: addDays(endDateExclusive, -1) };
}

export function toGoogleAllDay(span) {
  return { start: { date: span.start }, end: { date: addDays(span.end, 1) } };
}

export function spanDays(span) {
  return eachDay(span.start, span.end);
}

/** Inklusive Datumsspanne eines Google-Ereignisses (Ganztag oder mit Uhrzeit). */
export function eventSpan(event) {
  const { start, end } = event;
  if (start?.date) {
    return fromGoogleAllDay(start.date, end?.date ?? addDays(start.date, 1));
  }
  if (start?.dateTime) {
    const s = start.dateTime.slice(0, 10);
    const endDt = end?.dateTime ?? start.dateTime;
    let e = endDt.slice(0, 10);
    if (e > s && endDt.slice(11, 19) === '00:00:00') e = addDays(e, -1);
    return { start: s, end: e };
  }
  throw new Error('Ereignis ohne Start');
}
