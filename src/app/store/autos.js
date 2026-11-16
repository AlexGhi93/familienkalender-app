import { todayVienna } from '../../domain/dates.js';
import { istObjekt } from '../../domain/gemeinsam.js';
import { TEXT_AUTOS_GESPERRT, TEXT_AUTO_WEG, TEXT_HISTORIE_GESPERRT, arbeitLoeschen as arbeitLoeschenRein, arbeitPruefen, arbeitSetzen, arbeitSpur, arbeitWiederherstellen, autoAnlegen, autoLoeschen as autoLoeschenRein, autoSetzen, autoSpur, autoWiederherstellen, autosWarnungen, historieJahrBekannt, historieJahrEintragen, historieWarnungen, kmEintragen, kmLoeschen as kmLoeschenRein, kmPruefen, kmSpur, kmWiederherstellen, leereAutos, leereHistorie, regelLoeschen as regelLoeschenRein, regelSetzen, regelSpur, regelWiederherstellen, satzLoeschen as satzLoeschenRein, satzSetzen, satzSpur, satzVerwendet, satzVerwendetText, satzWiederherstellen } from '../../domain/autos.js';
import { autosHistorien, kmPunkte } from '../../domain/autos-rechnung.js';
import { FACHLICH, TEXT_AUTOS_NEUER, TEXT_FEHLER, eintragVorhanden, gleichOder, historieGleichOder, istAuthFehler, mitFrist } from './kern.js';

const TEXT_AUTOS_NICHT_GELESEN = 'Die Autos konnten nicht gelesen werden. Bitte noch einmal versuchen.';
const TEXT_AUTOS_ANMELDEN = 'Bitte zuerst neu anmelden; danach lassen sich die Autos ändern.';
const TEXT_REGEL_WEG = 'Diese Regel gibt es nicht mehr – sie wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_SATZ_WEG = 'Diesen Reifensatz gibt es nicht mehr – er wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_ARBEIT_WEG = 'Diese Arbeit gibt es nicht mehr – sie wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_KM_WEG = 'Diesen Kilometerstand gibt es nicht mehr – er wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_SATZ_VERLAUF_GESPERRT = 'Ein Teil des Verlaufs dieses Autos ist unlesbar – ob der Reifensatz dort noch vorkommt, lässt sich nicht prüfen. Bitte die App auf beiden Telefonen aktualisieren.';
const TEXT_KENNUNG_BELEGT = 'Diese Kennung ist schon vergeben. Bitte noch einmal versuchen.';
/**
 * Autos im Zustand: `daten` = Hauptteil { v, autos, regeln, saetze, ab, fremd? } (domain/autos.js; unlesbar → leer), `historie` =
 * { [autoId]: { [jahr]: { v, auto, jahr, arbeiten, km, fremd? } } } (die Verlauf-Teile aus dem Jahres-Index; ein gelöschtes Auto kann
 * hier noch stehen, maßgeblich ist daten.autos), `status` null (noch nie gelesen) | 'gespeichert' (Schnappschuss oder Beispieldaten,
 * noch nicht aus dem Kalender) | 'laedt' | 'geladen' | 'fehler' (letztes Lesen gescheitert: Daten wie zuletzt gelesen), `warnungen`
 * = Hinweise für die Anzeige, `unlesbar` = { main?: true, shards: [{ auto, jahr }] }: was diese Version nicht lesen kann – leer gezeigt
 * und gesperrt (main: alles). `frisch` = das LETZTE Lesen aus dem Kalender in dieser Sitzung ist gelungen (false: noch nie, nur
 * Schnappschuss/Beispieldaten, oder zuletzt gescheitert). Nur dann gehören Auto-Erinnerungen in den Push-Plan (Task 3); der übrige Plan
 * wartet nie auf die Autos. `bestaetigt` = { daten, historie } der zuletzt GESPEICHERTE Stand, nur solange eigene Änderungen offen sind
 * (für den Schnappschuss: eine Änderung, die auf die Anmeldung wartet, darf nach einem Neustart nicht als gespeichert erscheinen).
 */
export const leererAutosZustand = () => ({ daten: leereAutos(), historie: {}, status: null, warnungen: [], unlesbar: { shards: [] }, frisch: false });

/** Unlesbare Teile aus dem, was Adapter oder Schnappschuss liefern: { main?: true, shards: [{ auto, jahr }] } (Ungültiges fällt weg). */
function unlesbareAutos(roh) {
  const shards = (Array.isArray(roh?.shards) ? roh.shards : []).filter((x) => typeof x?.auto === 'string' && Number.isInteger(x?.jahr)).map(({ auto, jahr }) => ({ auto, jahr }));
  return { ...(roh?.main === true ? { main: true } : {}), shards };
}

/** Zustand der Autos aus dem, was Adapter ({ daten, historie, warnungen, unlesbar }) oder Schnappschuss liefern. */
export function autosZustand(gelesen, status) {
  const unlesbar = unlesbareAutos(gelesen?.unlesbar);
  return { daten: istObjekt(gelesen?.daten) && !unlesbar.main ? gelesen.daten : leereAutos(), historie: istObjekt(gelesen?.historie) && !unlesbar.main ? gelesen.historie : {}, status, warnungen: Array.isArray(gelesen?.warnungen) ? gelesen.warnungen : [], unlesbar, frisch: status === 'geladen' };
}

/**
 * Scheibe „Autos“ des Stores: Hauptteil (Autos, Regeln, Reifensätze) und Verlauf-Teile je Jahr lesen und ändern. `autoId` = Quelle
 * neuer Kennungen, `autosFristMs` = Frist für das Lesen.
 * → { methoden (öffentliche Methoden des Stores), intern (was Fassade und Schichtplan brauchen) }.
 */
export function createAutosSlice(kern, { autoId, autosFristMs }) {
  const { adapter, jetzt, wartend, melden, teilAendern, teilErgebnis, mitRueckgaengig, fachlich, fachlichAsync } = kern;
  // ---------------------------------------------------------------- Autos
  // Je Teil eine Warteschlange (wie Schichtplan und Fixkosten, siehe teilAendern): 'haupt' (fkautos) und 'h:<auto>:<jahr>' (Verlauf-Teil).
  const autosOffen = new Map();
  const autosSchreibtNoch = () => autosOffen.size > 0;
  let autosGelesen = false; // seit dem Start (oder dem Zurücksetzen) schon einmal aus dem Kalender gelesen? Erst dann wird geschrieben.
  let autosHolenLaeuft = null; // laufendes Lesen: mehrfaches Anstoßen fragt nur einmal
  let autosFrischLaeuft = null; // laufendes Frisch-Lesen vor dem Push-Plan (siehe autosFrischLesen)
  const teilSchluessel = (auto, jahr) => `h:${auto}:${jahr}`;
  const teilGesperrt = (auto, jahr) => kern.state.autos.unlesbar.shards.some((x) => x.auto === auto && x.jahr === jahr);

  /** Leert die Warteschlange eines Teils (nach „unlesbar“: ihr Speichern würde ohnehin abgelehnt). */
  function autosOffenLeeren(schluessel, basis) {
    const e = autosOffen.get(schluessel);
    if (e) {
      e.basis = basis;
      e.offen.length = 0;
    }
  }

  /**
   * `autos` mit `bestaetigt` (siehe leererAutosZustand), solange eigene Änderungen offen sind: Hauptteil und Teile mit offenen Änderungen
   * stehen dort mit ihrer `basis` (dem zuletzt gespeicherten Stand); ohne offene Änderungen fällt `bestaetigt` weg.
   */
  function mitBestaetigt(autos) {
    const { bestaetigt: _alt, ...rest } = autos;
    const offen = [...autosOffen.entries()].filter(([, e]) => e.offen.length > 0);
    if (offen.length === 0) return rest;
    let daten = rest.daten;
    let historie = rest.historie;
    for (const [schluessel, e] of offen) {
      if (schluessel === 'haupt') daten = e.basis;
      else {
        const [, auto, jahr] = schluessel.split(':');
        historie = { ...historie, [auto]: { ...(historie[auto] ?? {}), [jahr]: e.basis } };
      }
    }
    return { ...rest, bestaetigt: { daten, historie } };
  }

  /** Der Hauptteil ist (inzwischen) unlesbar: alles leer und gesperrt. */
  function autosHauptSperren() {
    autosOffenLeeren('haupt', leereAutos());
    kern.state = { ...kern.state, autos: { ...kern.state.autos, daten: leereAutos(), historie: {}, warnungen: autosWarnungen({ unlesbar: true }), unlesbar: { main: true, shards: kern.state.autos.unlesbar.shards } } };
  }

  /** Ein Verlauf-Teil ist (inzwischen) unlesbar: leer gezeigt und gesperrt. */
  function autosTeilSperren(auto, jahr) {
    const leer = leereHistorie(auto, jahr);
    autosOffenLeeren(teilSchluessel(auto, jahr), leer);
    const a = kern.state.autos;
    const shards = teilGesperrt(auto, jahr) ? a.unlesbar.shards : [...a.unlesbar.shards, { auto, jahr }];
    kern.state = { ...kern.state, autos: { ...a, historie: { ...a.historie, [auto]: { ...(a.historie[auto] ?? {}), [jahr]: leer } }, warnungen: [...a.warnungen, ...historieWarnungen({ historie: leer, unlesbar: true })], unlesbar: { ...a.unlesbar, shards } } };
  }

  /**
   * Übernimmt frisch Gelesenes (`g` wie aus adapter.leseAutos). `eigene` = inzwischen selbst etwas geändert: dann bleiben angezeigter
   * Hauptteil und angezeigte Teile (die Antwort könnte älter sein), neu gefundene Teile kommen dazu. Unlesbares gilt immer (leer,
   * gesperrt). Unverändert Gelesenes behält seine Identität (der Push-Plan vergleicht nach Identität).
   */
  function autosUebernehmen(g, eigene) {
    const frisch = autosZustand(g, 'geladen');
    if (frisch.unlesbar.main) {
      autosOffenLeeren('haupt', leereAutos());
      kern.state = { ...kern.state, autos: frisch };
      return;
    }
    const a = kern.state.autos;
    let historie = frisch.historie;
    if (eigene) {
      historie = { ...frisch.historie };
      for (const [auto, jahre] of Object.entries(a.historie)) historie[auto] = { ...(historie[auto] ?? {}), ...jahre };
    }
    for (const { auto, jahr } of frisch.unlesbar.shards) {
      historie = { ...historie, [auto]: { ...(historie[auto] ?? {}), [jahr]: leereHistorie(auto, jahr) } };
      autosOffenLeeren(teilSchluessel(auto, jahr), leereHistorie(auto, jahr));
    }
    kern.state = { ...kern.state, autos: mitBestaetigt({ daten: eigene ? a.daten : gleichOder(a.daten, frisch.daten), historie: historieGleichOder(a.historie, historie), status: 'geladen', warnungen: gleichOder(a.warnungen, frisch.warnungen), unlesbar: gleichOder(a.unlesbar, frisch.unlesbar), frisch: true }) };
  }

  /**
   * Liest Autos und alle Teile des Jahres-Index. Status 'laedt' → 'geladen' bzw. 'fehler' (die zuletzt gelesenen Daten bleiben; abgelaufene
   * Anmeldung setzt zusätzlich `anmeldungNoetig`). → true, wenn gelesen. Höchstens ein Lesen gleichzeitig; wirft nicht.
   */
  function autosHolen() {
    if (autosHolenLaeuft) return autosHolenLaeuft;
    if (!adapter.leseAutos) return Promise.resolve(false);
    autosHolenLaeuft = (async () => {
      const stand = kern.schreibStand;
      kern.state = { ...kern.state, autos: { ...kern.state.autos, status: 'laedt' } };
      melden();
      let g;
      try {
        g = await mitFrist(adapter.leseAutos(), autosFristMs); // hängt es, gilt es als Fehler: der Vorlader der Shell versucht es später wieder
      } catch (fehler) {
        kern.state = { ...kern.state, autos: { ...kern.state.autos, status: 'fehler', frisch: false, warnungen: [TEXT_AUTOS_NICHT_GELESEN] }, ...(istAuthFehler(fehler) ? { anmeldungNoetig: true } : {}) };
        melden();
        return false;
      }
      autosUebernehmen(g, stand !== kern.schreibStand || kern.schreibend > 0 || wartend.length > 0 || autosSchreibtNoch());
      autosGelesen = true;
      melden();
      return true;
    })()
      .catch(() => false)
      .finally(() => {
        autosHolenLaeuft = null;
      });
    return autosHolenLaeuft;
  }

  /** Vor dem Schreiben: einmal gelesen und der Hauptteil lesbar? → Fehlertext oder null. */
  async function autosBereit() {
    if (!adapter.aendereAutos) return TEXT_FEHLER;
    if (!autosGelesen && !(await autosHolen())) return kern.state.anmeldungNoetig ? TEXT_AUTOS_ANMELDEN : TEXT_AUTOS_NICHT_GELESEN;
    return kern.state.autos.unlesbar.main ? TEXT_AUTOS_GESPERRT : null;
  }

  /** Ändert den Hauptteil (siehe teilAendern) mit `fn(daten)`; → wie teilErgebnis. Wirft, wenn `fn` schon am angezeigten Stand ablehnt. */
  async function autosHauptAendern(fn) {
    return teilErgebnis(
      await teilAendern(autosOffen, 'haupt', fn, {
        leer: leereAutos,
        aktuell: () => kern.state.autos.daten,
        mit: (daten) => ({ ...kern.state, autos: mitBestaetigt({ ...kern.state.autos, daten }) }),
        async speichern(f) {
          try {
            return await adapter.aendereAutos(f);
          } catch (e) {
            if (e?.name === 'AutosGesperrt') {
              FACHLICH.add(e);
              autosHauptSperren();
            }
            throw e;
          }
        },
        async lesen() {
          const g = await adapter.leseAutos();
          if (g.unlesbar?.main) {
            autosHauptSperren();
            return null;
          }
          return g.daten;
        },
        normalisiere: (d) => d ?? leereAutos(),
      }),
    );
  }

  /**
   * Vor dem Schreiben eines Teils: steht `jahr` im zuletzt GESPEICHERTEN Jahres-Index? Sonst zuerst dort eintragen – in DEMSELBEN
   * Schreibvorgang wie der Teil (auch beim Nachholen nach der Anmeldung): scheitert das, wird der Teil nicht geschrieben, es entsteht nie
   * ein Teil, den der Index nicht kennt (er bliebe unsichtbar). Hat das andere Telefon das Auto gelöscht → fachliche Meldung.
   */
  async function indexSichern(auto, jahr) {
    const e = autosOffen.get('haupt');
    if (historieJahrBekannt(e?.basis ?? kern.state.autos.daten, auto, jahr)) return;
    const gespeichert = await adapter.aendereAutos(fachlich((d) => historieJahrEintragen(d, auto, jahr)));
    if (!gespeichert) return;
    if (e) e.basis = gespeichert;
    else kern.state = { ...kern.state, autos: { ...kern.state.autos, daten: gleichOder(kern.state.autos.daten, gespeichert) } };
  }

  /**
   * Ändert NUR den Verlauf-Teil von `auto` im Jahr `jahr` mit `fn(historie)`; → wie teilErgebnis. Wirft wie autosHauptAendern.
   * `vorher()` (optional, async) läuft in jedem Schreibvorgang (auch beim Nachholen) vor dem Schreiben und darf fachlich ablehnen.
   */
  async function autosTeilAendern(auto, jahr, fn, { vorher = null } = {}) {
    return teilErgebnis(
      await teilAendern(autosOffen, teilSchluessel(auto, jahr), fn, {
        leer: () => leereHistorie(auto, jahr),
        aktuell: () => kern.state.autos.historie[auto]?.[jahr] ?? null,
        mit: (h) => ({ ...kern.state, autos: mitBestaetigt({ ...kern.state.autos, historie: { ...kern.state.autos.historie, [auto]: { ...(kern.state.autos.historie[auto] ?? {}), [jahr]: h } } }) }),
        async speichern(f) {
          try {
            if (vorher) await vorher();
            await indexSichern(auto, jahr);
            return await adapter.aendereHistorie(auto, jahr, f);
          } catch (e) {
            if (e?.name === 'HistorieGesperrt') {
              FACHLICH.add(e);
              autosTeilSperren(auto, jahr);
            }
            throw e;
          }
        },
        async lesen() {
          const g = await adapter.leseHistorie(auto, jahr);
          if (g.unlesbar) {
            autosTeilSperren(auto, jahr);
            return null;
          }
          return g.historie;
        },
        normalisiere: (h) => h ?? leereHistorie(auto, jahr),
      }),
    );
  }

  /**
   * Ändert den Teil von `auto` im Jahr `jahr` mit `fn(historie)`. Steht das Jahr im zuletzt GESPEICHERTEN Jahres-Index noch nicht, wird
   * es zuerst dort eingetragen (das prüft auf der neuesten Fassung zugleich, dass es das Auto noch gibt) und erst danach der Teil
   * geschrieben: so steht nie ein Teil im Kalender, den der Index nicht kennt (er bliebe unsichtbar; beim Nachholen nach der Anmeldung
   * sichert das indexSichern im Teil selbst). Gesperrt (unlesbar) → Meldung. `optionen` siehe autosTeilAendern. → wie teilErgebnis; wirft nie.
   */
  async function autosInJahrAendern(auto, jahr, fn, optionen) {
    if (teilGesperrt(auto, jahr)) return { ok: false, fehler: TEXT_HISTORIE_GESPERRT };
    if (!(kern.state.autos.daten.autos ?? []).some((a) => a.id === auto)) return { ok: false, fehler: TEXT_AUTO_WEG };
    try {
      const bekannt = historieJahrBekannt(autosOffen.get('haupt')?.basis ?? kern.state.autos.daten, auto, jahr);
      if (!bekannt) {
        const r = await autosHauptAendern((d) => historieJahrEintragen(d, auto, jahr));
        if (!r.ok && !r.wartet) return r;
      }
      return await autosTeilAendern(auto, jahr, fn, optionen);
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER }; // schon am angezeigten Stand abgelehnt: nichts geändert
    }
  }

  /** Neue Kennung (über `autoId`, 0-9a-v), die in `vergeben` noch nicht vorkommt; sonst null. */
  function neueAutosKennung(vergeben) {
    for (let versuch = 0; versuch < 20; versuch += 1) {
      const id = autoId();
      if (typeof id !== 'string' || id === '') return null;
      if (!vergeben.has(id)) return id;
    }
    return null;
  }

  /** Alle vergebenen Kennungen im angezeigten Hauptteil (Autos, Regeln, Reifensätze, auch fremde). */
  function hauptKennungen() {
    const d = kern.state.autos.daten;
    return new Set([...(d.autos ?? []), ...(d.regeln ?? []), ...(d.saetze ?? [])].map((x) => x.id).concat([...(d.fremd?.a ?? []), ...(d.fremd?.r ?? []), ...(d.fremd?.s ?? [])].map((k) => k?.i)));
  }

  /** Alle vergebenen Kennungen von Arbeiten des Autos `auto` (alle angezeigten Jahre, auch fremde). */
  const arbeitKennungen = (auto) => new Set(Object.values(kern.state.autos.historie[auto] ?? {}).flatMap((h) => [...(h.arbeiten ?? []).map((a) => a.id), ...(h.fremd?.w ?? []).map((k) => k?.i)]));

  /** Alle angezeigten Arbeiten des Autos `auto` (alle Jahre). */
  const arbeitenDesAutos = (auto) => Object.values(kern.state.autos.historie[auto] ?? {}).flatMap((h) => h.arbeiten ?? []);

  /** Das Jahr, in dem die Arbeit `id` des Autos `auto` angezeigt wird, oder null. */
  function arbeitJahr(auto, id) {
    for (const [jahr, h] of Object.entries(kern.state.autos.historie[auto] ?? {})) if ((h.arbeiten ?? []).some((a) => a.id === id)) return Number(jahr);
    return null;
  }

  /** Die km-Punkte des Autos `auto` (angezeigter Stand) für die Warnungen beim Eintragen. */
  const autoPunkte = (auto) => kmPunkte(autosHistorien(kern.state.autos), (kern.state.autos.daten.autos ?? []).find((a) => a.id === auto) ?? auto);

  /** Änderung am Hauptteil für die Oberfläche: erst bereit, dann `fn`; nie ein Wurf. */
  async function autosHauptSicher(fn) {
    const nichtBereit = await autosBereit();
    if (nichtBereit) return { ok: false, fehler: nichtBereit };
    try {
      return await autosHauptAendern(fn);
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER }; // schon am angezeigten Stand abgelehnt: nichts geändert
    }
  }

  /**
   * Autos für die Sicherung: frisch aus dem Kalender (Anmeldefehler laufen nach oben), dazu roh alle Verlauf-Teile, die der Index nicht
   * kennt (`weitereTeile`: Teile gelöschter Autos, alles bei unlesbarem Hauptteil); ohne passenden Adapter der angezeigte Stand.
   */
  async function autosFuerSicherung() {
    if (!adapter.leseAutos) return { daten: kern.state.autos.daten, historie: kern.state.autos.historie, rohtexte: [], weitereTeile: [] };
    const g = adapter.leseAutosSicherung ? await adapter.leseAutosSicherung() : await adapter.leseAutos();
    return { daten: g.daten, historie: g.historie, rohtexte: g.rohtexte ?? [], weitereTeile: g.weitereTeile ?? [] };
  }

  /**
   * „Beispieldaten entfernen“ für die Autos: erst jeden Verlauf-Teil mit Inhalt leeren (fremde Einträge bleiben), dann den Hauptteil (nur
   * fremde Autos samt ihrem Jahres-Index bleiben). Unlesbares bleibt unangetastet. Wirft mit deutscher Meldung, wenn etwas scheitert.
   */
  async function autosLeeren() {
    const nichtBereit = await autosBereit();
    if (nichtBereit === TEXT_AUTOS_GESPERRT) return;
    if (nichtBereit) throw new Error(nichtBereit);
    const pruefe = (r) => {
      if (!r.ok && !r.wartet) throw new Error(r.fehler ?? TEXT_FEHLER);
    };
    for (const [auto, jahre] of Object.entries(kern.state.autos.historie)) {
      for (const h of Object.values(jahre)) {
        if (teilGesperrt(auto, h.jahr) || ((h.arbeiten ?? []).length === 0 && (h.km ?? []).length === 0)) continue;
        pruefe(await autosTeilAendern(auto, h.jahr, (x) => (x.fremd ? { ...leereHistorie(auto, h.jahr), fremd: x.fremd } : leereHistorie(auto, h.jahr))));
      }
    }
    const d = kern.state.autos.daten;
    if ((d.autos ?? []).length === 0 && (d.regeln ?? []).length === 0 && (d.saetze ?? []).length === 0) return;
    pruefe(
      await autosHauptAendern((x) => {
        if (!x.fremd) return leereAutos();
        const fremdeAutos = new Set((x.fremd.a ?? []).map((k) => k?.i));
        return { ...leereAutos(), ab: Object.fromEntries(Object.entries(x.ab ?? {}).filter(([id]) => fremdeAutos.has(id))), fremd: x.fremd };
      }),
    );
  }

  const methoden = {
    /** Autos und ihren Verlauf (alle Teile des Jahres-Index) neu lesen, z. B. beim Öffnen ihrer Seite. → { ok: true } | { ok: false, fehler }; wirft nie. */
    async autosLaden() {
      if (await autosHolen()) return { ok: true };
      return { ok: false, fehler: kern.state.anmeldungNoetig ? TEXT_AUTOS_ANMELDEN : TEXT_AUTOS_NICHT_GELESEN };
    },

    /**
     * Autos frisch aus dem Kalender vor dem Senden des Push-Plans (siehe `schichtFrischLesen`): wie `fixFrischLesen` – eigene Änderungen
     * gehen vor, gemeldet wird nur eine echte Änderung. → true = aktuell, false = ging gerade nicht. Wirft nicht.
     */
    autosFrischLesen() {
      if (autosFrischLaeuft) return autosFrischLaeuft;
      const moeglich = () => adapter.leseAutos && kern.state.geladen && !kern.state.nurSnapshot && !kern.state.anmeldungNoetig;
      const eigene = () => kern.schreibend > 0 || wartend.length > 0 || autosSchreibtNoch();
      if (!moeglich() || eigene()) return Promise.resolve(false);
      autosFrischLaeuft = (async () => {
        const stand = kern.schreibStand;
        let g;
        try {
          g = await mitFrist(adapter.leseAutos(), autosFristMs);
        } catch (fehler) {
          kern.state = { ...kern.state, autos: { ...kern.state.autos, frisch: false }, ...(istAuthFehler(fehler) ? { anmeldungNoetig: true } : {}) };
          melden();
          return false;
        }
        if (stand !== kern.schreibStand || eigene()) return false;
        const vorher = kern.state;
        autosUebernehmen(g, false);
        autosGelesen = true;
        if (JSON.stringify(kern.state.autos) !== JSON.stringify(vorher.autos)) melden();
        else kern.state = vorher; // nichts geändert: derselbe Zustand (kein Neuzeichnen, kein neuer Push-Plan)
        return true;
      })()
        .catch(() => false)
        .finally(() => {
          autosFrischLaeuft = null;
        });
      return autosFrischLaeuft;
    },

    /**
     * Auto anlegen oder ändern. `paketOderAuto` = { auto, regeln, saetze } (aus autoAusVorlage: alles auf einmal) oder ein Auto (ohne `id`:
     * neu, die Kennung vergibt der Store; mit `id`: ändern – hat das andere Telefon es inzwischen gelöscht, wird es nicht neu angelegt).
     * → { ok: true, id } | { ok: false, fehler, gemeldet? } | { ok: false, wartet: true, fehler }. Wirft nie.
     */
    async autoSpeichern(paketOderAuto) {
      const x = istObjekt(paketOderAuto) ? paketOderAuto : {};
      if (istObjekt(x.auto)) {
        const paket = { auto: x.auto, regeln: Array.isArray(x.regeln) ? x.regeln : [], saetze: Array.isArray(x.saetze) ? x.saetze : [] };
        const nichtBereit = await autosBereit();
        if (nichtBereit) return { ok: false, fehler: nichtBereit };
        const vergeben = hauptKennungen(); // erst nach dem Lesen: die Kennungen der Vorlage sind zufällig, ein Zusammenstoß wäre selten, aber fatal
        if ([paket.auto, ...paket.regeln, ...paket.saetze].some((e) => vergeben.has(e?.id))) return { ok: false, fehler: TEXT_KENNUNG_BELEGT };
        const r = await autosHauptSicher((d) => autoAnlegen(d, paket));
        return r.ok ? { ok: true, id: paket.auto.id } : r;
      }
      if (x.id) {
        const r = await autosHauptSicher((d) => (eintragVorhanden(d.autos, d.fremd?.a, x.id, TEXT_AUTO_WEG), autoSetzen(d, x)));
        return r.ok ? { ok: true, id: x.id } : r;
      }
      const nichtBereit = await autosBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const id = neueAutosKennung(hauptKennungen());
      if (!id) return { ok: false, fehler: TEXT_FEHLER };
      const r = await autosHauptSicher((d) => autoSetzen(d, { ...x, id }));
      return r.ok ? { ok: true, id } : r;
    },

    /**
     * Auto löschen samt Regeln, Reifensätzen und Jahres-Index. Die Verlauf-Teile („fkah…“) bleiben bewusst im Kalender liegen: so bringt
     * „Rückgängig“ (der Index kommt mit zurück) den ganzen Verlauf unverändert wieder. → wie `autoSpeichern`, bei Erfolg mit
     * `rueckgaengig()`: genau das Gelöschte (wie es im Kalender stand) an seine alten Stellen.
     */
    async autoLoeschen(id) {
      let spur = null;
      const r = await autosHauptSicher((d) => {
        eintragVorhanden(d.autos, d.fremd?.a, id, TEXT_AUTO_WEG);
        const s = autoSpur(d, id);
        const neu = autoLoeschenRein(d, id);
        spur = s; // auf der neuesten Fassung: das wirklich Gelöschte
        return neu;
      });
      return mitRueckgaengig(r, spur ? () => autosHauptSicher((d) => autoWiederherstellen(d, spur)) : null);
    },

    /** Regel anlegen (ohne `id`) oder ändern (mit `id`; inzwischen gelöscht → Meldung). → { ok: true, id } | wie `autoSpeichern`. */
    async regelSpeichern(regel) {
      const x = istObjekt(regel) ? regel : {};
      if (x.id) {
        const r = await autosHauptSicher((d) => (eintragVorhanden(d.regeln, d.fremd?.r, x.id, TEXT_REGEL_WEG), regelSetzen(d, x)));
        return r.ok ? { ok: true, id: x.id } : r;
      }
      const nichtBereit = await autosBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const id = neueAutosKennung(hauptKennungen());
      if (!id) return { ok: false, fehler: TEXT_FEHLER };
      const r = await autosHauptSicher((d) => regelSetzen(d, { ...x, id }));
      return r.ok ? { ok: true, id } : r;
    },

    /** Reifensatz anlegen (ohne `id`) oder ändern (mit `id`; inzwischen gelöscht → Meldung). → { ok: true, id } | wie `autoSpeichern`. */
    async satzSpeichern(satz) {
      const x = istObjekt(satz) ? satz : {};
      if (x.id) {
        const r = await autosHauptSicher((d) => (eintragVorhanden(d.saetze, d.fremd?.s, x.id, TEXT_SATZ_WEG), satzSetzen(d, x)));
        return r.ok ? { ok: true, id: x.id } : r;
      }
      const nichtBereit = await autosBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const id = neueAutosKennung(hauptKennungen());
      if (!id) return { ok: false, fehler: TEXT_FEHLER };
      const r = await autosHauptSicher((d) => satzSetzen(d, { ...x, id }));
      return r.ok ? { ok: true, id } : r;
    },

    /**
     * Arbeit eintragen (ohne `id`: neue Kennung) oder ändern (mit `id`). `entwurf` = { auto, typ, datum, km?, kmGeschaetzt?, notiz?,
     * kosten?, regel?, details }; „heute“ (Wiener Datum) bestimmt der Store. Geschrieben wird NUR der Teil des Jahres von `datum` (und, ist
     * das Jahr neu, vorher der Jahres-Index in „fkautos“), als reine Änderung auf der neuesten Fassung: zwei Telefone behalten beide
     * Arbeiten. Ein geändertes Jahr = im neuen Teil eintragen, danach im alten löschen; scheitert das Löschen, sagt die Meldung, wo die
     * Arbeit jetzt steht. → { ok: true, id, warnung } (warnung = Hinweis zum Kilometerstand oder null) | { ok: false, fehler, gemeldet? } |
     * { ok: false, wartet: true, fehler }. Wirft nie.
     */
    async arbeitSpeichern(entwurf) {
      const heute = todayVienna(jetzt());
      const x = istObjekt(entwurf) ? entwurf : {};
      const nichtBereit = await autosBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const auto = x.auto;
      if (!(kern.state.autos.daten.autos ?? []).some((a) => a.id === auto)) return { ok: false, fehler: TEXT_AUTO_WEG };
      const altJahr = x.id ? arbeitJahr(auto, x.id) : null;
      if (x.id && altJahr === null) return { ok: false, fehler: TEXT_ARBEIT_WEG };
      const id = x.id ?? neueAutosKennung(arbeitKennungen(auto));
      if (!id) return { ok: false, fehler: TEXT_FEHLER };
      const arbeit = { ...x, id };
      const { fehler, warnung } = arbeitPruefen(arbeit, { heute, punkte: autoPunkte(auto) });
      if (fehler) return { ok: false, fehler };
      const jahr = Number(arbeit.datum.slice(0, 4));
      if (teilGesperrt(auto, jahr) || (altJahr !== null && teilGesperrt(auto, altJahr))) return { ok: false, fehler: TEXT_HISTORIE_GESPERRT };
      const setzen = altJahr === jahr ? (h) => (eintragVorhanden(h.arbeiten, h.fremd?.w, id, TEXT_ARBEIT_WEG), arbeitSetzen(h, arbeit, { heute })) : (h) => arbeitSetzen(h, arbeit, { heute });
      const wechsel = altJahr !== null && altJahr !== jahr;
      // Jahreswechsel: jeder der beiden Schritte prüft in seinem eigenen Schreibvorgang (auch beim Nachholen nach der Anmeldung), dass der
      // andere passt – eingetragen wird nur, was im alten Jahr noch steht (M6), gelöscht nur, was im neuen schon gespeichert ist (I2).
      const steht = (j, text) => async () => {
        const g = await adapter.leseHistorie(auto, j);
        if (!(g.historie?.arbeiten ?? []).some((a) => a.id === id)) throw Object.assign(new Error(text), { fachlich: true });
      };
      const imAlten = wechsel ? { vorher: fachlichAsync(steht(altJahr, TEXT_ARBEIT_WEG)) } : undefined;
      const r = await autosInJahrAendern(auto, jahr, setzen, imAlten);
      if (!wechsel) return r.ok ? { ok: true, id, warnung } : r;
      if (!r.ok && !r.wartet) return r;
      const weg = await autosInJahrAendern(auto, altJahr, (h) => arbeitLoeschenRein(h, id), { vorher: fachlichAsync(steht(jahr, `Die Arbeit wurde nicht verschoben – sie steht weiter im Jahr ${altJahr}.`)) });
      if (r.wartet) return weg.ok ? r : weg;
      if (weg.ok || weg.wartet) return weg.ok ? { ok: true, id, warnung } : weg;
      kern.fehlerNr += 1;
      const text = `Die Arbeit steht jetzt im Jahr ${jahr}, im Jahr ${altJahr} konnte sie aber nicht entfernt werden – bitte dort noch einmal löschen.`;
      kern.state = { ...kern.state, fehler: text, fehlerNr: kern.fehlerNr };
      melden();
      return { ok: false, fehler: text, gemeldet: true };
    },

    /**
     * Arbeit `id` des Autos `autoId` im Jahr `jahr` löschen (nur dieser Teil wird geschrieben). → wie `arbeitSpeichern` (ohne id/warnung),
     * bei Erfolg mit `rueckgaengig()`: genau diese Arbeit (wie sie im Kalender stand) an ihre alte Stelle.
     */
    async arbeitLoeschen(autoId, jahr, id) {
      const nichtBereit = await autosBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      if (!(kern.state.autos.historie[autoId]?.[jahr]?.arbeiten ?? []).some((a) => a.id === id)) return { ok: false, fehler: TEXT_ARBEIT_WEG };
      let spur = null;
      const r = await autosInJahrAendern(autoId, jahr, (h) => {
        eintragVorhanden(h.arbeiten, h.fremd?.w, id, TEXT_ARBEIT_WEG);
        const s = arbeitSpur(h, id);
        const neu = arbeitLoeschenRein(h, id);
        spur = s; // auf der neuesten Fassung
        return neu;
      });
      const zurueck = async () => {
        const nb = await autosBereit();
        return nb ? { ok: false, fehler: nb } : autosInJahrAendern(autoId, jahr, (h) => arbeitWiederherstellen(h, spur));
      };
      return mitRueckgaengig(r, spur ? zurueck : null);
    },

    /**
     * Kilometerstand { datum, km } eintragen (höchstens einer je Tag; ein neuer am selben Tag ersetzt ihn), im Teil des Jahres von
     * `datum`. → { ok: true, warnung } | wie `arbeitSpeichern`.
     */
    async kmSpeichern(autoId, eintrag) {
      const heute = todayVienna(jetzt());
      const { datum, km } = istObjekt(eintrag) ? eintrag : {};
      const nichtBereit = await autosBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      if (!(kern.state.autos.daten.autos ?? []).some((a) => a.id === autoId)) return { ok: false, fehler: TEXT_AUTO_WEG };
      const { fehler, warnung } = kmPruefen({ datum, km }, { heute, punkte: autoPunkte(autoId) });
      if (fehler) return { ok: false, fehler };
      const r = await autosInJahrAendern(autoId, Number(datum.slice(0, 4)), (h) => kmEintragen(h, { datum, km }, { heute }));
      return r.ok ? { ok: true, warnung } : r;
    },

    /**
     * Kilometerstand vom Tag `datum` des Autos `autoId` löschen (nur der Teil dieses Jahres wird geschrieben). → wie `arbeitLoeschen`,
     * bei Erfolg mit `rueckgaengig()`: genau dieser Stand (wie er im Kalender stand) wieder an seinem Tag.
     */
    async kmLoeschen(autoId, datum) {
      const nichtBereit = await autosBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      if (!(kern.state.autos.daten.autos ?? []).some((a) => a.id === autoId)) return { ok: false, fehler: TEXT_AUTO_WEG };
      const jahr = typeof datum === 'string' ? Number(datum.slice(0, 4)) : NaN;
      if (!kmSpur(kern.state.autos.historie[autoId]?.[jahr], datum)) return { ok: false, fehler: TEXT_KM_WEG };
      let spur = null;
      const r = await autosInJahrAendern(autoId, jahr, (h) => {
        const s = kmSpur(h, datum);
        if (!s) throw new Error(TEXT_KM_WEG);
        const neu = kmLoeschenRein(h, datum);
        spur = s; // auf der neuesten Fassung
        return neu;
      });
      const zurueck = async () => {
        const nb = await autosBereit();
        return nb ? { ok: false, fehler: nb } : autosInJahrAendern(autoId, jahr, (h) => kmWiederherstellen(h, spur));
      };
      return mitRueckgaengig(r, spur ? zurueck : null);
    },

    /**
     * Reifensatz löschen – nur, wenn keine Arbeit im Verlauf ihn nennt (sonst Meldung, nichts geschrieben; erst diese Arbeiten löschen).
     * → wie `autoSpeichern`, bei Erfolg mit `rueckgaengig()`: derselbe Satz an seiner alten Stelle.
     */
    async satzLoeschen(id) {
      const nichtBereit = await autosBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const satz = (kern.state.autos.daten.saetze ?? []).find((x) => x.id === id);
      if (!satz) return { ok: false, fehler: (kern.state.autos.daten.fremd?.s ?? []).some((k) => k?.i === id) ? TEXT_AUTOS_NEUER : TEXT_SATZ_WEG };
      if (kern.state.autos.unlesbar.shards.some((x) => x.auto === satz.auto)) return { ok: false, fehler: TEXT_SATZ_VERLAUF_GESPERRT };
      const n = satzVerwendet(arbeitenDesAutos(satz.auto), id);
      if (n > 0) return { ok: false, fehler: satzVerwendetText(satz.name, n) };
      let spur = null;
      const r = await autosHauptSicher((d) => {
        eintragVorhanden(d.saetze, d.fremd?.s, id, TEXT_SATZ_WEG);
        const s = satzSpur(d, id);
        const neu = satzLoeschenRein(d, id);
        spur = s;
        return neu;
      });
      return mitRueckgaengig(r, spur ? () => autosHauptSicher((d) => satzWiederherstellen(d, spur)) : null);
    },

    /** Regel löschen (statt nur abschalten). → wie `autoSpeichern`, bei Erfolg mit `rueckgaengig()`: dieselbe Regel an ihrer alten Stelle. */
    async regelLoeschen(id) {
      let spur = null;
      const r = await autosHauptSicher((d) => {
        eintragVorhanden(d.regeln, d.fremd?.r, id, TEXT_REGEL_WEG);
        const s = regelSpur(d, id);
        const neu = regelLoeschenRein(d, id);
        spur = s;
        return neu;
      });
      return mitRueckgaengig(r, spur ? () => autosHauptSicher((d) => regelWiederherstellen(d, spur)) : null);
    },
  };

  return {
    methoden,
    intern: {
      autosHolen,
      autosLeeren,
      autosFuerSicherung,
      set autosGelesen(wert) {
        autosGelesen = wert;
      },
    },
  };
}
