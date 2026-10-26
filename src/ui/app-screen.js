// „Konto & App“: alles, was das Konto und dieses Telefon betrifft (Google, Erinnerungen, Darstellung, Sicherung, Zurücksetzen). Erreichbar von „Mehr“.
import { fuelle, h } from './dom.js';
import { bestaetigen, chip, toast } from './components.js';
import { VERSION } from '../app/version.js';
import { kontoKarten } from './konto-karte.js';
import { erinnerungenKarte } from './erinnerungen-karte.js';
import { leseAussehen, leseBewegung, leseDarstellung, wendeAussehenAn, wendeBewegungAn, wendeDarstellungAn } from './darstellung.js';
import { sichernKarte } from './sichern-karte.js';

const DARSTELLUNG_TEXTE = [['auto', 'Automatisch'], ['hell', '☀️ Hell'], ['dunkel', '🌙 Dunkel']];
/** Aussehen mit Namen und drei Farbtupfen als kleine Vorschau (die Farben stehen in theme.css unter .aussehen-vorschau). */
const AUSSEHEN_TEXTE = [['klassisch', 'Klassisch'], ['glas', 'Glas & Licht'], ['bento', 'Bento bunt']];
const BEWEGUNG_TEXTE = [['an', 'An'], ['reduziert', 'Reduziert']];

/**
 * Eine Reihe Chips für eine Wahl dieses Telefons; tippen wendet sofort an und zeichnet nur die Reihe neu. Markiert ist, was gerade gilt
 * (auch wenn der Speicher gesperrt ist und die Wahl deshalb nur bis zum Neuladen hält).
 */
function wahlReihe(name, texte, { lese, wendeAn, inhalt = (wahl, text) => text }) {
  const box = h('div', { class: 'chip-reihe', role: 'group', 'aria-label': name });
  let aktuell = lese();
  function zeichne() {
    fuelle(
      box,
      ...texte.map(([wahl, text]) =>
        chip(inhalt(wahl, text), {
          art: aktuell === wahl ? 'aktiv' : '',
          onClick: () => {
            aktuell = wendeAn(wahl);
            zeichne();
          },
        }),
      ),
    );
  }
  zeichne();
  return box;
}

const aussehenVorschau = (wahl) =>
  h('span', { class: `aussehen-vorschau ${wahl}`, 'aria-hidden': 'true' }, h('span', { class: 'aussehen-pille' }), h('span', { class: 'aussehen-pille' }), h('span', { class: 'aussehen-pille' }));

function darstellungKarte() {
  return h(
    'article',
    { class: 'karte' },
    h('h3', {}, 'Darstellung'),
    h('p', { class: 'leise' }, 'Automatisch folgt dem Telefon. Die Wahl gilt nur für dieses Telefon.'),
    wahlReihe('Hell oder Dunkel', DARSTELLUNG_TEXTE, { lese: leseDarstellung, wendeAn: wendeDarstellungAn }),
    h('h4', { class: 'darstellung-titel' }, 'Aussehen'),
    wahlReihe('Aussehen', AUSSEHEN_TEXTE, { lese: leseAussehen, wendeAn: wendeAussehenAn, inhalt: (wahl, text) => [aussehenVorschau(wahl), text] }),
    h('h4', { class: 'darstellung-titel' }, 'Bewegung'),
    wahlReihe('Bewegung', BEWEGUNG_TEXTE, { lese: leseBewegung, wendeAn: wendeBewegungAn }),
  );
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
