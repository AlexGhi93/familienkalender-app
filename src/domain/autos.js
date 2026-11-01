// Autos: Fahrzeuge (Daten aus dem Zulassungsschein), Wartungsregeln („Fälligkeiten“), Reifensätze und – je Auto und Jahr – die
// erledigten Arbeiten und Kilometerstände. Rein, ohne DOM und ohne Netz. Kilometer sind ganze Zahlen ≥ 0, Kosten GANZE CENT, Daten
// 'JJJJ-MM-TT' (Wiener Datum). Die Rechnungen (km-Schätzung, Termine, Reifen-km, Vignette, Saison) stehen in autos-rechnung.js.
//
// Im Speicher (lesbare Namen):
//   Auto        { id, name, farbeKennung, kennzeichen?, fin?, marke?, handelsbezeichnung?, typVariante?, motorcode?, antrieb?, leistungKw?,
//                 hubraum?, ezDatum?, zulassungDatum?, reifenGroessen?, haltung?, leasingEnde?, notiz?, vorlage?, neuGekauft }
//                 Alles aus dem Zulassungsschein ist freiwillig; Pflicht sind nur Name und Farbe. vorlage = AUTO_VORLAGEN[].id.
//                 neuGekauft = seit der Erstzulassung in der Familie: dann zählt die EZ als 0-km-Punkt und Regeln ohne Erledigung
//                 laufen ab der EZ; sonst (Gebrauchtwagen) sind sie „unbekannt – Letzte Erledigung eintragen“ (Spec §10).
//   Regel       { id, auto, typ, name, intervallMonate?, intervallKm?, ersteFaelligkeit?, ersteFaelligkeitKm?, fixMonat?, autoDatum?,
//                 vorlage?, aktiv }   typ = ARBEIT_TYPEN[].id; ersteFaelligkeit 'JJJJ-MM-TT' oder 'JJJJ-MM'; fixMonat 'JJJJ-MM';
//                 autoDatum 'leasingEnde' = der Termin steht im Auto; vorlage = Schlüssel der Vorlagen-Regel (Quelle und Info stehen
//                 nur in AUTO_VORLAGEN, siehe regelVorlage – so kostet eine Regel im Kalender kaum Platz).
//   Reifensatz  { id, auto, name, art, groesse?, startKm?, startGeschaetzt? }   art = REIFEN_ARTEN[].id (fehlt sie: aus dem Namen)
//   Arbeit      { id, auto, typ, datum, km?, kmGeschaetzt?, notiz?, kosten?, regel?, details }   details je Typ (ARBEIT_TYPEN[].details);
//                 regel = die Regel, für die sie erledigt wurde (sonst zählt sie für jede Regel desselben Typs, außer „sonstiges“).
//   Kilometerstand { datum, km, quelle: 'eingabe' | 'arbeit' }   gespeichert wird höchstens EIN eingegebener Stand je Tag; Arbeiten mit
//                 km werden NICHT doppelt gespeichert, sondern beim Rechnen dazugenommen (kmPunkte in autos-rechnung.js).
//
// Im Kalender zwei Arten versteckter Ereignisse (Task 2: calendar/mapping.js), je ein JSON ≤ 6000 Zeichen mit KURZEN Schlüsseln:
//  1) Hauptteil „fkautos“: { v: 1, a: [Auto], r: [Regel], s: [Reifensatz], j: { <autoId>: erstesJahr } }
//     (im Speicher { v: 1, autos, regeln, saetze, ab, fremd?: { a, r, s } }; j/ab = je Auto das ERSTE Jahr mit einem Verlauf-Teil –
//     gelesen werden alle Jahre von dort bis heute, ein fehlender Teil zählt leer. M3 (Abschluss-Review): so wächst der Hauptteil nicht
//     mit den Jahren. Eine Liste von Jahren (frühe 1.3.0-Testfassung) wird nachsichtig gelesen: das kleinste Jahr gilt.)
//     Auto:       i=id n=name f=farbeKennung k=kennzeichen g=fin m=marke h=handelsbezeichnung t=typVariante c=motorcode a=antrieb
//                 l=leistungKw u=hubraum e=ezDatum z=zulassungDatum r=reifenGroessen w=haltung b=leasingEnde o=notiz v=vorlage
//                 p=1 (neuGekauft)
//     Regel:      i=id a=auto y=typ n=name m=intervallMonate k=intervallKm e=ersteFaelligkeit x=ersteFaelligkeitKm f=fixMonat
//                 d=autoDatum v=vorlage o=1 (nur wenn NICHT aktiv)
//     Reifensatz: i=id a=auto n=name w=art g=groesse s=startKm e=1 (startGeschaetzt)
//  2) Verlauf je Auto und Jahr „fkah<autoId><JJJJ>“: { v: 1, a: autoId, j: Jahr, w: [Arbeit], k: [Kilometerstand] }
//     (im Speicher { v: 1, auto, jahr, arbeiten, km, fremd?: { w, k } }; jede Arbeit und jeder Stand liegt im Teil seines Jahres)
//     Arbeit:     i=id y=typ d=datum k=km g=1 (kmGeschaetzt) n=notiz c=kosten r=regel x=details (Schlüssel je Typ: ARBEIT_TYPEN[].details[].kurz)
//     Stand:      d=datum k=km q='a' (nur bei quelle 'arbeit')
// Wie bei Fixkosten/Sparziele: Einträge, die diese Version nicht versteht (unbekanntes Feld oder unbekannter Typ – neuere Version –, oder
// beschädigt), bleiben roh in `fremd` und werden unverändert mitgeschrieben; unlesbarer Text (kein JSON, andere Version `v`, falscher
// Aufbau) ergibt `unlesbar: true` und darf NIE überschrieben werden. Neue Felder auf oberster Ebene → `v` erhöhen.
// Jede Änderung ist eine reine Funktion Daten → Daten (das Argument bleibt unverändert, zweimal angewendet = einmal angewendet), die
// nach HTTP 412 auf die NEUESTE Fassung angewendet wird. Zwei Telefone, die im selben Jahr Arbeiten eintragen, behalten beide.

import { addDays, diffDays, heutePruefen, isValidDate } from './dates.js';

export const MAX_AUTOS = 4; // mit vollen Vorlagen (≈ 1.500 Zeichen je Auto) passen etwa 4 in die 6000 Zeichen
export const MAX_REGELN = 80; // insgesamt (die Vorlagen bringen 9–10 je Auto)
export const MAX_SAETZE = 16; // Reifensätze insgesamt
export const MAX_AUTOS_ZEICHEN = 6000; // wie Kontostand/Fixkosten/Sparziele: Google kürzt Beschreibungen still bei 8192 Zeichen
export const MAX_HISTORIE_ZEICHEN = 6000;
export const MAX_AUTO_NAME = 30;
export const MAX_REGEL_NAME = 40;
export const MAX_SATZ_NAME = 20;
export const MAX_AUTO_NOTIZ = 120;
export const MAX_ARBEIT_NOTIZ = 120;
export const MAX_KM = 2_000_000;
export const MAX_SATZ_START_KM = 500_000;
export const MAX_KOSTEN_CENTS = 9_999_999; // 99.999,99 €
export const MAX_KM_PRO_TAG = 1000; // mehr gegenüber dem vorigen Stand ist ein Tippfehler: Warnung, der Punkt zählt nicht
export const KM_FENSTER_TAGE = 90; // Durchschnitt aus den letzten 90 Tagen (mit ≥ 2 Punkten), sonst aus allen
export const BALD_TAGE = 30; // „bald“: höchstens 30 Tage …
export const BALD_KM = 1000; // … oder höchstens 1.000 km bis zum Termin
export const ROTATION_KM = 10_000; // Tesla: Reifen alle 10.000 km rotieren (Owner's Manual, siehe Vorlage)

/** Friert ein Objekt samt allem darin ein (Vorlagen und Typen sind fest). */
function tiefFrieren(x) {
  if (x !== null && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.values(x).forEach(tiefFrieren);
    Object.freeze(x);
  }
  return x;
}

export const AUTO_FARBEN = tiefFrieren([
  { id: 'blau', name: 'Blau' },
  { id: 'rot', name: 'Rot' },
  { id: 'gruen', name: 'Grün' },
  { id: 'grau', name: 'Grau' },
  { id: 'schwarz', name: 'Schwarz' },
  { id: 'weiss', name: 'Weiß' },
  { id: 'gelb', name: 'Gelb' },
  { id: 'lila', name: 'Lila' },
]);
export const AUTO_ANTRIEBE = Object.freeze(['Elektro', 'Benzin', 'Diesel', 'Hybrid', 'Plug-in-Hybrid', 'Erdgas']);
export const AUTO_HALTUNGEN = Object.freeze(['Eigentum', 'Leasing', 'Finanzierung', 'Firmenauto']);
export const REIFEN_ARTEN = tiefFrieren([
  { id: 'sommer', name: 'Sommerreifen' },
  { id: 'winter', name: 'Winterreifen' },
  { id: 'ganzjahr', name: 'Ganzjahresreifen' },
]);
export const VIGNETTE_ARTEN = Object.freeze(['digital', 'Klebe']);
/** Felder des Autos, aus denen eine Regel ihren Termin nimmt (autoDatum). */
export const REGEL_AUTO_DATEN = Object.freeze(['leasingEnde']);

/**
 * Die Arten von Arbeiten. details = die Felder je Art fürs Formular und den Speicher: feld (Name im Speicher), kurz (Schlüssel im
 * Kalender), art ('text' | 'liter' | 'janein' | 'satz' | 'jahr' | 'wahl' | 'datum' | 'monat'), name (Beschriftung), pflicht, fehlt
 * (Meldung, wenn ein Pflichtfeld fehlt), max (Zeichen bei 'text'), werte (bei 'wahl'). Ja/Nein-Felder sind im Speicher immer da.
 */
export const ARBEIT_TYPEN = tiefFrieren([
  {
    id: 'oelwechsel', emoji: '🛢️', name: 'Ölwechsel',
    details: [
      { feld: 'oelSorte', kurz: 's', art: 'text', max: 40, name: 'Ölsorte' },
      { feld: 'menge', kurz: 'm', art: 'liter', name: 'Menge (Liter)' },
      { feld: 'filter', kurz: 'f', art: 'janein', name: 'Ölfilter gewechselt' },
    ],
  },
  {
    id: 'reifenwechsel', emoji: '🛞', name: 'Reifenwechsel',
    details: [
      { feld: 'montiert', kurz: 's', art: 'satz', pflicht: true, fehlt: 'Bitte wählen, welcher Reifensatz montiert wurde.', name: 'Montierter Reifensatz' },
      { feld: 'rotiert', kurz: 'r', art: 'janein', name: 'Vorne/hinten getauscht' },
    ],
  },
  { id: 'rotation', emoji: '🔄', name: 'Reifen rotiert', details: [{ feld: 'satzId', kurz: 's', art: 'satz', name: 'Reifensatz' }] },
  {
    id: 'vignette', emoji: '🎫', name: 'Vignette',
    details: [
      { feld: 'jahr', kurz: 'j', art: 'jahr', pflicht: true, fehlt: 'Bitte das Jahr der Vignette angeben.', name: 'Jahr' },
      { feld: 'art', kurz: 'a', art: 'wahl', werte: VIGNETTE_ARTEN, name: 'Art' },
      { feld: 'gekauftAm', kurz: 'g', art: 'datum', name: 'Gekauft am' },
      { feld: 'gueltigBis', kurz: 'b', art: 'datum', name: 'Gültig bis' },
    ],
  },
  { id: 'pickerl', emoji: '🔍', name: 'Pickerl (§ 57a)', details: [{ feld: 'naechsterMonat', kurz: 'm', art: 'monat', name: 'Nächstes Pickerl (Monat)' }] },
  { id: 'bremsfluessigkeit', emoji: '💧', name: 'Bremsflüssigkeit', details: [] },
  { id: 'zuendkerzen', emoji: '⚡', name: 'Zündkerzen', details: [] },
  { id: 'luftfilter', emoji: '🌬️', name: 'Luftfilter', details: [] },
  { id: 'innenraumfilter', emoji: '🍃', name: 'Innenraumfilter', details: [] },
  { id: 'bremssattel', emoji: '🛠️', name: 'Bremssättel reinigen und schmieren', details: [] },
  { id: 'wischer', emoji: '🌧️', name: 'Wischerblätter', details: [] },
  { id: 'keilriemen', emoji: '⚙️', name: 'Keilrippenriemen', details: [] },
  { id: 'dualogic', emoji: '🕹️', name: 'Dualogic-Hydrauliköl', details: [] },
  { id: 'sonstiges', emoji: '🔧', name: 'Sonstiges', details: [] },
]);

// ---------------------------------------------------------------- Vorlagen
// Quellen: .superpowers/recherche-auto-regeln.md (Stand 01.11.2026) und – Zündkerzen – .superpowers/recherche-fiat-500-teile.md § 3.
// Herstellerangaben bzw. Gesetz, keine verpflichtende Werkstattvorgabe; alles ist in der App änderbar und abschaltbar.
const Q = Object.freeze({
  // Tesla Owner's Manual Model 3 (de_de), Wartungsintervalle: Bremsflüssigkeit 4 J. prüfen, Innenraumfilter 2 J., Wischer jährlich,
  // Bremssättel jährlich/20.000 km bei Streusalz, Reifen rotieren alle 10.000 km oder ≥ 1,5 mm Profilunterschied.
  teslaWartung: 'https://www.tesla.com/ownersmanual/model3/de_de/GUID-E95DAAD9-646E-4249-9930-B109ED7B1D91.html',
  // Tesla Räder/Reifen: Radmuttern 175 Nm.
  teslaRaeder: 'https://www.tesla.com/ownersmanual/model3/de_de/GUID-FDDB10EF-FFA9-46EB-B8CC-03614AE92B6B.html',
  // Fiat 500 Owner Handbook 09.17 (eLUM 603.91.269): Wartungsplan S. 147–150, Füllmengen/Schmierstoffe S. 180–183.
  fiatHandbuch: 'https://aftersales.fiat.com/eLumData/EN/00/150_500/00_150_500_603.91.269_EN_04_09.17_L_LG/00_150_500_603.91.269_EN_04_09.17_L_LG.pdf',
  // ASFINAG Jahresvignette: 14 Monate (1.12. Vorjahr – 31.1. Folgejahr), online gekauft ab dem 18. Tag gültig.
  vignette: 'https://shop.asfinag.at/en/products/digital-vignette/annual-vignette/',
  // oesterreich.gv.at Winterreifenpflicht: § 102 Abs. 8a KFG, 1.11.–15.4. bei winterlichen Verhältnissen, Winterreifen mind. 4 mm.
  winterreifen: 'https://www.oesterreich.gv.at/de/themen/mobilitaet/kfz/10/2/Seite.063100',
  // ÖAMTC zur neuen § 57a-Regelung (42. KFG-Novelle, BGBl. I Nr. 79/2026) mit Pickerlrechner.
  pickerl: 'https://www.oeamtc.at/thema/pickerl/neue-57a-pickerl-regelung-in-oesterreich-jetzt-intervall-fristen-berechnen-89430229',
});

/**
 * Vorlagen für „＋ Auto hinzufügen“: nur allgemeine Modelldaten (kein Kennzeichen, keine FIN – die trägt man selbst ein), Reifensätze
 * und Regeln. Jede Regel hat `vorlage` (Schlüssel), `quelle` (Link) und oft `info` (Hinweis für die Anzeige); beides wird NICHT
 * gespeichert, sondern über regelVorlage nachgeschlagen. radmutternNm: Drehmoment für den Hinweis nach dem Reifenwechsel.
 */
export const AUTO_VORLAGEN = tiefFrieren([
  {
    id: 'tesla3',
    name: 'Tesla Model 3',
    auto: { name: 'Tesla Model 3', farbeKennung: 'grau', marke: 'Tesla', handelsbezeichnung: 'Model 3', antrieb: 'Elektro', reifenGroessen: '235/45 R18', neuGekauft: true },
    saetze: [{ name: 'Sommer', art: 'sommer' }, { name: 'Winter', art: 'winter' }],
    radmutternNm: 175, // Tesla Owner's Manual, Q.teslaRaeder
    regeln: [
      { vorlage: 'vignette', typ: 'vignette', name: 'Vignette', quelle: Q.vignette, info: 'Gilt vom 1.12. des Vorjahres bis 31.1. des Folgejahres; je Kennzeichen eine.' },
      { vorlage: 'reifen', typ: 'reifenwechsel', name: 'Reifenwechsel (saisonal)', quelle: Q.winterreifen, info: 'Winterausrüstung 1.11.–15.4. bei winterlichen Verhältnissen; Winterreifen mind. 4 mm, Sommerreifen mind. 1,6 mm Profil.' },
      { vorlage: 'rotation', typ: 'rotation', name: 'Reifen rotieren', intervallKm: 10_000, quelle: Q.teslaWartung, info: 'Alle 10.000 km je Satz oder bei ≥ 1,5 mm Profilunterschied – was zuerst eintritt.' },
      { vorlage: 'bremssattel', typ: 'bremssattel', name: 'Bremssättel reinigen und schmieren', intervallMonate: 12, intervallKm: 20_000, quelle: Q.teslaWartung, info: 'Jährlich oder alle 20.000 km, wenn im Winter Streusalz liegt.' },
      { vorlage: 'innenraumfilter', typ: 'innenraumfilter', name: 'Innenraumfilter', intervallMonate: 24, quelle: Q.teslaWartung },
      { vorlage: 'bremsfluessigkeit', typ: 'bremsfluessigkeit', name: 'Bremsflüssigkeit prüfen', intervallMonate: 48, quelle: Q.teslaWartung, info: 'Zustand alle 4 Jahre prüfen, bei Bedarf wechseln.' },
      { vorlage: 'wischer', typ: 'wischer', name: 'Wischerblätter', intervallMonate: 12, quelle: Q.teslaWartung },
      // Vorschlag nach der eigenen Berechnung in der Recherche (EZ 07/2025, alte Lochung 3 Jahre → 07/2028; danach 2 Jahre nach
      // 4-2-2-2-1). Den Monat bestätigt der Halter an der gelochten Plakette (mit Austauschplakette wäre es 07/2029).
      // Ab dem 10. Jahr nach der EZ gilt jährlich – dann das Intervall auf 12 Monate stellen (steht im Info-Text).
      { vorlage: 'pickerl', typ: 'pickerl', name: 'Pickerl (§ 57a)', fixMonat: '2028-07', intervallMonate: 24, quelle: Q.pickerl, info: 'Monat laut gelochter Plakette prüfen. Ab 19.05.2027 bis 4 Monate vorher möglich, keine Nachfrist mehr. Mit Austauschplakette (ab 19.05.2027) erst 4 Jahre nach der Erstzulassung; ab dem 10. Jahr jährlich.' },
      // Leasing-Ende: Termin aus dem Auto (leasingEnde); keine Recherche-Quelle, er steht im Leasingvertrag.
      { vorlage: 'leasing', typ: 'sonstiges', name: 'Leasing-Ende', autoDatum: 'leasingEnde', quelle: null, info: 'Laut Leasingvertrag.' },
    ],
  },
  {
    id: 'fiat500',
    name: 'Fiat 500 TwinAir',
    auto: { name: 'Fiat 500', farbeKennung: 'rot', marke: 'Fiat', handelsbezeichnung: '500', typVariante: '0.9 TwinAir 85 PS Dualogic', motorcode: '312A2000', antrieb: 'Benzin', leistungKw: 63, reifenGroessen: '195/45 R16', neuGekauft: false },
    saetze: [{ name: 'Sommer', art: 'sommer' }, { name: 'Winter', art: 'winter' }],
    radmutternNm: null, // im Fiat-Handbuch nicht recherchiert
    regeln: [
      // Fiat-Handbuch S. 150, 182: empfohlen alle 15.000 km / 1 Jahr (Pflicht jährlich bei Stadtbetrieb oder < 10.000 km/Jahr).
      { vorlage: 'oel', typ: 'oelwechsel', name: 'Ölwechsel', intervallMonate: 12, intervallKm: 15_000, quelle: Q.fiatHandbuch, info: 'SAE 0W-30, ACEA C2, Fiat 9.55535-GS1 (Selenia Digitek P.E.), 3,2 l mit Filter.' },
      { vorlage: 'bremsfluessigkeit', typ: 'bremsfluessigkeit', name: 'Bremsflüssigkeit', intervallMonate: 24, quelle: Q.fiatHandbuch, info: 'Alle 2 Jahre, unabhängig von km; DOT 4 (Tutela TOP 4).' },
      // Intervall: Wartungsplan „30.000 km / 2 Jahre“ (strikt einhalten). Teil: OE NGK ILKR9G8 = Fiat 46344791 (Teile-Recherche § 3, z. B.
      // https://www.fiatworkshop.co.uk/parts/500_Spark_Plug.shtml) – sie korrigiert die ältere Angabe LKR9EI-8 aus dem Handbuch.
      { vorlage: 'zuendkerzen', typ: 'zuendkerzen', name: 'Zündkerzen', intervallMonate: 24, intervallKm: 30_000, quelle: Q.fiatHandbuch, info: 'OE: NGK ILKR9G8 = Fiat 46344791 (2 Stück); Abstand nicht nachbiegen.' },
      { vorlage: 'luftfilter', typ: 'luftfilter', name: 'Luftfilter', intervallMonate: 24, intervallKm: 30_000, quelle: Q.fiatHandbuch, info: 'In staubiger Gegend alle 15.000 km.' },
      { vorlage: 'innenraumfilter', typ: 'innenraumfilter', name: 'Innenraumfilter', intervallMonate: 12, quelle: Q.fiatHandbuch, info: 'Empfohlen jährlich, spätestens alle 2 Jahre.' },
      // Fußnote 5: in kalten Klimazonen höchstens 60.000 km / 4 Jahre (sonst 120.000 km / 6 Jahre).
      { vorlage: 'keilriemen', typ: 'keilriemen', name: 'Keilrippenriemen prüfen', intervallMonate: 48, intervallKm: 60_000, quelle: Q.fiatHandbuch, info: 'Kaltes Klima: spätestens alle 4 Jahre / 60.000 km ersetzen.' },
      // Fußnote 2: in Ländern mit strengem (kaltem) Klima jedes Jahr.
      { vorlage: 'dualogic', typ: 'dualogic', name: 'Dualogic-Öl prüfen', intervallMonate: 12, quelle: Q.fiatHandbuch, info: 'Ölstand der Elektrohydraulik prüfen; Tutela CS Speed.' },
      { vorlage: 'vignette', typ: 'vignette', name: 'Vignette', quelle: Q.vignette, info: 'Gilt vom 1.12. des Vorjahres bis 31.1. des Folgejahres; je Kennzeichen eine.' },
      { vorlage: 'reifen', typ: 'reifenwechsel', name: 'Reifenwechsel (saisonal)', quelle: Q.winterreifen, info: 'Winterausrüstung 1.11.–15.4. bei winterlichen Verhältnissen; Winterreifen mind. 4 mm, Sommerreifen mind. 1,6 mm Profil.' },
      // Vorschlag nach der eigenen Berechnung in der Recherche (EZ 07/2017: Begutachtungen 2020, 2022, dann jährlich → 07/2027,
      // Übergang mit alter Toleranz −1/+4); danach jährlich. Den Monat bestätigt der Halter an der gelochten Plakette.
      { vorlage: 'pickerl', typ: 'pickerl', name: 'Pickerl (§ 57a)', fixMonat: '2027-07', intervallMonate: 12, quelle: Q.pickerl, info: 'Monat laut gelochter Plakette prüfen. Für Juli 2027 gilt noch die Übergangsregel (bis 30.11.2027 möglich); ab 2028 keine Nachfrist mehr nach dem Monat.' },
    ],
  },
]);

// ---------------------------------------------------------------- Meldungen

export const TEXT_AUTOS_VOLL = 'Im Kalender ist kein Platz mehr für weitere Autos, Regeln oder Reifensätze. Bitte Notizen kürzen oder Nicht-Gebrauchtes löschen.';
export const TEXT_HISTORIE_VOLL = 'Im Verlauf dieses Jahres ist kein Platz mehr – bitte Notizen kürzen oder alte Kilometerstände bzw. doppelte Arbeiten löschen (Kilometerstand → „Alle Stände“, Verlauf → Eintrag).';
export const TEXT_AUTOS_GESPERRT = 'Die Autos sind unlesbar (beschädigt oder von einer neueren App-Version). Damit nichts verloren geht, lassen sie sich hier nicht ändern – bitte die App auf beiden Telefonen aktualisieren.';
export const TEXT_HISTORIE_GESPERRT = 'Dieser Teil des Verlaufs ist unlesbar (beschädigt oder von einer neueren App-Version). Damit nichts verloren geht, lässt er sich hier nicht ändern – bitte die App auf beiden Telefonen aktualisieren.';
export const TEXT_AUTO_WEG = 'Dieses Auto gibt es nicht mehr.';
const TEXT_KENNUNG_NEUER = 'Diese Kennung gehört einem Eintrag einer neueren App-Version – bitte die App aktualisieren.';
const TEXT_ZUKUNFT = 'Das Datum liegt in der Zukunft – eingetragen wird, was schon erledigt ist.';
const TEXT_KM = 'Bitte einen Kilometerstand von 0 bis 2.000.000 km eingeben (ganze Kilometer).';

/** Fehler „Autos gesperrt“ (Name 'AutosGesperrt'): ein Adapter wirft ihn, statt unlesbare Autos zu überschreiben. */
export const autosGesperrtFehler = () => Object.assign(new Error(TEXT_AUTOS_GESPERRT), { name: 'AutosGesperrt' });
/** Fehler „Verlauf gesperrt“ (Name 'HistorieGesperrt'): ein Adapter wirft ihn, statt einen unlesbaren Verlauf-Teil zu überschreiben. */
export const historieGesperrtFehler = () => Object.assign(new Error(TEXT_HISTORIE_GESPERRT), { name: 'HistorieGesperrt' });

// ---------------------------------------------------------------- Hilfen

const KENNUNG = /^[0-9a-v]{4,16}$/;
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const VORLAGE_SCHLUESSEL = /^[a-z0-9-]{1,30}$/;
const FIN = /^[A-HJ-NPR-Z0-9]{17}$/;
const ID_ZEICHEN = '0123456789abcdefghijklmnopqrstuv';
const ID_LAENGE = 8;
const MIN_JAHR = 2000;
const MAX_JAHR = 2100;
const TYPEN = new Map(ARBEIT_TYPEN.map((t) => [t.id, t]));
const FARBEN = AUTO_FARBEN.map((f) => f.id);
const REIFEN_ART_IDS = REIFEN_ARTEN.map((r) => r.id);
const pad2 = (n) => String(n).padStart(2, '0');

/** Bereinigter Text; was kein Text ist, ergibt '' – nie ein Fehler. */
const sauber = (text) => (typeof text === 'string' ? text.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
const zeichen = (text) => [...text].length;
const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const istKennung = (x) => typeof x === 'string' && KENNUNG.test(x);
const istMonat = (x) => typeof x === 'string' && MONAT.test(x);
const istDatum = (x) => typeof x === 'string' && isValidDate(x);
const leer = (x) => x === undefined || x === null || x === '';
/** 12 oder '12' → 12; sonst NaN (Formularfelder liefern Text). */
const ganzzahl = (x) => (typeof x === 'number' ? x : typeof x === 'string' && /^\d+$/.test(x.trim()) ? Number(x.trim()) : NaN);
const istGanz = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
const istJahr = (j) => istGanz(j, MIN_JAHR, MAX_JAHR);

/** 21693 → '21.693 km'. */
export const kmText = (km) => `${String(km).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} km`;
/** '2026-10-29' → '29.10.2026'. */
export const datumText = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/** Neue Kennung aus 0-9 und a-v (8 Zeichen) für Autos, Regeln, Reifensätze und Arbeiten. `zufall` wie Math.random (für Tests). */
export function neueAutoId(zufall = Math.random) {
  let id = '';
  for (let i = 0; i < ID_LAENGE; i += 1) id += ID_ZEICHEN[Math.floor(zufall() * ID_ZEICHEN.length) % ID_ZEICHEN.length];
  return id;
}
export const neueRegelId = neueAutoId;
export const neueSatzId = neueAutoId;
export const neueArbeitId = neueAutoId;

/** Die Art eines Reifensatzes aus dem Namen („Winter…“, „Sommer…“), sonst Ganzjahr (dann gibt es keinen Saison-Hinweis). */
const artAusName = (name) => (/winter/i.test(name) ? 'winter' : /sommer/i.test(name) ? 'sommer' : 'ganzjahr');

// ---------------------------------------------------------------- Felder (prüfen, bereinigen, kurz ↔ lang)

/**
 * Felder des Autos in fester Reihenfolge: feld, kurz (Schlüssel im Kalender), art, name (Beschriftung fürs Formular „Fahrzeugdaten“).
 * Arten: 'text' (max Zeichen), 'kennzeichen', 'fin', 'wahl' (werte), 'ganz' (min…max), 'datum', 'vorlage'.
 */
export const AUTO_FELDER = tiefFrieren([
  { feld: 'name', kurz: 'n', art: 'text', max: MAX_AUTO_NAME, name: 'Name', pflicht: true },
  { feld: 'farbeKennung', kurz: 'f', art: 'wahl', werte: FARBEN, name: 'Farbe', pflicht: true },
  { feld: 'kennzeichen', kurz: 'k', art: 'kennzeichen', max: 15, name: 'Kennzeichen' },
  { feld: 'fin', kurz: 'g', art: 'fin', name: 'FIN (Fahrgestellnummer)' },
  { feld: 'marke', kurz: 'm', art: 'text', max: 30, name: 'Marke' },
  { feld: 'handelsbezeichnung', kurz: 'h', art: 'text', max: 40, name: 'Handelsbezeichnung' },
  { feld: 'typVariante', kurz: 't', art: 'text', max: 40, name: 'Typ/Variante/Version' },
  { feld: 'motorcode', kurz: 'c', art: 'text', max: 20, name: 'Motorcode' },
  { feld: 'antrieb', kurz: 'a', art: 'wahl', werte: AUTO_ANTRIEBE, name: 'Antrieb' },
  { feld: 'leistungKw', kurz: 'l', art: 'ganz', min: 1, max: 2000, name: 'Leistung (kW)' },
  { feld: 'hubraum', kurz: 'u', art: 'ganz', min: 1, max: 10000, name: 'Hubraum (cm³)' },
  { feld: 'ezDatum', kurz: 'e', art: 'datum', name: 'Erstzulassung' },
  { feld: 'zulassungDatum', kurz: 'z', art: 'datum', name: 'Zulassung' },
  { feld: 'reifenGroessen', kurz: 'r', art: 'text', max: 40, name: 'Reifengrößen' },
  { feld: 'haltung', kurz: 'w', art: 'wahl', werte: AUTO_HALTUNGEN, name: 'Haltung' },
  { feld: 'leasingEnde', kurz: 'b', art: 'datum', name: 'Leasing-Ende' },
  { feld: 'notiz', kurz: 'o', art: 'text', max: MAX_AUTO_NOTIZ, name: 'Notiz' },
  { feld: 'vorlage', kurz: 'v', art: 'vorlage', name: 'Vorlage' },
  { feld: 'neuGekauft', kurz: 'p', art: 'janein', name: 'Neu gekauft (seit der Erstzulassung bei uns)' },
]);

/** Ein Feld bereinigen: → { wert } (undefined = leer/fehlt) oder { fehler }. */
function feldWert(def, roh) {
  if (def.art === 'janein') return { wert: roh === true };
  if (leer(roh) || (typeof roh === 'string' && sauber(roh) === '')) {
    if (def.pflicht) return { fehler: def.fehlt ?? `Bitte „${def.name}“ angeben.` };
    return { wert: undefined };
  }
  switch (def.art) {
    case 'text': {
      const t = sauber(roh);
      if (typeof roh !== 'string') return { fehler: `Ungültige Angabe bei „${def.name}“.` };
      if (zeichen(t) > def.max) return { fehler: `„${def.name}“ darf höchstens ${def.max} Zeichen haben.` };
      return { wert: t };
    }
    case 'kennzeichen': {
      const t = sauber(roh).toUpperCase();
      if (typeof roh !== 'string' || zeichen(t) > def.max) return { fehler: `Das Kennzeichen darf höchstens ${def.max} Zeichen haben.` };
      return { wert: t };
    }
    case 'fin': {
      const t = typeof roh === 'string' ? roh.replace(/\s+/g, '').toUpperCase() : '';
      if (!FIN.test(t)) return { fehler: 'Die FIN hat 17 Zeichen: Ziffern und Buchstaben ohne I, O und Q.' };
      return { wert: t };
    }
    case 'wahl':
      return def.werte.includes(roh) ? { wert: roh } : { fehler: `Bitte bei „${def.name}“ einen Wert aus der Liste wählen.` };
    case 'ganz': {
      const n = ganzzahl(roh);
      return istGanz(n, def.min, def.max) ? { wert: n } : { fehler: `Bitte bei „${def.name}“ eine ganze Zahl von ${def.min} bis ${def.max} eingeben.` };
    }
    case 'datum':
      return istDatum(roh) ? { wert: roh } : { fehler: `Bitte bei „${def.name}“ ein gültiges Datum eingeben.` };
    case 'monat':
      return istMonat(roh) ? { wert: roh } : { fehler: `Ungültige Angabe bei „${def.name}“.` };
    case 'vorlage':
      return typeof roh === 'string' && VORLAGE_SCHLUESSEL.test(roh) ? { wert: roh } : { fehler: 'Ungültige Vorlage.' };
    case 'satz':
      return istKennung(roh) ? { wert: roh } : { fehler: `Ungültige Angabe bei „${def.name}“.` };
    case 'jahr': {
      const n = ganzzahl(roh);
      return istJahr(n) ? { wert: n } : { fehler: `Ungültige Angabe bei „${def.name}“.` };
    }
    case 'liter': {
      const n = typeof roh === 'number' ? roh : typeof roh === 'string' && /^\d{1,2}([.,]\d{1,2})?$/.test(roh.trim()) ? Number(roh.trim().replace(',', '.')) : NaN;
      return Number.isFinite(n) && n > 0 && n <= 20 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-9 ? { wert: n } : { fehler: 'Bitte die Menge in Litern eingeben, z. B. 3,2.' };
    }
    default:
      return { fehler: `Ungültige Angabe bei „${def.name}“.` };
  }
}

/** Felder nach `defs` bereinigen → { obj } (leere fallen weg, Ja/Nein immer da) oder { fehler } (die erste Meldung). */
function felderLesen(defs, roh) {
  const obj = {};
  for (const def of defs) {
    const r = feldWert(def, roh?.[def.feld]);
    if (r.fehler) return { fehler: r.fehler };
    if (r.wert !== undefined) obj[def.feld] = r.wert;
  }
  return { obj };
}

/** lang → kurz nach `defs` (Ja/Nein nur als 1, wenn wahr). */
function kurzNach(defs, obj) {
  const k = {};
  for (const def of defs) {
    const w = obj[def.feld];
    if (def.art === 'janein') {
      if (w === true) k[def.kurz] = 1;
    } else if (w !== undefined) k[def.kurz] = w;
  }
  return k;
}

/** kurz → lang nach `defs`; null, wenn ein unbekannter Schlüssel dabei ist oder ein Ja/Nein nicht 1 ist (→ fremd). */
function langNach(defs, k) {
  if (!istObjekt(k)) return null;
  const nachKurz = new Map(defs.map((d) => [d.kurz, d]));
  const obj = {};
  for (const [s, w] of Object.entries(k)) {
    const def = nachKurz.get(s);
    if (!def || (def.art === 'janein' && w !== 1)) return null;
    obj[def.feld] = def.art === 'janein' ? true : w;
  }
  return obj;
}

// ---------------------------------------------------------------- Auto

/** Prüft ein Auto (Formular oder gelesen) → erste Fehlermeldung (deutsch) oder null. Die Kennung darf fehlen; ist sie da, muss sie gültig sein. */
export function autoPruefen(entwurf) {
  const e = istObjekt(entwurf) ? entwurf : {};
  if (sauber(e.name) === '') return 'Bitte einen Namen eingeben.';
  if (zeichen(sauber(e.name)) > MAX_AUTO_NAME) return `Der Name darf höchstens ${MAX_AUTO_NAME} Zeichen haben.`;
  if (!FARBEN.includes(e.farbeKennung)) return 'Bitte eine Farbe wählen.';
  const r = felderLesen(AUTO_FELDER, e);
  if (r.fehler) return r.fehler;
  if (r.obj.ezDatum && r.obj.zulassungDatum && r.obj.zulassungDatum < r.obj.ezDatum) return 'Die Zulassung kann nicht vor der Erstzulassung liegen.';
  if (e.id !== undefined && !istKennung(e.id)) return 'Ungültige Kennung.';
  return null;
}

/** Ein gültiges Auto mit Kennung → bereinigt in fester Feldreihenfolge (leere Felder fallen weg); sonst null. */
export function normalisiereAuto(roh) {
  if (autoPruefen(roh) !== null || !istKennung(roh.id)) return null;
  return { id: roh.id, ...felderLesen(AUTO_FELDER, roh).obj };
}

const kurzAuto = (a) => ({ i: a.id, ...kurzNach(AUTO_FELDER, a) });
function langAuto(k) {
  if (!istObjekt(k)) return null;
  const { i, ...rest } = k;
  const obj = langNach(AUTO_FELDER, rest);
  return obj ? normalisiereAuto({ id: i, ...obj }) : null;
}

// ---------------------------------------------------------------- Regel

const REGEL_FELDER = tiefFrieren([
  { feld: 'auto', kurz: 'a' },
  { feld: 'typ', kurz: 'y' },
  { feld: 'name', kurz: 'n' },
  { feld: 'intervallMonate', kurz: 'm' },
  { feld: 'intervallKm', kurz: 'k' },
  { feld: 'ersteFaelligkeit', kurz: 'e' },
  { feld: 'ersteFaelligkeitKm', kurz: 'x' },
  { feld: 'fixMonat', kurz: 'f' },
  { feld: 'autoDatum', kurz: 'd' },
  { feld: 'vorlage', kurz: 'v' },
]);
const REGEL_SCHLUESSEL = new Set(['i', 'o', ...REGEL_FELDER.map((f) => f.kurz)]);

/** Typen mit festem Kalender-Termin ohne Intervall: Vignette (31.1.) und saisonaler Reifenwechsel (1.11. / 15.4.). */
const OHNE_INTERVALL = new Set(['vignette', 'reifenwechsel']);

/** Prüft eine Regel → erste Fehlermeldung oder null. */
export function regelPruefen(entwurf) {
  const e = istObjekt(entwurf) ? entwurf : {};
  if (!istKennung(e.auto)) return 'Ungültiges Auto.';
  if (!TYPEN.has(e.typ)) return 'Bitte eine Art wählen.';
  const name = sauber(e.name);
  if (name === '') return 'Bitte einen Namen eingeben.';
  if (zeichen(name) > MAX_REGEL_NAME) return `Der Name darf höchstens ${MAX_REGEL_NAME} Zeichen haben.`;
  const m = ganzzahl(e.intervallMonate);
  const km = ganzzahl(e.intervallKm);
  const ersteKm = ganzzahl(e.ersteFaelligkeitKm);
  if (!leer(e.intervallMonate) && !istGanz(m, 1, 240)) return 'Bitte ein Intervall von 1 bis 240 Monaten eingeben.';
  if (!leer(e.intervallKm) && !istGanz(km, 100, 1_000_000)) return 'Bitte ein Intervall von 100 bis 1.000.000 km eingeben.';
  if (!leer(e.ersteFaelligkeit) && !istDatum(e.ersteFaelligkeit) && !istMonat(e.ersteFaelligkeit)) return 'Bitte bei „Erstmals fällig“ ein gültiges Datum eingeben.';
  if (!leer(e.ersteFaelligkeitKm) && !istGanz(ersteKm, 0, MAX_KM)) return TEXT_KM;
  if (!leer(e.fixMonat) && !istMonat(e.fixMonat)) return 'Bitte einen gültigen Monat eingeben.';
  if (!leer(e.autoDatum) && !REGEL_AUTO_DATEN.includes(e.autoDatum)) return 'Ungültige Angabe beim Termin aus dem Auto.';
  if (!leer(e.vorlage) && !(typeof e.vorlage === 'string' && VORLAGE_SCHLUESSEL.test(e.vorlage))) return 'Ungültige Vorlage.';
  if (e.aktiv !== undefined && typeof e.aktiv !== 'boolean') return 'Ungültige Angabe bei „aktiv“.';
  if (e.typ === 'rotation' && leer(e.intervallKm)) return 'Bitte angeben, nach wie vielen Kilometern rotiert wird.';
  const termin = [e.intervallMonate, e.intervallKm, e.ersteFaelligkeit, e.ersteFaelligkeitKm, e.fixMonat, e.autoDatum].some((x) => !leer(x));
  if (!termin && !OHNE_INTERVALL.has(e.typ)) return 'Bitte ein Intervall (Monate oder Kilometer) oder einen festen Monat angeben.';
  if (e.id !== undefined && !istKennung(e.id)) return 'Ungültige Kennung.';
  return null;
}

/** Eine gültige Regel mit Kennung → bereinigt (aktiv fehlt → true); sonst null. Zusatzfelder (quelle, info) fallen weg. */
export function normalisiereRegel(roh) {
  if (regelPruefen(roh) !== null || !istKennung(roh.id)) return null;
  const r = { id: roh.id, auto: roh.auto, typ: roh.typ, name: sauber(roh.name) };
  if (!leer(roh.intervallMonate)) r.intervallMonate = ganzzahl(roh.intervallMonate);
  if (!leer(roh.intervallKm)) r.intervallKm = ganzzahl(roh.intervallKm);
  if (!leer(roh.ersteFaelligkeit)) r.ersteFaelligkeit = roh.ersteFaelligkeit;
  if (!leer(roh.ersteFaelligkeitKm)) r.ersteFaelligkeitKm = ganzzahl(roh.ersteFaelligkeitKm);
  if (!leer(roh.fixMonat)) r.fixMonat = roh.fixMonat;
  if (!leer(roh.autoDatum)) r.autoDatum = roh.autoDatum;
  if (!leer(roh.vorlage)) r.vorlage = roh.vorlage;
  r.aktiv = roh.aktiv !== false;
  return r;
}

function kurzRegel(r) {
  const k = { i: r.id };
  for (const f of REGEL_FELDER) if (r[f.feld] !== undefined) k[f.kurz] = r[f.feld];
  if (!r.aktiv) k.o = 1;
  return k;
}
function langRegel(k) {
  if (!istObjekt(k) || Object.keys(k).some((s) => !REGEL_SCHLUESSEL.has(s)) || ('o' in k && k.o !== 1)) return null;
  const r = { id: k.i, aktiv: k.o !== 1 };
  for (const f of REGEL_FELDER) if (k[f.kurz] !== undefined) r[f.feld] = k[f.kurz];
  // kurz gespeicherte Zahlen müssen schon Zahlen sein (Text „12“ käme nur von einer fremden Version)
  if (['intervallMonate', 'intervallKm', 'ersteFaelligkeitKm'].some((f) => r[f] !== undefined && typeof r[f] !== 'number')) return null;
  return normalisiereRegel(r);
}

/** Die Vorlagen-Regel zu einer Regel (für quelle und info) oder null. */
export function regelVorlage(auto, regel) {
  const v = AUTO_VORLAGEN.find((x) => x.id === auto?.vorlage);
  return v?.regeln.find((r) => r.vorlage === regel?.vorlage) ?? null;
}

// ---------------------------------------------------------------- Reifensatz

const SATZ_FELDER = tiefFrieren([
  { feld: 'groesse', kurz: 'g', art: 'text', max: 30, name: 'Reifengröße' },
  { feld: 'startKm', kurz: 's', art: 'ganz', min: 0, max: MAX_SATZ_START_KM, name: 'Kilometer vorher' },
  { feld: 'startGeschaetzt', kurz: 'e', art: 'janein', name: 'geschätzt' },
]);
const SATZ_SCHLUESSEL = new Set(['i', 'a', 'n', 'w', ...SATZ_FELDER.map((f) => f.kurz)]);

/** Prüft einen Reifensatz → erste Fehlermeldung oder null. */
export function satzPruefen(entwurf) {
  const e = istObjekt(entwurf) ? entwurf : {};
  if (!istKennung(e.auto)) return 'Ungültiges Auto.';
  const name = sauber(e.name);
  if (name === '') return 'Bitte einen Namen für den Reifensatz eingeben.';
  if (zeichen(name) > MAX_SATZ_NAME) return `Der Name darf höchstens ${MAX_SATZ_NAME} Zeichen haben.`;
  if (!leer(e.art) && !REIFEN_ART_IDS.includes(e.art)) return 'Bitte Sommer-, Winter- oder Ganzjahresreifen wählen.';
  const r = felderLesen(SATZ_FELDER, e);
  if (r.fehler) return r.fehler;
  if (e.id !== undefined && !istKennung(e.id)) return 'Ungültige Kennung.';
  return null;
}

/** Ein gültiger Reifensatz → bereinigt (art fehlt → aus dem Namen, startGeschaetzt immer da); sonst null. */
export function normalisiereSatz(roh) {
  if (satzPruefen(roh) !== null || !istKennung(roh.id)) return null;
  const name = sauber(roh.name);
  const { startGeschaetzt, ...rest } = felderLesen(SATZ_FELDER, roh).obj;
  return { id: roh.id, auto: roh.auto, name, art: leer(roh.art) ? artAusName(name) : roh.art, ...rest, startGeschaetzt };
}

const kurzSatz = (s) => ({ i: s.id, a: s.auto, n: s.name, w: s.art, ...kurzNach(SATZ_FELDER, s) });
function langSatz(k) {
  if (!istObjekt(k) || Object.keys(k).some((s) => !SATZ_SCHLUESSEL.has(s))) return null;
  const { i, a, n, w, ...rest } = k;
  const obj = langNach(SATZ_FELDER, rest);
  return obj ? normalisiereSatz({ id: i, auto: a, name: n, art: w, ...obj }) : null;
}

// ---------------------------------------------------------------- Arbeit und Kilometerstand

const ARBEIT_SCHLUESSEL = new Set(['i', 'y', 'd', 'k', 'g', 'n', 'c', 'r', 'x']);
const PUNKT_SCHLUESSEL = new Set(['d', 'k', 'q']);

/**
 * Warnung zu einem Kilometerstand `km` am Tag `datum` gegen die bekannten Punkte (ohne die der Arbeit `ohneArbeit` und – bei einer
 * Eingabe – ohne den Stand desselben Tages): niedriger als ein früherer, höher als ein späterer, oder ein riesiger Sprung. Nie ein Fehler.
 */
function kmWarnung(punkte, datum, km, { ohneArbeit, ohneEingabeAm } = {}) {
  const liste = (punkte ?? []).filter((p) => p && Number.isInteger(p.km) && istDatum(p.datum) && !(ohneArbeit && p.arbeit === ohneArbeit) && !(ohneEingabeAm && p.quelle === 'eingabe' && p.datum === ohneEingabeAm));
  const frueher = liste.filter((p) => p.datum <= datum);
  const hoechster = frueher.reduce((a, p) => (a === null || p.km > a.km ? p : a), null);
  if (hoechster && km < hoechster.km) return `Der Kilometerstand ist niedriger als ein früherer (${kmText(hoechster.km)} am ${datumText(hoechster.datum)}). Bitte prüfen – gespeichert wird er trotzdem.`;
  const spaeter = liste.filter((p) => p.datum > datum).reduce((a, p) => (a === null || p.km < a.km ? p : a), null);
  if (spaeter && km > spaeter.km) return `Der Kilometerstand ist höher als ein späterer (${kmText(spaeter.km)} am ${datumText(spaeter.datum)}). Bitte prüfen – gespeichert wird er trotzdem.`;
  const letzter = frueher.reduce((a, p) => (a === null || p.datum > a.datum || (p.datum === a.datum && p.km > a.km) ? p : a), null);
  if (letzter) {
    const tage = Math.max(1, diffDays(letzter.datum, datum));
    if ((km - letzter.km) / tage > MAX_KM_PRO_TAG) return `Der Kilometerstand ist sehr viel höher als der letzte (${kmText(letzter.km)} am ${datumText(letzter.datum)}). Bitte prüfen – gespeichert wird er trotzdem.`;
  }
  return null;
}

/** Datum gültig und höchstens 1 Tag nach `heute` (Zeitzonen) → null, sonst die Meldung. */
function datumFehler(datum, heute) {
  if (!istDatum(datum)) return 'Bitte ein gültiges Datum eingeben.';
  if (datum > addDays(heute, 1)) return TEXT_ZUKUNFT;
  return null;
}

/** Aufbau einer Arbeit ohne „heute“ → { arbeit (bereinigt, ohne id/auto-Prüfung) } oder { fehler }. */
function arbeitLesen(e) {
  const typ = TYPEN.get(e.typ);
  if (!typ) return { fehler: 'Bitte eine Art der Arbeit wählen.' };
  if (!istDatum(e.datum)) return { fehler: 'Bitte ein gültiges Datum eingeben.' };
  const km = leer(e.km) ? undefined : ganzzahl(e.km);
  if (km !== undefined && !istGanz(km, 0, MAX_KM)) return { fehler: TEXT_KM };
  if (km === undefined && e.typ === 'reifenwechsel') return { fehler: 'Bitte den Kilometerstand beim Reifenwechsel angeben – daraus werden die Kilometer je Reifensatz gerechnet.' };
  if (km === undefined && e.typ === 'rotation') return { fehler: 'Bitte den Kilometerstand beim Rotieren angeben.' };
  if (e.kmGeschaetzt !== undefined && typeof e.kmGeschaetzt !== 'boolean') return { fehler: 'Ungültige Angabe bei „geschätzt“.' };
  const notiz = sauber(e.notiz);
  if (!leer(e.notiz) && typeof e.notiz !== 'string') return { fehler: 'Ungültige Notiz.' };
  if (zeichen(notiz) > MAX_ARBEIT_NOTIZ) return { fehler: `Die Notiz darf höchstens ${MAX_ARBEIT_NOTIZ} Zeichen haben.` };
  const kosten = leer(e.kosten) ? undefined : e.kosten;
  if (kosten !== undefined && !istGanz(kosten, 0, MAX_KOSTEN_CENTS)) return { fehler: 'Bitte Kosten von 0 € bis 99.999,99 € eingeben.' };
  if (!leer(e.regel) && !istKennung(e.regel)) return { fehler: 'Ungültige Regel.' };
  if (e.details !== undefined && e.details !== null && !istObjekt(e.details)) return { fehler: 'Ungültige Angaben zur Arbeit.' };
  const d = felderLesen(typ.details, e.details ?? {});
  if (d.fehler) return { fehler: d.fehler };
  const a = { typ: e.typ, datum: e.datum };
  if (km !== undefined) a.km = km;
  if (km !== undefined && e.kmGeschaetzt === true) a.kmGeschaetzt = true;
  if (notiz !== '') a.notiz = notiz;
  if (kosten !== undefined) a.kosten = kosten;
  if (!leer(e.regel)) a.regel = e.regel;
  a.details = d.obj;
  return { arbeit: a };
}

/**
 * Prüft eine Arbeit am Tag `heute` (Pflicht) → { fehler, warnung }: fehler = erste Meldung oder null (Datum mehr als 1 Tag in der
 * Zukunft ist ein Fehler); warnung = Hinweis zum Kilometerstand gegen `punkte` (siehe kmPunkte; die eigene alte Fassung zählt nicht)
 * oder null – ein niedrigerer km als ein früherer ist KEIN Fehler, nur eine Warnung (Review Focus 1).
 */
export function arbeitPruefen(entwurf, { heute, punkte } = {}) {
  heutePruefen(heute);
  const e = istObjekt(entwurf) ? entwurf : {};
  const r = arbeitLesen(e);
  const fehler = r.fehler ?? datumFehler(e.datum, heute) ?? (e.id !== undefined && !istKennung(e.id) ? 'Ungültige Kennung.' : null) ?? (!istKennung(e.auto) ? 'Ungültiges Auto.' : null);
  if (fehler) return { fehler, warnung: null };
  const warnung = r.arbeit.km === undefined || r.arbeit.kmGeschaetzt ? null : kmWarnung(punkte, e.datum, r.arbeit.km, { ohneArbeit: e.id });
  return { fehler: null, warnung };
}

/** Prüft einen eingegebenen Kilometerstand { datum, km } am Tag `heute` → { fehler, warnung } (wie arbeitPruefen). */
export function kmPruefen(eintrag, { heute, punkte } = {}) {
  heutePruefen(heute);
  const e = istObjekt(eintrag) ? eintrag : {};
  const km = ganzzahl(e.km);
  const fehler = datumFehler(e.datum, heute) ?? (!istGanz(km, 0, MAX_KM) ? TEXT_KM : null);
  if (fehler) return { fehler, warnung: null };
  return { fehler: null, warnung: kmWarnung(punkte, e.datum, km, { ohneEingabeAm: e.datum }) };
}

/** Eine gültige Arbeit (mit id und auto) → bereinigt; sonst null. Ohne „heute“ (gelesene Daten). */
export function normalisiereArbeit(roh) {
  if (!istObjekt(roh) || !istKennung(roh.id) || !istKennung(roh.auto)) return null;
  const r = arbeitLesen(roh);
  return r.fehler ? null : { id: roh.id, auto: roh.auto, ...r.arbeit };
}

function kurzArbeit(a) {
  const k = { i: a.id, y: a.typ, d: a.datum };
  if (a.km !== undefined) k.k = a.km;
  if (a.kmGeschaetzt) k.g = 1;
  if (a.notiz) k.n = a.notiz;
  if (a.kosten !== undefined) k.c = a.kosten;
  if (a.regel) k.r = a.regel;
  k.x = kurzNach(TYPEN.get(a.typ).details, a.details);
  return k;
}
function langArbeit(k, auto) {
  if (!istObjekt(k) || Object.keys(k).some((s) => !ARBEIT_SCHLUESSEL.has(s)) || ('g' in k && k.g !== 1)) return null;
  const typ = TYPEN.get(k.y);
  if (!typ || (k.k !== undefined && typeof k.k !== 'number') || (k.c !== undefined && typeof k.c !== 'number')) return null;
  const details = k.x === undefined ? {} : langNach(typ.details, k.x);
  if (!details) return null;
  // Text-Zahlen in den Details (z. B. Menge „3,2“) kämen nur von einer fremden Version
  if (typ.details.some((d) => ['liter', 'jahr'].includes(d.art) && details[d.feld] !== undefined && typeof details[d.feld] !== 'number')) return null;
  const roh = { id: k.i, auto, typ: k.y, datum: k.d, km: k.k, notiz: k.n, kosten: k.c, regel: k.r, details };
  if (k.g === 1) roh.kmGeschaetzt = true;
  return normalisiereArbeit(roh);
}

function normalisierePunkt(roh) {
  if (!istObjekt(roh) || !istDatum(roh.datum) || !istGanz(roh.km, 0, MAX_KM)) return null;
  return { datum: roh.datum, km: roh.km, quelle: roh.quelle === 'arbeit' ? 'arbeit' : 'eingabe' };
}
const kurzPunkt = (p) => (p.quelle === 'arbeit' ? { d: p.datum, k: p.km, q: 'a' } : { d: p.datum, k: p.km });
function langPunkt(k) {
  if (!istObjekt(k) || Object.keys(k).some((s) => !PUNKT_SCHLUESSEL.has(s)) || ('q' in k && k.q !== 'a')) return null;
  return normalisierePunkt({ datum: k.d, km: k.k, quelle: k.q === 'a' ? 'arbeit' : 'eingabe' });
}

// ---------------------------------------------------------------- Hauptteil: lesen und schreiben

export const leereAutos = () => ({ v: 1, autos: [], regeln: [], saetze: [], ab: {} });

/** Fremde Einträge von `alt` nur übernehmen, wenn es welche gibt. */
function mitFremd(d, fremd) {
  if (fremd && (fremd.a?.length > 0 || fremd.r?.length > 0 || fremd.s?.length > 0)) d.fremd = { a: fremd.a ?? [], r: fremd.r ?? [], s: fremd.s ?? [] };
  return d;
}
const baueAutos = (alt, autos, regeln, saetze, ab) => mitFremd({ v: 1, autos, regeln, saetze, ab }, alt?.fremd);

/** Gültige Einträge (der erste je Kennung gilt) und die nicht verstandenen roh – auch doppelte Kennungen: sie bleiben so erhalten. */
function trenne(liste, lang) {
  const gut = [];
  const fremd = [];
  const ids = new Set();
  for (const k of liste) {
    const x = lang(k);
    if (!x || ids.has(x.id)) fremd.push(k);
    else {
      ids.add(x.id);
      gut.push(x);
    }
  }
  return { gut, fremd };
}

// erstes Jahr je Auto: eine Zahl (oder, nachsichtig, eine nicht leere Liste von Jahren – dann gilt das kleinste)
const istErstesJahr = (j) => istJahr(j) || (Array.isArray(j) && j.length > 0 && j.every(istJahr));
const erstesJahr = (j) => (Array.isArray(j) ? Math.min(...j) : j);
const istJahreIndex = (j) => istObjekt(j) && Object.entries(j).every(([id, x]) => istKennung(id) && istErstesJahr(x));

/**
 * Gelesene Daten im Speicherformat (kurze Schlüssel) → { daten, fremd }. Nicht verstandene Autos, Regeln und Reifensätze landen roh in
 * `fremd` (und in `daten.fremd`, nur wenn es welche gibt), damit sie beim Schreiben unverändert erhalten bleiben. Unbrauchbares → leer.
 */
export function normalisiereAutos(roh) {
  const leerFremd = { a: [], r: [], s: [] };
  if (!istObjekt(roh) || roh.v !== 1 || !Array.isArray(roh.a)) return { daten: leereAutos(), fremd: leerFremd };
  const a = trenne(roh.a, langAuto);
  const r = trenne(Array.isArray(roh.r) ? roh.r : [], langRegel);
  const s = trenne(Array.isArray(roh.s) ? roh.s : [], langSatz);
  const ab = {};
  if (istJahreIndex(roh.j)) for (const [id, x] of Object.entries(roh.j)) ab[id] = erstesJahr(x);
  const fremd = { a: a.fremd, r: r.fremd, s: s.fremd };
  return { daten: baueAutos({ fremd: JSON.parse(JSON.stringify(fremd)) }, a.gut, r.gut, s.gut, ab), fremd };
}

/** Die Daten als Text für das Ereignis „fkautos“ (kurze Schlüssel, fremde Einträge am Ende); zu voll → TEXT_AUTOS_VOLL. */
export function autosText(daten) {
  const autos = (daten?.autos ?? []).map(normalisiereAuto).filter(Boolean);
  const regeln = (daten?.regeln ?? []).map(normalisiereRegel).filter(Boolean);
  const saetze = (daten?.saetze ?? []).map(normalisiereSatz).filter(Boolean);
  const j = {};
  for (const [id, x] of Object.entries(daten?.ab ?? {})) if (istKennung(id) && istErstesJahr(x)) j[id] = erstesJahr(x);
  const f = daten?.fremd ?? {};
  const text = JSON.stringify({ v: 1, a: [...autos.map(kurzAuto), ...(f.a ?? [])], r: [...regeln.map(kurzRegel), ...(f.r ?? [])], s: [...saetze.map(kurzSatz), ...(f.s ?? [])], j });
  if (text.length > MAX_AUTOS_ZEICHEN) throw new Error(TEXT_AUTOS_VOLL);
  return text;
}

/**
 * Text aus dem Kalender → { daten, unlesbar }. Wirft nie. Fehlender Text → leere Daten. Unlesbar (kein JSON, andere Version, `a` keine
 * Liste, `r`/`s` da aber keine Liste, `j` da aber kein gültiger Jahres-Index) → leere Daten mit `unlesbar: true`: NIE überschreiben
 * (siehe autosGesperrtFehler). Fremde Einträge siehe normalisiereAutos.
 */
export function autosLesen(text) {
  if (typeof text !== 'string' || text.trim() === '') return { daten: leereAutos(), unlesbar: false };
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    roh = null;
  }
  const ok = istObjekt(roh) && roh.v === 1 && Array.isArray(roh.a) && (roh.r === undefined || Array.isArray(roh.r)) && (roh.s === undefined || Array.isArray(roh.s)) && (roh.j === undefined || istJahreIndex(roh.j));
  if (!ok) return { daten: leereAutos(), unlesbar: true };
  return { daten: normalisiereAutos(roh).daten, unlesbar: false };
}

const anzahl = (n, eins, mehr) => `${n} ${n === 1 ? eins : mehr}`;

/** Hinweise zum Gelesenen ({ daten, unlesbar } wie aus autosLesen) für die Anzeige; nichts → []. */
export function autosWarnungen({ daten, unlesbar } = {}) {
  if (unlesbar) return ['Die Autos sind unlesbar (beschädigt oder von einer neueren App-Version); sie werden leer gezeigt und lassen sich nicht ändern.'];
  const w = [];
  const zeile = (n, eins, mehr) => `${anzahl(n, eins, mehr)} nicht gelesen werden (beschädigt oder von einer neueren App-Version); ${n === 1 ? 'der Eintrag bleibt' : 'die Einträge bleiben'} gespeichert, ${n === 1 ? 'wird' : 'werden'} hier aber nicht gezeigt.`;
  const f = daten?.fremd ?? {};
  if (f.a?.length > 0) w.push(zeile(f.a.length, 'Auto konnte', 'Autos konnten'));
  if (f.r?.length > 0) w.push(zeile(f.r.length, 'Regel konnte', 'Regeln konnten'));
  if (f.s?.length > 0) w.push(zeile(f.s.length, 'Reifensatz konnte', 'Reifensätze konnten'));
  return w;
}

// ---------------------------------------------------------------- Verlauf je Auto und Jahr: lesen und schreiben

export const leereHistorie = (auto, jahr) => ({ v: 1, auto, jahr, arbeiten: [], km: [] });
const mitFremdH = (h, fremd) => (fremd && (fremd.w?.length > 0 || fremd.k?.length > 0) ? { ...h, fremd: { w: fremd.w ?? [], k: fremd.k ?? [] } } : h);
const baueHistorie = (alt, arbeiten, km) => mitFremdH({ v: 1, auto: alt.auto, jahr: alt.jahr, arbeiten, km }, alt.fremd);
const nachDatum = (a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0);

/** Der Verlauf-Teil als Text für „fkah<auto><JJJJ>“ (kurze Schlüssel, fremde Einträge am Ende); zu voll → TEXT_HISTORIE_VOLL. */
export function historieText(historie) {
  const h = historie ?? {};
  if (!istKennung(h.auto) || !istJahr(h.jahr)) throw new Error('Ungültiger Verlauf.');
  const arbeiten = (h.arbeiten ?? []).map(normalisiereArbeit).filter(Boolean);
  const km = (h.km ?? []).map(normalisierePunkt).filter(Boolean);
  const text = JSON.stringify({ v: 1, a: h.auto, j: h.jahr, w: [...arbeiten.map(kurzArbeit), ...(h.fremd?.w ?? [])], k: [...km.map(kurzPunkt), ...(h.fremd?.k ?? [])] });
  if (text.length > MAX_HISTORIE_ZEICHEN) throw new Error(TEXT_HISTORIE_VOLL);
  return text;
}

/**
 * Text eines Verlauf-Teils → { historie, unlesbar }. Wirft nie. `auto` und `jahr` = was der Teil sein soll (aus der Ereignis-Kennung):
 * fehlender Text → leerer Teil; kein JSON, andere Version, falscher Aufbau oder ein anderes Auto/Jahr im Text → leerer Teil mit
 * `unlesbar: true` (NIE überschreiben, siehe historieGesperrtFehler). Nicht verstandene Arbeiten/Stände → `historie.fremd` { w, k }.
 */
export function historieLesen(text, { auto, jahr } = {}) {
  const leerTeil = leereHistorie(auto, jahr);
  if (typeof text !== 'string' || text.trim() === '') return { historie: leerTeil, unlesbar: false };
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    roh = null;
  }
  const ok = istObjekt(roh) && roh.v === 1 && istKennung(roh.a) && istJahr(roh.j) && Array.isArray(roh.w) && (roh.k === undefined || Array.isArray(roh.k));
  if (!ok || (auto !== undefined && roh.a !== auto) || (jahr !== undefined && roh.j !== jahr)) return { historie: leerTeil, unlesbar: true };
  const w = trenne(roh.w, (k) => langArbeit(k, roh.a));
  const k = { gut: [], fremd: [] };
  for (const p of roh.k ?? []) {
    const x = langPunkt(p);
    if (x) k.gut.push(x);
    else k.fremd.push(p);
  }
  const fremd = JSON.parse(JSON.stringify({ w: w.fremd, k: k.fremd }));
  return { historie: baueHistorie({ auto: roh.a, jahr: roh.j, fremd }, w.gut, k.gut), unlesbar: false };
}

/** Hinweis, wenn in einem Verlauf-Teil etwas nicht verstanden wurde (bleibt gespeichert); sonst []. */
export function historieWarnungen({ historie, unlesbar } = {}) {
  if (unlesbar) return [`Der Verlauf${historie?.jahr ? ` ${historie.jahr}` : ''} ist unlesbar (beschädigt oder von einer neueren App-Version); er wird leer gezeigt und lässt sich nicht ändern.`];
  const n = (historie?.fremd?.w?.length ?? 0) + (historie?.fremd?.k?.length ?? 0);
  return n > 0 ? [`${anzahl(n, 'Eintrag', 'Einträge')} im Verlauf ${historie.jahr} ${n === 1 ? 'konnte' : 'konnten'} nicht gelesen werden; ${n === 1 ? 'er bleibt' : 'sie bleiben'} gespeichert.`] : [];
}

// ---------------------------------------------------------------- Änderungen am Hauptteil (rein, wiederholbar)

/** Neue Daten mit diesen Listen; wirft TEXT_AUTOS_VOLL, wenn sie nicht mehr in den Kalender passen. */
function mitAutos(alt, { autos = alt.autos, regeln = alt.regeln, saetze = alt.saetze, ab = alt.ab } = {}) {
  const neu = baueAutos(alt, autos, regeln, saetze, ab);
  autosText(neu);
  return neu;
}

const fremdeKennung = (liste, id) => (liste ?? []).some((k) => k?.i === id);
const autoDa = (daten, id) => (daten.autos ?? []).some((a) => a.id === id);

/** Ersetzt den Eintrag mit derselben Kennung an seiner Stelle oder hängt ihn an; gleich → null (nichts zu tun). */
function setzeIn(liste, neu) {
  const i = liste.findIndex((x) => x.id === neu.id);
  if (i < 0) return [...liste, neu];
  if (JSON.stringify(liste[i]) === JSON.stringify(neu)) return null;
  return liste.map((x, j) => (j === i ? neu : x));
}

/** Legt ein Auto an oder ändert das mit derselben Kennung (an derselben Stelle). Wirft mit der Meldung aus autoPruefen. */
export function autoSetzen(daten, auto) {
  if (!istObjekt(auto) || !istKennung(auto.id)) throw new Error('Ungültige Kennung.');
  const fehler = autoPruefen(auto);
  if (fehler) throw new Error(fehler);
  const neu = normalisiereAuto(auto);
  const liste = daten.autos ?? [];
  if (!liste.some((a) => a.id === neu.id)) {
    if (fremdeKennung(daten.fremd?.a, neu.id)) throw new Error(TEXT_KENNUNG_NEUER);
    if (liste.length + (daten.fremd?.a?.length ?? 0) >= MAX_AUTOS) throw new Error(`Höchstens ${MAX_AUTOS} Autos.`);
  }
  const autos = setzeIn(liste, neu);
  return autos ? mitAutos(daten, { autos }) : daten;
}

/** Legt eine Regel an oder ändert sie; das Auto muss es geben. */
export function regelSetzen(daten, regel) {
  if (!istObjekt(regel) || !istKennung(regel.id)) throw new Error('Ungültige Kennung.');
  const fehler = regelPruefen(regel);
  if (fehler) throw new Error(fehler);
  if (!autoDa(daten, regel.auto)) throw new Error(TEXT_AUTO_WEG);
  const neu = normalisiereRegel(regel);
  const liste = daten.regeln ?? [];
  if (!liste.some((r) => r.id === neu.id)) {
    if (fremdeKennung(daten.fremd?.r, neu.id)) throw new Error(TEXT_KENNUNG_NEUER);
    if (liste.length + (daten.fremd?.r?.length ?? 0) >= MAX_REGELN) throw new Error(`Höchstens ${MAX_REGELN} Regeln.`);
  }
  const regeln = setzeIn(liste, neu);
  return regeln ? mitAutos(daten, { regeln }) : daten;
}

/** Legt einen Reifensatz an oder ändert ihn; das Auto muss es geben. */
export function satzSetzen(daten, satz) {
  if (!istObjekt(satz) || !istKennung(satz.id)) throw new Error('Ungültige Kennung.');
  const fehler = satzPruefen(satz);
  if (fehler) throw new Error(fehler);
  if (!autoDa(daten, satz.auto)) throw new Error(TEXT_AUTO_WEG);
  const neu = normalisiereSatz(satz);
  const liste = daten.saetze ?? [];
  if (!liste.some((s) => s.id === neu.id)) {
    if (fremdeKennung(daten.fremd?.s, neu.id)) throw new Error(TEXT_KENNUNG_NEUER);
    if (liste.length + (daten.fremd?.s?.length ?? 0) >= MAX_SAETZE) throw new Error(`Höchstens ${MAX_SAETZE} Reifensätze.`);
  }
  const saetze = setzeIn(liste, neu);
  return saetze ? mitAutos(daten, { saetze }) : daten;
}

/** Löscht eine Regel; unbekannt → dieselben Daten. */
export function regelLoeschen(daten, id) {
  if (!(daten.regeln ?? []).some((r) => r.id === id)) return daten;
  return baueAutos(daten, daten.autos, daten.regeln.filter((r) => r.id !== id), daten.saetze, daten.ab);
}

/** Löscht einen Reifensatz (Arbeiten, die ihn nennen, zählen dann für keinen Satz); unbekannt → dieselben Daten. */
export function satzLoeschen(daten, id) {
  if (!(daten.saetze ?? []).some((s) => s.id === id)) return daten;
  return baueAutos(daten, daten.autos, daten.regeln, daten.saetze.filter((s) => s.id !== id), daten.ab);
}

/** Was regelLoeschen entfernt – für „Rückgängig“: { regel, stelle }; unbekannt → null. */
export function regelSpur(daten, id) {
  const stelle = (daten?.regeln ?? []).findIndex((r) => r.id === id);
  return stelle < 0 ? null : { regel: daten.regeln[stelle], stelle };
}

/** „Rückgängig“ nach regelLoeschen: dieselbe Regel an ihrer alten Stelle; das Auto muss es noch geben. Schon da → dieselben Daten. */
export function regelWiederherstellen(daten, spur) {
  const r = normalisiereRegel(spur?.regel);
  if (!r) throw new Error('Ungültige Regel.');
  const liste = daten.regeln ?? [];
  if (liste.some((x) => x.id === r.id)) return daten;
  if (!autoDa(daten, r.auto)) throw new Error(TEXT_AUTO_WEG);
  if (fremdeKennung(daten.fremd?.r, r.id)) throw new Error(TEXT_KENNUNG_NEUER);
  if (liste.length + (daten.fremd?.r?.length ?? 0) >= MAX_REGELN) throw new Error(`Höchstens ${MAX_REGELN} Regeln.`);
  return mitAutos(daten, { regeln: eingefuegt(liste, r, spur.stelle) });
}

/** Was satzLoeschen entfernt – für „Rückgängig“: { satz, stelle }; unbekannt → null. */
export function satzSpur(daten, id) {
  const stelle = (daten?.saetze ?? []).findIndex((x) => x.id === id);
  return stelle < 0 ? null : { satz: daten.saetze[stelle], stelle };
}

/** „Rückgängig“ nach satzLoeschen: derselbe Reifensatz an seiner alten Stelle; das Auto muss es noch geben. Schon da → dieselben Daten. */
export function satzWiederherstellen(daten, spur) {
  const satz = normalisiereSatz(spur?.satz);
  if (!satz) throw new Error('Ungültiger Reifensatz.');
  const liste = daten.saetze ?? [];
  if (liste.some((x) => x.id === satz.id)) return daten;
  if (!autoDa(daten, satz.auto)) throw new Error(TEXT_AUTO_WEG);
  if (fremdeKennung(daten.fremd?.s, satz.id)) throw new Error(TEXT_KENNUNG_NEUER);
  if (liste.length + (daten.fremd?.s?.length ?? 0) >= MAX_SAETZE) throw new Error(`Höchstens ${MAX_SAETZE} Reifensätze.`);
  return mitAutos(daten, { saetze: eingefuegt(liste, satz, spur.stelle) });
}

// je Art der Arbeit die Felder, die einen Reifensatz nennen (Reifenwechsel: montiert, Rotation: satzId)
const SATZ_VERWEISE = new Map(ARBEIT_TYPEN.map((t) => [t.id, t.details.filter((d) => d.art === 'satz').map((d) => d.feld)]).filter(([, f]) => f.length > 0));

/** Wie viele der `arbeiten` den Reifensatz `id` nennen (Reifenwechsel: montiert, Rotation: Reifensatz). */
export function satzVerwendet(arbeiten, id) {
  return (arbeiten ?? []).filter((a) => (SATZ_VERWEISE.get(a?.typ) ?? []).some((f) => a.details?.[f] === id)).length;
}

/** Meldung, wenn ein Reifensatz noch im Verlauf steht (dann lässt er sich nicht löschen). */
export const satzVerwendetText = (name, anzahl) =>
  `„${name}“ steht in ${anzahl === 1 ? '1 Arbeit' : `${anzahl} Arbeiten`} im Verlauf und lässt sich deshalb nicht löschen. Erst diese Arbeiten im Verlauf löschen – dann geht es.`;

/**
 * Stellt sicher, dass der Index den Verlauf-Teil von `auto` im Jahr `jahr` kennt (vor dem ersten Schreiben in dieses Jahr): ist `jahr`
 * früher als das gemerkte erste Jahr (oder gibt es keins), wird es das neue erste Jahr; sonst dieselben Daten (M3: gelesen wird ohnehin
 * jedes Jahr vom ersten bis heute).
 */
export function historieJahrEintragen(daten, auto, jahr) {
  if (!istJahr(jahr)) throw new Error('Ungültiges Jahr.');
  if (!autoDa(daten, auto)) throw new Error(TEXT_AUTO_WEG);
  const alt = daten.ab?.[auto];
  if (istJahr(alt) && alt <= jahr) return daten;
  return mitAutos(daten, { ab: { ...(daten.ab ?? {}), [auto]: jahr } });
}

/** Kennt der Index den Verlauf-Teil von `auto` im Jahr `jahr` (erstes Jahr ≤ jahr)? */
export const historieJahrBekannt = (daten, auto, jahr) => istJahr(daten?.ab?.[auto]) && daten.ab[auto] <= jahr;

/**
 * Was autoLoeschen entfernt – für „Rückgängig“: { auto, stelle, regeln: [{ regel, stelle }], saetze: [{ satz, stelle }], ab } (ab = erstes Jahr des Index oder null);
 * unbekannt → null. Die Verlauf-Teile im Kalender bleiben beim Löschen liegen (Task 2 entscheidet), daher kommen die Jahre mit zurück.
 */
export function autoSpur(daten, id) {
  const stelle = (daten?.autos ?? []).findIndex((a) => a.id === id);
  if (stelle < 0) return null;
  const mit = (liste, name) => liste.flatMap((x, i) => (x.auto === id ? [{ [name]: x, stelle: i }] : []));
  return { auto: daten.autos[stelle], stelle, regeln: mit(daten.regeln ?? [], 'regel'), saetze: mit(daten.saetze ?? [], 'satz'), ab: daten.ab?.[id] ?? null };
}

/** Löscht ein Auto samt seinen Regeln, Reifensätzen und dem Jahres-Index; unbekannt → dieselben Daten. */
export function autoLoeschen(daten, id) {
  if (!autoDa(daten, id)) return daten;
  const { [id]: _weg, ...ab } = daten.ab ?? {};
  return baueAutos(daten, daten.autos.filter((a) => a.id !== id), (daten.regeln ?? []).filter((r) => r.auto !== id), (daten.saetze ?? []).filter((s) => s.auto !== id), ab);
}

const eingefuegt = (liste, eintrag, stelle) => {
  const i = Math.min(Math.max(0, Number.isInteger(stelle) ? stelle : liste.length), liste.length);
  return [...liste.slice(0, i), eintrag, ...liste.slice(i)];
};

/** „Rückgängig“ nach autoLoeschen: alles aus `spur` an seine alten Stellen. Gibt es das Auto schon → dieselben Daten. */
export function autoWiederherstellen(daten, spur) {
  const auto = normalisiereAuto(spur?.auto);
  if (!auto) throw new Error('Ungültiges Auto.');
  if (autoDa(daten, auto.id)) return daten;
  if (fremdeKennung(daten.fremd?.a, auto.id)) throw new Error(TEXT_KENNUNG_NEUER);
  if (daten.autos.length + (daten.fremd?.a?.length ?? 0) >= MAX_AUTOS) throw new Error(`Höchstens ${MAX_AUTOS} Autos.`);
  let regeln = daten.regeln ?? [];
  for (const { regel, stelle } of spur.regeln ?? []) {
    const r = normalisiereRegel(regel);
    if (r && r.auto === auto.id && !regeln.some((x) => x.id === r.id)) regeln = eingefuegt(regeln, r, stelle);
  }
  let saetze = daten.saetze ?? [];
  for (const { satz, stelle } of spur.saetze ?? []) {
    const s = normalisiereSatz(satz);
    if (s && s.auto === auto.id && !saetze.some((x) => x.id === s.id)) saetze = eingefuegt(saetze, s, stelle);
  }
  const ab = istJahr(spur.ab) ? { ...(daten.ab ?? {}), [auto.id]: spur.ab } : daten.ab ?? {};
  return mitAutos(daten, { autos: eingefuegt(daten.autos, auto, spur.stelle), regeln, saetze, ab });
}

/**
 * Ein neues Auto aus einer Vorlage (nicht rein: vergibt Kennungen mit `zufall`) → { auto, regeln, saetze } für autoAnlegen.
 * `felder` überschreiben die Modelldaten (Name, Kennzeichen, FIN, EZ …). Wirft bei unbekannter Vorlage oder ungültigen Feldern.
 */
export function autoAusVorlage(vorlageId, felder = {}, { zufall = Math.random } = {}) {
  const v = AUTO_VORLAGEN.find((x) => x.id === vorlageId);
  if (!v) throw new Error('Unbekannte Vorlage.');
  const ids = new Set();
  const neueId = () => {
    let id;
    do id = neueAutoId(zufall);
    while (ids.has(id));
    ids.add(id);
    return id;
  };
  const roh = { ...v.auto, ...felder, id: neueId(), vorlage: v.id };
  const fehler = autoPruefen(roh);
  if (fehler) throw new Error(fehler);
  const auto = normalisiereAuto(roh);
  const regeln = v.regeln.map(({ quelle: _q, info: _i, ...r }) => normalisiereRegel({ ...r, id: neueId(), auto: auto.id, aktiv: true }));
  const saetze = v.saetze.map((s) => normalisiereSatz({ ...s, id: neueId(), auto: auto.id }));
  return { auto, regeln, saetze };
}

/** Legt ein Auto mit Regeln und Reifensätzen auf einmal an (z. B. aus autoAusVorlage). Gibt es das Auto schon → dieselben Daten. */
export function autoAnlegen(daten, { auto, regeln = [], saetze = [] } = {}) {
  if (!istObjekt(auto) || !istKennung(auto.id)) throw new Error('Ungültige Kennung.');
  if (autoDa(daten, auto.id)) return daten;
  let d = autoSetzen(daten, auto);
  for (const r of regeln) d = regelSetzen(d, r);
  for (const s of saetze) d = satzSetzen(d, s);
  return d;
}

// ---------------------------------------------------------------- Änderungen am Verlauf-Teil (rein, wiederholbar)

function mitHistorie(alt, arbeiten, km) {
  const neu = baueHistorie(alt, arbeiten, km);
  historieText(neu);
  return neu;
}

const jahrVon = (datum) => Number(datum.slice(0, 4));

/**
 * Trägt eine Arbeit ein oder ändert die mit derselben Kennung (an derselben Stelle). Sie muss zu Auto und Jahr des Teils gehören (ein
 * geändertes Jahr: im alten Teil löschen, im neuen eintragen). Wirft mit der Meldung aus arbeitPruefen; Warnungen halten nicht auf.
 */
export function arbeitSetzen(historie, arbeit, { heute } = {}) {
  if (!istObjekt(arbeit) || !istKennung(arbeit.id)) throw new Error('Ungültige Kennung.');
  const { fehler } = arbeitPruefen(arbeit, { heute });
  if (fehler) throw new Error(fehler);
  if (arbeit.auto !== historie.auto) throw new Error('Diese Arbeit gehört zu einem anderen Auto.');
  if (jahrVon(arbeit.datum) !== historie.jahr) throw new Error('Diese Arbeit gehört in ein anderes Jahr.');
  const neu = normalisiereArbeit(arbeit);
  const liste = historie.arbeiten ?? [];
  if (!liste.some((a) => a.id === neu.id) && fremdeKennung(historie.fremd?.w, neu.id)) throw new Error(TEXT_KENNUNG_NEUER);
  const arbeiten = setzeIn(liste, neu);
  return arbeiten ? mitHistorie(historie, arbeiten, historie.km ?? []) : historie;
}

/** Löscht eine Arbeit; unbekannt → derselbe Teil. */
export function arbeitLoeschen(historie, id) {
  const liste = historie.arbeiten ?? [];
  if (!liste.some((a) => a.id === id)) return historie;
  return baueHistorie(historie, liste.filter((a) => a.id !== id), historie.km ?? []);
}

/** Was arbeitLoeschen entfernt – für „Rückgängig“: { arbeit, stelle }; unbekannt → null. */
export function arbeitSpur(historie, id) {
  const stelle = (historie?.arbeiten ?? []).findIndex((a) => a.id === id);
  return stelle < 0 ? null : { arbeit: historie.arbeiten[stelle], stelle };
}

/** „Rückgängig“ nach arbeitLoeschen: dieselbe Arbeit an ihrer alten Stelle (ohne Zukunfts-Prüfung). Schon da → derselbe Teil. */
export function arbeitWiederherstellen(historie, spur) {
  const a = normalisiereArbeit(spur?.arbeit);
  if (!a || a.auto !== historie.auto || jahrVon(a.datum) !== historie.jahr) throw new Error('Ungültige Arbeit.');
  const liste = historie.arbeiten ?? [];
  if (liste.some((x) => x.id === a.id)) return historie;
  if (fremdeKennung(historie.fremd?.w, a.id)) throw new Error(TEXT_KENNUNG_NEUER);
  return mitHistorie(historie, eingefuegt(liste, a, spur.stelle), historie.km ?? []);
}

/**
 * Trägt einen Kilometerstand { datum, km } ein (Taste „Kilometerstand aktualisieren“): höchstens einer je Tag – ein neuer am selben Tag
 * ersetzt den alten. Muss ins Jahr des Teils gehören. Wirft mit der Meldung aus kmPruefen; Warnungen halten nicht auf.
 */
export function kmEintragen(historie, { datum, km } = {}, { heute } = {}) {
  const { fehler } = kmPruefen({ datum, km }, { heute });
  if (fehler) throw new Error(fehler);
  if (jahrVon(datum) !== historie.jahr) throw new Error('Dieser Kilometerstand gehört in ein anderes Jahr.');
  const neu = { datum, km: ganzzahl(km), quelle: 'eingabe' };
  const liste = historie.km ?? [];
  const alt = liste.find((p) => p.quelle === 'eingabe' && p.datum === datum);
  if (alt && alt.km === neu.km) return historie;
  const punkte = [...liste.filter((p) => p !== alt), neu].sort(nachDatum);
  return mitHistorie(historie, historie.arbeiten ?? [], punkte);
}

/** Löscht den eingegebenen Kilometerstand vom Tag `datum`; keiner → derselbe Teil. */
export function kmLoeschen(historie, datum) {
  const liste = historie.km ?? [];
  if (!liste.some((p) => p.quelle === 'eingabe' && p.datum === datum)) return historie;
  return baueHistorie(historie, historie.arbeiten ?? [], liste.filter((p) => !(p.quelle === 'eingabe' && p.datum === datum)));
}

/** Was kmLoeschen entfernt – für „Rückgängig“: { punkt }; kein eingegebener Stand an dem Tag → null. */
export function kmSpur(historie, datum) {
  const punkt = (historie?.km ?? []).find((p) => p.quelle === 'eingabe' && p.datum === datum);
  return punkt ? { punkt } : null;
}

/**
 * „Rückgängig“ nach kmLoeschen: derselbe Stand wieder an seinem Tag (ohne Zukunfts-Prüfung). Gibt es an dem Tag inzwischen einen
 * eingegebenen Stand (z. B. vom anderen Telefon), bleibt dieser → derselbe Teil.
 */
export function kmWiederherstellen(historie, spur) {
  const p = spur?.punkt;
  if (!istObjekt(p) || typeof p.datum !== 'string' || !Number.isInteger(p.km) || p.km < 0 || p.km > MAX_KM || jahrVon(p.datum) !== historie.jahr) throw new Error('Ungültiger Kilometerstand.');
  const liste = historie.km ?? [];
  if (liste.some((x) => x.quelle === 'eingabe' && x.datum === p.datum)) return historie;
  return mitHistorie(historie, historie.arbeiten ?? [], [...liste, { datum: p.datum, km: p.km, quelle: 'eingabe' }].sort(nachDatum));
}

/** Der Monat 'JJJJ-MM' plus `n` Monate (für Rechnungen; ungültige Eingabe wirft nicht, sondern ergibt Unsinn – vorher prüfen). */
export const monatPlus = (jm, n) => {
  const i = Number(jm.slice(0, 4)) * 12 + Number(jm.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${pad2((i % 12) + 1)}`;
};
