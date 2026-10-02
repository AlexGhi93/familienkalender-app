import { createStore } from './app/store.js';
import { createDemoAdapter } from './app/demo-adapter.js';
import { parseDate } from './domain/dates.js';
import { h } from './ui/dom.js';
import { toast } from './ui/components.js';
import { heuteScreen } from './ui/heute-screen.js';
import { monatScreen } from './ui/monat-screen.js';
import { neuScreen } from './ui/neu-screen.js';
import { urlaubScreen } from './ui/urlaub-screen.js';
import { mehrScreen } from './ui/mehr-screen.js';
import { oeffneTagesblatt } from './ui/tagesblatt.js';
import { terminEntwurf } from './app/termin.js';

const SEITEN = {
  heute: heuteScreen,
  monat: monatScreen,
  neu: neuScreen,
  urlaub: urlaubScreen,
  mehr: mehrScreen,
};

const TABS = [
  ['heute', '🏠', 'Heute'],
  ['monat', '📅', 'Monat'],
  ['neu', '＋', 'Neu'],
  ['urlaub', '✈️', 'Urlaub'],
  ['mehr', '⚙️', 'Mehr'],
];

const store = createStore(createDemoAdapter());
const wurzel = document.getElementById('app');
const inhalt = h('main', { id: 'inhalt', tabindex: '-1' });
const leiste = h('nav', { class: 'tabs', 'aria-label': 'Hauptmenü' });
wurzel.append(inhalt, leiste);

const jetztMonat = () => {
  const { y, m } = parseDate(store.heute());
  return { jahr: y, monat: m };
};

const ui = {
  store,
  monat: jetztMonat(),
  neu: { auswahl: null },
  titel: () => 'Familienkalender',
  seite: () => {
    const name = location.hash.replace(/^#\/?/, '');
    return name in SEITEN ? name : 'heute';
  },
  rendern() {
    const seite = ui.seite();
    const alt = inhalt.scrollTop;
    const scrollY = window.scrollY;
    inhalt.replaceChildren(SEITEN[seite]({ store, ui }));
    inhalt.scrollTop = alt;
    window.scrollTo(0, scrollY);
    leiste.replaceChildren(...TABS.map(([id, symbol, text]) => tab(id, symbol, text, seite)));
    document.title = `${ui.titel()} · ${TABS.find(([id]) => id === seite)[2]}`;
  },
  gehZu(seite) {
    if (ui.seite() === seite) ui.rendern();
    else location.hash = `#/${seite}`;
    window.scrollTo(0, 0);
  },
  gehZuMonat(date) {
    const { y, m } = parseDate(date);
    ui.monat = { jahr: y, monat: m };
    ui.gehZu('monat');
  },
  setzeMonat(ziel) {
    ui.monat = ziel;
    ui.rendern();
  },
  tagesblatt: (date) => oeffneTagesblatt({ store, ui }, date),
  neuTerminStarten(art, termin = null) {
    ui.neu = terminEntwurf(art, { settings: store.getState().settings, heute: store.heute(), termin, state: store.getState() });
    ui.gehZu('neu');
  },
  terminBearbeiten(id) {
    const termin = store.getState().termine.find((t) => t.id === id);
    if (termin) ui.neuTerminStarten(null, termin);
  },
  neuStarten(art) {
    ui.neu = { auswahl: art, von: store.heute(), bis: store.heute() };
    ui.gehZu('neu');
  },
  neuZuruecksetzen(neuZeichnen = false) {
    ui.neu = { auswahl: null };
    if (neuZeichnen) ui.rendern();
  },
};

function tab(id, symbol, text, aktiv) {
  const hauptknopf = id === 'neu';
  return h(
    'a',
    {
      class: `tab ${id === aktiv ? 'aktiv' : ''} ${hauptknopf ? 'fab' : ''}`.trim(),
      href: `#/${id}`,
      'aria-current': id === aktiv ? 'page' : null,
      onClick: () => {
        if (hauptknopf) ui.neu = { auswahl: null };
      },
    },
    h('span', { class: 'tab-symbol', 'aria-hidden': 'true' }, symbol),
    h('span', { class: 'tab-text' }, text),
  );
}

window.addEventListener('hashchange', () => ui.rendern());

let letzterFehler = null;
store.subscribe((state) => {
  if (state.fehler && state.fehler !== letzterFehler) toast(state.fehler);
  letzterFehler = state.fehler;
  ui.rendern();
});

// Bei Rückkehr in die App (z. B. am nächsten Tag) alles neu zeichnen, damit „heute“ stimmt.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') ui.rendern();
});

try {
  await store.laden();
} catch {
  inhalt.replaceChildren(h('section', { class: 'screen' }, h('p', { class: 'hinweis karte' }, 'Die Daten konnten nicht geladen werden. Bitte die App neu öffnen.')));
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
