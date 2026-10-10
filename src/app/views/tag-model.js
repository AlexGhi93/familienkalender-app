import { feiertagName } from '../../domain/feiertage.js';
import { FAMILIE_SYMBOLE, TYPES } from '../../domain/types.js';
import { datumLang } from '../format-de.js';
import { FEIERTAG_EMOJI, TAGES_TYPEN_REIHENFOLGE, termineAm, typText, urlaubTageSet } from './gemeinsam.js';

/** „Neu an diesem Tag“: dieselben Arten, Symbole und Farben wie die Kacheln in „Neu“ (art = Art für ui.neuTerminStarten). */
const NEU_AN_DIESEM_TAG = [
  { art: 'arzt', emoji: TYPES.arzt.emoji, text: 'Arzttermin', farbe: TYPES.arzt.farbe },
  { art: 'familie', emoji: FAMILIE_SYMBOLE[0], text: 'Termin', farbe: TYPES.familie.farbe },
  { art: 'kita_sache', emoji: TYPES.kita_sache.emoji, text: 'Sachen', farbe: TYPES.kita_sache.farbe },
];

/** Konflikt-Tag: was gilt, was daneben steht und wie man es auflöst (ein Tipp auf den richtigen Eintrag räumt auf). */
function konfliktHinweis(eintrag, date, settings) {
  const info = (typ) => ({ typ, ...typText(typ, date, settings) });
  const gewinnt = info(eintrag.typ);
  const andere = (eintrag.andere ?? []).filter((t) => TYPES[t]).map(info);
  const nenne = (x) => `${x.emoji} ${x.text}`;
  const stehen = andere.length > 0 ? `„${[gewinnt, ...andere].map(nenne).join('“ und „')}“ stehen am selben Tag` : 'Für diesen Tag gibt es mehrere Einträge';
  return { gewinnt, andere, hinweis: `${stehen}. Es gilt: ${nenne(gewinnt)}. Tippe unten auf das, was stimmt – dann bleibt nur noch das.` };
}

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
  const konflikt = eintrag?.konflikt ? konfliktHinweis(eintrag, date, state.settings) : null;
  return {
    konflikt,
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
    neu: NEU_AN_DIESEM_TAG,
  };
}
