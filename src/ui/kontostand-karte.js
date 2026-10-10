// „Mehr“ → Menü-Zeile „Kontostand“: Kurzstand, Weg zur Seite und die Uhrzeit der Erinnerung am letzten Tag des Monats.
import { h } from './dom.js';
import { zeitFeld } from './eingabefelder.js';
import { toast } from './components.js';
import { kontoModel } from '../app/views/konto-model.js';

export function kontostandInhalt({ store, ui, settings, speichern }) {
  const m = kontoModel(store.getState(), store.heute(), { demo: ui.konto?.modus === 'demo' });
  const letzte = m.zeilen.find((z) => z.zusammen?.veraenderung);
  const kurz = letzte
    ? `Zuletzt (${letzte.monatText}): ${letzte.zusammen.veraenderung.text} zusammen.`
    : m.leer
      ? `Noch keine Kontostände. ${m.eintrag ? 'Heute kann der erste Stand eingetragen werden.' : m.naechster.replace('Eintragen ist nur am letzten Tag des Monats möglich – nächster Termin', 'Der erste Stand kann eingetragen werden am')}.`
      : 'Ab dem zweiten Monatsende zeigt die Seite, wie viel ihr gespart habt.';
  return [
    h('p', { class: 'leise' }, 'Papa und Mama tragen am letzten Tag des Monats ihren Gesamtstand ein. Daraus ergibt sich, wie viel ihr pro Monat spart.'),
    h('p', {}, kurz),
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: () => ui.gehZu('konto') }, 'Kontostand öffnen')),
    h(
      'div',
      { class: 'feld' },
      h('span', {}, 'Erinnerung am letzten Tag um'),
      zeitFeld({ wert: settings.kontoErinnerung, beschriftung: 'Erinnerung am letzten Tag des Monats', erstBeiFertig: true, beiAenderung: (w) => speichern({ kontoErinnerung: w }) }),
      h('small', { class: 'leise' }, 'Die App erinnert euch am letzten Tag (und drei Stunden später noch einmal, falls jemand fehlt). Leer lassen = aus.'),
    ),
  ];
}
