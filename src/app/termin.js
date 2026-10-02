import { addDays, isValidDate } from '../domain/dates.js';
import { ARZT_SUBTYPEN, KITA_RICHTUNGEN } from '../domain/types.js';
import { mitnehmenFor, normalizeSettings } from '../domain/settings.js';
import { SEP, TITLE_LIMIT, titleLength } from '../domain/titles.js';
import { terminAnzeige } from './views/gemeinsam.js';
import { naechsterKitaTag } from './serie.js';

export const MAX_TITEL = 30;
export const MAX_MITNEHMEN_EINTRAG = 30;
export const MAX_MITNEHMEN = 8;
export const MAX_BETRAG = 9999;

const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const SERIE = /^[0-9a-v]{5,40}$/;

/** Entfernt, was beim Zurücklesen aus dem Kalendertitel stören würde (Trennzeichen „ · “ und Kommas). */
function ohneTrenner(text) {
  return String(text).replaceAll(SEP, ' - ').replaceAll(',', ' ').replace(/\s+/g, ' ').trim();
}

/** '12,50' -> 12.5; leer -> null; Unsinn oder negativ -> NaN. */
export function betragAusText(text) {
  const t = String(text ?? '').trim().replace(/\s*€$/, '').replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const betrag = Number(t);
  return betrag <= MAX_BETRAG ? Math.round(betrag * 100) / 100 : NaN;
}

function pruefeKosten(kosten) {
  if (kosten == null) return null;
  if (kosten.kostenlos === true) return { kostenlos: true };
  if (typeof kosten.betrag === 'number' && Number.isFinite(kosten.betrag) && kosten.betrag >= 0 && kosten.betrag <= MAX_BETRAG) {
    return { betrag: Math.round(kosten.betrag * 100) / 100 };
  }
  throw new Error('Der Betrag ist ungültig.');
}

function pruefeMitnehmen(liste) {
  if (!Array.isArray(liste)) throw new Error('Mitnehmen ist ungültig.');
  const sauber = [];
  for (const eintrag of liste) {
    const text = ohneTrenner(eintrag);
    if (text === '' || sauber.includes(text)) continue;
    if (text.length > MAX_MITNEHMEN_EINTRAG) throw new Error(`„${text.slice(0, 12)}…“ ist zu lang (höchstens ${MAX_MITNEHMEN_EINTRAG} Zeichen).`);
    sauber.push(text);
  }
  if (sauber.length > MAX_MITNEHMEN) throw new Error(`Höchstens ${MAX_MITNEHMEN} Dinge zum Mitnehmen.`);
  return sauber;
}

/** Sachen für Krabbelstube/Kindergarten: Richtung, Uhrzeit und mindestens eine Sache sind Pflicht; Kosten gibt es nicht. */
function normalisiereSache(roh, zeit) {
  if (!KITA_RICHTUNGEN[roh.richtung]) throw new Error('Bitte die Richtung wählen (Hinbringen oder Heimholen).');
  if (zeit === null) throw new Error('Bitte die Uhrzeit angeben.');
  const mitnehmen = pruefeMitnehmen(roh.mitnehmen ?? []);
  if (mitnehmen.length === 0) throw new Error('Bitte mindestens eine Sache wählen.');
  const ergebnis = { typ: 'kita_sache', richtung: roh.richtung, date: roh.date, time: zeit, mitnehmen, kosten: null };
  if (roh.serie != null) {
    if (typeof roh.serie !== 'string' || !SERIE.test(roh.serie)) throw new Error('Die Serie ist ungültig.');
    ergebnis.serie = roh.serie;
  }
  return ergebnis;
}

/**
 * Prüft und bereinigt einen Termin aus dem Formular. Wirft einen Error mit deutscher Meldung,
 * die direkt angezeigt werden kann. Ergebnis hat immer die Felder: typ, date, time, mitnehmen, kosten
 * und je nach Typ subtyp (arzt) oder label (familie). Die `id` kommt vom Aufrufer.
 */
export function normalisiereTermin(roh) {
  if (!roh || !['arzt', 'familie', 'kita_sache'].includes(roh.typ)) throw new Error('Unbekannte Art von Termin.');
  if (typeof roh.date !== 'string' || !isValidDate(roh.date)) throw new Error('Bitte ein gültiges Datum wählen.');

  const zeit = roh.time == null || roh.time === '' ? null : roh.time;
  if (zeit !== null && !ZEIT.test(zeit)) throw new Error('Die Uhrzeit ist ungültig.');
  if (roh.typ === 'kita_sache') return normalisiereSache(roh, zeit);

  const gemeinsam = { typ: roh.typ, date: roh.date, time: zeit, mitnehmen: pruefeMitnehmen(roh.mitnehmen ?? []), kosten: pruefeKosten(roh.kosten) };

  if (roh.typ === 'arzt') {
    if (!ARZT_SUBTYPEN[roh.subtyp]) throw new Error('Bitte die Art des Arzttermins wählen.');
    if (zeit === null) throw new Error('Bitte die Uhrzeit angeben.');
    return { ...gemeinsam, subtyp: roh.subtyp };
  }
  const label = String(roh.label ?? '').replaceAll(SEP, ' - ').replace(/\s+/g, ' ').trim();
  if (label === '') throw new Error('Bitte einen Titel eingeben.');
  if (label.length > MAX_TITEL) throw new Error(`Der Titel ist zu lang (höchstens ${MAX_TITEL} Zeichen).`);
  return { ...gemeinsam, label };
}

/** Ausgangszustand des Formulars: neuer Termin der Art `art` oder ein vorhandener `termin` zum Bearbeiten. */
export function terminEntwurf(art, { settings, heute, termin = null, state = null }) {
  if (termin) {
    const k = termin.kosten;
    const basis = {
      auswahl: termin.typ,
      bearbeiten: termin.id,
      subtyp: termin.subtyp ?? 'kinderarzt',
      label: termin.label ?? '',
      date: termin.date,
      time: termin.time ?? '',
      mitnehmen: [...termin.mitnehmen],
      kosten: k?.kostenlos ? { art: 'kostenlos', text: '' } : k ? { art: 'betrag', text: String(k.betrag).replace('.', ',') } : { art: 'keine', text: '' },
    };
    if (termin.typ !== 'kita_sache') return basis;
    return { ...basis, richtung: termin.richtung ?? 'hin', serie: termin.serie ?? null, zeitGeaendert: true, wiederholen: { art: 'einmalig', wochen: 8 } };
  }
  if (art === 'kita_sache') {
    let datum = addDays(heute, 1);
    if (state) {
      try {
        datum = naechsterKitaTag(state, heute);
      } catch {
        // keine Betreuungstage eingestellt: morgen ist ein vernünftiger Vorschlag
      }
    }
    return {
      auswahl: 'kita_sache',
      bearbeiten: null,
      subtyp: 'kinderarzt',
      label: '',
      richtung: 'hin',
      date: datum,
      time: settings.bringzeit,
      zeitGeaendert: false,
      mitnehmen: [],
      wiederholen: { art: 'einmalig', wochen: 8 },
      serie: null,
      kosten: { art: 'keine', text: '' },
    };
  }
  return {
    auswahl: art,
    bearbeiten: null,
    subtyp: 'kinderarzt',
    label: '',
    date: heute,
    time: art === 'arzt' ? '09:00' : '',
    mitnehmen: art === 'arzt' ? [...mitnehmenFor('kinderarzt', settings)] : [],
    kosten: { art: 'keine', text: '' },
  };
}

/** Richtung wechseln; die Uhrzeit folgt (Bring-/Abholzeit), solange sie nicht von Hand geändert wurde. */
export function mitRichtung(e, richtung, settings) {
  const zeit = e.zeitGeaendert ? e.time : richtung === 'heim' ? settings.abholzeit : settings.bringzeit;
  return { ...e, richtung, time: zeit };
}

/** Wandelt den Formularzustand in die Rohdaten für `normalisiereTermin`. */
export function terminAusEntwurf(e) {
  if (e.auswahl === 'kita_sache') {
    const roh = { typ: 'kita_sache', richtung: e.richtung, date: e.date, time: e.time, mitnehmen: e.mitnehmen, kosten: null };
    if (e.serie) roh.serie = e.serie;
    return roh;
  }
  let kosten = null;
  if (e.kosten.art === 'kostenlos') kosten = { kostenlos: true };
  if (e.kosten.art === 'betrag') {
    const betrag = betragAusText(e.kosten.text);
    if (betrag === null) throw new Error('Bitte den Betrag eingeben.');
    kosten = { betrag }; // NaN wird von normalisiereTermin als ungültig abgelehnt
  }
  const roh = { typ: e.auswahl, date: e.date, time: e.time, mitnehmen: e.mitnehmen, kosten };
  return e.auswahl === 'arzt' ? { ...roh, subtyp: e.subtyp } : { ...roh, label: e.label };
}

/** Live-Vorschau: so steht der Termin im Kalender und in der Benachrichtigung. */
export function terminVorschau(e, settings = normalizeSettings()) {
  try {
    const termin = normalisiereTermin(terminAusEntwurf(e));
    const titel = terminAnzeige({ id: 'vorschau', ...termin }, settings).titel;
    const laenge = titleLength(titel);
    return { ok: true, titel, laenge, limit: TITLE_LIMIT, zuLang: laenge > TITLE_LIMIT };
  } catch (fehler) {
    return { ok: false, meldung: fehler.message };
  }
}
