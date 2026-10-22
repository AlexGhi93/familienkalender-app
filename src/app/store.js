import { todayVienna } from '../domain/dates.js';
import { normalizeSettings } from '../domain/settings.js';
import { spanDays } from '../domain/span.js';
import { planUmwandlung } from '../domain/umwandlung.js';
import { entfernen as artikelEntfernen, erledigteEntfernen, hinzufuegen as artikelHinzufuegen, leereListe, normalisiereListe, umschalten as artikelUmschalten, wiederherstellen } from '../domain/einkauf.js';
import { urlaubCheckEventId } from '../domain/ids.js';
import { normalisiereTermin } from './termin.js';
import { urlaubChecksAbgleich, urlaubChecksWunsch } from './urlaub-check.js';
import { entferneExtra, entferneStand, fuegeExtraHinzu, leeresKonto, monatVor, normalisiereKonto, setzeStand } from '../domain/konto.js';
import { artAendern, artArchivieren, artHinzufuegen, artVerschieben, leererMonat, normalisiereKatalog, normalisiereMonat, schaltePinsel, setzeNotiz, setzeSchicht, standardKatalog, tageImMonat, zusatzEntfernen, zusatzHinzufuegen } from '../domain/schicht.js';
import { MAX_SERIEN_WOCHEN, naechsterWochentag, wochenSerie } from './serie.js';

const KITA_TYPEN = ['kita_essen', 'kita_ohne'];
const MIN_ABSTAND_MS = 60_000; // höchstens einmal pro Minute neu laden
const FORTSCHRITT_AB = 3; // ab mehr als drei Schreibvorgängen gibt es eine Fortschrittsanzeige

const SCHICHT_SICHERUNG_AB = '2026-01'; // erster Monat, den die Sicherung nach einem Schichtplan fragt
const SCHICHT_SICHERUNG_VORAUS = 12; // … bis zwölf Monate nach dem laufenden
const SCHICHT_SICHERUNG_PARALLEL = 6; // so viele Monate werden gleichzeitig gefragt

const TEXT_FEHLER = 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.';
// Fehler, die eine reine Änderungsfunktion auf der neuesten Fassung geworfen hat (fachliche Ablehnung mit deutscher Meldung).
const FACHLICH = new WeakSet();
const TEXT_ANMELDEN = 'Bitte neu anmelden: deine Änderung wird danach gespeichert.';
const TEXT_UNKLAR = 'Möglicherweise teilweise gespeichert – bitte aktualisieren.';

/** Zufällige ID aus den Zeichen 0-9 und a-v: so darf sie auch als Google-Ereignis-ID dienen. */
const zufaelligeId = () => `u${Array.from({ length: 11 }, () => Math.floor(Math.random() * 32).toString(32)).join('')}`;

const istAuthFehler = (fehler) => fehler?.name === 'AuthAbgelaufen';

/** Schichtplan im Zustand: `katalog` null = noch nicht gelesen (die Ansicht zeigt dann die Standardarten). */
const leererSchichtplan = () => ({ katalog: null, monate: {}, status: {} });

/** Schichtplan aus Schnappschuss oder Beispieldaten ({ katalog, monate }): normalisiert, alle Monate gelten als geladen. */
function schichtAusDaten(roh) {
  const monate = {};
  for (const [jm, monat] of Object.entries(roh?.monate ?? {})) {
    try {
      monate[jm] = normalisiereMonat(monat, jm).monat;
    } catch {
      // kein gültiger Monat als Schlüssel: weglassen
    }
  }
  return { katalog: roh?.katalog ? normalisiereKatalog(roh.katalog).katalog : null, monate, status: Object.fromEntries(Object.keys(monate).map((jm) => [jm, 'geladen'])) };
}

/**
 * Übernimmt aus dem, was ein Adapter liefert, nur die Felder des Zustands. Den Schichtplan nicht: er wird erst beim Öffnen seiner Seite
 * geladen (`schichtLaden`); die Demo liefert ihn zwar mit, aber so verhalten sich Demo und Google gleich.
 */
function ladeFelder(daten, state) {
  return {
    settings: daten.settings ?? state.settings,
    tage: daten.tage ?? {},
    urlaub: daten.urlaub ?? [],
    termine: daten.termine ?? [],
    einkauf: daten.einkauf ? normalisiereListe(daten.einkauf) : (state.einkauf ?? leereListe()),
    konto: daten.konto ? normalisiereKonto(daten.konto) : (state.konto ?? leeresKonto()),
    urlaubChecks: daten.urlaubChecks ?? state.urlaubChecks ?? [],
    ...(daten.konflikte ? { konflikte: daten.konflikte } : {}),
    ...(daten.warnungen ? { warnungen: daten.warnungen } : {}),
    ...(daten.fenster ? { fenster: daten.fenster } : {}),
  };
}

/**
 * Zustand der App. Alle Änderungen gehen zuerst in den Zustand (Oberfläche reagiert sofort) und dann in den Adapter.
 * - Schlägt das Speichern fehl, wird der Stand neu vom Adapter geladen (Teil-Erfolge bleiben sichtbar) und `fehler` gesetzt.
 * - Läuft die Anmeldung ab (Fehler „AuthAbgelaufen“), bleibt die Änderung sichtbar und wartet; `wiederholeAusstehende()`
 *   speichert sie nach dem erneuten Anmelden.
 * - Mehr als drei Schreibvorgänge melden ihren Fortschritt (`state.fortschritt`).
 */
export function createStore(adapter, { jetzt = () => new Date(), neueId = zufaelligeId } = {}) {
  let state = { geladen: false, settings: normalizeSettings(), tage: {}, urlaub: [], termine: [], einkauf: leereListe(), konto: leeresKonto(), schicht: leererSchichtplan(), fehler: null, fortschritt: null, anmeldungNoetig: false, fenster: null };
  const hoerer = new Set();
  const wartend = []; // Schreibvorgänge, die wegen abgelaufener Anmeldung noch fehlen
  const geladeneBereiche = [];
  const ladendeBereiche = new Set();
  let letzteLadung = 0;
  let checksLaufen = false;
  let schreibend = 0; // Schreibvorgänge, die gerade laufen
  let schreibStand = 0; // zählt begonnene Schreibvorgänge: so erkennt `einkaufAktualisieren`, dass inzwischen selbst etwas geändert wurde
  let einkaufGeprueft = null; // wann die Einkaufsliste zuletzt mit dem Kalender abgeglichen war (ms): Laden, Aktualisieren, eigenes Speichern
  let einkaufHolen = null; // laufende Abfrage der Einkaufsliste: mehrfaches Anstoßen fragt nur einmal
  const melden = () => {
    for (const h of hoerer) h(state);
  };

  /**
   * Führt einen Schreibvorgang aus. Ergebnis: 'ok', 'auth' (wartet auf Anmeldung) oder 'fehler' (zurückgenommen, neu geladen).
   * Ohne `optionen` wird bei einem Fehler alles auf `alt` zurückgesetzt und neu geladen. Mit `optionen.zurueck()` (→ neuer Zustand)
   * wird nur das Betroffene zurückgenommen und danach `optionen.neuLesen()` statt des ganzen Ladens ausgeführt (Schichtplan).
   */
  async function ausfuehren(schreibe, alt, optionen = {}) {
    let erledigt = 0;
    let gesamt = 0;
    schreibStand += 1;
    schreibend += 1;
    const bericht = (e, g) => {
      erledigt = e;
      gesamt = g;
      if (g > FORTSCHRITT_AB) {
        state = { ...state, fortschritt: { erledigt: e, gesamt: g } };
        melden();
      }
    };
    try {
      await schreibe(bericht);
      if (state.fortschritt) {
        state = { ...state, fortschritt: null };
        melden();
      }
      return 'ok';
    } catch (fehler) {
      if (istAuthFehler(fehler)) {
        wartend.push({ schreibe, optionen });
        state = { ...state, fortschritt: null, anmeldungNoetig: true, fehler: TEXT_ANMELDEN };
        melden();
        return 'auth';
      }
      // Lehnt eine reine Änderung auf der neuesten Fassung ab (z. B. das andere Telefon hat dasselbe Kürzel schon vergeben), zählt ihre Meldung.
      let text = gesamt > 1 && erledigt > 0 ? `Gespeichert: ${erledigt} von ${gesamt}. Bitte noch einmal versuchen; Gespeichertes bleibt erhalten.` : TEXT_FEHLER;
      if (FACHLICH.has(fehler)) text = fehler.message;
      optionen.beiFehler?.(fehler, text);
      if (optionen.zurueck) {
        state = { ...optionen.zurueck(), fortschritt: null, fehler: text };
        melden();
        try {
          await optionen.neuLesen();
        } catch {
          state = { ...state, fehler: TEXT_UNKLAR };
        }
        melden();
        return 'fehler';
      }
      state = { ...alt, fortschritt: null, fehler: text };
      melden();
      try {
        state = { ...state, ...ladeFelder(await adapter.laden(), state), fehler: text };
        geladeneBereiche.length = 0;
      } catch {
        state = { ...state, fehler: TEXT_UNKLAR };
      }
      melden();
      return 'fehler';
    } finally {
      schreibend -= 1;
    }
  }

  async function aendere(neu, schreibe) {
    const alt = state;
    state = { ...state, ...neu, fehler: null };
    melden();
    await ausfuehren(schreibe, alt);
  }

  const pruefeWochen = (wochen) => {
    if (!Number.isInteger(wochen) || wochen < 1 || wochen > MAX_SERIEN_WOCHEN) throw new Error(`Wochen: bitte 1 bis ${MAX_SERIEN_WOCHEN} wählen.`);
  };

  /** Termine einer wöchentlichen Serie ab `roh.date` (Feiertage, Urlaub usw. werden verschoben oder übersprungen). */
  function serieTermine(roh, wochen) {
    const basis = normalisiereTermin({ ...roh, typ: 'kita_sache', serie: undefined });
    const plan = wochenSerie(state, { start: basis.date, wochen, richtung: basis.richtung, heute: todayVienna(jetzt()) });
    const serie = neueId();
    return {
      termine: plan.eintraege.map((e) => ({ id: neueId(), ...basis, date: e.date, serie })),
      verschoben: plan.eintraege.filter((e) => e.verschobenVon).length,
      uebersprungen: plan.uebersprungen,
    };
  }

  async function termineAnlegen(neue) {
    if (neue.length === 0) throw new Error('In diesem Zeitraum gibt es keinen passenden Tag.');
    const ids = new Set(neue.map((t) => t.id));
    await aendere({ termine: [...state.termine.filter((t) => !ids.has(t.id)), ...neue] }, async (bericht) => {
      let i = 0;
      for (const t of neue) {
        await adapter.speichereTermin(t);
        bericht((i += 1), neue.length);
      }
    });
  }

  /**
   * Ändert die Einkaufsliste: `fn(liste)` → neue Liste. Sofort sichtbar; bei Google wird `fn` auf die NEUESTE Fassung angewendet,
   * damit zwei Telefone sich nicht überschreiben. Wirft sofort (ohne etwas zu ändern), wenn `fn` die Eingabe ablehnt.
   */
  async function einkaufAendern(fn) {
    const neu = fn(state.einkauf);
    await aendere({ einkauf: neu }, async () => {
      const gespeichert = await adapter.aendereEinkauf(fn);
      if (gespeichert) {
        einkaufGeprueft = jetzt().getTime(); // gespeichert wurde auf der neuesten Fassung: die Liste ist jetzt aktuell
        state = { ...state, einkauf: gespeichert };
        melden();
      }
    });
  }

  /**
   * Ändert die Kontostände und Sonderbeträge: `fn(konto)` → neues Konto. Sofort sichtbar; bei Google wird `fn` auf die NEUESTE Fassung angewendet
   * (zwei Telefone überschreiben sich nicht). Wirft sofort (ohne etwas zu ändern), wenn `fn` die Eingabe ablehnt.
   */
  async function kontoAendern(fn) {
    const neu = fn(state.konto);
    await aendere({ konto: neu }, async () => {
      const gespeichert = await adapter.aendereKonto(fn);
      if (gespeichert) {
        state = { ...state, konto: gespeichert };
        melden();
      }
    });
  }

  // Schichtplan-Änderungen, die noch nicht gespeichert sind, je Teil ('katalog' oder 'JJJJ-MM'):
  // { basis: zuletzt bekannter Stand im Kalender, offen: [fn, …] in Tipp-Reihenfolge, kette: Promise der Speicherungen }.
  // Angezeigt wird immer `basis` mit allen offenen Änderungen darauf: so verschwindet kein Tipp, während ein früherer gespeichert wird.
  const schichtOffen = new Map();
  const schichtSchreibtNoch = () => schichtOffen.size > 0;

  const schichtTeil = (teil) => (teil === 'katalog' ? state.schicht.katalog : state.schicht.monate[teil]);
  const mitSchichtTeil = (teil, wert) => ({ ...state, schicht: teil === 'katalog' ? { ...state.schicht, katalog: wert } : { ...state.schicht, monate: { ...state.schicht.monate, [teil]: wert } } });

  /** `basis` mit den offenen Änderungen; eine, die darauf nicht mehr passt, wird übersprungen (ihr eigenes Speichern meldet den Fehler). */
  const mitOffenen = (basis, offen) =>
    offen.reduce((wert, fn) => {
      try {
        return fn(wert);
      } catch {
        return wert;
      }
    }, basis);

  /**
   * Ändert einen Teil des Schichtplans: `fn(wert)` → neuer Wert. Sofort sichtbar; wirft sofort (ohne etwas zu ändern), wenn `fn` ablehnt.
   * Gespeichert wird je Teil eines nach dem anderen (schnelle Pinsel-Tipps streiten nicht um dieselbe Fassung im Kalender), und zwar `fn`
   * auf der NEUESTEN Fassung (zwei Telefone überschreiben sich nicht). Bei einem Fehler wird nur diese Änderung zurückgenommen und der
   * Teil neu gelesen; anderes (inzwischen geladene Monate, Status) bleibt. Gibt den sofort angezeigten Wert zurück.
   */
  async function schichtAendern(teil, fn, { leer, speichern, lesen, normalisiere }) {
    const vorher = schichtTeil(teil) ?? leer();
    const neu = fn(vorher);
    let eintrag = schichtOffen.get(teil);
    if (!eintrag) {
      eintrag = { basis: vorher, offen: [], kette: Promise.resolve() };
      schichtOffen.set(teil, eintrag);
    }
    eintrag.offen.push(fn);
    state = { ...mitSchichtTeil(teil, neu), fehler: null };
    melden();

    const anzeigen = () => mitSchichtTeil(teil, mitOffenen(eintrag.basis, eintrag.offen));
    const herausnehmen = () => {
      const i = eintrag.offen.indexOf(fn);
      if (i >= 0) eintrag.offen.splice(i, 1);
    };
    const aufraeumen = () => {
      if (eintrag.offen.length === 0 && schichtOffen.get(teil) === eintrag) schichtOffen.delete(teil);
    };
    // Wirft `fn` auf der neuesten Fassung, ist das eine fachliche Ablehnung (deutsche Meldung), kein Netzfehler.
    const aufNeuester = (wert) => {
      try {
        return fn(wert);
      } catch (e) {
        if (e instanceof Error) FACHLICH.add(e);
        throw e;
      }
    };
    let fehlerText = null;
    const schreibe = async () => {
      const gespeichert = await speichern(aufNeuester);
      herausnehmen();
      if (gespeichert) eintrag.basis = normalisiere(gespeichert);
      state = anzeigen();
      aufraeumen();
      melden();
    };
    const optionen = {
      beiFehler: (_fehler, text) => {
        fehlerText = text;
      },
      zurueck: () => {
        herausnehmen();
        return anzeigen();
      },
      async neuLesen() {
        try {
          eintrag.basis = normalisiere(await lesen());
          state = anzeigen();
        } finally {
          aufraeumen();
        }
      },
    };
    const lauf = eintrag.kette.then(() => ausfuehren(schreibe, state, optionen));
    eintrag.kette = lauf;
    const ergebnis = await lauf;
    return { neu, ergebnis, fehler: ergebnis === 'auth' ? TEXT_ANMELDEN : fehlerText };
  }

  /** Ändert einen Monat des Schichtplans (siehe `schichtAendern`). */
  async function schichtMonatAendern(jm, fn) {
    const { neu } = await schichtAendern(jm, fn, {
      leer: () => leererMonat(jm),
      speichern: (f) => adapter.aendereSchichtMonat(jm, f),
      lesen: async () => (await adapter.leseSchichtMonat(jm)).monat ?? null,
      normalisiere: (m) => normalisiereMonat(m, jm).monat,
    });
    return neu;
  }

  /**
   * Ändert die Schichtarten (siehe `schichtAendern`); gibt es noch keine, wird von den Standardarten ausgegangen. Ergebnis:
   * { ok: true } nach dem Speichern im Kalender, sonst { ok: false, fehler } (fachliche Meldung wie „Dieses Kürzel gibt es schon.“ oder
   * der allgemeine Text; zurückgenommen und neu gelesen) bzw. { ok: false, wartet: true, fehler } (wird nach dem Anmelden gespeichert).
   * Wirft nur, wenn die Eingabe schon auf dem angezeigten Stand abgelehnt wird (dann ändert sich nichts).
   */
  async function schichtKatalogAendern(fn) {
    const { ergebnis, fehler } = await schichtAendern('katalog', fn, {
      leer: standardKatalog,
      speichern: (f) => adapter.aendereSchichtarten(f),
      lesen: async () => (await adapter.leseSchichtarten()).katalog ?? null,
      normalisiere: (k) => normalisiereKatalog(k).katalog,
    });
    if (ergebnis === 'ok') return { ok: true };
    return ergebnis === 'auth' ? { ok: false, wartet: true, fehler } : { ok: false, fehler };
  }

  /** Schichtplan für die Sicherung: Katalog und alle vorhandenen Monate von Jänner 2026 bis zwölf Monate nach heute (fehlende übersprungen). */
  async function schichtFuerSicherung() {
    if (!adapter.leseSchichtMonat) return { katalog: state.schicht.katalog, monate: state.schicht.monate };
    const bis = monatVor(todayVienna(jetzt()), -SCHICHT_SICHERUNG_VORAUS);
    const jms = [];
    for (let jm = SCHICHT_SICHERUNG_AB; jm <= bis; jm = monatVor(jm, -1)) jms.push(jm);
    const { katalog } = await adapter.leseSchichtarten();
    const monate = {};
    for (let i = 0; i < jms.length; i += SCHICHT_SICHERUNG_PARALLEL) {
      const teil = jms.slice(i, i + SCHICHT_SICHERUNG_PARALLEL);
      const gelesen = await Promise.all(teil.map((jm) => adapter.leseSchichtMonat(jm)));
      teil.forEach((jm, j) => {
        if (gelesen[j]?.monat) monate[jm] = normalisiereMonat(gelesen[j].monat, jm).monat;
      });
    }
    return { katalog: katalog ? normalisiereKatalog(katalog).katalog : null, monate };
  }

  /** Stellt Tage auf einen früheren Stand zurück: `vorher` = [[Datum, Typ oder null], …]. */
  async function stelleTageWieder(vorher, zusatz = {}) {
    const tage = { ...state.tage };
    for (const [d, t] of vorher) {
      if (t === null) delete tage[d];
      else tage[d] = { typ: t };
    }
    await aendere({ tage, ...zusatz.zustand }, async (bericht) => {
      if (zusatz.vorher) await zusatz.vorher();
      let i = 0;
      for (const [d, t] of vorher) {
        if (t === null) await adapter.loescheTag(d);
        else await adapter.setzeTag(d, t);
        bericht((i += 1), vorher.length);
      }
    });
  }

  const store = {
    getState: () => state,
    subscribe(fn) {
      hoerer.add(fn);
      return () => hoerer.delete(fn);
    },
    jetzt,
    heute: () => todayVienna(jetzt()),
    /** Anzahl der Änderungen, die auf die erneute Anmeldung warten. */
    ausstehend: () => wartend.length,

    /** Startet mit zuletzt gespeicherten Daten (nur zum Anzeigen, bis die Anmeldung da ist). `stand` = Zeitpunkt der Speicherung. */
    starteAusSnapshot({ daten, gespeichertAm }) {
      state = { ...state, ...ladeFelder(daten, state), ...(daten.schicht ? { schicht: schichtAusDaten(daten.schicht) } : {}), geladen: true, nurSnapshot: true, stand: gespeichertAm, anmeldungNoetig: true };
      melden();
    },

    /** Lädt alles neu. Ist die Anmeldung abgelaufen, bleibt der alte Stand und `anmeldungNoetig` wird gesetzt (kein Fehler). */
    async laden() {
      try {
        const daten = await adapter.laden();
        state = { ...state, ...ladeFelder(daten, state), geladen: true, fehler: null, anmeldungNoetig: false, nurSnapshot: false, stand: null };
        geladeneBereiche.length = 0;
        letzteLadung = jetzt().getTime();
        einkaufGeprueft = letzteLadung;
        melden();
      } catch (fehler) {
        if (!istAuthFehler(fehler)) throw fehler;
        state = { ...state, anmeldungNoetig: true };
        melden();
      }
    },

    /** Neu laden beim Zurückkehren in die App: höchstens einmal pro Minute und nicht, solange etwas auf die Anmeldung wartet. */
    async aktualisieren() {
      if (!state.geladen || wartend.length > 0 || jetzt().getTime() - letzteLadung < MIN_ABSTAND_MS) return false;
      try {
        await store.laden();
      } catch {
        return false;
      }
      return !state.anmeldungNoetig;
    },

    /**
     * Holt nur die Einkaufsliste neu (das andere Telefon hat vielleicht etwas eingetragen): ein Ereignis statt aller Kalender.
     * Eigene Änderungen gehen vor: solange etwas gespeichert wird oder auf die Anmeldung wartet, wird nicht gefragt, und eine Antwort,
     * während der selbst etwas geändert wurde, wird verworfen (sie könnte älter sein). Neu gezeichnet wird nur, wenn sich die Liste wirklich geändert hat.
     * Ergebnis: 'neu' (übernommen), 'gleich' (schon aktuell), 'warten' (eigene Änderung geht vor, später noch einmal),
     * 'getrennt' (gerade nicht möglich: nicht geladen, nur gespeicherter Stand, Anmeldung nötig) oder 'fehler'.
     */
    async einkaufAktualisieren() {
      if (einkaufHolen) return einkaufHolen;
      einkaufHolen = (async () => {
        if (!adapter.leseEinkauf || !state.geladen || state.nurSnapshot || state.anmeldungNoetig) return 'getrennt';
        if (schreibend > 0 || wartend.length > 0) return 'warten';
        const stand = schreibStand;
        const vorher = state.einkauf;
        let liste;
        try {
          liste = normalisiereListe((await adapter.leseEinkauf()).liste);
        } catch (fehler) {
          if (!istAuthFehler(fehler)) return 'fehler';
          state = { ...state, anmeldungNoetig: true };
          melden();
          return 'getrennt';
        }
        if (stand !== schreibStand || schreibend > 0 || wartend.length > 0) return 'warten';
        if (state.einkauf !== vorher) return 'gleich'; // inzwischen alles neu geladen: das ist mindestens so frisch
        einkaufGeprueft = jetzt().getTime();
        if (JSON.stringify(liste) === JSON.stringify(state.einkauf)) return 'gleich';
        state = { ...state, einkauf: liste };
        melden();
        return 'neu';
      })();
      try {
        return await einkaufHolen;
      } finally {
        einkaufHolen = null;
      }
    },

    /** Zeitpunkt (ms) des letzten Abgleichs der Einkaufsliste mit dem Kalender, oder null (noch keiner). */
    einkaufGeprueftAm: () => einkaufGeprueft,

    /** Speichert nach erneuter Anmeldung alles, was gewartet hat (Schreibvorgänge sind wiederholbar). */
    async wiederholeAusstehende() {
      const liste = wartend.splice(0);
      state = { ...state, anmeldungNoetig: false, fehler: null };
      melden();
      for (let i = 0; i < liste.length; i += 1) {
        if ((await ausfuehren(liste[i].schreibe, state, liste[i].optionen)) === 'auth') {
          wartend.push(...liste.slice(i + 1));
          return;
        }
      }
    },

    /**
     * Holt Tage, Urlaub und Termine eines Zeitraums nach (Monat zurückblättern); mehrfaches Anfordern lädt nur einmal.
     * Ergebnis: true, wenn der Zeitraum jetzt da ist; false, wenn es nicht möglich war (Demo, Fehler) oder gerade schon geladen wird.
     */
    async sichereBereich(von, bis) {
      if (!adapter.ladeBereich || !state.fenster) return false;
      const abgedeckt = (b) => b.von <= von && b.bis >= bis;
      const schluessel = `${von}|${bis}`;
      if (abgedeckt(state.fenster) || geladeneBereiche.some(abgedeckt)) return true;
      if (ladendeBereiche.has(schluessel)) return false;
      ladendeBereiche.add(schluessel);
      let erfolg = false;
      try {
        const d = await adapter.ladeBereich(von, bis);
        const tage = { ...state.tage };
        for (const k of Object.keys(tage)) if (k >= von && k < bis) delete tage[k];
        Object.assign(tage, d.tage);
        state = {
          ...state,
          tage,
          termine: [...state.termine.filter((t) => !(t.date >= von && t.date < bis)), ...d.termine],
          urlaub: [...state.urlaub.filter((u) => !d.urlaub.some((x) => x.id === u.id)), ...d.urlaub],
        };
        geladeneBereiche.push({ von, bis });
        erfolg = true;
      } catch (fehler) {
        state = istAuthFehler(fehler) ? { ...state, anmeldungNoetig: true } : { ...state, fehler: 'Dieser Zeitraum konnte nicht geladen werden.' };
      } finally {
        ladendeBereiche.delete(schluessel);
      }
      melden();
      return erfolg;
    },

    /**
     * Alle Daten für die Sicherung. Mit Google wird der gesamte Verlauf aus den Kalendern geholt (Anmeldefehler laufen nach oben);
     * in der Demo steht ohnehin alles im Zustand. Der Schichtplan wird in beiden Fällen Monat für Monat gelesen.
     * Der Zustand der App bleibt dabei unverändert.
     */
    async sicherungsDaten() {
      const roh = adapter.ladeAlles ? await adapter.ladeAlles() : state;
      const schicht = await schichtFuerSicherung();
      return { settings: state.settings, tage: roh.tage, urlaub: roh.urlaub, termine: roh.termine, einkauf: state.einkauf, konto: state.konto, schicht };
    },

    /**
     * Gleicht die Urlaub-Checks im Kalender mit dem Stand des Urlaubs ab (am 1.3., 1.5., 1.7. um 09:00, solange noch Urlaub offen ist).
     * Nur mit Google und frisch geladenen Daten; Fehler (z. B. abgelaufene Anmeldung) sind kein Problem: beim nächsten Öffnen erneut.
     * Ergebnis: true, wenn etwas geschrieben wurde.
     */
    async urlaubChecksAbgleichen() {
      if (!adapter.gleicheUrlaubChecksAb || !state.geladen || state.nurSnapshot || checksLaufen) return false;
      const heute = todayVienna(jetzt());
      const { schreiben, loeschen } = urlaubChecksAbgleich({ wunsch: urlaubChecksWunsch(state, heute), vorhanden: state.urlaubChecks ?? [], heute });
      if (schreiben.length === 0 && loeschen.length === 0) return false;
      checksLaufen = true;
      try {
        await adapter.gleicheUrlaubChecksAb({ schreiben, loeschen });
      } catch {
        return false;
      } finally {
        checksLaufen = false;
      }
      const weg = new Set([...loeschen, ...schreiben.map((c) => urlaubCheckEventId(c.date))]);
      const neu = schreiben.map((c) => ({ id: urlaubCheckEventId(c.date), date: c.date, titel: c.title }));
      state = { ...state, urlaubChecks: [...(state.urlaubChecks ?? []).filter((c) => !weg.has(c.id)), ...neu].sort((a, b) => a.date.localeCompare(b.date)) };
      return true;
    },

    setTag: (date, typ) => store.setTage([date], typ),

    /** Setzt den Typ für mehrere Tage. Gibt { rueckgaengig } zurück (stellt die Tage auf den früheren Stand). */
    async setTage(dates, typ) {
      const vorher = dates.map((d) => [d, state.tage[d]?.typ ?? null]);
      const tage = { ...state.tage };
      for (const d of dates) tage[d] = { typ };
      await aendere({ tage }, async (bericht) => {
        let i = 0;
        for (const d of dates) {
          await adapter.setzeTag(d, typ);
          bericht((i += 1), dates.length);
        }
      });
      return { rueckgaengig: () => stelleTageWieder(vorher) };
    },

    async loescheTag(date) {
      if (!state.tage[date]) return;
      const tage = { ...state.tage };
      delete tage[date];
      await aendere({ tage }, () => adapter.loescheTag(date));
    },

    /** Legt einen Urlaub an; Betreuungstage darin werden umgewandelt (gelöscht). Gibt { id, umgewandelt, rueckgaengig } zurück. */
    async urlaubHinzufuegen({ start, end }) {
      if (!(start <= end)) throw new Error('Ungültiger Zeitraum');
      const tage = { ...state.tage };
      const betreuung = new Set(spanDays({ start, end }).filter((d) => KITA_TYPEN.includes(tage[d]?.typ)));
      const plan = planUmwandlung({ dates: [...betreuung], zielTyp: 'urlaub', vorhandeneBifen: betreuung });
      const entfernt = plan.loeschen.map((d) => [d, tage[d].typ]);
      for (const d of plan.loeschen) delete tage[d];
      const eintrag = { id: neueId(), start, end };
      await aendere({ tage, urlaub: [...state.urlaub, eintrag] }, async (bericht) => {
        const gesamt = plan.loeschen.length + 1;
        let i = 0;
        for (const d of plan.loeschen) {
          await adapter.loescheTag(d);
          bericht((i += 1), gesamt);
        }
        await adapter.speichereUrlaub(eintrag);
        bericht(gesamt, gesamt);
      });
      return {
        id: eintrag.id,
        umgewandelt: plan.loeschen.length,
        rueckgaengig: () =>
          stelleTageWieder(entfernt, {
            zustand: { urlaub: state.urlaub.filter((u) => u.id !== eintrag.id) },
            vorher: () => adapter.loescheUrlaub(eintrag.id),
          }),
      };
    },

    async urlaubLoeschen(id) {
      await aendere({ urlaub: state.urlaub.filter((u) => u.id !== id) }, () => adapter.loescheUrlaub(id));
    },

    /** Legt einen Termin an oder ändert ihn (mit `id`). Wirft bei ungültigen Eingaben einen Error mit deutscher Meldung. */
    async terminSpeichern(roh, id = null) {
      const termin = { id: id ?? neueId(), ...normalisiereTermin(roh) };
      const termine = [...state.termine.filter((t) => t.id !== termin.id), termin];
      await aendere({ termine }, () => adapter.speichereTermin(termin));
      return termin.id;
    },

    async terminLoeschen(id) {
      await aendere({ termine: state.termine.filter((t) => t.id !== id) }, () => adapter.loescheTermin(id));
    },

    /**
     * Sachen für Krabbelstube/Kindergarten: einmalig (`wochen` = 1), als wöchentliche Serie (`wochen` > 1)
     * oder, mit `id`, als Änderung genau dieser Sache. Gibt { ids, verschoben, uebersprungen } zurück.
     */
    async sachenSpeichern(roh, { wochen = 1, id = null } = {}) {
      pruefeWochen(wochen);
      if (id) {
        const alt = state.termine.find((t) => t.id === id);
        const basis = normalisiereTermin({ ...roh, typ: 'kita_sache', serie: alt?.serie });
        await termineAnlegen([{ id, ...basis }]);
        return { ids: [id], verschoben: 0, uebersprungen: [] };
      }
      if (wochen === 1) {
        const termin = { id: neueId(), ...normalisiereTermin({ ...roh, typ: 'kita_sache', serie: undefined }) };
        await termineAnlegen([termin]);
        return { ids: [termin.id], verschoben: 0, uebersprungen: [] };
      }
      const r = serieTermine(roh, wochen);
      await termineAnlegen(r.termine);
      return { ids: r.termine.map((t) => t.id), verschoben: r.verschoben, uebersprungen: r.uebersprungen };
    },

    /** Pyjamas-Wechsel: wöchentlich „Pyjamas hinbringen“ (hinTag) und „Pyjamas heimholen“ (heimTag), Mo = 0 … Fr = 4. */
    async pyjamasWechselSpeichern({ hinTag = 0, heimTag = 4, wochen = 8, mitnehmen = ['Pyjamas'] } = {}) {
      pruefeWochen(wochen);
      for (const tag of [hinTag, heimTag]) {
        if (!Number.isInteger(tag) || tag < 0 || tag > 4) throw new Error('Bitte Wochentage von Montag bis Freitag wählen.');
      }
      const heute = todayVienna(jetzt());
      const { bringzeit, abholzeit } = state.settings;
      const hin = serieTermine({ richtung: 'hin', date: naechsterWochentag(heute, hinTag), time: bringzeit, mitnehmen, kosten: null }, wochen);
      const heim = serieTermine({ richtung: 'heim', date: naechsterWochentag(heute, heimTag), time: abholzeit, mitnehmen, kosten: null }, wochen);
      const neue = [...hin.termine, ...heim.termine];
      await termineAnlegen(neue);
      return {
        ids: neue.map((t) => t.id),
        verschoben: hin.verschoben + heim.verschoben,
        uebersprungen: [...hin.uebersprungen, ...heim.uebersprungen],
      };
    },

    /**
     * Kontostand von Papa oder Mama für einen Monat eintragen (oder als Tippfehler korrigieren). Ein NEUER Eintrag geht nur am letzten Tag des Monats
     * (Wiener Datum zum Zeitpunkt des Tippens; `demo: true` hebt das auf). Monat und Datum sind festgehalten: eine wegen abgelaufener Anmeldung
     * später gespeicherte Eingabe landet trotzdem im richtigen Monat. Wirft sofort (ohne etwas zu ändern), wenn die Eingabe nicht passt.
     */
    async kontoSpeichern(eintrag, { demo = false } = {}) {
      const heute = todayVienna(jetzt());
      await kontoAendern((konto) => setzeStand(konto, eintrag, { heute, demo }));
    },

    /**
     * Nachtragen: den Stand vom LETZTEN Tag eines früheren Monats laut Kontoauszug eintragen (bis 24 Monate zurück, nicht der laufende Monat).
     * Sonst wie `kontoSpeichern`; der Monat ist festgehalten.
     */
    async kontoNachtragen(eintrag) {
      const heute = todayVienna(jetzt());
      await kontoAendern((konto) => setzeStand(konto, eintrag, { heute, nachtrag: true }));
    },

    /** Löscht den Kontostand einer Person für einen Monat (jederzeit; er lässt sich danach über „Nachtragen“ wieder eintragen). */
    async kontoLoeschen(eintrag) {
      await kontoAendern((konto) => entferneStand(konto, eintrag));
    },

    /** Sonderbetrag (Einnahme > 0, Ausgabe < 0) für einen Monat, jederzeit. Die Kennung macht eine wiederholte Speicherung unschädlich. */
    async extraHinzufuegen(eintrag) {
      const heute = todayVienna(jetzt());
      const id = neueId().slice(0, 16);
      await kontoAendern((konto) => fuegeExtraHinzu(konto, { ...eintrag, id }, { heute }));
    },

    /** Nur Demo („Beispieldaten entfernen“): löscht alle Kontostände und Sonderbeträge. Mit einem anderen Adapter (Google) wird nichts getan. */
    async kontoLeeren() {
      if (!adapter.istDemo) throw new Error('Das geht nur in der Demo.');
      await kontoAendern(() => leeresKonto());
    },

    /** Löscht genau einen Sonderbetrag. */
    async extraEntfernen(id) {
      await kontoAendern((konto) => entferneExtra(konto, id));
    },

    /** Einkaufsliste: Artikel eintragen (Menge optional), abhaken, löschen, Gekaufte entfernen (mit Rückgängig). */
    async einkaufHinzufuegen(text, menge = '') {
      const id = neueId().slice(0, 9);
      const jetztMs = jetzt().getTime();
      await einkaufAendern((liste) => artikelHinzufuegen(liste, { text, menge }, { jetzt: jetztMs, id }));
    },
    async einkaufUmschalten(id) {
      const jetztMs = jetzt().getTime();
      await einkaufAendern((liste) => artikelUmschalten(liste, id, jetztMs));
    },
    async einkaufEntfernen(id) {
      await einkaufAendern((liste) => artikelEntfernen(liste, id));
    },
    async einkaufErledigteEntfernen() {
      const r = erledigteEntfernen(state.einkauf);
      if (r.entfernt.length === 0) return { anzahl: 0, rueckgaengig: async () => {} };
      await einkaufAendern((liste) => erledigteEntfernen(liste).liste);
      return { anzahl: r.entfernt.length, rueckgaengig: () => einkaufAendern((liste) => wiederherstellen(liste, r)) };
    },

    /** Löscht diese Sache und, falls sie zu einer Serie gehört, alle folgenden. Gibt die Anzahl gelöschter Sachen zurück. */
    async terminLoeschenAbHier(id) {
      const t = state.termine.find((x) => x.id === id);
      if (!t) return 0;
      const weg = t.serie ? state.termine.filter((x) => x.serie === t.serie && x.date >= t.date) : [t];
      await aendere({ termine: state.termine.filter((x) => !weg.includes(x)) }, async (bericht) => {
        let i = 0;
        for (const x of weg) {
          await adapter.loescheTermin(x.id);
          bericht((i += 1), weg.length);
        }
      });
      return weg.length;
    },

    /** „Erledigt“: entfernt die Sache (und damit die Erinnerung). `rueckgaengig` stellt sie unverändert wieder her. */
    async terminErledigt(id) {
      const t = state.termine.find((x) => x.id === id);
      if (!t) return { rueckgaengig: async () => {} };
      await aendere({ termine: state.termine.filter((x) => x.id !== id) }, () => adapter.loescheTermin(id));
      return {
        rueckgaengig: async () => {
          await aendere({ termine: [...state.termine.filter((x) => x.id !== id), t] }, () => adapter.speichereTermin(t));
        },
      };
    },

    /**
     * Schichtplan beim Öffnen seiner Seite: die Schichtarten (falls noch nicht gelesen) und der Monat `jm` mit seinem Vor- und
     * Folgemonat, alles gleichzeitig. Status je Monat: 'laedt' → 'geladen' oder 'fehler' (abgelaufene Anmeldung setzt zusätzlich
     * `anmeldungNoetig`). Fehlt der Katalog im Kalender, gelten die Standardarten. Wurde inzwischen selbst etwas geändert, bleiben
     * schon vorhandene Monate, wie sie sind (die Antwort könnte älter sein).
     */
    async schichtLaden(jm) {
      tageImMonat(jm); // wirft bei einem ungültigen Monat
      const jms = [monatVor(jm, 1), jm, monatVor(jm, -1)];
      const mitKatalog = state.schicht.katalog === null;
      const stand = schreibStand;
      state = { ...state, schicht: { ...state.schicht, status: { ...state.schicht.status, ...Object.fromEntries(jms.map((m) => [m, 'laedt'])) } } };
      melden();
      const [katalog, ...monate] = await Promise.allSettled([mitKatalog ? adapter.leseSchichtarten() : null, ...jms.map((m) => adapter.leseSchichtMonat(m))]);
      const eigene = stand !== schreibStand || schreibend > 0 || wartend.length > 0 || schichtSchreibtNoch();
      const s = state.schicht;
      const neueMonate = { ...s.monate };
      const status = { ...s.status };
      let auth = false;
      jms.forEach((m, i) => {
        const r = monate[i];
        if (r.status === 'rejected') {
          status[m] = 'fehler';
          auth ||= istAuthFehler(r.reason);
          return;
        }
        if (!(eigene && s.monate[m])) neueMonate[m] = normalisiereMonat(r.value?.monat ?? null, m).monat;
        status[m] = 'geladen';
      });
      let kat = s.katalog;
      if (mitKatalog && katalog.status === 'rejected') auth ||= istAuthFehler(katalog.reason);
      else if (mitKatalog && kat === null) kat = normalisiereKatalog(katalog.value?.katalog ?? null).katalog;
      state = { ...state, schicht: { katalog: kat, monate: neueMonate, status }, ...(auth ? { anmeldungNoetig: true } : {}) };
      melden();
    },

    /**
     * Holt Schichtarten und die Monate `jms` neu (das andere Telefon hat vielleicht etwas eingetragen; alle 30 Sekunden und beim
     * Zurückkehren). Eigene Änderungen gehen vor: solange etwas gespeichert wird oder wartet, wird nicht gefragt, und eine Antwort,
     * während der selbst etwas geändert wurde, wird verworfen. Neu gezeichnet wird nur bei einer echten Änderung.
     * Ergebnis: true, wenn der Stand jetzt aktuell ist; false, wenn es gerade nicht ging oder die Antwort verworfen wurde.
     */
    async schichtAktualisieren(jms) {
      if (!adapter.leseSchichtMonat || !state.geladen || state.nurSnapshot || state.anmeldungNoetig) return false;
      if (schreibend > 0 || wartend.length > 0 || schichtSchreibtNoch()) return false;
      const stand = schreibStand;
      let gelesen;
      try {
        gelesen = await Promise.all([adapter.leseSchichtarten(), ...jms.map((jm) => adapter.leseSchichtMonat(jm))]);
      } catch (fehler) {
        if (istAuthFehler(fehler)) {
          state = { ...state, anmeldungNoetig: true };
          melden();
        }
        return false;
      }
      if (stand !== schreibStand || schreibend > 0 || wartend.length > 0 || schichtSchreibtNoch()) return false;
      const [katalog, ...monate] = gelesen;
      const s = state.schicht;
      const neu = { katalog: normalisiereKatalog(katalog?.katalog ?? null).katalog, monate: { ...s.monate }, status: { ...s.status } };
      jms.forEach((jm, i) => {
        neu.monate[jm] = normalisiereMonat(monate[i]?.monat ?? null, jm).monat;
        neu.status[jm] = 'geladen';
      });
      if (JSON.stringify(neu) !== JSON.stringify(s)) {
        state = { ...state, schicht: neu };
        melden();
      }
      return true;
    },

    /** Schichtplan: Pinsel (gleiche Art noch einmal = frei), Art setzen (`k: null` = frei), Notiz, Zusatz mit Uhrzeit dazu oder weg. */
    schichtPinsel: (jm, tag, person, k) => schichtMonatAendern(jm, (m) => schaltePinsel(m, { person, tag, k })),
    schichtSetzen: (jm, tag, person, k) => schichtMonatAendern(jm, (m) => setzeSchicht(m, { person, tag, k })),
    schichtNotiz: (jm, tag, person, text) => schichtMonatAendern(jm, (m) => setzeNotiz(m, { person, tag, text })),
    schichtZusatzHinzufuegen: (jm, tag, person, { k, von, bis }) => schichtMonatAendern(jm, (m) => zusatzHinzufuegen(m, { person, tag, k, von, bis })),
    schichtZusatzEntfernen: (jm, tag, person, { k, von, bis }) => schichtMonatAendern(jm, (m) => zusatzEntfernen(m, { person, tag, k, von, bis })),

    /**
     * Schichtart anlegen (ohne `k`) oder ändern (mit `k`): { ok: true, k } nach dem Speichern im Kalender, sonst { ok: false, fehler }
     * (siehe `schichtKatalogAendern`). Eine neue Art wird nach dem Speichern an ihrem Kürzel im gespeicherten Katalog wiedergefunden
     * (hat das andere Telefon gleichzeitig eine angelegt, kann ihr Schlüssel ein anderer sein). Wirft bei einer ungültigen Eingabe.
     */
    async schichtArtSpeichern(person, entwurf, k) {
      const aendern = k !== undefined && k !== null;
      const r = await schichtKatalogAendern((kat) => (aendern ? artAendern(kat, person, k, entwurf) : artHinzufuegen(kat, person, entwurf)));
      if (!r.ok) return r;
      if (aendern) return { ok: true, k };
      const kuerzel = String(entwurf.kuerzel ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de');
      const art = state.schicht.katalog?.arten?.[person]?.find((a) => a.kuerzel.toLocaleLowerCase('de') === kuerzel);
      return { ok: true, k: art?.k ?? null };
    },
    /** Art ausblenden (`archiv` true) oder zurückholen; Ergebnis wie `schichtKatalogAendern`. */
    schichtArtArchivieren: (person, k, archiv) => schichtKatalogAendern((kat) => artArchivieren(kat, person, k, archiv)),
    /** Art mit der Nachbarin tauschen (−1 hoch, 1 runter); Ergebnis wie `schichtKatalogAendern`. */
    schichtArtVerschieben: (person, k, richtung) => schichtKatalogAendern((kat) => artVerschieben(kat, person, k, richtung)),

    async einstellungen(teil) {
      const settings = normalizeSettings({ ...state.settings, ...teil });
      await aendere({ settings }, () => adapter.speichereSettings(teil));
    },

    /** Erinnerungen (nur mit Google): prüfen, reparieren, Test-Erinnerung starten/beenden. Fehler der Anmeldung laufen nach oben. */
    erinnerungenPruefen: () => adapter.pruefeErinnerungen(),
    erinnerungenReparieren: () => adapter.repariereErinnerungen(),
    erinnerungenTestStarten: () => adapter.starteTestErinnerung(),
    erinnerungenTestBeenden: () => adapter.beendeTestErinnerung(),

    async zuruecksetzen() {
      const daten = await adapter.zuruecksetzen();
      state = { ...state, ...daten, schicht: daten.schicht ? schichtAusDaten(daten.schicht) : leererSchichtplan(), geladen: true, fehler: null };
      melden();
    },
  };
  return store;
}
