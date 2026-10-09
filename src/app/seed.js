import { addDays, eachDay, isWerktag, weekday } from '../domain/dates.js';
import { isFeiertag } from '../domain/feiertage.js';
import { normalizeSettings } from '../domain/settings.js';
import { ARZT_SUBTYPEN } from '../domain/types.js';
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
  return { settings, tage, urlaub, termine: [...termine, ...sachenDemo({ settings, tage, urlaub }, heute)], einkauf, konto };
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
