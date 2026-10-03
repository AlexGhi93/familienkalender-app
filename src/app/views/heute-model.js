import { addDays, isWerktag, todayVienna } from '../../domain/dates.js';
import { feiertagName } from '../../domain/feiertage.js';
import { einrichtungFor } from '../../domain/modus.js';
import { wienZuInstant } from '../../domain/instant.js';
import { TYPES } from '../../domain/types.js';
import { offeneTage } from '../../domain/offen.js';
import { urlaubStatus, naechsterUrlaub } from '../../domain/urlaub.js';
import { datumLang, gruss, stundeInWien } from '../format-de.js';
import { einkaufModel } from './einkauf-model.js';
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

const GLEICH_MIN = 30; // so kurz vor Beginn heißt es „gleich“
const DAUER_MIN = 30; // so lange gilt ein Termin nach Beginn als „läuft gerade“

function minutenText(minuten) {
  const stunden = Math.floor(minuten / 60);
  const rest = minuten % 60;
  if (stunden === 0) return `${rest} Min`;
  return rest === 0 ? `${stunden} Std` : `${stunden} Std ${rest} Min`;
}

/** Wo steht ein Termin von heute zur Uhrzeit `now`? { zeitStatus: 'ganztags'|'spaeter'|'gleich'|'laeuft'|'vorbei', inText } */
function zeitStatus(termin, now) {
  if (!termin.time) return { zeitStatus: 'ganztags', inText: 'ganztägig' };
  let beginn;
  try {
    beginn = wienZuInstant(termin.date, termin.time);
  } catch {
    return { zeitStatus: 'ganztags', inText: 'ganztägig' };
  }
  const diff = (beginn - now.getTime()) / 60_000; // Minuten bis zum Beginn (negativ: schon begonnen)
  if (diff >= GLEICH_MIN) return { zeitStatus: 'spaeter', inText: `in ${minutenText(Math.ceil(diff))}` };
  if (diff > 0) return { zeitStatus: 'gleich', inText: `gleich · in ${Math.ceil(diff)} Min` };
  if (diff >= -DAUER_MIN) return { zeitStatus: 'laeuft', inText: 'läuft gerade' };
  return { zeitStatus: 'vorbei', inText: 'vorbei' };
}

/** Termine von heute mit Zeitstatus; der erste noch nicht vorbeigegangene Termin mit Uhrzeit ist `naechster`. */
function termineMitStatus(liste, now) {
  const mit = liste.map((t) => ({ ...t, ...zeitStatus(t, now) }));
  const erster = mit.find((t) => ['spaeter', 'gleich', 'laeuft'].includes(t.zeitStatus));
  return mit.map((t) => ({ ...t, naechster: t === erster }));
}

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
    termineHeute: termineMitStatus(termineAm(state, heute).filter(keineSache), now),
    termineMorgen: termineAm(state, addDays(heute, 1)).filter(keineSache),
    termineDemnaechst: naechsteTermine(state, addDays(heute, 1), 3),
    sachen: sachenModel(state, heute),
    einkauf: einkaufModel(state),
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
