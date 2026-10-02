import { isValidDate } from '../domain/dates.js';
import { ARZT_SUBTYPEN } from '../domain/types.js';
import { mitnehmenFor } from '../domain/settings.js';
import { SEP, TITLE_LIMIT, titleLength } from '../domain/titles.js';
import { terminAnzeige } from './views/gemeinsam.js';

export const MAX_TITEL = 30;
export const MAX_MITNEHMEN_EINTRAG = 30;
export const MAX_MITNEHMEN = 8;
export const MAX_BETRAG = 9999;

const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

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

/**
 * Prüft und bereinigt einen Termin aus dem Formular. Wirft einen Error mit deutscher Meldung,
 * die direkt angezeigt werden kann. Ergebnis hat immer die Felder: typ, date, time, mitnehmen, kosten
 * und je nach Typ subtyp (arzt) oder label (familie). Die `id` kommt vom Aufrufer.
 */
export function normalisiereTermin(roh) {
  if (!roh || (roh.typ !== 'arzt' && roh.typ !== 'familie')) throw new Error('Unbekannte Art von Termin.');
  if (typeof roh.date !== 'string' || !isValidDate(roh.date)) throw new Error('Bitte ein gültiges Datum wählen.');

  const zeit = roh.time == null || roh.time === '' ? null : roh.time;
  if (zeit !== null && !ZEIT.test(zeit)) throw new Error('Die Uhrzeit ist ungültig.');

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
export function terminEntwurf(art, { settings, heute, termin = null }) {
  if (termin) {
    const k = termin.kosten;
    return {
      auswahl: termin.typ,
      bearbeiten: termin.id,
      subtyp: termin.subtyp ?? 'kinderarzt',
      label: termin.label ?? '',
      date: termin.date,
      time: termin.time ?? '',
      mitnehmen: [...termin.mitnehmen],
      kosten: k?.kostenlos ? { art: 'kostenlos', text: '' } : k ? { art: 'betrag', text: String(k.betrag).replace('.', ',') } : { art: 'keine', text: '' },
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

/** Wandelt den Formularzustand in die Rohdaten für `normalisiereTermin`. */
export function terminAusEntwurf(e) {
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
export function terminVorschau(e) {
  try {
    const termin = normalisiereTermin(terminAusEntwurf(e));
    const titel = terminAnzeige({ id: 'vorschau', ...termin }).titel;
    const laenge = titleLength(titel);
    return { ok: true, titel, laenge, limit: TITLE_LIMIT, zuLang: laenge > TITLE_LIMIT };
  } catch (fehler) {
    return { ok: false, meldung: fehler.message };
  }
}
