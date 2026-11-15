import { todayVienna } from '../domain/dates.js';
import { istObjekt } from '../domain/gemeinsam.js';
import { normalizeSettings } from '../domain/settings.js';
import { spanDays } from '../domain/span.js';
import { planUmwandlung } from '../domain/umwandlung.js';
import { entfernen as artikelEntfernen, erledigteEntfernen, hinzufuegen as artikelHinzufuegen, leereListe, normalisiereListe, umschalten as artikelUmschalten, wiederherstellen } from '../domain/einkauf.js';
import { urlaubCheckEventId } from '../domain/ids.js';
import { normalisiereTermin } from './termin.js';
import { urlaubChecksAbgleich, urlaubChecksWunsch } from './urlaub-check.js';
import { entferneExtra, entferneStand, extraWiederherstellen, fuegeExtraHinzu, leeresKonto, monatVor, normalisiereKonto, setzeStand, standWiederherstellen } from '../domain/konto.js';
import { artAendern, artArchivieren, artHinzufuegen, artVerschieben, katalogErgaenzen, leererMonat, normalisiereKatalog, normalisiereMonat, schaltePinsel, schichtAm, setzeNotiz, setzeSchicht, standardKatalog, tageImMonat, vorladeMonate, zusatzEntfernen, zusatzHinzufuegen, zusatzWiederherstellen } from '../domain/schicht.js';
import { FIX_SHARDS, TEXT_FIX_UNLESBAR, TEXT_FIX_VOLL, TEXT_TEIL_GESPERRT, leererShard, neueFixId, normalisiereShard, postenAnzahlPruefen, postenArchivieren, postenLoeschen, postenPruefen, postenSetzen, postenWiederanlegen, postenWiederherstellen, shardFuer } from '../domain/fixkosten.js';
import { MAX_SERIEN_WOCHEN, naechsterWochentag, wochenSerie } from './serie.js';
import { TEXT_AUTOS_GESPERRT, TEXT_AUTO_WEG, TEXT_HISTORIE_GESPERRT, arbeitLoeschen as arbeitLoeschenRein, arbeitPruefen, arbeitSetzen, arbeitSpur, arbeitWiederherstellen, autoAnlegen, autoLoeschen as autoLoeschenRein, autoSetzen, autoSpur, autoWiederherstellen, autosWarnungen, historieJahrBekannt, historieJahrEintragen, historieWarnungen, kmEintragen, kmLoeschen as kmLoeschenRein, kmPruefen, kmSpur, kmWiederherstellen, leereAutos, leereHistorie, neueAutoId, regelLoeschen as regelLoeschenRein, regelSetzen, regelSpur, regelWiederherstellen, satzLoeschen as satzLoeschenRein, satzSetzen, satzSpur, satzVerwendet, satzVerwendetText, satzWiederherstellen } from '../domain/autos.js';
import { autosHistorien, kmPunkte } from '../domain/autos-rechnung.js';
import { TEXT_POLIZZE_WEG, TEXT_RECHNUNG_WEG, TEXT_VERSICHERUNG_GESPERRT, TEXT_VERSICHERUNG_TEIL_GESPERRT, erstattungSetzen, fassungJetzt, leererVersicherungTeil, leereVersicherung, neueVersicherungId, polizzeAendern, polizzeAnlegen, rechnungJahr, rechnungLoeschen as rechnungLoeschenRein, rechnungPruefen, rechnungQuartal, rechnungSetzen, rechnungSpur, rechnungTeilWechseln, rechnungWiederherstellen, versicherungJahrBekannt, versicherungJahrEintragen, versicherungTeilWarnungen, versicherungWarnungen } from '../domain/versicherung.js';
import { rechnungFinden } from '../domain/versicherung-rechnung.js';
import { TEXT_ZIELE_GESPERRT, TEXT_ZIELE_NICHT_GELADEN, freiVerschieben as zielFreiVerschieben, leereZiele, neueZielId, startMonat, verschiebungLoeschen as verschiebungLoeschenRein, verschiebungWiederherstellen as verschiebungWiederherstellenRein, zielAusblenden as zielAusblendenRein, zielBeenden as zielBeendenRein, zielLoeschen as zielLoeschenRein, zielSchluss, zielSetzen, zielSpur, zielWiederherstellen as zielWiederherstellenRein, zieleWarnungen } from '../domain/sparziele.js';
import { FACHLICH, TEXT_AUTOS_NEUER, TEXT_FEHLER, createKern, eintragVorhanden, gleichOder, historieGleichOder, istAuthFehler, ladeFelder, mitFrist } from './store/kern.js';

const KITA_TYPEN = ['kita_essen', 'kita_ohne'];
const MIN_ABSTAND_MS = 60_000; // höchstens einmal pro Minute neu laden
const SCHICHT_SICHERUNG_AB = '2026-01'; // erster Monat, den die Sicherung nach einem Schichtplan fragt
const SCHICHT_SICHERUNG_VORAUS = 12; // … bis zwölf Monate nach dem laufenden
const SCHICHT_SICHERUNG_PARALLEL = 6; // so viele Monate werden gleichzeitig gefragt

const TEXT_FIX_NICHT_GELESEN = 'Die Fixkosten konnten nicht gelesen werden. Bitte noch einmal versuchen.';
const TEXT_FIX_ANMELDEN = 'Bitte zuerst neu anmelden; danach lassen sich die Fixkosten ändern.';
const TEXT_FIX_GELOESCHT = 'Diesen Posten gibt es nicht mehr – er wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_FIX_NEUER = 'Diesen Posten hat das andere Telefon mit einer neueren App-Version geändert. Bitte die App aktualisieren.';
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

/**
 * Lässt sich ein gelöschter Termin (oder Urlaub) genau so wieder anlegen? Nicht, wenn er ein Termin einer in Google Kalender
 * wiederkehrenden Serie ist (Kennung „<Serie>_<Zeitpunkt>“): neu geschrieben würde daraus ein anderes, einzelnes Ereignis.
 */
const einzelnWiederherstellbar = (id) => typeof id === 'string' && id !== '' && !id.includes('_');

/** Ergebnis eines Eintragens mit `rueckgaengig` – auch, wenn es nur auf die Anmeldung wartet (es bleibt sichtbar); nicht nach einem Fehlschlag. */
const mitZuruecknehmen = (r, rueckgaengig) => (r.ok || r.wartet ? { ...r, rueckgaengig } : r);

/** Zufällige ID aus den Zeichen 0-9 und a-v: so darf sie auch als Google-Ereignis-ID dienen. */
const zufaelligeId = () => `u${Array.from({ length: 11 }, () => Math.floor(Math.random() * 32).toString(32)).join('')}`;

/** Liegt [von, bis) vollständig in den Bereichen `bereiche` ({ von, bis }, auch mehrere aneinander anschließende oder überlappende)? */
function bereichAbgedeckt(von, bis, bereiche) {
  let bisHier = von;
  for (const b of [...bereiche].sort((x, y) => x.von.localeCompare(y.von))) {
    if (b.von > bisHier) break;
    if (b.bis > bisHier) bisHier = b.bis;
    if (bisHier >= bis) return true;
  }
  return bisHier >= bis;
}

/**
 * Schichtplan im Zustand: `katalog` null = noch nicht gelesen (die Ansicht zeigt dann die Standardarten). `vorgeladen` = der Monat
 * ('JJJJ-MM'), ab dem Schichtarten und Monate (siehe `schichtVorladen`) seit dem Start aus dem Kalender gelesen wurden, nicht nur aus dem
 * gespeicherten Stand; null = noch nicht. Die Erinnerungen gelten nur, solange das der laufende Monat ist (siehe push/plan.js planQuellen).
 */
const leererSchichtplan = () => ({ katalog: null, monate: {}, status: {}, vorgeladen: null });

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
  return { katalog: roh?.katalog ? normalisiereKatalog(roh.katalog).katalog : null, monate, status: Object.fromEntries(Object.keys(monate).map((jm) => [jm, 'geladen'])), vorgeladen: null };
}

/**
 * Fixkosten im Zustand: `shards` = die vier Teile (null = noch nie gelesen), `status` null (noch nie gelesen) | 'gespeichert' (aus dem
 * Schnappschuss oder den Beispieldaten, noch nicht aus dem Kalender) | 'laedt' | 'geladen' | 'fehler', `warnungen` = Meldungen des
 * letzten Lesens für die Anzeige, `unlesbar` = Nummern der Teile, die diese Version nicht lesen kann (beschädigt oder von einer neueren
 * Version): sie werden leer gezeigt und sind gesperrt (kein Schreiben, bis ein späteres Lesen sie wieder lesbar findet).
 */
const leereFixkosten = () => ({ shards: null, status: null, warnungen: [], unlesbar: [] });

/** Nummern der unlesbaren Teile aus dem, was Adapter ([{ nr, text }]) oder Schnappschuss ([nr]) liefern. */
const unlesbareNummern = (liste) => [...new Set((Array.isArray(liste) ? liste : []).map((u) => (typeof u === 'number' ? u : u?.nr)).filter((nr) => Number.isInteger(nr) && nr >= 0 && nr < FIX_SHARDS))].sort();

/** Die vier Teile, wie sie ein Adapter, der Schnappschuss oder die Beispieldaten liefern (fehlender Teil → leerer Teil). */
const fixTeile = (shards) => Array.from({ length: FIX_SHARDS }, (_, nr) => normalisiereShard(shards?.[nr] ?? leererShard()));

/** Fixkosten aus Schnappschuss oder Beispieldaten ({ shards }); ohne → noch nicht gelesen. */
const fixAusDaten = (roh) => (Array.isArray(roh?.shards) ? { shards: fixTeile(roh.shards), status: 'gespeichert', warnungen: [], unlesbar: unlesbareNummern(roh.unlesbar) } : leereFixkosten());

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
  const { wartend, melden, unlesbarMerken, gelesenMerken, ausfuehren, aendere, teilAendern, ergebnisVon, teilErgebnis, mitRueckgaengig, fachlich, fachlichAsync, ohneUeberschreiben } = kern;
  const store = {};
  kern.state = { geladen: false, settings: normalizeSettings(), tage: {}, urlaub: [], termine: [], einkauf: leereListe(), konto: leeresKonto(), schicht: leererSchichtplan(), fixkosten: leereFixkosten(), ziele: leererZieleZustand(), autos: leererAutosZustand(), versicherung: leererVersicherungZustand(), unlesbar: [], fehler: null, fortschritt: null, anmeldungNoetig: false, fenster: null };
  const geladeneBereiche = [];
  kern.nachNeuLaden(() => () => {
    geladeneBereiche.length = 0;
  });
  const ladendeBereiche = new Map(); // Schlüssel „von|bis“ → laufendes Laden (dieselbe Zusage für jeden, der denselben Bereich anfordert)

  /** Lädt [von, bis) und übernimmt Tage, Urlaub und Termine dieses Zeitraums; Ergebnis wie sichereBereich. */
  async function bereichLaden(von, bis) {
    let erfolg = false;
    try {
      const d = await adapter.ladeBereich(von, bis);
      const tage = { ...kern.state.tage };
      for (const k of Object.keys(tage)) if (k >= von && k < bis) delete tage[k];
      Object.assign(tage, d.tage);
      kern.state = {
        ...kern.state,
        tage,
        termine: [...kern.state.termine.filter((t) => !(t.date >= von && t.date < bis)), ...d.termine],
        urlaub: [...kern.state.urlaub.filter((u) => !d.urlaub.some((x) => x.id === u.id)), ...d.urlaub],
      };
      geladeneBereiche.push({ von, bis });
      erfolg = true;
    } catch (fehler) {
      kern.state = istAuthFehler(fehler) ? { ...kern.state, anmeldungNoetig: true } : { ...kern.state, fehler: 'Dieser Zeitraum konnte nicht geladen werden.' };
    }
    melden();
    return erfolg;
  }
  let letzteLadung = 0;
  let checksLaufen = false;
  let einkaufGeprueft = null; // wann die Einkaufsliste zuletzt mit dem Kalender abgeglichen war (ms): Laden, Aktualisieren, eigenes Speichern
  let einkaufHolen = null; // laufende Abfrage der Einkaufsliste: mehrfaches Anstoßen fragt nur einmal
  let schichtVorladenLaeuft = null; // laufendes Vorladen des Schichtplans: mehrfaches Anstoßen fragt nur einmal
  let schichtFrischLaeuft = null; // laufendes Frisch-Lesen vor dem Senden des Push-Plans (siehe schichtFrischLesen): höchstens eines
  let fixGelesen = false; // wurden die Fixkosten seit dem Start schon einmal aus dem Kalender gelesen? Erst dann wird geschrieben.
  let fixLesenLaeuft = null; // laufendes Lesen der Fixkosten: mehrfaches Anstoßen fragt nur einmal
  let fixFrischLaeuft = null; // laufendes Frisch-Lesen der Fixkosten (siehe fixFrischLesen): höchstens eines
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
  const pruefeWochen = (wochen) => {
    if (!Number.isInteger(wochen) || wochen < 1 || wochen > MAX_SERIEN_WOCHEN) throw new Error(`Wochen: bitte 1 bis ${MAX_SERIEN_WOCHEN} wählen.`);
  };

  /** Termine einer wöchentlichen Serie ab `roh.date` (Feiertage, Urlaub usw. werden verschoben oder übersprungen). */
  function serieTermine(roh, wochen) {
    const basis = normalisiereTermin({ ...roh, typ: 'kita_sache', serie: undefined });
    const plan = wochenSerie(kern.state, { start: basis.date, wochen, richtung: basis.richtung, heute: todayVienna(jetzt()) });
    const serie = neueId();
    return {
      termine: plan.eintraege.map((e) => ({ id: neueId(), ...basis, date: e.date, serie })),
      verschoben: plan.eintraege.filter((e) => e.verschobenVon).length,
      uebersprungen: plan.uebersprungen,
    };
  }

  /** Legt Termine an (oder ersetzt die mit derselben Kennung). Wirft sofort, wenn es keinen gibt; sonst → wie `ergebnisVon`. */
  async function termineAnlegen(neue) {
    if (neue.length === 0) throw new Error('In diesem Zeitraum gibt es keinen passenden Tag.');
    const ids = new Set(neue.map((t) => t.id));
    const e = await aendere({ termine: [...kern.state.termine.filter((t) => !ids.has(t.id)), ...neue] }, async (bericht) => {
      let i = 0;
      for (const t of neue) {
        await adapter.speichereTermin(t);
        bericht((i += 1), neue.length);
      }
    });
    return ergebnisVon(e);
  }

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

  // Änderungen, die noch nicht gespeichert sind, je Teil – Schichtplan ('katalog' oder 'JJJJ-MM') und Fixkosten (Teil 0 … 3):
  // { basis: zuletzt bekannter Stand im Kalender, offen: [fn, …] in Tipp-Reihenfolge, kette: Promise der Speicherungen }.
  // Angezeigt wird immer `basis` mit allen offenen Änderungen darauf: so verschwindet kein Tipp, während ein früherer gespeichert wird.
  const schichtOffen = new Map();
  const schichtSchreibtNoch = () => schichtOffen.size > 0;
  const fixOffen = new Map();
  const fixSchreibtNoch = () => fixOffen.size > 0;

  const schichtTeil = (teil) => (teil === 'katalog' ? kern.state.schicht.katalog : kern.state.schicht.monate[teil]);
  const mitSchichtTeil = (teil, wert) => ({ ...kern.state, schicht: teil === 'katalog' ? { ...kern.state.schicht, katalog: wert } : { ...kern.state.schicht, monate: { ...kern.state.schicht.monate, [teil]: wert } } });

  /** Ändert einen Teil des Schichtplans ('katalog' oder 'JJJJ-MM'), siehe `teilAendern`. */
  const schichtAendern = (teil, fn, optionen) => teilAendern(schichtOffen, teil, fn, { ...optionen, aktuell: () => schichtTeil(teil), mit: (wert) => mitSchichtTeil(teil, wert) });

  /** Zustand mit Teil `nr` der Fixkosten = `shard` (die anderen Teile bleiben). */
  function mitFixTeil(nr, shard) {
    const shards = [...(kern.state.fixkosten.shards ?? fixTeile(null))];
    shards[nr] = shard;
    return { ...kern.state, fixkosten: { ...kern.state.fixkosten, shards } };
  }

  /**
   * Ändert Teil `nr` der Fixkosten (siehe `teilAendern`): sofort sichtbar, gespeichert als `fn` auf der NEUESTEN Fassung dieses Teils
   * (die anderen drei Teile bleiben unberührt). Ergebnis wie `schichtKatalogAendern`: { ok: true } | { ok: false, fehler, gemeldet: true } |
   * { ok: false, wartet: true, fehler }. Wirft, wenn `fn` schon auf dem angezeigten Stand ablehnt (dann ändert sich nichts).
   */
  async function fixTeilAendern(nr, fn) {
    const { ergebnis, fehler } = await teilAendern(fixOffen, nr, fn, {
      leer: leererShard,
      aktuell: () => kern.state.fixkosten.shards?.[nr] ?? null,
      mit: (shard) => mitFixTeil(nr, shard),
      async speichern(f) {
        try {
          return await adapter.aendereFixShard(nr, f);
        } catch (fehler) {
          // Der Teil ist (inzwischen, z. B. durch das andere Telefon) unlesbar: der Adapter hat nichts geschrieben; ab jetzt gesperrt.
          if (fehler?.name === 'FixTeilGesperrt') {
            FACHLICH.add(fehler);
            kern.state = { ...kern.state, fixkosten: { ...kern.state.fixkosten, unlesbar: unlesbareNummern([...kern.state.fixkosten.unlesbar, nr]) } };
          }
          throw fehler;
        }
      },
      lesen: async () => (await adapter.leseFixkosten()).shards?.[nr] ?? null,
      normalisiere: (shard) => normalisiereShard(shard ?? leererShard()),
    });
    if (ergebnis === 'ok') return { ok: true };
    return ergebnis === 'auth' ? { ok: false, wartet: true, fehler } : { ok: false, fehler, gemeldet: true }; // gemeldet: die Meldung steht schon in state.fehler (die Shell zeigt sie)
  }

  /**
   * Liest die vier Teile der Fixkosten (alle gleichzeitig). Status 'laedt' → 'geladen' bzw. 'fehler' (abgelaufene Anmeldung setzt
   * zusätzlich `anmeldungNoetig`). Wurde inzwischen selbst etwas geändert, bleiben die angezeigten Teile (die Antwort könnte älter sein).
   * Ergebnis: true, wenn gelesen werden konnte. Höchstens ein Lesen gleichzeitig; wirft nicht.
   */
  function fixLesen() {
    if (fixLesenLaeuft) return fixLesenLaeuft;
    if (!adapter.leseFixkosten) return Promise.resolve(false);
    fixLesenLaeuft = (async () => {
      const stand = kern.schreibStand;
      kern.state = { ...kern.state, fixkosten: { ...kern.state.fixkosten, status: 'laedt' } };
      melden();
      let gelesen;
      try {
        gelesen = await adapter.leseFixkosten();
      } catch (fehler) {
        kern.state = { ...kern.state, fixkosten: { ...kern.state.fixkosten, status: 'fehler' }, ...(istAuthFehler(fehler) ? { anmeldungNoetig: true } : {}) };
        melden();
        return false;
      }
      const eigene = stand !== kern.schreibStand || kern.schreibend > 0 || wartend.length > 0 || fixSchreibtNoch();
      const f = kern.state.fixkosten;
      const frisch = fixTeile(gelesen?.shards);
      // eigene Änderung inzwischen: das Angezeigte bleibt; unverändert: dieselben Teile (kein neuer Push-Plan, kein Neuzeichnen der Liste)
      const shards = f.shards && (eigene || JSON.stringify(frisch) === JSON.stringify(f.shards)) ? f.shards : frisch;
      kern.state = { ...kern.state, fixkosten: { shards, status: 'geladen', warnungen: gelesen?.warnungen ?? [], unlesbar: unlesbareNummern(gelesen?.unlesbar) } };
      fixGelesen = true;
      melden();
      return true;
    })()
      .catch(() => false)
      .finally(() => {
        fixLesenLaeuft = null;
      });
    return fixLesenLaeuft;
  }

  /** Vor dem ersten Schreiben müssen die Fixkosten einmal aus dem Kalender gelesen sein (Anzahl, Anzeige, Warnungen). → Fehlertext oder null. */
  async function fixBereit() {
    if (fixGelesen && kern.state.fixkosten.shards) return null;
    if (await fixLesen()) return null;
    return kern.state.anmeldungNoetig ? TEXT_FIX_ANMELDEN : TEXT_FIX_NICHT_GELESEN;
  }

  /** In welchem Teil der Posten `id` steht (angezeigter Stand); sonst der Teil, in den er gehört. */
  function fixTeilVon(id) {
    const nr = (kern.state.fixkosten.shards ?? []).findIndex((s) => s?.posten.some((p) => p.id === id));
    return nr >= 0 ? nr : shardFuer(id);
  }

  /**
   * Kennung für einen neuen Posten: noch nicht vergeben (auch nicht unter den fremden Posten), und ihr Teil ist lesbar und hat für
   * `posten` noch Platz (geprüft am angezeigten Stand). Der Teil hängt an der zufälligen Kennung; deshalb werden so lange neue gezogen,
   * bis eine passt oder jeder Teil ausgeschieden ist. → { id } | { fehler } (verständlich, ohne „Teil“).
   */
  function neueFixIdFuer(posten) {
    const shards = kern.state.fixkosten.shards ?? fixTeile(null);
    const vergeben = new Set(shards.flatMap((s) => [...(s?.posten.map((p) => p.id) ?? []), ...(s?.fremd ?? []).map((k) => k?.i)]));
    const raus = new Set(); // Teile, die nicht in Frage kommen (unlesbar oder voll)
    let voll = false;
    for (let versuch = 0; versuch < 64 && raus.size < FIX_SHARDS; versuch += 1) {
      const id = fixId();
      if (typeof id !== 'string' || id === '') break; // eingespeiste Kennungen (Tests) sind aufgebraucht
      const nr = shardFuer(id);
      if (vergeben.has(id) || raus.has(nr)) continue;
      if (fixGesperrt(nr)) {
        raus.add(nr);
        continue;
      }
      try {
        postenSetzen(shards[nr] ?? leererShard(), { ...posten, id });
        return { id };
      } catch {
        raus.add(nr);
        voll = true;
      }
    }
    return { fehler: voll ? TEXT_FIX_VOLL : raus.size >= FIX_SHARDS ? TEXT_FIX_UNLESBAR : TEXT_FEHLER };
  }

  /** Ist Teil `nr` gesperrt, weil diese Version ihn nicht lesen kann? */
  const fixGesperrt = (nr) => kern.state.fixkosten.unlesbar.includes(nr);

  /**
   * Der Posten `id` in Teil `shard`, sonst ein Wurf mit klarer Meldung: inzwischen gelöscht, oder vom anderen Telefon mit einer neueren
   * Version geändert (jetzt ein fremder Eintrag, den diese Version nicht anfassen darf). Auf der neuesten Fassung heißt der Wurf:
   * zurücknehmen, den Teil neu lesen und die Meldung zeigen (siehe teilAendern).
   */
  function fixVorhanden(shard, id) {
    const p = shard.posten.find((x) => x.id === id);
    if (p) return p;
    throw new Error((shard.fremd ?? []).some((k) => k?.i === id) ? TEXT_FIX_NEUER : TEXT_FIX_GELOESCHT);
  }

  /** Ändert einen vorhandenen Posten mit `fn(teil)` (Archivieren usw.): { ok, fehler?, wartet? }; nie ein Wurf. Fehlt er (auch inzwischen), { ok: false, fehler }. */
  async function fixPostenAendern(id, fn) {
    const fehler = await fixBereit();
    if (fehler) return { ok: false, fehler };
    const nr = fixTeilVon(id);
    if (fixGesperrt(nr)) return { ok: false, fehler: TEXT_TEIL_GESPERRT };
    try {
      return await fixTeilAendern(nr, (shard) => (fixVorhanden(shard, id), fn(shard)));
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER }; // schon auf dem angezeigten Stand abgelehnt: nichts geändert
    }
  }

  /**
   * Fixkosten für die Sicherung: frisch aus dem Kalender (Anmeldefehler laufen nach oben); ohne passenden Adapter der angezeigte Stand.
   * { shards (mit fremden Posten), unlesbar: [{ nr, text }] } – unlesbare Teile kommen als Rohtext mit, damit nichts unbemerkt fehlt.
   */
  async function fixFuerSicherung() {
    if (!adapter.leseFixkosten) return { shards: kern.state.fixkosten.shards ?? fixTeile(null), unlesbar: kern.state.fixkosten.unlesbar.map((nr) => ({ nr, text: null })) };
    const gelesen = await adapter.leseFixkosten();
    return { shards: fixTeile(gelesen.shards), unlesbar: (gelesen.unlesbar ?? []).map(({ nr, text }) => ({ nr, text })) };
  }

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

  /** Ändert einen Monat des Schichtplans (siehe `schichtAendern`): → { neu, ergebnis, fehler }. */
  const schichtMonatSchreiben = (jm, fn) =>
    schichtAendern(jm, fn, {
      leer: () => leererMonat(jm),
      speichern: async (f) => {
        const gespeichert = await adapter.aendereSchichtMonat(jm, f);
        unlesbarMerken(`schicht:${jm}`, false); // nicht abgelehnt: die neueste Fassung war lesbar
        return gespeichert;
      },
      lesen: async () => gelesenMerken(`schicht:${jm}`, await adapter.leseSchichtMonat(jm)).monat ?? null,
      normalisiere: (m) => normalisiereMonat(m, jm).monat,
    });

  /** Ändert einen Monat des Schichtplans (siehe `schichtAendern`); → der sofort angezeigte Monat. */
  async function schichtMonatAendern(jm, fn) {
    return (await schichtMonatSchreiben(jm, fn)).neu;
  }

  /**
   * Ändert die Schichtarten (siehe `schichtAendern`); gibt es noch keine, wird von den Standardarten ausgegangen. Ergebnis:
   * { ok: true } nach dem Speichern im Kalender, sonst { ok: false, fehler, gemeldet: true } (fachliche Meldung wie „Dieses Kürzel gibt es
   * schon.“ oder der allgemeine Text; zurückgenommen und neu gelesen; die Meldung steht schon in state.fehler) bzw. { ok: false, wartet: true, fehler } (wird nach dem Anmelden gespeichert).
   * Wirft nur, wenn die Eingabe schon auf dem angezeigten Stand abgelehnt wird (dann ändert sich nichts).
   */
  async function schichtKatalogAendern(fn) {
    const { ergebnis, fehler } = await schichtAendern('katalog', fn, {
      leer: standardKatalog,
      speichern: async (f) => {
        const gespeichert = await adapter.aendereSchichtarten(f);
        unlesbarMerken('schichtarten', false); // nicht abgelehnt: die neueste Fassung war lesbar
        return gespeichert;
      },
      lesen: async () => gelesenMerken('schichtarten', await adapter.leseSchichtarten()).katalog ?? null,
      normalisiere: (k) => normalisiereKatalog(k).katalog,
    });
    return teilErgebnis({ ergebnis, fehler }); // gemeldet: die Meldung steht schon in state.fehler (die Shell zeigt sie)
  }

  /**
   * Liest Monate `jms` des Schichtplans und die Schichtarten (mit `katalogNeu` immer, sonst nur, wenn noch keine gelesen sind), alles
   * gleichzeitig. Status je Monat: 'laedt' → 'geladen' oder 'fehler' (abgelaufene Anmeldung setzt zusätzlich `anmeldungNoetig`). Fehlt
   * der Katalog im Kalender, gelten die Standardarten. Wurde inzwischen selbst etwas geändert, bleibt Vorhandenes, wie es ist (die
   * Antwort könnte älter sein). Ergebnis: { katalogGelesen, monateGelesen } – ob die Schichtarten bzw. alle Monate gelesen werden konnten.
   * Unlesbare Schichtarten oder Monate (Standardarten bzw. leer gezeigt) werden in `state.unlesbar` vermerkt, lesbare wieder herausgenommen.
   */
  async function schichtLesen(jms, { katalogNeu = false } = {}) {
    const mitKatalog = katalogNeu || kern.state.schicht.katalog === null;
    const stand = kern.schreibStand;
    kern.state = { ...kern.state, schicht: { ...kern.state.schicht, status: { ...kern.state.schicht.status, ...Object.fromEntries(jms.map((m) => [m, 'laedt'])) } } };
    melden();
    const [katalog, ...monate] = await Promise.allSettled([mitKatalog ? adapter.leseSchichtarten() : null, ...jms.map((m) => adapter.leseSchichtMonat(m))]);
    const eigene = stand !== kern.schreibStand || kern.schreibend > 0 || wartend.length > 0 || schichtSchreibtNoch();
    const s = kern.state.schicht;
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
      if (!(eigene && s.monate[m])) neueMonate[m] = gleichOder(s.monate[m], normalisiereMonat(r.value?.monat ?? null, m).monat);
      status[m] = 'geladen';
      gelesenMerken(`schicht:${m}`, r.value);
    });
    let kat = s.katalog;
    const katalogGelesen = mitKatalog && katalog.status === 'fulfilled';
    if (katalogGelesen) gelesenMerken('schichtarten', katalog.value);
    if (mitKatalog && katalog.status === 'rejected') auth ||= istAuthFehler(katalog.reason);
    else if (katalogGelesen && (kat === null || (katalogNeu && !eigene))) kat = gleichOder(kat, normalisiereKatalog(katalog.value?.katalog ?? null).katalog);
    // Unverändert gelesen: dieselben Objekte behalten. Der Push-Plan (push/plan.js `planQuellen`) vergleicht nach Identität; ein neues,
    // aber gleiches Objekt löste sonst bei jedem Blättern oder Abgleich einen Push-Abgleich samt frischem Lesen aus.
    const monateGleich = Object.keys(neueMonate).length === Object.keys(s.monate).length && Object.keys(neueMonate).every((m) => neueMonate[m] === s.monate[m]);
    kern.state = { ...kern.state, schicht: { ...s, katalog: kat, monate: monateGleich ? s.monate : neueMonate, status }, ...(auth ? { anmeldungNoetig: true } : {}) };
    melden();
    return { katalogGelesen, monateGelesen: jms.every((m) => status[m] === 'geladen') };
  }

  /**
   * Ergänzt fehlende Standardarten (siehe `katalogErgaenzen`) still im Hintergrund: keine Meldung, kein Warten auf die Anmeldung, kein
   * „Änderung wartet“ – das hat ja niemand eingegeben. Gespeichert wird als reine Änderung auf der NEUESTEN Fassung (hat das andere
   * Telefon schon ergänzt, wird nichts geschrieben); scheitert es, versucht es das nächste Vorladen noch einmal.
   */
  async function schichtKatalogStillErgaenzen() {
    if (schichtOffen.has('katalog')) return; // eigene Änderung der Schichtarten läuft: sie geht vor, das nächste Vorladen ergänzt
    const vorher = kern.state.schicht.katalog;
    let gespeichert;
    try {
      gespeichert = await adapter.aendereSchichtarten((kat) => {
        const r = katalogErgaenzen(kat);
        return r.geaendert ? r.katalog : null;
      });
      if (!gespeichert) gespeichert = (await adapter.leseSchichtarten()).katalog; // schon ergänzt: den Stand im Kalender zeigen
    } catch {
      return;
    }
    if (kern.state.schicht.katalog !== vorher || schichtOffen.has('katalog')) return; // inzwischen selbst geändert: das bringt den neuesten Stand
    kern.state = { ...kern.state, schicht: { ...kern.state.schicht, katalog: normalisiereKatalog(gespeichert ?? null).katalog } };
    melden();
  }

  /** Schichtplan für die Sicherung: Katalog und alle vorhandenen Monate von Jänner 2026 bis zwölf Monate nach heute (fehlende übersprungen). */
  async function schichtFuerSicherung() {
    if (!adapter.leseSchichtMonat) return { katalog: kern.state.schicht.katalog, monate: kern.state.schicht.monate };
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

  /** Stellt Tage auf einen früheren Stand zurück: `vorher` = [[Datum, Typ oder null], …]. → 'ok' | 'auth' | 'fehler' (wie `aendere`). */
  async function stelleTageWieder(vorher, zusatz = {}) {
    const tage = { ...kern.state.tage };
    for (const [d, t] of vorher) {
      if (t === null) delete tage[d];
      else tage[d] = { typ: t };
    }
    return aendere({ tage, ...zusatz.zustand }, async (bericht) => {
      if (zusatz.vorher) await zusatz.vorher();
      let i = 0;
      for (const [d, t] of vorher) {
        if (t === null) await adapter.loescheTag(d);
        else await adapter.setzeTag(d, t);
        bericht((i += 1), vorher.length);
      }
    });
  }

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
        einkaufGeprueft = letzteLadung;
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
     * Holt Tage, Urlaub und Termine eines Zeitraums nach (Monat zurückblättern); mehrfaches Anfordern lädt nur einmal: wer einen
     * Bereich anfordert, der gerade geladen wird, wartet auf dasselbe Laden. Abgedeckt ist ein Zeitraum auch durch mehrere
     * aneinander anschließende geladene Bereiche (z. B. „Ältere laden“ Schritt für Schritt).
     * Ergebnis: true, wenn der Zeitraum jetzt da ist; false, wenn es nicht möglich war (Demo, Fehler).
     */
    sichereBereich(von, bis) {
      if (!adapter.ladeBereich || !kern.state.fenster) return Promise.resolve(false);
      if (bereichAbgedeckt(von, bis, [kern.state.fenster, ...geladeneBereiche])) return Promise.resolve(true);
      const schluessel = `${von}|${bis}`;
      if (!ladendeBereiche.has(schluessel)) {
        ladendeBereiche.set(
          schluessel,
          bereichLaden(von, bis).finally(() => ladendeBereiche.delete(schluessel)),
        );
      }
      return ladendeBereiche.get(schluessel);
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
     * Gleicht die Urlaub-Checks im Kalender mit dem Stand des Urlaubs ab (am 1.3., 1.5., 1.7. um 09:00, solange noch Urlaub offen ist).
     * Nur mit Google und frisch geladenen Daten; Fehler (z. B. abgelaufene Anmeldung) sind kein Problem: beim nächsten Öffnen erneut.
     * Ergebnis: true, wenn etwas geschrieben wurde.
     */
    async urlaubChecksAbgleichen() {
      if (!adapter.gleicheUrlaubChecksAb || !kern.state.geladen || kern.state.nurSnapshot || checksLaufen) return false;
      const heute = todayVienna(jetzt());
      const { schreiben, loeschen } = urlaubChecksAbgleich({ wunsch: urlaubChecksWunsch(kern.state, heute), vorhanden: kern.state.urlaubChecks ?? [], heute });
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
      kern.state = { ...kern.state, urlaubChecks: [...(kern.state.urlaubChecks ?? []).filter((c) => !weg.has(c.id)), ...neu].sort((a, b) => a.date.localeCompare(b.date)) };
      return true;
    },

    setTag: (date, typ) => store.setTage([date], typ),

    /**
     * Setzt den Typ für mehrere Tage. → wie `ergebnisVon`, dazu `rueckgaengig()` (stellt die Tage auf den früheren Stand) – nicht,
     * wenn das Speichern gescheitert ist (dann ist schon alles zurückgenommen und neu geladen).
     */
    async setTage(dates, typ) {
      const vorher = dates.map((d) => [d, kern.state.tage[d]?.typ ?? null]);
      const tage = { ...kern.state.tage };
      for (const d of dates) tage[d] = { typ };
      const e = await aendere({ tage }, async (bericht) => {
        let i = 0;
        for (const d of dates) {
          await adapter.setzeTag(d, typ);
          bericht((i += 1), dates.length);
        }
      });
      return mitZuruecknehmen(ergebnisVon(e), () => stelleTageWieder(vorher));
    },

    /**
     * Löscht den Eintrag eines Tages. → { ok, fehler?, gemeldet?, wartet?, rueckgaengig? } (siehe `ergebnisVon`); `rueckgaengig()` setzt
     * den Typ wieder – nicht bei einem Tag mit Konflikt (zwei Einträge: der verdrängte käme nicht zurück). Nichts da → { ok: true }.
     */
    async loescheTag(date) {
      const vorher = kern.state.tage[date];
      if (!vorher) return { ok: true };
      const tage = { ...kern.state.tage };
      delete tage[date];
      const r = ergebnisVon(await aendere({ tage }, () => adapter.loescheTag(date)));
      const zurueck = async () =>
        ergebnisVon(await aendere({ tage: { ...kern.state.tage, [date]: { typ: vorher.typ } } }, ohneUeberschreiben(() => (adapter.stelleTagWieder ? adapter.stelleTagWieder(date, vorher.typ) : adapter.setzeTag(date, vorher.typ)))));
      return mitRueckgaengig(r, vorher.konflikt ? null : zurueck);
    },

    /**
     * Legt einen Urlaub an; Betreuungstage darin werden umgewandelt (gelöscht). Wirft sofort bei einem ungültigen Zeitraum.
     * → wie `ergebnisVon`, dazu { id, umgewandelt } und `rueckgaengig()` (nicht, wenn das Speichern gescheitert ist).
     */
    async urlaubHinzufuegen({ start, end }) {
      if (!(start <= end)) throw new Error('Ungültiger Zeitraum');
      const tage = { ...kern.state.tage };
      const betreuung = new Set(spanDays({ start, end }).filter((d) => KITA_TYPEN.includes(tage[d]?.typ)));
      const plan = planUmwandlung({ dates: [...betreuung], zielTyp: 'urlaub', vorhandeneBifen: betreuung });
      const entfernt = plan.loeschen.map((d) => [d, tage[d].typ]);
      for (const d of plan.loeschen) delete tage[d];
      const eintrag = { id: neueId(), start, end };
      const e = await aendere({ tage, urlaub: [...kern.state.urlaub, eintrag] }, async (bericht) => {
        const gesamt = plan.loeschen.length + 1;
        let i = 0;
        for (const d of plan.loeschen) {
          await adapter.loescheTag(d);
          bericht((i += 1), gesamt);
        }
        await adapter.speichereUrlaub(eintrag);
        bericht(gesamt, gesamt);
      });
      const zurueck = () =>
        stelleTageWieder(entfernt, {
          zustand: { urlaub: kern.state.urlaub.filter((u) => u.id !== eintrag.id) },
          vorher: () => adapter.loescheUrlaub(eintrag.id),
        });
      return mitZuruecknehmen({ ...ergebnisVon(e), id: eintrag.id, umgewandelt: plan.loeschen.length }, zurueck);
    },

    /**
     * Löscht einen Urlaub. → wie `loescheTag`; `rueckgaengig()` schreibt denselben Zeitraum mit derselben Kennung wieder (nicht bei
     * einem Ereignis einer wiederkehrenden Google-Serie, siehe einzelnWiederherstellbar).
     */
    async urlaubLoeschen(id) {
      const u = kern.state.urlaub.find((x) => x.id === id);
      const r = ergebnisVon(await aendere({ urlaub: kern.state.urlaub.filter((x) => x.id !== id) }, () => adapter.loescheUrlaub(id)));
      const zurueck = async () =>
        ergebnisVon(await aendere({ urlaub: [...kern.state.urlaub.filter((x) => x.id !== id), u] }, ohneUeberschreiben(() => (adapter.stelleUrlaubWieder ? adapter.stelleUrlaubWieder(u) : adapter.speichereUrlaub(u)))));
      return mitRueckgaengig(r, u && einzelnWiederherstellbar(id) ? zurueck : null);
    },

    /**
     * Legt einen Termin an oder ändert ihn (mit `id`). Wirft bei ungültigen Eingaben sofort einen Error mit deutscher Meldung.
     * → wie `ergebnisVon`, dazu `id` (auch wenn das Speichern gescheitert ist: dann steht der Termin nicht mehr im Zustand).
     */
    async terminSpeichern(roh, id = null) {
      const termin = { id: id ?? neueId(), ...normalisiereTermin(roh) };
      const termine = [...kern.state.termine.filter((t) => t.id !== termin.id), termin];
      return { ...ergebnisVon(await aendere({ termine }, () => adapter.speichereTermin(termin))), id: termin.id };
    },

    /**
     * Löscht einen Termin (oder eine einzelne Sache, auch aus einer Serie). → wie `loescheTag`; `rueckgaengig()` schreibt ihn unverändert
     * mit derselben Kennung wieder – nicht bei einem Termin einer wiederkehrenden Google-Serie; ist er inzwischen wieder da (anderes
     * Telefon), bleibt er unverändert (Meldung).
     */
    async terminLoeschen(id) {
      const t = kern.state.termine.find((x) => x.id === id);
      const r = ergebnisVon(await aendere({ termine: kern.state.termine.filter((x) => x.id !== id) }, () => adapter.loescheTermin(id)));
      const zurueck = async () =>
        ergebnisVon(await aendere({ termine: [...kern.state.termine.filter((x) => x.id !== id), t] }, ohneUeberschreiben(() => (adapter.stelleTerminWieder ? adapter.stelleTerminWieder(t) : adapter.speichereTermin(t)))));
      return mitRueckgaengig(r, t && einzelnWiederherstellbar(id) ? zurueck : null);
    },

    /**
     * Sachen für Krabbelstube/Kindergarten: einmalig (`wochen` = 1), als wöchentliche Serie (`wochen` > 1)
     * oder, mit `id`, als Änderung genau dieser Sache. Wirft sofort bei ungültigen Eingaben. → wie `ergebnisVon`, dazu
     * { ids, verschoben, uebersprungen }.
     */
    async sachenSpeichern(roh, { wochen = 1, id = null } = {}) {
      pruefeWochen(wochen);
      if (id) {
        const alt = kern.state.termine.find((t) => t.id === id);
        const basis = normalisiereTermin({ ...roh, typ: 'kita_sache', serie: alt?.serie });
        return { ...(await termineAnlegen([{ id, ...basis }])), ids: [id], verschoben: 0, uebersprungen: [] };
      }
      if (wochen === 1) {
        const termin = { id: neueId(), ...normalisiereTermin({ ...roh, typ: 'kita_sache', serie: undefined }) };
        return { ...(await termineAnlegen([termin])), ids: [termin.id], verschoben: 0, uebersprungen: [] };
      }
      const r = serieTermine(roh, wochen);
      return { ...(await termineAnlegen(r.termine)), ids: r.termine.map((t) => t.id), verschoben: r.verschoben, uebersprungen: r.uebersprungen };
    },

    /** Pyjamas-Wechsel: wöchentlich „Pyjamas hinbringen“ (hinTag) und „Pyjamas heimholen“ (heimTag), Mo = 0 … Fr = 4. → wie `sachenSpeichern`. */
    async pyjamasWechselSpeichern({ hinTag = 0, heimTag = 4, wochen = 8, mitnehmen = ['Pyjamas'] } = {}) {
      pruefeWochen(wochen);
      for (const tag of [hinTag, heimTag]) {
        if (!Number.isInteger(tag) || tag < 0 || tag > 4) throw new Error('Bitte Wochentage von Montag bis Freitag wählen.');
      }
      const heute = todayVienna(jetzt());
      const { bringzeit, abholzeit } = kern.state.settings;
      const hin = serieTermine({ richtung: 'hin', date: naechsterWochentag(heute, hinTag), time: bringzeit, mitnehmen, kosten: null }, wochen);
      const heim = serieTermine({ richtung: 'heim', date: naechsterWochentag(heute, heimTag), time: abholzeit, mitnehmen, kosten: null }, wochen);
      const neue = [...hin.termine, ...heim.termine];
      return {
        ...(await termineAnlegen(neue)),
        ids: neue.map((t) => t.id),
        verschoben: hin.verschoben + heim.verschoben,
        uebersprungen: [...hin.uebersprungen, ...heim.uebersprungen],
      };
    },

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

    /** Löscht diese Sache und, falls sie zu einer Serie gehört, alle folgenden. Gibt die Anzahl gelöschter Sachen zurück. */
    async terminLoeschenAbHier(id) {
      const t = kern.state.termine.find((x) => x.id === id);
      if (!t) return 0;
      const weg = t.serie ? kern.state.termine.filter((x) => x.serie === t.serie && x.date >= t.date) : [t];
      await aendere({ termine: kern.state.termine.filter((x) => !weg.includes(x)) }, async (bericht) => {
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
      const t = kern.state.termine.find((x) => x.id === id);
      if (!t) return { rueckgaengig: async () => {} };
      await aendere({ termine: kern.state.termine.filter((x) => x.id !== id) }, () => adapter.loescheTermin(id));
      return {
        rueckgaengig: async () => {
          await aendere({ termine: [...kern.state.termine.filter((x) => x.id !== id), t] }, () => adapter.speichereTermin(t));
        },
      };
    },

    /**
     * Schichtplan beim Öffnen seiner Seite: die Schichtarten (falls noch nicht gelesen) und der Monat `jm` mit seinem Vor- und
     * Folgemonat, alles gleichzeitig (Status, Fehler und eigene Änderungen siehe `schichtLesen`).
     */
    async schichtLaden(jm) {
      tageImMonat(jm); // wirft bei einem ungültigen Monat
      await schichtLesen([monatVor(jm, 1), jm, monatVor(jm, -1)]);
    },

    /**
     * Schichtplan, Fixkosten und Autos im Hintergrund nach dem Start (Google und Demo), damit die Erinnerungen von jedem Telefon aus
     * stimmen: liest die Schichtarten (immer neu), den laufenden Monat mit den zwei folgenden und – gleichzeitig – die vier Teile der
     * Fixkosten (Kündigungsfristen) und die Autos samt Verlauf (Vignette, Pickerl …; sie zählen NICHT für das Tor, siehe
     * state.autos.frisch); erst wenn Schichtplan und Fixkosten gelesen sind, gilt `schicht.vorgeladen` = der laufende Monat (das eine
     * Tor für den Push-Plan: bleibt, auch wenn ein späteres Vorladen im selben Monat scheitert; nach dem Monatswechsel braucht es ein
     * neues Vorladen). Fehlt Papa noch eine später dazugekommene Standardart (E – Ersatzdienst), wird sie einmal still ergänzt
     * (siehe `schichtKatalogStillErgaenzen`; das zweite Telefon ergänzt nichts doppelt). Tut nichts vor dem Laden, solange nur
     * der gespeicherte Stand zu sehen ist oder die Anmeldung fehlt (danach erneut anstoßen). Wirft nicht; Lesefehler stehen im Status.
     */
    schichtVorladen() {
      if (schichtVorladenLaeuft) return schichtVorladenLaeuft;
      if (!adapter.leseSchichtMonat || !kern.state.geladen || kern.state.nurSnapshot || kern.state.anmeldungNoetig) return Promise.resolve();
      const jm = todayVienna(jetzt()).slice(0, 7);
      schichtVorladenLaeuft = (async () => {
        // die Autos gleichzeitig, aber ohne Einfluss auf das Push-Tor: Termine, Schicht, Fixkosten und Kontostand warten nie auf sie
        // (ob die Autos frisch sind, steht in state.autos.frisch; Wiederholen nach einem Fehler: eigener Vorlader in der Shell). Nur
        // angestoßen, NIE abgewartet: eine hängende Auto-Anfrage (api.js kennt kein Timeout) hielte sonst dieses Vorladen belegt, und das
        // Tor für den nächsten Monat ginge nicht auf. Wer die Autos braucht, wartet auf `autosLaden()` (dasselbe laufende Lesen).
        if (adapter.leseAutos) autosHolen();
        if (adapter.leseVersicherung) versHolen(); // ebenso die Versicherung: nur angestoßen, nie abgewartet (eigener Vorlader in der Shell)
        const [{ katalogGelesen, monateGelesen }, fixOk] = await Promise.all([schichtLesen(vorladeMonate(jm), { katalogNeu: true }), adapter.leseFixkosten ? fixLesen() : true]);
        if (katalogGelesen && monateGelesen && fixOk && kern.state.schicht.vorgeladen !== jm) {
          kern.state = { ...kern.state, schicht: { ...kern.state.schicht, vorgeladen: jm } };
          melden();
        }
        // nur, wenn die Schichtarten gerade gelesen werden konnten (gespeichert wird ohnehin auf der neuesten Fassung)
        if (katalogGelesen && kern.state.schicht.katalog && katalogErgaenzen(kern.state.schicht.katalog).geaendert) await schichtKatalogStillErgaenzen();
      })()
        .catch(() => {}) // Hintergrund: ein Fehler darf nichts stören
        .finally(() => {
          schichtVorladenLaeuft = null;
        });
      return schichtVorladenLaeuft;
    },

    /**
     * Unmittelbar vor jedem Senden des Push-Plans (push/client.js `sync`): Schichtarten und die vorgeladenen Monate (der laufende und
     * die zwei danach) frisch aus dem Kalender. Der Plan ersetzt beim Push-Dienst den der ganzen Familie; aus einem veralteten Stand
     * würde er Zusätze löschen (oder zurückbringen), die das andere Telefon inzwischen eingetragen (oder entfernt) hat – und für sie gibt
     * es keine Erinnerung von Google Kalender. Ebenso, gleichzeitig, die vier Teile der Fixkosten (`fixFrischLesen`: Erinnerungen an
     * Kündigungsfristen gehen an beide Telefone). Die Autos (`autosFrischLesen`) und die Versicherung (`versicherungFrischLesen`) werden nur angestoßen, nicht abgewartet. Gemeldet wird nur eine echte Änderung (siehe `schichtAktualisieren`); danach gilt der
     * laufende Monat als vorgeladen. Ergebnis: true = beides aktuell, false = ging gerade nicht (nicht geladen, Lesefehler, eigene
     * Änderung wird noch gespeichert) – dann nicht senden. Höchstens ein Lesen gleichzeitig; wirft nicht.
     */
    schichtFrischLesen() {
      if (schichtFrischLaeuft) return schichtFrischLaeuft;
      const jm = todayVienna(jetzt()).slice(0, 7);
      schichtFrischLaeuft = (async () => {
        if (adapter.leseAutos) store.autosFrischLesen(); // nebenher, ohne zu warten: ändert es etwas, löst das einen neuen Plan aus (planQuellen)
        if (adapter.leseVersicherung) store.versicherungFrischLesen(); // ebenso
        const [schichtOk, fixOk] = await Promise.all([store.schichtAktualisieren(vorladeMonate(jm)), adapter.leseFixkosten ? store.fixFrischLesen() : true]);
        const ok = schichtOk && fixOk;
        if (ok && kern.state.schicht.vorgeladen !== jm) {
          kern.state = { ...kern.state, schicht: { ...kern.state.schicht, vorgeladen: jm } };
          melden();
        }
        return ok;
      })()
        .catch(() => false)
        .finally(() => {
          schichtFrischLaeuft = null;
        });
      return schichtFrischLaeuft;
    },

    /**
     * Holt Schichtarten und die Monate `jms` neu (das andere Telefon hat vielleicht etwas eingetragen; alle 30 Sekunden und beim
     * Zurückkehren). Eigene Änderungen gehen vor: solange etwas gespeichert wird oder wartet, wird nicht gefragt, und eine Antwort,
     * während der selbst etwas geändert wurde, wird verworfen. Neu gezeichnet wird nur bei einer echten Änderung.
     * Ergebnis: true, wenn der Stand jetzt aktuell ist; false, wenn es gerade nicht ging oder die Antwort verworfen wurde.
     */
    async schichtAktualisieren(jms) {
      if (!adapter.leseSchichtMonat || !kern.state.geladen || kern.state.nurSnapshot || kern.state.anmeldungNoetig) return false;
      if (kern.schreibend > 0 || wartend.length > 0 || schichtSchreibtNoch()) return false;
      const stand = kern.schreibStand;
      let gelesen;
      try {
        gelesen = await Promise.all([adapter.leseSchichtarten(), ...jms.map((jm) => adapter.leseSchichtMonat(jm))]);
      } catch (fehler) {
        if (istAuthFehler(fehler)) {
          kern.state = { ...kern.state, anmeldungNoetig: true };
          melden();
        }
        return false;
      }
      if (stand !== kern.schreibStand || kern.schreibend > 0 || wartend.length > 0 || schichtSchreibtNoch()) return false;
      const [katalog, ...monate] = gelesen;
      const s = kern.state.schicht;
      const neu = { ...s, katalog: normalisiereKatalog(katalog?.katalog ?? null).katalog, monate: { ...s.monate }, status: { ...s.status } };
      let geaendert = unlesbarMerken('schichtarten', katalog?.unlesbar === true);
      jms.forEach((jm, i) => {
        neu.monate[jm] = normalisiereMonat(monate[i]?.monat ?? null, jm).monat;
        neu.status[jm] = 'geladen';
        geaendert = unlesbarMerken(`schicht:${jm}`, monate[i]?.unlesbar === true) || geaendert;
      });
      if (JSON.stringify(neu) !== JSON.stringify(s)) {
        kern.state = { ...kern.state, schicht: neu };
        geaendert = true;
      }
      if (geaendert) melden();
      return true;
    },

    /**
     * Schichtplan: Pinsel (gleiche Art noch einmal = frei), Art setzen (`k: null` = frei), Notiz, Zusatz mit Uhrzeit dazu oder weg.
     * Der Pinsel entscheidet nach dem ANGEZEIGTEN Tag (mit allen offenen Tipps) und speichert das Ergebnis als reines Setzen: so bleibt das
     * Neu-Anwenden auf der neuesten Fassung wiederholbar und löscht keinen Tag, auf dem das andere Telefon schon dieselbe Art eingetragen hat.
     */
    schichtPinsel: (jm, tag, person, k) => {
      const ziel = schichtAm(schaltePinsel(schichtTeil(jm) ?? leererMonat(jm), { person, tag, k }), person, tag);
      return schichtMonatAendern(jm, (m) => setzeSchicht(m, { person, tag, k: ziel }));
    },
    schichtSetzen: (jm, tag, person, k) => schichtMonatAendern(jm, (m) => setzeSchicht(m, { person, tag, k })),
    schichtNotiz: (jm, tag, person, text) => schichtMonatAendern(jm, (m) => setzeNotiz(m, { person, tag, text })),
    schichtZusatzHinzufuegen: (jm, tag, person, { k, von, bis }) => schichtMonatAendern(jm, (m) => zusatzHinzufuegen(m, { person, tag, k, von, bis })),
    schichtZusatzEntfernen: (jm, tag, person, { k, von, bis }) => schichtMonatAendern(jm, (m) => zusatzEntfernen(m, { person, tag, k, von, bis })),

    /**
     * Zusatz im Tagesblatt löschen (✕): wie `schichtZusatzEntfernen`, aber → { ok, fehler?, gemeldet?, wartet?, rueckgaengig? };
     * `rueckgaengig()` bringt genau diesen Zusatz an seine Stelle zurück. Wirft, wenn die Eingabe schon am angezeigten Stand abgelehnt wird.
     */
    async schichtZusatzLoeschen(jm, tag, person, { k, von, bis }) {
      let stelle = -1;
      const r = teilErgebnis(
        await schichtMonatSchreiben(jm, (m) => {
          stelle = (m.z?.[person]?.[tag] ?? []).findIndex((x) => x.k === k && x.von === von && x.bis === bis); // auf der neuesten Fassung
          return zusatzEntfernen(m, { person, tag, k, von, bis });
        }),
      );
      const zurueck = async () => {
        try {
          return teilErgebnis(await schichtMonatSchreiben(jm, (m) => zusatzWiederherstellen(m, { person, tag, k, von, bis }, stelle)));
        } catch (e) {
          return { ok: false, fehler: e?.message || TEXT_FEHLER };
        }
      };
      return mitRueckgaengig(r, stelle >= 0 ? zurueck : null);
    },

    /**
     * Schichtart anlegen (ohne `k`) oder ändern (mit `k`): { ok: true, k } nach dem Speichern im Kalender, sonst { ok: false, fehler, gemeldet?, wartet? }
     * (siehe `schichtKatalogAendern`). Eine neue Art wird nach dem Speichern an ihrem Kürzel im gespeicherten Katalog wiedergefunden
     * (hat das andere Telefon gleichzeitig eine angelegt, kann ihr Schlüssel ein anderer sein). Wirft bei einer ungültigen Eingabe.
     */
    async schichtArtSpeichern(person, entwurf, k) {
      const aendern = k !== undefined && k !== null;
      const r = await schichtKatalogAendern((kat) => (aendern ? artAendern(kat, person, k, entwurf) : artHinzufuegen(kat, person, entwurf)));
      if (!r.ok) return r;
      if (aendern) return { ok: true, k };
      const kuerzel = String(entwurf.kuerzel ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de');
      const art = kern.state.schicht.katalog?.arten?.[person]?.find((a) => a.kuerzel.toLocaleLowerCase('de') === kuerzel);
      return { ok: true, k: art?.k ?? null };
    },
    /** Art ausblenden (`archiv` true) oder zurückholen; Ergebnis wie `schichtKatalogAendern`. */
    schichtArtArchivieren: (person, k, archiv) => schichtKatalogAendern((kat) => artArchivieren(kat, person, k, archiv)),
    /** Art mit der Nachbarin tauschen (−1 hoch, 1 runter); Ergebnis wie `schichtKatalogAendern`. */
    schichtArtVerschieben: (person, k, richtung) => schichtKatalogAendern((kat) => artVerschieben(kat, person, k, richtung)),

    /** Nur die Sparziele neu lesen (siehe `zieleLesenNeu`): hebt die Sperre nach einem gescheiterten Lesen auf. → true, wenn gelesen; wirft nie. */
    zieleLaden: () => zieleLesenNeu(),

    /** Fixkosten beim Öffnen ihrer Seite: die vier Teile lesen (siehe `fixLesen`). → true, wenn gelesen; wirft nicht. */
    fixLaden: () => fixLesen(),

    /**
     * Fixkosten frisch aus dem Kalender (vor dem Senden des Push-Plans, siehe `schichtFrischLesen`; auch beim Zurückkehren nutzbar).
     * Eigene Änderungen gehen vor: solange etwas gespeichert wird oder wartet, wird nicht gefragt, und eine Antwort, während der selbst
     * etwas geändert wurde, wird verworfen. Gemeldet wird nur eine echte Änderung. → true = aktuell, false = ging gerade nicht. Wirft nicht.
     */
    fixFrischLesen() {
      if (fixFrischLaeuft) return fixFrischLaeuft;
      const moeglich = () => adapter.leseFixkosten && kern.state.geladen && !kern.state.nurSnapshot && !kern.state.anmeldungNoetig;
      const eigene = () => kern.schreibend > 0 || wartend.length > 0 || fixSchreibtNoch();
      if (!moeglich() || eigene()) return Promise.resolve(false);
      fixFrischLaeuft = (async () => {
        const stand = kern.schreibStand;
        let gelesen;
        try {
          gelesen = await adapter.leseFixkosten();
        } catch (fehler) {
          if (istAuthFehler(fehler)) {
            kern.state = { ...kern.state, anmeldungNoetig: true };
            melden();
          }
          return false;
        }
        if (stand !== kern.schreibStand || eigene()) return false;
        const neu = { shards: fixTeile(gelesen?.shards), status: 'geladen', warnungen: gelesen?.warnungen ?? [], unlesbar: unlesbareNummern(gelesen?.unlesbar) };
        fixGelesen = true;
        if (JSON.stringify(neu) !== JSON.stringify(kern.state.fixkosten)) {
          kern.state = { ...kern.state, fixkosten: neu };
          melden();
        }
        return true;
      })()
        .catch(() => false)
        .finally(() => {
          fixFrischLaeuft = null;
        });
      return fixFrischLaeuft;
    },

    /**
     * Fixkosten-Posten anlegen (ohne `id`: neue Kennung; Startmonat = `start` oder der laufende Monat in Wien) oder ändern (mit `id`; das
     * Archivdatum bleibt, wie es im Kalender steht – dafür gibt es Archivieren/Zurückholen). Geschrieben wird nur in den Teil des Postens,
     * als reine Änderung auf der NEUESTEN Fassung (zwei Telefone überschreiben sich nicht; hat das andere Telefon den Posten inzwischen
     * endgültig gelöscht, wird er nicht wieder angelegt). Vorher müssen die Fixkosten einmal gelesen sein (sonst wird erst gelesen).
     * Ergebnis: { ok: true, id } | { ok: false, fehler } (ungültige Eingabe mit der Meldung von `postenPruefen`, mehr als 100 Posten,
     * Teil zu voll, Speicherfehler – dann zurückgenommen und neu gelesen) | { ok: false, wartet: true, fehler } (nach dem Anmelden
     * gespeichert). Wirft nie.
     */
    async fixPostenSpeichern(entwurf) {
      const { archiv: _archiv, ...roh } = entwurf && typeof entwurf === 'object' ? entwurf : {};
      const neu = !roh.id;
      const posten = { ...roh, start: roh.start || todayVienna(jetzt()).slice(0, 7) };
      if (neu) delete posten.id;
      const ungueltig = postenPruefen(posten);
      if (ungueltig) return { ok: false, fehler: ungueltig };
      const nichtBereit = await fixBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      if (neu) {
        const zuViele = postenAnzahlPruefen(kern.state.fixkosten.shards, null);
        if (zuViele) return { ok: false, fehler: zuViele };
        const wahl = neueFixIdFuer(posten); // erst nach dem Lesen: so ist sie sicher noch nicht vergeben, und ihr Teil hat Platz
        if (wahl.fehler) return { ok: false, fehler: wahl.fehler };
        posten.id = wahl.id;
      }
      const nr = neu ? shardFuer(posten.id) : fixTeilVon(posten.id);
      if (fixGesperrt(nr)) return { ok: false, fehler: TEXT_TEIL_GESPERRT };
      const fn = neu
        ? (shard) => postenSetzen(shard, posten)
        : (shard) => {
            const alt = fixVorhanden(shard, posten.id);
            return postenSetzen(shard, alt.archiv ? { ...posten, archiv: alt.archiv } : posten);
          };
      try {
        const r = await fixTeilAendern(nr, fn);
        return r.ok ? { ok: true, id: posten.id } : r;
      } catch (e) {
        return { ok: false, fehler: e?.message || TEXT_FEHLER }; // schon auf dem angezeigten Stand abgelehnt (z. B. Teil zu voll): nichts geändert
      }
    },

    /** Posten ins Archiv ab `datum` ('JJJJ-MM-TT', Standard: heute in Wien); zählt ab dann nicht mehr. Ergebnis wie `fixPostenSpeichern` (ohne id). */
    fixPostenArchivieren: (id, datum = todayVienna(jetzt())) => fixPostenAendern(id, (shard) => postenArchivieren(shard, id, datum)),
    /** Posten aus dem Archiv zurückholen. */
    fixPostenWiederherstellen: (id) => fixPostenAendern(id, (shard) => postenWiederherstellen(shard, id)),
    /**
     * Posten endgültig löschen – aktiv (z. B. doppelt eingetragen) oder aus dem Archiv. Ergebnis wie `fixPostenArchivieren`, bei Erfolg
     * mit `rueckgaengig()`: legt genau den gelöschten Posten (wie er im Kalender stand) wieder an, siehe `fixPostenWiederanlegen`.
     */
    async fixPostenLoeschen(id) {
      let weg = null;
      let stelle = -1;
      const r = await fixPostenAendern(id, (shard) => {
        stelle = shard.posten.findIndex((p) => p.id === id); // auf der neuesten Fassung: das wirklich Gelöschte und seine Stelle
        weg = shard.posten[stelle] ?? null;
        return postenLoeschen(shard, id);
      });
      return mitRueckgaengig(r, weg ? () => store.fixPostenWiederanlegen(weg, stelle) : null);
    },

    /**
     * „Rückgängig“ nach dem Löschen: speichert genau diesen Posten (mit seiner Kennung, auch archiviert; an seiner alten Stelle `stelle`,
     * falls angegeben) wieder – über denselben Weg wie
     * einen neuen (Prüfung, vorher gelesen, höchstens 100 Posten, gesperrter Teil, Platz im Teil, auf der neuesten Fassung). Gibt es ihn
     * schon wieder, bleibt alles, wie es ist; ein Eintrag einer neueren Version mit derselben Kennung wird nie überschrieben.
     * → { ok: true, id } | { ok: false, fehler, gemeldet? } | { ok: false, wartet: true, fehler }. Wirft nie.
     */
    async fixPostenWiederanlegen(posten, stelle) {
      if (!istObjekt(posten) || typeof posten.id !== 'string' || posten.id === '') return { ok: false, fehler: 'Ungültige Kennung.' };
      const ungueltig = postenPruefen(posten);
      if (ungueltig) return { ok: false, fehler: ungueltig };
      const nichtBereit = await fixBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const nr = shardFuer(posten.id);
      if (fixGesperrt(nr)) return { ok: false, fehler: TEXT_TEIL_GESPERRT };
      const schonDa = (kern.state.fixkosten.shards ?? []).some((s) => s?.posten.some((p) => p.id === posten.id));
      const zuViele = schonDa ? null : postenAnzahlPruefen(kern.state.fixkosten.shards, posten.id);
      if (zuViele) return { ok: false, fehler: zuViele };
      const fn = (shard) => {
        if (shard.posten.some((p) => p.id === posten.id)) return shard;
        if ((shard.fremd ?? []).some((k) => k?.i === posten.id)) throw new Error(TEXT_FIX_NEUER);
        return postenWiederanlegen(shard, posten, stelle);
      };
      try {
        const r = await fixTeilAendern(nr, fn);
        return r.ok ? { ok: true, id: posten.id } : r;
      } catch (e) {
        return { ok: false, fehler: e?.message || TEXT_FEHLER }; // schon auf dem angezeigten Stand abgelehnt (z. B. Teil zu voll): nichts geändert
      }
    },

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

    async einstellungen(teil) {
      const settings = normalizeSettings({ ...kern.state.settings, ...teil });
      await aendere({ settings }, async () => {
        await adapter.speichereSettings(teil);
        if (unlesbarMerken('settings', false)) melden(); // nicht abgelehnt: die gespeicherten Einstellungen waren lesbar
      });
    },

    /** Erinnerungen (nur mit Google): prüfen, reparieren, Test-Erinnerung starten/beenden. Fehler der Anmeldung laufen nach oben. */
    erinnerungenPruefen: () => adapter.pruefeErinnerungen(),
    erinnerungenReparieren: () => adapter.repariereErinnerungen(),
    erinnerungenTestStarten: () => adapter.starteTestErinnerung(),
    erinnerungenTestBeenden: () => adapter.beendeTestErinnerung(),

    async zuruecksetzen() {
      const daten = await adapter.zuruecksetzen();
      kern.state = { ...kern.state, ...daten, schicht: daten.schicht ? schichtAusDaten(daten.schicht) : leererSchichtplan(), fixkosten: fixAusDaten(daten.fixkosten), ziele: daten.ziele ? zieleZustand(daten.ziele, 'geladen') : leererZieleZustand(), autos: daten.autos ? autosZustand(daten.autos, 'gespeichert') : leererAutosZustand(), versicherung: daten.versicherung ? versicherungZustand(daten.versicherung, 'gespeichert') : leererVersicherungZustand(), geladen: true, fehler: null };
      fixGelesen = false; // vor dem nächsten Ändern erst aus dem (neuen) Speicher lesen
      autosGelesen = false;
      versGelesen = false;
      melden();
      store.schichtVorladen(); // neue Beispieldaten: im Hintergrund wieder vorladen (wirft nicht)
    },
  });
  return store;
}
