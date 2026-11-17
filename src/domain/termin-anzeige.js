import { TYPES, ARZT_SUBTYPEN, FUER } from './types.js';
import { fuerName } from './fuer.js';
import { buildArztTitle, buildFamilieTitle, buildKitaSacheTitle } from './titles.js';
import { einrichtungFor } from './modus.js';
import { euroText } from './format.js';

function kostenText(kosten) {
  if (!kosten) return null;
  return kosten.kostenlos ? 'kostenlos' : euroText(kosten.betrag);
}

/** Termin für die Anzeige: Emoji, Beschriftung, Uhrzeit, Mitnehmen, Kosten und der Titel, wie er im Kalender steht. */
export function terminAnzeige(t, settings) {
  const gemeinsam = { id: t.id, typ: t.typ, date: t.date, time: t.time ?? null, mitnehmen: t.mitnehmen ?? [], kosten: kostenText(t.kosten), farbe: TYPES[t.typ].farbe };
  if (t.typ === 'kita_sache') {
    const einrichtung = einrichtungFor(t.date, settings);
    return {
      ...gemeinsam,
      subtyp: null,
      fuer: null,
      fuerText: null,
      fuerEmoji: null,
      notiz: null,
      emoji: TYPES.kita_sache.emoji,
      label: t.richtung === 'heim' ? `Von ${einrichtung} heimholen` : `${einrichtung} hinbringen`,
      richtung: t.richtung,
      serie: t.serie ?? null,
      titel: buildKitaSacheTitle({ richtung: t.richtung, einrichtung, time: t.time, mitnehmen: t.mitnehmen }),
    };
  }
  const sub = t.typ === 'arzt' ? ARZT_SUBTYPEN[t.subtyp] : null;
  const fuer = t.fuer && FUER[t.fuer] ? t.fuer : null;
  const fuerText = fuerName(fuer, settings);
  const titel =
    t.typ === 'arzt'
      ? buildArztTitle({ subtyp: t.subtyp, fuer: fuerText, time: t.time, mitnehmen: t.mitnehmen, kosten: t.kosten })
      : buildFamilieTitle({ text: t.label, symbol: t.symbol, fuer: fuerText, time: t.time, mitnehmen: t.mitnehmen, kosten: t.kosten });
  return {
    ...gemeinsam,
    subtyp: t.subtyp ?? null,
    fuer,
    fuerText,
    fuerEmoji: fuer ? FUER[fuer].emoji : null,
    notiz: t.notiz ?? null,
    emoji: sub ? sub.emoji : t.symbol || TYPES.familie.emoji,
    label: sub ? sub.label : t.label,
    richtung: null,
    serie: null,
    titel,
  };
}
