import { todayVienna } from '../domain/dates.js';
import { istObjekt } from '../domain/gemeinsam.js';
import { normalizeSettings } from '../domain/settings.js';
import { leereListe } from '../domain/einkauf.js';
import { leeresKonto, normalisiereKonto } from '../domain/konto.js';
import { FIX_SHARDS, leererShard, neueFixId } from '../domain/fixkosten.js';
import { TEXT_AUTOS_GESPERRT, TEXT_AUTO_WEG, TEXT_HISTORIE_GESPERRT, arbeitLoeschen as arbeitLoeschenRein, arbeitPruefen, arbeitSetzen, arbeitSpur, arbeitWiederherstellen, autoAnlegen, autoLoeschen as autoLoeschenRein, autoSetzen, autoSpur, autoWiederherstellen, autosWarnungen, historieJahrBekannt, historieJahrEintragen, historieWarnungen, kmEintragen, kmLoeschen as kmLoeschenRein, kmPruefen, kmSpur, kmWiederherstellen, leereAutos, leereHistorie, neueAutoId, regelLoeschen as regelLoeschenRein, regelSetzen, regelSpur, regelWiederherstellen, satzLoeschen as satzLoeschenRein, satzSetzen, satzSpur, satzVerwendet, satzVerwendetText, satzWiederherstellen } from '../domain/autos.js';
import { autosHistorien, kmPunkte } from '../domain/autos-rechnung.js';
import { TEXT_POLIZZE_WEG, TEXT_RECHNUNG_WEG, TEXT_VERSICHERUNG_GESPERRT, TEXT_VERSICHERUNG_TEIL_GESPERRT, erstattungSetzen, fassungJetzt, leererVersicherungTeil, leereVersicherung, neueVersicherungId, polizzeAendern, polizzeAnlegen, rechnungJahr, rechnungLoeschen as rechnungLoeschenRein, rechnungPruefen, rechnungQuartal, rechnungSetzen, rechnungSpur, rechnungTeilWechseln, rechnungWiederherstellen, versicherungJahrBekannt, versicherungJahrEintragen, versicherungTeilWarnungen, versicherungWarnungen } from '../domain/versicherung.js';
import { rechnungFinden } from '../domain/versicherung-rechnung.js';
import { TEXT_ZIELE_GESPERRT, TEXT_ZIELE_NICHT_GELADEN, freiVerschieben as zielFreiVerschieben, leereZiele, neueZielId, startMonat, verschiebungLoeschen as verschiebungLoeschenRein, verschiebungWiederherstellen as verschiebungWiederherstellenRein, zielAusblenden as zielAusblendenRein, zielBeenden as zielBeendenRein, zielLoeschen as zielLoeschenRein, zielSchluss, zielSetzen, zielSpur, zielWiederherstellen as zielWiederherstellenRein, zieleWarnungen } from '../domain/sparziele.js';
import { FACHLICH, TEXT_AUTOS_NEUER, TEXT_FEHLER, createKern, eintragVorhanden, gleichOder, historieGleichOder, istAuthFehler, ladeFelder, mitFrist } from './store/kern.js';
import { createEinkaufKontoSlice } from './store/einkauf-konto.js';
import { createFixkostenSlice, fixAusDaten, leereFixkosten } from './store/fixkosten.js';
import { createKalenderSlice } from './store/kalender.js';
import { createSchichtSlice, leererSchichtplan, schichtAusDaten } from './store/schicht.js';

const MIN_ABSTAND_MS = 60_000; // höchstens einmal pro Minute neu laden
const TEXT_ZIEL_GELOESCHT = 'Dieses Sparziel gibt es nicht mehr – es wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_ZIEL_NEUER = 'Dieses Sparziel hat das andere Telefon mit einer neueren App-Version geändert. Bitte die App aktualisieren.';
const TEXT_ZIEL_ABGESCHLOSSEN = 'Dieses Sparziel ist schon abgeschlossen.';
const TEXT_NICHT_AUTOMATISCH = 'Nur ein nach dem Zieldatum automatisch abgeschlossenes Ziel lässt sich so zurück zu Frei geben.';
const TEXT_VERSCHIEBUNG_WEG = 'Diese Verschiebung gibt es nicht mehr – sie wurde wohl auf dem anderen Telefon rückgängig gemacht.';
const TEXT_VERSCHIEBUNG_NEUER = 'Diese Verschiebung hat das andere Telefon mit einer neueren App-Version geändert. Bitte die App aktualisieren.';
const TEXT_AUTOS_NICHT_GELESEN = 'Die Autos konnten nicht gelesen werden. Bitte noch einmal versuchen.';
const TEXT_AUTOS_ANMELDEN = 'Bitte zuerst neu anmelden; danach lassen sich die Autos ändern.';
const TEXT_REGEL_WEG = 'Diese Regel gibt es nicht mehr – sie wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_SATZ_WEG = 'Diesen Reifensatz gibt es nicht mehr – er wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_ARBEIT_WEG = 'Diese Arbeit gibt es nicht mehr – sie wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_KM_WEG = 'Diesen Kilometerstand gibt es nicht mehr – er wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_SATZ_VERLAUF_GESPERRT = 'Ein Teil des Verlaufs dieses Autos ist unlesbar – ob der Reifensatz dort noch vorkommt, lässt sich nicht prüfen. Bitte die App auf beiden Telefonen aktualisieren.';
const TEXT_KENNUNG_BELEGT = 'Diese Kennung ist schon vergeben. Bitte noch einmal versuchen.';
const TEXT_VERSICHERUNG_NICHT_GELESEN = 'Die Versicherung konnte nicht gelesen werden. Bitte noch einmal versuchen.';
const TEXT_VERSICHERUNG_ANMELDEN = 'Bitte zuerst neu anmelden; danach lässt sich die Versicherung ändern.';
const TEXT_KEINE_POLIZZE = 'Bitte zuerst die Polizze anlegen.';
const TEXT_POLIZZE_SCHON_DA = 'Auf dem anderen Telefon wurde inzwischen schon eine Polizze angelegt – sie wird jetzt gezeigt. Bitte dort ändern, was nicht passt.';
const TEXT_KOPIE_GEAENDERT = 'Gespeichert. Die Rechnung wurde inzwischen auf dem anderen Telefon geändert – bitte noch einmal ansehen.';
const TEXT_KATEGORIE_UNPRUEFBAR = 'Ein Teil der Rechnungen ist unlesbar – ob die Kategorie dort noch vorkommt, lässt sich nicht prüfen. Bitte die App auf beiden Telefonen aktualisieren.';

/** Zufällige ID aus den Zeichen 0-9 und a-v: so darf sie auch als Google-Ereignis-ID dienen. */
const zufaelligeId = () => `u${Array.from({ length: 11 }, () => Math.floor(Math.random() * 32).toString(32)).join('')}`;

/**
 * Sparziele im Zustand: `daten` = { v, beginn?, z, m, fremd? } (siehe domain/sparziele.js; bei unlesbaren Sparzielen leer), `status`
 * null (noch nie gelesen) | 'gespeichert' (aus dem Schnappschuss, noch nicht aus dem Kalender) | 'geladen' (mit laden(), zusammen mit
 * dem Kontostand, oder mit zieleLaden()) | 'fehler' (das letzte Lesen ist gescheitert: `daten` wie zuletzt gelesen, Hinweis
 * TEXT_ZIELE_NICHT_GELADEN in `warnungen`), `unlesbar` = diese Version kann die gespeicherten Sparziele nicht lesen (beschädigt oder
 * neuere Version): leer gezeigt und gesperrt, `warnungen` = Hinweise für die Anzeige (zieleWarnungen). Geändert werden darf nur bei
 * 'geladen' oder 'gespeichert' (dann wartet es ohnehin auf die Anmeldung und wird auf die neueste Fassung angewendet) und lesbar.
 */
const leererZieleZustand = () => ({ daten: leereZiele(), status: null, unlesbar: false, warnungen: [] });

/** Zustand aus dem, was Adapter ({ daten, unlesbar, … }) oder Schnappschuss ({ daten, unlesbar }) liefern. */
function zieleZustand(gelesen, status) {
  const daten = gelesen?.daten && typeof gelesen.daten === 'object' ? gelesen.daten : leereZiele();
  const unlesbar = gelesen?.unlesbar === true;
  return { daten, status, unlesbar, warnungen: zieleWarnungen({ daten, unlesbar }) };
}

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
const leererAutosZustand = () => ({ daten: leereAutos(), historie: {}, status: null, warnungen: [], unlesbar: { shards: [] }, frisch: false });

/** Unlesbare Teile aus dem, was Adapter oder Schnappschuss liefern: { main?: true, shards: [{ auto, jahr }] } (Ungültiges fällt weg). */
function unlesbareAutos(roh) {
  const shards = (Array.isArray(roh?.shards) ? roh.shards : []).filter((x) => typeof x?.auto === 'string' && Number.isInteger(x?.jahr)).map(({ auto, jahr }) => ({ auto, jahr }));
  return { ...(roh?.main === true ? { main: true } : {}), shards };
}

/** Zustand der Autos aus dem, was Adapter ({ daten, historie, warnungen, unlesbar }) oder Schnappschuss liefern. */
function autosZustand(gelesen, status) {
  const unlesbar = unlesbareAutos(gelesen?.unlesbar);
  return { daten: istObjekt(gelesen?.daten) && !unlesbar.main ? gelesen.daten : leereAutos(), historie: istObjekt(gelesen?.historie) && !unlesbar.main ? gelesen.historie : {}, status, warnungen: Array.isArray(gelesen?.warnungen) ? gelesen.warnungen : [], unlesbar, frisch: status === 'geladen' };
}

/**
 * Versicherung im Zustand (wie die Autos): `daten` = Hauptteil { v, polizze, ab, fremd? } (domain/versicherung.js; unlesbar → leer),
 * `teile` = { [jahr]: { [quartal]: { v, jahr, quartal, rechnungen, fremd? } } } (die gelesenen Quartal-Teile; ein nie angelegter fehlt),
 * `geschrieben` = { [jahr]: { [quartal]: Zeitstempel } } (Google: `updated`; entscheidet bei doppelt stehenden Rechnungen nur, wenn ihre
 * `fassung` gleich ist, siehe rechnungenDesJahres(teile, jahr, { geschrieben })), `status` null | 'gespeichert' | 'laedt' | 'geladen' | 'fehler' wie bei den Autos,
 * `warnungen` = Hinweise für die Anzeige, `unlesbar` = { main?: true, teile: [{ jahr, quartal }] } (leer gezeigt und gesperrt), `frisch`
 * = das LETZTE Lesen aus dem Kalender in dieser Sitzung ist gelungen – nur dann gehören Versicherungs-Erinnerungen in den Push-Plan
 * (Task 3); der übrige Plan wartet nie auf die Versicherung. `bestaetigt` = { daten, teile } des zuletzt GESPEICHERTEN Stands, nur
 * solange eigene Änderungen offen sind (für den Schnappschuss).
 */
const leererVersicherungZustand = () => ({ daten: leereVersicherung(), teile: {}, geschrieben: {}, status: null, warnungen: [], unlesbar: { teile: [] }, frisch: false });

/** Unlesbare Teile aus dem, was Adapter oder Schnappschuss liefern: { main?: true, teile: [{ jahr, quartal }] } (Ungültiges fällt weg). */
function unlesbareVersicherung(roh) {
  const teile = (Array.isArray(roh?.teile) ? roh.teile : []).filter((x) => Number.isInteger(x?.jahr) && Number.isInteger(x?.quartal) && x.quartal >= 1 && x.quartal <= 4).map(({ jahr, quartal }) => ({ jahr, quartal }));
  return { ...(roh?.main === true ? { main: true } : {}), teile };
}

/** Zustand der Versicherung aus dem, was Adapter ({ daten, teile, geschrieben, warnungen, unlesbar }) oder Schnappschuss liefern. */
function versicherungZustand(gelesen, status) {
  const unlesbar = unlesbareVersicherung(gelesen?.unlesbar);
  const lesbar = !unlesbar.main;
  return {
    daten: istObjekt(gelesen?.daten) && lesbar ? gelesen.daten : leereVersicherung(),
    teile: istObjekt(gelesen?.teile) && lesbar ? gelesen.teile : {},
    geschrieben: istObjekt(gelesen?.geschrieben) && lesbar ? gelesen.geschrieben : {},
    status,
    warnungen: Array.isArray(gelesen?.warnungen) ? gelesen.warnungen : [],
    unlesbar,
    frisch: status === 'geladen',
  };
}

/**
 * Wirft, wenn es das Ziel `id` in `daten` nicht (mehr) gibt: inzwischen gelöscht, oder vom anderen Telefon mit einer neueren Version
 * geändert (jetzt ein fremder Eintrag, den diese Version nicht anfassen darf). Auf der neuesten Fassung heißt der Wurf: zurücknehmen,
 * neu lesen, die Meldung zeigen.
 */
function zielVorhanden(daten, id) {
  const z = (daten.z ?? []).find((x) => x.id === id);
  if (z) return z;
  throw new Error((daten.fremd?.z ?? []).some((k) => k?.i === id) ? TEXT_ZIEL_NEUER : TEXT_ZIEL_GELOESCHT);
}

/**
 * Zustand der App. Alle Änderungen gehen zuerst in den Zustand (Oberfläche reagiert sofort) und dann in den Adapter.
 * - Schlägt das Speichern fehl, wird der Stand neu vom Adapter geladen (Teil-Erfolge bleiben sichtbar) und `fehler` gesetzt.
 * - Läuft die Anmeldung ab (Fehler „AuthAbgelaufen“), bleibt die Änderung sichtbar und wartet; `wiederholeAusstehende()`
 *   speichert sie nach dem erneuten Anmelden.
 * - Mehr als drei Schreibvorgänge melden ihren Fortschritt (`state.fortschritt`).
 */
export function createStore(adapter, { jetzt = () => new Date(), neueId = zufaelligeId, fixId = neueFixId, zielId = neueZielId, autoId = neueAutoId, autosFristMs = 20_000, versicherungId = () => neueVersicherungId(), versicherungFristMs = 20_000 } = {}) {
  const kern = createKern({ adapter, jetzt, neueId });
  const { wartend, melden, ausfuehren, teilAendern, teilErgebnis, mitRueckgaengig, fachlich, fachlichAsync } = kern;
  const store = {};
  kern.state = { geladen: false, settings: normalizeSettings(), tage: {}, urlaub: [], termine: [], einkauf: leereListe(), konto: leeresKonto(), schicht: leererSchichtplan(), fixkosten: leereFixkosten(), ziele: leererZieleZustand(), autos: leererAutosZustand(), versicherung: leererVersicherungZustand(), unlesbar: [], fehler: null, fortschritt: null, anmeldungNoetig: false, fenster: null };
  let letzteLadung = 0;
  // Änderungen der Sparziele, die noch nicht gespeichert sind (Warteschlange wie beim Schichtplan, siehe teilAendern), und ein Zähler
  // begonnener Änderungen: ein Laden, das älter sein könnte als eine eigene Änderung, ersetzt die angezeigten Sparziele nicht.
  const zieleOffen = new Map();
  let zieleStand = 0;
  let zieleLesenLaeuft = null; // laufendes zieleLaden(): mehrfaches Anstoßen liest nur einmal
  /** Die zuletzt gelesenen Sparziele bleiben, aber gesperrt: das Lesen ist gescheitert (Netz). */
  const zieleNichtGelesen = () => ({ ...kern.state.ziele, status: 'fehler', warnungen: [TEXT_ZIELE_NICHT_GELADEN] });
  /**
   * Sparziele nach einem Laden (`stand` = zieleStand beim Beginn): `ziele: null` = ihr Lesen ist gescheitert → gesperrt (siehe
   * zieleNichtGelesen); sonst nur übernommen, wenn seitdem nichts selbst geändert wurde. Liefert der Adapter keine (undefined): unverändert.
   */
  function zieleNachLaden(daten, stand) {
    if (daten?.ziele === null) return zieleNichtGelesen();
    if (daten?.ziele?.unlesbar) return zieleUnlesbarUebernehmen(daten.ziele);
    return !daten?.ziele || zieleOffen.size > 0 || stand !== zieleStand ? kern.state.ziele : zieleZustand(daten.ziele, 'geladen');
  }
  kern.nachNeuLaden(() => {
    const stand = zieleStand;
    return (daten) => ({ ziele: zieleNachLaden(daten, stand) });
  });
  /**
   * Frisch gelesene, aber unlesbare Sparziele gehen immer vor: leer und gesperrt, auch wenn eine eigene Änderung unterwegs ist oder auf
   * die Anmeldung wartet (ihr Speichern würde ohnehin abgelehnt) – die Warteschlange wird geleert.
   */
  function zieleUnlesbarUebernehmen(gelesen) {
    const eintrag = zieleOffen.get('ziele');
    if (eintrag) {
      eintrag.basis = leereZiele();
      eintrag.offen.length = 0;
    }
    return zieleZustand(gelesen, 'geladen');
  }
  /** Ist Ändern gerade verboten? → Meldung oder null (unlesbar, oder nicht (erfolgreich) gelesen). */
  const zieleGesperrt = () => (kern.state.ziele.unlesbar ? TEXT_ZIELE_GESPERRT : kern.state.ziele.status === 'geladen' || kern.state.ziele.status === 'gespeichert' ? null : TEXT_ZIELE_NICHT_GELADEN);
  /**
   * Ändert die Sparziele: `fn(daten)` → neue Daten (rein; siehe domain/sparziele.js). Sofort sichtbar; gespeichert als `fn` auf der
   * NEUESTEN Fassung im Kalender (zwei Telefone überschreiben sich nicht), eines nach dem anderen (eigene Warteschlange, siehe
   * teilAendern). Bei einem Fehler wird nur diese Änderung zurückgenommen und die Sparziele werden neu gelesen. Unlesbare Sparziele
   * werden nie geschrieben. → { ok: true } | { ok: false, fehler } | { ok: false, wartet: true, fehler } (nach dem Anmelden
   * gespeichert); nie ein Wurf (lehnt `fn` schon den angezeigten Stand ab, ändert sich nichts und `fehler` ist seine Meldung).
   */
  async function zieleAendern(fn) {
    const gesperrt = zieleGesperrt();
    if (gesperrt) return { ok: false, fehler: gesperrt };
    if (!adapter.aendereZiele) return { ok: false, fehler: TEXT_FEHLER };
    try {
      fn(kern.state.ziele.daten); // schon am angezeigten Stand abgelehnt: nichts ändern, nichts zählen (ein Laden läuft ungestört weiter)
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER };
    }
    zieleStand += 1;
    try {
      const { ergebnis, fehler } = await teilAendern(zieleOffen, 'ziele', fn, {
        leer: leereZiele,
        aktuell: () => kern.state.ziele.daten,
        // `bestaetigt` = der zuletzt gespeicherte Stand, solange eigene Änderungen offen sind (für den Schnappschuss: eine Änderung, die
        // auf die Anmeldung wartet, lebt nur im Speicher und darf nach einem Neustart nicht als gespeichert erscheinen)
        mit: (daten) => {
          const e = zieleOffen.get('ziele');
          const { bestaetigt: _alt, ...ziele } = kern.state.ziele;
          return { ...kern.state, ziele: e && e.offen.length > 0 ? { ...ziele, daten, bestaetigt: e.basis } : { ...ziele, daten } };
        },
        async speichern(f) {
          try {
            const gespeichert = await adapter.aendereZiele(f);
            // Gespeichert heißt: der Adapter hat die Sparziele eben frisch gelesen (und lesbar gefunden) – eine Sperre nach einem
            // gescheiterten Lesen ('fehler') ist damit aufgehoben.
            if (kern.state.ziele.status !== 'geladen' && kern.state.ziele.status !== 'gespeichert') {
              kern.state = { ...kern.state, ziele: { ...kern.state.ziele, status: 'geladen', warnungen: zieleWarnungen({ daten: gespeichert ?? kern.state.ziele.daten, unlesbar: false }) } };
            }
            return gespeichert;
          } catch (e) {
            // inzwischen (z. B. durch das andere Telefon) unlesbar: der Adapter hat nichts geschrieben; ab jetzt gesperrt und leer
            // gezeigt (auch wenn das folgende neu Lesen scheitert), wartende Änderungen fallen weg (ihr Speichern wird ebenso abgelehnt)
            if (e?.name === 'ZieleGesperrt') {
              FACHLICH.add(e);
              const eintrag = zieleOffen.get('ziele');
              if (eintrag) {
                eintrag.basis = leereZiele();
                eintrag.offen.length = 0;
              }
              kern.state = { ...kern.state, ziele: { ...kern.state.ziele, daten: leereZiele(), unlesbar: true, warnungen: zieleWarnungen({ unlesbar: true }) } };
            }
            throw e;
          }
        },
        async lesen() {
          const g = await adapter.leseZiele();
          kern.state = { ...kern.state, ziele: { ...zieleZustand(g, 'geladen'), daten: kern.state.ziele.daten } };
          return g.daten;
        },
        normalisiere: (daten) => daten ?? leereZiele(),
      });
      if (ergebnis === 'ok') return { ok: true };
      return ergebnis === 'auth' ? { ok: false, wartet: true, fehler } : { ok: false, fehler, gemeldet: true }; // gemeldet: die Meldung steht schon in state.fehler (die Shell zeigt sie)
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER };
    }
  }

  /**
   * Der Kontostand frisch aus dem Kalender – für den Startmonat eines neuen Ziels und die Löschprüfung (das andere Telefon könnte den
   * Monat eben vervollständigt haben); geht das nicht (offline, Demo), der angezeigte.
   */
  async function kontoFrisch() {
    if (!adapter.leseKonto) return kern.state.konto;
    try {
      const { konto } = await adapter.leseKonto();
      return konto ? normalisiereKonto(konto) : kern.state.konto;
    } catch {
      return kern.state.konto;
    }
  }

  /** Eine Kennung für ein neues Ziel oder eine Verschiebung, die noch nicht vergeben ist (auch nicht an fremde Einträge); sonst null. */
  function neueZielKennung() {
    const d = kern.state.ziele.daten;
    const vergeben = new Set([...(d.z ?? []), ...(d.m ?? [])].map((x) => x.id).concat([...(d.fremd?.z ?? []), ...(d.fremd?.m ?? [])].map((k) => k?.i)));
    for (let versuch = 0; versuch < 20; versuch += 1) {
      const id = zielId();
      if (typeof id !== 'string' || id === '') return null; // eingespeiste Kennungen (Tests) sind aufgebraucht
      if (!vergeben.has(id)) return id;
    }
    return null;
  }

  /**
   * Liest nur die Sparziele neu (z. B. nach „konnten nicht geladen werden“ oder beim Öffnen ihrer Seite). Gelingt es, gelten sie als
   * 'geladen' (Ändern wieder möglich); scheitert es, Status 'fehler' (gesperrt) bzw. bei abgelaufener Anmeldung `anmeldungNoetig`
   * (der Stand bleibt). Wurde inzwischen selbst etwas geändert, bleiben die angezeigten Daten (die Antwort könnte älter sein).
   * → true, wenn gelesen; höchstens ein Lesen gleichzeitig; wirft nie.
   */
  function zieleLesenNeu() {
    if (zieleLesenLaeuft) return zieleLesenLaeuft;
    if (!adapter.leseZiele) return Promise.resolve(false);
    zieleLesenLaeuft = (async () => {
      const stand = zieleStand;
      let g;
      try {
        g = await adapter.leseZiele();
      } catch (fehler) {
        kern.state = istAuthFehler(fehler) ? { ...kern.state, anmeldungNoetig: true } : { ...kern.state, ziele: zieleNichtGelesen() };
        melden();
        return false;
      }
      const frisch = zieleZustand(g, 'geladen');
      const eigene = zieleOffen.size > 0 || stand !== zieleStand;
      if (frisch.unlesbar) kern.state = { ...kern.state, ziele: zieleUnlesbarUebernehmen(g) };
      else kern.state = { ...kern.state, ziele: eigene ? { ...frisch, daten: kern.state.ziele.daten, ...(kern.state.ziele.bestaetigt ? { bestaetigt: kern.state.ziele.bestaetigt } : {}) } : frisch };
      melden();
      return true;
    })()
      .catch(() => false)
      .finally(() => {
        zieleLesenLaeuft = null;
      });
    return zieleLesenLaeuft;
  }

  /** Sparziele für die Sicherung: frisch aus dem Kalender (Anmeldefehler laufen nach oben), sonst der angezeigte Stand. → { daten, unlesbar, text }. */
  async function zieleFuerSicherung() {
    if (!adapter.leseZiele) return { daten: kern.state.ziele.daten, unlesbar: kern.state.ziele.unlesbar, text: null };
    const g = await adapter.leseZiele();
    return { daten: g.daten, unlesbar: g.unlesbar === true, text: g.text ?? null };
  }

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

  // ---------------------------------------------------------------- Versicherung
  // Je Teil eine Warteschlange (wie bei den Autos, siehe teilAendern): 'haupt' (fkversicherung: Polizze + erstes Jahr) und
  // 't:<jahr>:<quartal>' (Quartal-Teil fkvr<JJJJ><Q> mit den Rechnungen).
  const versOffen = new Map();
  const versSchreibtNoch = () => versOffen.size > 0;
  let versGelesen = false; // seit dem Start (oder dem Zurücksetzen) schon einmal aus dem Kalender gelesen? Erst dann wird geschrieben.
  let versHolenLaeuft = null; // laufendes Lesen: mehrfaches Anstoßen fragt nur einmal
  let versFrischLaeuft = null; // laufendes Frisch-Lesen vor dem Push-Plan (siehe versicherungFrischLesen)
  const versSchluessel = ({ jahr, quartal }) => `t:${jahr}:${quartal}`;
  const gleicherTeil = (a, b) => a.jahr === b.jahr && a.quartal === b.quartal;
  const versTeilGesperrt = (t) => kern.state.versicherung.unlesbar.teile.some((x) => gleicherTeil(x, t));
  const teilVonRechnung = (r) => ({ jahr: rechnungJahr(r), quartal: rechnungQuartal(r) });
  const quartalText = ({ jahr, quartal }) => `${quartal}. Quartal ${jahr}`;
  /** Der zuletzt GESPEICHERTE Hauptteil (offene eigene Änderungen nicht mitgezählt). */
  const versHauptBasis = () => versOffen.get('haupt')?.basis ?? kern.state.versicherung.daten;

  /** Leert die Warteschlange eines Teils (nach „unlesbar“: ihr Speichern würde ohnehin abgelehnt). */
  function versOffenLeeren(schluessel, basis) {
    const e = versOffen.get(schluessel);
    if (e) {
      e.basis = basis;
      e.offen.length = 0;
    }
  }

  /**
   * `versicherung` mit `bestaetigt` = { daten, teile } (der zuletzt GESPEICHERTE Stand), solange eigene Änderungen offen sind: für den
   * Schnappschuss – eine Änderung, die auf die Anmeldung wartet, darf nach einem Neustart nicht als gespeichert erscheinen.
   */
  function mitVersBestaetigt(v) {
    const { bestaetigt: _alt, ...rest } = v;
    const offen = [...versOffen.entries()].filter(([, e]) => e.offen.length > 0);
    if (offen.length === 0) return rest;
    let daten = rest.daten;
    let teile = rest.teile;
    for (const [schluessel, e] of offen) {
      if (schluessel === 'haupt') daten = e.basis;
      else {
        const [, jahr, quartal] = schluessel.split(':');
        teile = { ...teile, [jahr]: { ...(teile[jahr] ?? {}), [quartal]: e.basis } };
      }
    }
    return { ...rest, bestaetigt: { daten, teile } };
  }

  /** Zustand mit dem Quartal-Teil `t` = `teil` (die anderen bleiben). */
  const mitVersTeil = (t, teil) => ({ ...kern.state, versicherung: mitVersBestaetigt({ ...kern.state.versicherung, teile: { ...kern.state.versicherung.teile, [t.jahr]: { ...(kern.state.versicherung.teile[t.jahr] ?? {}), [t.quartal]: teil } } }) });

  /** Der Hauptteil ist (inzwischen) unlesbar: alles leer und gesperrt. */
  function versHauptSperren() {
    versOffenLeeren('haupt', leereVersicherung());
    kern.state = { ...kern.state, versicherung: { ...kern.state.versicherung, daten: leereVersicherung(), teile: {}, warnungen: versicherungWarnungen({ unlesbar: true }), unlesbar: { main: true, teile: kern.state.versicherung.unlesbar.teile } } };
  }

  /** Ein Quartal-Teil ist (inzwischen) unlesbar: leer gezeigt und gesperrt. */
  function versTeilSperren(t) {
    const leer = leererVersicherungTeil(t.jahr, t.quartal);
    versOffenLeeren(versSchluessel(t), leer);
    const v = kern.state.versicherung;
    const teile = versTeilGesperrt(t) ? v.unlesbar.teile : [...v.unlesbar.teile, { jahr: t.jahr, quartal: t.quartal }];
    kern.state = { ...kern.state, versicherung: { ...v, teile: { ...v.teile, [t.jahr]: { ...(v.teile[t.jahr] ?? {}), [t.quartal]: leer } }, warnungen: [...v.warnungen, ...versicherungTeilWarnungen({ teil: leer, unlesbar: true })], unlesbar: { ...v.unlesbar, teile } } };
  }

  /**
   * Übernimmt frisch Gelesenes (`g` wie aus adapter.leseVersicherung). `eigene` = inzwischen selbst etwas geändert: dann bleiben
   * angezeigter Hauptteil und angezeigte Teile (die Antwort könnte älter sein), neu gefundene Teile kommen dazu. Unlesbares gilt immer
   * (leer, gesperrt). Unverändert Gelesenes behält seine Identität (der Push-Plan vergleicht nach Identität).
   */
  function versUebernehmen(g, eigene) {
    const frisch = versicherungZustand(g, 'geladen');
    if (frisch.unlesbar.main) {
      versOffenLeeren('haupt', leereVersicherung());
      kern.state = { ...kern.state, versicherung: frisch };
      return;
    }
    const v = kern.state.versicherung;
    let teile = frisch.teile;
    let geschrieben = frisch.geschrieben;
    if (eigene) {
      teile = { ...frisch.teile };
      for (const [jahr, quartale] of Object.entries(v.teile)) teile[jahr] = { ...(teile[jahr] ?? {}), ...quartale };
      geschrieben = { ...frisch.geschrieben };
      for (const [jahr, quartale] of Object.entries(v.geschrieben ?? {})) geschrieben[jahr] = { ...(geschrieben[jahr] ?? {}), ...quartale };
    }
    for (const t of frisch.unlesbar.teile) {
      teile = { ...teile, [t.jahr]: { ...(teile[t.jahr] ?? {}), [t.quartal]: leererVersicherungTeil(t.jahr, t.quartal) } };
      versOffenLeeren(versSchluessel(t), leererVersicherungTeil(t.jahr, t.quartal));
    }
    kern.state = {
      ...kern.state,
      versicherung: mitVersBestaetigt({ daten: eigene ? v.daten : gleichOder(v.daten, frisch.daten), teile: historieGleichOder(v.teile, teile), geschrieben: historieGleichOder(v.geschrieben, geschrieben), status: 'geladen', warnungen: gleichOder(v.warnungen, frisch.warnungen), unlesbar: gleichOder(v.unlesbar, frisch.unlesbar), frisch: true }),
    };
  }

  /**
   * Liest Hauptteil und alle Quartal-Teile (ab dem ersten Jahr bis morgen). Status 'laedt' → 'geladen' bzw. 'fehler' (die zuletzt
   * gelesenen Daten bleiben; abgelaufene Anmeldung setzt zusätzlich `anmeldungNoetig`). Mit Frist (api.js kennt kein Timeout): ein
   * hängendes Lesen gilt danach als Fehler und wird beim nächsten Anstoßen wiederholt. → true, wenn gelesen. Höchstens eines gleichzeitig; wirft nicht.
   */
  function versHolen() {
    if (versHolenLaeuft) return versHolenLaeuft;
    if (!adapter.leseVersicherung) return Promise.resolve(false);
    versHolenLaeuft = (async () => {
      const stand = kern.schreibStand;
      kern.state = { ...kern.state, versicherung: { ...kern.state.versicherung, status: 'laedt' } };
      melden();
      let g;
      try {
        g = await mitFrist(adapter.leseVersicherung(), versicherungFristMs);
      } catch (fehler) {
        kern.state = { ...kern.state, versicherung: { ...kern.state.versicherung, status: 'fehler', frisch: false, warnungen: [TEXT_VERSICHERUNG_NICHT_GELESEN] }, ...(istAuthFehler(fehler) ? { anmeldungNoetig: true } : {}) };
        melden();
        return false;
      }
      versUebernehmen(g, stand !== kern.schreibStand || kern.schreibend > 0 || wartend.length > 0 || versSchreibtNoch());
      versGelesen = true;
      melden();
      return true;
    })()
      .catch(() => false)
      .finally(() => {
        versHolenLaeuft = null;
      });
    return versHolenLaeuft;
  }

  /** Vor dem Schreiben: einmal gelesen und der Hauptteil lesbar? → Fehlertext oder null. */
  async function versBereit() {
    if (!adapter.aendereVersicherung) return TEXT_FEHLER;
    if (!versGelesen && !(await versHolen())) return kern.state.anmeldungNoetig ? TEXT_VERSICHERUNG_ANMELDEN : TEXT_VERSICHERUNG_NICHT_GELESEN;
    return kern.state.versicherung.unlesbar.main ? TEXT_VERSICHERUNG_GESPERRT : null;
  }

  /** Ändert den Hauptteil (siehe teilAendern) mit `fn(daten)`; → wie teilErgebnis. Wirft, wenn `fn` schon am angezeigten Stand ablehnt. */
  async function versHauptAendern(fn) {
    return teilErgebnis(
      await teilAendern(versOffen, 'haupt', fn, {
        leer: leereVersicherung,
        aktuell: () => kern.state.versicherung.daten,
        mit: (daten) => ({ ...kern.state, versicherung: mitVersBestaetigt({ ...kern.state.versicherung, daten }) }),
        async speichern(f) {
          try {
            return await adapter.aendereVersicherung(f);
          } catch (e) {
            if (e?.name === 'VersicherungGesperrt') {
              FACHLICH.add(e);
              versHauptSperren();
            }
            throw e;
          }
        },
        async lesen() {
          const g = await adapter.leseVersicherung();
          if (g.unlesbar?.main) {
            versHauptSperren();
            return null;
          }
          return g.daten;
        },
        normalisiere: (d) => d ?? leereVersicherung(),
      }),
    );
  }

  /**
   * Vor dem Schreiben eines Quartal-Teils: kennt der zuletzt GESPEICHERTE Hauptteil sein Jahr? Sonst zuerst dort eintragen – in DEMSELBEN
   * Schreibvorgang wie der Teil (auch beim Nachholen nach der Anmeldung): scheitert das, wird der Teil nicht geschrieben; es entsteht nie
   * ein Teil vor dem ersten Jahr (er würde nie gelesen).
   */
  async function versJahrSichern(jahr) {
    const e = versOffen.get('haupt');
    if (versicherungJahrBekannt(e?.basis ?? kern.state.versicherung.daten, jahr)) return;
    let gespeichert;
    try {
      gespeichert = await adapter.aendereVersicherung(fachlich((d) => versicherungJahrEintragen(d, jahr)));
    } catch (fehler) {
      if (fehler?.name === 'VersicherungGesperrt') {
        FACHLICH.add(fehler);
        versHauptSperren();
      }
      throw fehler;
    }
    if (!gespeichert) return;
    if (e) e.basis = gespeichert;
    else kern.state = { ...kern.state, versicherung: { ...kern.state.versicherung, daten: gleichOder(kern.state.versicherung.daten, gespeichert) } };
  }

  /**
   * Ändert NUR den Quartal-Teil `t` = { jahr, quartal } mit `fn(teil)`; → wie teilErgebnis. Wirft wie versHauptAendern. `vorher()`
   * (optional, async) läuft in jedem Schreibvorgang (auch beim Nachholen) vor dem Schreiben und darf fachlich ablehnen.
   */
  async function versTeilAendern(t, fn, { vorher = null } = {}) {
    return teilErgebnis(
      await teilAendern(versOffen, versSchluessel(t), fn, {
        leer: () => leererVersicherungTeil(t.jahr, t.quartal),
        aktuell: () => kern.state.versicherung.teile[t.jahr]?.[t.quartal] ?? null,
        mit: (teil) => mitVersTeil(t, teil),
        async speichern(f) {
          try {
            if (vorher) await vorher();
            await versJahrSichern(t.jahr);
            return await adapter.aendereVersicherungTeil(t.jahr, t.quartal, f);
          } catch (e) {
            if (e?.name === 'VersicherungTeilGesperrt') {
              FACHLICH.add(e);
              versTeilSperren(t);
            }
            throw e;
          }
        },
        async lesen() {
          const g = await adapter.leseVersicherungTeil(t.jahr, t.quartal);
          if (g.unlesbar) {
            versTeilSperren(t);
            return null;
          }
          return g.teil;
        },
        normalisiere: (teil) => teil ?? leererVersicherungTeil(t.jahr, t.quartal),
      }),
    );
  }

  /**
   * Ändert den Quartal-Teil `t` mit `fn(teil)`. Kennt der zuletzt GESPEICHERTE Hauptteil das Jahr noch nicht, wird es zuerst dort
   * eingetragen und erst danach der Teil geschrieben (beim Nachholen sichert das versJahrSichern im Teil selbst). Gesperrt (unlesbar)
   * → Meldung. `optionen` siehe versTeilAendern. → wie teilErgebnis; wirft nie.
   */
  async function versInTeilAendern(t, fn, optionen) {
    if (versTeilGesperrt(t)) return { ok: false, fehler: TEXT_VERSICHERUNG_TEIL_GESPERRT };
    try {
      if (!versicherungJahrBekannt(versHauptBasis(), t.jahr)) {
        const r = await versHauptAendern((d) => versicherungJahrEintragen(d, t.jahr));
        if (!r.ok && !r.wartet) return r;
      }
      return await versTeilAendern(t, fn, optionen);
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER }; // schon am angezeigten Stand abgelehnt: nichts geändert
    }
  }

  /** Änderung am Hauptteil für die Oberfläche: erst bereit, dann `fn`; nie ein Wurf. */
  async function versHauptSicher(fn) {
    const nichtBereit = await versBereit();
    if (nichtBereit) return { ok: false, fehler: nichtBereit };
    try {
      return await versHauptAendern(fn);
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER }; // schon am angezeigten Stand abgelehnt: nichts geändert
    }
  }

  /** Wo steht die Rechnung `id` im angezeigten Stand? (rechnungFinden: gültige Fassung, ihr Teil, weitere Fassungen) */
  const versRechnungFinden = (id) => rechnungFinden(kern.state.versicherung.teile, id, { geschrieben: kern.state.versicherung.geschrieben });

  /** Alle vergebenen Kennungen von Rechnungen in allen angezeigten Teilen (auch fremde und doppelte). */
  function rechnungKennungen() {
    const ids = new Set();
    for (const quartale of Object.values(kern.state.versicherung.teile)) {
      for (const teil of Object.values(quartale ?? {})) {
        for (const r of teil?.rechnungen ?? []) ids.add(r.id);
        for (const k of teil?.fremd?.r ?? []) ids.add(k?.i);
      }
    }
    return ids;
  }

  /** Kennungen der Kategorien, auf die eine Rechnung in einem angezeigten Teil zeigt (auch fremde Rechnungen, roh mit `k`). */
  function benutzteKategorien() {
    const ids = new Set();
    for (const quartale of Object.values(kern.state.versicherung.teile)) {
      for (const teil of Object.values(quartale ?? {})) {
        for (const r of teil?.rechnungen ?? []) ids.add(r.kategorie);
        for (const k of teil?.fremd?.r ?? []) ids.add(k?.k);
      }
    }
    return ids;
  }

  /** Neue Kennung (über `versicherungId`, 0-9a-v), die in `vergeben` noch nicht vorkommt; sonst null. */
  function neueVersKennung(vergeben) {
    for (let versuch = 0; versuch < 20; versuch += 1) {
      const id = versicherungId();
      if (typeof id !== 'string' || id === '') return null;
      if (!vergeben.has(id)) return id;
    }
    return null;
  }

  /**
   * Steht die Rechnung `id` (frisch gelesen) im Teil `t`? Sonst fachliche Ablehnung mit `text` – für die Schritte beim Verschieben.
   * `merke(fassung)` bekommt die frisch gelesene Fassung (fehlend = −1), auch beim Nachholen nach der Anmeldung (Fix-Runde 2).
   */
  const rechnungSteht = (id, t, text, merke = null) =>
    fachlichAsync(async () => {
      const g = await adapter.leseVersicherungTeil(t.jahr, t.quartal);
      const x = (g.teil?.rechnungen ?? []).find((r) => r.id === id);
      if (!x) throw Object.assign(new Error(text), { fachlich: true });
      merke?.(fassungVon(x));
    });

  /**
   * Nach einem gescheiterten Schreiben einer Rechnung (abgelehnt oder Netzfehler; nicht „wartet auf die Anmeldung“) ALLES neu lesen,
   * nicht nur den einen Teil (Fix-Runde 3 Task 2): sonst stünde eine alte Kopie aus einem anderen Quartal als die Rechnung da – das
   * andere Telefon hat sie vielleicht gerade dorthin verschoben – und das nächste Ändern schriebe ihren veralteten Inhalt über die
   * gültige Fassung. → `r` unverändert.
   */
  async function versNachFehlerLesen(r) {
    if (!r.ok && !r.wartet) await versHolen();
    return r;
  }

  /** Eine Meldung, die die Shell zeigt (auch wenn sie gleich lautet wie die vorige). */
  function versMelden(text) {
    kern.fehlerNr += 1;
    kern.state = { ...kern.state, fehler: text, fehlerNr: kern.fehlerNr };
    melden();
  }

  const fassungVon = (r) => (Number.isInteger(r?.fassung) ? r.fassung : -1);

  /**
   * Weitere Fassungen der Rechnung `id` (siehe rechnungFinden: abgebrochenes Verschieben, alte Kopie) in den Teilen `weitere` entfernen –
   * beim nächsten Ändern dieser Rechnung. Unlesbare Teile bleiben unberührt. Mit `gueltigIn` (der eben geschriebene Teil, Review I1)
   * prüft jeder Schreibvorgang – auch beim Nachholen nach der Anmeldung – frisch, dass die gültige Fassung dort noch steht, und entfernt
   * eine Kopie nur, wenn sie nicht neuer ist als diese (das andere Telefon könnte sie gerade dorthin verschoben haben). Ohne `gueltigIn`
   * (Löschen, das der Nutzer will) wird ohne Prüfung entfernt. Scheitert es, zählt sie trotzdem nur einmal (Meldung).
   */
  async function versKopienEntfernen(id, weitere, { gueltigIn = null } = {}) {
    for (const t of weitere) {
      if (versTeilGesperrt(t)) continue;
      // bis zum frischen Lesen: die angezeigte Fassung im eben geschriebenen Teil
      let gueltig = gueltigIn ? fassungVon((kern.state.versicherung.teile[gueltigIn.jahr]?.[gueltigIn.quartal]?.rechnungen ?? []).find((r) => r.id === id)) : Infinity;
      const vorher = gueltigIn
        ? fachlichAsync(async () => {
            const g = await adapter.leseVersicherungTeil(gueltigIn.jahr, gueltigIn.quartal);
            const x = (g.teil?.rechnungen ?? []).find((r) => r.id === id);
            if (!x) throw Object.assign(new Error(TEXT_KOPIE_GEAENDERT), { fachlich: true });
            gueltig = fassungVon(x);
          })
        : null;
      const entfernen = (teil) => {
        const x = (teil.rechnungen ?? []).find((r) => r.id === id);
        return !x || fassungVon(x) >= gueltig ? teil : rechnungLoeschenRein(teil, id); // nicht älter als die gültige (gleichzeitig geändert): sie bleibt
      };
      const r = await versTeilAendern(t, entfernen, { vorher }).catch(() => ({ ok: false }));
      if (!r.ok && !r.wartet) {
        if (r.fehler === TEXT_KOPIE_GEAENDERT) await versHolen(); // die Meldung steht schon da; den neuesten Stand zeigen
        else versMelden(`Gespeichert. Eine alte Kopie der Rechnung im ${quartalText(t)} konnte nicht entfernt werden – sie zählt nicht doppelt und wird beim nächsten Ändern entfernt.`);
        return;
      }
    }
  }

  /**
   * Versicherung für die Sicherung: frisch aus dem Kalender (Anmeldefehler laufen nach oben), dazu roh alle Quartal-Teile, die nicht
   * gelesen wurden (`weitereTeile`); ohne passenden Adapter der angezeigte Stand.
   */
  async function versicherungFuerSicherung() {
    const v = kern.state.versicherung;
    if (!adapter.leseVersicherung) return { daten: v.daten, teile: v.teile, geschrieben: v.geschrieben, rohtexte: [], weitereTeile: [] };
    const g = adapter.leseVersicherungSicherung ? await adapter.leseVersicherungSicherung() : await adapter.leseVersicherung();
    return { daten: g.daten, teile: g.teile, geschrieben: g.geschrieben ?? {}, rohtexte: g.rohtexte ?? [], weitereTeile: g.weitereTeile ?? [] };
  }

  /**
   * „Beispieldaten entfernen“ für die Versicherung: erst jeden Quartal-Teil mit Rechnungen leeren (fremde Einträge bleiben), dann die
   * Polizze (das erste Jahr bleibt nur, wenn ein Teil noch Fremdes trägt oder unlesbar ist). Unlesbares bleibt unangetastet. Wirft mit
   * deutscher Meldung, wenn etwas scheitert.
   */
  async function versicherungLeeren() {
    const nichtBereit = await versBereit();
    if (nichtBereit === TEXT_VERSICHERUNG_GESPERRT) return;
    if (nichtBereit) throw new Error(nichtBereit);
    const pruefe = (r) => {
      if (!r.ok && !r.wartet) throw new Error(r.fehler ?? TEXT_FEHLER);
    };
    let bleibt = kern.state.versicherung.unlesbar.teile.length > 0;
    for (const quartale of Object.values(kern.state.versicherung.teile)) {
      for (const teil of Object.values(quartale ?? {})) {
        const t = { jahr: teil.jahr, quartal: teil.quartal };
        if (teil.fremd) bleibt = true;
        if (versTeilGesperrt(t) || (teil.rechnungen ?? []).length === 0) continue;
        pruefe(await versTeilAendern(t, (x) => (x.fremd ? { ...leererVersicherungTeil(t.jahr, t.quartal), fremd: x.fremd } : leererVersicherungTeil(t.jahr, t.quartal))));
      }
    }
    if (!kern.state.versicherung.daten.polizze) return;
    pruefe(await versHauptAendern((d) => ({ ...leereVersicherung(), ab: bleibt ? d.ab : null })));
  }

  const kalenderScheibe = createKalenderSlice(kern, { store });
  const { geladeneBereiche } = kalenderScheibe.intern;
  const kontoScheibe = createEinkaufKontoSlice(kern);
  const { kontoAendern } = kontoScheibe.intern;
  const fixScheibe = createFixkostenSlice(kern, { store, fixId });
  const { fixLesen, fixBereit, fixGesperrt, fixTeilAendern, fixFuerSicherung } = fixScheibe.intern;
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
        const zStand = zieleStand;
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
      if (versGelesen && adapter.leseVersicherung) await versHolen();
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

    /**
     * Sparziel anlegen (ohne `id`: neue Kennung, Startmonat `erstellt` = startMonat(heute, Kontostand) – der laufende Monat, oder der
     * nächste, wenn der Kontostand dieses Monats schon komplett ist) oder ändern (mit `id`: Name, Symbol, Betrag, Datum, vorläufig;
     * Startmonat und Abschluss bleiben, wie sie im Kalender stehen). `erstellt`, `beendet` und `aus` aus dem Entwurf werden nie
     * übernommen. Hat das andere Telefon das Ziel inzwischen gelöscht, wird es nicht wieder angelegt.
     * → { ok: true, id } | { ok: false, fehler } (Meldung der Prüfung, gesperrt, Speicherfehler – dann zurückgenommen und neu gelesen) |
     * { ok: false, wartet: true, fehler } (nach dem Anmelden gespeichert). Wirft nie.
     */
    async zielSpeichern(entwurf) {
      const heute = todayVienna(jetzt());
      const { erstellt: _e, beendet: _b, aus: _a, ...roh } = istObjekt(entwurf) ? entwurf : {};
      const gesperrt = zieleGesperrt();
      if (gesperrt) return { ok: false, fehler: gesperrt };
      if (roh.id) {
        const r = await zieleAendern((d) => (zielVorhanden(d, roh.id), zielSetzen(d, roh, { heute })));
        return r.ok ? { ok: true, id: roh.id } : r;
      }
      const id = neueZielKennung();
      if (!id) return { ok: false, fehler: TEXT_FEHLER };
      const ziel = { ...roh, id, erstellt: startMonat(heute, await kontoFrisch()) };
      const r = await zieleAendern((d) => zielSetzen(d, ziel, { heute }));
      return r.ok ? { ok: true, id } : r;
    },

    /**
     * Ziel von Hand beenden ab dem laufenden Monat: `art` 'ausgegeben' (vom Konto bezahlt) oder 'frei' (es geht zu „Frei verfügbar“).
     * Ein schon abgeschlossenes Ziel → Meldung (für ein automatisch abgeschlossenes siehe `zielZurueckZuFrei`). Ergebnis wie
     * `zielSpeichern` (ohne id).
     */
    zielBeenden(id, art) {
      const monat = todayVienna(jetzt()).slice(0, 7);
      return zieleAendern((d) => {
        const z = zielVorhanden(d, id);
        if (zielSchluss(z).monat <= monat) throw new Error(TEXT_ZIEL_ABGESCHLOSSEN);
        return zielBeendenRein(d, id, { monat, art });
      });
    },

    /**
     * „Doch nicht ausgegeben – zurück zu Frei“: ein nur AUTOMATISCH abgeschlossenes Ziel (Zielmonat vorbei) gibt sein Gespartes ab seinem
     * Abschlussmonat an „Frei“ (`beendet` = { Abschlussmonat, 'frei' }). Sonst → Meldung. Ergebnis wie `zielBeenden`.
     */
    zielZurueckZuFrei(id) {
      const monat = todayVienna(jetzt()).slice(0, 7);
      return zieleAendern((d) => {
        const z = zielVorhanden(d, id);
        const schluss = zielSchluss(z);
        if (!schluss.automatisch || schluss.monat > monat) throw new Error(TEXT_NICHT_AUTOMATISCH);
        return zielBeendenRein(d, id, { monat: schluss.monat, art: 'frei' });
      });
    },

    /**
     * Ziel löschen (domain zielLoeschArt). Ein laufendes Ziel geht immer: hat es Geld bekommen, wird es im laufenden Monat „gelöscht“
     * abgeschlossen (sein Gespartes geht zu Frei, die Vergangenheit bleibt); hat es keine Spur hinterlassen, wird es wirklich entfernt.
     * Ein abgeschlossenes Ziel geht nur, wenn es nie Geld bekommen hat (sonst TEXT_NICHT_LOESCHBAR: nur ausblenden). Geprüft mit dem
     * frisch gelesenen Kontostand (das andere Telefon könnte den Monat eben vervollständigt haben). Ergebnis wie `zielBeenden`, bei Erfolg mit
     * `rueckgaengig()`: holt genau das Gelöschte (Ziel und seine Verschiebungen, wie sie im Kalender standen) zurück.
     */
    async zielLoeschen(id) {
      const heute = todayVienna(jetzt());
      const konto = await kontoFrisch();
      let spur = null;
      const r = await zieleAendern((d) => {
        zielVorhanden(d, id);
        const s = zielSpur(d, id);
        const neu = zielLoeschenRein(d, id, { heute, konto });
        spur = s; // auf der neuesten Fassung: das wirklich Gelöschte
        return neu;
      });
      return mitRueckgaengig(r, spur ? () => store.zielWiederherstellen(spur) : null);
    },

    /**
     * „Rückgängig“ nach zielLoeschen: `spur` (siehe domain zielSpur) zurück – über den normalen Speicherweg mit allen Sperren und
     * Prüfungen (höchstens 20 laufende, Platz, Einträge einer neueren Version). Ergebnis wie `zielBeenden`.
     */
    zielWiederherstellen(spur) {
      const heute = todayVienna(jetzt());
      return zieleAendern((d) => zielWiederherstellenRein(d, spur, { heute }));
    },

    /**
     * Eine Verschiebung aus „Frei“ rückgängig machen (nur zu einem noch laufenden Ziel): ihr Geld geht über die Rechnung zurück zu „Frei“.
     * Gleiche Sperren wie jede Änderung der Sparziele (unlesbar, nicht geladen). → { ok: true, rueckgaengig } | sonst wie `zielBeenden`;
     * `rueckgaengig()` bringt die Verschiebung unverändert an ihre Stelle zurück.
     */
    async verschiebungLoeschen(id) {
      const heute = todayVienna(jetzt());
      let spur = null;
      const r = await zieleAendern((d) => {
        const stelle = (d.m ?? []).findIndex((v) => v.id === id);
        if (stelle < 0) throw new Error((d.fremd?.m ?? []).some((k) => k?.i === id) ? TEXT_VERSCHIEBUNG_NEUER : TEXT_VERSCHIEBUNG_WEG);
        const neu = verschiebungLoeschenRein(d, id, { heute });
        spur = { verschiebung: d.m[stelle], stelle };
        return neu;
      });
      return mitRueckgaengig(r, spur ? () => store.verschiebungWiederherstellen(spur) : null);
    },

    /** „Rückgängig“ nach verschiebungLoeschen (`spur` = { verschiebung, stelle }); Ergebnis wie `zielBeenden`. */
    verschiebungWiederherstellen(spur) {
      const heute = todayVienna(jetzt());
      return zieleAendern((d) => verschiebungWiederherstellenRein(d, spur, { heute }));
    },

    /** Abgeschlossenes Ziel im Verlauf ausblenden (`an` = true) oder wieder einblenden (false); nur Anzeige. Ergebnis wie `zielBeenden`. */
    zielAusblenden(id, an = true) {
      const heute = todayVienna(jetzt());
      return zieleAendern((d) => (zielVorhanden(d, id), zielAusblendenRein(d, id, an, { heute })));
    },

    /**
     * `cents` aus „Frei verfügbar“ zum Ziel `ziel` verschieben, wirksam im laufenden Monat; gedeckelt auf das verfügbare „Frei“ und den
     * noch offenen Betrag (Rechnung mit dem angezeigten Kontostand). → { ok: true, id, cents (tatsächlich verschoben) } | sonst wie
     * `zielSpeichern`.
     */
    async freiVerschieben(ziel, cents) {
      const heute = todayVienna(jetzt());
      const konto = kern.state.konto;
      const gesperrt = zieleGesperrt();
      if (gesperrt) return { ok: false, fehler: gesperrt };
      const id = neueZielKennung();
      if (!id) return { ok: false, fehler: TEXT_FEHLER };
      const r = await zieleAendern((d) => (zielVorhanden(d, ziel), zielFreiVerschieben(d, { id, monat: heute.slice(0, 7), ziel, cents }, { konto, heute })));
      if (!r.ok) return r;
      return { ok: true, id, cents: kern.state.ziele.daten.m.find((v) => v.id === id)?.cents ?? cents };
    },

    /** Nur die Sparziele neu lesen (siehe `zieleLesenNeu`): hebt die Sperre nach einem gescheiterten Lesen auf. → true, wenn gelesen; wirft nie. */
    zieleLaden: () => zieleLesenNeu(),

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

    /** Versicherung (Polizze und alle Quartal-Teile) neu lesen, z. B. beim Öffnen ihrer Ansicht. → { ok: true } | { ok: false, fehler }; wirft nie. */
    async versicherungLaden() {
      if (await versHolen()) return { ok: true };
      return { ok: false, fehler: kern.state.anmeldungNoetig ? TEXT_VERSICHERUNG_ANMELDEN : TEXT_VERSICHERUNG_NICHT_GELESEN };
    },

    /**
     * Versicherung frisch aus dem Kalender vor dem Senden des Push-Plans (siehe `schichtFrischLesen`, wie `autosFrischLesen`): eigene
     * Änderungen gehen vor, gemeldet wird nur eine echte Änderung. → true = aktuell, false = ging gerade nicht. Wirft nicht.
     */
    versicherungFrischLesen() {
      if (versFrischLaeuft) return versFrischLaeuft;
      const moeglich = () => adapter.leseVersicherung && kern.state.geladen && !kern.state.nurSnapshot && !kern.state.anmeldungNoetig;
      const eigene = () => kern.schreibend > 0 || wartend.length > 0 || versSchreibtNoch();
      if (!moeglich() || eigene()) return Promise.resolve(false);
      versFrischLaeuft = (async () => {
        const stand = kern.schreibStand;
        let g;
        try {
          g = await mitFrist(adapter.leseVersicherung(), versicherungFristMs);
        } catch (fehler) {
          kern.state = { ...kern.state, versicherung: { ...kern.state.versicherung, frisch: false }, ...(istAuthFehler(fehler) ? { anmeldungNoetig: true } : {}) };
          melden();
          return false;
        }
        if (stand !== kern.schreibStand || eigene()) return false;
        const vorher = kern.state;
        versUebernehmen(g, false);
        versGelesen = true;
        if (JSON.stringify(kern.state.versicherung) !== JSON.stringify(vorher.versicherung)) melden();
        else kern.state = vorher; // nichts geändert: derselbe Zustand (kein Neuzeichnen, kein neuer Push-Plan)
        return true;
      })()
        .catch(() => false)
        .finally(() => {
          versFrischLaeuft = null;
        });
      return versFrischLaeuft;
    },

    /**
     * Polizze anlegen oder ändern. Gibt es noch keine (angezeigt): anlegen – fehlt `id`, vergibt sie der Store (z. B. für das Ergebnis
     * von polizzeAusVorlage ohne Kennung oder eine „Eigene Polizze“). Hat das andere Telefon inzwischen schon eine angelegt, gilt die
     * zuerst gespeicherte (sie wird gezeigt) und das Ergebnis ist { ok: false, fehler }. Gibt es eine: ändern (gleiche `id`, sonst
     * TEXT_POLIZZE_WEG). Eine Kategorie, auf die noch Rechnungen zeigen, lässt sich nicht entfernen (C4).
     * → { ok: true, id } | { ok: false, fehler, gemeldet? } | { ok: false, wartet: true, fehler }. Wirft nie.
     */
    async polizzeSpeichern(eingabe) {
      const x = istObjekt(eingabe) ? eingabe : {};
      const nichtBereit = await versBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const alt = kern.state.versicherung.daten.polizze;
      if (!alt) {
        const id = x.id ?? neueVersKennung(new Set());
        if (!id) return { ok: false, fehler: TEXT_FEHLER };
        const r = await versHauptSicher((d) => polizzeAnlegen(d, { ...x, id }));
        if (!r.ok) return r;
        return kern.state.versicherung.daten.polizze?.id === id ? { ok: true, id } : { ok: false, fehler: TEXT_POLIZZE_SCHON_DA };
      }
      if (x.id !== alt.id) return { ok: false, fehler: TEXT_POLIZZE_WEG };
      const bleiben = new Set((Array.isArray(x.kategorien) ? x.kategorien : []).map((k) => k?.id));
      const entfernt = alt.kategorien.filter((k) => !bleiben.has(k.id));
      if (entfernt.length > 0) {
        if (kern.state.versicherung.unlesbar.teile.length > 0) return { ok: false, fehler: TEXT_KATEGORIE_UNPRUEFBAR };
        const benutzt = benutzteKategorien();
        const k = entfernt.find((e) => benutzt.has(e.id));
        if (k) return { ok: false, fehler: `Die Kategorie „${k.name}“ hat noch Rechnungen – bitte diese zuerst einer anderen Kategorie zuordnen oder löschen.` };
      }
      const r = await versHauptSicher((d) => polizzeAendern(d, x));
      return r.ok ? { ok: true, id: alt.id } : r;
    },

    /**
     * Rechnung einreichen (ohne `id`: neue Kennung) oder ändern (mit `id`). `entwurf` = { kategorie, datum, betragCent, eingereichtAm,
     * erstattetCent?, erstattetAm?, stelle?, notiz? }; „heute“ (Wiener Datum) bestimmt der Store; die Kategorie muss zur Polizze gehören.
     * Geschrieben wird NUR der Quartal-Teil des Rechnungsdatums (und, ist das Jahr neu, vorher das erste Jahr im Hauptteil), als reine
     * Änderung auf der neuesten Fassung: zwei Telefone behalten beide Rechnungen. Liegt das neue Datum in einem anderen Quartal (oder
     * Jahr) als die Rechnung steht: rechnungTeilWechseln – 1) Jahr im Hauptteil, 2) im neuen Teil eintragen (nur, wenn sie im alten noch
     * steht), 3) im alten löschen (nur, wenn sie im neuen gespeichert ist); scheitert 3, sagt die Meldung, wo sie jetzt steht (gezählt
     * wird sie einmal). Weitere Fassungen derselben Rechnung (rechnungFinden(…).weitere) werden danach entfernt.
     * → { ok: true, id, warnung } (warnung = Hinweis aus rechnungPruefen oder null) | { ok: false, fehler, gemeldet? } |
     * { ok: false, wartet: true, fehler }. Wirft nie.
     */
    async rechnungSpeichern(entwurf) {
      const heute = todayVienna(jetzt());
      const x = istObjekt(entwurf) ? entwurf : {};
      const nichtBereit = await versBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const polizze = kern.state.versicherung.daten.polizze;
      if (!polizze) return { ok: false, fehler: TEXT_KEINE_POLIZZE };
      const f = x.id == null ? null : versRechnungFinden(x.id);
      if (x.id != null && !f) return { ok: false, fehler: TEXT_RECHNUNG_WEG };
      const id = x.id ?? neueVersKennung(rechnungKennungen());
      if (!id) return { ok: false, fehler: TEXT_FEHLER };
      // Fassung: die der gültigen Fassung (rechnungSetzen macht daraus die nächste, mindestens „jetzt“), nie die aus dem Entwurf
      const { fassung: _f, ...ohneFassung } = x;
      const rechnung = { ...ohneFassung, id, ...(Number.isInteger(f?.rechnung.fassung) ? { fassung: f.rechnung.fassung } : {}) };
      const fassung = fassungJetzt(jetzt());
      const { fehler, warnung } = rechnungPruefen(rechnung, { heute, polizze });
      if (fehler) return { ok: false, fehler };
      const nach = teilVonRechnung(rechnung);
      const von = f?.von ?? null;
      if (versTeilGesperrt(nach) || (von && versTeilGesperrt(von))) return { ok: false, fehler: TEXT_VERSICHERUNG_TEIL_GESPERRT };
      const ok = async (r) => {
        if (r.ok && f) await versKopienEntfernen(id, f.weitere.filter((w) => !gleicherTeil(w, nach) && !gleicherTeil(w, von)), { gueltigIn: nach });
        return r.ok ? { ok: true, id, warnung } : r;
      };
      if (!von || gleicherTeil(von, nach)) {
        const setzen = von ? (t) => (eintragVorhanden(t.rechnungen, t.fremd?.r, id, TEXT_RECHNUNG_WEG), rechnungSetzen(t, rechnung, { heute, polizze, fassung })) : (t) => rechnungSetzen(t, rechnung, { heute, polizze, fassung });
        return ok(await versNachFehlerLesen(await versInTeilAendern(nach, setzen)));
      }
      // Verschieben (Review Focus 2): jeder Schritt prüft in seinem eigenen Schreibvorgang (auch beim Nachholen nach der Anmeldung), dass
      // der andere passt – eingetragen wird nur, was im alten Teil noch steht, gelöscht nur, was im neuen schon gespeichert ist.
      let plan;
      try {
        plan = rechnungTeilWechseln(rechnung, von, { heute, polizze, daten: versHauptBasis(), fassung });
      } catch (e) {
        return { ok: false, fehler: e?.message || TEXT_FEHLER };
      }
      if (plan.jahrEintragen !== null) {
        const j = await versHauptSicher((d) => versicherungJahrEintragen(d, plan.jahrEintragen));
        if (!j.ok && !j.wartet) return j;
      }
      // Schritt 2: neuer als die frisch gelesene Fassung im alten Teil (Fix-Runde 2 a) – ein Verschieben ersetzt nie eine neuere Fassung
      let vonFrisch;
      const r = await versInTeilAendern(plan.nach, (t) => plan.inNeu(t, { vorigeFassung: vonFrisch }), { vorher: rechnungSteht(id, von, TEXT_RECHNUNG_WEG, (f) => (vonFrisch = f)) });
      if (!r.ok && !r.wartet) {
        await versHolen(); // z. B. inzwischen gelöscht: auch der alte Teil soll den neuesten Stand zeigen
        return r;
      }
      const nichtImNeuen = `Die Rechnung steht nicht mehr im ${quartalText(plan.nach)} (wohl auf dem anderen Telefon geändert oder gelöscht) – im ${quartalText(von)} bleibt sie stehen. Bitte noch einmal ansehen.`;
      // Schritt 3: die alte Fassung nur löschen, wenn sie älter ist als die frisch gelesene im neuen Teil (Fix-Runde 2 b); sonst bleibt sie
      const altGeaendert = `Die Rechnung wurde inzwischen auf dem anderen Telefon geändert – sie steht jetzt im ${quartalText(plan.nach)} und im ${quartalText(von)}. Bitte noch einmal ansehen.`;
      let nachFrisch = fassungVon((kern.state.versicherung.teile[plan.nach.jahr]?.[plan.nach.quartal]?.rechnungen ?? []).find((x) => x.id === id));
      const ausAlt = (t) => {
        const neu = plan.ausAlt(t, { nurAelterAls: nachFrisch });
        if (neu === t && (t.rechnungen ?? []).some((x) => x.id === id)) throw new Error(altGeaendert);
        return neu;
      };
      const weg = await versInTeilAendern(von, ausAlt, { vorher: rechnungSteht(id, plan.nach, nichtImNeuen, (f) => (nachFrisch = f)) });
      if (r.wartet) {
        if (weg.ok || weg.wartet) return r;
        // Schritt 2 wartet auf die Anmeldung, Schritt 3 fand sie darum (noch) nicht im neuen Teil (Review M2 a)
        const text = `Bitte neu anmelden: danach steht die Rechnung im ${quartalText(plan.nach)}. Die alte Fassung im ${quartalText(von)} zählt nicht mit und wird beim nächsten Speichern entfernt.`;
        versMelden(text);
        return { ...r, fehler: text };
      }
      if (weg.ok) return ok(weg);
      if (weg.wartet) return weg;
      if (weg.fehler === nichtImNeuen || weg.fehler === altGeaendert) {
        await versHolen(); // Review M2 b: die Meldung der Prüfung stimmt und steht schon da; den neuesten Stand zeigen
        return weg;
      }
      const text = `Die Rechnung steht jetzt im ${quartalText(plan.nach)}, im ${quartalText(von)} konnte die alte Fassung aber nicht entfernt werden – sie zählt nicht mit und wird beim nächsten Speichern entfernt.`;
      versMelden(text);
      return { ok: false, fehler: text, gemeldet: true };
    },

    /**
     * „Erstattung erhalten“: setzt NUR erstattetCent und erstattetAm der Rechnung `id` (`erstattung` = { erstattetCent, erstattetAm }; null
     * entfernt die Erstattung) auf der neuesten Fassung ihres Teils – was das andere Telefon an ihr geändert hat, bleibt. Eine falsch
     * abgelegte Rechnung wandert dabei an ihren richtigen Ort (wie rechnungSpeichern). → { ok: true, warnung } | wie rechnungSpeichern.
     */
    async erstattungSpeichern(id, erstattung) {
      const heute = todayVienna(jetzt());
      const nichtBereit = await versBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const f = versRechnungFinden(id);
      if (!f) return { ok: false, fehler: TEXT_RECHNUNG_WEG };
      const { erstattetCent: _c, erstattetAm: _a, ...ohne } = f.rechnung;
      const e = erstattung === null ? null : { erstattetCent: erstattung?.erstattetCent, erstattetAm: erstattung?.erstattetAm };
      const neu = e ? { ...ohne, ...e } : ohne;
      if (!f.richtig) {
        const r = await store.rechnungSpeichern(neu);
        return r.ok ? { ok: true, warnung: r.warnung } : r;
      }
      const { fehler, warnung } = rechnungPruefen(neu, { heute });
      if (fehler) return { ok: false, fehler };
      if (versTeilGesperrt(f.von)) return { ok: false, fehler: TEXT_VERSICHERUNG_TEIL_GESPERRT };
      const r = await versNachFehlerLesen(await versInTeilAendern(f.von, (t) => erstattungSetzen(t, id, e, { heute, fassung: fassungJetzt(jetzt()) })));
      if (r.ok) await versKopienEntfernen(id, f.weitere.filter((w) => !gleicherTeil(w, f.von)), { gueltigIn: f.von });
      return r.ok ? { ok: true, warnung } : r;
    },

    /**
     * Rechnung `id` löschen (in ihrem Teil, dazu weitere Fassungen derselben Rechnung in anderen Teilen – sonst tauchte eine wieder
     * auf). → { ok: true, rueckgaengig } | wie rechnungSpeichern; `rueckgaengig()` bringt genau diese Rechnung (wie sie im Kalender stand)
     * an ihre alte Stelle im Teil ihres Rechnungsdatums zurück.
     */
    async rechnungLoeschen(id) {
      const nichtBereit = await versBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const f = versRechnungFinden(id);
      if (!f) return { ok: false, fehler: TEXT_RECHNUNG_WEG };
      if (versTeilGesperrt(f.von)) return { ok: false, fehler: TEXT_VERSICHERUNG_TEIL_GESPERRT };
      let spur = null;
      const r = await versNachFehlerLesen(await versInTeilAendern(f.von, (t) => {
        const s = rechnungSpur(t, id);
        if (!s) throw new Error(TEXT_RECHNUNG_WEG);
        const neu = rechnungLoeschenRein(t, id);
        spur = s; // auf der neuesten Fassung: das wirklich Gelöschte
        return neu;
      }));
      if (r.ok) await versKopienEntfernen(id, f.weitere);
      const zurueck = async () => {
        const nb = await versBereit();
        if (nb) return { ok: false, fehler: nb };
        const ziel = teilVonRechnung(spur.rechnung);
        const stelle = gleicherTeil(ziel, f.von) ? spur : { rechnung: spur.rechnung, stelle: null };
        return versInTeilAendern(ziel, (t) => rechnungWiederherstellen(t, stelle));
      };
      return mitRueckgaengig(r, spur ? zurueck : null);
    },

    async zuruecksetzen() {
      const daten = await adapter.zuruecksetzen();
      kern.state = { ...kern.state, ...daten, schicht: daten.schicht ? schichtAusDaten(daten.schicht) : leererSchichtplan(), fixkosten: fixAusDaten(daten.fixkosten), ziele: daten.ziele ? zieleZustand(daten.ziele, 'geladen') : leererZieleZustand(), autos: daten.autos ? autosZustand(daten.autos, 'gespeichert') : leererAutosZustand(), versicherung: daten.versicherung ? versicherungZustand(daten.versicherung, 'gespeichert') : leererVersicherungZustand(), geladen: true, fehler: null };
      fixScheibe.intern.fixGelesen = false; // vor dem nächsten Ändern erst aus dem (neuen) Speicher lesen
      autosGelesen = false;
      versGelesen = false;
      melden();
      store.schichtVorladen(); // neue Beispieldaten: im Hintergrund wieder vorladen (wirft nicht)
    },
  }, kalenderScheibe.methoden, kontoScheibe.methoden, schichtScheibe.methoden, fixScheibe.methoden);
  return store;
}
