import { addDays } from '../../domain/dates.js';
import { KITA_RICHTUNGEN } from '../../domain/types.js';
import { datumKurz } from '../format-de.js';
import { terminAnzeige } from './gemeinsam.js';

export const SACHEN_TAGE_ZURUECK = 7;
export const SACHEN_TAGE_VORAUS = 7;

/** Offene Sachen für die Einrichtung rund um heute: überfällig (bis 7 Tage zurück), heute, morgen, später (bis 7 Tage voraus). */
export function sachenModel(state, heute) {
  const von = addDays(heute, -SACHEN_TAGE_ZURUECK);
  const bis = addDays(heute, SACHEN_TAGE_VORAUS);
  const morgen = addDays(heute, 1);
  const eintraege = state.termine
    .filter((t) => t.typ === 'kita_sache' && t.date >= von && t.date <= bis)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
    .map((t) => ({
      ...terminAnzeige(t, state.settings),
      tag: t.date < heute ? 'ueberfaellig' : t.date === heute ? 'heute' : t.date === morgen ? 'morgen' : 'spaeter',
      datumText: datumKurz(t.date),
      richtungText: KITA_RICHTUNGEN[t.richtung].label,
    }));
  return { eintraege, anzahlOffen: eintraege.length };
}
