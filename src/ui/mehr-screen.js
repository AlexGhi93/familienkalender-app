import { h } from './dom.js';
import { bestaetigen, chip, toast } from './components.js';
import { WOCHENTAGE_KURZ } from '../app/format-de.js';
import { VERSION } from '../app/version.js';

export function mehrScreen({ store }) {
  const settings = store.getState().settings;

  async function speichern(teil, text = 'Gespeichert ✓') {
    try {
      await store.einstellungen(teil);
      toast(text);
    } catch {
      toast('Das konnte nicht gespeichert werden.');
    }
  }

  const tage = h(
    'div',
    { class: 'chip-reihe' },
    WOCHENTAGE_KURZ.map((name, i) => {
      const aktiv = settings.erwartung.includes(i);
      return chip(name, {
        art: aktiv ? 'aktiv' : '',
        onClick: () => speichern({ erwartung: aktiv ? settings.erwartung.filter((x) => x !== i) : [...settings.erwartung, i] }),
      });
    }),
  );

  const datumsFeld = (beschriftung, wert, beiAenderung, hinweis) =>
    h(
      'label',
      { class: 'feld' },
      h('span', {}, beschriftung),
      h('input', { type: 'date', value: wert ?? '', onChange: (e) => beiAenderung(e.target.value || null) }),
      hinweis ? h('small', { class: 'leise' }, hinweis) : null,
    );

  const zeitFeld = (beschriftung, wert, beiAenderung) =>
    h('label', { class: 'feld' }, h('span', {}, beschriftung), h('input', { type: 'time', value: wert, required: true, onChange: (e) => beiAenderung(e.target.value) }));

  return h(
    'section',
    { class: 'screen' },
    h('h1', { class: 'gruss' }, 'Mehr ⚙️'),
    h(
      'article',
      { class: 'karte' },
      h('h3', {}, 'Betreuung'),
      h('p', { class: 'leise' }, 'An welchen Wochentagen geht dein Kind normalerweise hin? Daraus ergeben sich die Tage, die noch „offen“ sind.'),
      tage,
      datumsFeld('Erfassung ab', settings.erfassungAb, (w) => speichern({ erfassungAb: w }), 'Ab diesem Tag zählt die App „offene“ Tage.'),
      datumsFeld('Wechsel zum Kindergarten ab', settings.wechseldatum, (w) => speichern({ wechseldatum: w }), 'Ab diesem Tag heißt es „Kindergarten“ statt „Krabbelstube“.'),
    ),
    h(
      'article',
      { class: 'karte' },
      h('h3', {}, 'Zeiten für Sachen'),
      h('p', { class: 'leise' }, 'Zu dieser Uhrzeit meldet sich die Erinnerung (einen Tag und eine Stunde vorher).'),
      zeitFeld('Hinbringen um', settings.bringzeit, (w) => speichern({ bringzeit: w })),
      zeitFeld('Heimholen um', settings.abholzeit, (w) => speichern({ abholzeit: w })),
    ),
    h(
      'article',
      { class: 'karte' },
      h('h3', {}, 'Demo-Modus'),
      h('p', { class: 'leise' }, 'Du siehst Beispieldaten. Sie bleiben nur auf diesem Gerät und kommen nirgendwohin.'),
      h(
        'div',
        { class: 'knopfzeile' },
        h(
          'button',
          {
            class: 'knopf klein',
            type: 'button',
            onClick: () =>
              bestaetigen({
                titel: 'Demo zurücksetzen?',
                text: 'Alle Änderungen in der Demo gehen verloren und die Beispieldaten kommen frisch zurück.',
                ja: 'Zurücksetzen',
                gefahr: true,
                beiJa: async () => {
                  await store.zuruecksetzen();
                  toast('Demo zurückgesetzt');
                },
              }),
          },
          'Demo zurücksetzen',
        ),
      ),
    ),
    h('p', { class: 'version' }, `Familienkalender ${VERSION}`),
  );
}
