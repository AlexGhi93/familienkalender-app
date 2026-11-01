// Autos – die Rechnungen: Kilometerstand schätzen, Termine der Regeln, Kilometer je Reifensatz, Vignette, Saison-Hinweis, Übersicht.
// Rein und deterministisch, ohne DOM und ohne Netz; alles wird bei jedem Aufruf aus den gespeicherten Daten (autos.js) neu gerechnet.
//
// Regeln (Spezifikation „Autos 1.3.0“ §4 und die Festlegungen im Plan):
// - km-Schätzung: letzter bekannter Stand + Durchschnitt km/Tag × Tage seitdem. Durchschnitt aus den Punkten der letzten 90 Tage, wenn
//   es dort mindestens 2 (an verschiedenen Tagen) gibt, sonst aus allen; sonst keiner (proTag null). Ein Stand, der niedriger ist als ein
//   früherer, ist ein Tippfehler: Warnung, er zählt nicht mit – die Schätzung liegt nie unter dem höchsten bekannten Stand. Ein Sprung von
//   mehr als MAX_KM_PRO_TAG km/Tag: Warnung, und gerechnet wird höchstens damit (keine absurden Termine).
// - Termin einer Regel = das früheste aus: letzte passende Arbeit + intervallMonate; letzte Arbeit (mit km) + intervallKm, über den
//   Durchschnitt in ein Datum umgerechnet (km-Termin = Tag des letzten Standes + Rest-km / km pro Tag – so bleibt er von Tag zu Tag
//   gleich); fester Monat (letzter Tag des Monats). Ohne Arbeit: ersteFaelligkeit/ersteFaelligkeitKm, sonst ab der Erstzulassung
//   (EZ + Monate; km ab 0 bei der EZ). Status: 'ueberfaellig' (Datum vor heute oder km überschritten), 'bald' (≤ 30 Tage oder ≤ 1.000 km),
//   'ok'; 'unbekannt', wenn sich weder Datum noch Rest-km sagen lassen (z. B. nur km-Intervall und noch kein Kilometerstand).
// - Vignette (AT, ASFINAG): die Jahresvignette JJJJ gilt 01.12.(JJJJ−1) bis 31.01.(JJJJ+1); kaufen bis 31.01.JJJJ (dann läuft die alte ab).
// - Reifen: km je Satz = Summe der Strecken, in denen er montiert war (aus den Reifenwechseln: vom km des Wechsels bis zum nächsten);
//   eine Rotation (oder ein Reifenwechsel mit „vorne/hinten getauscht“) setzt die km seit der Rotation des Satzes auf 0.

import { addDays, diffDays, isValidDate } from './dates.js';
import { letzterTag } from './konto.js';
import { heutePruefen } from './sparziele-rechnung.js';
import { AUTO_VORLAGEN, BALD_KM, BALD_TAGE, KM_FENSTER_TAGE, MAX_KM_PRO_TAG, ROTATION_KM, datumText, kmText, monatPlus } from './autos.js';

const QUELLE_WINTERREIFEN = 'https://www.oesterreich.gv.at/de/themen/mobilitaet/kfz/10/2/Seite.063100';
const MAX_TAGE_VORAUS = 36_500; // weiter als 100 Jahre: kein Datum (z. B. riesige Rest-km bei fast stehendem Auto)
const RANG = Object.freeze({ ueberfaellig: 0, bald: 1, ok: 2, unbekannt: 3 });

const istDatum = (x) => typeof x === 'string' && isValidDate(x);
const istMonat = (x) => typeof x === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(x);
const frueher = (a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : (a.km ?? 0) - (b.km ?? 0));

/** Datum plus `n` Monate; ein Tag, den es im Zielmonat nicht gibt, wird aufs Monatsende gekürzt (31.01. + 1 Monat = 28./29.02.). */
function plusMonate(datum, n) {
  const ende = letzterTag(monatPlus(datum.slice(0, 7), n));
  const tag = `${ende.slice(0, 8)}${datum.slice(8, 10)}`;
  return tag <= ende ? tag : ende;
}

// ---------------------------------------------------------------- Punkte und Arbeiten eines Autos

/**
 * Alle Kilometerpunkte eines Autos aus seinen Verlauf-Teilen, nach Datum: [{ datum, km, quelle, arbeit? }] – die Erstzulassung (0 km,
 * quelle 'ez'), eingegebene Stände und Arbeiten mit km (quelle 'arbeit', mit ihrer Kennung). Arbeiten mit GESCHÄTZTEM km zählen nicht.
 * `auto` = das Auto (für die EZ) oder nur seine Kennung.
 */
export function kmPunkte(historien, auto) {
  const id = typeof auto === 'string' ? auto : auto?.id;
  const punkte = [];
  if (typeof auto === 'object' && istDatum(auto?.ezDatum)) punkte.push({ datum: auto.ezDatum, km: 0, quelle: 'ez' });
  for (const h of historien ?? []) {
    if (h?.auto !== id) continue;
    for (const p of h.km ?? []) punkte.push({ datum: p.datum, km: p.km, quelle: p.quelle ?? 'eingabe' });
    for (const a of h.arbeiten ?? []) if (Number.isInteger(a.km) && !a.kmGeschaetzt) punkte.push({ datum: a.datum, km: a.km, quelle: 'arbeit', arbeit: a.id });
  }
  return punkte.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
}

/** Alle Arbeiten eines Autos aus seinen Verlauf-Teilen, die ältesten zuerst (gleicher Tag: nach km). */
export function arbeitenVon(historien, autoId) {
  return (historien ?? [])
    .filter((h) => h?.auto === autoId)
    .flatMap((h) => (h.arbeiten ?? []).map((a) => ({ ...a, auto: a.auto ?? autoId })))
    .sort(frueher);
}

// ---------------------------------------------------------------- Kilometerstand schätzen

/** Durchschnitt km/Tag zwischen dem ersten und letzten Punkt (verschiedene Tage), sonst null. */
function proTagAus(liste) {
  if (liste.length < 2) return null;
  const tage = diffDays(liste[0].datum, liste.at(-1).datum);
  return tage > 0 ? (liste.at(-1).km - liste[0].km) / tage : null;
}

/**
 * Geschätzter Kilometerstand am Tag `heute` aus `punkte` ([{ datum, km }], z. B. aus kmPunkte) →
 * { km, geschaetzt, proTag, datum, letzterKm, warnung } oder null ohne Punkte (Review Focus 2: „unbekannt“, keine Division durch 0).
 * datum/letzterKm = der letzte (höchste) bekannte Stand; geschaetzt = km liegt darüber (dann „ca.“ zeigen); proTag = km pro Tag oder
 * null (zu wenig Punkte); warnung = Text zu Tippfehlern (niedrigerer Stand, großer Sprung) oder null. Punkte mehr als 1 Tag nach
 * `heute` zählen nicht.
 */
export function kmSchaetzung(punkte, heute) {
  heutePruefen(heute);
  const bis = addDays(heute, 1);
  const gueltig = (punkte ?? []).filter((p) => p && istDatum(p.datum) && p.datum <= bis && Number.isInteger(p.km) && p.km >= 0).sort(frueher);
  if (gueltig.length === 0) return null;
  const warnungen = [];
  const folge = [];
  for (const p of gueltig) {
    const vorher = folge.at(-1);
    if (vorher && p.km < vorher.km) {
      warnungen.push(`Der Kilometerstand vom ${datumText(p.datum)} (${kmText(p.km)}) ist niedriger als ein früherer (${kmText(vorher.km)}) und wird nicht mitgerechnet – bitte prüfen.`);
      continue;
    }
    if (vorher && (p.km - vorher.km) / Math.max(1, diffDays(vorher.datum, p.datum)) > MAX_KM_PRO_TAG) {
      warnungen.push(`Der Kilometerstand vom ${datumText(p.datum)} (${kmText(p.km)}) ist ein ungewöhnlich großer Sprung – bitte prüfen.`);
    }
    folge.push(p);
  }
  const ab = addDays(heute, -KM_FENSTER_TAGE);
  let proTag = proTagAus(folge.filter((p) => p.datum >= ab)) ?? proTagAus(folge);
  if (proTag !== null) proTag = Math.min(proTag, MAX_KM_PRO_TAG);
  const letzter = folge.at(-1);
  const tage = Math.max(0, diffDays(letzter.datum, heute));
  const km = letzter.km + (proTag ? Math.round(proTag * tage) : 0);
  return { km, geschaetzt: km > letzter.km, proTag, datum: letzter.datum, letzterKm: letzter.km, warnung: warnungen.length > 0 ? [...new Set(warnungen)].join(' ') : null };
}

// ---------------------------------------------------------------- Reifen

/**
 * Kilometer je Reifensatz → [{ satz, montiert, kmGesamt, kmSeitRotation, rotationFaellig, geschaetzt, montiertAm? }] in der Reihenfolge
 * von `saetze`. Aus den Arbeiten zählen 'reifenwechsel' (details.montiert, km Pflicht) und 'rotation' (details.satzId, sonst der
 * montierte Satz): der montierte Satz bekommt die Strecke bis zum nächsten Wechsel bzw. bis zum geschätzten Stand `kmInfo.km`
 * (kmSchaetzung; null = nur bis zum letzten Wechsel). Derselbe Satz noch einmal montiert, ein doppelter Eintrag oder eine Rotation ohne
 * Wechsel zählen keinen km doppelt (Review Focus 3); ein zu niedriger km zählt 0, nie negativ. startKm = km vor dem ersten Eintrag.
 * geschaetzt = eine Strecke beginnt/endet bei einem geschätzten km (Arbeit mit kmGeschaetzt, Startwert geschätzt, geschätzter Stand).
 * rotationFaellig ab `rotationKm` (Standard 10.000) km seit der letzten Rotation.
 */
export function reifenStand(saetze, arbeiten, kmInfo, { rotationKm = ROTATION_KM } = {}) {
  const stand = new Map((saetze ?? []).map((s) => [s.id, { kmGesamt: s.startKm ?? 0, kmSeitRotation: s.startKm ?? 0, geschaetzt: s.startGeschaetzt === true }]));
  const ereignisse = (arbeiten ?? [])
    .filter((a) => Number.isInteger(a.km) && ((a.typ === 'reifenwechsel' && a.details?.montiert) || a.typ === 'rotation'))
    .map((a, i) => ({ a, i }))
    .sort((x, y) => frueher(x.a, y.a) || (x.a.typ === y.a.typ ? 0 : x.a.typ === 'reifenwechsel' ? -1 : 1) || x.i - y.i)
    .map((x) => x.a);
  let montiert = null;
  let montiertAm = null;
  let ab = null;
  let abGeschaetzt = false;
  const fahren = (bisKm, bisGeschaetzt) => {
    const s = montiert === null ? null : stand.get(montiert);
    const strecke = ab === null ? 0 : Math.max(0, bisKm - ab);
    if (s && strecke > 0) {
      s.kmGesamt += strecke;
      s.kmSeitRotation += strecke;
      if (abGeschaetzt || bisGeschaetzt) s.geschaetzt = true;
    }
    if (ab === null || bisKm >= ab) {
      ab = bisKm;
      abGeschaetzt = bisGeschaetzt;
    }
  };
  for (const e of ereignisse) {
    const geschaetzt = e.kmGeschaetzt === true;
    if (e.typ === 'reifenwechsel') {
      fahren(e.km, geschaetzt);
      montiert = e.details.montiert;
      montiertAm = e.datum;
      if (e.details.rotiert === true && stand.has(montiert)) stand.get(montiert).kmSeitRotation = 0;
    } else {
      const ziel = e.details?.satzId ?? montiert;
      if (ziel !== null && ziel === montiert) fahren(e.km, geschaetzt);
      if (stand.has(ziel)) stand.get(ziel).kmSeitRotation = 0;
    }
  }
  if (montiert !== null && kmInfo && Number.isInteger(kmInfo.km)) fahren(kmInfo.km, kmInfo.geschaetzt === true);
  return (saetze ?? []).map((satz) => {
    const s = stand.get(satz.id);
    const x = { satz, montiert: satz.id === montiert, kmGesamt: s.kmGesamt, kmSeitRotation: s.kmSeitRotation, rotationFaellig: s.kmSeitRotation >= rotationKm, geschaetzt: s.geschaetzt };
    if (x.montiert) x.montiertAm = montiertAm;
    return x;
  });
}

/** Der zuletzt montierte Reifenwechsel (die Arbeit) oder null. */
const letzterWechsel = (arbeiten) => (arbeiten ?? []).filter((a) => a.typ === 'reifenwechsel' && a.details?.montiert).sort(frueher).at(-1) ?? null;

/**
 * Hinweis zur Jahreszeit für den montierten Satz (Reifensatz oder null) am Tag `heute` → { saison, text, hinweis, pflicht, quelle } oder
 * null. Sommerreifen drauf ab 15.10. bis 31.3. → „Winterreifen montieren“ (pflicht = 1.11.–15.4., § 102 Abs. 8a KFG, bei winterlichen
 * Verhältnissen); Winterreifen drauf vom 1.4. bis 14.10. → „Sommerreifen montieren“. Ganzjahresreifen oder unbekannt → null.
 */
export function saisonHinweis(heute, montierterSatz) {
  heutePruefen(heute);
  const art = montierterSatz?.art;
  const md = heute.slice(5);
  const pflichtzeit = md >= '11-01' || md <= '04-15';
  if (art === 'sommer' && (md >= '10-15' || md <= '03-31')) {
    return { saison: 'winter', text: 'Winterreifen montieren', hinweis: `${pflichtzeit ? 'Vom 1.11. bis 15.4. gilt' : 'Ab 1.11. gilt'} bei winterlichen Verhältnissen die Winterausrüstungspflicht; Winterreifen mind. 4 mm Profil.`, pflicht: pflichtzeit, quelle: QUELLE_WINTERREIFEN };
  }
  if (art === 'winter' && md >= '04-01' && md < '10-15') {
    return { saison: 'sommer', text: 'Sommerreifen montieren', hinweis: `Die Winterausrüstungspflicht ${md > '04-15' ? 'endete' : 'endet'} am 15.4.; Sommerreifen mind. 1,6 mm Profil.`, pflicht: false, quelle: QUELLE_WINTERREIFEN };
  }
  return null;
}

/**
 * Nach einem Reifenwechsel (bis 7 Tage danach): „Radmuttern nach ca. 50–100 km nachziehen“ (Drehmoment aus der Vorlage des Autos, wenn
 * bekannt) → { text, arbeit, erinnerungAm (= 2 Tage nach dem Wechsel) } oder null.
 */
export function radmutternHinweis(arbeiten, heute, auto) {
  heutePruefen(heute);
  const w = letzterWechsel(arbeiten);
  if (!w) return null;
  const tage = diffDays(w.datum, heute);
  if (tage < 0 || tage > 7) return null;
  const nm = AUTO_VORLAGEN.find((v) => v.id === auto?.vorlage)?.radmutternNm;
  return { text: `Radmuttern nach ca. 50–100 km nachziehen${nm ? ` (${nm} Nm)` : ''}.`, arbeit: w.id, erinnerungAm: addDays(w.datum, 2) };
}

// ---------------------------------------------------------------- Vignette

/** Jahresvignette `jahr`: gültig 01.12.(jahr−1) bis 31.01.(jahr+1); kaufen bis 31.01.jahr (dann läuft die Vorjahres-Vignette ab). */
export function vignettenFrist(jahr) {
  if (!Number.isInteger(jahr)) throw new Error(`Ungültiges Jahr: ${jahr}`);
  return { gueltigAb: `${jahr - 1}-12-01`, gueltigBis: `${jahr + 1}-01-31`, kaufenBis: `${jahr}-01-31` };
}

// ---------------------------------------------------------------- Fälligkeiten

/** Zählt die Arbeit für die Regel? Mit `regel` an der Arbeit nur für genau diese; sonst nach Typ (nie für „sonstiges“). */
const gehoertZu = (a, regel) => (a.regel ? a.regel === regel.id : a.typ === regel.typ && regel.typ !== 'sonstiges');

/** km-Termin als Datum: Tag des letzten Standes + Rest-km / km pro Tag (nie vor `basis`). Ohne Geschwindigkeit nur, wenn schon erreicht. */
function kmDatum(kmZiel, kmInfo, basis) {
  if (kmZiel === null || !kmInfo) return null;
  if (kmInfo.proTag > 0) {
    const tage = Math.ceil((kmZiel - kmInfo.letzterKm) / kmInfo.proTag);
    if (tage > MAX_TAGE_VORAUS) return null;
    const d = addDays(kmInfo.datum, tage);
    return basis && d < basis ? basis : d;
  }
  return kmZiel <= kmInfo.letzterKm ? kmInfo.datum : null;
}

/** Ergebnis aus den Datums-Kandidaten und dem km-Ziel. */
function ergebnis(kandidaten, { kmZiel = null, restKm, kmInfo, heute, quelleOhneDatum }) {
  const erster = kandidaten.filter((k) => k.datum).reduce((a, k) => (a === null || k.datum < a.datum ? k : a), null);
  const rest = restKm !== undefined ? restKm : kmZiel !== null && kmInfo ? kmZiel - kmInfo.km : undefined;
  const restTage = erster ? diffDays(heute, erster.datum) : null;
  let status;
  if (!erster && rest === undefined) status = 'unbekannt';
  else if ((erster && restTage < 0) || (rest !== undefined && rest < 0)) status = 'ueberfaellig';
  else if ((erster && restTage <= BALD_TAGE) || (rest !== undefined && rest <= BALD_KM)) status = 'bald';
  else status = 'ok';
  const r = { datum: erster?.datum ?? null };
  if (kmZiel !== null) r.km = kmZiel;
  r.quelle = erster?.quelle ?? quelleOhneDatum;
  r.status = status;
  r.restTage = restTage;
  if (rest !== undefined) r.restKm = rest;
  return r;
}

/**
 * Termin der Regel `regel` für das Auto `auto` am Tag `heute` → { datum, km?, quelle: 'zeit'|'km'|'fix', status, restTage, restKm?, … }
 * oder null (die Regel hat keinen Termin, z. B. „Leasing-Ende“ ohne Datum im Auto). `arbeiten` = alle Arbeiten des Autos (arbeitenVon),
 * `kmInfo` = kmSchaetzung(…) oder null, `saetze` = Reifensätze des Autos (für Reifenwechsel und Rotation).
 * datum null = nur km bekannt, aber keine Geschwindigkeit (dann restKm) – oder status 'unbekannt'. Zusatzfelder je Art:
 * Vignette `vignetteJahr`; fester Monat `fixMonat`; saisonaler Reifenwechsel `saison` ('winter'|'sommer' = was montiert werden soll);
 * Rotation `satz` (Kennung des montierten Satzes).
 */
export function faelligkeit(regel, arbeiten, auto, kmInfo, heute, { saetze = [] } = {}) {
  heutePruefen(heute);
  const alle = (arbeiten ?? []).filter((a) => a && istDatum(a.datum) && (a.auto === undefined || a.auto === regel.auto));
  const passend = alle.filter((a) => gehoertZu(a, regel)).sort(frueher);
  const k = { kmInfo, heute };

  if (regel.typ === 'vignette') {
    const jahre = passend.map((a) => a.details?.jahr).filter(Number.isInteger);
    const jetzt = Number(heute.slice(0, 4));
    // ohne Eintrag: die nächste Frist (die laufende Vignette wird als vorhanden angenommen)
    const jahr = jahre.length > 0 ? Math.max(...jahre) + 1 : heute <= `${jetzt}-01-31` ? jetzt : jetzt + 1;
    return { ...ergebnis([{ datum: vignettenFrist(jahr).kaufenBis, quelle: 'fix' }], { ...k, quelleOhneDatum: 'fix' }), vignetteJahr: jahr };
  }

  if (regel.typ === 'reifenwechsel') {
    const w = letzterWechsel(alle);
    const satz = w ? saetze.find((s) => s.id === w.details.montiert) : null;
    if (w && (!satz || satz.art === 'ganzjahr')) return null;
    const naechster = (tagMonat, nach) => {
      const j = Number(nach.slice(0, 4));
      return `${j}-${tagMonat}` > nach ? `${j}-${tagMonat}` : `${j + 1}-${tagMonat}`;
    };
    let saison;
    let datum;
    if (satz) {
      saison = satz.art === 'winter' ? 'sommer' : 'winter';
      datum = naechster(saison === 'sommer' ? '04-15' : '11-01', w.datum);
    } else {
      // nicht bekannt, was montiert ist: der nächste Stichtag ab heute (1.11. Winter, 15.4. Sommer)
      const tag = addDays(heute, -1);
      const winter = naechster('11-01', tag);
      const sommer = naechster('04-15', tag);
      [saison, datum] = winter < sommer ? ['winter', winter] : ['sommer', sommer];
    }
    return { ...ergebnis([{ datum, quelle: 'fix' }], { ...k, quelleOhneDatum: 'fix' }), saison };
  }

  if (regel.typ === 'rotation') {
    const montiert = reifenStand(saetze, alle, kmInfo, { rotationKm: regel.intervallKm }).find((s) => s.montiert);
    if (!montiert) return ergebnis([], { ...k, quelleOhneDatum: 'km' });
    const restKm = regel.intervallKm - montiert.kmSeitRotation;
    const kmZiel = kmInfo ? kmInfo.km + restKm : null;
    return { ...ergebnis([{ datum: kmDatum(kmZiel, kmInfo, montiert.montiertAm), quelle: 'km' }], { ...k, kmZiel, restKm, quelleOhneDatum: 'km' }), satz: montiert.satz.id };
  }

  if (regel.autoDatum) {
    const datum = auto?.[regel.autoDatum];
    return istDatum(datum) ? ergebnis([{ datum, quelle: 'fix' }], { ...k, quelleOhneDatum: 'fix' }) : null;
  }

  if (regel.fixMonat) {
    // Der feste Monat (z. B. Pickerl laut Plakette); ein später eingetragener „nächster Monat“ gilt, wenn er später ist. Mit Intervall:
    // eine Arbeit ab 4 Monaten vor dem Monat (Begutachtungsfenster) erledigt ihn → der nächste Termin + Intervall.
    let monat = regel.fixMonat;
    for (const a of passend) if (istMonat(a.details?.naechsterMonat) && a.details.naechsterMonat > monat) monat = a.details.naechsterMonat;
    if (regel.intervallMonate) {
      for (let i = 0; i < 100 && passend.some((a) => a.datum >= `${monatPlus(monat, -4)}-01`); i += 1) monat = monatPlus(monat, regel.intervallMonate);
    }
    return { ...ergebnis([{ datum: letzterTag(monat), quelle: 'fix' }], { ...k, quelleOhneDatum: 'fix' }), fixMonat: monat };
  }

  // Intervall nach Zeit und/oder km
  const letzte = passend.at(-1) ?? null;
  let zeit = null;
  let kmZiel = null;
  let basis = auto?.ezDatum && istDatum(auto.ezDatum) ? auto.ezDatum : null;
  if (letzte) {
    basis = letzte.datum;
    if (regel.intervallMonate) zeit = plusMonate(letzte.datum, regel.intervallMonate);
    if (regel.intervallKm && Number.isInteger(letzte.km)) kmZiel = letzte.km + regel.intervallKm;
  } else if (regel.ersteFaelligkeit || Number.isInteger(regel.ersteFaelligkeitKm)) {
    if (regel.ersteFaelligkeit) zeit = istMonat(regel.ersteFaelligkeit) ? letzterTag(regel.ersteFaelligkeit) : regel.ersteFaelligkeit;
    if (Number.isInteger(regel.ersteFaelligkeitKm)) kmZiel = regel.ersteFaelligkeitKm;
  } else {
    if (regel.intervallMonate && basis) zeit = plusMonate(basis, regel.intervallMonate);
    if (regel.intervallKm) kmZiel = regel.intervallKm; // ab 0 km bei der Erstzulassung
  }
  const kandidaten = [{ datum: zeit, quelle: 'zeit' }, { datum: kmDatum(kmZiel, kmInfo, basis), quelle: 'km' }];
  return ergebnis(kandidaten, { ...k, kmZiel, quelleOhneDatum: kmZiel !== null ? 'km' : 'zeit' });
}

// ---------------------------------------------------------------- Übersicht

/** Reihenfolge der Liste „Fällig“: überfällig, bald, ok, unbekannt; dann nach Datum (ohne Datum zuletzt), dann nach Name. */
function vergleich(a, b) {
  return RANG[a.status] - RANG[b.status] || (a.datum === b.datum ? 0 : a.datum === null ? 1 : b.datum === null ? -1 : a.datum < b.datum ? -1 : 1) || (a.restKm ?? Infinity) - (b.restKm ?? Infinity) || a.regel.name.localeCompare(b.regel.name, 'de');
}

/**
 * Je Auto (Reihenfolge von daten.autos) am Tag `heute`: { auto, kmInfo, faellig, naechste, anzahlFaellig, reifen, saison, radmuttern,
 * warnung }. `historie` = alle gelesenen Verlauf-Teile (aller Autos und Jahre). faellig = [{ regel, …faelligkeit }] der AKTIVEN Regeln
 * mit Termin, sortiert (siehe vergleich); naechste = der erste Eintrag mit bekanntem Stand oder null; anzahlFaellig = bald + überfällig;
 * reifen = reifenStand; saison = saisonHinweis für den montierten Satz; warnung = Hinweis zur km-Schätzung oder null.
 */
export function autoUebersicht(daten, historie, heute) {
  heutePruefen(heute);
  return (daten?.autos ?? []).map((auto) => {
    const arbeiten = arbeitenVon(historie, auto.id);
    const kmInfo = kmSchaetzung(kmPunkte(historie, auto), heute);
    const saetze = (daten.saetze ?? []).filter((s) => s.auto === auto.id);
    const regeln = (daten.regeln ?? []).filter((r) => r.auto === auto.id && r.aktiv !== false);
    const rotation = regeln.find((r) => r.typ === 'rotation' && r.intervallKm);
    const reifen = reifenStand(saetze, arbeiten, kmInfo, { rotationKm: rotation?.intervallKm ?? ROTATION_KM });
    const faellig = regeln
      .map((regel) => {
        const f = faelligkeit(regel, arbeiten, auto, kmInfo, heute, { saetze });
        return f && { regel, ...f };
      })
      .filter(Boolean)
      .sort(vergleich);
    const montiert = reifen.find((r) => r.montiert);
    return {
      auto,
      kmInfo,
      faellig,
      naechste: faellig.find((f) => f.status !== 'unbekannt') ?? null,
      anzahlFaellig: faellig.filter((f) => f.status === 'bald' || f.status === 'ueberfaellig').length,
      reifen,
      saison: saisonHinweis(heute, montiert?.satz ?? null),
      radmuttern: radmutternHinweis(arbeiten, heute, auto),
      warnung: kmInfo?.warnung ?? null,
    };
  });
}
