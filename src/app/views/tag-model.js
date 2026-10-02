import { feiertagName } from '../../domain/feiertage.js';
import { TYPES } from '../../domain/types.js';
import { datumLang } from '../format-de.js';
import { FEIERTAG_EMOJI, TAGES_TYPEN_REIHENFOLGE, termineAm, typText, urlaubTageSet } from './gemeinsam.js';

/** Inhalt des Tages-Blattes (Monat → Tag antippen): was am Tag eingetragen ist und was man setzen kann. */
export function tagModel(state, date, heute) {
  const eintraege = [];
  const feiertag = feiertagName(date);
  if (feiertag) eintraege.push({ art: 'feiertag', emoji: FEIERTAG_EMOJI, text: `Feiertag: ${feiertag}` });

  const urlaub = state.urlaub.find((u) => u.start <= date && date <= u.end);
  if (urlaub) {
    const { emoji, text } = typText('urlaub', date, state.settings);
    eintraege.push({ art: 'urlaub', id: urlaub.id, emoji, text, farbe: TYPES.urlaub.farbe });
  }
  const eintrag = state.tage[date];
  if (eintrag) {
    const { emoji, text } = typText(eintrag.typ, date, state.settings);
    eintraege.push({ art: 'tag', typ: eintrag.typ, emoji, text, farbe: TYPES[eintrag.typ].farbe });
  }
  for (const t of termineAm(state, date)) eintraege.push({ art: 'termin', ...t });

  const aktuell = eintrag?.typ ?? null;
  return {
    date,
    titel: datumLang(date),
    zukunft: date > heute,
    eintraege,
    imUrlaub: Boolean(urlaub) && urlaubTageSet(state).has(date),
    aktuellerTyp: aktuell,
    aktionen: TAGES_TYPEN_REIHENFOLGE.map((typ) => ({
      typ,
      ...typText(typ, date, state.settings),
      farbe: TYPES[typ].farbe,
      aktiv: typ === aktuell,
    })),
  };
}
