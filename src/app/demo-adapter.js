import { todayVienna } from '../domain/dates.js';
import { normalizeSettings } from '../domain/settings.js';
import { leereListe, normalisiereListe } from '../domain/einkauf.js';
import { leeresKonto, normalisiereKonto } from '../domain/konto.js';
import { katalogText, leererMonat, monatText, normalisiereKatalog, normalisiereMonat, standardKatalog } from '../domain/schicht.js';
import { FIX_SHARDS, leererShard, normalisiereShard, shardText, teilGesperrtFehler } from '../domain/fixkosten.js';
import { zieleGesperrtFehler, zieleLesen, zieleText, zieleWarnungen } from '../domain/sparziele.js';
import { seedDemo } from './seed.js';

const KEY = 'fk.demo.v1';

/** Schichtdaten aus dem Speicher nachsichtig lesen: { katalog | null, monate: { 'JJJJ-MM': Monat } }; Unbrauchbares fällt weg. */
function schichtAusSpeicher(roh) {
  const katalog = roh?.katalog == null ? null : normalisiereKatalog(roh.katalog).katalog;
  const monate = {};
  for (const [jm, monat] of Object.entries(roh?.monate && typeof roh.monate === 'object' ? roh.monate : {})) {
    try {
      monate[jm] = normalisiereMonat(monat, jm).monat;
    } catch {
      // kein gültiger Monat als Schlüssel: weglassen
    }
  }
  return { katalog, monate };
}

/** Kann diese Version einen gespeicherten Teil lesen? (Sonst: beschädigt oder von einer neueren Version – wie bei Google nie überschreiben.) */
const fixTeilLesbar = (t) => t !== null && typeof t === 'object' && !Array.isArray(t) && t.v === 1 && Array.isArray(t.posten);

/**
 * Fixkosten aus dem Speicher nachsichtig lesen: { shards: [Teil | null ×4] }; ungültige Posten fallen weg. Ein unlesbarer Teil bleibt
 * roh stehen (wie bei Google wird er leer gezeigt und nie überschrieben, siehe leseFixkosten/aendereFixShard).
 */
function fixkostenAusSpeicher(roh) {
  const liste = Array.isArray(roh?.shards) ? roh.shards : [];
  return { shards: Array.from({ length: FIX_SHARDS }, (_, nr) => (liste[nr] == null ? null : fixTeilLesbar(liste[nr]) ? normalisiereShard(liste[nr]) : liste[nr])) };
}

/**
 * Sparziele aus dem Speicher lesen, genau wie beim Google-Adapter (gespeichert ist der Kalendertext): { daten, unlesbar, warnungen, text }.
 * Kein Text (alter Speicher) → leere Daten; unlesbarer Text → leer, gesperrt (nie überschreiben), mit dem Rohtext für die Sicherung.
 */
function zieleGelesen(text) {
  const { daten, unlesbar } = zieleLesen(typeof text === 'string' ? text : null);
  return { daten, unlesbar, warnungen: zieleWarnungen({ daten, unlesbar }), text: unlesbar ? text : null };
}

/**
 * Kalender-Adapter für den Demo-Modus: hält alles in `localStorage` und kennt weder Google noch das Netz.
 * Schnittstelle (die später auch der Google-Adapter erfüllt):
 * laden, setzeTag, loescheTag, speichereUrlaub, loescheUrlaub, speichereTermin, loescheTermin, speichereSettings, zuruecksetzen.
 */
export function createDemoAdapter({ speicher = globalThis.localStorage, jetzt = () => new Date() } = {}) {
  let daten = null;

  function sichern() {
    try {
      speicher.setItem(KEY, JSON.stringify(daten));
    } catch {
      // privater Modus oder voller Speicher: die Demo läuft im Arbeitsspeicher weiter
    }
  }

  function neuErzeugen() {
    const seed = seedDemo(todayVienna(jetzt()));
    daten = { ...seed, ziele: zieleText(seed.ziele) }; // Sparziele wie im Kalender als Text (so verhält sich „unlesbar“ wie bei Google)
    sichern();
  }

  /** Was laden() und zuruecksetzen() liefern: eine Kopie, die Sparziele gelesen wie beim Google-Adapter. */
  const nachAussen = () => ({ ...structuredClone(daten), ziele: zieleGelesen(daten.ziele) });

  return {
    istDemo: true, // der Store erlaubt „Beispieldaten entfernen“ nur mit einem Adapter, der das von sich sagt
    async laden() {
      if (!daten) {
        try {
          daten = JSON.parse(speicher.getItem(KEY) ?? 'null');
        } catch {
          daten = null;
        }
        if (daten) {
          try {
            daten.settings = normalizeSettings(daten.settings);
          } catch {
            daten = null;
          }
        }
        if (!daten) neuErzeugen();
        else {
          daten.einkauf = normalisiereListe(daten.einkauf ?? leereListe()); // Demo-Speicher aus einer älteren Version hat noch keine Liste
          daten.konto = normalisiereKonto(daten.konto ?? leeresKonto()); // … und noch keine Kontostände
          daten.schicht = schichtAusSpeicher(daten.schicht); // … und noch keinen Schichtplan
          daten.fixkosten = fixkostenAusSpeicher(daten.fixkosten); // … und noch keine Fixkosten
          daten.ziele = typeof daten.ziele === 'string' ? daten.ziele : null; // … und noch keine Sparziele (Text wie im Kalender)
        }
      }
      return nachAussen();
    },
    async setzeTag(date, typ) {
      daten.tage[date] = { typ };
      sichern();
    },
    async loescheTag(date) {
      delete daten.tage[date];
      sichern();
    },
    async speichereUrlaub(urlaub) {
      daten.urlaub = [...daten.urlaub.filter((u) => u.id !== urlaub.id), urlaub];
      sichern();
    },
    async loescheUrlaub(id) {
      daten.urlaub = daten.urlaub.filter((u) => u.id !== id);
      sichern();
    },
    async speichereTermin(termin) {
      daten.termine = [...daten.termine.filter((t) => t.id !== termin.id), termin];
      sichern();
    },
    async loescheTermin(id) {
      daten.termine = daten.termine.filter((t) => t.id !== id);
      sichern();
    },
    /** Kontostände ändern: `aenderung(konto)` → neues Konto (wie beim Google-Adapter); gibt das gespeicherte Konto zurück. */
    async aendereKonto(aenderung) {
      const neu = aenderung(daten.konto ?? leeresKonto());
      if (!neu) return null;
      daten.konto = neu;
      sichern();
      return structuredClone(neu);
    },
    /** Schichtarten lesen (wie beim Google-Adapter): { katalog | null }. */
    async leseSchichtarten() {
      return { katalog: structuredClone(daten?.schicht?.katalog ?? null) };
    },
    /** Schichtarten ändern: `aenderung(katalog)` → neuer Katalog (fehlt er: Standardarten); zu große Kataloge werden wie bei Google abgelehnt. */
    async aendereSchichtarten(aenderung) {
      const neu = aenderung(structuredClone(daten.schicht.katalog ?? standardKatalog()));
      if (!neu) return null;
      katalogText(neu); // wirft, wenn er nicht in den Kalender passen würde
      daten.schicht.katalog = structuredClone(neu);
      sichern();
      return structuredClone(neu);
    },
    /** Schichtplan eines Monats 'JJJJ-MM' lesen (wie beim Google-Adapter): { monat | null }. */
    async leseSchichtMonat(jm) {
      return { monat: structuredClone(daten?.schicht?.monate?.[jm] ?? null) };
    },
    /** Monat ändern: `aenderung(monat)` → neuer Monat (fehlt er: leerer Monat); zu große Monate werden wie bei Google abgelehnt. */
    async aendereSchichtMonat(jm, aenderung) {
      const neu = aenderung(structuredClone(daten.schicht.monate[jm] ?? leererMonat(jm)));
      if (!neu) return null;
      monatText({ ...neu, jm }); // wirft, wenn er nicht in den Kalender passen würde
      daten.schicht.monate[jm] = structuredClone({ ...neu, jm });
      sichern();
      return structuredClone(neu);
    },
    /** Fixkosten lesen (wie beim Google-Adapter): { shards: [Teil | null ×4], warnungen, unlesbar: [{ nr, text }] }. */
    async leseFixkosten() {
      const roh = daten?.fixkosten?.shards ?? Array(FIX_SHARDS).fill(null);
      const unlesbar = roh.flatMap((t, nr) => (t != null && !fixTeilLesbar(t) ? [{ nr, text: JSON.stringify(t) }] : []));
      const shards = roh.map((t) => (t == null ? null : fixTeilLesbar(t) ? structuredClone(t) : leererShard()));
      const warnungen = unlesbar.map(() => 'Ein Teil der Fixkosten ist unlesbar (beschädigt oder von einer neueren App-Version); er wird leer gezeigt und lässt sich nicht ändern.');
      return { shards, warnungen, unlesbar };
    },
    /** Teil `nr` (0 … 3) ändern: `aenderung(teil)` → neuer Teil (fehlt er: leerer Teil); zu volle Teile werden wie bei Google abgelehnt. */
    async aendereFixShard(nr, aenderung) {
      if (!Number.isInteger(nr) || nr < 0 || nr >= FIX_SHARDS) throw new Error(`Ungültiger Teil der Fixkosten: ${nr}`);
      const alt = daten.fixkosten.shards[nr];
      if (alt != null && !fixTeilLesbar(alt)) throw teilGesperrtFehler(); // unlesbar: nie überschreiben
      const neu = aenderung(structuredClone(daten.fixkosten.shards[nr] ?? leererShard()));
      if (!neu) return null;
      shardText(neu); // wirft, wenn er nicht in den Kalender passen würde
      daten.fixkosten.shards[nr] = structuredClone(neu);
      sichern();
      return structuredClone(neu);
    },
    /** Sparziele lesen (wie beim Google-Adapter): { daten, unlesbar, warnungen, text }. */
    async leseZiele() {
      return zieleGelesen(daten?.ziele);
    },
    /**
     * Sparziele ändern: `aenderung(daten)` → neue Daten (fehlen sie: leere Daten); gibt die gespeicherten zurück. Wie bei Google: unlesbare
     * Sparziele werden nie überschrieben (Fehler „ZieleGesperrt“), zu volle abgelehnt; fremde Einträge bleiben im Text erhalten.
     */
    async aendereZiele(aenderung) {
      const alt = zieleGelesen(daten.ziele);
      if (alt.unlesbar) throw zieleGesperrtFehler();
      const neu = aenderung(structuredClone(alt.daten));
      if (!neu) return null;
      daten.ziele = zieleText(neu); // wirft, wenn sie nicht in den Kalender passen würden
      sichern();
      return structuredClone(neu);
    },
    /** Einkaufsliste lesen (wie beim Google-Adapter): { liste }. In der Demo schreibt kein anderes Telefon, sie ist also immer die eigene. */
    async leseEinkauf() {
      return { liste: structuredClone(daten?.einkauf ?? leereListe()) };
    },
    /** Einkaufsliste ändern: `aenderung(liste)` → neue Liste (wie beim Google-Adapter); gibt die gespeicherte Liste zurück. */
    async aendereEinkauf(aenderung) {
      const neu = aenderung(daten.einkauf ?? leereListe());
      if (!neu) return null;
      daten.einkauf = neu;
      sichern();
      return structuredClone(neu);
    },
    async speichereSettings(settings) {
      daten.settings = normalizeSettings({ ...daten.settings, ...settings });
      sichern();
    },
    async zuruecksetzen() {
      neuErzeugen();
      return nachAussen();
    },
  };
}
