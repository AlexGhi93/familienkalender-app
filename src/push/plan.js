// Welche Push-Erinnerungen es für die nächsten Tage geben soll: reine Berechnung aus dem Zustand der App (ohne Netz, ohne Verschlüsselung).
// Regeln wie bei Google Kalender: Termin mit Uhrzeit = 1 Tag und 1 Stunde vorher; ohne Uhrzeit = am Vortag um 09:00.
import { addDays, todayVienna } from '../domain/dates.js';
import { PERSONEN, fehlendePersonen, leeresKonto, letzterTag } from '../domain/konto.js';
import { FUER } from '../domain/types.js';
import { dienstFuer } from '../domain/dienst.js';
import { instantZuWien, wienZuInstant } from '../domain/instant.js';
import { terminAnzeige } from '../app/views/gemeinsam.js';
import { urlaubChecksWunsch } from '../app/urlaub-check.js';
import { bytesZuB64u } from './base64url.js';

const TYPEN = ['arzt', 'familie', 'kita_sache', 'urlaub_check'];
const STUNDE = 3600_000;
// Sekunden, die der Push-Server von Google/Apple die Nachricht für ein Telefon ohne Netz aufhebt: kommt es rechtzeitig wieder ins Netz, wird sie noch zugestellt
// („1 Stunde vorher“ nur bis kurz vor dem Termin, danach wäre sie sinnlos).
const TTL = { tag: 21600, stunde: 3300, vortag: 21600, abend: 14400, konto: 10800, konto2: 5400 };

async function kennung(terminId, art) {
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${terminId}|${art}`)));
  return bytesZuB64u(hash.slice(0, 16)); // 22 Zeichen
}

/** Die Monate (JJJJ-MM, Wiener Zeit), die das Fenster [von, bis] berühren. */
function monateImFenster(von, bis) {
  const monate = [];
  let [jahr, monat] = todayVienna(new Date(von)).slice(0, 7).split('-').map(Number);
  const ende = todayVienna(new Date(bis)).slice(0, 7);
  for (;;) {
    const schluessel = `${jahr}-${String(monat).padStart(2, '0')}`;
    if (schluessel > ende) return monate;
    monate.push(schluessel);
    [jahr, monat] = monat === 12 ? [jahr + 1, 1] : [jahr, monat + 1];
  }
}

const namenText = (personen) => personen.map((p) => FUER[p].label).join(' und ');

/**
 * „Kontostand eintragen“: am letzten Tag jedes Monats zur eingestellten Zeit und drei Stunden später (nur am selben Tag, nur wenn noch jemand fehlt).
 * Der Text nennt höchstens Namen, nie Beträge. Öffnet beim Antippen die Seite „Kontostand“.
 */
async function kontoErinnerungen(state, von, bis) {
  const zeit = state.settings?.kontoErinnerung;
  if (!zeit) return [];
  const konto = state.konto ?? leeresKonto();
  const plan = [];
  for (const monat of monateImFenster(von, bis)) {
    const fehlt = fehlendePersonen(konto, monat);
    if (fehlt.length === 0) continue;
    const tag = letzterTag(monat);
    let erste;
    try {
      erste = wienZuInstant(tag, zeit);
    } catch {
      continue; // eine Uhrzeit, die es an diesem Tag in Wien nicht gibt
    }
    const namen = namenText(fehlt);
    const kandidaten = [{ art: 'konto', um: erste, text: fehlt.length === PERSONEN.length ? 'Heute ist der letzte Tag des Monats.' : `Noch offen: ${namen}.` }];
    const spaeter = erste + 3 * STUNDE;
    if (instantZuWien(spaeter).date === tag) kandidaten.push({ art: 'konto2', um: spaeter, text: `Letzte Erinnerung für heute – noch offen: ${namen}.` });
    for (const k of kandidaten) {
      if (k.um > von && k.um <= bis) plan.push({ id: await kennung(`konto-${monat}`, k.art), um: k.um, art: k.art, titel: '💶 Kontostand eintragen', text: k.text, ttl: TTL[k.art], ziel: '#/konto' });
    }
  }
  return plan;
}

/**
 * Für wen eine Erinnerung an Sachen ist, wenn sie nur an wer bringt bzw. holt gehen soll (Einstellung `dienstErinnerung: 'dienst'`):
 * Hinbringen (auch am Vorabend) → wer an dem Tag bringt, Heimholen → wer abholt. null = an alle Telefone (auch wenn niemand eingetragen ist).
 */
function nurFuer(t, settings) {
  if (t.typ !== 'kita_sache' || settings?.dienstErinnerung !== 'dienst') return null;
  return dienstFuer(t.date, settings)[t.richtung === 'heim' ? 'h' : 'b'] || null;
}

/**
 * Plan der nächsten `tage` Tage: [{ id, um (ms), art: 'tag'|'stunde'|'vortag'|'abend', titel, text, ttl, nur? }], sortiert nach Zeitpunkt.
 * Die `id` hängt nur an Termin und Art (nicht am Zeitpunkt), damit zwei Telefone denselben Plan ohne Doppelungen schicken.
 * `nur` ('papa' | 'mama'): nur an die Telefone dieser Person (und an Telefone ohne Angabe, siehe meldungen.js).
 */
export async function planeErinnerungen(state, { jetzt = new Date(), tage = 60 } = {}) {
  const von = jetzt.getTime();
  const bis = von + tage * 24 * STUNDE;
  const plan = [];
  // Urlaub-Checks (1.3., 1.5., 1.7. um 09:00, solange Urlaub offen ist) laufen wie Termine; sie stehen nicht in `termine`, sondern ergeben sich aus dem Urlaubsstand
  const checks = state.urlaub && state.settings ? urlaubChecksWunsch(state, todayVienna(jetzt)).map((c) => ({ id: c.id, typ: 'urlaub_check', date: c.date, time: '09:00', titel: c.title })) : [];
  for (const t of [...(state.termine ?? []), ...checks]) {
    if (!TYPEN.includes(t.typ)) continue;
    const titel = t.typ === 'urlaub_check' ? t.titel : terminAnzeige(t, state.settings).titel;
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
    const nur = nurFuer(t, state.settings);
    for (const k of kandidaten) {
      if (k.um > von && k.um <= bis) plan.push({ id: await kennung(t.id, k.art), um: k.um, art: k.art, titel, text: k.text, ttl: TTL[k.art], ...(nur ? { nur } : {}) });
    }
  }
  plan.push(...(await kontoErinnerungen(state, von, bis)));
  return plan.sort((a, b) => a.um - b.um || a.id.localeCompare(b.id));
}
