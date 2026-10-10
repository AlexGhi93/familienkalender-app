import { h } from './dom.js';
import { bestaetigen, blatt, chip, farbe, toast } from './components.js';
import { tagModel } from '../app/views/tag-model.js';
import { datumLang } from '../app/format-de.js';
import { sacheErledigt, sacheLoeschen } from './sachen-aktionen.js';

function eintragZeile(e, { store, ui }, schliessen) {
  // Der Titel beginnt schon mit dem Emoji der Zeile; es steht links und nicht doppelt im Text.
  const text = e.art !== 'termin' ? e.text : e.titel.startsWith(e.emoji) ? e.titel.slice(e.emoji.length).trimStart() : e.titel;
  return h(
    'div',
    { class: `zeile ${e.farbe ? 'tint' : ''}`.trim(), style: e.farbe ? farbe(e.farbe) : null },
    h('span', { class: 'emoji' }, e.emoji),
    h('div', { class: 'zeile-text' }, h('b', {}, text), e.art === 'termin' && e.notiz ? h('small', { class: 'notiz' }, `📝 ${e.notiz}`) : null),
    e.art === 'termin' && e.typ === 'kita_sache'
      ? h(
          'div',
          { class: 'knopfspalte' },
          h('button', { class: 'knopf klein primaer', type: 'button', onClick: () => sacheErledigt(store, e.id) }, 'Erledigt ✓'),
          h(
            'button',
            {
              class: 'knopf klein',
              type: 'button',
              onClick: () => {
                schliessen();
                ui.terminBearbeiten(e.id);
              },
            },
            'Ändern',
          ),
          h('button', { class: 'knopf klein', type: 'button', onClick: () => sacheLoeschen(store, e) }, 'Löschen'),
        )
      : null,
    e.art === 'termin' && e.typ !== 'kita_sache'
      ? h(
          'div',
          { class: 'knopfspalte' },
          h(
            'button',
            {
              class: 'knopf klein',
              type: 'button',
              onClick: () => {
                schliessen();
                ui.terminBearbeiten(e.id);
              },
            },
            'Ändern',
          ),
          h(
            'button',
            {
              class: 'knopf klein',
              type: 'button',
              onClick: () =>
                bestaetigen({
                  titel: 'Termin löschen?',
                  text: `${e.label}${e.time ? ` um ${e.time}` : ''} wird entfernt.`,
                  ja: 'Termin löschen',
                  gefahr: true,
                  beiJa: async () => {
                    await store.terminLoeschen(e.id);
                    toast('Termin gelöscht');
                  },
                }),
            },
            'Löschen',
          ),
        )
      : null,
    e.art === 'urlaub'
      ? h(
          'button',
          {
            class: 'knopf klein',
            type: 'button',
            onClick: () =>
              bestaetigen({
                titel: 'Urlaub löschen?',
                text: 'Der ganze Urlaubszeitraum wird entfernt, nicht nur dieser Tag.',
                ja: 'Urlaub löschen',
                gefahr: true,
                beiJa: async () => {
                  await store.urlaubLoeschen(e.id);
                  toast('Urlaub gelöscht');
                },
              }),
          },
          'Löschen',
        )
      : null,
  );
}

/** Blatt für einen Tag: was eingetragen ist, was man setzen kann und was man an diesem Tag neu eintragen kann. */
export function oeffneTagesblatt(ctx, date) {
  const { store, ui } = ctx;
  let abmelden = () => {};
  const b = blatt({
    titel: datumLang(date),
    beimSchliessen: () => abmelden(),
    render: ({ schliessen }) => {
      const m = tagModel(store.getState(), date, store.heute());
      const setze = async (typ) => {
        await store.setTag(date, typ);
        toast('Gespeichert ✓');
      };
      return [
        m.konflikt ? h('div', { class: 'konflikt-hinweis', role: 'alert' }, h('b', {}, '⚠️ Konflikt'), h('p', {}, m.konflikt.hinweis)) : null,
        m.eintraege.length > 0
          ? h('div', { class: 'liste' }, m.eintraege.map((e) => eintragZeile(e, ctx, schliessen)))
          : h('p', { class: 'leise' }, 'Noch nichts eingetragen.'),
        h('h3', {}, 'Eintragen'),
        h(
          'div',
          { class: 'chip-reihe' },
          m.aktionen.map((a) => chip(`${a.emoji} ${a.text}`, { art: a.aktiv ? 'aktiv' : '', farbeHex: a.farbe, onClick: () => setze(a.typ) })),
        ),
        m.imUrlaub ? h('p', { class: 'leise' }, 'Dieser Tag liegt im Urlaub; der Urlaub hat Vorrang.') : null,
        m.aktuellerTyp
          ? h(
              'div',
              { class: 'knopfzeile rechts' },
              h(
                'button',
                {
                  class: 'knopf klein',
                  type: 'button',
                  onClick: async () => {
                    await store.loescheTag(date);
                    toast('Eintrag gelöscht');
                  },
                },
                'Eintrag löschen',
              ),
            )
          : null,
        h('h3', {}, 'Neu an diesem Tag'),
        h(
          'div',
          { class: 'chip-reihe' },
          m.neu.map((n) =>
            chip(`${n.emoji} ${n.text}`, {
              farbeHex: n.farbe,
              onClick: () => {
                schliessen();
                ui.neuTerminStarten(n.art, null, { datum: date }); // das Formular beginnt mit diesem Tag
              },
            }),
          ),
        ),
      ];
    },
  });
  abmelden = store.subscribe(() => b.neuZeichnen());
  return b;
}
