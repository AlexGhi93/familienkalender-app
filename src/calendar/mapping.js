// Reine Umrechnung zwischen dem App-Modell und Google-Kalender-Ereignissen: kein Netz, kein DOM.
// Grundlage: Titel sind die einzige Quelle für Mitnehmen/Kosten, die echte Startzeit gilt für die Uhrzeit,
// und das Verhalten der API ist in docs/spike/CONTRACT.md belegt.
import { addDays, todayVienna } from '../domain/dates.js';
import { eventSpan, spanDays, toGoogleAllDay } from '../domain/span.js';
import { dayEventId, istUrlaubCheckId, urlaubCheckEventId } from '../domain/ids.js';
import { FAMILIE_SYMBOLE, FUER, TAGES_TYPEN, TYPES } from '../domain/types.js';
import { buildDayTitle, needsTimeResync, ohneKlammer, parseKitaSacheLabel, parseTerminTitle, withTime } from '../domain/titles.js';
import { notizAusBeschreibung } from '../domain/notiz.js';
import { normalisiereRegister, registerText } from '../push/geraete.js';
import { einkaufAusText, einkaufText } from '../domain/einkauf.js';
import { kontoAusText, kontoText } from '../domain/konto.js';
import { katalogAusText, katalogText, monatAusText, monatText } from '../domain/schicht.js';
import { FIX_SHARDS, shardLesen, shardText } from '../domain/fixkosten.js';
import { zieleLesen, zieleText, zieleWarnungen } from '../domain/sparziele.js';
import { autosLesen, autosText, autosWarnungen, historieLesen, historieText, historieWarnungen, leereHistorie } from '../domain/autos.js';
import { leererVersicherungTeil, pruefeVersicherung, pruefeVersicherungTeil, versicherungTeilText, versicherungTeilWarnungen, versicherungText, versicherungWarnungen } from '../domain/versicherung.js';
import { classifyEvent } from '../domain/classify.js';
import { zeitAusDateTime } from '../domain/format.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../domain/settings.js';
import { terminAnzeige } from '../app/views/gemeinsam.js';
import { CONFIG } from './config.js';

export const EINSTELLUNGEN_ID = 'fkeinstellungen';
export const GERAETE_ID = 'fkgeraete'; // Register der Telefone für Push-Erinnerungen (siehe push/geraete.js)
export const EINKAUF_ID = 'fkeinkauf'; // gemeinsame Einkaufsliste (siehe domain/einkauf.js)
export const KONTO_ID = 'fkkonto'; // monatliche Kontostände von Papa und Mama (siehe domain/konto.js)
export const SCHICHTARTEN_ID = 'fkschichtarten'; // Schichtarten von Papa und Mama (siehe domain/schicht.js)
export const ZIELE_ID = 'fksparen'; // Sparziele und Verschiebungen aus „Frei“ (siehe domain/sparziele.js); nicht „fkziele“: z liegt außerhalb von 0-9 und a-v
export const AUTOS_ID = 'fkautos'; // Autos, Regeln, Reifensätze und Jahres-Index (siehe domain/autos.js); der Verlauf liegt in „fkah<auto><JJJJ>“
export const VERSICHERUNG_ID = 'fkversicherung'; // Polizze und erstes Jahr (siehe domain/versicherung.js); die Rechnungen liegen je Quartal in „fkvr<JJJJ><Q>“
export const TEST_ID = 'fktest'; // „🔔 Test-Erinnerung“ aus Konto & App → Erinnerungen: für die App unsichtbar
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

/** ID des Schichtplans eines Monats: 'JJJJ-MM' → `fksch<JJJJMM>` (Google erlaubt in IDs nur 0-9 und a-v). */
export function schichtMonatId(jm) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(jm))) throw new Error(`Ungültiger Monat: ${jm}`);
  return `fksch${jm.replace('-', '')}`;
}

/** Schichtarten und alle Schichtmonate beginnen mit „fksch“ und sind für die übrige App unsichtbar. */
export const istSchichtId = (id) => typeof id === 'string' && id.startsWith('fksch');

/** Verstecktes Ereignis für Schichtplan und Fixkosten (JSON in `description`, wie der Kontostand am 2000-01-01 in „Anwesenheit“, ohne Erinnerung). */
function schichtEreignis(id, summary, description, typ) {
  return {
    kalender: 'anwesenheit',
    id,
    body: {
      id,
      summary,
      description,
      start: { date: '2000-01-01' },
      end: { date: '2000-01-02' },
      transparency: 'transparent',
      reminders: { useDefault: false, overrides: [] },
      extendedProperties: { private: versteckt(typ) },
    },
  };
}

/** Schichtarten als verstecktes Ereignis „fkschichtarten“; ein zu großer Katalog wird vor dem Schreiben abgelehnt. */
export function schichtartenZuEreignis(katalog) {
  return schichtEreignis(SCHICHTARTEN_ID, '🗓️ fk Schichtarten (nicht löschen)', katalogText(katalog), 'schichtarten');
}

/** Liest die Schichtarten; fehlendes JSON ergibt die Standardarten, kaputtes die Standardarten mit Warnung. */
export function schichtartenAusEreignis(event) {
  return katalogAusText(event?.description);
}

/** Schichtplan eines Monats als verstecktes Ereignis „fksch<JJJJMM>“; ein zu großer Monat wird vor dem Schreiben abgelehnt. */
export function schichtMonatZuEreignis(monat) {
  return schichtEreignis(schichtMonatId(monat?.jm), '🗓️ fk Schichtplan (nicht löschen)', monatText(monat), 'schicht');
}

/** Liest den Monat `jm`; fehlendes JSON ergibt den leeren Monat, kaputtes den leeren Monat mit Warnung. */
export function schichtMonatAusEreignis(event, jm) {
  return monatAusText(event?.description, jm);
}

/**
 * Die vier Teile der Fixkosten: `fkfest0` … `fkfest3` („Festkosten“; „fkfix“ ginge nicht, x liegt außerhalb von 0-9 und a-v).
 * Ein Posten liegt immer im Teil shardFuer(id), siehe domain/fixkosten.js.
 */
export const FIX_IDS = Object.freeze(Array.from({ length: FIX_SHARDS }, (_, nr) => `fkfest${nr}`));

/** ID des Teils `nr` (0 … 3). */
export function fixShardId(nr) {
  if (!Number.isInteger(nr) || nr < 0 || nr >= FIX_SHARDS) throw new Error(`Ungültiger Teil der Fixkosten: ${nr}`);
  return FIX_IDS[nr];
}

/** Alle Teile der Fixkosten beginnen mit „fkfest“ und sind für die übrige App unsichtbar. */
export const istFixId = (id) => typeof id === 'string' && id.startsWith('fkfest');

/** Teil `nr` der Fixkosten als verstecktes Ereignis (wie die Schichtmonate); der Titel nennt keine Posten oder Beträge, ein zu voller Teil wird abgelehnt. */
export function fixShardZuEreignis(nr, shard) {
  return schichtEreignis(fixShardId(nr), '💶 fk Fixkosten (nicht löschen)', shardText(shard), 'fixkosten');
}

/**
 * Liest einen Teil → { shard, warnungen, unlesbar? } (siehe shardLesen): fehlender Text → leerer Teil; unlesbarer Text → leerer, gesperrter
 * Teil (`unlesbar: true`, mit Warnung); Posten, die diese Version nicht versteht, bleiben als `fremd` erhalten.
 */
export function fixShardAusEreignis(event) {
  return shardLesen(event?.description);
}

/** Sparziele als verstecktes Ereignis „fksparen“ (wie die Fixkosten); der Titel nennt weder Ziele noch Beträge, zu volle Daten werden abgelehnt. */
export function zieleZuEreignis(daten) {
  return schichtEreignis(ZIELE_ID, '🎯 fk Sparziele (nicht löschen)', zieleText(daten), 'sparziele');
}

/**
 * Liest die Sparziele → { daten, unlesbar, warnungen } (siehe zieleLesen, zieleWarnungen): fehlender Text → leere Daten; unlesbarer Text
 * → leere, gesperrte Daten (`unlesbar: true`, mit Warnung, nie überschreiben); was diese Version nicht versteht, bleibt als `fremd` erhalten.
 */
export function zieleAusEreignis(event) {
  const { daten, unlesbar } = zieleLesen(event?.description);
  return { daten, unlesbar, warnungen: zieleWarnungen({ daten, unlesbar }) };
}

/** Hauptteil der Autos als verstecktes Ereignis „fkautos“ (wie die Sparziele); der Titel nennt weder Autos noch Kennzeichen, zu volle Daten werden abgelehnt. */
export function autosZuEreignis(daten) {
  return schichtEreignis(AUTOS_ID, '🚗 fk Autos (nicht löschen)', autosText(daten), 'autos');
}

/**
 * Liest den Hauptteil → { daten, unlesbar, warnungen } (siehe autosLesen): fehlender Text → leere Daten; unlesbarer Text → leere,
 * gesperrte Daten (nie überschreiben); was diese Version nicht versteht, bleibt als `fremd` erhalten.
 */
export function autosAusEreignis(event) {
  const { daten, unlesbar } = autosLesen(event?.description);
  return { daten, unlesbar, warnungen: autosWarnungen({ daten, unlesbar }) };
}

const AUTO_KENNUNG = /^[0-9a-v]{4,16}$/;

/** ID des Verlauf-Teils eines Autos in einem Jahr: `fkah<auto><JJJJ>` (z. B. fkah0123abcv2026; nur 0-9 und a-v). */
export function historieId(auto, jahr) {
  if (typeof auto !== 'string' || !AUTO_KENNUNG.test(auto)) throw new Error(`Ungültiges Auto: ${auto}`);
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) throw new Error(`Ungültiges Jahr: ${jahr}`);
  return `fkah${auto}${jahr}`;
}

const HISTORIE_KENNUNG = /^fkah[0-9a-v]{4,16}(\d{4})$/;

/** Hat `id` genau das Muster eines Verlauf-Teils (fkah + Auto-ID + Jahr 2000–2100)? Eine zufällige Google-ID mit „fkah…“ zählt nicht. */
export function istHistorieId(id) {
  const m = typeof id === 'string' ? HISTORIE_KENNUNG.exec(id) : null;
  return !!m && Number(m[1]) >= 2000 && Number(m[1]) <= 2100;
}

/** „fkautos“ und die Verlauf-Teile „fkah<auto><JJJJ>“ sind für die übrige App unsichtbar – streng nach Muster, nicht nur nach dem Anfang. */
export const istAutosId = (id) => id === AUTOS_ID || istHistorieId(id);

/** Ein Verlauf-Teil ({ auto, jahr, arbeiten, km }) als verstecktes Ereignis „fkah<auto><JJJJ>“; ein zu voller Teil wird abgelehnt. */
export function historieZuEreignis(historie) {
  return schichtEreignis(historieId(historie?.auto, historie?.jahr), '🚗 fk Auto-Verlauf (nicht löschen)', historieText(historie), 'autoverlauf');
}

/** Liest den Verlauf-Teil von `auto` im Jahr `jahr` → { historie, unlesbar, warnungen } (siehe historieLesen). */
export function historieAusEreignis(event, auto, jahr) {
  const { historie, unlesbar } = historieLesen(event?.description, { auto, jahr });
  return { historie, unlesbar, warnungen: historieWarnungen({ historie, unlesbar }) };
}

/**
 * Bis zu welchem Jahr der Verlauf gelesen wird: das Jahr von morgen in Wien (eine Arbeit darf höchstens einen Tag in der Zukunft
 * liegen – am 31.12. also schon im nächsten Jahr).
 */
export const autosBisJahr = (jetzt = new Date()) => Number(addDays(todayVienna(jetzt), 1).slice(0, 4));

/**
 * Alle Paare { auto, jahr }, die zu lesen sind (M3, Abschluss-Review): je Auto vom ersten Jahr des Index bis `bisJahr` (Reihenfolge:
 * Autos wie im Index, Jahre aufsteigend). Liegt das erste Jahr nach `bisJahr` (falsche Uhr), wenigstens das erste Jahr.
 */
export const autosTeile = (daten, bisJahr) =>
  Object.entries(daten?.ab ?? {}).flatMap(([auto, ab]) => Array.from({ length: Math.max(0, (Number.isInteger(bisJahr) ? bisJahr : ab) - ab) + 1 }, (_, i) => ({ auto, jahr: ab + i })));

/**
 * Autos aus den Texten im Kalender (Google und Demo gleich): `hauptText` = Beschreibung von „fkautos“ (null = fehlt), `teilText(auto,
 * jahr)` = Beschreibung des Verlauf-Teils, null (nie angelegt) oder { geloescht: true } (im Kalender gelöscht). → { daten, historie:
 * { [auto]: { [jahr]: Historie } }, warnungen, unlesbar: { main?: true, shards: [{ auto, jahr }] }, rohtexte: [{ id, text }] }. Gefragt
 * werden die Teile je Auto vom ersten Jahr des Index bis `bisJahr` (autosTeile); ein nie angelegter zählt als leeres Jahr (fehlt still in
 * `historie`, ist NICHT unlesbar), ein gelöschter leer mit Hinweis. Ein Lesefehler ist kein „fehlt“: den meldet der Adapter, indem er
 * selbst scheitert (dann wird nichts geschrieben). Ist der Hauptteil unlesbar, kennt man keinen Index: alles leer und gesperrt.
 * `rohtexte` = die Texte der unlesbaren Teile (für die Sicherung).
 */
export function autosAusTexten(hauptText, teilText, { bisJahr } = {}) {
  const haupt = autosAusEreignis(hauptText == null ? null : { description: hauptText });
  if (haupt.unlesbar) return { daten: haupt.daten, historie: {}, warnungen: haupt.warnungen, unlesbar: { main: true, shards: [] }, rohtexte: [{ id: AUTOS_ID, text: hauptText }] };
  const historie = {};
  const warnungen = [...haupt.warnungen];
  const shards = [];
  const rohtexte = [];
  for (const { auto, jahr } of autosTeile(haupt.daten, bisJahr)) {
    const text = teilText(auto, jahr);
    if (text == null) continue; // nie angelegt: ein leeres Jahr
    const name = haupt.daten.autos.find((a) => a.id === auto)?.name;
    historie[auto] ??= {};
    if (typeof text !== 'string') {
      historie[auto][jahr] = leereHistorie(auto, jahr);
      if (text?.geloescht) warnungen.push(`Der Verlauf ${jahr}${name ? ` von „${name}“` : ''} wurde im Kalender gelöscht (wohl von Hand); er wird leer gezeigt.`);
      continue;
    }
    const g = historieAusEreignis({ description: text }, auto, jahr);
    historie[auto][jahr] = g.historie;
    warnungen.push(...g.warnungen.map((w) => (name ? `${name}: ${w}` : w)));
    if (g.unlesbar) {
      shards.push({ auto, jahr });
      rohtexte.push({ id: historieId(auto, jahr), text });
    }
  }
  return { daten: haupt.daten, historie, warnungen, unlesbar: { shards }, rohtexte };
}

/** Hauptteil der Versicherung als verstecktes Ereignis „fkversicherung“ (wie die Autos); der Titel nennt weder Person noch Beträge, zu volle Daten werden abgelehnt. */
export function versicherungZuEreignis(daten) {
  return schichtEreignis(VERSICHERUNG_ID, '🩺 fk Versicherung (nicht löschen)', versicherungText(daten), 'versicherung');
}

/**
 * Liest den Hauptteil → { daten, unlesbar, warnungen } (siehe pruefeVersicherung): fehlender Text → leere Daten; unlesbarer Text →
 * leere, gesperrte Daten (nie überschreiben); nicht verstandene Kategorien bleiben als `fremd` erhalten.
 */
export function versicherungAusEreignis(event) {
  const { daten, unlesbar } = pruefeVersicherung(event?.description);
  return { daten, unlesbar, warnungen: versicherungWarnungen({ daten, unlesbar }) };
}

const istTeilJahr = (j) => Number.isInteger(j) && j >= 2000 && j <= 2100;
const istTeilQuartal = (q) => Number.isInteger(q) && q >= 1 && q <= 4;

/** ID des Teils mit den Rechnungen eines Quartals (C1): `fkvr<JJJJ><Q>` (z. B. fkvr20264; nur 0-9 und a-v). */
export function versicherungTeilId(jahr, quartal) {
  if (!istTeilJahr(jahr)) throw new Error(`Ungültiges Jahr: ${jahr}`);
  if (!istTeilQuartal(quartal)) throw new Error(`Ungültiges Quartal: ${quartal}`);
  return `fkvr${jahr}${quartal}`;
}

const VERSICHERUNG_TEIL_KENNUNG = /^fkvr(\d{4})([1-4])$/;

/** Hat `id` genau das Muster eines Quartal-Teils (fkvr + Jahr 2000–2100 + Quartal 1–4)? Eine zufällige Google-ID mit „fkvr…“ zählt nicht. */
export function istVersicherungTeilId(id) {
  const m = typeof id === 'string' ? VERSICHERUNG_TEIL_KENNUNG.exec(id) : null;
  return !!m && istTeilJahr(Number(m[1]));
}

/** „fkversicherung“ und die Quartal-Teile „fkvr<JJJJ><Q>“ sind für die übrige App unsichtbar – streng nach Muster, nicht nur nach dem Anfang. */
export const istVersicherungId = (id) => id === VERSICHERUNG_ID || istVersicherungTeilId(id);

/** Ein Quartal-Teil ({ jahr, quartal, rechnungen }) als verstecktes Ereignis „fkvr<JJJJ><Q>“; ein zu voller Teil wird abgelehnt. */
export function versicherungTeilZuEreignis(teil) {
  return schichtEreignis(versicherungTeilId(teil?.jahr, teil?.quartal), '🩺 fk Versicherung-Rechnungen (nicht löschen)', versicherungTeilText(teil), 'versicherungteil');
}

/** Liest den Teil `jahr`/`quartal` → { teil, unlesbar, warnungen } (siehe pruefeVersicherungTeil). */
export function versicherungTeilAusEreignis(event, jahr, quartal) {
  const { teil, unlesbar } = pruefeVersicherungTeil(event?.description, { jahr, quartal });
  return { teil, unlesbar, warnungen: versicherungTeilWarnungen({ teil, unlesbar }) };
}

/**
 * Bis zu welchem Teil die Rechnungen gelesen werden: Jahr und Quartal von morgen in Wien (wie bei den Autos darf ein Datum 1 Tag voraus
 * sein – am 31.12. also schon das 1. Quartal des nächsten Jahres). → { jahr, quartal }.
 */
export function versicherungBis(jetzt = new Date()) {
  const morgen = addDays(todayVienna(jetzt), 1);
  return { jahr: Number(morgen.slice(0, 4)), quartal: Math.floor((Number(morgen.slice(5, 7)) - 1) / 3) + 1 };
}

/**
 * Alle Teile, die zu lesen sind: jedes Quartal vom 1. Quartal des ersten Jahres (Hauptteil `ab`) bis `bis` = { jahr, quartal }
 * einschließlich, aufsteigend → [{ jahr, quartal }]. Ohne erstes Jahr keins. Liegt `bis` vor dem ersten Jahr (falsche Uhr) oder fehlt
 * es, wenigstens die vier Quartale des ersten Jahres.
 */
export function versicherungTeile(daten, bis) {
  const ab = daten?.ab;
  if (!istTeilJahr(ab)) return [];
  const ende = istTeilJahr(bis?.jahr) && istTeilQuartal(bis?.quartal) && bis.jahr >= ab ? bis : { jahr: ab, quartal: 4 };
  const liste = [];
  for (let jahr = ab; jahr <= ende.jahr; jahr += 1) for (let quartal = 1; quartal <= (jahr === ende.jahr ? ende.quartal : 4); quartal += 1) liste.push({ jahr, quartal });
  return liste;
}

/**
 * Versicherung aus den Texten im Kalender (Google und Demo gleich): `hauptText` = Beschreibung von „fkversicherung“ (null = fehlt),
 * `teilTextVon(jahr, quartal)` = Beschreibung des Quartal-Teils, null (nie angelegt) oder { geloescht: true } (im Kalender gelöscht).
 * → { daten, teile: { [jahr]: { [quartal]: Teil } }, warnungen, unlesbar: { main?: true, teile: [{ jahr, quartal }] }, rohtexte: [{ id, text }] }.
 * Gefragt werden die Teile aus versicherungTeile(daten, bis); ein nie angelegter zählt als leeres Quartal (fehlt still in `teile`, ist
 * NICHT unlesbar), ein gelöschter leer mit Hinweis. Ein Lesefehler ist kein „fehlt“: den meldet der Adapter, indem er selbst scheitert
 * (dann wird nichts geschrieben). Ist der Hauptteil unlesbar, kennt man kein erstes Jahr: alles leer und gesperrt. `rohtexte` = die
 * Texte der unlesbaren Teile (für die Sicherung). Die Rechnungen eines Jahres: rechnungenDesJahres(teile, jahr).
 */
export function versicherungAusTexten(hauptText, teilTextVon, { bis } = {}) {
  const haupt = versicherungAusEreignis(hauptText == null ? null : { description: hauptText });
  if (haupt.unlesbar) return { daten: haupt.daten, teile: {}, warnungen: haupt.warnungen, unlesbar: { main: true, teile: [] }, rohtexte: [{ id: VERSICHERUNG_ID, text: hauptText }] };
  const teile = {};
  const warnungen = [...haupt.warnungen];
  const unlesbar = [];
  const rohtexte = [];
  for (const { jahr, quartal } of versicherungTeile(haupt.daten, bis)) {
    const text = teilTextVon(jahr, quartal);
    if (text == null) continue; // nie angelegt: ein leeres Quartal
    teile[jahr] ??= {};
    if (typeof text !== 'string') {
      teile[jahr][quartal] = leererVersicherungTeil(jahr, quartal);
      if (text?.geloescht) warnungen.push(`Die Rechnungen im ${quartal}. Quartal ${jahr} der Versicherung wurden im Kalender gelöscht (wohl von Hand); sie werden leer gezeigt.`);
      continue;
    }
    const g = versicherungTeilAusEreignis({ description: text }, jahr, quartal);
    teile[jahr][quartal] = g.teil;
    warnungen.push(...g.warnungen);
    if (g.unlesbar) {
      unlesbar.push({ jahr, quartal });
      rohtexte.push({ id: versicherungTeilId(jahr, quartal), text });
    }
  }
  return { daten: haupt.daten, teile, warnungen, unlesbar: { teile: unlesbar }, rohtexte };
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
  if (event.id === TEST_ID || event.id === GERAETE_ID || event.id === EINKAUF_ID || event.id === KONTO_ID || event.id === ZIELE_ID || istSchichtId(event.id) || istFixId(event.id) || istAutosId(event.id) || istVersicherungId(event.id)) return { art: 'ignorieren' };

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
