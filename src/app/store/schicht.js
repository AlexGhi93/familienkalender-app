import { todayVienna } from '../../domain/dates.js';
import { monatVor } from '../../domain/konto.js';
import { artAendern, artArchivieren, artHinzufuegen, artVerschieben, katalogErgaenzen, leererMonat, normalisiereKatalog, normalisiereMonat, schaltePinsel, schichtAm, setzeNotiz, setzeSchicht, setzeTagZeiten, standardKatalog, tageImMonat, vorladeMonate, zusatzEntfernen, zusatzHinzufuegen, zusatzWiederherstellen } from '../../domain/schicht.js';
import { TEXT_TAUSCH_WEG, leererTausch, tauschAnwenden, tauschAusText, tauschEintrag, tauschEntfernen, tauschHinzufuegen, tauschPartnerMonate, tauschPruefen, tauschText, tauschZuruecknehmen, tauschZustand } from '../../domain/schicht-tausch.js';
import { UNLESBAR_TEXT } from '../../domain/unlesbar.js';
import { eintragVorhanden, neueKennung } from './geteilt.js';
import { TEXT_FEHLER, gleichOder, istAuthFehler } from './kern.js';

const SCHICHT_SICHERUNG_AB = '2026-01'; // erster Monat, den die Sicherung nach einem Schichtplan fragt
const SCHICHT_SICHERUNG_VORAUS = 12; // … bis zwölf Monate nach dem laufenden
const SCHICHT_SICHERUNG_PARALLEL = 6; // so viele Monate werden gleichzeitig gefragt
const TEXT_TAUSCH_NICHT_GELESEN = 'Der Schichtplan konnte gerade nicht gelesen werden. Bitte noch einmal versuchen.';
const TEXT_TAUSCH_GEBROCHEN = 'Dieser Tausch wurde inzwischen von Hand geändert – bitte die beiden Tage selbst richtigstellen.';
const TEXT_TAGE = 'Bitte zwei Tage wählen.';
const DATUM = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const jmVon = (datum) => datum.slice(0, 7);

/**
 * Schichtplan im Zustand: `katalog` null = noch nicht gelesen (die Ansicht zeigt dann die Standardarten). `tausch` = die Diensttausche
 * (siehe domain/schicht-tausch.js), gelesen mit den Monaten (`schichtLesen`); fehlt das Feld (oder ist es null), sind sie noch nicht
 * gelesen – wie `zt` und `fremd` der Monate steht es nur da, wenn es etwas gibt (die Form des leeren Zustands bleibt). `vorgeladen` = der Monat
 * ('JJJJ-MM'), ab dem Schichtarten und Monate (siehe `schichtVorladen`) seit dem Start aus dem Kalender gelesen wurden, nicht nur aus dem
 * gespeicherten Stand; null = noch nicht. Die Erinnerungen gelten nur, solange das der laufende Monat ist (siehe push/plan.js planQuellen).
 */
export const leererSchichtplan = () => ({ katalog: null, monate: {}, status: {}, vorgeladen: null });

/** Diensttausche aus Schnappschuss oder Beispieldaten (Form im Speicher); ungültig oder unlesbar → null (= nicht gelesen). */
function tauschAusDaten(roh) {
  if (!roh) return null;
  try {
    const r = tauschAusText(tauschText(roh));
    return r.unlesbar ? null : r.daten;
  } catch {
    return null;
  }
}

/** Schichtplan aus Schnappschuss oder Beispieldaten ({ katalog, monate, tausch? }): normalisiert, alle Monate gelten als geladen. */
export function schichtAusDaten(roh) {
  const monate = {};
  for (const [jm, monat] of Object.entries(roh?.monate ?? {})) {
    try {
      monate[jm] = normalisiereMonat(monat, jm).monat;
    } catch {
      // kein gültiger Monat als Schlüssel: weglassen
    }
  }
  const tausch = tauschAusDaten(roh?.tausch);
  return { katalog: roh?.katalog ? normalisiereKatalog(roh.katalog).katalog : null, monate, status: Object.fromEntries(Object.keys(monate).map((jm) => [jm, 'geladen'])), vorgeladen: null, ...(tausch ? { tausch } : {}) };
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
   * Gleichzeitig die Diensttausche (`schicht.tausch`; unlesbar → leer gezeigt, 'schichttausch' in `state.unlesbar`, nie überschrieben);
   * `tauschGelesen` im Ergebnis = sie konnten gelesen werden. Danach auch die noch fehlenden Partnermonate der Tausche, die einen Monat aus
   * `jms` berühren (siehe `partnerNachlesen`; nicht im Ergebnis). `nurMonate` = nur die Monate, ohne Schichtarten und Diensttausche.
   */
  async function schichtLesen(jms, { katalogNeu = false, nurMonate = false } = {}) {
    const mitKatalog = !nurMonate && (katalogNeu || kern.state.schicht.katalog === null);
    const stand = kern.schreibStand;
    kern.state = { ...kern.state, schicht: { ...kern.state.schicht, status: { ...kern.state.schicht.status, ...Object.fromEntries(jms.map((m) => [m, 'laedt'])) } } };
    melden();
    const mitTausch = !nurMonate && Boolean(adapter.leseDiensttausch);
    const [katalog, tausch, ...monate] = await Promise.allSettled([mitKatalog ? adapter.leseSchichtarten() : null, mitTausch ? adapter.leseDiensttausch() : null, ...jms.map((m) => adapter.leseSchichtMonat(m))]);
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
    let tz = s.tausch ?? null;
    const tauschGelesen = mitTausch && tausch.status === 'fulfilled';
    if (tauschGelesen) {
      gelesenMerken('schichttausch', tausch.value);
      if (!(eigene && tz)) tz = gleichOder(tz, tausch.value?.daten ?? leererTausch());
    } else if (mitTausch) auth ||= istAuthFehler(tausch.reason);
    // Unverändert gelesen: dieselben Objekte behalten. Der Push-Plan (push/plan.js `planQuellen`) vergleicht nach Identität; ein neues,
    // aber gleiches Objekt löste sonst bei jedem Blättern oder Abgleich einen Push-Abgleich samt frischem Lesen aus.
    const monateGleich = Object.keys(neueMonate).length === Object.keys(s.monate).length && Object.keys(neueMonate).every((m) => neueMonate[m] === s.monate[m]);
    kern.state = { ...kern.state, schicht: { ...s, katalog: kat, monate: monateGleich ? s.monate : neueMonate, status, ...(tz ? { tausch: tz } : {}) }, ...(auth ? { anmeldungNoetig: true } : {}) };
    melden();
    if (!nurMonate) await partnerNachlesen(jms);
    return { katalogGelesen, monateGelesen: jms.every((m) => status[m] === 'geladen'), tauschGelesen };
  }

  /**
   * Ein Tausch braucht BEIDE Monate (sonst 'unbekannt': kein ⇄, kein „Rückgängig“). Liest die Partnermonate der Tausche, die einen Monat aus
   * `jms` berühren, sofern sie weder geladen sind noch gerade laden – nur Monate, die ein Tausch nennt, jeder einmal. Wirft nicht.
   */
  async function partnerNachlesen(jms) {
    const s = kern.state.schicht;
    const fehlen = tauschPartnerMonate(s.tausch, jms).filter((m) => !s.monate[m] && s.status[m] !== 'laedt');
    if (fehlen.length > 0) await schichtLesen(fehlen, { nurMonate: true });
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

  /**
   * Schichtplan für die Sicherung: Katalog und alle vorhandenen Monate von Jänner 2026 bis zwölf Monate nach heute (fehlende übersprungen),
   * dazu `tausch` (die Diensttausche), wenn es welche gibt und sie lesbar sind, sonst `tauschUnlesbar` = ihr Rohtext (das Format der
   * Sicherung legt sicherung.js fest).
   */
  async function schichtFuerSicherung() {
    if (!adapter.leseSchichtMonat) {
      const { katalog, monate, tausch } = kern.state.schicht;
      return { katalog, monate, ...(tausch ? { tausch } : {}) };
    }
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
    const tausch = adapter.leseDiensttausch ? await adapter.leseDiensttausch() : null;
    const tauschTeil = tausch?.unlesbar ? { tauschUnlesbar: tausch.text ?? null } : tausch?.daten ? { tausch: tausch.daten } : {};
    return { katalog: katalog ? normalisiereKatalog(katalog).katalog : null, monate, ...tauschTeil };
  }

  // ---------- Diensttausch ----------
  // Ein Tausch schreibt drei Dinge in fester Reihenfolge: 1) die Verknüpfung („fkschtausch“, merkt sich ka, vb, za, zb), 2) Monat A,
  // 3) Monat B (derselbe Monat: eine Schreibung). Rückgängig umgekehrt: erst die Monate (B, dann A), zuletzt die Verknüpfung. Scheitert
  // ein Schritt, bleibt alles Bisherige stehen: nichts geht verloren (die Verknüpfung kennt beide Tage, wie sie vorher waren), der Tausch
  // ist dann „offen“ oder „halb“ und lässt sich abschließen oder rückgängig machen. Vor jedem Schritt werden die Verknüpfung und die
  // betroffenen Monate frisch gelesen; geschrieben wird immer als reine Änderung auf der neuesten Fassung (Warteschlange je Teil wie
  // beim Schichtplan, siehe `teilAendern` im Kern; die Verknüpfung hat den Teil 'tausch', der Adapter schreibt über `aendereVersteckt`).

  const tauschMonat = (jm) => kern.state.schicht.monate[jm] ?? null;
  const tauschZustandJetzt = (e) => tauschZustand(e, tauschMonat(jmVon(e.a)), tauschMonat(jmVon(e.b)));
  const tauschOptionen = () => ({ heute: todayVienna(jetzt()), zustand: tauschZustandJetzt });

  /** Ändert die Verknüpfung (siehe `teilAendern`) → { neu, ergebnis, fehler }. */
  const tauschAendern = (fn) =>
    teilAendern(schichtOffen, 'tausch', fn, {
      leer: leererTausch,
      aktuell: () => kern.state.schicht.tausch ?? null,
      mit: (wert) => ({ ...kern.state, schicht: { ...kern.state.schicht, tausch: wert } }),
      speichern: async (f) => {
        const gespeichert = await adapter.aendereDiensttausch(f);
        unlesbarMerken('schichttausch', false); // nicht abgelehnt: die neueste Fassung war lesbar
        return gespeichert;
      },
      lesen: async () => gelesenMerken('schichttausch', await adapter.leseDiensttausch()).daten ?? null,
      normalisiere: (d) => d ?? leererTausch(),
    });

  /** Ergebnis eines Teil-Schreibens für die Oberfläche; lehnt die Änderung schon am angezeigten Stand ab, → { ok: false, fehler }. */
  async function sicher(schreiben) {
    try {
      return teilErgebnis(await schreiben());
    } catch (e) {
      return { ok: false, fehler: e?.message || TEXT_FEHLER };
    }
  }

  /** Was an den Tausch-Teilen gesperrt ist (unlesbar) → Meldung oder null. */
  function tauschGesperrt(jms) {
    const { unlesbar } = kern.state;
    if (unlesbar.includes('schichttausch')) return UNLESBAR_TEXT.schichttausch;
    return jms.some((jm) => unlesbar.includes(`schicht:${jm}`)) ? UNLESBAR_TEXT.schicht : null;
  }

  /** Liest Verknüpfung, Schichtarten (falls nötig) und die Monate `jms` frisch; → Meldung, wenn nicht getauscht werden kann, sonst null. */
  async function tauschVorbereiten(jms) {
    if (!adapter.leseDiensttausch || !adapter.aendereDiensttausch) return TEXT_TAUSCH_NICHT_GELESEN;
    if (kern.state.unlesbar.includes('schichttausch')) return UNLESBAR_TEXT.schichttausch; // gesperrt, bis ein Lesen sie wieder lesbar findet
    if (!kern.state.geladen || kern.state.nurSnapshot || kern.state.anmeldungNoetig) return TEXT_TAUSCH_NICHT_GELESEN;
    const { monateGelesen, tauschGelesen } = await schichtLesen([...new Set(jms)]);
    const gesperrt = tauschGesperrt(jms);
    if (gesperrt) return gesperrt;
    if (!monateGelesen || !tauschGelesen || !kern.state.schicht.katalog || !kern.state.schicht.tausch) return TEXT_TAUSCH_NICHT_GELESEN;
    return null;
  }

  /** Der Eintrag `id` nach dem frischen Lesen (samt seinen Monaten): { e } oder { fehler } (gibt es nicht mehr, gesperrt, nicht gelesen). */
  async function tauschHolen(id) {
    const vorab = (kern.state.schicht.tausch?.eintraege ?? []).find((x) => x.id === id);
    const fehler = await tauschVorbereiten(vorab ? [jmVon(vorab.a), jmVon(vorab.b)] : []);
    if (fehler) return { fehler };
    const t = kern.state.schicht.tausch;
    let e;
    try {
      e = eintragVorhanden(t.eintraege, t.fremd?.l, id, TEXT_TAUSCH_WEG);
    } catch (f) {
      return { fehler: f.message };
    }
    if (!vorab || vorab.a !== e.a || vorab.b !== e.b) {
      const noch = await tauschVorbereiten([jmVon(e.a), jmVon(e.b)]); // erst jetzt bekannt: die Monate dieses Tauschs lesen
      if (noch) return { fehler: noch };
    }
    return { e };
  }

  /** Braucht die Seite `seite` von `e` noch `op` (Anwenden bzw. Zurücknehmen)? Wirft `op` (Tag von Hand geändert): ja – das Schreiben meldet es. */
  function seiteOffen(e, seite, op) {
    const m = tauschMonat(jmVon(seite === 'a' ? e.a : e.b));
    try {
      return op(m, e, seite) !== m;
    } catch {
      return true;
    }
  }

  /** Schreibt die Seiten `seiten` (in dieser Reihenfolge) mit `op`; liegen sie im selben Monat: eine Schreibung. Hält beim ersten Scheitern an. */
  async function seitenSchreiben(e, seiten, op) {
    const gruppen = [];
    for (const seite of seiten) {
      const jm = jmVon(seite === 'a' ? e.a : e.b);
      const g = gruppen.find((x) => x.jm === jm);
      if (g) g.seiten.push(seite);
      else gruppen.push({ jm, seiten: [seite] });
    }
    for (const g of gruppen) {
      const r = await sicher(() => schichtMonatSchreiben(g.jm, (m) => g.seiten.reduce((x, seite) => op(x, e, seite), m)));
      if (!r.ok) return r;
    }
    return { ok: true };
  }

  /**
   * Wartet ein Schritt des Tauschs `r.id` auf die Anmeldung, wird dahinter (in `wartend`, also nach ihm) das Abschließen eingereiht: nach
   * dem Anmelden folgen so die fehlenden Monate in der Reihenfolge A, B – und nur, wenn die Verknüpfung dann wirklich im Kalender steht
   * (wird sie beim Nachholen abgelehnt, gibt es den Tausch nicht und das Abschließen schreibt nichts). → `r`.
   */
  function nachAnmeldungAbschliessen(r) {
    if (r.wartet && r.id) {
      wartend.push({
        schreibe: async () => {
          await methoden.diensttauschAbschliessen(r.id); // wirft nicht; Fehler meldet das Schreiben selbst
        },
        optionen: {},
      });
    }
    return r;
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
     * Holt Schichtarten, die Diensttausche und die Monate `jms` neu (das andere Telefon hat vielleicht etwas eingetragen; alle 30 Sekunden und beim
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
        gelesen = await Promise.all([adapter.leseSchichtarten(), adapter.leseDiensttausch ? adapter.leseDiensttausch() : null, ...jms.map((jm) => adapter.leseSchichtMonat(jm))]);
      } catch (fehler) {
        if (istAuthFehler(fehler)) {
          kern.state = { ...kern.state, anmeldungNoetig: true };
          melden();
        }
        return false;
      }
      if (stand !== kern.schreibStand || kern.schreibend > 0 || wartend.length > 0 || schichtSchreibtNoch()) return false;
      const [katalog, tausch, ...monate] = gelesen;
      const s = kern.state.schicht;
      const neu = { ...s, katalog: normalisiereKatalog(katalog?.katalog ?? null).katalog, monate: { ...s.monate }, status: { ...s.status } };
      let geaendert = unlesbarMerken('schichtarten', katalog?.unlesbar === true);
      if (adapter.leseDiensttausch) {
        // die Diensttausche des anderen Telefons (⇄) gleich mit; unlesbar → leer gezeigt und gesperrt, wieder lesbar → frei
        neu.tausch = gleichOder(s.tausch, tausch?.daten ?? leererTausch());
        geaendert = unlesbarMerken('schichttausch', tausch?.unlesbar === true) || geaendert;
      }
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
      await partnerNachlesen(jms); // ein neuer Tausch des anderen Telefons kann einen Monat nennen, der noch nicht geladen ist
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

    /**
     * Diensttausch speichern ({ person, a: abgegebener Tag, b: übernommener Tag, kb: übernommene Schicht, mitWem? }): liest zuerst
     * Verknüpfung und die Monate von A und B frisch, prüft (`tauschPruefen`, auch auf der neuesten Fassung der Verknüpfung) und schreibt
     * dann Verknüpfung, Monat A, Monat B (siehe oben). → { ok, id?, fehler?, gemeldet?, wartet? }; `id` = der Tausch, sobald die
     * Verknüpfung geschrieben ist oder wartet (scheitert danach ein Monat, ist er „offen“ oder „halb“: abschließen oder rückgängig
     * machen). Steht derselbe Tausch (Person, beide Tage, Dienst) schon „offen“ da, wird er fortgesetzt (nur die Monate). Wartet ein
     * Schritt auf die Anmeldung, folgen danach die fehlenden Monate von selbst (`nachAnmeldungAbschliessen`). Wirft nicht.
     */
    async diensttauschSpeichern(entwurf) {
      const { a, b } = entwurf ?? {};
      if (!DATUM.test(a ?? '') || !DATUM.test(b ?? '')) return { ok: false, fehler: TEXT_TAGE };
      const fehlt = await tauschVorbereiten([jmVon(a), jmVon(b)]);
      if (fehlt) return { ok: false, fehler: fehlt };
      const { katalog, tausch: daten } = kern.state.schicht;
      const { heute } = tauschOptionen();
      // derselbe Tausch steht schon „offen“ da (Verknüpfung geschrieben, Monate nicht): fortsetzen statt mit unsichtbarem Grund ablehnen
      const gleich = daten.eintraege.find((x) => x.person === entwurf.person && x.a === a && x.b === b && x.kb === entwurf.kb && tauschZustandJetzt(x) === 'offen');
      if (gleich && !tauschPruefen(entwurf, { daten: { ...daten, eintraege: daten.eintraege.filter((x) => x !== gleich) }, monate: tauschMonat, katalog, heute })) {
        return nachAnmeldungAbschliessen({ ...(await seitenSchreiben(gleich, ['a', 'b'], tauschAnwenden)), id: gleich.id });
      }
      const meldung = tauschPruefen(entwurf, { daten, monate: tauschMonat, katalog, heute });
      if (meldung) return { ok: false, fehler: meldung };
      const id = neueKennung(kern.neueId, new Set([...daten.eintraege.map((x) => x.id), ...(daten.fremd?.l ?? []).map((w) => w?.i)]));
      if (!id) return { ok: false, fehler: TEXT_FEHLER };
      const e = tauschEintrag(entwurf, { id, monatA: tauschMonat(jmVon(a)), monatB: tauschMonat(jmVon(b)), heute }); // beide frisch gelesen
      const verknuepft = await sicher(() =>
        tauschAendern((d) => {
          // auf der neuesten Fassung noch einmal prüfen (das andere Telefon könnte inzwischen getauscht haben); schon drin = wiederholt
          if (!(d.eintraege ?? []).some((x) => x.id === id)) {
            const neu = tauschPruefen(entwurf, { daten: d, monate: tauschMonat, katalog, heute });
            if (neu) throw new Error(neu);
          }
          return tauschHinzufuegen(d, e, tauschOptionen());
        }),
      );
      if (!verknuepft.ok) return verknuepft.wartet ? nachAnmeldungAbschliessen({ ...verknuepft, id }) : verknuepft; // ohne Verknüpfung kein Monat
      return nachAnmeldungAbschliessen({ ...(await seitenSchreiben(e, ['a', 'b'], tauschAnwenden)), id });
    },

    /**
     * Halben (oder offenen) Tausch `id` abschließen: schreibt die fehlende Hälfte (A, dann B). Schon ganz → { ok: true } ohne Schreiben;
     * von Hand übermalt („gebrochen“) → { ok: false, fehler }, nichts wird repariert. → { ok, fehler?, gemeldet?, wartet? }; wirft nicht.
     */
    async diensttauschAbschliessen(id) {
      const { e, fehler } = await tauschHolen(id);
      if (fehler) return { ok: false, fehler };
      const zustand = tauschZustandJetzt(e);
      if (zustand === 'ganz') return { ok: true };
      if (zustand !== 'halb' && zustand !== 'offen') return { ok: false, fehler: TEXT_TAUSCH_GEBROCHEN };
      return seitenSchreiben(e, ['a', 'b'].filter((s) => seiteOffen(e, s, tauschAnwenden)), tauschAnwenden);
    },

    /**
     * Tausch `id` rückgängig machen: erst die Monate (B, dann A; nur, was angekommen ist) genau wie vorher – Schicht und eigene Zeiten,
     * auch was vorher in B stand –, dann die Verknüpfung entfernen. Scheitert ein Monat, bleibt die Verknüpfung (der Tausch ist dann halb).
     * Von Hand übermalt („gebrochen“) → { ok: false, fehler }, nichts wird geschrieben. → { ok, fehler?, gemeldet?, wartet? }; wirft nicht.
     */
    async diensttauschRueckgaengig(id) {
      const { e, fehler } = await tauschHolen(id);
      if (fehler) return { ok: false, fehler };
      if (tauschZustandJetzt(e) === 'gebrochen') return { ok: false, fehler: TEXT_TAUSCH_GEBROCHEN };
      const monate = await seitenSchreiben(e, ['b', 'a'].filter((s) => seiteOffen(e, s, tauschZuruecknehmen)), tauschZuruecknehmen);
      if (!monate.ok) return monate;
      return sicher(() => tauschAendern((d) => tauschEntfernen(d, id, tauschOptionen())));
    },
  };

  return { methoden, intern: { schichtFuerSicherung } };
}
