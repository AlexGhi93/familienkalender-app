// Einrichtung der drei Familienkalender (Besitzer) und Anschluss des zweiten Elternteils (Abonnieren per „Code“).
// Wichtig: Einladungen per E-Mail fügen die Kalender NICHT in die Liste des zweiten Elternteils ein (Spike); darum
// abonniert dessen App sie selbst. Die Freigabe selbst geht mit dem schmalen Scope meist nur manuell (Probe C19).
import { CALENDAR_NAMES } from '../domain/types.js';
import { CONFIG } from './config.js';

export const KALENDER_SCHLUESSEL = Object.freeze(['termine', 'abwesenheit', 'anwesenheit']);

/** Sichtbarkeit und Standard-Erinnerungen je Kalender (Design §2): Termine mit 1 Tag + 1 Stunde, Anwesenheit versteckt. */
const EINSTELLUNG = Object.freeze({
  termine: { selected: true, defaultReminders: [{ method: 'popup', minutes: 1440 }, { method: 'popup', minutes: 60 }] },
  abwesenheit: { selected: true, defaultReminders: [] },
  anwesenheit: { selected: false, defaultReminders: [] },
});

export class FreigabeFehlt extends Error {
  /** `art`: 'nicht-geteilt' (Kalender unsichtbar) oder 'nur-lesen' (ohne Schreibrecht geteilt). */
  constructor(art, namen) {
    super(
      art === 'nicht-geteilt'
        ? `Diese Kalender sind für dich noch nicht freigegeben: ${namen.join(', ')}. Bitte den Besitzer, sie in Google Kalender mit dir zu teilen (mit „Änderungen vornehmen“), und dann noch einmal versuchen.`
        : `Diese Kalender sind nur zum Lesen geteilt: ${namen.join(', ')}. Bitte den Besitzer, dir das Schreibrecht „Änderungen vornehmen“ zu geben.`,
    );
    this.name = 'FreigabeFehlt';
    this.art = art;
    this.namen = namen;
  }
}

function pruefeAntwort(r, was) {
  if (r.status !== 200) throw new Error(`${was} hat nicht geklappt (Google-Antwort ${r.status}).`);
  return r.daten;
}

/** Besitzer: findet oder legt die drei Kalender an und stellt sie ein. Gibt { kalender, neuAngelegt } zurück. */
export async function richteEin(api) {
  const liste = await api.kalenderListe.liste();
  const kalender = {};
  const neuAngelegt = [];
  for (const k of KALENDER_SCHLUESSEL) {
    const name = CALENDAR_NAMES[k];
    const treffer = liste.filter((e) => e.summary === name && e.accessRole === 'owner');
    if (treffer.length > 1) {
      throw new Error(`Es gibt mehrere eigene Kalender mit dem Namen „${name}“. Bitte in Google Kalender die doppelten löschen und noch einmal versuchen.`);
    }
    if (treffer.length === 1) {
      kalender[k] = treffer[0].id;
    } else {
      kalender[k] = (await api.kalender.einfuegen({ summary: name, timeZone: CONFIG.zeitzone })).id;
      neuAngelegt.push(k);
    }
  }
  for (const k of KALENDER_SCHLUESSEL) pruefeAntwort(await api.kalenderListe.patch(kalender[k], EINSTELLUNG[k]), `Das Einstellen von „${CALENDAR_NAMES[k]}“`);
  return { kalender, neuAngelegt };
}

// ---------- Freigabe (Besitzer → zweites Elternteil) ----------

const SIEGEL = Symbol('freigabe-vorschau');
const EMAIL = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

/** Bereitet die Freigabe vor: bereinigte Adresse, Buchstabe für Buchstabe angezeigt, mit klarem Umfang. Nichts wird gesendet. */
export function freigabeVorschau(eingabe) {
  const email = String(eingabe ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) throw new Error('Bitte genau eine gültige E-Mail-Adresse eingeben.');
  return {
    email,
    anzeige: [...email].join(' '),
    zeilen: [`Du gibst ${email} Schreibrecht auf 3 Kalender („Termine“, „Abwesenheit“, „Anwesenheit“).`, 'Prüfe die Adresse genau: wer sie hat, kann alles darin sehen und ändern.'],
    siegel: SIEGEL,
  };
}

/**
 * Gibt die Kalender frei (immer als `writer`, ohne E-Mail von Google). Nur mit der Vorschau UND der zweiten Bestätigung
 * `{ bestaetigt: true }`. Verbietet Google es (das ist mit dem schmalen Scope üblich), ist das kein Fehler: `geteilt: false`,
 * dann gilt die manuelle Freigabe in Google Kalender.
 */
export async function teile(api, kalender, vorschau, { bestaetigt } = {}) {
  if (vorschau?.siegel !== SIEGEL || bestaetigt !== true) throw new Error('Die Freigabe wurde nicht bestätigt.');
  const ergebnisse = [];
  for (const k of KALENDER_SCHLUESSEL) {
    const r = await api.acl.einfuegen(kalender[k], { email: vorschau.email });
    ergebnisse.push({ kalender: k, ...r });
    if (!r.ok) return { geteilt: false, ergebnisse };
  }
  return { geteilt: true, ergebnisse };
}

// ---------- Zweites Elternteil ----------

/** Abonniert die geteilten Kalender in der eigenen Liste (mit Sichtbarkeit und Erinnerungen). Wirft FreigabeFehlt, wenn etwas fehlt. */
export async function abonniere(api, kalender) {
  const fehlend = [];
  const nurLesen = [];
  for (const k of KALENDER_SCHLUESSEL) {
    let r = await api.kalenderListe.einfuegen({ id: kalender[k], ...EINSTELLUNG[k] });
    if (r.status === 409) r = await api.kalenderListe.patch(kalender[k], EINSTELLUNG[k]); // schon abonniert
    if (r.status === 404) {
      fehlend.push(CALENDAR_NAMES[k]);
      continue;
    }
    const daten = pruefeAntwort(r, `Das Abonnieren von „${CALENDAR_NAMES[k]}“`);
    if (!['writer', 'owner'].includes(daten?.accessRole)) nurLesen.push(CALENDAR_NAMES[k]);
  }
  if (fehlend.length > 0) throw new FreigabeFehlt('nicht-geteilt', fehlend);
  if (nurLesen.length > 0) throw new FreigabeFehlt('nur-lesen', nurLesen);
  return { ok: true };
}

// ---------- Einrichtungscode ----------

const SUFFIX = '@group.calendar.google.com';
const VORSILBE = 'FK1';
const TEIL = /^[0-9a-z_]{3,64}$/;

function pruefsumme(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 6);
}

/** Kurzer Code für das zweite Elternteil: nur Kalender-IDs (keine Zugangsdaten) mit Prüfsumme gegen Abtippfehler. */
export function codeErzeugen(kalender) {
  const teile_ = KALENDER_SCHLUESSEL.map((k) => {
    const id = kalender?.[k];
    if (typeof id !== 'string' || !id.endsWith(SUFFIX) || !TEIL.test(id.slice(0, -SUFFIX.length))) throw new Error(`Die Kalender-ID für „${CALENDAR_NAMES[k]}“ ist ungültig.`);
    return id.slice(0, -SUFFIX.length);
  });
  const kern = `${VORSILBE}.${teile_.join('.')}`;
  return `${kern}.${pruefsumme(kern)}`;
}

const CODE_FEHLER = 'Der Code ist unvollständig oder falsch kopiert. Bitte den Code noch einmal vom anderen Telefon kopieren.';

/** Liest einen Code zurück in die drei Kalender-IDs; wirft bei Tippfehlern, Kürzungen und fremden Texten. */
export function codeLesen(text) {
  const teile_ = String(text ?? '').replace(/\s+/g, '').split('.');
  if (teile_.length !== 5 || teile_[0].toUpperCase() !== VORSILBE) throw new Error(CODE_FEHLER);
  const ids = teile_.slice(1, 4);
  const kern = `${VORSILBE}.${ids.join('.')}`;
  if (!ids.every((t) => TEIL.test(t)) || pruefsumme(kern) !== teile_[4].toLowerCase()) throw new Error(CODE_FEHLER);
  return Object.fromEntries(KALENDER_SCHLUESSEL.map((k, i) => [k, `${ids[i]}${SUFFIX}`]));
}
