import { FACHLICH, TEXT_FEHLER, gleichOder, istAuthFehler } from './kern.js';

export const TEXT_AUTOS_NEUER = 'Diesen Eintrag hat das andere Telefon mit einer neueren App-Version geändert. Bitte die App aktualisieren.';

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

/** Neue Kennung aus `quelle()` (0-9a-v), die in `vergeben` noch nicht vorkommt; sonst null. */
export function neueKennung(quelle, vergeben) {
  for (let versuch = 0; versuch < 20; versuch += 1) {
    const id = quelle();
    if (typeof id !== 'string' || id === '') return null;
    if (!vergeben.has(id)) return id;
  }
  return null;
}

/**
 * Die gemeinsame Maschine der Bereiche, die aus einem Hauptteil und vielen Teilen bestehen (Autos: Verlauf je Auto und Jahr;
 * Versicherung: Rechnungen je Jahr und Quartal): lesen, frisch lesen, sperren, was unlesbar ist, und Hauptteil bzw. einen Teil ändern –
 * je Teil mit eigener Warteschlange (siehe `teilAendern` im Kern; Schlüssel 'haupt' und `<kuerzel>:<a>:<b>`).
 *
 * Ein Teil wird überall als Objekt `t` mit den beiden Feldern aus `teilFelder` genannt ({ auto, jahr } bzw. { jahr, quartal }); im
 * Zustand steht er unter `zustand[teileFeld][a][b]`.
 *
 * `beschreibung` trägt nur, was die Bereiche unterscheidet:
 * - `bereich`: Schlüssel im Zustand ('autos'); dort { daten, [teileFeld], …, status, warnungen, unlesbar, frisch, bestaetigt? }
 * - `teileFeld`: Feld mit den gelesenen Teilen; `nebenFelder`: weitere Felder derselben zweistufigen Form, die mit den Teilen gelesen werden
 * - `unlesbarFeld`: Liste der unlesbaren Teile in `zustand.unlesbar` (neben `main`)
 * - `teilFelder`: die zwei Felder, die einen Teil benennen (in der Reihenfolge der Ebenen); `teilKuerzel`: Anfang seines Schlüssels
 * - `adapter`: Namen der Adapter-Funktionen { lesen, aendern, teilLesen, teilAendern }; `teilAntwort`: Feld des Teils in der Antwort von `teilLesen`
 * - `gesperrt`: Namen der Fehler { haupt, teil }, mit denen der Adapter das Ändern von Unlesbarem ablehnt
 * - `zustand(gelesen, status)`, `leererHaupt()`, `leererTeil(t)`, `hauptWarnungen()` (Hauptteil unlesbar), `teilWarnungen(leer)` (Teil unlesbar)
 * - `vorTeilSchreiben(t)`: läuft in jedem Schreibvorgang eines Teils vor dem Schreiben (trägt z. B. das Jahr im Hauptteil ein)
 * - `texte`: { nichtGelesen, anmelden, gesperrt }; `fristMs`: Frist für das Lesen
 *
 * → die Maschine; dazu `offen` (die Warteschlangen), `teilGesperrt(t)` und `gelesen` (seit dem Start oder dem Zurücksetzen schon einmal
 * aus dem Kalender gelesen? Erst dann wird geschrieben).
 */
export function createGeteilt(kern, beschreibung) {
  const { adapter, wartend, melden, teilErgebnis } = kern;
  const { bereich, teileFeld, nebenFelder, unlesbarFeld, teilFelder, teilKuerzel, teilAntwort, gesperrt, texte, fristMs } = beschreibung;
  const namen = beschreibung.adapter;
  const offen = new Map();
  const schreibtNoch = () => offen.size > 0;
  let gelesen = false;
  let holenLaeuft = null; // laufendes Lesen: mehrfaches Anstoßen fragt nur einmal
  let frischLaeuft = null; // laufendes Frisch-Lesen vor dem Push-Plan (siehe frischLesen)
  const zustand = () => kern.state[bereich];
  const pfad = (t) => [t[teilFelder[0]], t[teilFelder[1]]];
  const teilSchluessel = (t) => `${teilKuerzel}:${t[teilFelder[0]]}:${t[teilFelder[1]]}`;
  const gleicherTeil = (x, t) => x[teilFelder[0]] === t[teilFelder[0]] && x[teilFelder[1]] === t[teilFelder[1]];
  const teilGesperrt = (t) => zustand().unlesbar[unlesbarFeld].some((x) => gleicherTeil(x, t));
  /** `teile` mit dem Teil `t` = `teil` (die anderen bleiben). */
  const mitTeil = (teile, t, teil) => {
    const [a, b] = pfad(t);
    return { ...teile, [a]: { ...(teile[a] ?? {}), [b]: teil } };
  };

  /** Leert die Warteschlange eines Teils (nach „unlesbar“: ihr Speichern würde ohnehin abgelehnt). */
  function offenLeeren(schluessel, basis) {
    const e = offen.get(schluessel);
    if (e) {
      e.basis = basis;
      e.offen.length = 0;
    }
  }

  /**
   * `z` (Zustand des Bereichs) mit `bestaetigt` = { daten, [teileFeld] } (der zuletzt GESPEICHERTE Stand), solange eigene Änderungen
   * offen sind: Hauptteil und Teile mit offenen Änderungen stehen dort mit ihrer `basis`; ohne offene Änderungen fällt `bestaetigt` weg.
   * Für den Schnappschuss – eine Änderung, die auf die Anmeldung wartet, darf nach einem Neustart nicht als gespeichert erscheinen.
   */
  function mitBestaetigt(z) {
    const { bestaetigt: _alt, ...rest } = z;
    const mitOffenen = [...offen.entries()].filter(([, e]) => e.offen.length > 0);
    if (mitOffenen.length === 0) return rest;
    let daten = rest.daten;
    let teile = rest[teileFeld];
    for (const [schluessel, e] of mitOffenen) {
      if (schluessel === 'haupt') daten = e.basis;
      else {
        const [, a, b] = schluessel.split(':');
        teile = { ...teile, [a]: { ...(teile[a] ?? {}), [b]: e.basis } };
      }
    }
    return { ...rest, bestaetigt: { daten, [teileFeld]: teile } };
  }

  /** Der Hauptteil ist (inzwischen) unlesbar: alles leer und gesperrt. */
  function hauptSperren() {
    offenLeeren('haupt', beschreibung.leererHaupt());
    kern.state = { ...kern.state, [bereich]: { ...zustand(), daten: beschreibung.leererHaupt(), [teileFeld]: {}, warnungen: beschreibung.hauptWarnungen(), unlesbar: { main: true, [unlesbarFeld]: zustand().unlesbar[unlesbarFeld] } } };
  }

  /** Der Teil `t` ist (inzwischen) unlesbar: leer gezeigt und gesperrt. */
  function teilSperren(t) {
    const leer = beschreibung.leererTeil(t);
    offenLeeren(teilSchluessel(t), leer);
    const z = zustand();
    const marke = { [teilFelder[0]]: t[teilFelder[0]], [teilFelder[1]]: t[teilFelder[1]] };
    const liste = teilGesperrt(t) ? z.unlesbar[unlesbarFeld] : [...z.unlesbar[unlesbarFeld], marke];
    kern.state = { ...kern.state, [bereich]: { ...z, [teileFeld]: mitTeil(z[teileFeld], t, leer), warnungen: [...z.warnungen, ...beschreibung.teilWarnungen(leer)], unlesbar: { ...z.unlesbar, [unlesbarFeld]: liste } } };
  }

  /**
   * Übernimmt frisch Gelesenes (`g` wie aus dem Lesen des Adapters). `eigene` = inzwischen selbst etwas geändert: dann bleiben
   * angezeigter Hauptteil und angezeigte Teile (die Antwort könnte älter sein), neu gefundene Teile kommen dazu. Unlesbares gilt immer
   * (leer, gesperrt). Unverändert Gelesenes behält seine Identität (der Push-Plan vergleicht nach Identität).
   */
  function uebernehmen(g, eigene) {
    const frisch = beschreibung.zustand(g, 'geladen');
    if (frisch.unlesbar.main) {
      offenLeeren('haupt', beschreibung.leererHaupt());
      kern.state = { ...kern.state, [bereich]: frisch };
      return;
    }
    const z = zustand();
    /** Das frisch gelesene Feld; bei eigenen Änderungen gehen die angezeigten Einträge vor. */
    const mitAngezeigtem = (feld) => {
      if (!eigene) return frisch[feld];
      const zusammen = { ...frisch[feld] };
      for (const [a, unten] of Object.entries(z[feld] ?? {})) zusammen[a] = { ...(zusammen[a] ?? {}), ...unten };
      return zusammen;
    };
    let teile = mitAngezeigtem(teileFeld);
    const neben = nebenFelder.map((feld) => [feld, historieGleichOder(z[feld], mitAngezeigtem(feld))]);
    for (const t of frisch.unlesbar[unlesbarFeld]) {
      teile = mitTeil(teile, t, beschreibung.leererTeil(t));
      offenLeeren(teilSchluessel(t), beschreibung.leererTeil(t));
    }
    kern.state = {
      ...kern.state,
      [bereich]: mitBestaetigt({ daten: eigene ? z.daten : gleichOder(z.daten, frisch.daten), [teileFeld]: historieGleichOder(z[teileFeld], teile), ...Object.fromEntries(neben), status: 'geladen', warnungen: gleichOder(z.warnungen, frisch.warnungen), unlesbar: gleichOder(z.unlesbar, frisch.unlesbar), frisch: true }),
    };
  }

  /**
   * Liest Hauptteil und alle Teile. Status 'laedt' → 'geladen' bzw. 'fehler' (die zuletzt gelesenen Daten bleiben; abgelaufene Anmeldung
   * setzt zusätzlich `anmeldungNoetig`). Mit Frist (api.js kennt kein Timeout): ein hängendes Lesen gilt danach als Fehler und wird beim
   * nächsten Anstoßen wiederholt (z. B. vom Vorlader der Shell). → true, wenn gelesen. Höchstens ein Lesen gleichzeitig; wirft nicht.
   */
  function holen() {
    if (holenLaeuft) return holenLaeuft;
    if (!adapter[namen.lesen]) return Promise.resolve(false);
    holenLaeuft = (async () => {
      const stand = kern.schreibStand;
      kern.state = { ...kern.state, [bereich]: { ...zustand(), status: 'laedt' } };
      melden();
      let g;
      try {
        g = await mitFrist(adapter[namen.lesen](), fristMs);
      } catch (fehler) {
        kern.state = { ...kern.state, [bereich]: { ...zustand(), status: 'fehler', frisch: false, warnungen: [texte.nichtGelesen] }, ...(istAuthFehler(fehler) ? { anmeldungNoetig: true } : {}) };
        melden();
        return false;
      }
      uebernehmen(g, stand !== kern.schreibStand || kern.schreibend > 0 || wartend.length > 0 || schreibtNoch());
      gelesen = true;
      melden();
      return true;
    })()
      .catch(() => false)
      .finally(() => {
        holenLaeuft = null;
      });
    return holenLaeuft;
  }

  /** Vor dem Schreiben: einmal gelesen und der Hauptteil lesbar? → Fehlertext oder null. */
  async function bereit() {
    if (!adapter[namen.aendern]) return TEXT_FEHLER;
    if (!gelesen && !(await holen())) return kern.state.anmeldungNoetig ? texte.anmelden : texte.nichtGelesen;
    return zustand().unlesbar.main ? texte.gesperrt : null;
  }

  /** Ändert den Hauptteil (siehe teilAendern im Kern) mit `fn(daten)`; → wie teilErgebnis. Wirft, wenn `fn` schon am angezeigten Stand ablehnt. */
  async function hauptAendern(fn) {
    return teilErgebnis(
      await kern.teilAendern(offen, 'haupt', fn, {
        leer: beschreibung.leererHaupt,
        aktuell: () => zustand().daten,
        mit: (daten) => ({ ...kern.state, [bereich]: mitBestaetigt({ ...zustand(), daten }) }),
        async speichern(f) {
          try {
            return await adapter[namen.aendern](f);
          } catch (e) {
            if (e?.name === gesperrt.haupt) {
              FACHLICH.add(e);
              hauptSperren();
            }
            throw e;
          }
        },
        async lesen() {
          const g = await adapter[namen.lesen]();
          if (g.unlesbar?.main) {
            hauptSperren();
            return null;
          }
          return g.daten;
        },
        normalisiere: (d) => d ?? beschreibung.leererHaupt(),
      }),
    );
  }

  /**
   * Ändert NUR den Teil `t` mit `fn(teil)`; → wie teilErgebnis. Wirft wie hauptAendern. `vorher()` (optional, async) läuft in jedem
   * Schreibvorgang (auch beim Nachholen) vor dem Schreiben und darf fachlich ablehnen; danach `beschreibung.vorTeilSchreiben(t)`.
   */
  async function teilAendern(t, fn, { vorher = null } = {}) {
    return teilErgebnis(
      await kern.teilAendern(offen, teilSchluessel(t), fn, {
        leer: () => beschreibung.leererTeil(t),
        aktuell: () => zustand()[teileFeld][pfad(t)[0]]?.[pfad(t)[1]] ?? null,
        mit: (teil) => ({ ...kern.state, [bereich]: mitBestaetigt({ ...zustand(), [teileFeld]: mitTeil(zustand()[teileFeld], t, teil) }) }),
        async speichern(f) {
          try {
            if (vorher) await vorher();
            await beschreibung.vorTeilSchreiben(t);
            return await adapter[namen.teilAendern](...pfad(t), f);
          } catch (e) {
            if (e?.name === gesperrt.teil) {
              FACHLICH.add(e);
              teilSperren(t);
            } else if (e?.name === gesperrt.haupt) {
              // das Eintragen des Jahres im Hauptteil (vorTeilSchreiben) fand ihn unlesbar: wie beim Ändern des Hauptteils
              FACHLICH.add(e);
              hauptSperren();
            }
            throw e;
          }
        },
        async lesen() {
          const g = await adapter[namen.teilLesen](...pfad(t));
          if (g.unlesbar) {
            teilSperren(t);
            return null;
          }
          return g[teilAntwort];
        },
        normalisiere: (teil) => teil ?? beschreibung.leererTeil(t),
      }),
    );
  }

  /** Änderung am Hauptteil für die Oberfläche: erst bereit, dann `fn`; nie ein Wurf. */
  async function hauptSicher(fn) {
    const nichtBereit = await bereit();
    if (nichtBereit) return { ok: false, fehler: nichtBereit };
    try {
      return await hauptAendern(fn);
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER }; // schon am angezeigten Stand abgelehnt: nichts geändert
    }
  }

  /**
   * Frisch aus dem Kalender vor dem Senden des Push-Plans (siehe `schichtFrischLesen`, wie `fixFrischLesen`): eigene Änderungen gehen
   * vor, gemeldet wird nur eine echte Änderung. → true = aktuell, false = ging gerade nicht. Wirft nicht.
   */
  function frischLesen() {
    if (frischLaeuft) return frischLaeuft;
    const moeglich = () => adapter[namen.lesen] && kern.state.geladen && !kern.state.nurSnapshot && !kern.state.anmeldungNoetig;
    const eigene = () => kern.schreibend > 0 || wartend.length > 0 || schreibtNoch();
    if (!moeglich() || eigene()) return Promise.resolve(false);
    frischLaeuft = (async () => {
      const stand = kern.schreibStand;
      let g;
      try {
        g = await mitFrist(adapter[namen.lesen](), fristMs);
      } catch (fehler) {
        kern.state = { ...kern.state, [bereich]: { ...zustand(), frisch: false }, ...(istAuthFehler(fehler) ? { anmeldungNoetig: true } : {}) };
        melden();
        return false;
      }
      if (stand !== kern.schreibStand || eigene()) return false;
      const vorher = kern.state;
      uebernehmen(g, false);
      gelesen = true;
      if (JSON.stringify(zustand()) !== JSON.stringify(vorher[bereich])) melden();
      else kern.state = vorher; // nichts geändert: derselbe Zustand (kein Neuzeichnen, kein neuer Push-Plan)
      return true;
    })()
      .catch(() => false)
      .finally(() => {
        frischLaeuft = null;
      });
    return frischLaeuft;
  }

  return {
    offen,
    teilGesperrt,
    get gelesen() {
      return gelesen;
    },
    set gelesen(wert) {
      gelesen = wert;
    },
    offenLeeren,
    mitBestaetigt,
    hauptSperren,
    teilSperren,
    uebernehmen,
    holen,
    bereit,
    hauptAendern,
    teilAendern,
    hauptSicher,
    frischLesen,
  };
}
