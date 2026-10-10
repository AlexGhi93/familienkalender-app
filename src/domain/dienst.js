// „Wer bringt, wer holt?“: Wochenplan je Wochentag plus Ausnahmen für einzelne Tage (Einstellungen `dienstplan`, `dienstAusnahmen`).
// Rollen: b = bringt (hinbringen), h = holt (abholen). Personen: '' = niemand eingetragen, 'papa', 'mama'.
import { addDays, weekday } from './dates.js';
import { MAX_DIENST_AUSNAHMEN } from './settings.js';

const REIHE = { '': 'papa', papa: 'mama', mama: '' };

/** Nächste Person beim Antippen: — → Papa → Mama → —. */
export function naechstePerson(person) {
  return REIHE[person] ?? 'papa';
}

/** Der Wochenplan für `datum`: { b, h }. Wochentage, an denen das Kind nicht erwartet wird, haben keinen Plan. */
export function planFuer(datum, settings) {
  const tag = weekday(datum);
  if (!(settings.erwartung ?? []).includes(tag)) return { b: '', h: '' };
  return { b: settings.dienstplan?.b?.[tag] ?? '', h: settings.dienstplan?.h?.[tag] ?? '' };
}

/** Wer an `datum` bringt und holt: { b, h }; eine Ausnahme für den Tag geht dem Wochenplan vor. */
export function dienstFuer(datum, settings) {
  const plan = planFuer(datum, settings);
  const ausnahme = settings.dienstAusnahmen?.[datum] ?? {};
  return { b: ausnahme.b ?? plan.b, h: ausnahme.h ?? plan.h };
}

/** Wird „Bringen & Abholen“ überhaupt verwendet (jemand im Wochenplan oder an einem einzelnen Tag)? */
export function dienstGenutzt(settings) {
  const imPlan = (settings.erwartung ?? []).some((tag) => settings.dienstplan?.b?.[tag] || settings.dienstplan?.h?.[tag]);
  return imPlan || Object.values(settings.dienstAusnahmen ?? {}).some((a) => a.b || a.h);
}

/** Neuer Wochenplan, in dem am Wochentag `tag` (Montag = 0) für die Rolle `rolle` die Person `person` steht. */
export function mitPlan(settings, tag, rolle, person) {
  const plan = { b: [...settings.dienstplan.b], h: [...settings.dienstplan.h] };
  plan[rolle][tag] = person;
  return plan;
}

/**
 * Neue `dienstAusnahmen`, in denen an `datum` für die Rolle `rolle` die Person `person` steht.
 * Stimmt das mit dem Wochenplan überein, fällt die Ausnahme weg (kein Ballast). Beim Speichern wird aufgeräumt:
 * Tage vor `heute` − 7 fallen weg, und es bleiben höchstens MAX_DIENST_AUSNAHMEN Tage (die ältesten fliegen zuerst raus).
 */
export function mitAusnahme(settings, datum, rolle, person, heute) {
  const ausnahmen = { ...(settings.dienstAusnahmen ?? {}) };
  const tag = { ...(ausnahmen[datum] ?? {}) };
  if (person === planFuer(datum, settings)[rolle]) delete tag[rolle];
  else tag[rolle] = person;
  if (Object.keys(tag).length > 0) ausnahmen[datum] = tag;
  else delete ausnahmen[datum];

  const grenze = addDays(heute, -7);
  const behalten = Object.keys(ausnahmen)
    .filter((d) => d >= grenze)
    .sort()
    .slice(-MAX_DIENST_AUSNAHMEN);
  return Object.fromEntries(behalten.map((d) => [d, ausnahmen[d]]));
}
