// „Mehr“ → Menü-Zeile „Nachrichten“: Kontakt der Krabbelstube bzw. des Kindergartens, Grußformel und Unterschrift für die
// fertigen Nachrichten (src/ui/nachricht-blatt.js). Gibt nur den Inhalt zurück; Titel und Rahmen kommen von der Menü-Zeile.
import { h } from './dom.js';
import { chip } from './components.js';
import { einstellungsFeld } from './einstellungs-feld.js';
import { oeffneNachricht } from './nachricht-blatt.js';
import { anredeEingabe, einrichtungsFormen, emailEingabe, standardUnterschrift, telefonEingabe, unterschriftEingabe } from '../app/nachrichten.js';
import { einrichtungFor } from '../domain/modus.js';
import { GRUSSFORMELN, MAX_ANREDE, MAX_EMAIL, MAX_TELEFON, MAX_UNTERSCHRIFT } from '../domain/settings.js';

export function nachrichtenInhalt({ store, ui, settings, speichern }) {
  const formen = einrichtungsFormen(einrichtungFor(store.heute(), settings));
  const gruss = (g) => chip(g, { art: settings.nachrichtGruss === g ? 'aktiv' : '', onClick: () => speichern({ nachrichtGruss: g }) });
  return [
    h('p', { class: 'leise' }, `Fertige Nachrichten ${formen.an}: krank, Ruhetag, Familienausflug, später bringen, früher abholen … jeweils kurz, ausführlich oder herzlich. Vor dem Senden kannst du jeden Text noch ändern.`),
    einstellungsFeld({
      id: 'einrichtungTelefon',
      beschriftung: 'Telefon',
      hinweis: 'Für WhatsApp und SMS. Ohne Ländervorwahl wird Österreich (+43) angenommen.',
      wert: settings.einrichtungTelefon,
      pruefen: telefonEingabe,
      speichern: (w) => speichern({ einrichtungTelefon: w }),
      attribute: { type: 'tel', inputmode: 'tel', maxlength: MAX_TELEFON, placeholder: 'z. B. 0664 1234567' },
    }),
    einstellungsFeld({
      id: 'einrichtungEmail',
      beschriftung: 'E-Mail',
      wert: settings.einrichtungEmail,
      pruefen: emailEingabe,
      speichern: (w) => speichern({ einrichtungEmail: w }),
      attribute: { type: 'email', inputmode: 'email', maxlength: MAX_EMAIL, autocapitalize: 'off', spellcheck: 'false', placeholder: 'z. B. gruppe@beispiel.at' },
    }),
    einstellungsFeld({
      id: 'nachrichtAnrede',
      beschriftung: 'Anrede',
      hinweis: `Steht am Anfang jeder Nachricht, das Komma kommt von selbst. Leer lassen = „Liebes ${formen.team}“.`,
      wert: settings.nachrichtAnrede,
      pruefen: anredeEingabe,
      speichern: (w) => speichern({ nachrichtAnrede: w }),
      attribute: { maxlength: MAX_ANREDE, autocapitalize: 'sentences', placeholder: `Liebes ${formen.team}` },
    }),
    h('div', { class: 'feld' }, h('span', {}, 'Grußformel'), h('div', { class: 'chip-reihe' }, GRUSSFORMELN.map(gruss))),
    einstellungsFeld({
      id: 'nachrichtUnterschrift',
      beschriftung: 'Unterschrift',
      hinweis: `Steht unter jeder Nachricht. Leer lassen = „${standardUnterschrift(settings.kindname)}“.`,
      wert: settings.nachrichtUnterschrift,
      pruefen: unterschriftEingabe,
      speichern: (w) => speichern({ nachrichtUnterschrift: w }),
      attribute: { maxlength: MAX_UNTERSCHRIFT, autocapitalize: 'sentences', placeholder: standardUnterschrift(settings.kindname) },
    }),
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: () => oeffneNachricht({ store, ui }) }, 'Nachricht schreiben')),
  ];
}
