import { eachDay, isWerktag } from '../../domain/dates.js';
import { isFeiertag } from '../../domain/feiertage.js';
import { TYPES } from '../../domain/types.js';
import { kindergartenjahr, urlaubStatus } from '../../domain/urlaub.js';
import { einrichtungFor } from '../../domain/modus.js';
import { BETREUUNG, TAGES_TYPEN_REIHENFOLGE, schliessTageListe, typText } from './gemeinsam.js';

/** Kacheln für „Neu“: fünf Tagestypen, Urlaub, Arzttermin, Familie und Sachen für die Einrichtung. */
export function neuKacheln(heute, settings) {
  const tage = TAGES_TYPEN_REIHENFOLGE.map((typ) => {
    const { emoji, text } = typText(typ, heute, settings);
    return { id: typ, emoji, titel: text, farbe: TYPES[typ].farbe, bereit: true, art: 'tag' };
  });
  return [
    ...tage,
    { id: 'urlaub', emoji: TYPES.urlaub.emoji, titel: 'Urlaub', farbe: TYPES.urlaub.farbe, bereit: true, art: 'urlaub' },
    { id: 'arzt', emoji: TYPES.arzt.emoji, titel: 'Arzttermin', farbe: TYPES.arzt.farbe, bereit: true, art: 'termin' },
    { id: 'familie', emoji: TYPES.familie.emoji, titel: 'Familie & Sonstiges', farbe: TYPES.familie.farbe, bereit: true, art: 'termin' },
    { id: 'kita_sache', emoji: TYPES.kita_sache.emoji, titel: `Sachen für ${einrichtungFor(heute, settings)}`, farbe: TYPES.kita_sache.farbe, bereit: true, art: 'termin' },
  ];
}

/**
 * Was ein neuer Urlaub bewirkt: wie viele Urlaubstage dazukommen (Werktage ohne Feiertage), wie viele
 * Betreuungstage umgewandelt werden und wie der Stand des betroffenen Kindergartenjahres danach aussieht.
 */
export function urlaubVorschau(state, { start, end }, heute) {
  const tage = eachDay(start, end);
  const werktage = tage.filter((d) => isWerktag(d) && !isFeiertag(d)).length;
  const umwandeln = tage.filter((d) => BETREUUNG.includes(state.tage[d]?.typ)).length;
  const spans = [...state.urlaub.map(({ start: s, end: e }) => ({ start: s, end: e })), { start, end }];
  const jahrOffset = kindergartenjahr(start, state.settings.jahresstart).id - kindergartenjahr(heute, state.settings.jahresstart).id;
  const nachher = urlaubStatus({ spans, schliessTage: schliessTageListe(state), settings: state.settings, today: heute, jahrOffset });
  return {
    werktage,
    umwandeln,
    nachher: {
      jahrId: nachher.jahr.id,
      genommen: nachher.genommen,
      geplant: nachher.geplant,
      offen: nachher.offen,
      durchgehend: nachher.durchgehend.erfuellt,
    },
  };
}

/** Werktage (Mo–Fr, ohne Feiertage) eines Zeitraums: darauf wirkt ein Tageseintrag. Leer bei umgekehrtem Zeitraum. */
export function werktageImBereich(von, bis) {
  if (!(von <= bis)) return [];
  return eachDay(von, bis).filter((d) => isWerktag(d) && !isFeiertag(d));
}

/** Anzahl Urlaubstage eines Zeitraums (Werktage ohne Feiertage). */
export function urlaubstageImZeitraum({ start, end }) {
  return werktageImBereich(start, end).length;
}
