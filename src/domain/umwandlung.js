import { dayEventId } from './ids.js';

const ABSENZ_TYPEN = ['abwesend', 'krank', 'schliess'];

/**
 * Plant „Tage umwandeln?“: Anwesenheits-Einträge der betroffenen Tage werden gelöscht;
 * für Abwesend/Krank/Schließtag entsteht je Tag ein Eintrag in „Abwesenheit“.
 * Urlaub ist ein Intervall-Ereignis, das der Aufrufer selbst anlegt, hier gibt es nichts zu erstellen.
 */
export function planUmwandlung({ dates, zielTyp, vorhandeneBifen }) {
  const loeschen = dates.filter((d) => vorhandeneBifen.has(d));
  if (ABSENZ_TYPEN.includes(zielTyp)) {
    return { loeschen, erstellen: dates.map((date) => ({ date, typ: zielTyp, id: dayEventId(date) })) };
  }
  if (zielTyp === 'urlaub') return { loeschen, erstellen: [] };
  throw new Error(`Ungültiger Zieltyp: ${zielTyp}`);
}
