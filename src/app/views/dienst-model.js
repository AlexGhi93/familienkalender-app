// „Wer bringt, wer holt?“ für „Heute“ und das Tages-Blatt: welche Tage eine Zeile bekommen und was darin steht.
import { addDays, weekday } from '../../domain/dates.js';
import { feiertagName } from '../../domain/feiertage.js';
import { dienstFuer, dienstGenutzt } from '../../domain/dienst.js';
import { instantZuWien } from '../../domain/instant.js';
import { FUER } from '../../domain/types.js';
import { tagTyp, urlaubTageSet } from './gemeinsam.js';

const OHNE_BETREUUNG = ['urlaub', 'krank', 'abwesend', 'schliess'];

/** Geht das Kind an `datum` hin? Erwarteter Wochentag, kein Feiertag, nicht im Urlaub, nicht krank, abwesend oder geschlossen. */
export function betreuungstag(state, datum, urlaubSet = urlaubTageSet(state)) {
  if (!state.settings.erwartung.includes(weekday(datum)) || feiertagName(datum)) return false;
  return !OHNE_BETREUUNG.includes(tagTyp(state, datum, urlaubSet));
}

const aufgabe = (rolle, person, zeit) => ({ rolle, person, emoji: FUER[person]?.emoji ?? null, name: FUER[person]?.label ?? null, zeit });

/**
 * Wer an `datum` bringt und holt: { datum, b, h, leer } mit b/h = { rolle, person, emoji, name, zeit } (person '' = niemand eingetragen).
 * null, wenn das Kind an dem Tag nicht hingeht.
 */
export function dienstTag(state, datum, urlaubSet = urlaubTageSet(state)) {
  if (!betreuungstag(state, datum, urlaubSet)) return null;
  const { settings } = state;
  const { b, h } = dienstFuer(datum, settings);
  return { datum, b: aufgabe('b', b, settings.bringzeit), h: aufgabe('h', h, settings.abholzeit), leer: !b && !h };
}

/**
 * Zeilen für „Heute“: [{ wann: 'heute' | 'morgen', …dienstTag }]. Heute, und ab der Abholzeit (Wiener Zeit) auch morgen.
 * Leer, solange niemand „Bringen & Abholen“ verwendet.
 */
export function dienstHeute(state, now = new Date()) {
  if (!dienstGenutzt(state.settings)) return [];
  const { date: heute, time } = instantZuWien(now.getTime());
  const urlaubSet = urlaubTageSet(state);
  const zeilen = [];
  const h = dienstTag(state, heute, urlaubSet);
  if (h) zeilen.push({ wann: 'heute', ...h });
  if (time >= state.settings.abholzeit) {
    const m = dienstTag(state, addDays(heute, 1), urlaubSet);
    if (m) zeilen.push({ wann: 'morgen', ...m });
  }
  return zeilen;
}
