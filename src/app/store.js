import { todayVienna } from '../domain/dates.js';
import { normalizeSettings } from '../domain/settings.js';
import { leereListe } from '../domain/einkauf.js';
import { leeresKonto } from '../domain/konto.js';
import { FIX_SHARDS, leererShard, neueFixId } from '../domain/fixkosten.js';
import { neueAutoId } from '../domain/autos.js';
import { neueVersicherungId } from '../domain/versicherung.js';
import { leereZiele, neueZielId } from '../domain/sparziele.js';
import { TEXT_FEHLER, createKern, istAuthFehler, ladeFelder } from './store/kern.js';
import { autosZustand, createAutosSlice, leererAutosZustand } from './store/autos.js';
import { createEinkaufKontoSlice } from './store/einkauf-konto.js';
import { createFixkostenSlice, fixAusDaten, leereFixkosten } from './store/fixkosten.js';
import { createKalenderSlice } from './store/kalender.js';
import { createSchichtSlice, leererSchichtplan, schichtAusDaten } from './store/schicht.js';
import { createSparzieleSlice, leererZieleZustand, zieleZustand } from './store/sparziele.js';
import { createVersicherungSlice, leererVersicherungZustand, versicherungZustand } from './store/versicherung.js';

const MIN_ABSTAND_MS = 60_000; // höchstens einmal pro Minute neu laden

/** Zufällige ID aus den Zeichen 0-9 und a-v: so darf sie auch als Google-Ereignis-ID dienen. */
const zufaelligeId = () => `u${Array.from({ length: 11 }, () => Math.floor(Math.random() * 32).toString(32)).join('')}`;

/**
 * Zustand der App. Alle Änderungen gehen zuerst in den Zustand (Oberfläche reagiert sofort) und dann in den Adapter.
 * - Schlägt das Speichern fehl, wird der Stand neu vom Adapter geladen (Teil-Erfolge bleiben sichtbar) und `fehler` gesetzt.
 * - Läuft die Anmeldung ab (Fehler „AuthAbgelaufen“), bleibt die Änderung sichtbar und wartet; `wiederholeAusstehende()`
 *   speichert sie nach dem erneuten Anmelden.
 * - Mehr als drei Schreibvorgänge melden ihren Fortschritt (`state.fortschritt`).
 *
 * Diese Datei ist nur die Fassade: Sie setzt den Kern (store/kern.js) und die Scheiben je Bereich (store/*.js) zusammen und enthält, was
 * über mehrere Bereiche geht (Laden, Schnappschuss, Sicherung, Nachholen nach dem Anmelden, Beispieldaten leeren). Die Scheiben kennen
 * einander nicht; was eine von der anderen braucht, bekommt sie hier als Argument.
 */
export function createStore(adapter, { jetzt = () => new Date(), neueId = zufaelligeId, fixId = neueFixId, zielId = neueZielId, autoId = neueAutoId, autosFristMs = 20_000, versicherungId = () => neueVersicherungId(), versicherungFristMs = 20_000 } = {}) {
  const kern = createKern({ adapter, jetzt, neueId });
  const { wartend, melden, ausfuehren } = kern;
  const store = {}; // die Scheiben rufen einander nur über die öffentlichen Methoden der Fassade (unten gefüllt)
  kern.state = { geladen: false, settings: normalizeSettings(), tage: {}, urlaub: [], termine: [], einkauf: leereListe(), konto: leeresKonto(), schicht: leererSchichtplan(), fixkosten: leereFixkosten(), ziele: leererZieleZustand(), autos: leererAutosZustand(), versicherung: leererVersicherungZustand(), unlesbar: [], fehler: null, fortschritt: null, anmeldungNoetig: false, fenster: null };
  let letzteLadung = 0;

  const kalenderScheibe = createKalenderSlice(kern, { store });
  const { geladeneBereiche } = kalenderScheibe.intern;
  const kontoScheibe = createEinkaufKontoSlice(kern);
  const { kontoAendern } = kontoScheibe.intern;
  const fixScheibe = createFixkostenSlice(kern, { store, fixId });
  const { fixLesen, fixBereit, fixGesperrt, fixTeilAendern, fixFuerSicherung } = fixScheibe.intern;
  const zieleScheibe = createSparzieleSlice(kern, { store, zielId });
  const { zieleAendern, zieleNachLaden, zieleFuerSicherung } = zieleScheibe.intern;
  const autosScheibe = createAutosSlice(kern, { autoId, autosFristMs });
  const { autosHolen, autosLeeren, autosFuerSicherung } = autosScheibe.intern;
  const versScheibe = createVersicherungSlice(kern, { store, versicherungId, versicherungFristMs });
  const { versHolen, versicherungLeeren, versicherungFuerSicherung } = versScheibe.intern;
  // zuletzt: das Vorladen des Schichtplans stößt das Lesen der Fixkosten, der Autos und der Versicherung an
  const schichtScheibe = createSchichtSlice(kern, { store, fixLesen, autosHolen, versHolen });
  const { schichtFuerSicherung } = schichtScheibe.intern;

  Object.assign(store, {
    getState: () => kern.state,
    subscribe: (fn) => kern.abonnieren(fn),
    jetzt,
    heute: () => todayVienna(jetzt()),
    /** Anzahl der Änderungen, die auf die erneute Anmeldung warten. */
    ausstehend: () => wartend.length,

    /** Startet mit zuletzt gespeicherten Daten (nur zum Anzeigen, bis die Anmeldung da ist). `stand` = Zeitpunkt der Speicherung. */
    starteAusSnapshot({ daten, gespeichertAm }) {
      kern.state = { ...kern.state, ...ladeFelder(daten, kern.state), ...(daten.schicht ? { schicht: schichtAusDaten(daten.schicht) } : {}), ...(daten.fixkosten ? { fixkosten: fixAusDaten(daten.fixkosten) } : {}), ...(daten.ziele ? { ziele: zieleZustand(daten.ziele, 'gespeichert') } : {}), ...(daten.autos ? { autos: autosZustand(daten.autos, 'gespeichert') } : {}), ...(daten.versicherung ? { versicherung: versicherungZustand(daten.versicherung, 'gespeichert') } : {}), geladen: true, nurSnapshot: true, stand: gespeichertAm, anmeldungNoetig: true };
      melden();
    },

    /** Lädt alles neu. Ist die Anmeldung abgelaufen, bleibt der alte Stand und `anmeldungNoetig` wird gesetzt (kein Fehler). */
    async laden() {
      try {
        const zStand = zieleScheibe.intern.zieleStand;
        const daten = await adapter.laden();
        // Der Schichtplan bleibt, wie er ist, gilt aber nicht mehr als vorgeladen: er kann so alt sein wie der letzte Start (App lag im
        // Hintergrund). Bis er frisch gelesen ist, wartet der Push-Plan (er würde sonst Erinnerungen des anderen Telefons löschen).
        // Die Sparziele kommen mit dem Kontostand (außer eine eigene Änderung ist seitdem unterwegs).
        kern.state = { ...kern.state, ...ladeFelder(daten, kern.state), ziele: zieleNachLaden(daten, zStand), schicht: { ...kern.state.schicht, vorgeladen: null }, geladen: true, fehler: null, anmeldungNoetig: false, nurSnapshot: false, stand: null };
        geladeneBereiche.length = 0;
        letzteLadung = jetzt().getTime();
        kontoScheibe.intern.einkaufGeprueft = letzteLadung;
        melden();
      } catch (fehler) {
        if (!istAuthFehler(fehler)) throw fehler;
        kern.state = { ...kern.state, anmeldungNoetig: true };
        melden();
      }
    },

    /** Neu laden beim Zurückkehren in die App: höchstens einmal pro Minute und nicht, solange etwas auf die Anmeldung wartet. */
    async aktualisieren() {
      if (!kern.state.geladen || wartend.length > 0 || jetzt().getTime() - letzteLadung < MIN_ABSTAND_MS) return false;
      try {
        await store.laden();
      } catch {
        return false;
      }
      return !kern.state.anmeldungNoetig;
    },

    /** Speichert nach erneuter Anmeldung alles, was gewartet hat (Schreibvorgänge sind wiederholbar). */
    async wiederholeAusstehende() {
      const liste = wartend.splice(0);
      kern.state = { ...kern.state, anmeldungNoetig: false, fehler: null };
      melden();
      for (let i = 0; i < liste.length; i += 1) {
        if ((await ausfuehren(liste[i].schreibe, kern.state, liste[i].optionen)) === 'auth') {
          wartend.push(...liste.slice(i + 1));
          return;
        }
      }
      // Versicherung danach ganz neu lesen (Fix-Runde 3): ein beim Nachholen abgelehnter Schritt hat nur seinen Teil neu gelesen
      if (versScheibe.intern.versGelesen && adapter.leseVersicherung) await versHolen();
    },

    /**
     * Alle Daten für die Sicherung. Mit Google wird der gesamte Verlauf aus den Kalendern geholt (Anmeldefehler laufen nach oben);
     * in der Demo steht ohnehin alles im Zustand. Der Schichtplan wird in beiden Fällen Monat für Monat gelesen, die Fixkosten (alle vier
     * Teile), die Sparziele (`ziele` = { daten, unlesbar, text }), die Autos (`autos` = { daten, historie, rohtexte }) und die Versicherung
     * (`versicherung` = { daten, teile, geschrieben, rohtexte, weitereTeile }) frisch. Der Zustand
     * der App bleibt dabei unverändert.
     */
    async sicherungsDaten() {
      const roh = adapter.ladeAlles ? await adapter.ladeAlles() : kern.state;
      const schicht = await schichtFuerSicherung();
      const fixkosten = await fixFuerSicherung();
      const ziele = await zieleFuerSicherung();
      const autos = await autosFuerSicherung();
      const versicherung = await versicherungFuerSicherung();
      return { settings: kern.state.settings, tage: roh.tage, urlaub: roh.urlaub, termine: roh.termine, einkauf: kern.state.einkauf, konto: kern.state.konto, schicht, fixkosten, ziele, autos, versicherung };
    },

    /**
     * Nur Demo („Beispieldaten entfernen“): löscht alle Kontostände, Sonderbeträge, Sparziele (samt Verschiebungen), Fixkosten-Posten
     * (Teil für Teil), Autos samt Verlauf (erst die Verlauf-Teile, dann der Hauptteil) und die Versicherung (erst die Rechnungen je
     * Quartal, dann die Polizze); fremde Einträge einer neueren Version, unlesbare
     * Sparziele und unlesbare Teile bleiben unangetastet. Mit einem
     * anderen Adapter (Google) wird nichts getan. Wirft mit deutscher Meldung, wenn etwas nicht geklappt hat.
     */
    async kontoLeeren() {
      if (!adapter.istDemo) throw new Error('Das geht nur in der Demo.');
      await kontoAendern(() => leeresKonto());
      const z = kern.state.ziele.daten;
      if (adapter.aendereZiele && !kern.state.ziele.unlesbar && (z.z.length > 0 || z.m.length > 0 || z.beginn)) {
        const r = await zieleAendern((d) => (d.fremd ? { ...leereZiele(), fremd: d.fremd } : leereZiele()));
        if (!r.ok && !r.wartet) throw new Error(r.fehler ?? TEXT_FEHLER);
      }
      if (adapter.aendereFixShard) {
        const nichtBereit = await fixBereit();
        if (nichtBereit) throw new Error(nichtBereit);
        for (let nr = 0; nr < FIX_SHARDS; nr += 1) {
          if (fixGesperrt(nr) || !(kern.state.fixkosten.shards?.[nr]?.posten.length > 0)) continue;
          const r = await fixTeilAendern(nr, (shard) => (shard.fremd?.length > 0 ? { v: 1, posten: [], fremd: shard.fremd } : leererShard()));
          if (!r.ok && !r.wartet) throw new Error(r.fehler ?? TEXT_FEHLER);
        }
      }
      if (adapter.aendereAutos) await autosLeeren();
      if (adapter.aendereVersicherung) await versicherungLeeren();
    },

    async zuruecksetzen() {
      const daten = await adapter.zuruecksetzen();
      kern.state = { ...kern.state, ...daten, schicht: daten.schicht ? schichtAusDaten(daten.schicht) : leererSchichtplan(), fixkosten: fixAusDaten(daten.fixkosten), ziele: daten.ziele ? zieleZustand(daten.ziele, 'geladen') : leererZieleZustand(), autos: daten.autos ? autosZustand(daten.autos, 'gespeichert') : leererAutosZustand(), versicherung: daten.versicherung ? versicherungZustand(daten.versicherung, 'gespeichert') : leererVersicherungZustand(), geladen: true, fehler: null };
      fixScheibe.intern.fixGelesen = false; // vor dem nächsten Ändern erst aus dem (neuen) Speicher lesen
      autosScheibe.intern.autosGelesen = false;
      versScheibe.intern.versGelesen = false;
      melden();
      store.schichtVorladen(); // neue Beispieldaten: im Hintergrund wieder vorladen (wirft nicht)
    },
  }, kalenderScheibe.methoden, kontoScheibe.methoden, schichtScheibe.methoden, fixScheibe.methoden, zieleScheibe.methoden, autosScheibe.methoden, versScheibe.methoden);
  return store;
}
