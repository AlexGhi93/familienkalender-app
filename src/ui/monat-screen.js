import { h } from './dom.js';
import { farbe } from './components.js';
import { monatModel } from '../app/views/monat-model.js';
import { WOCHENTAGE_KURZ, datumLang } from '../app/format-de.js';
import { TYPES } from '../domain/types.js';
import { FEIERTAG_FARBE } from '../app/views/gemeinsam.js';

function zelle(z, ui) {
  const klassen = ['zelle', z.imMonat ? '' : 'ausserhalb', z.istHeute ? 'heute' : '', z.farbe ? 'getoent' : '', z.wochenende ? 'we' : ''];
  return h(
    'button',
    {
      class: klassen.filter(Boolean).join(' '),
      type: 'button',
      style: z.farbe ? farbe(z.farbe) : null,
      'aria-label': `${datumLang(z.date)}${z.feiertag ? `, ${z.feiertag}` : ''}${z.sache ? ', Sachen für die Einrichtung' : ''}`,
      onClick: () => ui.tagesblatt(z.date),
    },
    h('span', { class: 'nr' }, z.tag),
    z.emoji ? h('i', {}, z.emoji) : null,
    z.arzt ? h('span', { class: 'punkt', 'aria-hidden': 'true' }, '🩺') : null,
    z.sache ? h('span', { class: 'punkt links', 'aria-hidden': 'true' }, '👕') : null,
  );
}

const LEGENDE = [
  ['Betreuung', TYPES.kita_essen.farbe],
  ['Abwesend', TYPES.abwesend.farbe],
  ['Krank', TYPES.krank.farbe],
  ['Urlaub', TYPES.urlaub.farbe],
  ['Arzttermin', TYPES.arzt.farbe],
  ['Sachen', TYPES.kita_sache.farbe],
  ['Feiertag', FEIERTAG_FARBE],
];

export function monatScreen({ store, ui }) {
  const m = monatModel(store.getState(), ui.monat.jahr, ui.monat.monat, store.heute());
  const rund = (zeichen, beschriftung, ziel) =>
    h('button', { class: 'rund', type: 'button', 'aria-label': beschriftung, onClick: () => ui.setzeMonat(ziel) }, zeichen);
  return h(
    'section',
    { class: 'screen' },
    h('div', { class: 'monat-kopf' }, rund('‹', 'Vorheriger Monat', m.vorher), h('h1', {}, m.titel), rund('›', 'Nächster Monat', m.nachher)),
    h('div', { class: 'wochentage', 'aria-hidden': 'true' }, WOCHENTAGE_KURZ.map((t) => h('span', {}, t))),
    h('div', { class: 'raster' }, m.wochen.flat().map((z) => zelle(z, ui))),
    h('div', { class: 'legende' }, LEGENDE.map(([text, hex]) => h('span', { style: farbe(hex) }, text))),
    h(
      'article',
      { class: 'karte statistik' },
      m.statistik.length > 0 ? m.statistik.map((zeile) => h('p', {}, zeile)) : h('p', { class: 'leise' }, 'In diesem Monat gibt es noch keine Einträge.'),
    ),
  );
}
