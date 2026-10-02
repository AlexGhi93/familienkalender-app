import { addDays, weekday } from '../domain/dates.js';
import { isFeiertag } from '../domain/feiertage.js';
import { KITA_RICHTUNGEN } from '../domain/types.js';

export const MAX_SERIEN_WOCHEN = 26;

/** Ist `date` ein Tag, an dem man etwas in die Einrichtung bringen oder dort holen kann? Sonst der Grund. */
export function kitaTagStatus(state, date) {
  const wt = weekday(date);
  if (wt >= 5) return { ok: false, grund: 'Wochenende' };
  if (isFeiertag(date)) return { ok: false, grund: 'Feiertag' };
  if (state.urlaub.some((u) => u.start <= date && date <= u.end)) return { ok: false, grund: 'Urlaub' };
  if (state.tage[date]?.typ === 'schliess') return { ok: false, grund: 'Schließtag' };
  if (!state.settings.erwartung.includes(wt)) return { ok: false, grund: 'kein Betreuungstag' };
  return { ok: true };
}

/** Erster gültiger Betreuungstag strikt nach `nach` (innerhalb von drei Monaten). */
export function naechsterKitaTag(state, nach) {
  for (let i = 1; i <= 92; i += 1) {
    const kandidat = addDays(nach, i);
    if (kitaTagStatus(state, kandidat).ok) return kandidat;
  }
  throw new Error('Kein Betreuungstag in den nächsten drei Monaten gefunden. Bitte die Standardwoche in „Mehr“ prüfen.');
}

/** Erstes Datum strikt nach `nach`, das auf den Wochentag `wt` fällt (Montag = 0). */
export function naechsterWochentag(nach, wt) {
  let d = addDays(nach, 1);
  while (weekday(d) !== wt) d = addDays(d, 1);
  return d;
}

/**
 * Plant eine wöchentliche Serie ab `start`. Fällt ein Wunschtag aus (Feiertag, Urlaub, Schließtag, kein Betreuungstag),
 * rutscht „Hinbringen“ auf den nächsten gültigen Tag derselben Woche (Mo–Fr), „Heimholen“ auf den vorherigen.
 * Findet sich keiner oder liegt der Wunschtag vor `heute`, wird die Woche übersprungen (mit Grund).
 */
export function wochenSerie(state, { start, wochen, richtung, heute = null }) {
  if (!Number.isInteger(wochen) || wochen < 1 || wochen > MAX_SERIEN_WOCHEN) {
    throw new Error(`Wochen: bitte 1 bis ${MAX_SERIEN_WOCHEN} wählen.`);
  }
  if (!KITA_RICHTUNGEN[richtung]) throw new Error(`Unbekannte Richtung: ${richtung}`);

  const eintraege = [];
  const uebersprungen = [];
  for (let i = 0; i < wochen; i += 1) {
    const wunsch = addDays(start, 7 * i);
    if (heute && wunsch < heute) {
      uebersprungen.push({ date: wunsch, grund: 'in der Vergangenheit' });
      continue;
    }
    const kandidaten = [];
    if (richtung === 'hin') {
      for (let tag = wunsch; weekday(tag) <= 4; tag = addDays(tag, 1)) kandidaten.push(tag); // bis Freitag
    } else {
      const montag = addDays(wunsch, -weekday(wunsch));
      for (let tag = wunsch; tag >= montag; tag = addDays(tag, -1)) kandidaten.push(tag); // zurück bis Montag
    }
    const treffer = kandidaten.find((tag) => (!heute || tag >= heute) && kitaTagStatus(state, tag).ok);
    if (treffer === undefined) {
      uebersprungen.push({ date: wunsch, grund: kitaTagStatus(state, wunsch).grund ?? 'kein gültiger Tag' });
    } else if (treffer === wunsch) {
      eintraege.push({ date: treffer });
    } else {
      eintraege.push({ date: treffer, verschobenVon: wunsch, grund: kitaTagStatus(state, wunsch).grund });
    }
  }
  return { eintraege, uebersprungen };
}

/** Kurzer Text zur Vorschau einer Serie: „8 Erinnerungen · 1 verschoben · 2 übersprungen (Urlaub ×2)“. */
export function serieZusammenfassung({ eintraege, uebersprungen }) {
  const teile = [`${eintraege.length} ${eintraege.length === 1 ? 'Erinnerung' : 'Erinnerungen'}`];
  const verschoben = eintraege.filter((e) => e.verschobenVon).length;
  if (verschoben > 0) teile.push(`${verschoben} verschoben`);
  if (uebersprungen.length > 0) {
    const gruende = new Map();
    for (const u of uebersprungen) gruende.set(u.grund, (gruende.get(u.grund) ?? 0) + 1);
    const text = [...gruende].map(([grund, anzahl]) => (anzahl > 1 ? `${grund} ×${anzahl}` : grund)).join(', ');
    teile.push(`${uebersprungen.length} übersprungen (${text})`);
  }
  return teile.join(' · ');
}
