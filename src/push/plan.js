// Welche Push-Erinnerungen es für die nächsten Tage geben soll: reine Berechnung aus dem Zustand der App (ohne Netz, ohne Verschlüsselung).
// Regeln wie bei Google Kalender: Termin mit Uhrzeit = 1 Tag und 1 Stunde vorher; ohne Uhrzeit = am Vortag um 09:00.
import { addDays } from '../domain/dates.js';
import { wienZuInstant } from '../domain/instant.js';
import { terminAnzeige } from '../app/views/gemeinsam.js';
import { bytesZuB64u } from './base64url.js';

const TYPEN = ['arzt', 'familie', 'kita_sache'];
const STUNDE = 3600_000;
// Sekunden, die der Push-Server von Google/Apple die Nachricht für ein Telefon ohne Netz aufhebt: kommt es rechtzeitig wieder ins Netz, wird sie noch zugestellt
// („1 Stunde vorher“ nur bis kurz vor dem Termin, danach wäre sie sinnlos).
const TTL = { tag: 21600, stunde: 3300, vortag: 21600, abend: 14400 };

async function kennung(terminId, art) {
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${terminId}|${art}`)));
  return bytesZuB64u(hash.slice(0, 16)); // 22 Zeichen
}

/**
 * Plan der nächsten `tage` Tage: [{ id, um (ms), art: 'tag'|'stunde'|'vortag'|'abend', titel, text, ttl }], sortiert nach Zeitpunkt.
 * Die `id` hängt nur an Termin und Art (nicht am Zeitpunkt), damit zwei Telefone denselben Plan ohne Doppelungen schicken.
 */
export async function planeErinnerungen(state, { jetzt = new Date(), tage = 60 } = {}) {
  const von = jetzt.getTime();
  const bis = von + tage * 24 * STUNDE;
  const plan = [];
  for (const t of state.termine ?? []) {
    if (!TYPEN.includes(t.typ)) continue;
    const { titel } = terminAnzeige(t, state.settings);
    const kandidaten = [];
    try {
      if (t.time) {
        const beginn = wienZuInstant(t.date, t.time);
        // Sachen zum Hinbringen: am Vorabend erinnern (zum Einpacken), statt „1 Tag vorher“ zur Uhrzeit des Hinbringens
        if (t.typ === 'kita_sache' && t.richtung === 'hin' && state.settings?.vorabend) {
          kandidaten.push({ art: 'abend', um: wienZuInstant(addDays(t.date, -1), state.settings.vorabend), text: `Heute Abend vorbereiten (morgen ${t.time} hinbringen)` });
        } else {
          kandidaten.push({ art: 'tag', um: beginn - 24 * STUNDE, text: `Morgen um ${t.time}` });
        }
        kandidaten.push({ art: 'stunde', um: beginn - STUNDE, text: `In 1 Stunde (${t.time} Uhr)` });
      } else {
        kandidaten.push({ art: 'vortag', um: wienZuInstant(addDays(t.date, -1), '09:00'), text: 'Morgen, ganztägig' });
      }
    } catch {
      continue; // eine Uhrzeit, die es in Wien nicht gibt, darf den ganzen Plan nicht verhindern
    }
    for (const k of kandidaten) {
      if (k.um > von && k.um <= bis) plan.push({ id: await kennung(t.id, k.art), um: k.um, art: k.art, titel, text: k.text, ttl: TTL[k.art] });
    }
  }
  return plan.sort((a, b) => a.um - b.um || a.id.localeCompare(b.id));
}
