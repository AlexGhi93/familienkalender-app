// Welche Push-Erinnerungen es für die nächsten Tage geben soll: reine Berechnung aus dem Zustand der App (ohne Netz, ohne Verschlüsselung).
// Regeln wie bei Google Kalender: Termin mit Uhrzeit = 1 Tag und 1 Stunde vorher; ohne Uhrzeit = am Vortag um 09:00.
import { addDays, isValidDate, todayVienna } from '../domain/dates.js';
import { PERSONEN, fehlendePersonen, leeresKonto, letzterTag } from '../domain/konto.js';
import { FUER } from '../domain/types.js';
import { dienstFuer } from '../domain/dienst.js';
import { instantZuWien, wienZuInstant } from '../domain/instant.js';
import { SCHICHT_PERSONEN, artFuer, standardKatalog, vorladeMonate } from '../domain/schicht.js';
import { vertragStatus } from '../domain/fixkosten.js';
import { datumAnzeige } from '../domain/eingabe.js';
import { terminAnzeige } from '../app/views/gemeinsam.js';
import { urlaubChecksWunsch } from '../app/urlaub-check.js';
import { bytesZuB64u } from './base64url.js';

const TYPEN = ['arzt', 'familie', 'kita_sache', 'urlaub_check'];
const STUNDE = 3600_000;
// Sekunden, die der Push-Server von Google/Apple die Nachricht für ein Telefon ohne Netz aufhebt: kommt es rechtzeitig wieder ins Netz, wird sie noch zugestellt
// („1 Stunde vorher“ nur bis kurz vor dem Termin, danach wäre sie sinnlos).
const TTL = { tag: 21600, stunde: 3300, vortag: 21600, abend: 14400, konto: 10800, konto2: 5400, frist: 21600 };
// Verträge, die sich um weniger als so viele Monate verlängern (z. B. monatlich kündbar), bekommen keine Erinnerung (sonst jeden Monat eine).
const FRIST_AB_VERLAENGERUNG = 3;

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
      if (k.um > von && k.um <= bis) plan.push({ id: await kennung(`konto-${monat}`, k.art), um: k.um, art: k.art, titel: '💶 Kontostand eintragen', text: k.text, ttl: TTL[k.art], ziel: '#/konto/kontostand' });
    }
  }
  return plan;
}

/**
 * Zusätze im Schichtplan (z. B. Mamas Dienstbesprechung), deren Art `erinnern` nicht ausgeschaltet hat: 1 Tag (24 h) und 1 Stunde vor Beginn,
 * nur an die Telefone dieser Person. Es zählen nur geladene Monate vom laufenden bis zwei danach: die hat jedes Telefon vorgeladen, so dass zwei
 * Telefone denselben Plan schicken (ein später angesehener Monat käme sonst nur von einem Telefon und würde vom anderen wieder gelöscht).
 * Kennung = Person, Datum, Art und Beginn: bleibt bei Neuberechnung gleich; ein Zusatz, der sich nur im Ende unterscheidet, erinnert einmal.
 */
async function zusatzErinnerungen(state, von, bis) {
  const schicht = state.schicht;
  if (!schicht?.monate) return [];
  const katalog = schicht.katalog ?? standardKatalog();
  const plan = [];
  const gesehen = new Set();
  for (const jm of vorladeMonate(todayVienna(new Date(von)).slice(0, 7))) {
    const monat = schicht.monate[jm];
    if (!monat?.z) continue;
    for (const person of SCHICHT_PERSONEN) {
      for (const [tag, liste] of Object.entries(monat.z[person] ?? {})) {
        const datum = `${jm}-${String(tag).padStart(2, '0')}`;
        for (const z of liste) {
          const art = artFuer(katalog, person, z.k);
          if (art?.gruppe !== 'zusatz' || art.erinnern === false) continue;
          const schluessel = `zusatz-${person}-${datum}-${z.k}-${z.von}`;
          if (gesehen.has(schluessel)) continue;
          gesehen.add(schluessel);
          let beginn;
          try {
            beginn = wienZuInstant(datum, z.von);
          } catch {
            continue; // eine Uhrzeit, die es in Wien nicht gibt
          }
          const kandidaten = [
            { art: 'tag', um: beginn - 24 * STUNDE, text: `Morgen um ${z.von}` },
            { art: 'stunde', um: beginn - STUNDE, text: `In 1 Stunde (${z.von} Uhr)` },
          ];
          for (const k of kandidaten) {
            if (k.um > von && k.um <= bis) plan.push({ id: await kennung(schluessel, k.art), um: k.um, art: k.art, titel: `📋 ${art.name}`, text: k.text, ttl: TTL[k.art], ziel: '#/schicht', nur: person });
          }
        }
      }
    }
  }
  return plan;
}

/**
 * Kündigungsfristen der Fixkosten: einen Monat vor „Kündbar bis“ (`vertragStatus(…).erinnerung`) um 09:00 (Wien), an BEIDE Telefone (ohne
 * `nur`); öffnet „Konto“. Nur nicht archivierte Posten (archiviert – auch mit einem Datum in der Zukunft – heißt: schon gekündigt,
 * läuft bis dahin; die Frist ist dann kein Thema mehr) mit laufendem Vertrag, der sich nicht oder um mindestens drei Monate verlängert.
 * Fällt auch die Erinnerung der nächsten Periode ins Fenster, kommt sie mit. Kennung = Posten und „Kündbar bis“: bleibt bei Neuberechnung gleich, auf beiden Telefonen. Der Text nennt Name und Datum, keinen Betrag.
 * Ein Posten, der sich nicht berechnen lässt, wird übersprungen; nichts hier darf den übrigen Plan verhindern.
 */
async function fristErinnerungen(state, von, bis) {
  const plan = [];
  try {
    const shards = state.fixkosten?.shards;
    if (!Array.isArray(shards)) return [];
    const heute = todayVienna(new Date(von));
    for (const posten of shards.flatMap((s) => (Array.isArray(s?.posten) ? s.posten : []))) {
      try {
        plan.push(...(await fristenEinesPostens(posten, heute, von, bis)));
      } catch {
        // dieser Posten lässt sich nicht berechnen: die anderen trotzdem
      }
    }
  } catch {
    // unbrauchbare Fixkosten im Zustand: ohne Kündigungsfristen weiter
  }
  return plan;
}

/** Die Erinnerungen eines Postens im Fenster (siehe fristErinnerungen); wirft bei unbrauchbaren Daten. */
async function fristenEinesPostens(posten, heute, von, bis) {
  const v = posten?.vertrag;
  if (posten?.archiv) return []; // archiviert = gekündigt (siehe fristErinnerungen)
  if (!v || (v.verlaengerung > 0 && v.verlaengerung < FRIST_AB_VERLAENGERUNG)) return [];
  if (typeof v.bis !== 'string' || !isValidDate(v.bis)) return []; // sonst fände die Verlängerung kein Ende
  const plan = [];
  let tag = heute;
  for (let runde = 0; runde < 4; runde += 1) {
    const status = vertragStatus(posten, tag);
    if (!status || status.beendet) break;
    const um = wienZuInstant(status.erinnerung, '09:00');
    if (um > bis) break;
    if (um > von) {
      plan.push({ id: await kennung(`frist-${posten.id}-${status.kuendbarBis}`, 'frist'), um, art: 'frist', titel: '📝 Kündigungsfrist', text: `${posten.name}: kündbar bis ${datumAnzeige(status.kuendbarBis)} (in 1 Monat)`, ttl: TTL.frist, ziel: '#/konto/fixkosten' });
    }
    if (!(v.verlaengerung > 0)) break; // ohne Verlängerung gibt es nur diese eine Frist
    tag = addDays(status.kuendbarBis, 1); // die nächste Periode
  }
  return plan;
}

/**
 * Wovon der Plan abhängt, oder null = noch nicht senden: erst nach dem frischen Laden (nie aus dem gespeicherten Stand) und erst, wenn der
 * Schichtplan für den laufenden Monat (Wien, `jetzt`) vorgeladen ist; sonst fehlten im Plan Erinnerungen an Zusätze (oder, nach dem
 * Monatswechsel bei offener App, die des neuen dritten Monats), und der Push-Dienst würde sie löschen. Gilt für jeden Weg, auf dem der
 * Plan gesendet wird (Shell und push/client.js `sync`). „Vorgeladen“ schließt die Fixkosten ein (Kündigungsfristen, siehe
 * store.schichtVorladen). Der bloße Ladestatus zählt nicht, nur Schichtarten, Monate und die Teile der Fixkosten.
 */
export function planQuellen(state, jetzt = new Date()) {
  if (!state?.geladen || state.nurSnapshot) return null;
  const monat = todayVienna(jetzt).slice(0, 7);
  if (state.schicht?.vorgeladen !== monat) return null;
  return [state.termine, state.settings, state.urlaub, state.konto, state.schicht.katalog, state.schicht.monate, state.fixkosten?.shards ?? null, monat];
}

/** Hat sich seit dem letzten Senden (`vorher`, null = noch nie) etwas geändert, wovon der Plan abhängt? */
export function quellenGeaendert(neu, vorher) {
  if (!neu) return false;
  return !vorher || neu.length !== vorher.length || neu.some((q, i) => q !== vorher[i]);
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
 * Plan der nächsten `tage` Tage: [{ id, um (ms), art: 'tag'|'stunde'|'vortag'|'abend'|'konto'|'konto2'|'frist', titel, text, ttl, ziel?, nur? }], sortiert nach Zeitpunkt.
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
  plan.push(...(await zusatzErinnerungen(state, von, bis)));
  plan.push(...(await fristErinnerungen(state, von, bis)));
  return plan.sort((a, b) => a.um - b.um || a.id.localeCompare(b.id));
}
