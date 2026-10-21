// Seite „Schichtplan“: ein Monat mit zwei Streifen je Tag (oben Papa, unten Mama), Monatswechsel, Filter „Beide · Papa · Mama“
// (gemerkt auf diesem Telefon), Zählung je Person und Legende. Ein Tipp auf einen Tag öffnet das Tagesblatt (ui.schichtTag).
import { h } from './dom.js';
import { datumLang } from '../app/format-de.js';
import { FEIERTAG_EMOJI } from '../app/views/gemeinsam.js';
import { schichtMonatModel } from '../app/views/schicht-model.js';

const PERSON = { papa: { name: 'Papa', emoji: '👨' }, mama: { name: 'Mama', emoji: '👩' } };
const FILTER = [
  ['beide', 'Beide'],
  ['papa', '👨 Papa'],
  ['mama', '👩 Mama'],
];

/** Ein Streifen: Farbe der Art und ihr Kürzel (nie nur Farbe), ☾ bei Nacht, Urlaub zusätzlich gestreift; frei = gepunkteter Rahmen. */
function streifenKnoten(person, s) {
  if (!s) return h('span', { class: `sp-streifen ${person} leer`, 'aria-hidden': 'true' });
  const klassen = ['sp-streifen', person, `sf-${s.farbe}`, s.urlaub ? 'urlaub' : '', s.unbekannt ? 'unbekannt' : ''];
  return h('span', { class: klassen.filter(Boolean).join(' '), 'aria-hidden': 'true' }, s.kuerzel, s.nacht ? h('span', { class: 'sp-mond' }, '☾') : null);
}

/** Vorlesetext eines Tages: „Montag, 5. Oktober: Papa Frühdienst, Mama frei“ (+ Feiertag, Zusatz, Notiz). */
function beschriftung(z, personen) {
  const kopf = `${datumLang(z.datum)}${z.feiertag ? `, ${z.feiertag}` : ''}`;
  const teile = personen.map((p) => `${PERSON[p].name} ${z.streifen[p]?.name ?? 'frei'}`);
  if (z.zusatz) teile.push(`Zusatz ${z.zusatz.kuerzel}${z.zusatz.weitere > 0 ? ` und ${z.zusatz.weitere} weitere` : ''}`);
  if (z.notiz) teile.push('mit Notiz');
  return `${kopf}: ${teile.join(', ')}`;
}

function zelle(z, m, ui) {
  if (!z.imMonat) return h('span', { class: 'sp-leer-feld', 'aria-hidden': 'true' });
  const klassen = ['sp-zelle', z.wochenende ? 'we' : '', z.istHeute ? 'heute' : '', z.feiertag ? 'feiertag' : ''];
  return h(
    'button',
    {
      class: klassen.filter(Boolean).join(' '),
      type: 'button',
      'data-datum': z.datum,
      'aria-label': beschriftung(z, m.personen),
      'aria-current': z.istHeute ? 'date' : null,
      onClick: () => {
        if (!ui.schicht.pinsel) ui.schichtTag?.(z.datum); // mit dem Pinsel trägt der Tipp stattdessen ein
      },
    },
    h(
      'span',
      { class: 'sp-zkopf', 'aria-hidden': 'true' },
      h('span', { class: 'nr' }, z.tag),
      z.feiertag ? h('span', { class: 'sp-feiertag', title: z.feiertag }, FEIERTAG_EMOJI) : null,
      z.zusatz || z.notiz
        ? h(
            'span',
            { class: 'sp-marken' }, // bleiben beisammen rechts; ist der Tag sehr voll, rutschen sie gemeinsam in eine zweite Zeile
            z.zusatz ? h('span', { class: `sp-zusatz sf-${z.zusatz.farbe}` }, z.zusatz.kuerzel) : null,
            z.zusatz?.weitere > 0 ? h('span', { class: 'sp-mehr' }, `+${z.zusatz.weitere}`) : null,
            z.notiz ? h('span', { class: 'sp-notiz' }, '✎') : null,
          )
        : null,
    ),
    m.personen.map((p) => streifenKnoten(p, z.streifen[p])),
  );
}

function legendeEintrag(e) {
  const klassen = ['sp-lg-kuerzel', `sf-${e.farbe}`, e.urlaub ? 'urlaub' : ''];
  return h('span', { class: 'sp-lg' }, h('i', { class: klassen.filter(Boolean).join(' ') }, e.kuerzel), e.text);
}

export function schichtScreen({ store, ui }) {
  const m = schichtMonatModel(store.getState(), ui.schicht.jm, { heute: store.heute(), filter: ui.schicht.filter });
  const rund = (zeichen, text, ziel) => h('button', { class: 'rund', type: 'button', 'aria-label': text, onClick: () => ui.setzeSchichtMonat(ziel) }, zeichen);
  const personZeile = (p, inhalt) => h('div', { class: 'sp-person-zeile' }, h('b', {}, `${PERSON[p].emoji} ${PERSON[p].name}`), inhalt);

  return h(
    'section',
    { class: 'screen schicht-seite' },
    h(
      'header',
      { class: 'kopf sp-kopf' },
      h('h1', { class: 'gruss' }, '🗓️ Schichtplan'),
      h('button', { class: 'chip sp-eintragen', type: 'button' }, '✏️ Eintragen'), // der Pinsel (Leiste zum schnellen Eintragen) hängt sich hier an
    ),
    h('div', { class: 'monat-kopf sp-monat' }, rund('‹', 'Vorheriger Monat', m.vorher), h('h2', {}, m.titel), rund('›', 'Nächster Monat', m.nachher)),
    h(
      'div',
      { class: 'chips sp-filter', role: 'group', 'aria-label': 'Wen anzeigen' },
      FILTER.map(([wert, text]) =>
        h('button', { class: `chip ${m.filter === wert ? 'aktiv' : ''}`.trim(), type: 'button', 'aria-pressed': m.filter === wert ? 'true' : 'false', onClick: () => ui.setzeSchichtFilter(wert) }, text),
      ),
    ),
    m.geladen
      ? [
          h('div', { class: 'wochentage', 'aria-hidden': 'true' }, m.wochentage.map((t) => h('span', {}, t))),
          h('div', { class: `sp-raster ${m.personen.length === 1 ? 'eine-person' : ''}`.trim() }, m.zellen.map((z) => zelle(z, m, ui))),
          h('article', { class: 'karte sp-zaehlung' }, m.personen.map((p) => personZeile(p, h('span', {}, m.zaehlung[p])))),
        ]
      : h('article', { class: 'karte hinweis sp-nicht-geladen' }, h('p', {}, m.laedt ? 'Schichtplan wird geladen …' : 'Noch nicht geladen – bitte verbinden.')),
    h(
      'article',
      { class: 'karte sp-legende' },
      m.personen.map((p) => personZeile(p, h('div', { class: 'sp-lg-liste' }, m.legende[p].map(legendeEintrag)))),
      h('div', { class: 'sp-lg-liste' }, h('span', { class: 'sp-lg' }, '✎ Notiz'), h('span', { class: 'sp-lg' }, '☾ Nacht bis zum Morgen'), h('span', { class: 'sp-lg' }, `${FEIERTAG_EMOJI} Feiertag`)),
    ),
    h('button', { class: 'knopf sp-arten', type: 'button', onClick: () => ui.schichtArten?.() }, 'Schichtarten bearbeiten'),
  );
}
