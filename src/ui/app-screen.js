// „Konto & App“: alles, was das Konto und dieses Telefon betrifft (Google, Erinnerungen, Darstellung, Sicherung, Zurücksetzen). Erreichbar von „Mehr“.
import { fuelle, h } from './dom.js';
import { bestaetigen, chip, toast } from './components.js';
import { VERSION } from '../app/version.js';
import { kontoKarten } from './konto-karte.js';
import { erinnerungenKarte } from './erinnerungen-karte.js';
import { leseDarstellung, wendeDarstellungAn } from './darstellung.js';
import { sichernKarte } from './sichern-karte.js';

const DARSTELLUNG_TEXTE = [['auto', 'Automatisch'], ['hell', '☀️ Hell'], ['dunkel', '🌙 Dunkel']];

function darstellungKarte() {
  const box = h('div', { class: 'chip-reihe' });
  function zeichne() {
    const aktuell = leseDarstellung();
    fuelle(
      box,
      ...DARSTELLUNG_TEXTE.map(([wahl, text]) =>
        chip(text, {
          art: aktuell === wahl ? 'aktiv' : '',
          onClick: () => {
            wendeDarstellungAn(wahl);
            zeichne();
          },
        }),
      ),
    );
  }
  zeichne();
  return h('article', { class: 'karte' }, h('h3', {}, 'Darstellung'), h('p', { class: 'leise' }, 'Automatisch folgt dem Telefon. Die Wahl gilt nur für dieses Telefon.'), box);
}

function demoKarte({ store }) {
  return h(
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
  );
}

export function appScreen({ store, ui }) {
  const konto = kontoKarten({ store, ui });
  return h(
    'section',
    { class: 'screen' },
    h('button', { class: 'zurueck', type: 'button', onClick: () => ui.gehZu('mehr') }, '‹ Zurück'),
    h('h1', { class: 'gruss' }, 'Konto & App 👤'),
    h('p', { class: 'datum' }, 'Verbindung mit Google, Erinnerungen, Darstellung und Sicherung.'),
    ...konto.oben,
    ui.konto?.modus === 'google' ? erinnerungenKarte({ store, ui }) : null,
    darstellungKarte(),
    sichernKarte({ store }),
    ui.konto?.modus === 'demo' ? demoKarte({ store }) : null,
    ...konto.unten,
    h('p', { class: 'version' }, `Familienkalender ${VERSION}`),
  );
}
