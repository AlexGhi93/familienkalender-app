// Reine Zusammenfassung: Google-Ereignisse aus allen drei Kalendern -> Zustand der App (Tage, Urlaub, Termine, Einstellungen).
import { dominanterTyp, hatKonflikt, verdraengteTypen } from '../domain/konflikt.js';
import { ereignisZuEintrag } from './mapping.js';

/**
 * `ereignisse` = [{ kalender, event }] (Google-Ereignisse, beliebig gemischt, auch doppelt).
 * Ergebnis: { tage, urlaub, termine, einstellungen, resync, konflikte }.
 * `tage[date] = { typ, konflikt?, andere? }`: bei mehreren Tagestypen am selben Datum gewinnt der stärkere, `konflikt` markiert es, `andere` nennt die verdrängten.
 */
export function ereignisseZuZustand({ ereignisse, settings }) {
  const typenJeTag = new Map();
  const urlaub = new Map();
  const termine = new Map();
  const resync = new Map();
  let einstellungen = null;
  const gesehen = new Set();

  for (const { kalender, event } of ereignisse) {
    const schluessel = `${kalender}/${event.id}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    const eintrag = ereignisZuEintrag(event, kalender, settings);
    switch (eintrag.art) {
      case 'tag':
        for (const datum of eintrag.tage) typenJeTag.set(datum, [...(typenJeTag.get(datum) ?? []), eintrag.typ]);
        break;
      case 'urlaub':
        urlaub.set(eintrag.id, { id: eintrag.id, start: eintrag.start, end: eintrag.end });
        break;
      case 'termin':
        termine.set(eintrag.termin.id, eintrag.termin);
        if (eintrag.resync) resync.set(eintrag.resync.id, eintrag.resync);
        break;
      case 'einstellungen':
        einstellungen = { settings: eintrag.settings, warnungen: eintrag.warnungen };
        break;
      default:
        break;
    }
  }

  const tage = {};
  const konflikte = [];
  for (const [datum, typen] of [...typenJeTag].sort(([a], [b]) => a.localeCompare(b))) {
    const konflikt = hatKonflikt(typen);
    tage[datum] = konflikt ? { typ: dominanterTyp(typen), konflikt: true, andere: verdraengteTypen(typen) } : { typ: dominanterTyp(typen) };
    if (konflikt) konflikte.push(datum);
  }

  return {
    tage,
    urlaub: [...urlaub.values()].sort((a, b) => a.start.localeCompare(b.start)),
    termine: [...termine.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')),
    einstellungen,
    resync: [...resync.values()],
    konflikte,
  };
}
