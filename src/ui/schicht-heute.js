// Karte „Dienst heute“ für die Seite Heute: je Person, die heute eigene Uhrzeiten für ihren Dienst hat (im Tagesblatt eingetragen), eine
// Zeile wie „👨 Papa · Schulung 08:00–16:00“. Ohne solche Zeiten gibt es keine Karte (null). Gebraucht wird der geladene Monat im Zustand.
import { h } from './dom.js';
import { schichtHeuteZeilen } from '../app/views/schicht-model.js';
import { mitZeiten } from './schicht-pinsel.js';

export function schichtHeuteKarte({ store }) {
  const zeilen = schichtHeuteZeilen(store.getState(), store.heute());
  if (zeilen.length === 0) return null;
  return h(
    'article',
    { class: 'karte sp-heute' },
    h('h3', { class: 'sp-heute-kopf' }, '🗓️ Dienst heute'),
    h(
      'ul',
      { class: 'sp-heute-liste' },
      zeilen.map((z) => h('li', { 'data-person': z.person }, h('b', {}, `${z.emoji} ${z.name}`), ' ', h('span', {}, mitZeiten(z.text)))),
    ),
  );
}
