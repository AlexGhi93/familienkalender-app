import { h } from './dom.js';
import { bestaetigen, farbe, toast, urlaubRing } from './components.js';
import { heuteModel } from '../app/views/heute-model.js';
import { urlaubstageImZeitraum } from '../app/views/neu-model.js';
import { datumKurz } from '../app/format-de.js';
import { werktageText } from '../domain/format.js';
import { TYPES } from '../domain/types.js';

function zeitraumZeile(u, heute, store) {
  const tage = urlaubstageImZeitraum(u);
  const status = u.end < heute ? 'vorbei' : u.start <= heute ? 'jetzt' : 'geplant';
  return h(
    'div',
    { class: 'zeile tint', style: farbe(TYPES.urlaub.farbe) },
    h('span', { class: 'emoji' }, '✈️'),
    h('div', { class: 'zeile-text' }, h('b', {}, u.start === u.end ? datumKurz(u.start) : `${datumKurz(u.start)} – ${datumKurz(u.end)}`), h('small', {}, `${tage} ${tage === 1 ? 'Urlaubstag' : 'Urlaubstage'} · ${status}`)),
    h(
      'button',
      {
        class: 'knopf klein',
        type: 'button',
        onClick: () =>
          bestaetigen({
            titel: 'Urlaub löschen?',
            text: `${datumKurz(u.start)} bis ${datumKurz(u.end)} wird entfernt.`,
            ja: 'Urlaub löschen',
            gefahr: true,
            beiJa: async () => {
              await store.urlaubLoeschen(u.id);
              toast('Urlaub gelöscht');
            },
          }),
      },
      'Löschen',
    ),
  );
}

export function urlaubScreen({ store, ui }) {
  const m = heuteModel(store.getState(), store.jetzt());
  const u = m.urlaub;
  const zeitraeume = [...store.getState().urlaub].sort((a, b) => a.start.localeCompare(b.start));
  const wochenZiel = u.durchgehend.ziel / 5;
  return h(
    'section',
    { class: 'screen' },
    h('h1', { class: 'gruss' }, 'Urlaub 🏖️'),
    h('p', { class: 'datum' }, u.jahrText),
    h(
      'article',
      { class: 'karte gross-ring' },
      urlaubRing({ genommen: u.genommen, geplant: u.geplant, ziel: u.ziel, groesse: 110 }),
      h('div', { class: 'ring-text' }, h('b', {}, u.offen === 0 ? 'Alles eingetragen 🎉' : `Noch ${werktageText(u.offen)} offen`), h('small', {}, `Genommen: ${werktageText(u.genommen)}`), h('small', {}, `Geplant: ${werktageText(u.geplant)}`), wochenZiel > 0 ? h('small', {}, `${u.durchgehend.erfuellt ? '✅' : '❗'} ${wochenZiel} Wochen am Stück${u.durchgehend.erfuellt ? '' : ' noch offen'}`) : null),
    ),
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: () => ui.neuStarten('urlaub') }, 'Urlaub planen')),
    h('h2', { class: 'abschnitt-titel' }, 'Eingetragen'),
    zeitraeume.length > 0 ? h('div', { class: 'liste' }, zeitraeume.map((z) => zeitraumZeile(z, store.heute(), store))) : h('p', { class: 'leise' }, 'Noch kein Urlaub eingetragen.'),
  );
}
