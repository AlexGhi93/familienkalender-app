import { todayVienna } from '../../domain/dates.js';
import { entfernen as artikelEntfernen, erledigteEntfernen, hinzufuegen as artikelHinzufuegen, normalisiereListe, umschalten as artikelUmschalten, wiederherstellen } from '../../domain/einkauf.js';
import { entferneExtra, entferneStand, extraWiederherstellen, fuegeExtraHinzu, setzeStand, standWiederherstellen } from '../../domain/konto.js';
import { TEXT_FEHLER, istAuthFehler } from './kern.js';

/**
 * Scheibe „Einkauf und Konto“ des Stores: die Einkaufsliste, die Kontostände und die Sonderbeträge.
 * → { methoden (öffentliche Methoden des Stores), intern (was die Fassade braucht) }.
 */
export function createEinkaufKontoSlice(kern) {
  const { adapter, jetzt, neueId, wartend, melden, unlesbarMerken, aendere, ergebnisVon, mitRueckgaengig, fachlich } = kern;
  let einkaufGeprueft = null; // wann die Einkaufsliste zuletzt mit dem Kalender abgeglichen war (ms): Laden, Aktualisieren, eigenes Speichern
  let einkaufHolen = null; // laufende Abfrage der Einkaufsliste: mehrfaches Anstoßen fragt nur einmal

  /**
   * Ändert die Einkaufsliste: `fn(liste)` → neue Liste. Sofort sichtbar; bei Google wird `fn` auf die NEUESTE Fassung angewendet,
   * damit zwei Telefone sich nicht überschreiben. Wirft sofort (ohne etwas zu ändern), wenn `fn` die Eingabe ablehnt.
   */
  async function einkaufAendern(fn) {
    const neu = fn(kern.state.einkauf);
    await aendere({ einkauf: neu }, async () => {
      const gespeichert = await adapter.aendereEinkauf(fn);
      const wiederLesbar = unlesbarMerken('einkauf', false); // nicht abgelehnt: die neueste Fassung war lesbar
      if (gespeichert) {
        einkaufGeprueft = jetzt().getTime(); // gespeichert wurde auf der neuesten Fassung: die Liste ist jetzt aktuell
        kern.state = { ...kern.state, einkauf: gespeichert };
      }
      if (gespeichert || wiederLesbar) melden();
    });
  }

  /**
   * Ändert die Kontostände und Sonderbeträge: `fn(konto)` → neues Konto. Sofort sichtbar; bei Google wird `fn` auf die NEUESTE Fassung angewendet
   * (zwei Telefone überschreiben sich nicht). Wirft sofort (ohne etwas zu ändern), wenn `fn` die Eingabe ablehnt. → wie `aendere`.
   */
  async function kontoAendern(fn) {
    const neu = fn(kern.state.konto);
    return aendere({ konto: neu }, async () => {
      const gespeichert = await adapter.aendereKonto(fn);
      const wiederLesbar = unlesbarMerken('konto', false); // nicht abgelehnt: die neueste Fassung war lesbar
      if (gespeichert) kern.state = { ...kern.state, konto: gespeichert };
      if (gespeichert || wiederLesbar) melden();
    });
  }

  /** Kontostand ändern für „Rückgängig“; wirft nie: → wie `ergebnisVon`, eine Ablehnung schon am angezeigten Stand → { ok: false, fehler }. */
  async function kontoZurueck(fn) {
    try {
      return ergebnisVon(await kontoAendern(fn));
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER };
    }
  }

  const methoden = {
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
        if (!adapter.leseEinkauf || !kern.state.geladen || kern.state.nurSnapshot || kern.state.anmeldungNoetig) return 'getrennt';
        if (kern.schreibend > 0 || wartend.length > 0) return 'warten';
        const stand = kern.schreibStand;
        const vorher = kern.state.einkauf;
        let liste;
        let gelesen;
        try {
          gelesen = await adapter.leseEinkauf();
          liste = normalisiereListe(gelesen.liste);
        } catch (fehler) {
          if (!istAuthFehler(fehler)) return 'fehler';
          kern.state = { ...kern.state, anmeldungNoetig: true };
          melden();
          return 'getrennt';
        }
        if (stand !== kern.schreibStand || kern.schreibend > 0 || wartend.length > 0) return 'warten';
        if (kern.state.einkauf !== vorher) return 'gleich'; // inzwischen alles neu geladen: das ist mindestens so frisch
        einkaufGeprueft = jetzt().getTime();
        const andersLesbar = unlesbarMerken('einkauf', gelesen.unlesbar === true); // unlesbar geworden (oder wieder lesbar): der Hinweis ändert sich
        if (JSON.stringify(liste) === JSON.stringify(kern.state.einkauf)) {
          if (andersLesbar) melden();
          return andersLesbar ? 'neu' : 'gleich';
        }
        kern.state = { ...kern.state, einkauf: liste };
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

    /**
     * Kontostand von Papa oder Mama für einen Monat eintragen (oder als Tippfehler korrigieren). Ein NEUER Eintrag geht nur am letzten Tag des Monats
     * (Wiener Datum zum Zeitpunkt des Tippens; `demo: true` hebt das auf). Monat und Datum sind festgehalten: eine wegen abgelaufener Anmeldung
     * später gespeicherte Eingabe landet trotzdem im richtigen Monat. Wirft sofort (ohne etwas zu ändern), wenn die Eingabe nicht passt.
     * → wie `ergebnisVon`.
     */
    async kontoSpeichern(eintrag, { demo = false } = {}) {
      const heute = todayVienna(jetzt());
      return ergebnisVon(await kontoAendern((konto) => setzeStand(konto, eintrag, { heute, demo })));
    },

    /**
     * Nachtragen: den Stand vom LETZTEN Tag eines früheren Monats laut Kontoauszug eintragen (bis 24 Monate zurück, nicht der laufende Monat).
     * Sonst wie `kontoSpeichern`; der Monat ist festgehalten.
     */
    async kontoNachtragen(eintrag) {
      const heute = todayVienna(jetzt());
      return ergebnisVon(await kontoAendern((konto) => setzeStand(konto, eintrag, { heute, nachtrag: true })));
    },

    /**
     * Löscht den Kontostand einer Person für einen Monat (jederzeit; er lässt sich danach über „Nachtragen“ wieder eintragen). Wirft
     * sofort bei einer ungültigen Eingabe. → wie `loescheTag`; `rueckgaengig()` setzt genau den gelöschten Betrag wieder (auch an einem
     * gewöhnlichen Tag) – hat inzwischen jemand einen anderen Stand eingetragen, bleibt der (Meldung).
     */
    async kontoLoeschen(eintrag) {
      let geloescht;
      const r = ergebnisVon(
        await kontoAendern((konto) => {
          const neu = entferneStand(konto, eintrag);
          geloescht = neu === konto ? undefined : konto.p[eintrag.person][eintrag.monat]; // auf der neuesten Fassung: das wirklich Gelöschte
          return neu;
        }),
      );
      const zurueck = () => kontoZurueck(fachlich((konto) => standWiederherstellen(konto, { person: eintrag.person, monat: eintrag.monat, cents: geloescht })));
      return mitRueckgaengig(r, geloescht === undefined ? null : zurueck);
    },

    /**
     * Sonderbetrag (Einnahme > 0, Ausgabe < 0) für einen Monat, jederzeit. Die Kennung macht eine wiederholte Speicherung unschädlich.
     * Wirft sofort, wenn die Eingabe nicht passt. → wie `ergebnisVon`.
     */
    async extraHinzufuegen(eintrag) {
      const heute = todayVienna(jetzt());
      const id = neueId().slice(0, 16);
      return ergebnisVon(await kontoAendern((konto) => fuegeExtraHinzu(konto, { ...eintrag, id }, { heute })));
    },

    /** Löscht genau einen Sonderbetrag. → wie `loescheTag`; `rueckgaengig()` bringt denselben Sonderbetrag an seine Stelle zurück. */
    async extraEntfernen(id) {
      let spur = null;
      const r = ergebnisVon(
        await kontoAendern((konto) => {
          const stelle = (konto.x ?? []).findIndex((e) => e.i === id);
          spur = stelle < 0 ? null : { extra: konto.x[stelle], stelle };
          return entferneExtra(konto, id);
        }),
      );
      const zurueck = () => {
        const heute = todayVienna(jetzt());
        return kontoZurueck(fachlich((konto) => extraWiederherstellen(konto, spur.extra, spur.stelle, { heute })));
      };
      return mitRueckgaengig(r, spur ? zurueck : null);
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
      const r = erledigteEntfernen(kern.state.einkauf);
      if (r.entfernt.length === 0) return { anzahl: 0, rueckgaengig: async () => {} };
      await einkaufAendern((liste) => erledigteEntfernen(liste).liste);
      return { anzahl: r.entfernt.length, rueckgaengig: () => einkaufAendern((liste) => wiederherstellen(liste, r)) };
    },
  };

  return {
    methoden,
    intern: {
      kontoAendern,
      set einkaufGeprueft(ms) {
        einkaufGeprueft = ms;
      },
    },
  };
}
