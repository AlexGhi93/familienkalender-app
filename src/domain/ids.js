import { parseDate, isValidDate } from './dates.js';

/** Deterministische Ereignis-ID pro Tag: 'fk20261001'. Google erlaubt Zeichen a–v und 0–9. */
export function dayEventId(date) {
  parseDate(date);
  return `fk${date.replaceAll('-', '')}`;
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
