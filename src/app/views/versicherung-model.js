// Versicherung (Privatarzt) im Konto-Tab: Modell der Seite (Jahr ‹ JJJJ ›, Gesamt „Noch X € von Y €“, eine Karte je Kategorie mit
// ⏳ eingereicht und ✓ erstattet getrennt, Rechnungen des Jahres – neueste zuerst – mit „⚠ Limit überschritten“), die Entwürfe der Blätter
// (Rechnung, Erstattung, Polizze) und die Texte der Push-Erinnerungen (push/plan.js `versicherungErinnerungen`, Spec §6).
// Rein (ohne DOM, ohne Netz, ohne Uhr: `heute` kommt herein); gerechnet wird nur mit domain/versicherung-rechnung.js.
import { isValidDate } from '../../domain/dates.js';
import { betragText, centsAusText } from '../../domain/konto.js';
import { datumAnzeige } from '../../domain/eingabe.js';
import {
  MAX_BETRAG_CENT,
  MAX_KATEGORIEN,
  POLIZZE_VORLAGEN,
  TEXT_VERSICHERUNG_GESPERRT,
  polizzePruefen,
  polizzeVorlage,
  rechnungPruefen,
} from '../../domain/versicherung.js';
import { ERSTATTUNG_ERINNERUNG_TAGE, alleRechnungen, jahresStand, offeneErstattungen, rechnungFinden, rechnungenDesJahres } from '../../domain/versicherung-rechnung.js';

/** Wohin eine Erinnerung führt (Shell: wählt die Ansicht „Versicherung“ im Konto-Tab und lässt `#/konto` stehen). */
export const VERSICHERUNG_ZIEL = '#/konto/versicherung';
export const TEXT_VERSICHERUNG_NICHT_AKTUELL = 'Die Versicherung konnte gerade nicht neu gelesen werden – angezeigt wird der letzte Stand.';
export const TEXT_VERSICHERUNG_NICHT_GELADEN = 'Die Versicherung konnte nicht gelesen werden.';
/** Farbe der Balken (wie --sz-farbe der Sparziele: nur Schmuck, die Zahlen stehen immer als Text daneben). */
export const VERSICHERUNG_FARBE = '#2a78d6';
const FARBE_UEBER = '#c4314b';
const ERSTATTUNG_ANTEIL = 0.8; // Vorschlag „80 % wären …“ (Spec §2: meist 80 %, wenn die ÖGK nichts zahlt) – nur ein Hinweis

/** Kurze Namen der Kategorien der Vorlage (Push-Texte, Liste der Rechnungen); eigene Kategorien behalten ihren Namen. */
const KURZ = { arzt: 'Privatarzt', physio: 'Physiotherapie', psycho: 'Psychotherapie', medi: 'Medikamente', heil: 'Heilbehelfe' };

const istDatum = (x) => typeof x === 'string' && isValidDate(x);
const kurzDatum = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
const hatErstattung = (r) => Number.isInteger(r?.erstattetCent);
const prozent = (teil, ganz) => (ganz > 0 ? Math.max(0, Math.min(100, Math.round((teil / ganz) * 100))) : teil > 0 ? 100 : 0);
const euroFeld = (cents) => (Number.isInteger(cents) ? betragText(cents).replace(' €', '') : '');

/** Der kurze Name einer Kategorie: bei der unveränderten Vorlage z. B. „Privatarzt“, sonst ihr Name; unbekannt → „ohne Kategorie“. */
export function kategorieKurz(polizze, kategorieId) {
  const k = (polizze?.kategorien ?? []).find((x) => x.id === kategorieId);
  if (!k) return 'ohne Kategorie';
  const vorlage = polizzeVorlage(polizze)?.kategorien.find((x) => x.id === k.id);
  return vorlage && vorlage.name === k.name && KURZ[k.id] ? KURZ[k.id] : k.name;
}

/** Warum sich die Versicherung gerade nicht ändern lässt (Hauptteil unlesbar) oder null – wie die Sperre im Store. */
export const versicherungSperre = (v) => (v?.unlesbar?.main ? TEXT_VERSICHERUNG_GESPERRT : null);

/** Der Teil des Zustands, aus dem gerechnet wird: der zuletzt GESPEICHERTE Stand für Erinnerungen (`bestaetigt`), sonst der angezeigte. */
const stand = (v, { gespeichert = false } = {}) => (gespeichert && v?.bestaetigt ? v.bestaetigt : v);
const rechnungenJahr = (v, jahr) => rechnungenDesJahres(v?.teile ?? {}, jahr, { geschrieben: v?.geschrieben });

/** Jahre, durch die man blättern kann: vom ersten (Beginn der Polizze, erstes Jahr mit Rechnungen) bis zum laufenden (oder späteren mit Rechnungen). */
export function versicherungJahre(v, heute) {
  const jetzt = Number(heute.slice(0, 4));
  const polizze = v?.daten?.polizze;
  const kandidaten = [jetzt];
  if (istDatum(polizze?.beginn)) kandidaten.push(Number(polizze.beginn.slice(0, 4)));
  if (Number.isInteger(v?.daten?.ab)) kandidaten.push(v.daten.ab);
  for (const r of alleRechnungen(v?.teile ?? {}, { geschrieben: v?.geschrieben })) kandidaten.push(Number(r.datum.slice(0, 4)));
  const gueltig = kandidaten.filter((j) => Number.isInteger(j) && j >= 2000 && j <= 2100);
  return { von: Math.min(...gueltig), bis: Math.max(...gueltig), jetzt };
}

/** Rest, der sich bis Jahresende noch erstatten lässt: der Gesamtrest, höchstens die Summe der Reste der Kategorien. */
export const erstattbarerRest = (s) => (s ? Math.min(s.gesamt.restCent, s.kategorien.reduce((summe, k) => summe + k.restCent, 0)) : 0);

function meldungen(v) {
  const gesperrt = versicherungSperre(v);
  const warnungen = (v?.warnungen ?? []).filter((w) => w !== TEXT_VERSICHERUNG_GESPERRT);
  return {
    unlesbar: gesperrt,
    nichtAktuell: v?.status === 'fehler' && v?.daten?.polizze ? TEXT_VERSICHERUNG_NICHT_AKTUELL : null,
    warnungen: v?.status === 'fehler' ? [] : warnungen,
  };
}

function kategorieKarte(k, s, rechnungen) {
  const zahlen = s.kategorien.find((x) => x.id === k.id);
  const eigene = rechnungen.filter((r) => r.kategorie === k.id);
  const offen = eigene.filter((r) => !hatErstattung(r));
  const erstattet = eigene.filter(hatErstattung);
  const begrenzt = zahlen.restCent < Math.max(0, zahlen.limitCent - zahlen.verbrauchtCent);
  const breite = prozent(zahlen.verbrauchtCent, zahlen.limitCent);
  return {
    id: k.id,
    name: k.name,
    info: k.info ?? null,
    limit: `Limit ${betragText(zahlen.limitCent)}`,
    verbraucht: betragText(zahlen.verbrauchtCent),
    rest: betragText(zahlen.restCent),
    restCents: zahlen.restCent,
    breite,
    farbe: zahlen.ueberschrittenCent > 0 ? FARBE_UEBER : VERSICHERUNG_FARBE,
    eingereicht: offen.length > 0 ? `⏳ eingereicht: ${betragText(zahlen.eingereichtCent)}` : null,
    erstattet: erstattet.length > 0 ? `✓ erstattet: ${betragText(zahlen.erstattetCent)}` : null,
    ueberschritten: zahlen.ueberschrittenCent > 0 ? `⚠ Limit überschritten – ca. ${betragText(zahlen.ueberschrittenCent)} werden nicht erstattet` : null,
    begrenzt: begrenzt ? `Begrenzt durch das Maximum der Polizze (noch ${betragText(s.gesamt.restCent)} insgesamt).` : null,
    beschriftung: `${k.name}: noch ${betragText(zahlen.restCent)} von ${betragText(zahlen.limitCent)}`,
  };
}

/** Die Rechnungen des Jahres für die Liste: neueste zuerst (Rechnungsdatum, dann Einreichdatum, dann Kennung). */
function rechnungZeilen(polizze, rechnungen, s, heute) {
  const ueber = new Map(s.rechnungen.map((r) => [r.id, r.ueberschrittenCent]));
  const faellig = new Map(offeneErstattungen(rechnungen, heute).map((o) => [o.rechnung.id, o]));
  const neuesteZuerst = [...rechnungen].sort((a, b) => (a.datum !== b.datum ? (a.datum < b.datum ? 1 : -1) : a.eingereichtAm !== b.eingereichtAm ? (a.eingereichtAm < b.eingereichtAm ? 1 : -1) : a.id < b.id ? 1 : -1));
  return neuesteZuerst.map((r) => {
    const kategorie = kategorieKurz(polizze, r.kategorie);
    const erstattet = hatErstattung(r);
    const o = faellig.get(r.id);
    const ueberschritten = ueber.get(r.id) ?? 0;
    const status = erstattet
      ? { art: 'erstattet', text: `✓ erstattet: ${betragText(r.erstattetCent)} am ${datumAnzeige(r.erstattetAm)}` }
      : { art: 'eingereicht', text: `⏳ eingereicht am ${datumAnzeige(r.eingereichtAm)}` };
    return {
      id: r.id,
      kategorie,
      titel: kategorie,
      zeile: `Rechnung vom ${datumAnzeige(r.datum)}${r.stelle ? ` · ${r.stelle}` : ''}`,
      betrag: betragText(r.betragCent),
      status,
      offenSeit: o?.faellig ? `Seit ${o.tageOffen} Tagen offen – Erstattung schon da?` : null,
      ueberschritten: ueberschritten > 0 ? `⚠ Limit überschritten – ca. ${betragText(ueberschritten)} werden nicht erstattet` : null,
      notiz: r.notiz ?? null,
      beschriftung: `${kategorie}, Rechnung vom ${datumAnzeige(r.datum)}, ${betragText(r.betragCent)}, ${erstattet ? `erstattet ${betragText(r.erstattetCent)}` : 'eingereicht'}`,
    };
  });
}

/**
 * Die Seite „Versicherung“ am Tag `heute`, Jahr `jahr` (null = laufendes) → {
 *   zustand: 'laedt' | 'nichtGeladen' | 'gesperrt' | 'leer' (keine Polizze) | 'da',
 *   meldungen: { unlesbar, nichtAktuell, warnungen }, gesperrt (Grund oder null),
 *   vorlagen: [{ id, name }] (für den leeren Zustand),
 *   und bei 'da': titel, untertitel, hinweis (Info, kein Rechnen), jahr, jahrText, hatVorher, hatNachher, istAktuell,
 *   gesamt: { text, rest, restCents, maximum, breite, verbraucht, ueberschritten, ohneKategorie, beschriftung },
 *   karten (je Kategorie, Reihenfolge der Polizze), rechnungen (neueste zuerst), leerText
 * }. Wirft nie.
 */
export function versicherungModel(state, heute, { jahr = null } = {}) {
  const v = state?.versicherung ?? null;
  const gesperrt = versicherungSperre(v);
  const basis = { meldungen: meldungen(v), gesperrt, vorlagen: Object.values(POLIZZE_VORLAGEN).map((x) => ({ id: x.id, name: x.name })) };
  const polizze = v?.daten?.polizze ?? null;
  if (gesperrt) return { ...basis, zustand: 'gesperrt' };
  if (!polizze) {
    if (!v || v.status === null || v.status === undefined || (v.status === 'laedt' && !v.frisch)) return { ...basis, zustand: 'laedt' };
    if (v.status === 'fehler') return { ...basis, zustand: 'nichtGeladen' };
    return { ...basis, zustand: 'leer' };
  }
  try {
    const jahre = versicherungJahre(v, heute);
    const j = Number.isInteger(jahr) ? Math.min(jahre.bis, Math.max(jahre.von, jahr)) : jahre.jetzt;
    const rechnungen = rechnungenJahr(v, j);
    const s = jahresStand(polizze, rechnungen, j);
    const g = s.gesamt;
    const angerechnet = g.maximumCent - g.restCent;
    const vorlage = polizzeVorlage(polizze);
    const vorBeginn = istDatum(polizze.beginn) && Number(polizze.beginn.slice(0, 4)) > j;
    return {
      ...basis,
      zustand: 'da',
      titel: polizze.name,
      untertitel: [polizze.person, istDatum(polizze.beginn) ? `seit ${datumAnzeige(polizze.beginn)}` : null].filter(Boolean).join(' · '),
      hinweis: vorlage?.hinweis ?? 'Limits laut Polizze, je Kalenderjahr.',
      jahr: j,
      jahrText: String(j),
      hatVorher: j > jahre.von,
      hatNachher: j < jahre.bis,
      istAktuell: j === jahre.jetzt,
      gesamt: {
        text: `Noch ${betragText(g.restCent)} von ${betragText(g.maximumCent)}`,
        rest: betragText(g.restCent),
        restCents: g.restCent,
        maximum: betragText(g.maximumCent),
        breite: prozent(angerechnet, g.maximumCent),
        verbraucht: betragText(g.verbrauchtCent),
        ueberschritten: g.ueberschrittenCent > 0 ? `⚠ ca. ${betragText(g.ueberschrittenCent)} werden nicht erstattet (über den Limits)` : null,
        ohneKategorie: g.ohneKategorieCent > 0 ? `${betragText(g.ohneKategorieCent)} stehen bei einer Kategorie, die es in der Polizze nicht mehr gibt – bitte diese Rechnungen einer Kategorie zuordnen.` : null,
        beschriftung: `Versicherung ${j}: noch ${betragText(g.restCent)} von ${betragText(g.maximumCent)}`,
      },
      karten: polizze.kategorien.map((k) => kategorieKarte(k, s, rechnungen)),
      rechnungen: rechnungZeilen(polizze, rechnungen, s, heute),
      leerText: vorBeginn ? `In ${j} lief die Polizze noch nicht.` : `Für ${j} ist noch keine Rechnung eingereicht.`,
    };
  } catch {
    return { ...basis, zustand: 'nichtGeladen' };
  }
}

// ---------------------------------------------------------------- Formular „Rechnung einreichen / ändern“

/** Die angezeigte Rechnung `id` (gültige Fassung) oder null. */
export function versicherungRechnung(state, id) {
  const v = state?.versicherung;
  return rechnungFinden(v?.teile ?? {}, id, { geschrieben: v?.geschrieben })?.rechnung ?? null;
}

/**
 * Entwurf für das Formular: neu (Rechnungsdatum und Einreichdatum heute, erste Kategorie) oder aus der Rechnung `id`.
 * → { id?, kategorie, datum, betrag (Text), eingereichtAm, stelle, notiz } oder null (Rechnung gibt es nicht).
 */
export function rechnungEntwurf(state, heute, id = null) {
  const polizze = state?.versicherung?.daten?.polizze;
  if (id === null) return { kategorie: polizze?.kategorien[0]?.id ?? '', datum: heute, betrag: '', eingereichtAm: heute, stelle: '', notiz: '' };
  const r = versicherungRechnung(state, id);
  if (!r) return null;
  return { id: r.id, kategorie: r.kategorie, datum: r.datum, betrag: euroFeld(r.betragCent), eingereichtAm: r.eingereichtAm, stelle: r.stelle ?? '', notiz: r.notiz ?? '' };
}

/** Kategorien zur Auswahl: die der Polizze; eine Rechnung, deren Kategorie fehlt, bekommt einen leeren Eintrag „bitte wählen“. */
export function kategorieWahl(state, e) {
  const liste = (state?.versicherung?.daten?.polizze?.kategorien ?? []).map((k) => [k.id, k.name]);
  return liste.some(([id]) => id === e.kategorie) ? liste : [['', '– bitte wählen –'], ...liste];
}

/**
 * Entwurf → { rechnung (für store.rechnungSpeichern) } oder { fehler }. Die Erstattung kommt aus dem ANGEZEIGTEN Stand der Rechnung
 * (`state`), damit Ändern sie nicht verliert (eingetragen wird sie im eigenen Blatt „Erstattung erhalten“).
 */
export function entwurfZuRechnung(state, heute, e) {
  const betragCent = centsAusText(String(e.betrag ?? '').trim());
  if (betragCent === null || betragCent < 0 || betragCent > MAX_BETRAG_CENT) return { fehler: 'Bitte den Betrag der Rechnung eingeben, z. B. 89,90.' };
  if (betragCent === 0) return { fehler: 'Bitte den Betrag der Rechnung eingeben (mehr als 0 €).' };
  const alt = e.id ? versicherungRechnung(state, e.id) : null;
  if (e.id && !alt) return { fehler: 'Diese Rechnung gibt es nicht mehr.' };
  const rechnung = { kategorie: e.kategorie, datum: e.datum, betragCent, eingereichtAm: e.eingereichtAm };
  if (e.id) rechnung.id = e.id;
  if (hatErstattung(alt)) {
    rechnung.erstattetCent = alt.erstattetCent;
    rechnung.erstattetAm = alt.erstattetAm;
  }
  if (String(e.stelle ?? '').trim()) rechnung.stelle = e.stelle;
  if (String(e.notiz ?? '').trim()) rechnung.notiz = e.notiz;
  const { fehler } = rechnungPruefen(rechnung, { heute, polizze: state?.versicherung?.daten?.polizze });
  return fehler ? { fehler } : { rechnung };
}

/**
 * Vorschau im Formular: um wie viel wächst mit dieser Rechnung (neu oder geändert) das, was über den Limits bzw. dem Maximum ihres
 * Jahres liegt? → „⚠ Limit überschritten – ca. X € werden nicht erstattet“ oder null. Verglichen wird das Jahr der Rechnung mit und
 * ohne den Entwurf (die geänderte Fassung ersetzt die alte).
 */
export function rechnungVorschau(state, heute, e) {
  try {
    const { rechnung } = entwurfZuRechnung(state, heute, e);
    const v = state?.versicherung;
    if (!rechnung || !v?.daten?.polizze) return null;
    const id = rechnung.id ?? '~neu';
    const jahr = Number(rechnung.datum.slice(0, 4));
    const jetzt = rechnungenJahr(v, jahr);
    const vorher = jahresStand(v.daten.polizze, jetzt, jahr).gesamt.ueberschrittenCent;
    const nachher = jahresStand(v.daten.polizze, [...jetzt.filter((r) => r.id !== id), { ...rechnung, id }], jahr).gesamt.ueberschrittenCent;
    const mehr = nachher - vorher;
    return mehr > 0 ? `⚠ Limit überschritten – ca. ${betragText(mehr)} werden nicht erstattet` : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Blatt „Erstattung erhalten“

/** → { betrag (Text), datum, vorschlag (Hinweis „80 % wären …“), vorhanden } oder null (Rechnung gibt es nicht). */
export function erstattungEntwurf(state, heute, id) {
  const r = versicherungRechnung(state, id);
  if (!r) return null;
  const vorhanden = hatErstattung(r);
  return {
    betrag: vorhanden ? euroFeld(r.erstattetCent) : '',
    datum: vorhanden ? r.erstattetAm : heute,
    vorschlag: `80 % von ${betragText(r.betragCent)} wären ${betragText(Math.round(r.betragCent * ERSTATTUNG_ANTEIL))}.`,
    vorhanden,
    titel: `${kategorieKurz(state.versicherung.daten.polizze, r.kategorie)}, Rechnung vom ${datumAnzeige(r.datum)} (${betragText(r.betragCent)})`,
  };
}

/** Entwurf → { erstattung: { erstattetCent, erstattetAm } } oder { fehler } (geprüft wie im Store, an der angezeigten Rechnung). */
export function entwurfZuErstattung(state, heute, id, e) {
  const r = versicherungRechnung(state, id);
  if (!r) return { fehler: 'Diese Rechnung gibt es nicht mehr.' };
  const erstattetCent = centsAusText(String(e.betrag ?? '').trim());
  if (erstattetCent === null || erstattetCent < 0) return { fehler: 'Bitte den erstatteten Betrag eingeben, z. B. 12,16 (auch 0 ist möglich).' };
  if (!istDatum(e.datum)) return { fehler: 'Bitte das Datum der Erstattung eingeben.' };
  const erstattung = { erstattetCent, erstattetAm: e.datum };
  const { fehler } = rechnungPruefen({ ...r, ...erstattung }, { heute });
  return fehler ? { fehler } : { erstattung };
}

// ---------------------------------------------------------------- Formular „Polizze“

/** Kategorien, auf die eine Rechnung zeigt (auch in anderen Jahren): die lassen sich nicht entfernen (Entscheid C4). */
export function benutzteKategorien(state) {
  const v = state?.versicherung;
  return new Set(alleRechnungen(v?.teile ?? {}, { geschrieben: v?.geschrieben }).map((r) => r.kategorie));
}

const kategorieZeile = (k) => ({ id: k.id, name: k.name ?? '', info: k.info ?? '', limit: euroFeld(k.limitCent) });

/**
 * Entwurf für das Formular „Polizze“: aus der Vorlage `vorlageId` (neu), leer („Eigene Polizze“, `vorlageId` = null) oder aus der
 * vorhandenen Polizze (`bearbeiten`). → { id?, vorlage?, name, person, beginn, maximum (Text), kategorien: [{ id, name, info, limit }] }.
 */
export function polizzeEntwurf(state, heute, { vorlageId = null, bearbeiten = false } = {}) {
  const p = state?.versicherung?.daten?.polizze;
  if (bearbeiten && p) return { id: p.id, vorlage: p.vorlage, name: p.name, person: p.person ?? '', beginn: p.beginn, maximum: euroFeld(p.maximumCent), kategorien: p.kategorien.map(kategorieZeile) };
  const v = vorlageId ? POLIZZE_VORLAGEN[vorlageId] : null;
  if (v) return { vorlage: v.id, name: v.name, person: '', beginn: heute, maximum: euroFeld(v.maximumCent), kategorien: v.kategorien.map(kategorieZeile) };
  return { name: '', person: '', beginn: heute, maximum: '', kategorien: [{ id: 'k1', name: '', info: '', limit: '' }] };
}

/** Eine neue Kennung für eine Kategorie (a-z, 0-9), die es in `vorhanden` (Kennungen) noch nicht gibt. */
export function neueKategorieId(vorhanden) {
  const belegt = new Set(vorhanden);
  for (let n = 1; n < 1000; n += 1) if (!belegt.has(`k${n}`)) return `k${n}`;
  return null;
}

/** Darf noch eine Kategorie dazu? */
export const kategorieMoeglich = (e) => e.kategorien.length < MAX_KATEGORIEN;

/** Entwurf → { polizze (für store.polizzeSpeichern) } oder { fehler }. Beträge als Text („1.600“, „415,50“). */
export function entwurfZuPolizze(e) {
  const maximumCent = centsAusText(String(e.maximum ?? '').trim());
  if (maximumCent === null || maximumCent < 0) return { fehler: 'Bitte das Maximum pro Jahr eingeben, z. B. 3.144.' };
  const kategorien = [];
  for (const k of e.kategorien) {
    const limitCent = centsAusText(String(k.limit ?? '').trim());
    const name = String(k.name ?? '').trim();
    if (limitCent === null || limitCent < 0) return { fehler: `Bitte bei „${name || 'neue Kategorie'}“ ein Limit eingeben, z. B. 415.` };
    kategorien.push({ id: k.id, name: k.name, ...(String(k.info ?? '').trim() ? { info: k.info } : {}), limitCent });
  }
  const polizze = { name: e.name, person: e.person, beginn: e.beginn, kategorien, maximumCent };
  if (e.id) polizze.id = e.id;
  if (e.vorlage) polizze.vorlage = e.vorlage;
  const fehler = polizzePruefen(polizze);
  return fehler ? { fehler } : { polizze };
}

// ---------------------------------------------------------------- Push-Erinnerungen (Spec §6)

/**
 * Die Erinnerungen der Versicherung, deren Tag von `heute` an noch kommen kann → [{ schluessel, art, tag, titel, text }] (je 09:00 Wien,
 * push/plan.js legt Zeit und Kennung fest). Nur aus `v` = state.versicherung (der Aufrufer prüft `frisch`), gerechnet aus dem zuletzt
 * GESPEICHERTEN Stand (`bestaetigt`, solange eigene Änderungen offen sind): so schicken beide Telefone denselben Plan.
 *  - 'versOffen': `eingereichtAm` + 30 Tage, solange keine Erstattung eingetragen ist – einmal je Rechnung (Schlüssel = Rechnung); mit der
 *    Erstattung fällt sie beim nächsten Plan weg. Liegt der Tag schon zurück (z. B. spät nachgetragen), kommt keine mehr.
 *  - 'versJahr': 01.12. des laufenden und des nächsten Jahres, nur wenn bis 31.12. noch etwas erstattbar ist (Rest > 0) und die Polizze
 *    in dem Jahr schon läuft; nennt den Rest und die Kategorien mit Rest (kurz, höchstens drei).
 * Wirft nie (unbrauchbare Daten → []).
 */
export function versicherungTermine(v, heute) {
  try {
    const teil = stand(v, { gespeichert: true });
    const polizze = teil?.daten?.polizze;
    if (!polizze) return [];
    const termine = [];
    for (const o of offeneErstattungen(alleRechnungen(teil.teile ?? {}, { geschrieben: v.geschrieben }), heute)) {
      if (o.erinnerungAm < heute) continue;
      termine.push({ schluessel: `vers-offen-${o.rechnung.id}`, art: 'versOffen', tag: o.erinnerungAm, titel: '🩺 Versicherung', text: offenText(polizze, o.rechnung) });
    }
    const jetzt = Number(heute.slice(0, 4));
    for (const jahr of [jetzt, jetzt + 1]) {
      const tag = `${jahr}-12-01`;
      if (tag < heute || (istDatum(polizze.beginn) && polizze.beginn > `${jahr}-12-31`)) continue;
      const text = jahresendeText(polizze, jahresStand(polizze, rechnungenJahr(teil, jahr), jahr));
      if (text) termine.push({ schluessel: `vers-jahr-${jahr}`, art: 'versJahr', tag, titel: '🩺 Versicherung', text });
    }
    return termine;
  } catch {
    return [];
  }
}

/** „Erstattung für Rechnung vom 12.10. (Medikamente) noch offen?“ */
export const offenText = (polizze, rechnung) => `Erstattung für Rechnung vom ${kurzDatum(rechnung.datum)} (${kategorieKurz(polizze, rechnung.kategorie)}) noch offen?`;

/** „Bis 31.12. noch 3.109,60 € (Privatarzt, Physiotherapie, Psychotherapie …)“ – null, wenn nichts mehr erstattbar ist. */
export function jahresendeText(polizze, s) {
  const rest = erstattbarerRest(s);
  if (!s || rest <= 0) return null;
  const mitRest = s.kategorien.filter((k) => k.restCent > 0).map((k) => kategorieKurz(polizze, k.id));
  const liste = mitRest.length > 3 ? `${mitRest.slice(0, 3).join(', ')} …` : mitRest.join(', ');
  return `Bis 31.12. noch ${betragText(rest)} (${liste})`;
}

/** Tage bis zur Erinnerung „noch offen?“ (für den Hinweis im Blatt). */
export const ERINNERUNG_NACH_TAGEN = ERSTATTUNG_ERINNERUNG_TAGE;
