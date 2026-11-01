// Autos: was bald oder überfällig ist – für die Karte „🚗 Auto“ auf Heute und die Push-Erinnerungen (push/plan.js `autoErinnerungen`).
// Rein (ohne DOM, ohne Netz, ohne Uhr: `heute` kommt herein); gerechnet wird mit domain/autos-rechnung.js. Texte nennen nur Auto, Sache,
// Datum und km.
import { addDays, diffDays, isValidDate } from '../../domain/dates.js';
import { datumText, kmText } from '../../domain/autos.js';
import { autoUebersicht, autosHistorien } from '../../domain/autos-rechnung.js';

const RANG = { ueberfaellig: 0, bald: 1 };
const MAX_ZEILEN = 3;
const kurzDatum = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
const istDatum = (x) => typeof x === 'string' && isValidDate(x);

/** km für den Text: ab 1.000 auf Hunderter, darunter auf Zehner gerundet („ca. 15.200 km“). */
export const caKm = (km) => kmText(Math.abs(km) >= 1000 ? Math.round(km / 100) * 100 : Math.round(km / 10) * 10);

/** autoUebersicht für `teil` = { daten, historie } (state.autos oder dessen `bestaetigt`) am Tag `heute`; unbrauchbar → [] (wirft nie). */
export function autosUebersichten(teil, heute) {
  try {
    if (!teil?.daten || !Array.isArray(teil.daten.autos) || teil.daten.autos.length === 0) return [];
    return autoUebersicht(teil.daten, autosHistorien(teil), heute);
  } catch {
    return [];
  }
}

/** Alle Termine der aktiven Regeln aller Autos am Tag `heute` → [{ auto, f }] (f = Eintrag aus autoUebersicht(…).faellig). */
export const autosTermine = (teil, heute) => autosUebersichten(teil, heute).flatMap((u) => u.faellig.map((f) => ({ auto: u.auto, f })));

/**
 * Wann ein Termin erinnert – NUR aus seinem Datum, nie aus „heute“ (Ruling I1 nach dem Review T3): so ist jeder Zeitpunkt auf beiden
 * Telefonen und bei jeder Neuberechnung derselbe, und jede Erinnerung kommt genau einmal. → [{ art, tag }] (Uhrzeit 09:00 Wien):
 * - saisonaler Reifenwechsel (nur solange der falsche Satz drauf ist – sonst hat er einen anderen Termin): an den festen Tagen der Spec §4
 *   (Ruling I4), 'saison' am Beginn (`erinnerungAb`: 15.10. bzw. 1.4.) und 'auto0' am Stichtag (1.11. bzw. 15.4.);
 * - sonst: 'auto30' 30 Tage vorher, 'auto7' 7 Tage vorher, 'auto0' am Tag selbst und 'autoUeber' eine Woche danach (fällt weg, sobald
 *   die Arbeit eingetragen ist: dann hat die Regel einen neuen Termin).
 * Nichts für „unbekannt“ (`ohneErinnerung`), ohne Datum oder abgeschaltete Regeln.
 */
export function erinnerungsTage(f) {
  if (!f || f.ohneErinnerung || f.regel?.aktiv === false || !istDatum(f.datum)) return [];
  if (f.regel.typ === 'reifenwechsel') return istDatum(f.erinnerungAb) && f.erinnerungAb < f.datum ? [{ art: 'saison', tag: f.erinnerungAb }, { art: 'auto0', tag: f.datum }] : [{ art: 'auto0', tag: f.datum }];
  return [
    { art: 'auto30', tag: addDays(f.datum, -30) },
    { art: 'auto7', tag: addDays(f.datum, -7) },
    { art: 'auto0', tag: f.datum },
    { art: 'autoUeber', tag: addDays(f.datum, 7) },
  ];
}

const ABSTAND = { auto30: 'in 1 Monat', auto7: 'in 1 Woche' };

/** Vignette: je näher der 13.01. (online gilt sie erst ab dem 18. Tag), desto dringlicher; danach nur noch im Geschäft bis 31.01. */
function vignetteText(f, art) {
  const j = f.vignetteJahr;
  const geschaeft = `im Geschäft bis ${kurzDatum(f.kaufenBis)}`;
  if (art === 'auto7') return `Vignette ${j} jetzt kaufen – online nur noch bis ${kurzDatum(f.datum)}, ${geschaeft}`;
  if (art === 'auto0') return `Vignette ${j}: heute letzter Tag für den Online-Kauf – ${geschaeft}`;
  if (art === 'autoUeber' || art === 'ueberfaellig') return `Vignette ${j} kaufen – nur noch ${geschaeft}`;
  return `Vignette ${j} kaufen – online bis ${kurzDatum(f.datum)}, ${geschaeft}`;
}

/** Saisonaler Reifenwechsel: „Winterreifen montieren – “ vor dem Text. */
const vorsatz = (f) => (f.regel.typ === 'reifenwechsel' && f.saison ? `${f.saison === 'winter' ? 'Winter' : 'Sommer'}reifen montieren – ` : '');
const nachKm = (f) => f.quelle === 'km' && Number.isInteger(f.km);

/**
 * Text der Push-Erinnerung `art` (siehe erinnerungsTage) – hängt nur am Termin, nicht am Tag der Berechnung. km-Regel: „bei ca. 15.200 km
 * (etwa 13.12.2026, in 1 Monat)“; Vignette siehe vignetteText; sonst „fällig am 20.11.2026 (in 1 Monat)“, „heute fällig“, „seit 1 Woche
 * überfällig“.
 */
export function erinnerungText(f, art) {
  if (f.regel.typ === 'vignette') return vignetteText(f, art);
  const d = datumText(f.datum);
  const km = nachKm(f) ? caKm(f.km) : null;
  let text;
  if (art === 'saison') text = `fällig am ${d} (in ${diffDays(f.erinnerungAb, f.datum)} Tagen)`;
  else if (art === 'auto0') text = km ? `heute etwa erreicht: ca. ${km}` : `heute fällig (${d})`;
  else if (art === 'autoUeber') text = km ? `seit etwa 1 Woche überfällig (bei ca. ${km})` : `seit 1 Woche überfällig (fällig am ${d})`;
  else text = km ? `bei ca. ${km} (etwa ${d}, ${ABSTAND[art]})` : `fällig am ${d} (${ABSTAND[art]})`;
  return `${vorsatz(f)}${text}`; // unbekannt, welcher Satz drauf ist: gar keine Erinnerung (M7, Abschluss-Review)
}

/** „überfällig seit 01.10.2026“ (km-Termin: „seit etwa …“); überfällig nur nach km ohne vergangenes Datum: „ca. 300 km darüber“. */
function ueberfaelligText(f, heute) {
  if (istDatum(f.datum) && f.datum < heute) return `überfällig seit ${nachKm(f) ? 'etwa ' : ''}${datumText(f.datum)}`;
  return Number.isFinite(f.restKm) && f.restKm < 0 ? `überfällig – ca. ${caKm(-f.restKm)} darüber` : 'überfällig';
}

/** „in 6 Tagen“, „morgen“, „heute“. */
const inTagen = (n) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

/** Text einer Zeile der Karte auf Heute (mit den Tagen bis zum Termin von heute aus). */
function zeilenText(f, heute) {
  if (f.regel.typ === 'vignette') return vignetteText(f, heute > f.datum ? 'ueberfaellig' : 'auto30');
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
