import { addDays, eachDay, isWerktag, weekday } from '../../domain/dates.js';
import { feiertagName } from '../../domain/feiertage.js';
import { einrichtungFor } from '../../domain/modus.js';
import { TYPES } from '../../domain/types.js';
import { MONATE, monatTitel } from '../format-de.js';
import { FEIERTAG_EMOJI, FEIERTAG_FARBE, tagTyp, termineAm, urlaubTageSet } from './gemeinsam.js';

const pad2 = (n) => String(n).padStart(2, '0');

export function vorherigerMonat(jahr, monat) {
  return monat === 1 ? { jahr: jahr - 1, monat: 12 } : { jahr, monat: monat - 1 };
}

export function naechsterMonat(jahr, monat) {
  return monat === 12 ? { jahr: jahr + 1, monat: 1 } : { jahr, monat: monat + 1 };
}

const tageText = (n, einzahl, mehrzahl) => `${n} ${n === 1 ? einzahl : mehrzahl}`;

function statistikZeilen(zaehler, einrichtung, monat) {
  const zeilen = [];
  if (zaehler.kita > 0) {
    const essen = zaehler.essen > 0 ? `, davon ${zaehler.essen} mit Mittagessen` : '';
    zeilen.push(`${MONATE[monat - 1]}: ${tageText(zaehler.kita, 'Tag', 'Tage')} ${einrichtung}${essen}`);
  }
  const weitere = [];
  if (zaehler.krank > 0) weitere.push(`${tageText(zaehler.krank, 'Tag', 'Tage')} krank`);
  if (zaehler.abwesend > 0) weitere.push(`${tageText(zaehler.abwesend, 'Tag', 'Tage')} abwesend`);
  if (zaehler.schliess > 0) weitere.push(tageText(zaehler.schliess, 'Schließtag', 'Schließtage'));
  if (zaehler.urlaub > 0) weitere.push(tageText(zaehler.urlaub, 'Urlaubstag', 'Urlaubstage'));
  if (weitere.length > 0) zeilen.push(weitere.join(' · '));
  return zeilen;
}

/** Monatsraster (Montag bis Sonntag) mit allem, was pro Tag angezeigt wird, plus Statistik ohne Geldbeträge. */
export function monatModel(state, jahr, monat, heute) {
  const erster = `${jahr}-${pad2(monat)}-01`;
  const folge = naechsterMonat(jahr, monat);
  const letzter = addDays(`${folge.jahr}-${pad2(folge.monat)}-01`, -1);
  const von = addDays(erster, -weekday(erster));
  const bis = addDays(letzter, 6 - weekday(letzter));
  const urlaubSet = urlaubTageSet(state);

  const zaehler = { kita: 0, essen: 0, krank: 0, abwesend: 0, schliess: 0, urlaub: 0 };
  const zellen = eachDay(von, bis).map((date) => {
    const imMonat = date >= erster && date <= letzter;
    const feiertag = feiertagName(date);
    const typ = tagTyp(state, date, urlaubSet);
    const termine = termineAm(state, date);
    if (imMonat && typ) {
      if (typ === 'kita_essen') {
        zaehler.kita++;
        zaehler.essen++;
      } else if (typ === 'kita_ohne') zaehler.kita++;
      else if (typ === 'urlaub') {
        if (isWerktag(date) && !feiertag) zaehler.urlaub++;
      } else zaehler[typ]++;
    }
    // Ein Feiertag mitten im Urlaub ist kein Urlaubstag und wird als Feiertag gezeigt.
    const anzeigeTyp = typ === 'urlaub' && feiertag ? null : typ;
    return {
      date,
      tag: Number(date.slice(8)),
      imMonat,
      istHeute: date === heute,
      wochenende: !isWerktag(date),
      feiertag,
      typ,
      konflikt: Boolean(state.tage[date]?.konflikt), // mehrere Einträge am selben Tag (siehe Tagesblatt)
      emoji: anzeigeTyp ? TYPES[anzeigeTyp].emoji : feiertag ? FEIERTAG_EMOJI : '',
      farbe: anzeigeTyp ? TYPES[anzeigeTyp].farbe : feiertag ? FEIERTAG_FARBE : null,
      arzt: termine.some((t) => t.typ === 'arzt'),
      sache: termine.some((t) => t.typ === 'kita_sache'),
      termin: termine.find((t) => t.typ === 'familie')?.emoji ?? null, // Symbol des ersten „Termins“ (alles außer Arzt und Sachen)
      termine: termine.length,
    };
  });

  const wochen = [];
  for (let i = 0; i < zellen.length; i += 7) wochen.push(zellen.slice(i, i + 7));

  return {
    jahr,
    monat,
    titel: monatTitel(jahr, monat),
    vorher: vorherigerMonat(jahr, monat),
    nachher: naechsterMonat(jahr, monat),
    wochen,
    statistik: statistikZeilen(zaehler, einrichtungFor(erster, state.settings), monat),
    zaehler,
  };
}
