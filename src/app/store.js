import { todayVienna } from '../domain/dates.js';
import { normalizeSettings } from '../domain/settings.js';
import { spanDays } from '../domain/span.js';
import { planUmwandlung } from '../domain/umwandlung.js';
import { entfernen as artikelEntfernen, erledigteEntfernen, hinzufuegen as artikelHinzufuegen, leereListe, normalisiereListe, umschalten as artikelUmschalten, wiederherstellen } from '../domain/einkauf.js';
import { urlaubCheckEventId } from '../domain/ids.js';
import { normalisiereTermin } from './termin.js';
import { urlaubChecksAbgleich, urlaubChecksWunsch } from './urlaub-check.js';
import { entferneExtra, entferneStand, fuegeExtraHinzu, leeresKonto, normalisiereKonto, setzeStand } from '../domain/konto.js';
import { MAX_SERIEN_WOCHEN, naechsterWochentag, wochenSerie } from './serie.js';

const KITA_TYPEN = ['kita_essen', 'kita_ohne'];
const MIN_ABSTAND_MS = 60_000; // höchstens einmal pro Minute neu laden
const FORTSCHRITT_AB = 3; // ab mehr als drei Schreibvorgängen gibt es eine Fortschrittsanzeige

const TEXT_FEHLER = 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.';
const TEXT_ANMELDEN = 'Bitte neu anmelden: deine Änderung wird danach gespeichert.';
const TEXT_UNKLAR = 'Möglicherweise teilweise gespeichert – bitte aktualisieren.';

/** Zufällige ID aus den Zeichen 0-9 und a-v: so darf sie auch als Google-Ereignis-ID dienen. */
const zufaelligeId = () => `u${Array.from({ length: 11 }, () => Math.floor(Math.random() * 32).toString(32)).join('')}`;

const istAuthFehler = (fehler) => fehler?.name === 'AuthAbgelaufen';

/** Übernimmt aus dem, was ein Adapter liefert, nur die Felder des Zustands. */
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
  let state = { geladen: false, settings: normalizeSettings(), tage: {}, urlaub: [], termine: [], einkauf: leereListe(), konto: leeresKonto(), fehler: null, fortschritt: null, anmeldungNoetig: false, fenster: null };
  const hoerer = new Set();
  const wartend = []; // Schreibvorgänge, die wegen abgelaufener Anmeldung noch fehlen
  const geladeneBereiche = [];
  const ladendeBereiche = new Set();
  let letzteLadung = 0;
  let checksLaufen = false;
  const melden = () => {
    for (const h of hoerer) h(state);
  };

  /** Führt einen Schreibvorgang aus. Ergebnis: 'ok', 'auth' (wartet auf Anmeldung) oder 'fehler' (zurückgenommen, neu geladen). */
  async function ausfuehren(schreibe, alt) {
    let erledigt = 0;
    let gesamt = 0;
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
        wartend.push(schreibe);
        state = { ...state, fortschritt: null, anmeldungNoetig: true, fehler: TEXT_ANMELDEN };
        melden();
        return 'auth';
      }
      const text = gesamt > 1 && erledigt > 0 ? `Gespeichert: ${erledigt} von ${gesamt}. Bitte noch einmal versuchen; Gespeichertes bleibt erhalten.` : TEXT_FEHLER;
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
      state = { ...state, ...ladeFelder(daten, state), geladen: true, nurSnapshot: true, stand: gespeichertAm, anmeldungNoetig: true };
      melden();
    },

    /** Lädt alles neu. Ist die Anmeldung abgelaufen, bleibt der alte Stand und `anmeldungNoetig` wird gesetzt (kein Fehler). */
    async laden() {
      try {
        const daten = await adapter.laden();
        state = { ...state, ...ladeFelder(daten, state), geladen: true, fehler: null, anmeldungNoetig: false, nurSnapshot: false, stand: null };
        geladeneBereiche.length = 0;
        letzteLadung = jetzt().getTime();
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

    /** Speichert nach erneuter Anmeldung alles, was gewartet hat (Schreibvorgänge sind wiederholbar). */
    async wiederholeAusstehende() {
      const liste = wartend.splice(0);
      state = { ...state, anmeldungNoetig: false, fehler: null };
      melden();
      for (let i = 0; i < liste.length; i += 1) {
        if ((await ausfuehren(liste[i], state)) === 'auth') {
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
     * in der Demo steht ohnehin alles im Zustand. Der Zustand der App bleibt dabei unverändert.
     */
    async sicherungsDaten() {
      const roh = adapter.ladeAlles ? await adapter.ladeAlles() : state;
      return { settings: state.settings, tage: roh.tage, urlaub: roh.urlaub, termine: roh.termine, einkauf: state.einkauf, konto: state.konto };
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
      state = { ...state, ...daten, geladen: true, fehler: null };
      melden();
    },
  };
  return store;
}
