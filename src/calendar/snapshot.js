// Lokaler Schnappschuss der zuletzt geladenen Daten (nur auf diesem Telefon): zeigt beim Start sofort etwas an
// und erlaubt Lesen ohne Anmeldung/Netz. Enthält Gesundheits-Titel; er bleibt im localStorage dieses Geräts.
import { addDays, isValidDate } from '../domain/dates.js';
import { normalizeSettings } from '../domain/settings.js';
import { normalisiereListe } from '../domain/einkauf.js';
import { normalisiereKonto } from '../domain/konto.js';
import { normalisiereKatalog, normalisiereMonat } from '../domain/schicht.js';
import { FIX_SHARDS, normalisiereShard } from '../domain/fixkosten.js';
import { zieleLesen, zieleText } from '../domain/sparziele.js';
import { autosLesen, autosText, historieLesen, historieText } from '../domain/autos.js';
import { pruefeVersicherung, pruefeVersicherungTeil, versicherungTeilText, versicherungText } from '../domain/versicherung.js';
import { TAGES_TYPEN, TYPES } from '../domain/types.js';

export const SNAPSHOT_KEY = 'fk.snapshot.v1';
export const MAX_SNAPSHOT_ZEICHEN = 200_000;
const TAGE_ZURUECK = 365;
const TERMIN_TYPEN = ['arzt', 'familie', 'kita_sache'];
export const MAX_SNAPSHOT_SCHICHT_MONATE = 6;
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;

const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const gueltigesDatum = (d) => typeof d === 'string' && isValidDate(d);

const monatsZahl = (jm) => Number(jm.slice(0, 4)) * 12 + Number(jm.slice(5, 7));

/**
 * Die Monate (Schlüssel 'JJJJ-MM') am nächsten zu `bezug` ('JJJJ-MM…'), höchstens `max`: offline zählt vor allem der laufende Monat und
 * seine Nachbarn, auch nachdem man weit vor- oder zurückgeblättert hat. Bei gleichem Abstand gewinnt der spätere Monat (das Kommende ist
 * offline wichtiger als das Vergangene).
 */
function naechsteMonate(monate, bezug, max) {
  const b = monatsZahl(bezug);
  const abstand = ([jm]) => Math.abs(monatsZahl(jm) - b);
  const eintraege = Object.entries(monate ?? {}).sort((x, y) => abstand(x) - abstand(y) || y[0].localeCompare(x[0]));
  return Object.fromEntries(eintraege.slice(0, max));
}

/**
 * Schichtplan nachsichtig lesen (anders als der Rest: er ist nur eine Kopie und wird beim Öffnen der Seite ohnehin neu geholt):
 * unbrauchbare Monate fallen weg, der Katalog wird normalisiert; nichts davon macht den ganzen Schnappschuss ungültig. Höchstens sechs
 * Monate bleiben, die nächsten zu `bezug` (dem Monat des Speicherns), nach derselben Regel wie beim Speichern.
 */
function pruefeSchicht(roh, bezug) {
  if (!istObjekt(roh)) return { katalog: null, monate: {} };
  const katalog = istObjekt(roh.katalog) ? normalisiereKatalog(roh.katalog).katalog : null;
  const monate = {};
  for (const [jm, monat] of Object.entries(istObjekt(roh.monate) ? roh.monate : {})) {
    if (MONAT.test(jm) && istObjekt(monat)) monate[jm] = normalisiereMonat(monat, jm).monat;
  }
  return { katalog, monate: naechsteMonate(monate, bezug, MAX_SNAPSHOT_SCHICHT_MONATE) };
}

/**
 * Fixkosten nachsichtig lesen (wie den Schichtplan: nur eine Kopie, das Vorladen holt sie neu): genau vier Teile, sonst null (= keine);
 * ein unbrauchbarer Teil wird leer, beschädigte Posten fallen weg (fremde Posten bleiben roh); ein fehlender Teil (null) bleibt null.
 * `unlesbar` = Nummern der Teile, die beim letzten Lesen unlesbar waren (nur zur Anzeige; der Schnappschuss wird nie zurückgeschrieben).
 */
function pruefeFixkosten(roh) {
  if (!istObjekt(roh) || !Array.isArray(roh.shards) || roh.shards.length !== FIX_SHARDS) return null;
  const unlesbar = Array.isArray(roh.unlesbar) ? roh.unlesbar.filter((nr) => Number.isInteger(nr) && nr >= 0 && nr < FIX_SHARDS) : [];
  return { shards: roh.shards.map((s) => (s === null ? null : normalisiereShard(s))), unlesbar };
}

/**
 * Sparziele nachsichtig lesen (nur eine Kopie; laden() holt sie neu): gespeichert ist der Kalendertext ({ text, unlesbar }), gelesen wie
 * aus dem Kalender. Fehlt das (alter Schnappschuss) oder ist es unbrauchbar → null (= noch nicht gelesen), ohne den Rest zu verwerfen.
 * `unlesbar` = beim letzten Laden waren die Sparziele unlesbar (nur zur Anzeige: auch offline gesperrt).
 */
function pruefeZiele(roh) {
  if (!istObjekt(roh) || typeof roh.text !== 'string') return null;
  const gelesen = zieleLesen(roh.text);
  return gelesen.unlesbar ? null : { daten: gelesen.daten, unlesbar: roh.unlesbar === true };
}

/**
 * Sparziele für den Schnappschuss: als Kalendertext (kurz, mit fremden Einträgen); nur gelesene (Status 'geladen' oder 'gespeichert'),
 * und zwar der zuletzt GESPEICHERTE Stand (`bestaetigt`, solange eigene Änderungen offen sind – sie leben nur im Speicher) –
 * noch nie gelesen, beim letzten Laden gescheitert ('fehler') oder unbrauchbar → null (bei 'fehler' behält speichern() die Sparziele
 * des bisherigen Schnappschusses).
 */
function zieleFuerSnapshot(ziele) {
  if (ziele?.status !== 'geladen' && ziele?.status !== 'gespeichert') return null;
  try {
    return { text: zieleText(ziele.bestaetigt ?? ziele.daten), unlesbar: ziele.unlesbar === true };
  } catch {
    return null;
  }
}

/**
 * Autos nachsichtig lesen (nur eine Kopie; das Vorladen holt sie neu): gespeichert sind die Kalendertexte { text, historie: { [auto]:
 * { [jahr]: Text } }, unlesbar }, gelesen wie aus dem Kalender. Fehlt das (alter Schnappschuss) oder ist der Hauptteil unbrauchbar →
 * null (= noch nicht gelesen), ohne den Rest zu verwerfen; ein unbrauchbarer Verlauf-Teil fällt weg. `unlesbar` = beim letzten Lesen
 * Unlesbares (nur zur Anzeige: auch offline gesperrt).
 */
function pruefeAutos(roh) {
  if (!istObjekt(roh) || typeof roh.text !== 'string') return null;
  const haupt = autosLesen(roh.text);
  if (haupt.unlesbar) return null;
  const historie = {};
  for (const [auto, jahre] of Object.entries(istObjekt(roh.historie) ? roh.historie : {})) {
    for (const [jahr, text] of Object.entries(istObjekt(jahre) ? jahre : {})) {
      const g = typeof text === 'string' ? historieLesen(text, { auto, jahr: Number(jahr) }) : { unlesbar: true };
      if (!g.unlesbar) (historie[auto] ??= {})[jahr] = g.historie;
    }
  }
  const u = istObjekt(roh.unlesbar) ? roh.unlesbar : {};
  const shards = (Array.isArray(u.shards) ? u.shards : []).filter((x) => typeof x?.auto === 'string' && Number.isInteger(x?.jahr)).map(({ auto, jahr }) => ({ auto, jahr }));
  return { daten: haupt.daten, historie, unlesbar: { ...(u.main === true ? { main: true } : {}), shards } };
}

/**
 * Autos für den Schnappschuss: als Kalendertexte (kurz, mit fremden Einträgen); nur gelesene (Status 'geladen' oder 'gespeichert') –
 * sonst (noch nie gelesen, gerade am Lesen, gescheitert) null: dann behält speichern() die Autos des bisherigen Schnappschusses.
 */
function autosFuerSnapshot(autos, { jahre = Infinity } = {}) {
  if (autos?.status !== 'geladen' && autos?.status !== 'gespeichert') return null;
  const stand = autos.bestaetigt ?? autos; // offene (z. B. auf die Anmeldung wartende) Änderungen gelten nicht als gespeichert
  try {
    const historie = {};
    for (const [auto, liste] of Object.entries(stand.historie ?? {})) {
      const neueste = Object.keys(liste ?? {}).map(Number).sort((a, b) => b - a).slice(0, jahre);
      for (const jahr of neueste) (historie[auto] ??= {})[jahr] = historieText(liste[jahr]);
    }
    return { text: autosText(stand.daten), historie, unlesbar: autos.unlesbar ?? { shards: [] } };
  } catch {
    return null;
  }
}

/**
 * Versicherung nachsichtig lesen (nur eine Kopie; das Vorladen holt sie neu): gespeichert sind die Kalendertexte { text, teile: { [jahr]:
 * { [quartal]: Text } }, geschrieben, unlesbar }, gelesen wie aus dem Kalender. Fehlt das (alter Schnappschuss) oder ist der Hauptteil
 * unbrauchbar → null (= noch nicht gelesen), ohne den Rest zu verwerfen; ein unbrauchbarer Quartal-Teil fällt weg. `unlesbar` = beim
 * letzten Lesen Unlesbares (nur zur Anzeige: auch offline gesperrt).
 */
function pruefeVersicherungSnapshot(roh) {
  if (!istObjekt(roh) || typeof roh.text !== 'string') return null;
  const haupt = pruefeVersicherung(roh.text);
  if (haupt.unlesbar) return null;
  const teile = {};
  const geschrieben = {};
  for (const [j, quartale] of Object.entries(istObjekt(roh.teile) ? roh.teile : {})) {
    for (const [q, text] of Object.entries(istObjekt(quartale) ? quartale : {})) {
      const jahr = Number(j);
      const quartal = Number(q);
      const g = typeof text === 'string' ? pruefeVersicherungTeil(text, { jahr, quartal }) : { unlesbar: true };
      if (g.unlesbar) continue;
      (teile[jahr] ??= {})[quartal] = g.teil;
      const zeit = istObjekt(roh.geschrieben?.[j]) ? roh.geschrieben[j][q] : undefined;
      if (typeof zeit === 'string') (geschrieben[jahr] ??= {})[quartal] = zeit;
    }
  }
  const u = istObjekt(roh.unlesbar) ? roh.unlesbar : {};
  const unlesbareTeile = (Array.isArray(u.teile) ? u.teile : []).filter((x) => Number.isInteger(x?.jahr) && Number.isInteger(x?.quartal)).map(({ jahr, quartal }) => ({ jahr, quartal }));
  return { daten: haupt.daten, teile, geschrieben, unlesbar: { ...(u.main === true ? { main: true } : {}), teile: unlesbareTeile } };
}

/**
 * Versicherung für den Schnappschuss: als Kalendertexte (kurz, mit fremden Einträgen); nur gelesene (Status 'geladen' oder
 * 'gespeichert') – sonst null: dann behält speichern() die Versicherung des bisherigen Schnappschusses. `jahre` = nur die neuesten Jahre.
 */
function versicherungFuerSnapshot(v, { jahre = Infinity } = {}) {
  if (v?.status !== 'geladen' && v?.status !== 'gespeichert') return null;
  const stand = v.bestaetigt ?? v; // offene (z. B. auf die Anmeldung wartende) Änderungen gelten nicht als gespeichert
  try {
    const teile = {};
    const neueste = Object.keys(stand.teile ?? {}).map(Number).sort((a, b) => b - a).slice(0, jahre);
    for (const jahr of neueste) for (const [quartal, teil] of Object.entries(stand.teile[jahr] ?? {})) (teile[jahr] ??= {})[quartal] = versicherungTeilText(teil);
    return { text: versicherungText(stand.daten), teile, geschrieben: v.geschrieben ?? {}, unlesbar: v.unlesbar ?? { teile: [] } };
  } catch {
    return null;
  }
}

/** So viele Jahre bleiben von der Versicherung im Schnappschuss, wenn er sonst zu groß wäre (das laufende und das vorige Jahr). */
export const SNAPSHOT_VERSICHERUNG_JAHRE = 2;

/** So viele Jahre je Auto bleiben im Schnappschuss, wenn er sonst zu groß wäre (die längste Regel rechnet mit 48 Monaten). */
export const SNAPSHOT_AUTOS_JAHRE = 5;

/** Prüft die gelesene Struktur streng; liefert die bereinigten Daten oder null. */
function pruefe(roh) {
  if (!istObjekt(roh) || roh.v !== 1 || typeof roh.gespeichertAm !== 'string' || Number.isNaN(Date.parse(roh.gespeichertAm))) return null;
  let settings;
  try {
    settings = normalizeSettings(roh.settings ?? {});
  } catch {
    return null;
  }
  if (!istObjekt(roh.tage) || !Array.isArray(roh.urlaub) || !Array.isArray(roh.termine)) return null;
  for (const [datum, eintrag] of Object.entries(roh.tage)) {
    if (!gueltigesDatum(datum) || !istObjekt(eintrag) || !TAGES_TYPEN.includes(eintrag.typ)) return null;
  }
  for (const u of roh.urlaub) {
    if (!istObjekt(u) || typeof u.id !== 'string' || !gueltigesDatum(u.start) || !gueltigesDatum(u.end) || u.end < u.start) return null;
  }
  for (const t of roh.termine) {
    if (!istObjekt(t) || typeof t.id !== 'string' || !TERMIN_TYPEN.includes(t.typ) || !TYPES[t.typ] || !gueltigesDatum(t.date) || !Array.isArray(t.mitnehmen ?? [])) return null;
  }
  const fenster = istObjekt(roh.fenster) && gueltigesDatum(roh.fenster.von) && gueltigesDatum(roh.fenster.bis) ? { von: roh.fenster.von, bis: roh.fenster.bis } : null;
  return { daten: { settings, tage: roh.tage, urlaub: roh.urlaub, termine: roh.termine, fenster, einkauf: normalisiereListe(roh.einkauf), konto: normalisiereKonto(roh.konto), schicht: pruefeSchicht(roh.schicht, new Date(roh.gespeichertAm).toISOString()), fixkosten: pruefeFixkosten(roh.fixkosten), ziele: pruefeZiele(roh.ziele), autos: pruefeAutos(roh.autos), versicherung: pruefeVersicherungSnapshot(roh.versicherung) }, gespeichertAm: roh.gespeichertAm };
}

export function createSnapshot({ speicher = globalThis.localStorage ?? null, jetzt = () => new Date() } = {}) {
  return {
    /**
     * Speichert Tage, Urlaub, Termine und Einstellungen der letzten zwölf Monate, dazu die Schichtarten und von den geladenen Monaten
     * des Schichtplans die sechs am nächsten zu `heute`, die vier Teile der Fixkosten, die Sparziele, die Autos und die Versicherung (jeweils falls schon gelesen).
     * Gibt true zurück, wenn gespeichert wurde.
     */
    speichern(state, heute) {
      if (!speicher) return false;
      /** Die Sparziele des bisherigen Schnappschusses (roh, nur wenn brauchbar): nach einem gescheiterten Lesen bleiben sie. */
      const letzteZiele = () => {
        try {
          const alt = JSON.parse(speicher.getItem(SNAPSHOT_KEY))?.ziele;
          return pruefeZiele(alt) ? alt : null;
        } catch {
          return null;
        }
      };
      /** Die Autos des bisherigen Schnappschusses (roh, nur wenn brauchbar): solange keine frisch gelesenen da sind, bleiben sie. */
      const letzteAutos = () => {
        try {
          const alt = JSON.parse(speicher.getItem(SNAPSHOT_KEY))?.autos;
          return pruefeAutos(alt) ? alt : null;
        } catch {
          return null;
        }
      };
      /** Die Versicherung des bisherigen Schnappschusses (roh, nur wenn brauchbar): solange keine frisch gelesene da ist, bleibt sie. */
      const letzteVersicherung = () => {
        try {
          const alt = JSON.parse(speicher.getItem(SNAPSHOT_KEY))?.versicherung;
          return pruefeVersicherungSnapshot(alt) ? alt : null;
        } catch {
          return null;
        }
      };
      const grenze = addDays(heute, -TAGE_ZURUECK);
      const roh = {
        v: 1,
        gespeichertAm: jetzt().toISOString(),
        settings: state.settings,
        tage: Object.fromEntries(Object.entries(state.tage).filter(([d]) => d >= grenze)),
        urlaub: state.urlaub.filter((u) => u.end >= grenze),
        termine: state.termine.filter((t) => t.date >= grenze),
        fenster: state.fenster ?? null,
        einkauf: state.einkauf ?? null,
        konto: state.konto ?? null,
        schicht: state.schicht ? { katalog: state.schicht.katalog ?? null, monate: naechsteMonate(state.schicht.monate, heute, MAX_SNAPSHOT_SCHICHT_MONATE) } : null,
        // im Zustandsformat (lange Schlüssel): etwa 1,5-mal der Kalendertext, also höchstens rund 4 × 9000 Zeichen
        fixkosten: state.fixkosten?.shards ? { shards: state.fixkosten.shards, unlesbar: state.fixkosten.unlesbar ?? [] } : null,
        ziele: zieleFuerSnapshot(state.ziele) ?? (state.ziele?.status === 'fehler' ? letzteZiele() : null), // höchstens ~6000 Zeichen (Kalendertext)
        autos: autosFuerSnapshot(state.autos) ?? letzteAutos(), // Kalendertexte: Hauptteil + je Auto und Jahr ein Teil (je ≤ 6000 Zeichen)
        versicherung: versicherungFuerSnapshot(state.versicherung) ?? letzteVersicherung(), // Kalendertexte: Hauptteil + je Quartal ein Teil (je ≤ 6000 Zeichen)
      };
      let text = JSON.stringify(roh);
      // zu groß (viele Jahre Verlauf bzw. Rechnungen): erst nur die neuesten Jahre (je Auto, bei der Versicherung), sonst ohne Autos
      // bzw. ohne Versicherung – der Rest des Abbilds bleibt aktuell
      const kuerzen = (feld, wert) => {
        if (text.length <= MAX_SNAPSHOT_ZEICHEN || !roh[feld]) return;
        roh[feld] = wert();
        text = JSON.stringify(roh);
      };
      kuerzen('autos', () => autosFuerSnapshot(state.autos, { jahre: SNAPSHOT_AUTOS_JAHRE }));
      kuerzen('versicherung', () => versicherungFuerSnapshot(state.versicherung, { jahre: SNAPSHOT_VERSICHERUNG_JAHRE }));
      kuerzen('autos', () => null);
      kuerzen('versicherung', () => null);
      if (text.length > MAX_SNAPSHOT_ZEICHEN) return false;
      try {
        speicher.setItem(SNAPSHOT_KEY, text);
        return true;
      } catch {
        return false; // privater Modus oder voller Speicher
      }
    },

    /** { daten, gespeichertAm } oder null (nichts gespeichert, beschädigt oder aus einer anderen Version). */
    lesen() {
      if (!speicher) return null;
      try {
        return pruefe(JSON.parse(speicher.getItem(SNAPSHOT_KEY) ?? 'null'));
      } catch {
        return null;
      }
    },

    loeschen() {
      try {
        speicher?.removeItem(SNAPSHOT_KEY);
      } catch {
        // nichts zu tun
      }
    },
  };
}
