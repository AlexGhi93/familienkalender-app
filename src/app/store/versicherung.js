import { todayVienna } from '../../domain/dates.js';
import { istObjekt } from '../../domain/gemeinsam.js';
import { TEXT_ANDERE_POLIZZE, TEXT_POLIZZE_WEG, TEXT_RECHNUNG_WEG, TEXT_VERSICHERUNG_GESPERRT, TEXT_VERSICHERUNG_TEIL_GESPERRT, erstattungSetzen, fassungJetzt, leererVersicherungTeil, leereVersicherung, polizzeAendern, polizzeAnlegen, polizzeBeenden as polizzeBeendenRein, polizzeEntfernen, polizzeVonRechnung, rechnungJahr, rechnungLoeschen as rechnungLoeschenRein, rechnungPruefen, rechnungQuartal, rechnungSetzen, rechnungSpur, rechnungTeilWechseln, rechnungWiederherstellen, versicherungJahrBekannt, versicherungJahrEintragen, versicherungTeilWarnungen, versicherungWarnungen } from '../../domain/versicherung.js';
import { rechnungFinden } from '../../domain/versicherung-rechnung.js';
import { FACHLICH, TEXT_FEHLER, gleichOder } from './kern.js';
import { createGeteilt, eintragVorhanden, neueKennung } from './geteilt.js';

const TEXT_VERSICHERUNG_NICHT_GELESEN = 'Die Versicherung konnte nicht gelesen werden. Bitte noch einmal versuchen.';
const TEXT_VERSICHERUNG_ANMELDEN = 'Bitte zuerst neu anmelden; danach lässt sich die Versicherung ändern.';
const TEXT_KEINE_POLIZZE = 'Bitte zuerst die Polizze anlegen.';
const TEXT_POLIZZE_FEHLT = 'Bitte die Polizze der Rechnung wählen.';
const TEXT_POLIZZE_BEENDET = 'Diese Versicherung ist beendet – bitte zuerst wieder aktivieren.';
const TEXT_KOPIE_GEAENDERT = 'Gespeichert. Die Rechnung wurde inzwischen auf dem anderen Telefon geändert – bitte noch einmal ansehen.';
const TEXT_KATEGORIE_UNPRUEFBAR = 'Ein Teil der Rechnungen ist unlesbar – ob die Kategorie dort noch vorkommt, lässt sich nicht prüfen. Bitte die App auf beiden Telefonen aktualisieren.';

/**
 * Versicherung im Zustand (wie die Autos): `daten` = Hauptteil { v, polizzen, stamm, ab, fremd?, ausV1? } (domain/versicherung.js; unlesbar → leer),
 * `teile` = { [jahr]: { [quartal]: { v, jahr, quartal, rechnungen, fremd? } } } (die gelesenen Quartal-Teile; ein nie angelegter fehlt),
 * `geschrieben` = { [jahr]: { [quartal]: Zeitstempel } } (Google: `updated`; entscheidet bei doppelt stehenden Rechnungen nur, wenn ihre
 * `fassung` gleich ist, siehe rechnungenDesJahres(teile, jahr, { geschrieben })), `status` null | 'gespeichert' | 'laedt' | 'geladen' | 'fehler' wie bei den Autos,
 * `warnungen` = Hinweise für die Anzeige, `unlesbar` = { main?: true, teile: [{ jahr, quartal }] } (leer gezeigt und gesperrt), `frisch`
 * = das LETZTE Lesen aus dem Kalender in dieser Sitzung ist gelungen – nur dann gehören Versicherungs-Erinnerungen in den Push-Plan
 * (Task 3); der übrige Plan wartet nie auf die Versicherung. `bestaetigt` = { daten, teile } des zuletzt GESPEICHERTEN Stands, nur
 * solange eigene Änderungen offen sind (für den Schnappschuss).
 */
export const leererVersicherungZustand = () => ({ daten: leereVersicherung(), teile: {}, geschrieben: {}, status: null, warnungen: [], unlesbar: { teile: [] }, frisch: false });

/** Unlesbare Teile aus dem, was Adapter oder Schnappschuss liefern: { main?: true, teile: [{ jahr, quartal }] } (Ungültiges fällt weg). */
function unlesbareVersicherung(roh) {
  const teile = (Array.isArray(roh?.teile) ? roh.teile : []).filter((x) => Number.isInteger(x?.jahr) && Number.isInteger(x?.quartal) && x.quartal >= 1 && x.quartal <= 4).map(({ jahr, quartal }) => ({ jahr, quartal }));
  return { ...(roh?.main === true ? { main: true } : {}), teile };
}

/** Zustand der Versicherung aus dem, was Adapter ({ daten, teile, geschrieben, warnungen, unlesbar }) oder Schnappschuss liefern. */
export function versicherungZustand(gelesen, status) {
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
 * Scheibe „Versicherung“ des Stores: Hauptteil (Polizze) und Quartal-Teile (Rechnungen) lesen und ändern. `store` = die Fassade,
 * `versicherungId` = Quelle neuer Kennungen, `versicherungFristMs` = Frist für das Lesen.
 * → { methoden (öffentliche Methoden des Stores), intern (was Fassade und Schichtplan brauchen) }.
 */
export function createVersicherungSlice(kern, { store, versicherungId, versicherungFristMs }) {
  const { adapter, jetzt, melden, mitRueckgaengig, fachlich, fachlichAsync } = kern;
  // Hauptteil ('haupt' = fkversicherung: Polizze + erstes Jahr) und Quartal-Teile ('t:<jahr>:<quartal>' = fkvr<JJJJ><Q> mit den
  // Rechnungen) laufen über die gemeinsame Maschine (geteilt.js); ein Teil heißt hier überall `t` = { jahr, quartal }.
  const maschine = createGeteilt(kern, {
    bereich: 'versicherung',
    teileFeld: 'teile',
    nebenFelder: ['geschrieben'],
    unlesbarFeld: 'teile',
    teilFelder: ['jahr', 'quartal'],
    teilKuerzel: 't',
    adapter: { lesen: 'leseVersicherung', aendern: 'aendereVersicherung', teilLesen: 'leseVersicherungTeil', teilAendern: 'aendereVersicherungTeil' },
    teilAntwort: 'teil',
    gesperrt: { haupt: 'VersicherungGesperrt', teil: 'VersicherungTeilGesperrt' },
    zustand: versicherungZustand,
    leererHaupt: leereVersicherung,
    leererTeil: (t) => leererVersicherungTeil(t.jahr, t.quartal),
    hauptWarnungen: () => versicherungWarnungen({ unlesbar: true }),
    teilWarnungen: (leer) => versicherungTeilWarnungen({ teil: leer, unlesbar: true }),
    vorTeilSchreiben: (t) => versJahrSichern(t.jahr),
    texte: { nichtGelesen: TEXT_VERSICHERUNG_NICHT_GELESEN, anmelden: TEXT_VERSICHERUNG_ANMELDEN, gesperrt: TEXT_VERSICHERUNG_GESPERRT },
    fristMs: versicherungFristMs,
  });
  const { offen: versOffen, teilGesperrt: versTeilGesperrt, hauptSperren: versHauptSperren, holen: versHolen, bereit: versBereit, hauptAendern: versHauptAendern, teilAendern: versTeilAendern, hauptSicher: versHauptSicher } = maschine;
  const gleicherTeil = (a, b) => a.jahr === b.jahr && a.quartal === b.quartal;
  const teilVonRechnung = (r) => ({ jahr: rechnungJahr(r), quartal: rechnungQuartal(r) });
  const quartalText = ({ jahr, quartal }) => `${quartal}. Quartal ${jahr}`;
  /** Der zuletzt GESPEICHERTE Hauptteil (offene eigene Änderungen nicht mitgezählt). */
  const versHauptBasis = () => versOffen.get('haupt')?.basis ?? kern.state.versicherung.daten;

  /**
   * In dieser Sitzung bestätigt: der Hauptteil im Kalender ist v:2 (gelesen oder selbst so geschrieben). Bis dahin liest der erste
   * Schreibvorgang eines Teils den Hauptteil frisch – der Merker `ausV1` der angezeigten Daten geht über den Schnappschuss verloren.
   */
  let hauptV2 = false;
  /** Daten ohne den Merker „aus v:1 gelesen“ (geschrieben wird ohnehin v:2; so ist es eine echte Änderung). */
  const ohneV1 = (d) => {
    if (d?.ausV1 !== true) return d;
    const { ausV1: _v1, ...rest } = d;
    return rest;
  };

  /**
   * Vor dem Schreiben eines Quartal-Teils: ist der Hauptteil im Kalender noch v:1 (1.4.x), wird er zuerst als v:2 geschrieben – ein
   * Telefon mit 1.4.x sperrt dann die Versicherung, statt neue Rechnungen (mit `p`) still unter `fremd` zu verstecken. Kennt der zuletzt
   * GESPEICHERTE Hauptteil das Jahr nicht, wird es dabei eingetragen. Beides in DEMSELBEN Schreibvorgang wie der Teil (auch beim
   * Nachholen nach der Anmeldung): scheitert es, wird der Teil nicht geschrieben; es entsteht nie ein Teil vor dem ersten Jahr (er würde
   * nie gelesen). Ist nichts zu tun, wird nur gelesen.
   */
  async function versJahrSichern(jahr) {
    const e = versOffen.get('haupt');
    const basis = e?.basis ?? kern.state.versicherung.daten;
    if (basis?.ausV1 === true) hauptV2 = false;
    if (hauptV2 && versicherungJahrBekannt(basis, jahr)) return;
    let gespeichert;
    try {
      gespeichert = await adapter.aendereVersicherung(
        fachlich((d) => {
          const neu = versicherungJahrEintragen(ohneV1(d), jahr);
          return neu === d ? null : neu; // schon v:2 und das Jahr bekannt: nichts schreiben
        }),
      );
    } catch (fehler) {
      if (fehler?.name === 'VersicherungGesperrt') {
        FACHLICH.add(fehler);
        versHauptSperren();
      }
      throw fehler;
    }
    hauptV2 = true;
    if (!gespeichert) return;
    if (e) e.basis = gespeichert;
    else kern.state = { ...kern.state, versicherung: { ...kern.state.versicherung, daten: gleichOder(kern.state.versicherung.daten, gespeichert) } };
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

  /**
   * Kennungen der Kategorien, auf die eine Rechnung der Polizze `polizzeId` in einem angezeigten Teil zeigt (alle Fassungen, auch fremde
   * Rechnungen, roh mit `k` und `p`; ohne Polizze gehört eine Rechnung der Stamm-Polizze, siehe polizzeVonRechnung).
   */
  function benutzteKategorien(polizzeId) {
    const { daten, teile } = kern.state.versicherung;
    const ids = new Set();
    for (const quartale of Object.values(teile)) {
      for (const teil of Object.values(quartale ?? {})) {
        for (const r of teil?.rechnungen ?? []) if (polizzeVonRechnung(daten, r) === polizzeId) ids.add(r.kategorie);
        for (const k of teil?.fremd?.r ?? []) if (polizzeVonRechnung(daten, { polizze: k?.p }) === polizzeId) ids.add(k?.k);
      }
    }
    return ids;
  }

  /** Neue Kennung (über `versicherungId`, 0-9a-v), die in `vergeben` noch nicht vorkommt; sonst null. */
  const neueVersKennung = (vergeben) => neueKennung(versicherungId, vergeben);

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
    if ((kern.state.versicherung.daten.polizzen ?? []).length === 0) return;
    pruefe(await versHauptAendern((d) => ({ ...leereVersicherung(), ab: bleibt ? d.ab : null })));
  }

  const methoden = {
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
      return maschine.frischLesen();
    },

    /**
     * Polizze anlegen oder ändern. Ohne `id`: eine neue Polizze (aus einer Vorlage oder „Eigene Polizze“), die Kennung vergibt der Store;
     * legen beide Telefone gleichzeitig eine an, bleiben beide (höchstens MAX_POLIZZEN). Mit `id`: diese Polizze ändern (unbekannt →
     * TEXT_POLIZZE_WEG); eine ihrer Kategorien, auf die noch Rechnungen dieser Polizze zeigen, lässt sich nicht entfernen (C4).
     * → { ok: true, id } | { ok: false, fehler, gemeldet? } | { ok: false, wartet: true, fehler }. Wirft nie.
     */
    async polizzeSpeichern(eingabe) {
      const x = istObjekt(eingabe) ? eingabe : {};
      const nichtBereit = await versBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      const polizzen = kern.state.versicherung.daten.polizzen ?? [];
      if (x.id == null) {
        const id = neueVersKennung(new Set(polizzen.map((p) => p.id)));
        if (!id) return { ok: false, fehler: TEXT_FEHLER };
        const r = await versHauptSicher((d) => polizzeAnlegen(d, { ...x, id }));
        return r.ok ? { ok: true, id } : r;
      }
      const alt = polizzen.find((p) => p.id === x.id);
      if (!alt) return { ok: false, fehler: TEXT_POLIZZE_WEG };
      const bleiben = new Set((Array.isArray(x.kategorien) ? x.kategorien : []).map((k) => k?.id));
      const entfernt = alt.kategorien.filter((k) => !bleiben.has(k.id));
      if (entfernt.length > 0) {
        if (kern.state.versicherung.unlesbar.teile.length > 0) return { ok: false, fehler: TEXT_KATEGORIE_UNPRUEFBAR };
        const benutzt = benutzteKategorien(alt.id);
        const k = entfernt.find((e) => benutzt.has(e.id));
        if (k) return { ok: false, fehler: `Die Kategorie „${k.name}“ hat noch Rechnungen – bitte diese zuerst einer anderen Kategorie zuordnen oder löschen.` };
      }
      const r = await versHauptSicher((d) => polizzeAendern(d, x));
      return r.ok ? { ok: true, id: alt.id } : r;
    },

    /**
     * Polizze `id` beenden (`beendet` true; sie bleibt mit ihren Rechnungen erhalten, neue Rechnungen nimmt sie nicht mehr) oder wieder
     * aktivieren (false). Unbekannt → TEXT_POLIZZE_WEG. → { ok: true } | wie polizzeSpeichern. Wirft nie.
     */
    async polizzeBeenden(id, beendet) {
      const r = await versHauptSicher((d) => polizzeBeendenRein(d, id, Boolean(beendet)));
      return r.ok ? { ok: true } : r;
    },

    /**
     * Polizze `id` löschen – nur ohne Rechnungen: geprüft über alle Teile, frisch gelesen (auch fremde Rechnungen; ohne Polizze gehört
     * eine Rechnung der Stamm-Polizze). Hat sie welche → TEXT_POLIZZE_HAT_RECHNUNGEN (nur beenden); ist ein Teil unlesbar, lässt sich das
     * nicht prüfen → TEXT_KATEGORIE_UNPRUEFBAR. War sie Stamm, wird die erste verbliebene Stamm. → { ok: true } | wie polizzeSpeichern.
     */
    async polizzeLoeschen(id) {
      const nichtBereit = await versBereit();
      if (nichtBereit) return { ok: false, fehler: nichtBereit };
      if (!(await versHolen())) return { ok: false, fehler: kern.state.anmeldungNoetig ? TEXT_VERSICHERUNG_ANMELDEN : TEXT_VERSICHERUNG_NICHT_GELESEN };
      if (kern.state.versicherung.unlesbar.main) return { ok: false, fehler: TEXT_VERSICHERUNG_GESPERRT };
      if (kern.state.versicherung.unlesbar.teile.length > 0) return { ok: false, fehler: TEXT_KATEGORIE_UNPRUEFBAR };
      const hatRechnungen = benutzteKategorien(id).size > 0;
      const r = await versHauptSicher((d) => polizzeEntfernen(d, id, { hatRechnungen }));
      return r.ok ? { ok: true } : r;
    },

    /**
     * Rechnung einreichen (ohne `id`: neue Kennung) oder ändern (mit `id`). `entwurf` = { kategorie, datum, betragCent, eingereichtAm,
     * erstattetCent?, erstattetAm?, stelle?, notiz?, polizze } – `polizze` (Kennung) ist Pflicht: eine neue Rechnung nur bei einer aktiven
     * Polizze, eine vorhandene bleibt bei ihrer (auch beendeten); „heute“ (Wiener Datum) bestimmt der Store; die Kategorie muss zur Polizze gehören.
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
      const daten = kern.state.versicherung.daten;
      const polizzen = daten.polizzen ?? [];
      if (polizzen.length === 0) return { ok: false, fehler: TEXT_KEINE_POLIZZE };
      const f = x.id == null ? null : versRechnungFinden(x.id);
      if (x.id != null && !f) return { ok: false, fehler: TEXT_RECHNUNG_WEG };
      if (x.polizze == null) return { ok: false, fehler: TEXT_POLIZZE_FEHLT };
      const polizze = polizzen.find((p) => p.id === x.polizze);
      if (!polizze) return { ok: false, fehler: TEXT_POLIZZE_WEG };
      // eine Rechnung bleibt bei ihrer Polizze; die einer beendeten lässt sich noch ändern, eine neue nimmt sie nicht
      if (f && polizzeVonRechnung(daten, f.rechnung) !== polizze.id) return { ok: false, fehler: TEXT_ANDERE_POLIZZE };
      if (!f && polizze.beendet) return { ok: false, fehler: TEXT_POLIZZE_BEENDET };
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
        const r = await store.rechnungSpeichern({ ...neu, polizze: polizzeVonRechnung(kern.state.versicherung.daten, f.rechnung) });
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
  };

  return {
    methoden,
    intern: {
      versHolen,
      versicherungLeeren,
      versicherungFuerSicherung,
      get versGelesen() {
        return maschine.gelesen;
      },
      set versGelesen(wert) {
        maschine.gelesen = wert;
        if (!wert) hauptV2 = false; // z. B. nach dem Zurücksetzen: vor dem nächsten Teil wieder frisch prüfen
      },
    },
  };
}
