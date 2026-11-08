// Versicherung – die Rechnung (Spec §5): Verbrauch, Rest und Überschreitung je Kategorie und Kalenderjahr, offene Erstattungen.
// Rein und deterministisch, ohne DOM und ohne Netz; GANZE CENT. Gespeichert werden nur Polizze und Rechnungen (versicherung.js) –
// alles hier wird bei jedem Aufruf neu gerechnet, ein geändertes Limit oder eine eingetragene Erstattung wirkt also sofort.

import { addDays, diffDays, heutePruefen } from './dates.js';
import { rechnungJahr } from './versicherung.js';

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

const nachQuartal = (teileDesJahres) =>
  Object.entries(teileDesJahres ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([, teil]) => teil?.rechnungen ?? []);

/**
 * Alle Rechnungen des Kalenderjahres `jahr` aus den gelesenen Quartal-Teilen `teile` = { [jahr]: { [quartal]: Teil } } (so liefert sie
 * leseVersicherung), in der Reihenfolge der Quartale; fehlende Quartale oder Jahre zählen leer. Für jahresStand. Steht eine Rechnung
 * nach einem abgebrochenen Verschieben in zwei Teilen, kommt sie zweimal (vorsichtig gerechnet und sichtbar, siehe rechnungTeilWechseln).
 */
export function rechnungenDesJahres(teile, jahr) {
  return nachQuartal(teile?.[jahr]);
}

/** Alle Rechnungen aller gelesenen Quartal-Teile (Jahre aufsteigend) – z. B. für offeneErstattungen und die Erinnerungen. */
export function alleRechnungen(teile) {
  return Object.keys(teile ?? {})
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((jahr) => nachQuartal(teile[jahr]));
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
