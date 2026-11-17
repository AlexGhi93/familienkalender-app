import { todayVienna } from '../../domain/dates.js';
import { monatVor } from '../../domain/konto.js';
import { artAendern, artArchivieren, artHinzufuegen, artVerschieben, katalogErgaenzen, leererMonat, normalisiereKatalog, normalisiereMonat, schaltePinsel, schichtAm, setzeNotiz, setzeSchicht, setzeTagZeiten, standardKatalog, tageImMonat, vorladeMonate, zusatzEntfernen, zusatzHinzufuegen, zusatzWiederherstellen } from '../../domain/schicht.js';
import { TEXT_FEHLER, gleichOder, istAuthFehler } from './kern.js';

const SCHICHT_SICHERUNG_AB = '2026-01'; // erster Monat, den die Sicherung nach einem Schichtplan fragt
const SCHICHT_SICHERUNG_VORAUS = 12; // … bis zwölf Monate nach dem laufenden
const SCHICHT_SICHERUNG_PARALLEL = 6; // so viele Monate werden gleichzeitig gefragt

/**
 * Schichtplan im Zustand: `katalog` null = noch nicht gelesen (die Ansicht zeigt dann die Standardarten). `vorgeladen` = der Monat
 * ('JJJJ-MM'), ab dem Schichtarten und Monate (siehe `schichtVorladen`) seit dem Start aus dem Kalender gelesen wurden, nicht nur aus dem
 * gespeicherten Stand; null = noch nicht. Die Erinnerungen gelten nur, solange das der laufende Monat ist (siehe push/plan.js planQuellen).
 */
export const leererSchichtplan = () => ({ katalog: null, monate: {}, status: {}, vorgeladen: null });

/** Schichtplan aus Schnappschuss oder Beispieldaten ({ katalog, monate }): normalisiert, alle Monate gelten als geladen. */
export function schichtAusDaten(roh) {
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
 * Scheibe „Schichtplan“ des Stores: Schichtarten und Monate lesen, ändern, vorladen und vor dem Push-Plan frisch lesen. `store` = die
 * Fassade; `fixLesen`, `autosHolen`, `versHolen` = das Lesen der Fixkosten, der Autos und der Versicherung (das Vorladen stößt sie an).
 * → { methoden (öffentliche Methoden des Stores), intern (was die Fassade braucht) }.
 */
export function createSchichtSlice(kern, { store, fixLesen, autosHolen, versHolen }) {
  const { adapter, jetzt, wartend, melden, unlesbarMerken, gelesenMerken, teilAendern, teilErgebnis, mitRueckgaengig } = kern;
  let schichtVorladenLaeuft = null; // laufendes Vorladen des Schichtplans: mehrfaches Anstoßen fragt nur einmal
  let schichtFrischLaeuft = null; // laufendes Frisch-Lesen vor dem Senden des Push-Plans (siehe schichtFrischLesen): höchstens eines

  // Änderungen, die noch nicht gespeichert sind, je Teil – Schichtplan ('katalog' oder 'JJJJ-MM') und Fixkosten (Teil 0 … 3):
  // { basis: zuletzt bekannter Stand im Kalender, offen: [fn, …] in Tipp-Reihenfolge, kette: Promise der Speicherungen }.
  // Angezeigt wird immer `basis` mit allen offenen Änderungen darauf: so verschwindet kein Tipp, während ein früherer gespeichert wird.
  const schichtOffen = new Map();
  const schichtSchreibtNoch = () => schichtOffen.size > 0;
  const schichtTeil = (teil) => (teil === 'katalog' ? kern.state.schicht.katalog : kern.state.schicht.monate[teil]);
  const mitSchichtTeil = (teil, wert) => ({ ...kern.state, schicht: teil === 'katalog' ? { ...kern.state.schicht, katalog: wert } : { ...kern.state.schicht, monate: { ...kern.state.schicht.monate, [teil]: wert } } });

  /** Ändert einen Teil des Schichtplans ('katalog' oder 'JJJJ-MM'), siehe `teilAendern`. */
  const schichtAendern = (teil, fn, optionen) => teilAendern(schichtOffen, teil, fn, { ...optionen, aktuell: () => schichtTeil(teil), mit: (wert) => mitSchichtTeil(teil, wert) });

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

  const methoden = {
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
    /**
     * Uhrzeiten dieses Tages (Von/Bis; beide '' = die Zeiten der Art gelten wieder): → der sofort angezeigte Monat; wirft bei einer
     * abgelehnten Eingabe. Nur mit gelesenen Schichtarten (die Zeiten der Art entscheiden, ob ein Eintrag nötig ist).
     */
    schichtTagZeiten: (jm, tag, person, { von, bis }) => {
      const katalog = kern.state.schicht.katalog;
      if (!katalog) return Promise.reject(new Error('Die Schichtarten sind noch nicht geladen.'));
      return schichtMonatAendern(jm, (m) => setzeTagZeiten(m, { person, tag, von, bis }, katalog));
    },
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
  };

  return { methoden, intern: { schichtFuerSicherung } };
}
