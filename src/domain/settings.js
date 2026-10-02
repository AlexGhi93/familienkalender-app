import { isValidDate } from './dates.js';
import { ARZT_SUBTYPEN } from './types.js';

export const DEFAULT_SETTINGS = Object.freeze({
  wechseldatum: null, // 'JJJJ-MM-TT' ab dem es „Kindergarten“ heißt
  erwartung: [0, 1, 2, 3, 4], // erwartete Wochentage, Montag = 0
  erfassungAb: null, // 'JJJJ-MM-TT' ab dem die Anwesenheit verfolgt wird
  jahresstart: '09-01', // Beginn des Kindergartenjahres, 'MM-TT'
  zielWochen: 5,
  durchgehendWochen: 2,
  schliessZaehlenAlsUrlaub: false,
  mitnehmen: {}, // eigene Mitnehmen-Listen je Arzt-Untertyp
  bringzeit: '07:30', // Standard-Uhrzeit für „Sachen hinbringen“
  abholzeit: '15:30', // Standard-Uhrzeit für „Sachen heimholen“
});

function fehler(feld) {
  return new Error(`Ungültige Einstellung: ${feld}`);
}

const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

function pruefeZeit(wert, feld) {
  if (typeof wert !== 'string' || !ZEIT.test(wert)) throw fehler(feld);
  return wert;
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
  for (const [subtyp, liste] of Object.entries(s.mitnehmen)) {
    if (!ARZT_SUBTYPEN[subtyp] || !Array.isArray(liste) || liste.some((x) => typeof x !== 'string')) {
      throw fehler('mitnehmen');
    }
  }

  const bringzeit = pruefeZeit(s.bringzeit, 'bringzeit');
  const abholzeit = pruefeZeit(s.abholzeit, 'abholzeit');

  return {
    wechseldatum,
    erwartung,
    erfassungAb,
    jahresstart: s.jahresstart,
    zielWochen: s.zielWochen,
    durchgehendWochen: s.durchgehendWochen,
    schliessZaehlenAlsUrlaub: s.schliessZaehlenAlsUrlaub,
    mitnehmen: { ...s.mitnehmen },
    bringzeit,
    abholzeit,
  };
}

/** Eigene Liste aus den Einstellungen, sonst die Standardliste des Untertyps. */
export function mitnehmenFor(subtyp, settings) {
  if (!ARZT_SUBTYPEN[subtyp]) throw new Error(`Unbekannter Arzt-Untertyp: ${subtyp}`);
  return settings.mitnehmen[subtyp] ?? ARZT_SUBTYPEN[subtyp].mitnehmen;
}
