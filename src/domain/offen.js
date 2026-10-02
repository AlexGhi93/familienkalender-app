import { eachDay, addDays, weekday } from './dates.js';
import { isFeiertag } from './feiertage.js';
import { dayEventId } from './ids.js';

/**
 * Erwartete Werktage ohne Eintrag, von „Erfassung ab“ bis gestern (heute wird auf „Heute“ eingetragen).
 * anwesenheit, abwesenheit, urlaub: Sets von Daten.
 */
export function offeneTage({ erwartung, erfassungAb, today, anwesenheit, abwesenheit, urlaub }) {
  if (!erfassungAb) return [];
  return eachDay(erfassungAb, addDays(today, -1)).filter(
    (tag) =>
      erwartung.includes(weekday(tag)) &&
      !isFeiertag(tag) &&
      !anwesenheit.has(tag) &&
      !abwesenheit.has(tag) &&
      !urlaub.has(tag),
  );
}

/** „Alle offenen Tage bestätigen“: Anwesenheits-Einträge mit deterministischer ID. */
export function planBestaetigung(tage, mitEssen = true) {
  return tage.map((date) => ({ date, typ: mitEssen ? 'kita_essen' : 'kita_ohne', id: dayEventId(date) }));
}
