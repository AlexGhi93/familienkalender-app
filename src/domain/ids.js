import { parseDate, isValidDate } from './dates.js';

/** Deterministische Ereignis-ID pro Tag: 'fk20261001'. Google erlaubt Zeichen a–v und 0–9. */
export function dayEventId(date) {
  parseDate(date);
  return `fk${date.replaceAll('-', '')}`;
}

export function dateFromDayEventId(id) {
  const m = /^fk(\d{4})(\d{2})(\d{2})$/.exec(id);
  if (!m) return null;
  const datum = `${m[1]}-${m[2]}-${m[3]}`;
  return isValidDate(datum) ? datum : null;
}

export function isValidGoogleEventId(id) {
  return /^[a-v0-9]{5,1024}$/.test(id);
}
