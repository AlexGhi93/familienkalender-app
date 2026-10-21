// Pinsel des Schichtplans: eine feste Leiste über den Registerkarten (Papa | Mama, die Arten der Person, „– Frei“, „Fertig“).
// Art wählen, dann Tage antippen; jeder Tipp wird sofort gespeichert, eine Meldung gibt es nur bei Fehlern.
import { h } from './dom.js';
import { toast } from './components.js';
import { pinselAktion, pinselModel, pinselStart } from '../app/views/schicht-model.js';

const PERSONEN = [
  ['papa', '👨 Papa'],
  ['mama', '👩 Mama'],
];

/** Öffnet den Pinsel (Person nach Filter, erste aktive Art) bzw. schließt ihn. */
export function pinselUmschalten({ store, ui }) {
  ui.schicht.pinsel = ui.schicht.pinsel ? null : pinselStart(store.getState(), ui.schicht.filter);
  ui.rendern();
}

/** Ein Tipp auf den Tag `datum` ('JJJJ-MM-TT') mit dem gewählten Pinsel. */
export function pinselTippen({ store }, pinsel, datum) {
  const jm = datum.slice(0, 7);
  const tag = Number(datum.slice(8));
  const state = store.getState();
  const { person, k } = pinselModel(state, pinsel); // eine inzwischen archivierte Art: wie angezeigt die erste aktive
  const a = pinselAktion(state, jm, tag, { person, k });
  if (!a) return;
  const aufrufe = {
    setzen: () => store.schichtSetzen(jm, tag, person, null),
    pinsel: () => store.schichtPinsel(jm, tag, person, a.k),
    zusatzDazu: () => store.schichtZusatzHinzufuegen(jm, tag, person, { k: a.k, von: a.von, bis: a.bis }),
    zusatzWeg: () => store.schichtZusatzEntfernen(jm, tag, person, { k: a.k, von: a.von, bis: a.bis }),
  };
  // Speicherfehler meldet der Store selbst (und nimmt nur diesen Tipp zurück); hier landen abgelehnte Änderungen, z. B. „Höchstens 3 Zusätze pro Tag.“
  aufrufe[a.aktion]().catch((fehler) => toast(fehler?.message ?? 'Das hat nicht geklappt. Bitte noch einmal versuchen.', { art: 'fehler' }));
}

/**
 * Die Seite braucht unten Platz für die Leiste, sonst verschwinden die letzten Tage dahinter. Die gemessene Höhe steht in
 * `--pinsel-hoehe` an der Wurzel: so ist sie beim Neuzeichnen nach jedem Tipp sofort da und die Seite springt nicht.
 */
function hoeheMerken(leiste) {
  if (typeof ResizeObserver === 'undefined') return;
  const beobachter = new ResizeObserver(() => {
    if (!leiste.isConnected) {
      beobachter.disconnect();
      return;
    }
    document.documentElement.style.setProperty('--pinsel-hoehe', `${Math.ceil(leiste.getBoundingClientRect().height)}px`);
  });
  beobachter.observe(leiste);
}

export function pinselLeiste({ store, ui }) {
  const p = pinselModel(store.getState(), ui.schicht.pinsel);
  const waehle = (k) => {
    ui.schicht.pinsel = { person: p.person, k };
    ui.rendern();
  };
  const artKnopf = (gewaehlt, kuerzelKlasse, kuerzel, name, k) =>
    h(
      'button',
      { class: `sp-pinsel-art ${gewaehlt ? 'aktiv' : ''}`.trim(), type: 'button', 'aria-pressed': gewaehlt ? 'true' : 'false', onClick: () => waehle(k) },
      h('i', { class: `sp-pinsel-kuerzel ${kuerzelKlasse}` }, kuerzel),
      ' ',
      name,
    );

  const leiste = h(
    'section',
    { class: 'sp-pinsel', 'aria-label': 'Pinsel: Schichten eintragen' },
    h(
      'div',
      { class: 'sp-pinsel-kopf' },
      h(
        'div',
        { class: 'sp-pinsel-wer', role: 'group', 'aria-label': 'Für wen' },
        PERSONEN.map(([person, text]) =>
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': p.person === person ? 'true' : 'false',
              onClick: () => {
                if (p.person === person) return;
                ui.schicht.pinsel = pinselStart(store.getState(), person);
                ui.rendern();
              },
            },
            text,
          ),
        ),
      ),
      h('button', { class: 'sp-pinsel-fertig', type: 'button', onClick: () => pinselUmschalten({ store, ui }) }, 'Fertig'),
    ),
    h(
      'div',
      { class: 'sp-pinsel-arten', role: 'group', 'aria-label': 'Schichtart' },
      p.arten.map((a) => artKnopf(a.gewaehlt, `sf-${a.farbe}${a.urlaub ? ' urlaub' : ''}`, a.kuerzel, a.name, a.k)),
      artKnopf(p.frei, 'frei', '–', 'Frei', null),
    ),
    h('p', { class: 'sp-pinsel-hinweis' }, p.hinweis),
  );
  hoeheMerken(leiste);
  return leiste;
}
