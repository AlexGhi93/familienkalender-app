// Versicherung – die Rechnung (Spec §5): Verbrauch, Rest und Überschreitung je Kategorie und Kalenderjahr, offene Erstattungen.
// Rein und deterministisch, ohne DOM und ohne Netz; GANZE CENT. Gespeichert werden nur Polizze und Rechnungen (versicherung.js) –
// alles hier wird bei jedem Aufruf neu gerechnet, ein geändertes Limit oder eine eingetragene Erstattung wirkt also sofort.

import { addDays, diffDays, heutePruefen } from './dates.js';
import { rechnungJahr, rechnungQuartal } from './versicherung.js';

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
        const f = { rechnung, jahr, quartal, stelle, zeit, richtig: rechnungJahr(rechnung) === jahr && rechnungQuartal(rechnung) === quartal };
        je.set(rechnung.id, [...(je.get(rechnung.id) ?? []), f]);
      });
    }
  }
  const rang = (a, b) => Number(b.richtig) - Number(a.richtig) || vergleiche(b.zeit, a.zeit) || b.jahr - a.jahr || b.quartal - a.quartal;
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
