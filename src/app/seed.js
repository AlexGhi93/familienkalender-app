import { addDays, eachDay, isWerktag, weekday } from '../domain/dates.js';
import { isFeiertag } from '../domain/feiertage.js';
import { normalizeSettings } from '../domain/settings.js';
import { ARZT_SUBTYPEN } from '../domain/types.js';
import { leererMonat, setzeNotiz, setzeSchicht, standardKatalog, tageImMonat, zusatzHinzufuegen } from '../domain/schicht.js';
import { FIX_SHARDS, leererShard, postenSetzen, shardFuer } from '../domain/fixkosten.js';
import { ZIEL_EMOJIS } from '../domain/sparziele.js';
import { naechsterKitaTag, wochenSerie } from './serie.js';

const MUSTER = ['kita_essen', 'kita_essen', 'kita_essen', 'kita_ohne', 'kita_essen', 'kita_essen', 'kita_essen', 'kita_essen'];

const montag = (datum) => addDays(datum, -weekday(datum));

/** Arzttermine liegen an Werktagen, nie am Wochenende oder an einem Feiertag. */
function werktagAb(datum) {
  let d = datum;
  while (!isWerktag(d) || isFeiertag(d)) d = addDays(d, 1);
  return d;
}

/**
 * Demo-Daten relativ zu `heute`, damit „Heute“, „Morgen“ und der Urlaubsring immer etwas Sinnvolles zeigen.
 * Enthält bewusst keine echten Namen oder Familiendaten.
 */
export function seedDemo(heute) {
  const start = addDays(heute, -28);
  const settings = normalizeSettings({ erfassungAb: start }); // ohne Namen des Kindes: „Für wen“ zeigt „Kind“

  const vergangenerUrlaubStart = montag(addDays(heute, -21));
  const kuenftigerUrlaubStart = addDays(montag(heute), 21);
  const urlaub = [
    { id: 'demo-u1', start: vergangenerUrlaubStart, end: addDays(vergangenerUrlaubStart, 4) },
    { id: 'demo-u2', start: kuenftigerUrlaubStart, end: addDays(kuenftigerUrlaubStart, 11) },
  ];
  const imUrlaub = new Set(urlaub.flatMap((u) => eachDay(u.start, u.end)));

  const tage = {};
  const werktage = eachDay(start, addDays(heute, -1)).filter((d) => isWerktag(d) && !isFeiertag(d) && !imUrlaub.has(d));
  werktage.forEach((d, i) => {
    if (i === werktage.length - 3) return; // ein Tag bleibt „offen“
    if (i % 11 === 4 || i % 11 === 5) tage[d] = { typ: 'krank' };
    else if (i % 13 === 7) tage[d] = { typ: 'abwesend' };
    else tage[d] = { typ: MUSTER[i % MUSTER.length] };
  });

  const termine = [
    {
      id: 'demo-t1',
      typ: 'arzt',
      subtyp: 'kinderarzt',
      fuer: 'kind',
      date: werktagAb(addDays(heute, 1)),
      time: '10:00',
      mitnehmen: [...ARZT_SUBTYPEN.kinderarzt.mitnehmen],
      kosten: null,
    },
    {
      id: 'demo-t2',
      typ: 'arzt',
      subtyp: 'impfung',
      fuer: 'kind',
      date: werktagAb(addDays(heute, 8)),
      time: '09:15',
      mitnehmen: [...ARZT_SUBTYPEN.impfung.mitnehmen],
      kosten: { betrag: 15 },
    },
    {
      id: 'demo-t3',
      typ: 'familie',
      label: 'Geburtstag Oma',
      date: addDays(heute, 12),
      time: '15:00',
      mitnehmen: ['Geschenk'],
      kosten: null,
    },
    {
      id: 'demo-t5',
      typ: 'familie',
      label: 'Finanzamt',
      symbol: '🏛️',
      fuer: 'mama',
      notiz: 'Arbeitnehmerveranlagung, 2. Stock',
      date: werktagAb(addDays(heute, 5)),
      time: '14:00',
      mitnehmen: ['Ausweis', 'Lohnzettel'],
      kosten: null,
    },
    {
      id: 'demo-t4',
      typ: 'arzt',
      subtyp: 'augenarzt',
      date: werktagAb(addDays(heute, 20)),
      time: '09:15',
      mitnehmen: [...ARZT_SUBTYPEN.augenarzt.mitnehmen],
      kosten: { kostenlos: true },
    },
  ];

  const z = Math.floor(Date.parse(`${heute}T00:00:00Z`) / 1000) - 86400; // gestern: neue Artikel stehen in der Demo immer unten
  const einkauf = {
    v: 1,
    e: [
      { i: 'demo-e1', t: 'Milch', m: '2 L', g: 0, z },
      { i: 'demo-e2', t: 'Windeln', m: '', g: 0, z: z + 1 },
      { i: 'demo-e3', t: 'Nudeln', m: '500 g', g: 0, z: z + 2 },
      { i: 'demo-e4', t: 'Brot', m: '', g: 1, z: z + 3 },
    ],
    h: { Joghurt: 4, Äpfel: 3, Eier: 2 },
  };
  // erfundene Kontostände der letzten fünf Monatsenden (nur für die Demo): mit Plus und einem Minus
  const [jahr, monat] = heute.split('-').map(Number);
  const monatVor = (n) => {
    const index = jahr * 12 + (monat - 1) - n;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  };
  const papaWerte = [1850000, 1932000, 2014050, 1988000, 2071100];
  const mamaWerte = [900000, 951000, 1010000, 990000, 1100250];
  const konto = { v: 1, p: { papa: {}, mama: {} }, x: [] };
  papaWerte.forEach((cents, i) => {
    konto.p.papa[monatVor(5 - i)] = cents;
    konto.p.mama[monatVor(5 - i)] = mamaWerte[i];
  });
  konto.x.push({ i: 'demoex01', p: 'mama', m: monatVor(3), c: 60000, t: 'Steuerrückzahlung' }, { i: 'demoex02', p: 'papa', m: monatVor(2), c: -45000, t: 'Autoreparatur' });
  const schicht = schichtDemo([monatVor(1), monatVor(0), monatVor(-1)]);
  const fixkosten = fixkostenDemo(monatVor);
  const ziele = zieleDemo(monatVor);
  return { settings, tage, urlaub, termine: [...termine, ...sachenDemo({ settings, tage, urlaub }, heute)], einkauf, konto, schicht, fixkosten, ziele };
}

// Papa: Blöcke aus 4 Diensten, dann 2 Tage frei (fortlaufend über Monatsgrenzen); jeder Block mit anderen Arten.
const PAPA_BLOECKE = [
  ['F', 'F', 'M', 'M'],
  ['NM', 'NM', 'N', 'N'],
  ['F', '2T', '2T', 'M'],
  ['M', 'NM', 'N', 'N'],
  ['S', 'F', 'F', 'Ü'],
  ['N', 'N', 'F', 'F'],
  ['M', 'M', 'NM', 'NM'],
]; // 7 Blöcke à 6 Tage: der Rhythmus wiederholt sich erst nach 42 Tagen, kein Monat sieht aus wie der vorige
// Mama: wöchentlich zwei Tagdienste und ein Nachtdienst (Wochentag 0 = Montag).
const MAMA_WOCHE = { 1: 'T', 2: 'T', 4: 'N' };

/** Erfundener Schichtplan für den Vormonat, diesen und den nächsten Monat (`monate` in dieser Reihenfolge); keine echten Daten. */
function schichtDemo([vorher, jetzt, danach]) {
  const katalog = standardKatalog();
  const k = (person, kuerzel) => katalog.arten[person].find((a) => a.kuerzel === kuerzel).k;
  const monate = {};
  for (const jm of [vorher, jetzt, danach]) {
    let monat = leererMonat(jm);
    for (let tag = 1; tag <= tageImMonat(jm); tag += 1) {
      const datum = `${jm}-${String(tag).padStart(2, '0')}`;
      const nr = Math.floor(Date.parse(`${datum}T00:00:00Z`) / 86400000); // Tage seit 1970: gleicher Rhythmus über Monatsgrenzen
      const imBlock = nr % 6;
      if (imBlock < 4) monat = setzeSchicht(monat, { person: 'papa', tag, k: k('papa', PAPA_BLOECKE[Math.floor(nr / 6) % PAPA_BLOECKE.length][imBlock]) });
      const mama = MAMA_WOCHE[weekday(datum)];
      if (mama) monat = setzeSchicht(monat, { person: 'mama', tag, k: k('mama', mama) });
    }
    monate[jm] = monat;
  }
  monate[jetzt] = setzeNotiz(monate[jetzt], { person: 'mama', tag: 13, text: 'Dienst 12' });
  monate[jetzt] = zusatzHinzufuegen(monate[jetzt], { person: 'mama', tag: 21, k: k('mama', 'DB'), von: '18:00', bis: '19:30' });
  for (const tag of [10, 11, 12]) monate[danach] = setzeSchicht(monate[danach], { person: 'mama', tag, k: k('mama', 'U') });
  return { katalog, monate };
}

/**
 * Erfundene Fixkosten (keine echten Namen oder Beträge), relativ zu heute: 12 aktive Posten und ein archivierter, zwei davon Verträge –
 * die Kfz-Versicherung ist in höchstens 60 Tagen kündbar (⚠), das Fitnessstudio erst in etwa einem halben Jahr.
 * Jeder Posten liegt in seinem Teil shardFuer(id). `monatVor(n)` = 'JJJJ-MM' n Monate vor heute (negativ = danach).
 */
function fixkostenDemo(monatVor) {
  const monatsende = (jm) => `${jm}-${String(tageImMonat(jm)).padStart(2, '0')}`;
  const p = (nr, name, cents, kategorie, person, mehr = {}) => ({ id: `demofk${String(nr).padStart(2, '0')}`, name, cents, ungefaehr: false, intervall: 1, tag: '1', start: monatVor(12), kategorie, person, ...mehr });
  const posten = [
    p(1, 'Miete', 105000, 'wohnen', 'gemeinsam'),
    p(2, 'Strom', 7400, 'wohnen', 'gemeinsam', { ungefaehr: true, tag: '15' }),
    p(3, 'Fernwärme', 17800, 'wohnen', 'gemeinsam', { ungefaehr: true, intervall: 2, tag: '20', start: monatVor(10) }), // diesen Monat fällig
    p(4, 'ORF-Beitrag', 18360, 'wohnen', 'gemeinsam', { intervall: 12, tag: '15', start: monatVor(9) }), // in 3 Monaten fällig
    p(5, 'Kfz-Versicherung Papa', 5900, 'versicherung', 'papa', { vertrag: { bis: monatsende(monatVor(-2)), verlaengerung: 12, frist: '1m' } }),
    p(6, 'Krankenversicherung Kind', 3200, 'versicherung', 'kind', { tag: '5' }),
    p(7, 'Handy Mama', 1500, 'kommunikation', 'mama', { tag: '10' }),
    p(8, 'Internet', 3990, 'kommunikation', 'gemeinsam', { tag: '10' }),
    p(9, 'Fitnessstudio', 2990, 'freizeit', 'mama', { tag: 'letzter', vertrag: { bis: monatsende(monatVor(-8)), verlaengerung: 12, frist: '2m' } }),
    p(10, 'Streaming', 1399, 'freizeit', 'gemeinsam', { tag: '28' }),
    p(11, 'Friseur', 3500, 'sonstiges', 'papa', { ungefaehr: true, tag: '25' }),
    p(12, 'Kontoführung', 1890, 'bank', 'papa', { intervall: 3, tag: 'letzter', start: monatVor(6) }),
    p(13, 'Babyschwimmen', 4500, 'kind', 'kind', { tag: '3', archiv: `${monatVor(1)}-01` }), // im Archiv
  ];
  const shards = Array.from({ length: FIX_SHARDS }, leererShard);
  for (const x of posten) shards[shardFuer(x.id)] = postenSetzen(shards[shardFuer(x.id)], x);
  return { shards };
}

/**
 * Erfundene Sparziele (keine echten Namen oder Beträge), alle vor vier Monaten angelegt: so verteilt die Rechnung schon die Ersparnis von
 * vier Demo-Kontoständen (drei Plus-Monate, ein Minus-Monat). 🚗 Auto (fest, in knapp zwei Jahren) und 🏖️ Sommerurlaub (vorläufig, in
 * neun Monaten) laufen; 🛋️ Neues Sofa war vor zwei Monaten fällig und ist abgeschlossen (steht im Verlauf). Was die Ziele im letzten
 * Monat nicht brauchten, liegt in „Frei verfügbar“. Im Zustandsformat (lange Schlüssel); der Demo-Adapter speichert es als Kalendertext.
 */
function zieleDemo(monatVor) {
  const [auto, urlaub, sofa] = [ZIEL_EMOJIS[0], ZIEL_EMOJIS[1], ZIEL_EMOJIS[6]];
  const start = monatVor(4);
  return {
    v: 1,
    beginn: start,
    z: [
      { id: 'demo0001', name: 'Auto', emoji: auto, zielCents: 2_300_000, datum: monatVor(-21), vorlaeufig: false, erstellt: start },
      { id: 'demo0002', name: 'Sommerurlaub', emoji: urlaub, zielCents: 300_000, datum: monatVor(-9), vorlaeufig: true, erstellt: start },
      { id: 'demo0003', name: 'Neues Sofa', emoji: sofa, zielCents: 120_000, datum: monatVor(2), vorlaeufig: false, erstellt: start },
    ],
    m: [],
  };
}

/** Sachen für die Krabbelstube: Hinbringen in der nächsten Woche, Heimholen am Freitag danach, später Windeln und Socken. */
function sachenDemo(state, heute) {
  const hin = naechsterKitaTag(state, addDays(heute, 2));
  const sachen = [
    { id: 'demo-s1', typ: 'kita_sache', richtung: 'hin', date: hin, time: state.settings.bringzeit, mitnehmen: ['Pyjamas', 'Hausschuhe'], kosten: null },
  ];
  const freitag = addDays(hin, 4 - weekday(hin));
  for (let i = freitag === hin ? 1 : 0; i < 8; i += 1) {
    const eintrag = wochenSerie(state, { start: addDays(freitag, 7 * i), wochen: 1, richtung: 'heim', heute }).eintraege[0];
    if (eintrag) {
      sachen.push({ id: 'demo-s2', typ: 'kita_sache', richtung: 'heim', date: eintrag.date, time: state.settings.abholzeit, mitnehmen: ['Pyjamas'], kosten: null });
      break;
    }
  }
  sachen.push({ id: 'demo-s3', typ: 'kita_sache', richtung: 'hin', date: naechsterKitaTag(state, addDays(heute, 11)), time: state.settings.bringzeit, mitnehmen: ['Windeln', 'Socken'], kosten: null });
  return sachen;
}
