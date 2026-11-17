// Versicherung – die Rechnung (Spec §5): Verbrauch, Rest und Überschreitung je Kategorie und Kalenderjahr, offene Erstattungen.
// Rein und deterministisch, ohne DOM und ohne Netz; GANZE CENT. Gespeichert werden nur Polizze und Rechnungen (versicherung.js) –
// alles hier wird bei jedem Aufruf neu gerechnet, ein geändertes Limit oder eine eingetragene Erstattung wirkt also sofort.

import { addDays, diffDays, heutePruefen } from './dates.js';
import { kurzDatum } from './format.js';
import { istDatum } from './gemeinsam.js';
import { aktivePolizzen, polizzeVonRechnung, rechnungJahr, rechnungQuartal } from './versicherung.js';

/** Nach so vielen Tagen ohne Erstattung erinnert die App an eine eingereichte Rechnung (Spec §6). */
export const ERSTATTUNG_ERINNERUNG_TAGE = 30;

const istJahr = (j) => Number.isInteger(j) && j >= 2000 && j <= 2100;
const hatErstattung = (r) => Number.isInteger(r.erstattetCent);

/** Verbrauch einer Rechnung: die Erstattung, wenn sie eingetragen ist (auch 0 oder mehr als der Betrag), sonst der Rechnungsbetrag. */
const verbrauchVon = (r) => (hatErstattung(r) ? r.erstattetCent : r.betragCent);

/** Feste Reihenfolge für die Überschreitung: Rechnungsdatum, dann Einreichdatum, dann Kennung. */
const zeitlich = (a, b) => (a.datum !== b.datum ? (a.datum < b.datum ? -1 : 1) : a.eingereichtAm !== b.eingereichtAm ? (a.eingereichtAm < b.eingereichtAm ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Stand der Polizze im Kalenderjahr `jahr` aus den Rechnungen (beliebige Liste; es zählen nur die mit Rechnungsdatum in `jahr`).
 *
 *   → { jahr,
 *       kategorien: [{ id, limitCent, verbrauchtCent, eingereichtCent, erstattetCent, restCent, ueberschrittenCent }]  (Reihenfolge der Polizze),
 *       gesamt: { maximumCent, verbrauchtCent, restCent, ueberschrittenCent, ohneKategorieCent },
 *       rechnungen: [{ id, kategorie, verbrauchtCent, ueberschrittenCent }]  (zeitlich, siehe unten) }
 *   Ohne Polizze → null.
 *
 * Verbrauch (Spec §5): je Rechnung `erstattetCent`, wenn eingetragen, sonst `betragCent` (vorsichtig: noch nicht erstattete zählen
 * voll). eingereichtCent = Σ betragCent der noch nicht erstatteten, erstattetCent = Σ erstattetCent der erstatteten; also
 * verbrauchtCent = eingereichtCent + erstattetCent.
 *
 * Rest (Spec §5, Entscheid C2): angerechnet wird je Kategorie nur bis zum Limit – was darüber liegt, wird nie erstattet und frisst
 * daher den Gesamtrest nicht:  gesamt.restCent = max(0, maximumCent − Σ_k min(verbraucht_k, limit_k));
 * restCent einer Kategorie = min(max(0, limitCent − verbrauchtCent), gesamt.restCent). Nie negativ. Rechnungen ohne bekannte Kategorie
 * (Limit 0) werden nicht angerechnet. Es gilt: min(Maximum, Σ min(verbraucht_k, limit_k)) + gesamt.ueberschrittenCent = gesamt.verbrauchtCent.
 *
 * Überschreitung = „ca. so viel wird nicht erstattet“ – was über dem Limit der Kategorie liegt, plus der Anteil über dem Maximum,
 * gerechnet nur auf das, was innerhalb der Limits liegt (sonst zählte derselbe Euro zweimal). Genau: die Rechnungen des Jahres werden
 * zeitlich (Rechnungsdatum, Einreichdatum, Kennung) durchgegangen, mit offenLimit[k] = limitCent und offenMaximum = maximumCent:
 *     innerhalb    = min(Verbrauch, offenLimit[k])      ueberLimit   = Verbrauch − innerhalb
 *     gedeckt      = min(innerhalb, offenMaximum)        ueberMaximum = innerhalb − gedeckt
 *     ueberschrittenCent der Rechnung = ueberLimit + ueberMaximum;  offenLimit[k] −= innerhalb;  offenMaximum −= gedeckt
 *   Die Rechnung, die ein Limit oder das Maximum sprengt, trägt also die Überschreitung (Warnung an der Rechnung und auf der Karte).
 *   ueberschrittenCent einer Kategorie = Σ ihrer Rechnungen; gesamt.ueberschrittenCent = Σ aller Rechnungen
 *   = Σ max(0, verbraucht_k − limit_k) + max(0, Σ min(verbraucht_k, limit_k) − maximumCent) (+ ohneKategorieCent).
 *   Eine Rechnung, deren Kategorie es in der Polizze nicht (mehr) gibt, hat Limit 0: sie zählt im Gesamt-Verbrauch (ohneKategorieCent)
 *   und ganz als Überschreitung.
 *   Am Ende ist offenMaximum genau gesamt.restCent – Rest und Überschreitung passen also immer zusammen.
 *
 * Die Rechnungen eines Jahres kommen aus seinen vier Quartal-Teilen: rechnungenDesJahres(teile, jahr).
 */
export function jahresStand(polizze, rechnungen, jahr) {
  if (!istJahr(jahr)) throw new Error(`Ungültiges Jahr: ${jahr}`);
  if (!polizze) return null;
  const imJahr = (rechnungen ?? []).filter((r) => r && typeof r.datum === 'string' && rechnungJahr(r) === jahr).sort(zeitlich);
  const kategorien = new Map(polizze.kategorien.map((k) => [k.id, { id: k.id, limitCent: k.limitCent, verbrauchtCent: 0, eingereichtCent: 0, erstattetCent: 0, restCent: 0, ueberschrittenCent: 0 }]));
  const offenLimit = new Map(polizze.kategorien.map((k) => [k.id, k.limitCent]));
  let offenMaximum = polizze.maximumCent;
  let verbraucht = 0;
  let ueberschritten = 0;
  let ohneKategorie = 0;
  const proRechnung = [];
  for (const r of imJahr) {
    const v = verbrauchVon(r);
    const k = kategorien.get(r.kategorie);
    const innerhalb = Math.min(v, offenLimit.get(r.kategorie) ?? 0);
    const gedeckt = Math.min(innerhalb, offenMaximum);
    const ueber = v - innerhalb + (innerhalb - gedeckt);
    if (k) {
      offenLimit.set(r.kategorie, offenLimit.get(r.kategorie) - innerhalb);
      k.verbrauchtCent += v;
      if (hatErstattung(r)) k.erstattetCent += r.erstattetCent;
      else k.eingereichtCent += r.betragCent;
      k.ueberschrittenCent += ueber;
    } else ohneKategorie += v;
    offenMaximum -= gedeckt;
    verbraucht += v;
    ueberschritten += ueber;
    proRechnung.push({ id: r.id, kategorie: r.kategorie, verbrauchtCent: v, ueberschrittenCent: ueber });
  }
  const gesamtRest = offenMaximum; // = max(0, maximumCent − Σ_k min(verbraucht_k, limit_k)), C2
  for (const k of kategorien.values()) k.restCent = Math.min(Math.max(0, k.limitCent - k.verbrauchtCent), gesamtRest);
  return {
    jahr,
    kategorien: [...kategorien.values()],
    gesamt: { maximumCent: polizze.maximumCent, verbrauchtCent: verbraucht, restCent: gesamtRest, ueberschrittenCent: ueberschritten, ohneKategorieCent: ohneKategorie },
    rechnungen: proRechnung,
  };
}

// ---------------------------------------------------------------- Rechnungen aus den Quartal-Teilen sammeln (Review M1, M3)
//
// `teile` = { [jahr]: { [quartal]: Teil } } wie aus leseVersicherung; `geschrieben` (freiwillig) = { [jahr]: { [quartal]: Zeitstempel } }
// ebenso aus leseVersicherung (Google: `updated` des Ereignisses, ISO-Text; Demo: keine). Gesammelt wird über ALLE Teile; jede Rechnung
// zählt nach ihrem EIGENEN Rechnungsdatum (eine falsch abgelegte zählt in ihrem echten Jahr) und jede Kennung nur einmal. Steht dieselbe
// Kennung in mehreren Teilen (abgebrochenes Verschieben, beschädigter Schreiber), gilt diese Fassung – feste Rangfolge:
//   0. die höchste `fassung` (Fix-Runde 1 Task 2: wächst mit jedem Schreiben der Rechnung; fehlend = am ältesten);
//   1. richtig abgelegt (Jahr und Quartal des Teils = die ihres Rechnungsdatums) vor falsch abgelegt;
//   2. der zuletzt geschriebene Teil (größerer Zeitstempel; Texte im ISO-Format vergleichen sich wie Zeiten; fehlend = am ältesten);
//   3. Ersatzregel ohne/bei gleichem Zeitstempel: der spätere Teil (größeres Jahr, dann größeres Quartal).
// Innerhalb eines Teils gibt es keine Doppelten (pruefeVersicherungTeil legt sie nach `fremd`).

const vergleiche = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Alle Fassungen aller Rechnungen: Map id → [{ rechnung, jahr, quartal, stelle, richtig, zeit }], die gültige zuerst. */
function fassungen(teile, geschrieben) {
  const je = new Map();
  for (const [j, quartale] of Object.entries(teile ?? {})) {
    for (const [q, teil] of Object.entries(quartale ?? {})) {
      const jahr = Number(j);
      const quartal = Number(q);
      const zeit = typeof geschrieben?.[j]?.[q] === 'string' ? geschrieben[j][q] : '';
      (teil?.rechnungen ?? []).forEach((rechnung, stelle) => {
        const f = { rechnung, jahr, quartal, stelle, zeit, fassung: Number.isInteger(rechnung.fassung) ? rechnung.fassung : -1, richtig: rechnungJahr(rechnung) === jahr && rechnungQuartal(rechnung) === quartal };
        je.set(rechnung.id, [...(je.get(rechnung.id) ?? []), f]);
      });
    }
  }
  const rang = (a, b) => b.fassung - a.fassung || Number(b.richtig) - Number(a.richtig) || vergleiche(b.zeit, a.zeit) || b.jahr - a.jahr || b.quartal - a.quartal;
  for (const liste of je.values()) liste.sort(rang);
  return je;
}

/** Die gültige Fassung je Kennung, in der Reihenfolge ihrer Teile (Jahr, Quartal) und Stellen. */
function gueltige(teile, geschrieben) {
  return [...fassungen(teile, geschrieben).values()]
    .map((liste) => liste[0])
    .sort((a, b) => a.jahr - b.jahr || a.quartal - b.quartal || a.stelle - b.stelle);
}

/**
 * Alle Rechnungen mit Rechnungsdatum im Kalenderjahr `jahr`, aus allen gelesenen Teilen, je Kennung einmal (Rangfolge oben). Für
 * jahresStand(polizze, rechnungenDesJahres(g.teile, jahr, { geschrieben: g.geschrieben }), jahr).
 */
export function rechnungenDesJahres(teile, jahr, { geschrieben } = {}) {
  return gueltige(teile, geschrieben)
    .filter((f) => rechnungJahr(f.rechnung) === jahr)
    .map((f) => f.rechnung);
}

/**
 * Die Rechnungen (beliebige Liste) der Polizze `polizzeId`: ihre eigenen (`polizze`) und – ist sie die Stamm-Polizze von `daten` –
 * die ohne Polizze (aus 1.4.x). Für jahresStand(polizze, rechnungenDerPolizze(rechnungenDesJahres(…), daten, polizze.id), jahr): jede
 * Polizze rechnet nur mit ihren Rechnungen, dieselbe Kategorie-Kennung in zwei Polizzen zählt getrennt.
 */
export const rechnungenDerPolizze = (rechnungen, daten, polizzeId) => (rechnungen ?? []).filter((r) => r && polizzeVonRechnung(daten, r) === polizzeId);

/** Alle Rechnungen aller gelesenen Teile, je Kennung einmal (Rangfolge oben) – z. B. für offeneErstattungen und die Erinnerungen. */
export function alleRechnungen(teile, { geschrieben } = {}) {
  return gueltige(teile, geschrieben).map((f) => f.rechnung);
}

/**
 * Wo steht die Rechnung `id`? → { rechnung (gültige Fassung), von: { jahr, quartal } (ihr Teil), richtig (Teil passt zum Datum),
 * weitere: [{ jahr, quartal }] (Teile mit einer weiteren Fassung – zum Aufräumen mit rechnungLoeschen) } oder null. Zum Ändern einer
 * Rechnung: passt das (neue) Datum zu `von`, genügt rechnungSetzen dort; sonst rechnungTeilWechseln(rechnung, von) – so lässt sich auch
 * eine falsch abgelegte Rechnung ändern (sie wandert dabei an den richtigen Ort).
 */
export function rechnungFinden(teile, id, { geschrieben } = {}) {
  const liste = fassungen(teile, geschrieben).get(id);
  if (!liste) return null;
  const [gilt, ...rest] = liste;
  return { rechnung: gilt.rechnung, von: { jahr: gilt.jahr, quartal: gilt.quartal }, richtig: gilt.richtig, weitere: rest.map(({ jahr, quartal }) => ({ jahr, quartal })) };
}

/**
 * Eingereichte Rechnungen ohne eingetragene Erstattung am Tag `heute` (Pflicht) → [{ rechnung, erinnerungAm, tageOffen, faellig }],
 * sortiert nach erinnerungAm, dann Kennung. erinnerungAm = eingereichtAm + 30 Tage (dann erinnert die App, Spec §6); tageOffen = Tage
 * seit dem Einreichen; faellig = erinnerungAm ≤ heute. Eine Erstattung von 0 € gilt als eingetragen (nicht offen).
 */
export function offeneErstattungen(rechnungen, heute) {
  heutePruefen(heute);
  return (rechnungen ?? [])
    .filter((r) => r && !hatErstattung(r) && typeof r.eingereichtAm === 'string')
    .map((rechnung) => {
      const erinnerungAm = addDays(rechnung.eingereichtAm, ERSTATTUNG_ERINNERUNG_TAGE);
      return { rechnung, erinnerungAm, tageOffen: diffDays(rechnung.eingereichtAm, heute), faellig: erinnerungAm <= heute };
    })
    .sort((a, b) => (a.erinnerungAm !== b.erinnerungAm ? (a.erinnerungAm < b.erinnerungAm ? -1 : 1) : a.rechnung.id < b.rechnung.id ? -1 : a.rechnung.id > b.rechnung.id ? 1 : 0));
}

/** Wohin eine Erinnerung führt (Shell: wählt die Ansicht „Versicherung“ im Konto-Tab und lässt `#/konto` stehen). */
export const VERSICHERUNG_ZIEL = '#/konto/versicherung';

/** Der Teil des Zustands, aus dem gerechnet wird: der zuletzt GESPEICHERTE Stand für Erinnerungen (`bestaetigt`), sonst der angezeigte. */
const stand = (v, { gespeichert = false } = {}) => (gespeichert && v?.bestaetigt ? v.bestaetigt : v);
export const rechnungenJahr = (v, jahr) => rechnungenDesJahres(v?.teile ?? {}, jahr, { geschrieben: v?.geschrieben });

/** Rest, der sich bis Jahresende noch erstatten lässt: der Gesamtrest, höchstens die Summe der Reste der Kategorien. */
const erstattbarerRest = (s) => (s ? Math.min(s.gesamt.restCent, s.kategorien.reduce((summe, k) => summe + k.restCent, 0)) : 0);

// ---------------------------------------------------------------- Push-Erinnerungen (Spec §6)

/**
 * Die Erinnerungen der Versicherung, deren Tag von `heute` an noch kommen kann → [{ schluessel, art, tag, titel, text }] (je 09:00 Wien,
 * push/plan.js legt Zeit und Kennung fest). Nur aus `v` = state.versicherung (der Aufrufer prüft `frisch`), gerechnet aus dem zuletzt
 * GESPEICHERTEN Stand (`bestaetigt`, solange eigene Änderungen offen sind): so schicken beide Telefone denselben Plan.
 *  - 'versOffen': `eingereichtAm` + 30 Tage, solange keine Erstattung eingetragen ist – einmal je Rechnung (Schlüssel = Rechnung); mit der
 *    Erstattung fällt sie beim nächsten Plan weg. Liegt der Tag schon zurück (z. B. spät nachgetragen), kommt keine mehr.
 *    Für die Rechnungen ALLER Polizzen, auch beendeter (die Erstattung kommt trotzdem).
 *  - 'versJahr': 01.12. des laufenden und des nächsten Jahres, EINE je Jahr (Schlüssel 'vers-jahr-<JJJJ>'), wenn bei wenigstens einer
 *    AKTIVEN Polizze, die in dem Jahr schon läuft, bis 31.12. noch etwas erstattbar ist (Rest > 0, gerechnet nur mit ihren Rechnungen);
 *    beendete zählen nicht. Nennt weder Betrag (E1) noch Kategorie (wie M5) noch die Polizze – keine Beträge und keine
 *    Gesundheitsangaben in Benachrichtigungen. Beide Arten rechnen mit denselben Schreibzeiten (`v.geschrieben`, Review T3 M3): `bestaetigt` hat keine.
 * Wirft nie (unbrauchbare Daten → []).
 */
export function versicherungTermine(v, heute) {
  try {
    const teil = stand(v, { gespeichert: true });
    const daten = teil?.daten;
    if (!Array.isArray(daten?.polizzen) || daten.polizzen.length === 0) return [];
    const termine = [];
    for (const o of offeneErstattungen(alleRechnungen(teil.teile ?? {}, { geschrieben: v.geschrieben }), heute)) {
      if (o.erinnerungAm < heute) continue;
      termine.push({ schluessel: `vers-offen-${o.rechnung.id}`, art: 'versOffen', tag: o.erinnerungAm, titel: '🩺 Versicherung', text: offenText(o.rechnung) });
    }
    const jetzt = Number(heute.slice(0, 4));
    for (const jahr of [jetzt, jetzt + 1]) {
      const tag = `${jahr}-12-01`;
      if (tag < heute) continue;
      const imJahr = rechnungenJahr({ teile: teil.teile, geschrieben: v.geschrieben }, jahr);
      const laeuft = aktivePolizzen(daten).filter((p) => !(istDatum(p.beginn) && p.beginn > `${jahr}-12-31`));
      const text = laeuft.map((p) => jahresendeText(p, jahresStand(p, rechnungenDerPolizze(imJahr, daten, p.id), jahr))).find(Boolean);
      if (text) termine.push({ schluessel: `vers-jahr-${jahr}`, art: 'versJahr', tag, titel: '🩺 Versicherung', text });
    }
    return termine;
  } catch {
    return [];
  }
}

/** „Erstattung für Rechnung vom 12.10. noch offen?“ – ohne Kategorie: keine Gesundheitsangabe auf dem Sperrbildschirm (Abschluss-Review M5). */
const offenText = (rechnung) => `Erstattung für Rechnung vom ${kurzDatum(rechnung.datum)} noch offen?`;

/**
 * „Bis 31.12. noch Rest bei der Versicherung – jetzt nachsehen.“ – ohne Betrag (E1) und ohne Kategorie (wie M5: keine Gesundheitsangabe
 * auf dem Sperrbildschirm); welche Kategorien Rest haben, zeigt die Seite. null, wenn nichts mehr erstattbar ist.
 */
export function jahresendeText(polizze, s) {
  return s && erstattbarerRest(s) > 0 ? 'Bis 31.12. noch Rest bei der Versicherung – jetzt nachsehen.' : null;
}
