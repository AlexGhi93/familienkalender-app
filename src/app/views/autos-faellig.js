// Autos: was bald oder überfällig ist – für die Karte „🚗 Auto“ auf Heute und die Push-Erinnerungen (push/plan.js `autoErinnerungen`).
// Rein (ohne DOM, ohne Netz); gerechnet wird mit domain/autos-rechnung.js `autoUebersicht`. Texte nennen nur Auto, Sache, Datum und km.
import { diffDays, isValidDate } from '../../domain/dates.js';
import { datumText, kmText } from '../../domain/autos.js';
import { autoUebersicht } from '../../domain/autos-rechnung.js';
import { autosHistorien } from '../store.js';

const RANG = { ueberfaellig: 0, bald: 1 };
const MAX_ZEILEN = 3;
const kurzDatum = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
const istDatum = (x) => typeof x === 'string' && isValidDate(x);

/** km für den Text: ab 1.000 auf Hunderter, darunter auf Zehner gerundet („ca. 15.200 km“). */
export const caKm = (km) => kmText(Math.abs(km) >= 1000 ? Math.round(km / 100) * 100 : Math.round(km / 10) * 10);

/**
 * Alle Termine der aktiven Regeln aller Autos am Tag `heute` → [{ auto, f }] (f = Eintrag aus autoUebersicht(…).faellig: regel, datum,
 * status, …). `teil` = { daten, historie } (state.autos oder dessen `bestaetigt`). Unbrauchbare Daten → [] (wirft nie).
 */
export function autosTermine(teil, heute) {
  try {
    if (!teil?.daten || !Array.isArray(teil.daten.autos) || teil.daten.autos.length === 0) return [];
    return autoUebersicht(teil.daten, autosHistorien(teil), heute).flatMap((u) => u.faellig.map((f) => ({ auto: u.auto, f })));
  } catch {
    return [];
  }
}

/** „Vignette 2027 kaufen – online bis 13.01., im Geschäft bis 31.01.“; nach dem 13.01. nur noch „im Geschäft bis 31.01.“. */
function vignetteText(f, heute) {
  const geschaeft = `im Geschäft bis ${kurzDatum(f.kaufenBis)}`;
  return `Vignette ${f.vignetteJahr} kaufen – ${heute > f.datum ? geschaeft : `online bis ${kurzDatum(f.datum)}, ${geschaeft}`}`;
}

/** Saisonaler Reifenwechsel: „Winterreifen montieren – “ vor dem Text. */
const vorsatz = (f) => (f.regel.typ === 'reifenwechsel' && f.saison ? `${f.saison === 'winter' ? 'Winter' : 'Sommer'}reifen montieren – ` : '');
const nachKm = (f) => f.quelle === 'km' && Number.isInteger(f.km);

/** „überfällig seit 01.10.2026“ (km-Termin: „seit etwa …“); überfällig nur nach km ohne vergangenes Datum: „ca. 300 km drüber“. */
function ueberfaelligText(f, heute) {
  if (istDatum(f.datum) && f.datum < heute) return `überfällig seit ${nachKm(f) ? 'etwa ' : ''}${datumText(f.datum)}`;
  return Number.isFinite(f.restKm) && f.restKm < 0 ? `überfällig – ca. ${caKm(-f.restKm)} drüber` : 'überfällig';
}

/** „in 6 Tagen“, „morgen“, „heute“. */
const inTagen = (n) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

/**
 * Text einer Push-Erinnerung: `tage` = 30 bzw. 7 (so lange vor dem Termin) oder null (überfällig). km-Regel: „bei ca. 15.200 km (etwa
 * 13.12.2026)“; Vignette siehe vignetteText; sonst „fällig am 20.11.2026 (in 30 Tagen)“ bzw. „überfällig seit …“.
 */
export function erinnerungText(f, tage, heute) {
  if (f.regel.typ === 'vignette') return vignetteText(f, heute);
  if (tage === null) return `${vorsatz(f)}${ueberfaelligText(f, heute)}`;
  if (nachKm(f)) return `${vorsatz(f)}bei ca. ${caKm(f.km)} (etwa ${datumText(f.datum)})`;
  return `${vorsatz(f)}fällig am ${datumText(f.datum)} (in ${tage} Tagen)`;
}

/** Text einer Zeile der Karte auf Heute (wie die Erinnerung, aber mit den Tagen bis zum Termin von heute aus). */
function zeilenText(f, heute) {
  if (f.regel.typ === 'vignette') return vignetteText(f, heute);
  if (f.status === 'ueberfaellig') return `${vorsatz(f)}${ueberfaelligText(f, heute)}`;
  if (!istDatum(f.datum)) return `${vorsatz(f)}noch ca. ${caKm(f.restKm ?? 0)}`;
  if (nachKm(f)) return `${vorsatz(f)}bei ca. ${caKm(f.km)} (etwa ${datumText(f.datum)})`;
  return `${vorsatz(f)}fällig am ${datumText(f.datum)} (${inTagen(diffDays(heute, f.datum))})`;
}

/** Reihenfolge der Karte: überfällig vor bald, dann nach Datum (ohne Datum zuletzt), dann nach Auto und Sache. */
function vergleich(a, b) {
  const da = a.f.datum ?? '9999-12-31';
  const db = b.f.datum ?? '9999-12-31';
  return RANG[a.f.status] - RANG[b.f.status] || (da < db ? -1 : da > db ? 1 : 0) || `${a.auto.name} ${a.f.regel.name}`.localeCompare(`${b.auto.name} ${b.f.regel.name}`, 'de');
}

/**
 * Karte „🚗 Auto“ auf Heute → null (nichts bald oder überfällig) oder { zeilen: [{ autoId, ziel: '#/autos/<id>', titel, text, status }]
 * (höchstens 3), anzahl, mehr (= anzahl − Zeilen) }. `autos` = state.autos; zählt auch aus dem Schnappschuss (nicht frisch gelesen):
 * es ist eine Anzeige der Daten auf diesem Telefon – Push-Erinnerungen gibt es dagegen nur aus frisch gelesenen (push/plan.js).
 */
export function autoKarteModel(autos, heute) {
  const liste = autosTermine(autos, heute)
    .filter(({ f }) => f.status === 'bald' || f.status === 'ueberfaellig')
    .sort(vergleich);
  if (liste.length === 0) return null;
  const zeilen = liste.slice(0, MAX_ZEILEN).map(({ auto, f }) => ({ autoId: auto.id, ziel: `#/autos/${auto.id}`, titel: `${auto.name}: ${f.regel.name}`, text: zeilenText(f, heute), status: f.status }));
  return { zeilen, anzahl: liste.length, mehr: liste.length - zeilen.length };
}
