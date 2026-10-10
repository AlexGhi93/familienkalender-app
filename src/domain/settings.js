import { isValidDate } from './dates.js';
import { SEP } from './titles.js';
import { ARZT_SUBTYPEN } from './types.js';

export const MAX_LISTEN_EINTRAG = 30; // Zeichen je Eintrag in „Mitnehmen“- und „Eigene Sachen“-Listen
export const MAX_MITNEHMEN_LISTE = 8; // Einträge je Arzt-Untertyp (wie viele Dinge ein Termin tragen kann)
export const MAX_SACHEN_EIGENE = 20; // eigene Vorschläge für „Sachen“

// Nachrichten an die Krabbelstube bzw. den Kindergarten (Texte in src/app/nachrichten.js)
export const GRUSSFORMELN = Object.freeze(['Liebe Grüße', 'Viele Grüße', 'Mit freundlichen Grüßen']);
export const MAX_TELEFON = 30;
export const TELEFON_ZEICHEN = /^[\d +\-/()]*$/; // Ziffern, Leerzeichen und + - / ( )
export const MAX_EMAIL = 80;
export const EMAIL_FORM = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // einfache Prüfung: etwas@etwas.etwas
export const MAX_UNTERSCHRIFT = 60;
export const MAX_ESSEN_PREIS_CENT = 5000; // höchstens 50 € pro Mittagessen

export const DEFAULT_SETTINGS = Object.freeze({
  wechseldatum: null, // 'JJJJ-MM-TT' ab dem es „Kindergarten“ heißt
  erwartung: [0, 1, 2, 3, 4], // erwartete Wochentage, Montag = 0
  erfassungAb: null, // 'JJJJ-MM-TT' ab dem die Anwesenheit verfolgt wird
  jahresstart: '09-01', // Beginn des Kindergartenjahres, 'MM-TT'
  zielWochen: 5,
  durchgehendWochen: 2,
  schliessZaehlenAlsUrlaub: false,
  mitnehmen: {}, // eigene Mitnehmen-Listen je Arzt-Untertyp
  sachenEigene: [], // eigene Vorschläge für „Sachen für Krabbelstube/Kindergarten“ (Gruppe „Eigene“)
  bringzeit: '07:30', // Standard-Uhrzeit für „Sachen hinbringen“
  abholzeit: '15:30', // Standard-Uhrzeit für „Sachen heimholen“
  vorabend: '18:00', // Erinnerung am Vorabend für „Sachen hinbringen“ (zum Vorbereiten); '' = aus
  kontoErinnerung: '18:00', // Uhrzeit der Erinnerung „Kontostand eintragen“ am letzten Tag des Monats; '' = aus
  kindname: '', // Vorname des Kindes für „Für wen“; leer = „Kind“ (steht nicht im Programmtext)
  kindGeschlecht: '', // 'w' | 'm' für „sie“/„er“ in Nachrichten; '' = keine Angabe (dann steht der Name)
  einrichtungTelefon: '', // Telefonnummer der Krabbelstube/des Kindergartens für WhatsApp und SMS; '' = keine
  einrichtungEmail: '', // E-Mail-Adresse der Krabbelstube/des Kindergartens; '' = keine
  nachrichtGruss: 'Liebe Grüße', // Grußformel unter Nachrichten (eine aus GRUSSFORMELN)
  nachrichtUnterschrift: '', // Unterschrift unter Nachrichten; '' = „Die Eltern von …“
  essenPreisCent: null, // Preis pro Mittagessen in Cent (für „Essensgeld“ im Monat); null = aus
});

function fehler(feld) {
  return new Error(`Ungültige Einstellung: ${feld}`);
}

const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

function pruefeZeit(wert, feld) {
  if (typeof wert !== 'string' || !ZEIT.test(wert)) throw fehler(feld);
  return wert;
}

const MAX_KINDNAME = 20;

function pruefeKindname(wert) {
  if (typeof wert !== 'string') throw fehler('kindname');
  const name = wert.trim();
  if (name.length > MAX_KINDNAME || /[(),]| · /.test(name)) throw fehler('kindname');
  return name;
}

/** Entfernt, was beim Zurücklesen aus dem Kalendertitel stören würde (Trenner „ · “ und Kommas), und glättet den Leerraum. */
export function bereinigeListenEintrag(text) {
  return String(text ?? '').replaceAll(SEP, ' - ').replaceAll(',', ' ').replace(/\s+/g, ' ').trim();
}

/** Liste kurzer Texte: bereinigt, ohne Doppelte (Groß/Klein egal), höchstens `max` Einträge; Ungültiges wirft. */
function pruefeTextListe(wert, feld, max) {
  if (!Array.isArray(wert) || wert.length > max) throw fehler(feld);
  const gesehen = new Set();
  const liste = [];
  for (const eintrag of wert) {
    if (typeof eintrag !== 'string') throw fehler(feld);
    const text = bereinigeListenEintrag(eintrag);
    if (text === '' || text.length > MAX_LISTEN_EINTRAG) throw fehler(feld);
    const schluessel = text.toLocaleLowerCase('de');
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    liste.push(text);
  }
  return liste;
}

/** Text mit Höchstlänge und Form (`muster`); vorne und hinten ohne Leerraum, '' ist erlaubt. */
function pruefeText(wert, feld, max, muster = null) {
  if (typeof wert !== 'string') throw fehler(feld);
  const text = wert.trim();
  if (text.length > max || (text !== '' && muster && !muster.test(text))) throw fehler(feld);
  return text;
}

function pruefeDatumOderNull(wert, feld) {
  if (wert === null) return null;
  if (typeof wert !== 'string' || !isValidDate(wert)) throw fehler(feld);
  return wert;
}

/** Ergänzt fehlende Felder mit Standardwerten und prüft alle Werte streng. */
export function normalizeSettings(gespeichert = {}) {
  const s = { ...DEFAULT_SETTINGS, ...gespeichert };

  const wechseldatum = pruefeDatumOderNull(s.wechseldatum, 'wechseldatum');
  const erfassungAb = pruefeDatumOderNull(s.erfassungAb, 'erfassungAb');

  if (
    !Array.isArray(s.erwartung) ||
    s.erwartung.some((n) => !Number.isInteger(n) || n < 0 || n > 6) ||
    new Set(s.erwartung).size !== s.erwartung.length
  ) {
    throw fehler('erwartung');
  }
  const erwartung = [...s.erwartung].sort((a, b) => a - b);

  if (typeof s.jahresstart !== 'string' || !isValidDate(`2001-${s.jahresstart}`)) {
    throw fehler('jahresstart');
  }
  if (!Number.isInteger(s.zielWochen) || s.zielWochen < 1 || s.zielWochen > 52) {
    throw fehler('zielWochen');
  }
  if (
    !Number.isInteger(s.durchgehendWochen) ||
    s.durchgehendWochen < 0 ||
    s.durchgehendWochen > s.zielWochen
  ) {
    throw fehler('durchgehendWochen');
  }
  if (typeof s.schliessZaehlenAlsUrlaub !== 'boolean') throw fehler('schliessZaehlenAlsUrlaub');

  if (typeof s.mitnehmen !== 'object' || s.mitnehmen === null || Array.isArray(s.mitnehmen)) {
    throw fehler('mitnehmen');
  }
  const mitnehmen = {};
  for (const [subtyp, liste] of Object.entries(s.mitnehmen)) {
    if (!ARZT_SUBTYPEN[subtyp]) throw fehler('mitnehmen');
    mitnehmen[subtyp] = pruefeTextListe(liste, 'mitnehmen', MAX_MITNEHMEN_LISTE);
  }
  const sachenEigene = pruefeTextListe(s.sachenEigene, 'sachenEigene', MAX_SACHEN_EIGENE);

  const bringzeit = pruefeZeit(s.bringzeit, 'bringzeit');
  const abholzeit = pruefeZeit(s.abholzeit, 'abholzeit');
  const vorabend = s.vorabend === '' ? '' : pruefeZeit(s.vorabend, 'vorabend');
  const kontoErinnerung = s.kontoErinnerung === '' ? '' : pruefeZeit(s.kontoErinnerung, 'kontoErinnerung');
  const kindname = pruefeKindname(s.kindname);

  if (!['', 'w', 'm'].includes(s.kindGeschlecht)) throw fehler('kindGeschlecht');
  const einrichtungTelefon = pruefeText(s.einrichtungTelefon, 'einrichtungTelefon', MAX_TELEFON, TELEFON_ZEICHEN);
  const einrichtungEmail = pruefeText(s.einrichtungEmail, 'einrichtungEmail', MAX_EMAIL, EMAIL_FORM);
  if (!GRUSSFORMELN.includes(s.nachrichtGruss)) throw fehler('nachrichtGruss');
  if (typeof s.nachrichtUnterschrift !== 'string') throw fehler('nachrichtUnterschrift');
  const nachrichtUnterschrift = pruefeText(s.nachrichtUnterschrift.replace(/\s+/g, ' '), 'nachrichtUnterschrift', MAX_UNTERSCHRIFT);
  if (s.essenPreisCent !== null && (!Number.isInteger(s.essenPreisCent) || s.essenPreisCent < 1 || s.essenPreisCent > MAX_ESSEN_PREIS_CENT)) {
    throw fehler('essenPreisCent');
  }

  return {
    wechseldatum,
    erwartung,
    erfassungAb,
    jahresstart: s.jahresstart,
    zielWochen: s.zielWochen,
    durchgehendWochen: s.durchgehendWochen,
    schliessZaehlenAlsUrlaub: s.schliessZaehlenAlsUrlaub,
    mitnehmen,
    sachenEigene,
    bringzeit,
    abholzeit,
    vorabend,
    kontoErinnerung,
    kindname,
    kindGeschlecht: s.kindGeschlecht,
    einrichtungTelefon,
    einrichtungEmail,
    nachrichtGruss: s.nachrichtGruss,
    nachrichtUnterschrift,
    essenPreisCent: s.essenPreisCent,
  };
}

/** Eigene Liste aus den Einstellungen, sonst die Standardliste des Untertyps. */
export function mitnehmenFor(subtyp, settings) {
  if (!ARZT_SUBTYPEN[subtyp]) throw new Error(`Unbekannter Arzt-Untertyp: ${subtyp}`);
  return settings.mitnehmen[subtyp] ?? ARZT_SUBTYPEN[subtyp].mitnehmen;
}
