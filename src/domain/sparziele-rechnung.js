// Sparziele – die Rechnung: verteilt die echte Ersparnis jedes Monats (Kontostand Papa + Mama) auf die Ziele und „Frei verfügbar“.
// Rein und deterministisch, ohne DOM und ohne Netz; GANZE CENT. Gespeichert werden nur die Ziele und die Verschiebungen aus „Frei“
// (siehe sparziele.js) – alles hier wird bei jedem Aufruf aus dem Kontostand-Verlauf neu gerechnet, eine Korrektur im Kontostand
// wirkt also sofort auf alle späteren Monate.
//
// Regeln (Spezifikation „Adaos 4“ und die Festlegungen im Plan):
// - Ersparnis eines Monats M = (Papa + Mama in M) − (Papa + Mama im letzten früheren Monat, in dem beide eingetragen haben). Fehlt
//   einer in einem Monat dazwischen, zählt der ganze Unterschied für M. Der erste Monat mit beiden ist nur Basis. Sonderbeträge
//   werden nicht herausgerechnet.
// - Gerechnet wird ab `beginn` (zieleBeginn: gespeicherter erster Startmonat, der nie nach hinten rückt; in alten Daten der
//   früheste `erstellt`); davor nichts, auch kein „Frei“. Liegt die Basis des ersten gerechneten Monats wegen einer Lücke VOR dem
//   Beginn, zählt trotzdem der ganze Unterschied (das Geld ist auf dem Konto); was die Ziele nicht brauchen, landet in „Frei“.
// - Nötig im Monat M = (Ziel − bisher gespart) / Monate von M bis zum Zielmonat (einschließlich, mindestens 1), auf ganze Cent
//   AUFGERUNDET (wer jeden Monat das Nötige spart, erreicht das Ziel); erreicht → 0.
// - Lücke: holt ein Monat k Monate nach (Basis k Monate zurück, weil einer nicht eingetragen hat), ist das Nötige k × Monatsbedarf,
//   gerechnet ab dem ersten fehlenden Monat (frühestens ab dem Startmonat des Ziels), höchstens „offen“.
// - Plus: reicht die Ersparnis nicht für alle, wird sie anteilig nach dem Nötigen verteilt (abgerundet, der Rundungsrest zum größten
//   Anteil); sonst bekommt jedes Ziel das Nötige und der Rest geht zu „Frei“.
// - Minus: zuerst aus „Frei“, dann anteilig nach dem Gesparten (kein Ziel unter 0); was dann noch fehlt, verfällt („ungedeckt“).
// - Abschluss: im Monat nach dem Zielmonat automatisch („ausgegeben“), oder vorher von Hand (`beendet`); ab diesem Monat bekommt das
//   Ziel nichts mehr. „frei“ = das Gesparte geht zu „Frei“. „ausgegeben“ = das Gesparte wurde vom Konto bezahlt: diese Zahlung steckt
//   schon im Kontostand (der Monat der Zahlung fällt kleiner aus). Damit sie nicht zweimal abgezogen wird, bekommt die Aufteilung den
//   Betrag als AUSGLEICH zurück: im ersten Monat mit Kontostand ab dem Abschluss (im Abschlussmonat selbst, wenn er schon einen hat)
//   wird gespart + ausgleich verteilt. So gilt: zurückgelegt + Frei = Ersparnis seit Beginn − ungedeckt (höchstens einen Monat versetzt,
//   solange ein Ausgleich noch auf den nächsten Kontostand wartet: `ausgleichOffen`).
// - Verschiebungen aus „Frei“ wirken nach der Aufteilung ihres Monats, höchstens bis zum verfügbaren „Frei“ (nie unter 0) und bis
//   zum noch offenen Betrag des Ziels (ein Ziel bekommt nie mehr als sein Ziel); nur zu einem in dem Monat laufenden Ziel.
// Reihenfolge in jedem Monat:
//   1. automatische Abschlüsse (und von Hand beendete aus früheren Monaten, falls noch offen)
//   2. Verschiebungen zu Zielen, die in diesem Monat VON HAND beendet werden (aus dem „Frei“ vom Monatsanfang – erst auffüllen, dann bezahlen)
//   3. Abschlüsse von Hand dieses Monats (diese Ziele sind nicht mehr in der Aufteilung des Monats)
//   4. Aufteilung von gespart + ausgleich
//   5. die übrigen Verschiebungen.

import { isValidDate } from './dates.js';
import { kontoVerlauf, monatVor, normalisiereKonto } from './konto.js';

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const TEXT_HEUTE = 'Ungültiges Datum (heute): erwartet wird das Wiener Datum als Text „JJJJ-MM-TT“.';

/** Wirft sofort, wenn `heute` kein Datum 'JJJJ-MM-TT' ist (z. B. undefined oder ein Date-Objekt) – sonst liefe die Rechnung endlos. */
export function heutePruefen(heute) {
  if (typeof heute !== 'string' || !isValidDate(heute)) throw new Error(TEXT_HEUTE);
  return heute.slice(0, 7);
}

/** 'JJJJ-MM' → fortlaufende Monatsnummer (für Abstände in Monaten). */
const monatsNr = (jm) => Number(jm.slice(0, 4)) * 12 + Number(jm.slice(5, 7)) - 1;
const naechsterMonat = (jm) => monatVor(jm, -1);
const summe = (liste) => liste.reduce((a, b) => a + b, 0);
const spaeter = (a, b) => (a > b ? a : b);
const frueher = (a, b) => (a === null ? b : b === null ? a : a < b ? a : b);

/**
 * Ab welchem Monat gerechnet wird: das gespeicherte `beginn` (rückt nie nach hinten, auch nicht, wenn das älteste Ziel gelöscht
 * wird) und – falls ein Ziel noch früher beginnt oder `beginn` in alten Daten fehlt – der früheste `erstellt`; ohne beides null.
 */
export function zieleBeginn(daten) {
  const b = typeof daten?.beginn === 'string' && MONAT.test(daten.beginn) ? daten.beginn : null;
  return (daten?.z ?? []).reduce((a, z) => frueher(a, z.erstellt), b);
}

/** Der Zielmonat 'JJJJ-MM' (das Datum ist 'JJJJ-MM-TT' oder 'JJJJ-MM'). */
export const zielMonat = (ziel) => ziel.datum.slice(0, 7);

/**
 * Ab wann ist das Ziel abgeschlossen? → { monat, art, automatisch }: der Monat nach dem Zielmonat („ausgegeben“, automatisch), oder –
 * falls früher oder im selben Monat – der von Hand gesetzte Abschluss `beendet`.
 */
export function zielSchluss(ziel) {
  const auto = naechsterMonat(zielMonat(ziel));
  if (ziel.beendet && ziel.beendet.monat <= auto) return { monat: ziel.beendet.monat, art: ziel.beendet.art, automatisch: false };
  return { monat: auto, art: 'ausgegeben', automatisch: true };
}

/** Monate, in denen beide eingetragen haben, aufsteigend: [{ monat, stand }] (stand = Papa + Mama). */
function beideMonate(konto) {
  return kontoVerlauf(normalisiereKonto(konto))
    .filter((z) => z.zusammen)
    .map((z) => ({ monat: z.monat, stand: z.zusammen.stand }))
    .reverse();
}

/**
 * Ersparnis je Monat, aufsteigend: [{ monat, basis, gespart }] – nur Monate, in denen beide eingetragen haben, ohne den ersten (Basis).
 * basis = der Monat, gegen den gerechnet wird (fehlt einer dazwischen, liegt er weiter zurück).
 */
export function sparMonate(konto) {
  const monate = beideMonate(konto);
  return monate.slice(1).map((m, i) => ({ monat: m.monat, basis: monate[i].monat, gespart: m.stand - monate[i].stand }));
}

/**
 * Startmonat eines neuen Ziels am Tag `heute`: der laufende Monat – außer der Kontostand dieses Monats ist schon komplett (beide
 * eingetragen), dann der nächste („neu – ab nächstem Monat dabei“).
 */
export function startMonat(heute, konto) {
  const monat = heutePruefen(heute);
  const k = normalisiereKonto(konto);
  return k.p.papa[monat] !== undefined && k.p.mama[monat] !== undefined ? naechsterMonat(monat) : monat;
}

/** Nötig im Monat `monat` bei `gespart`: (Ziel − gespart) / verbleibende Monate (mindestens 1), aufgerundet; erreicht → 0. */
function noetigIn(ziel, gespart, monat) {
  const offen = ziel.zielCents - gespart;
  if (offen <= 0) return 0;
  return Math.ceil(offen / Math.max(1, monatsNr(zielMonat(ziel)) - monatsNr(monat) + 1));
}

/**
 * Nötig in einem Monat, der eine Lücke nachholt: k × Monatsbedarf ab dem ersten fehlenden Monat `ab` (frühestens ab dem Startmonat
 * des Ziels), höchstens offen. Ohne Lücke (ab = monat) gleich noetigIn.
 */
function noetigMitLuecke(ziel, gespart, ab, monat) {
  const von = spaeter(ab, ziel.erstellt);
  const k = monatsNr(monat) - monatsNr(von) + 1;
  return Math.min(Math.max(0, ziel.zielCents - gespart), k * noetigIn(ziel, gespart, von));
}

/**
 * Verteilt `betrag` (≥ 0, höchstens Σ gewichte) anteilig nach `gewichte` (ganze Cent ≥ 0): jeder bekommt abgerundet seinen Anteil, der
 * Rundungsrest geht an den größten Anteil. Kein Anteil wird größer als sein Gewicht (dann geht der Rest weiter an den nächstgrößten) –
 * so bekommt kein Ziel mehr als nötig und keines verliert mehr, als es hat. Exakt auch bei großen Beträgen (BigInt).
 */
function verteile(betrag, gewichte) {
  const gesamt = summe(gewichte);
  if (betrag <= 0 || gesamt <= 0) return gewichte.map(() => 0);
  const teile = gewichte.map((w) => Number((BigInt(betrag) * BigInt(w)) / BigInt(gesamt)));
  let rest = betrag - summe(teile);
  const reihenfolge = teile.map((_, i) => i).sort((a, b) => teile[b] - teile[a] || gewichte[b] - gewichte[a] || a - b);
  for (const i of reihenfolge) {
    if (rest === 0) break;
    const dazu = Math.min(rest, gewichte[i] - teile[i]);
    teile[i] += dazu;
    rest -= dazu;
  }
  return teile;
}

/** Teilt die Ersparnis eines Monats auf: → { anteile (je aktives Ziel, mit Vorzeichen), noetig, freiCents, ungedeckt }. */
function teileAuf(gespart, aktiv, stand, frei, monat, ab) {
  const noetig = aktiv.map((z) => noetigMitLuecke(z, stand.get(z.id), ab, monat));
  if (gespart >= 0) {
    const anteile = summe(noetig) >= gespart ? verteile(gespart, noetig) : noetig.slice();
    return { anteile, noetig, freiCents: gespart - summe(anteile), ungedeckt: 0, anteilig: gespart > 0 && summe(noetig) > gespart };
  }
  const verlust = -gespart;
  const ausFrei = Math.min(frei, verlust);
  const rest = verlust - ausFrei;
  const bestand = aktiv.map((z) => stand.get(z.id));
  const vorhanden = summe(bestand);
  const weg = rest >= vorhanden ? bestand : verteile(rest, bestand);
  return { anteile: weg.map((c) => 0 - c), noetig, freiCents: 0 - ausFrei, ungedeckt: Math.max(0, rest - vorhanden), anteilig: false };
}

/**
 * Der ganze Verlauf am Tag `heute` (Wiener Datum). `daten` = { z: Ziele, m: Verschiebungen } (siehe sparziele.js), `konto` = Kontostand.
 * → {
 *   monate: neueste zuerst; jeder Monat mit Ersparnis ab `beginn` (zieleBeginn), dazu Monate ohne (vollständigen) Kontostand, in denen
 *     etwas abgeschlossen oder verschoben wurde:
 *     { monat, basis, luecke (Zahl der nachgeholten Monate ohne Kontostand von beiden, sonst 0),
 *       gespart (null = noch kein Kontostand von beiden), art: 'plus'|'minus'|'leer' (0 oder kein Kontostand),
 *       zuteilung: [{ ziel, cents (mit Vorzeichen), noetig }] (alle in dem Monat laufenden Ziele), anteilig (Plus-Monat mit weniger
 *       als nötig: anteilig nach Bedarf verteilt), ungedeckt (verfallenes Minus, ≥ 0),
 *       frei: { cents (Veränderung durch die Aufteilung), vorher (Monatsanfang), nachher (Monatsende) },
 *       abschluss: [{ ziel, art, cents }], verschoben: [{ id, ziel, cents (tatsächlich), gewuenscht }],
 *       ausgleich (≥ 0: Beträge von „ausgegeben“-Abschlüssen, die in diesem Monat mit verteilt wurden), ausgleichVon: [{ ziel, cents }] }
 *     Es gilt: Σ zuteilung.cents + frei.cents = gespart + ausgleich + ungedeckt, und
 *              frei.nachher = frei.vorher + Σ abschluss(art 'frei').cents + frei.cents − Σ verschoben.cents.
 *   ziele: in der Reihenfolge von `daten.z`, jedes { ...ziel, gespart, offen, ab, monateRest, noetigProMonat, plan: { soll, rueckstand },
 *     status: 'imPlan'|'hinter'|'erreicht'|'neu', faellig, abgeschlossen: null | { monat, art, automatisch } } – bei abgeschlossenen
 *     ist gespart der Betrag beim Abschluss; faellig = der Zielmonat ist schon gerechnet, das Ziel schließt im nächsten Monat
 *     (monateRest und noetigProMonat dann 0);
 *   frei, summeZiele (Σ gespart der laufenden Ziele), noetigGesamt (Σ noetigProMonat der laufenden), standMonat (letzter Monat mit
 *   beiden Kontoständen, oder null), ausgleichOffen (Ausgleich, der noch auf den nächsten Kontostand wartet)
 * }
 * Gesamt gilt: frei + summeZiele = Σ gespart + Σ ungedeckt − ausgleichOffen.
 * Nach vorn gerechnet wird ab dem Monat `ab` = nach dem letzten Kontostand (frühestens ab dem Startmonat; abgeschlossen: null): monateRest bis zum Zielmonat
 * (mindestens 1), noetigProMonat = offen / monateRest (aufgerundet). Plan: soll = Ziel × vergangene Monate / alle Monate (abgerundet;
 * vergangen = Startmonat bis letzter Kontostand), rueckstand = soll − gespart (≥ 0). Status: erreicht → neu (noch kein Monat
 * gerechnet) → hinter (rueckstand > 0) → imPlan. Das Flag `aus` (im Verlauf ausgeblendet) ändert an der Rechnung nichts.
 * Ein ungültiges `heute` (kein Text 'JJJJ-MM-TT') wirft sofort.
 */
export function sparVerlauf(daten, konto, heute) {
  const heuteMonat = heutePruefen(heute);
  const ziele = daten?.z ?? [];
  const verschiebungen = daten?.m ?? [];
  const beide = beideMonate(konto);
  const standMonat = beide.at(-1)?.monat ?? null;
  const beginn = zieleBeginn(daten);
  if (beginn === null) return { monate: [], ziele: [], frei: 0, summeZiele: 0, noetigGesamt: 0, standMonat, ausgleichOffen: 0 };

  const sparListe = sparMonate(konto);
  const letzterKonto = sparListe.at(-1)?.monat ?? beginn;
  const ende = spaeter(spaeter(beginn, heuteMonat), letzterKonto);
  const ersparnis = new Map(sparListe.map((s) => [s.monat, s]));
  const schluss = new Map(ziele.map((z) => [z.id, zielSchluss(z)]));
  const stand = new Map(ziele.map((z) => [z.id, 0]));
  const geschlossen = new Map(); // id → { monat, art, automatisch, cents }
  const monate = [];
  let frei = 0;

  let ausgleich = 0; // Beträge von „ausgegeben“-Abschlüssen, die noch nicht verteilt sind
  let ausgleichVon = [];
  const schliessen = (z, sch, abschluss) => {
    const cents = stand.get(z.id);
    geschlossen.set(z.id, { ...sch, cents });
    if (sch.art === 'frei') frei += cents;
    else if (cents > 0) {
      ausgleich += cents;
      ausgleichVon.push({ ziel: z.id, cents });
    }
    abschluss.push({ ziel: z.id, art: sch.art, cents });
  };
  const verschiebe = (v, laufend, ergebnis) => {
    const ziel = laufend.find((z) => z.id === v.ziel);
    const cents = ziel ? Math.max(0, Math.min(v.cents, frei, ziel.zielCents - stand.get(ziel.id))) : 0;
    if (cents > 0) {
      frei -= cents;
      stand.set(v.ziel, stand.get(v.ziel) + cents);
    }
    ergebnis.set(v, { id: v.id, ziel: v.ziel, cents, gewuenscht: v.cents });
  };

  for (let monat = beginn; monat <= ende && MONAT.test(monat); monat = naechsterMonat(monat)) {
    const vorher = frei;
    const abschluss = [];
    const vonHand = (z) => !geschlossen.has(z.id) && !schluss.get(z.id).automatisch && schluss.get(z.id).monat === monat;
    // 1. automatische Abschlüsse (und von Hand beendete früherer Monate)
    for (const z of ziele) {
      const sch = schluss.get(z.id);
      if (!geschlossen.has(z.id) && sch.monat <= monat && !vonHand(z)) schliessen(z, sch, abschluss);
    }
    // 2. Verschiebungen zu Zielen, die in diesem Monat von Hand beendet werden; 3. diese Abschlüsse
    const endenJetzt = ziele.filter((z) => z.erstellt <= monat && vonHand(z));
    const imMonat = verschiebungen.filter((v) => v.monat === monat);
    const ergebnis = new Map();
    for (const v of imMonat) if (endenJetzt.some((z) => z.id === v.ziel)) verschiebe(v, endenJetzt, ergebnis);
    for (const z of ziele) if (vonHand(z)) schliessen(z, schluss.get(z.id), abschluss);
    // 4. Aufteilung von gespart + ausgleich
    const aktiv = ziele.filter((z) => z.erstellt <= monat && !geschlossen.has(z.id));
    const eintrag = ersparnis.get(monat);
    let zuteilung = [];
    let freiCents = 0;
    let ungedeckt = 0;
    let anteilig = false;
    let ausgleichHier = 0;
    let ausgleichHierVon = [];
    const ab = eintrag ? spaeter(naechsterMonat(eintrag.basis), beginn) : monat;
    if (eintrag) {
      ausgleichHier = ausgleich;
      ausgleichHierVon = ausgleichVon;
      ausgleich = 0;
      ausgleichVon = [];
      const t = teileAuf(eintrag.gespart + ausgleichHier, aktiv, stand, frei, monat, ab);
      aktiv.forEach((z, i) => stand.set(z.id, stand.get(z.id) + t.anteile[i]));
      zuteilung = aktiv.map((z, i) => ({ ziel: z.id, cents: t.anteile[i], noetig: t.noetig[i] }));
      freiCents = t.freiCents;
      ungedeckt = t.ungedeckt;
      anteilig = t.anteilig;
      frei += freiCents;
    }
    // 5. übrige Verschiebungen
    for (const v of imMonat) if (!ergebnis.has(v)) verschiebe(v, aktiv, ergebnis);
    const verschoben = imMonat.map((v) => ergebnis.get(v));
    if (!eintrag && abschluss.length === 0 && verschoben.length === 0) continue;
    const gespart = eintrag ? eintrag.gespart : null;
    monate.push({
      monat,
      basis: eintrag ? eintrag.basis : null,
      luecke: monatsNr(monat) - monatsNr(ab),
      gespart,
      art: gespart > 0 ? 'plus' : gespart < 0 ? 'minus' : 'leer',
      zuteilung,
      anteilig,
      ungedeckt,
      ausgleich: ausgleichHier,
      ausgleichVon: ausgleichHierVon,
      frei: { cents: freiCents, vorher, nachher: frei },
      abschluss,
      verschoben,
    });
  }

  const gerechnetBis = sparListe.length > 0 && letzterKonto >= beginn ? letzterKonto : null;
  const zieleAus = ziele.map((z) => zielStand(z, geschlossen.get(z.id), stand.get(z.id), gerechnetBis));
  const laufend = zieleAus.filter((z) => !z.abgeschlossen);
  return {
    monate: monate.reverse(),
    ziele: zieleAus,
    frei,
    summeZiele: summe(laufend.map((z) => z.gespart)),
    noetigGesamt: summe(laufend.map((z) => z.noetigProMonat)),
    standMonat,
    ausgleichOffen: ausgleich,
  };
}

/** Ein Ziel mit seinem Stand (siehe sparVerlauf); `gerechnetBis` = letzter gerechneter Monat mit Kontostand oder null. */
function zielStand(ziel, zu, gespartJetzt, gerechnetBis) {
  if (zu) {
    const offen = Math.max(0, ziel.zielCents - zu.cents);
    return {
      ...ziel,
      gespart: zu.cents,
      offen,
      ab: null,
      monateRest: 0,
      noetigProMonat: 0,
      plan: { soll: ziel.zielCents, rueckstand: offen },
      status: offen === 0 ? 'erreicht' : 'hinter',
      faellig: false,
      abgeschlossen: { monat: zu.monat, art: zu.art, automatisch: zu.automatisch },
    };
  }
  const offen = Math.max(0, ziel.zielCents - gespartJetzt);
  const gerechnet = gerechnetBis !== null && gerechnetBis >= ziel.erstellt;
  const ab = gerechnet ? naechsterMonat(gerechnetBis) : ziel.erstellt;
  const faellig = gerechnet && gerechnetBis >= zielMonat(ziel); // Zielmonat schon gerechnet: schließt im nächsten Monat
  const monateRest = faellig ? 0 : Math.max(1, monatsNr(zielMonat(ziel)) - monatsNr(ab) + 1);
  const alle = Math.max(1, monatsNr(zielMonat(ziel)) - monatsNr(ziel.erstellt) + 1);
  const vergangen = gerechnet ? Math.min(alle, monatsNr(gerechnetBis) - monatsNr(ziel.erstellt) + 1) : 0;
  const soll = Math.floor((ziel.zielCents * vergangen) / alle);
  const rueckstand = Math.max(0, soll - gespartJetzt);
  return {
    ...ziel,
    gespart: gespartJetzt,
    offen,
    ab,
    monateRest,
    noetigProMonat: offen === 0 || faellig ? 0 : Math.ceil(offen / monateRest),
    plan: { soll, rueckstand },
    status: offen === 0 ? 'erreicht' : !gerechnet ? 'neu' : rueckstand > 0 ? 'hinter' : 'imPlan',
    faellig,
    abgeschlossen: null,
  };
}
