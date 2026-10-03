// Urlaubsstand eines Kindergartenjahres für „Heute“ und die Urlaub-Seite (mit Jahreswahl): rein, ohne DOM.
import { urlaubStatus, naechsterUrlaub } from '../../domain/urlaub.js';
import { schliessTageListe } from './gemeinsam.js';

export const JAHR_OFFSET_MIN = -3; // so viele Jahre zurück …
export const JAHR_OFFSET_MAX = 6; // … und voraus lässt sich blättern

const jahrKurz = (id) => `${id}/${String(id + 1).slice(2)}`;

/**
 * `jahrOffset`: 0 = Kindergartenjahr von `heute`, -1 = Vorjahr, 1 = nächstes Jahr (begrenzt; Unsinn gilt als 0).
 * Ergebnis: Stand (ziel, genommen, geplant, offen, durchgehend), Beschriftung, das Jahr (`jahr.start`/`jahr.end`, zum Nachladen)
 * und die Urlaub-Zeiträume, die dieses Jahr berühren (auch solche, die über den Jahreswechsel gehen).
 */
export function urlaubModel(state, heute, jahrOffset = 0) {
  const offset = Number.isInteger(jahrOffset) ? Math.min(JAHR_OFFSET_MAX, Math.max(JAHR_OFFSET_MIN, jahrOffset)) : 0;
  const spans = state.urlaub.map(({ start, end }) => ({ start, end }));
  const status = urlaubStatus({ spans, schliessTage: schliessTageListe(state), settings: state.settings, today: heute, jahrOffset: offset });
  const { jahr } = status;
  return {
    jahrOffset: offset,
    istAktuell: offset === 0,
    hatVorher: offset > JAHR_OFFSET_MIN,
    hatNachher: offset < JAHR_OFFSET_MAX,
    jahr: { start: jahr.start, end: jahr.end },
    kurz: jahrKurz(jahr.id),
    jahrText: `Kindergartenjahr ${jahrKurz(jahr.id)}`,
    ziel: status.ziel,
    genommen: status.genommen,
    geplant: status.geplant,
    offen: status.offen,
    durchgehend: status.durchgehend,
    zeitraeume: [...state.urlaub].filter((u) => u.start <= jahr.end && u.end >= jahr.start).sort((a, b) => a.start.localeCompare(b.start)),
  };
}

/** Nächster Urlaub nach heute (für den Countdown auf „Heute“). */
export const urlaubCountdown = (state, heute) => naechsterUrlaub(state.urlaub.map(({ start, end }) => ({ start, end })), heute);
