import { leereListe, normalisiereListe } from '../../domain/einkauf.js';
import { leeresKonto, normalisiereKonto } from '../../domain/konto.js';

const FORTSCHRITT_AB = 3; // ab mehr als drei Schreibvorgängen gibt es eine Fortschrittsanzeige

export const TEXT_FEHLER = 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.';
// Fehler, die eine reine Änderungsfunktion auf der neuesten Fassung geworfen hat (fachliche Ablehnung mit deutscher Meldung).
export const FACHLICH = new WeakSet();
const TEXT_ANMELDEN = 'Bitte neu anmelden: deine Änderung wird danach gespeichert.';
const TEXT_UNKLAR = 'Möglicherweise teilweise gespeichert – bitte aktualisieren.';
const TEXT_SCHON_WIEDER_DA = 'Das ist inzwischen wieder eingetragen (wohl auf dem anderen Telefon) – nichts überschrieben.';
export const TEXT_AUTOS_NEUER = 'Diesen Eintrag hat das andere Telefon mit einer neueren App-Version geändert. Bitte die App aktualisieren.';

/** Ergebnis mit `rueckgaengig` – nur bei Erfolg und nur, wenn es ein Rückgängig gibt. */
const mitRueckgaengig = (r, rueckgaengig) => (r.ok && rueckgaengig ? { ...r, rueckgaengig } : r);

export const istAuthFehler = (fehler) => fehler?.name === 'AuthAbgelaufen';

/** `alt`, wenn `neu` denselben Inhalt hat (gleiches JSON), sonst `neu`: so bleibt die Identität unveränderter Daten erhalten. */
export const gleichOder = (alt, neu) => (alt != null && JSON.stringify(alt) === JSON.stringify(neu) ? alt : neu);

/**
 * `zusage` mit Frist: antwortet sie nicht binnen `ms`, wird abgelehnt (Name 'Zeitueberschreitung'); eine spätere Antwort zählt nicht mehr.
 * api.js kennt kein Timeout – ohne Frist bliebe ein hängendes Lesen der Autos für immer „laufend“ und würde nie wiederholt (Review T3 M3).
 */
export function mitFrist(zusage, ms) {
  let zeitgeber;
  const frist = new Promise((_, nein) => {
    // nicht unref(): sonst endet unter Node 22 die Ereignisschleife, während nur noch die Frist wartet (Test bricht ab); `finally` räumt ohnehin auf
    zeitgeber = setTimeout(() => nein(Object.assign(new Error('Keine Antwort (Zeitüberschreitung).'), { name: 'Zeitueberschreitung' })), ms);
  });
  return Promise.race([zusage, frist]).finally(() => clearTimeout(zeitgeber));
}

/** Wie gleichOder, aber je Verlauf-Teil (zweistufig – auch für die Quartal-Teile der Versicherung): unveränderte Teile (und, ist alles gleich, das ganze Objekt) behalten ihre Identität. */
export function historieGleichOder(alt, neu) {
  let gleich = Object.keys(alt ?? {}).length === Object.keys(neu).length;
  const ergebnis = {};
  for (const [auto, jahre] of Object.entries(neu)) {
    const a = alt?.[auto] ?? {};
    const teile = {};
    let autoGleich = Object.keys(a).length === Object.keys(jahre).length;
    for (const [jahr, h] of Object.entries(jahre)) {
      teile[jahr] = gleichOder(a[jahr], h);
      if (teile[jahr] !== a[jahr]) autoGleich = false;
    }
    ergebnis[auto] = autoGleich ? a : teile;
    if (ergebnis[auto] !== alt?.[auto]) gleich = false;
  }
  return gleich ? alt : ergebnis;
}

/** Ist `id` in `liste` (gelesene Einträge) oder unter den fremden (`fremd`, roh mit `i`)? Wirft sonst mit `weg` bzw. TEXT_AUTOS_NEUER. */
export function eintragVorhanden(liste, fremd, id, weg) {
  const x = (liste ?? []).find((e) => e.id === id);
  if (x) return x;
  throw new Error((fremd ?? []).some((k) => k?.i === id) ? TEXT_AUTOS_NEUER : weg);
}

/** Die Bereiche, deren Lesbarkeit jedes Laden meldet (`daten.unlesbar`); Schichtarten und Schichtmonate meldet das Lesen des Schichtplans. */
const LADE_BEREICHE = Object.freeze(['einkauf', 'konto', 'settings']);

/**
 * Übernimmt aus dem, was ein Adapter liefert, nur die Felder des Zustands. Den Schichtplan nicht: er wird erst beim Öffnen seiner Seite
 * geladen (`schichtLaden`); die Demo liefert ihn zwar mit, aber so verhalten sich Demo und Google gleich. `unlesbar`: Einkauf, Konto
 * und Einstellungen gelten, wie dieses Laden sie meldet (fehlt die Angabe – Demo, Schnappschuss –, sind sie lesbar); was das Lesen des
 * Schichtplans vermerkt hat, bleibt.
 */
export function ladeFelder(daten, state) {
  return {
    unlesbar: [...(state.unlesbar ?? []).filter((b) => !LADE_BEREICHE.includes(b)), ...(daten.unlesbar ?? []).filter((b) => LADE_BEREICHE.includes(b))].sort(),
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
 * Der Kern des Stores: der eine Zustand, seine Hörer und der Weg jedes Schreibens (`ausfuehren`, `aendere`, `teilAendern`) samt den
 * Ergebnissen für die Oberfläche. Die Scheiben (kalender.js, einkauf-konto.js …) lesen und schreiben den Zustand nur über `kern.state`;
 * den Anfangszustand setzt die Fassade (store.js).
 */
export function createKern({ adapter, jetzt, neueId }) {
  let state = null;
  const hoerer = new Set();
  const wartend = []; // Schreibvorgänge, die wegen abgelaufener Anmeldung noch fehlen
  let schreibend = 0; // Schreibvorgänge, die gerade laufen
  let schreibStand = 0; // zählt begonnene Schreibvorgänge: so erkennt `einkaufAktualisieren`, dass inzwischen selbst etwas geändert wurde
  const melden = () => {
    for (const h of hoerer) h(state);
  };
  /** Meldet `h(state)` bei jeder Änderung; → Funktion zum Abmelden. */
  function abonnieren(h) {
    hoerer.add(h);
    return () => hoerer.delete(h);
  }
  /**
   * Was eine Scheibe nach dem Neu-Laden im Fehlerzweig von `ausfuehren` zu tun hat: `vorbereiten()` läuft VOR dem Laden (hält z. B.
   * einen Zählerstand fest) und gibt `(daten) => Felder des Zustands | nichts` zurück, das mit dem Geladenen übernommen wird.
   */
  const nachLaden = [];
  const nachNeuLaden = (vorbereiten) => {
    nachLaden.push(vorbereiten);
  };

  /**
   * `state.unlesbar` = Bereiche der älteren versteckten Ereignisse, deren Text diese Version nicht lesen kann (sortiert): 'einkauf',
   * 'konto', 'settings', 'schichtarten', 'schicht:JJJJ-MM'. Sie werden leer bzw. mit Standardwerten gezeigt, die Oberfläche zeigt oben
   * den Hinweis, und der Adapter lehnt jedes Ändern ab (Fehler „Unlesbar“) – nichts wird überschrieben. Vermerkt wird beim Lesen
   * (`laden`, Schichtplan, Einkaufsliste) und wenn ein Schreiben mit „Unlesbar“ abgelehnt wird; ein späteres lesbares Lesen oder ein
   * gelungenes Speichern nimmt den Bereich wieder heraus. Trägt `bereich` ein (`ist`) oder nimmt ihn heraus; → ob sich etwas geändert hat
   * (gemeldet wird hier nicht).
   */
  function unlesbarMerken(bereich, ist) {
    if (state.unlesbar.includes(bereich) === ist) return false;
    state = { ...state, unlesbar: ist ? [...state.unlesbar, bereich].sort() : state.unlesbar.filter((b) => b !== bereich) };
    return true;
  }
  /** Was ein Adapter gelesen hat ({ …, unlesbar? }; die Demo nennt `unlesbar` nie = lesbar): vermerkt den Bereich und gibt das Gelesene zurück. */
  function gelesenMerken(bereich, gelesen) {
    unlesbarMerken(bereich, gelesen?.unlesbar === true);
    return gelesen;
  }
  const istUnlesbarFehler = (fehler) => fehler?.name === 'Unlesbar' && typeof fehler.bereich === 'string';

  /**
   * Führt einen Schreibvorgang aus. Ergebnis: 'ok', 'auth' (wartet auf Anmeldung) oder 'fehler' (zurückgenommen, neu geladen).
   * Bei einem Fehler werden nur die Felder aus `optionen.schluessel` auf ihren Wert in `alt` zurückgesetzt (ohne `schluessel` keines),
   * dann wird neu geladen: was inzwischen in anderen Feldern gelesen oder gespeichert wurde (Autos, Schichtmonate …), bleibt stehen.
   * Mit `optionen.zurueck()` (→ neuer Zustand) nimmt der Aufrufer selbst das Betroffene zurück, danach läuft `optionen.neuLesen()`
   * statt des ganzen Ladens (Schichtplan). Lehnt der Adapter ab, weil der gespeicherte Text unlesbar ist (Fehler „Unlesbar“, auch beim
   * Nachholen nach dem Anmelden), wurde nichts geschrieben: gezeigt wird seine Meldung, und der Bereich kommt in `state.unlesbar` – auf
   * beiden Wegen (mit und ohne `optionen.zurueck`).
   */
  let fehlerNr = 0; // zählt jeden gemeldeten Schreibfehler (state.fehlerNr): die Shell zeigt auch eine gleichlautende zweite Meldung
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
      fehlerNr += 1; // dieselbe Meldung zweimal hintereinander wird trotzdem zweimal gezeigt
      let text = gesamt > 1 && erledigt > 0 ? `Gespeichert: ${erledigt} von ${gesamt}. Bitte noch einmal versuchen; Gespeichertes bleibt erhalten.` : TEXT_FEHLER;
      const unlesbar = istUnlesbarFehler(fehler);
      if (FACHLICH.has(fehler) || unlesbar) text = fehler.message;
      optionen.beiFehler?.(fehler, text);
      if (optionen.zurueck) {
        state = { ...optionen.zurueck(), fortschritt: null, fehler: text, fehlerNr };
        if (unlesbar) unlesbarMerken(fehler.bereich, true);
        melden();
        try {
          await optionen.neuLesen();
        } catch {
          state = { ...state, fehler: TEXT_UNKLAR };
        }
        melden();
        return 'fehler';
      }
      const eigene = Object.fromEntries((optionen.schluessel ?? []).map((k) => [k, alt[k]]));
      state = { ...state, ...eigene, fortschritt: null, fehler: text, fehlerNr };
      if (unlesbar) unlesbarMerken(fehler.bereich, true); // bleibt, auch wenn das Neu-Laden gleich scheitert
      melden();
      try {
        const danach = nachLaden.map((vorbereiten) => vorbereiten());
        const daten = await adapter.laden();
        const felder = ladeFelder(daten, state);
        for (const fn of danach) Object.assign(felder, fn(daten));
        state = { ...state, ...felder, fehler: text };
      } catch {
        state = { ...state, fehler: TEXT_UNKLAR };
      }
      melden();
      return 'fehler';
    } finally {
      schreibend -= 1;
    }
  }

  /** Sofort sichtbar, dann geschrieben (siehe `ausfuehren`); → 'ok' | 'auth' | 'fehler'. */
  async function aendere(neu, schreibe) {
    const alt = state;
    state = { ...state, ...neu, fehler: null };
    melden();
    return ausfuehren(schreibe, alt, { schluessel: Object.keys(neu) });
  }

  /**
   * Ergebnis von `aendere` für die Oberfläche: { ok: true } | { ok: false, wartet: true, fehler } (nach dem Anmelden gespeichert) |
   * { ok: false, fehler, gemeldet: true } (zurückgenommen; die Meldung steht schon in state.fehler, die Shell zeigt sie – genau einmal).
   */
  const ergebnisVon = (e) => (e === 'ok' ? { ok: true } : e === 'auth' ? { ok: false, wartet: true, fehler: TEXT_ANMELDEN } : { ok: false, fehler: state.fehler ?? TEXT_FEHLER, gemeldet: true });

  /**
   * Schreibvorgang für „Rückgängig“ eines Termins, Urlaubs oder Tages: `stelle()` meldet { schonDa: true }, wenn inzwischen (vom anderen
   * Telefon) wieder etwas eingetragen ist – dann wird nichts überschrieben: zurückgenommen, neu geladen, genau eine Meldung.
   */
  const ohneUeberschreiben = (stelle) => async () => {
    const r = await stelle();
    if (r?.schonDa) {
      const e = new Error(TEXT_SCHON_WIEDER_DA);
      FACHLICH.add(e);
      throw e;
    }
  };

  /** Wie `fachlich`, für eine asynchrone Prüfung ohne Argument: ihre Ablehnung zählt als fachliche Meldung. */
  const fachlichAsync = (pruefung) => async () => {
    try {
      return await pruefung();
    } catch (e) {
      if (e instanceof Error && !istAuthFehler(e) && e.fachlich) FACHLICH.add(e);
      throw e;
    }
  };

  /** `fn`, deren Ablehnung auf der neuesten Fassung als fachliche Meldung zählt (deren Text gezeigt wird, nicht „Speichern hat nicht geklappt“). */
  const fachlich = (fn) => (wert) => {
    try {
      return fn(wert);
    } catch (e) {
      if (e instanceof Error) FACHLICH.add(e);
      throw e;
    }
  };

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
   * Ändert einen Teil (des Schichtplans oder der Fixkosten): `fn(wert)` → neuer Wert. Sofort sichtbar; wirft sofort (ohne etwas zu
   * ändern), wenn `fn` ablehnt. Gespeichert wird je Teil eines nach dem anderen (schnelle Pinsel-Tipps streiten nicht um dieselbe Fassung
   * im Kalender), und zwar `fn` auf der NEUESTEN Fassung (zwei Telefone überschreiben sich nicht). Bei einem Fehler wird nur diese
   * Änderung zurückgenommen und der Teil neu gelesen; anderes (inzwischen geladene Monate, Status) bleibt. `offenListe` = Warteschlangen
   * je Teil, `aktuell()` = angezeigter Wert, `mit(wert)` = Zustand mit diesem Wert. Gibt { neu (sofort angezeigt), ergebnis, fehler } zurück.
   */
  async function teilAendern(offenListe, teil, fn, { leer, aktuell, mit, speichern, lesen, normalisiere }) {
    const vorher = aktuell() ?? leer();
    const neu = fn(vorher);
    let eintrag = offenListe.get(teil);
    if (!eintrag) {
      eintrag = { basis: vorher, offen: [], kette: Promise.resolve() };
      offenListe.set(teil, eintrag);
    }
    eintrag.offen.push(fn);
    state = { ...mit(neu), fehler: null };
    melden();

    const anzeigen = () => mit(mitOffenen(eintrag.basis, eintrag.offen));
    const herausnehmen = () => {
      const i = eintrag.offen.indexOf(fn);
      if (i >= 0) eintrag.offen.splice(i, 1);
    };
    const aufraeumen = () => {
      if (eintrag.offen.length === 0 && offenListe.get(teil) === eintrag) offenListe.delete(teil);
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
    // Die Kette läuft immer weiter (sonst bliebe nach einem Wurf, z. B. eines Hörers, jeder spätere Tipp dieses Teils ungespeichert);
    // der Aufrufer bekommt die Ablehnung trotzdem über `await lauf`.
    eintrag.kette = lauf.catch(() => {});
    const ergebnis = await lauf;
    return { neu, ergebnis, fehler: ergebnis === 'auth' ? TEXT_ANMELDEN : fehlerText };
  }

  /** Ergebnis eines Teil-Schreibens ({ ergebnis, fehler } aus `teilAendern`) für die Oberfläche, wie `ergebnisVon`. */
  const teilErgebnis = ({ ergebnis, fehler }) => (ergebnis === 'ok' ? { ok: true } : ergebnis === 'auth' ? { ok: false, wartet: true, fehler } : { ok: false, fehler, gemeldet: true });

  return {
    adapter,
    jetzt,
    neueId,
    get state() {
      return state;
    },
    set state(neu) {
      state = neu;
    },
    get schreibend() {
      return schreibend;
    },
    get schreibStand() {
      return schreibStand;
    },
    get fehlerNr() {
      return fehlerNr;
    },
    set fehlerNr(nr) {
      fehlerNr = nr;
    },
    wartend,
    melden,
    abonnieren,
    nachNeuLaden,
    unlesbarMerken,
    gelesenMerken,
    ausfuehren,
    aendere,
    teilAendern,
    ergebnisVon,
    teilErgebnis,
    mitRueckgaengig,
    fachlich,
    fachlichAsync,
    ohneUeberschreiben,
  };
}
