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

/** Deterministische Ereignis-ID eines Urlaub-Checks: 'fkc20270301' (der Buchstabe c unterscheidet sie von den Tages-IDs 'fk<Datum>'). */
export function urlaubCheckEventId(date) {
  parseDate(date);
  return `fkc${date.replaceAll('-', '')}`;
}

/** Nur diese Ereignisse verwaltet die App selbst; ein von Hand angelegter „Urlaub-Check“ gehört ihr nicht. */
export function istUrlaubCheckId(id) {
  const m = /^fkc(\d{4})(\d{2})(\d{2})$/.exec(String(id));
  return m !== null && isValidDate(`${m[1]}-${m[2]}-${m[3]}`);
}
