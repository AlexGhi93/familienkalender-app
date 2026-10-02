import { fuelle, h } from './dom.js';
import { chip, farbe, toast, wochenStepper } from './components.js';
import { TYPES } from '../domain/types.js';
import { WOCHENTAGE_KURZ } from '../app/format-de.js';
import { MAX_SERIEN_WOCHEN, naechsterWochentag, serieZusammenfassung, wochenSerie } from '../app/serie.js';

/** Schnellstart: jede Woche „Pyjamas hinbringen“ (sauber) und „Pyjamas heimholen“ (zum Waschen). */
export function pyjamasWechsel({ store, ui }) {
  const p = { hinTag: 0, heimTag: 4, wochen: 8 };
  const wurzel = h('div', { class: 'karte tint pyjamas', style: farbe(TYPES.kita_sache.farbe) });

  function plaene() {
    const state = store.getState();
    const heute = store.heute();
    const plan = (richtung, tag) => wochenSerie(state, { start: naechsterWochentag(heute, tag), wochen: p.wochen, richtung, heute });
    return { hin: plan('hin', p.hinTag), heim: plan('heim', p.heimTag) };
  }

  function tagWahl(beschriftung, schluessel) {
    return h(
      'div',
      { class: 'feld' },
      h('span', {}, beschriftung),
      h(
        'div',
        { class: 'chip-reihe' },
        WOCHENTAGE_KURZ.slice(0, 5).map((name, i) =>
          chip(name, {
            art: p[schluessel] === i ? 'aktiv' : '',
            farbeHex: TYPES.kita_sache.farbe,
            onClick: () => {
              p[schluessel] = i;
              zeichnen();
            },
          }),
        ),
      ),
    );
  }

  async function einrichten() {
    try {
      const r = await store.pyjamasWechselSpeichern({ hinTag: p.hinTag, heimTag: p.heimTag, wochen: p.wochen });
      toast(`${r.ids.length} Erinnerungen eingerichtet ✓`);
      ui.neuZuruecksetzen();
      ui.gehZu('heute');
    } catch (fehler) {
      toast(fehler.message);
    }
  }

  function zeichnen() {
    let hin;
    let heim;
    let fehler = null;
    try {
      ({ hin, heim } = plaene());
    } catch (e) {
      fehler = e.message;
    }
    fuelle(
      wurzel,
      h('h3', {}, '🛏️ Pyjamas-Wechsel'),
      h('p', { class: 'leise' }, 'Saubere Pyjamas hinbringen, gebrauchte zum Waschen mit nach Hause nehmen: jede Woche, für die gewählte Anzahl Wochen. Feiertage und Urlaub werden berücksichtigt.'),
      tagWahl('Hinbringen am', 'hinTag'),
      tagWahl('Heimholen am', 'heimTag'),
      wochenStepper({
        wert: p.wochen,
        min: 2,
        max: MAX_SERIEN_WOCHEN,
        beschriftung: 'Wochen',
        beiAenderung: (w) => {
          p.wochen = w;
          zeichnen();
        },
      }),
      fehler
        ? h('p', { class: 'leise' }, fehler)
        : h('div', { class: 'info' }, h('p', {}, `Hinbringen: ${serieZusammenfassung(hin)}`), h('p', {}, `Heimholen: ${serieZusammenfassung(heim)}`)),
      h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: einrichten }, 'Einrichten')),
    );
  }

  zeichnen();
  return wurzel;
}
