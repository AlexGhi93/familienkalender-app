// Reine Umrechnung zwischen dem App-Modell und Google-Kalender-Ereignissen: kein Netz, kein DOM.
// Grundlage: Titel sind die einzige Quelle für Mitnehmen/Kosten, die echte Startzeit gilt für die Uhrzeit,
// und das Verhalten der API ist in docs/spike/CONTRACT.md belegt.
import { addDays } from '../domain/dates.js';
import { eventSpan, spanDays, toGoogleAllDay } from '../domain/span.js';
import { dayEventId, istUrlaubCheckId, urlaubCheckEventId } from '../domain/ids.js';
import { FAMILIE_SYMBOLE, FUER, TAGES_TYPEN, TYPES } from '../domain/types.js';
import { buildDayTitle, needsTimeResync, ohneKlammer, parseKitaSacheLabel, parseTerminTitle, withTime } from '../domain/titles.js';
import { notizAusBeschreibung } from '../domain/notiz.js';
import { normalisiereRegister, registerText } from '../push/geraete.js';
import { einkaufAusText, einkaufText } from '../domain/einkauf.js';
import { kontoAusText, kontoText } from '../domain/konto.js';
import { classifyEvent } from '../domain/classify.js';
import { zeitAusDateTime } from '../domain/format.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../domain/settings.js';
import { terminAnzeige } from '../app/views/gemeinsam.js';
import { CONFIG } from './config.js';

export const EINSTELLUNGEN_ID = 'fkeinstellungen';
export const GERAETE_ID = 'fkgeraete'; // Register der Telefone für Push-Erinnerungen (siehe push/geraete.js)
export const EINKAUF_ID = 'fkeinkauf'; // gemeinsame Einkaufsliste (siehe domain/einkauf.js)
export const KONTO_ID = 'fkkonto'; // monatliche Kontostände von Papa und Mama (siehe domain/konto.js)
export const TEST_ID = 'fktest'; // „🔔 Test-Erinnerung“ aus Mehr → Erinnerungen: für die App unsichtbar
export const MAX_EINSTELLUNGEN_ZEICHEN = 6000; // Google kürzt `description` still bei 8192 Zeichen (Vertragsprobe C11b)
const TERMIN_MINUTEN = 30;
export const ERINNERUNG_VORHER = [{ method: 'popup', minutes: 1440 }, { method: 'popup', minutes: 60 }]; // 1 Tag und 1 Stunde vorher
const ERINNERUNG_GANZTAG = [{ method: 'popup', minutes: 900 }]; // 09:00 am Vortag

const pad2 = (n) => String(n).padStart(2, '0');

function versteckt(typ, zusatz = {}) {
  return { fk: '1', typ, v: '1', ...zusatz };
}

/** Arzt und Termin: „Für wen“ steht im Titel und zusätzlich im versteckten Feld `w` (kind, mama, papa oder alle); so bleibt es auch nach einer Namensänderung eindeutig. */
const MIT_FUER = ['arzt', 'familie'];

/** Endzeit auf bürgerlicher Uhr (ohne Zeitzonenrechnung): { date, time } nach `minuten`, auch über Mitternacht. */
export function endeAus(date, time, minuten) {
  const [h, m] = time.split(':').map(Number);
  const gesamt = h * 60 + m + minuten;
  const rest = gesamt % 1440;
  return { date: addDays(date, Math.floor(gesamt / 1440)), time: `${pad2(Math.floor(rest / 60))}:${pad2(rest % 60)}` };
}

/** Bifa/Abwesenheit eines einzelnen Tages: Ganztag, feste ID `fk<JJJJMMTT>`, ohne Erinnerung. */
export function tagZuEreignis(typ, date, settings) {
  const id = dayEventId(date);
  return {
    kalender: TYPES[typ].calendar,
    id,
    body: {
      id,
      summary: buildDayTitle(typ, date, settings),
      ...toGoogleAllDay({ start: date, end: date }),
      colorId: TYPES[typ].colorId,
      transparency: 'transparent',
      reminders: { useDefault: false, overrides: [] },
      extendedProperties: { private: versteckt(typ) },
    },
  };
}

/** Urlaub: ein Ganztag-Ereignis über den ganzen Zeitraum, im Kalender „Abwesenheit“ (bewusst ohne Push). */
export function urlaubZuEreignis({ id, start, end }, settings) {
  return {
    kalender: TYPES.urlaub.calendar,
    id,
    body: {
      id,
      summary: buildDayTitle('urlaub', start, settings),
      ...toGoogleAllDay({ start, end }),
      colorId: TYPES.urlaub.colorId,
      transparency: 'transparent',
      reminders: { useDefault: false, overrides: [] },
      extendedProperties: { private: versteckt('urlaub') },
    },
  };
}

/** Urlaub-Check: Ereignis in „Termine“ um 09:00 (Ortszeit Wien) mit „1 Tag und 1 Stunde vorher“; feste ID `fkc<JJJJMMTT>`. */
export function urlaubCheckZuEreignis({ date, title }) {
  const id = urlaubCheckEventId(date);
  const ende = endeAus(date, '09:00', TERMIN_MINUTEN);
  return {
    kalender: TYPES.urlaub_check.calendar,
    id,
    body: {
      id,
      summary: title,
      colorId: TYPES.urlaub_check.colorId,
      start: { dateTime: `${date}T09:00:00`, timeZone: CONFIG.zeitzone },
      end: { dateTime: `${ende.date}T${ende.time}:00`, timeZone: CONFIG.zeitzone },
      reminders: { useDefault: false, overrides: ERINNERUNG_VORHER },
      extendedProperties: { private: versteckt('urlaub_check') },
    },
  };
}

/** Arzttermin, Familie und Sachen für die Einrichtung: Ereignis in „Termine“, mit Uhrzeit (Ortszeit, Europe/Vienna) oder ganztägig. */
export function terminZuEreignis(termin, settings) {
  const basis = {
    id: termin.id,
    summary: terminAnzeige(termin, settings).titel,
    colorId: TYPES[termin.typ].colorId,
    extendedProperties: { private: versteckt(termin.typ, { ...(termin.serie ? { s: termin.serie } : {}), ...(MIT_FUER.includes(termin.typ) ? { w: termin.fuer ?? 'alle' } : {}) }) },
    ...(MIT_FUER.includes(termin.typ) ? { description: termin.notiz ?? '' } : {}),
  };
  if (termin.time) {
    const ende = endeAus(termin.date, termin.time, TERMIN_MINUTEN);
    return {
      kalender: TYPES[termin.typ].calendar,
      id: termin.id,
      body: {
        ...basis,
        start: { dateTime: `${termin.date}T${termin.time}:00`, timeZone: CONFIG.zeitzone },
        end: { dateTime: `${ende.date}T${ende.time}:00`, timeZone: CONFIG.zeitzone },
        reminders: { useDefault: false, overrides: ERINNERUNG_VORHER },
      },
    };
  }
  return {
    kalender: TYPES[termin.typ].calendar,
    id: termin.id,
    body: {
      ...basis,
      ...toGoogleAllDay({ start: termin.date, end: termin.date }),
      transparency: 'transparent',
      reminders: { useDefault: false, overrides: ERINNERUNG_GANZTAG },
    },
  };
}

/** Gemeinsame Einstellungen als verstecktes Ereignis (JSON in `description`, ≤ 6000 Zeichen). */
export function einstellungenZuEreignis(settings) {
  const text = JSON.stringify({ v: 1, ...normalizeSettings(settings) });
  if (text.length > MAX_EINSTELLUNGEN_ZEICHEN) {
    throw new Error(`Die Einstellungen sind zu lang für den Kalender (höchstens ${MAX_EINSTELLUNGEN_ZEICHEN} Zeichen). Bitte die Listen kürzen.`);
  }
  return {
    kalender: 'anwesenheit',
    id: EINSTELLUNGEN_ID,
    body: {
      id: EINSTELLUNGEN_ID,
      summary: '⚙️ fk Einstellungen (nicht löschen)',
      description: text,
      start: { date: '2000-01-01' },
      end: { date: '2000-01-02' },
      transparency: 'transparent',
      reminders: { useDefault: false, overrides: [] },
      extendedProperties: { private: versteckt('einstellungen') },
    },
  };
}

/** Geräte-Register als verstecktes Ereignis (JSON in `description`, wie die Einstellungen am 2000-01-01 in „Anwesenheit“). */
export function geraeteZuEreignis(register) {
  return {
    kalender: 'anwesenheit',
    id: GERAETE_ID,
    body: {
      id: GERAETE_ID,
      summary: '📲 fk Geräte (nicht löschen)',
      description: registerText(register),
      start: { date: '2000-01-01' },
      end: { date: '2000-01-02' },
      transparency: 'transparent',
      reminders: { useDefault: false, overrides: [] },
      extendedProperties: { private: versteckt('geraete') },
    },
  };
}

/** Einkaufsliste als verstecktes Ereignis (JSON in `description`, wie Einstellungen und Geräte am 2000-01-01 in „Anwesenheit“). */
export function einkaufZuEreignis(liste) {
  return {
    kalender: 'anwesenheit',
    id: EINKAUF_ID,
    body: {
      id: EINKAUF_ID,
      summary: '🛒 fk Einkauf (nicht löschen)',
      description: einkaufText(liste),
      start: { date: '2000-01-01' },
      end: { date: '2000-01-02' },
      transparency: 'transparent',
      reminders: { useDefault: false, overrides: [] },
      extendedProperties: { private: versteckt('einkauf') },
    },
  };
}

/** Liest die Liste; kaputtes oder fehlendes JSON ergibt die leere Liste (nichts wird gelöscht oder erraten). */
export function einkaufAusEreignis(event) {
  return { liste: einkaufAusText(event?.description) };
}

/** Kontostände als verstecktes Ereignis (JSON in `description`, wie Einkauf, Einstellungen und Geräte am 2000-01-01 in „Anwesenheit“). Der Titel nennt keine Beträge. */
export function kontoZuEreignis(konto) {
  return {
    kalender: 'anwesenheit',
    id: KONTO_ID,
    body: {
      id: KONTO_ID,
      summary: '💶 fk Kontostand (nicht löschen)',
      description: kontoText(konto),
      start: { date: '2000-01-01' },
      end: { date: '2000-01-02' },
      transparency: 'transparent',
      reminders: { useDefault: false, overrides: [] },
      extendedProperties: { private: versteckt('konto') },
    },
  };
}

/** Liest das Konto; kaputtes oder fehlendes JSON ergibt das leere Konto (nichts wird gelöscht oder erraten). */
export function kontoAusEreignis(event) {
  return { konto: kontoAusText(event?.description) };
}

/** Liest das Register; unbrauchbares JSON ergibt `register: null` (nichts wird gelöscht oder erraten). */
export function geraeteAusEreignis(event) {
  const text = event?.description;
  if (typeof text !== 'string' || text.trim() === '') return { register: null };
  try {
    return { register: normalisiereRegister(JSON.parse(text)) };
  } catch {
    return { register: null, warnung: 'JSON' };
  }
}

/** Liest die Einstellungen; Fehlendes oder Ungültiges wird zum Standardwert, mit Liste der betroffenen Felder (`warnungen`). */
export function einstellungenAusEreignis(event) {
  const standard = normalizeSettings();
  const text = event?.description;
  if (typeof text !== 'string' || text.trim() === '') return { settings: standard, warnungen: [] };
  let daten;
  try {
    daten = JSON.parse(text);
  } catch {
    return { settings: standard, warnungen: ['JSON'] };
  }
  if (daten === null || typeof daten !== 'object' || Array.isArray(daten)) return { settings: standard, warnungen: ['JSON'] };
  try {
    return { settings: normalizeSettings(daten), warnungen: [] };
  } catch {
    // einzelne Felder prüfen: Gültiges bleibt, Ungültiges fällt auf den Standard zurück
  }
  const akzeptiert = {};
  const warnungen = [];
  for (const [feld, wert] of Object.entries(daten)) {
    if (feld === 'v' || !(feld in DEFAULT_SETTINGS)) continue;
    try {
      normalizeSettings({ ...akzeptiert, [feld]: wert });
      akzeptiert[feld] = wert;
    } catch {
      warnungen.push(feld);
    }
  }
  return { settings: normalizeSettings(akzeptiert), warnungen };
}

/**
 * Übersetzt ein Google-Ereignis in einen Eintrag der App:
 * { art: 'tag' | 'urlaub' | 'termin' | 'einstellungen' | 'urlaubcheck' | 'ignorieren', … }.
 * Bei Terminen gilt die echte Startzeit; weicht der Titel ab, liefert `resync` die Korrektur des Titels.
 */
export function ereignisZuEintrag(event, kalender, settings) {
  if (event.status === 'cancelled' || !event.start) return { art: 'ignorieren' };
  if (event.id === EINSTELLUNGEN_ID) return { art: 'einstellungen', ...einstellungenAusEreignis(event) };
  if (event.id === TEST_ID || event.id === GERAETE_ID || event.id === EINKAUF_ID || event.id === KONTO_ID) return { art: 'ignorieren' };

  const { typ, subtyp, quelle } = classifyEvent(event, kalender);
  if (TAGES_TYPEN.includes(typ)) return { art: 'tag', id: event.id, typ, tage: spanDays(eventSpan(event)), quelle };
  if (typ === 'urlaub') {
    const span = eventSpan(event);
    return { art: 'urlaub', id: event.id, start: span.start, end: span.end };
  }
  if (typ === 'urlaub_check') {
    // nur die selbst angelegten (feste ID) werden verwaltet; ein von Hand getippter „Urlaub-Check“ bleibt unbeachtet
    return istUrlaubCheckId(event.id) ? { art: 'urlaubcheck', id: event.id, date: eventSpan(event).start, titel: event.summary ?? '' } : { art: 'ignorieren' };
  }

  const titel = event.summary ?? '';
  const geparst = parseTerminTitle(titel, { kindname: settings?.kindname ?? '' });
  const date = eventSpan(event).start;
  const echteZeit = event.start.dateTime ? zeitAusDateTime(event.start.dateTime) : null;
  const resync = echteZeit && needsTimeResync(titel, event.start.dateTime) ? { id: event.id, kalender, summary: withTime(titel, echteZeit) } : null;
  const basis = { id: event.id, typ, date, time: echteZeit, mitnehmen: geparst.mitnehmen, kosten: geparst.kosten };

  // „Für wen“: das versteckte Feld gilt zuerst, sonst der Name im Titel (nativ geschriebene Titel)
  const w = event.extendedProperties?.private?.w;
  const fuer = FUER[w] ? w : w === 'alle' ? null : (geparst.fuerSchluessel ?? null);
  const notiz = notizAusBeschreibung(event.description);
  const zusatz = { ...(fuer ? { fuer } : {}), ...(notiz ? { notiz } : {}) };

  if (typ === 'arzt') return { art: 'termin', termin: { ...basis, subtyp, ...zusatz }, resync };
  if (typ === 'kita_sache') {
    const richtung = parseKitaSacheLabel(geparst.label)?.richtung ?? 'hin';
    const serie = event.extendedProperties?.private?.s;
    const zeit = echteZeit ?? (richtung === 'heim' ? settings.abholzeit : settings.bringzeit);
    return { art: 'termin', termin: { ...basis, time: zeit, kosten: null, richtung, ...(serie ? { serie } : {}) }, resync };
  }
  const label = FUER[w] && !geparst.fuerSchluessel ? ohneKlammer(geparst.label) : geparst.label;
  const symbol = geparst.emoji !== TYPES.familie.emoji && FAMILIE_SYMBOLE.includes(geparst.emoji) ? geparst.emoji : null;
  return { art: 'termin', termin: { ...basis, label, ...zusatz, ...(symbol ? { symbol } : {}) }, resync };
}
