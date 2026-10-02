import { addDays, isWerktag, todayVienna } from '../../domain/dates.js';
import { feiertagName } from '../../domain/feiertage.js';
import { einrichtungFor } from '../../domain/modus.js';
import { TYPES } from '../../domain/types.js';
import { offeneTage } from '../../domain/offen.js';
import { urlaubStatus, naechsterUrlaub } from '../../domain/urlaub.js';
import { datumLang, gruss, stundeInWien } from '../format-de.js';
import { sachenModel } from './sachen-model.js';
import {
  ABWESENHEIT,
  BETREUUNG,
  FEIERTAG_EMOJI,
  FEIERTAG_FARBE,
  naechsteTermine,
  schliessTageListe,
  tageMitTyp,
  tagTyp,
  termineAm,
  typText,
  urlaubTageSet,
} from './gemeinsam.js';

const keineSache = (t) => t.typ !== 'kita_sache';

function statusHeute(state, heute, urlaubSet) {
  const feiertag = feiertagName(heute);
  const typ = tagTyp(state, heute, urlaubSet);
  if (typ && !(typ === 'urlaub' && feiertag)) {
    const { emoji, text } = typText(typ, heute, state.settings);
    return { art: 'eintrag', typ, emoji, text, farbe: TYPES[typ].farbe };
  }
  if (feiertag) return { art: 'feiertag', typ: null, emoji: FEIERTAG_EMOJI, text: `Feiertag: ${feiertag}`, farbe: FEIERTAG_FARBE };
  if (!isWerktag(heute)) return { art: 'wochenende', typ: null, emoji: '🌈', text: 'Wochenende', farbe: FEIERTAG_FARBE };
  return { art: 'offen', typ: null, emoji: '🏫', text: 'Wie war’s heute?', farbe: TYPES.kita_essen.farbe };
}

/** Alles, was der Bildschirm „Heute“ braucht, als einfache Daten. */
export function heuteModel(state, now = new Date()) {
  const { settings } = state;
  const heute = todayVienna(now);
  const urlaubSet = urlaubTageSet(state);
  const spans = state.urlaub.map(({ start, end }) => ({ start, end }));

  const offene = offeneTage({
    erwartung: settings.erwartung,
    erfassungAb: settings.erfassungAb,
    today: heute,
    anwesenheit: tageMitTyp(state, BETREUUNG),
    abwesenheit: tageMitTyp(state, ABWESENHEIT),
    urlaub: urlaubSet,
  });

  const status = urlaubStatus({ spans, schliessTage: schliessTageListe(state), settings, today: heute });
  const jahr = status.jahr;
  const countdown = naechsterUrlaub(spans, heute);

  return {
    heute,
    gruss: gruss(stundeInWien(now)),
    datumText: datumLang(heute),
    einrichtung: einrichtungFor(heute, settings),
    status: statusHeute(state, heute, urlaubSet),
    offeneTage: offene,
    termineHeute: termineAm(state, heute).filter(keineSache),
    termineMorgen: termineAm(state, addDays(heute, 1)).filter(keineSache),
    termineDemnaechst: naechsteTermine(state, addDays(heute, 1), 3),
    sachen: sachenModel(state, heute),
    urlaub: {
      jahrText: `Kindergartenjahr ${jahr.id}/${String(jahr.id + 1).slice(2)}`,
      ziel: status.ziel,
      genommen: status.genommen,
      geplant: status.geplant,
      offen: status.offen,
      durchgehend: status.durchgehend,
      countdown,
    },
  };
}
