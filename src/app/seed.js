import { addDays, eachDay, isWerktag, weekday } from '../domain/dates.js';
import { isFeiertag } from '../domain/feiertage.js';
import { normalizeSettings } from '../domain/settings.js';
import { ARZT_SUBTYPEN } from '../domain/types.js';

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
  const settings = normalizeSettings({ erfassungAb: start });

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
      date: werktagAb(addDays(heute, 1)),
      time: '10:00',
      mitnehmen: [...ARZT_SUBTYPEN.kinderarzt.mitnehmen],
      kosten: null,
    },
    {
      id: 'demo-t2',
      typ: 'arzt',
      subtyp: 'impfung',
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
      id: 'demo-t4',
      typ: 'arzt',
      subtyp: 'augenarzt',
      date: werktagAb(addDays(heute, 20)),
      time: '09:15',
      mitnehmen: [...ARZT_SUBTYPEN.augenarzt.mitnehmen],
      kosten: { kostenlos: true },
    },
  ];

  return { settings, tage, urlaub, termine };
}
