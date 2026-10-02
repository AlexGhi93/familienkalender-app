// Die eigentliche App-Oberfläche: Tab-Leiste, Seiten, Hinweisleiste (Verbindung, Fortschritt) und alle Bildschirme.
import { parseDate, addDays } from './domain/dates.js';
import { fuelle, h } from './ui/dom.js';
import { entferneFehlerToast, toast } from './ui/components.js';
import { heuteScreen } from './ui/heute-screen.js';
import { monatScreen } from './ui/monat-screen.js';
import { neuScreen } from './ui/neu-screen.js';
import { urlaubScreen } from './ui/urlaub-screen.js';
import { mehrScreen } from './ui/mehr-screen.js';
import { oeffneTagesblatt } from './ui/tagesblatt.js';
import { terminEntwurf } from './app/termin.js';
import { verbindenKarte, verbindungsBanner, versionsBanner } from './ui/verbindung.js';
import { VERSION } from './app/version.js';
import { istNeueVersionVerfuegbar } from './app/version-check.js';
import { fortschrittLeiste } from './ui/fortschritt.js';

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

const BANNER_INTERVALL_MS = 30_000;
const SNAPSHOT_VERZOEGERUNG_MS = 1000;

/**
 * `auth` und `snapshot` gibt es nur im Google-Modus; `konto` bündelt, was „Mehr“ dafür braucht
 * ({ rolle, kalenderCode, zuruecksetzen }). Im Demo-Modus sind alle drei null.
 */
export function startShell({ wurzel, store, auth = null, snapshot = null, konto = null, fenster = window }) {
  const banner = h('div', { id: 'banner' });
  const fortschritt = h('div', { id: 'fortschritt-box' });
  const inhalt = h('main', { id: 'inhalt', tabindex: '-1' });
  const leiste = h('nav', { class: 'tabs', 'aria-label': 'Hauptmenü' });
  fuelle(wurzel, banner, fortschritt, inhalt, leiste);

  let neueVersion = false;
  const versionPruefen = async () => {
    if (neueVersion || !(await istNeueVersionVerfuegbar({ aktuell: VERSION }))) return;
    neueVersion = true;
    ui.bannerAktualisieren();
  };

  const jetztMonat = () => {
    const { y, m } = parseDate(store.heute());
    return { jahr: y, monat: m };
  };

  /** Anmelden (im Tipp!), danach Wartendes speichern und alles neu laden. */
  async function verbinden() {
    try {
      await auth.anmelden();
      await store.wiederholeAusstehende();
      await store.laden();
      toast('Verbunden ✓');
    } catch (fehler) {
      toast(fehler?.message ?? 'Das hat nicht geklappt. Bitte noch einmal versuchen.');
    }
    ui.rendern();
  }

  const ui = {
    store,
    auth,
    konto,
    verbinden,
    monat: jetztMonat(),
    neu: { auswahl: null },
    titel: () => 'Familienkalender',
    seite: () => {
      const name = fenster.location.hash.replace(/^#\/?/, '');
      return name in SEITEN ? name : 'heute';
    },
    bannerAktualisieren() {
      fuelle(banner, verbindungsBanner({ state: store.getState(), auth, ausstehend: store.ausstehend(), verbinden }), neueVersion ? versionsBanner({ neuLaden: () => fenster.location.reload() }) : null);
      fuelle(fortschritt, fortschrittLeiste(store.getState()));
    },
    rendern() {
      const seite = ui.seite();
      const state = store.getState();
      const alt = inhalt.scrollTop;
      const scrollY = fenster.scrollY;
      ui.bannerAktualisieren();
      if (auth && !state.geladen) {
        fuelle(inhalt, verbindenKarte({ verbinden }));
      } else {
        fuelle(inhalt, SEITEN[seite]({ store, ui }));
        if (seite === 'monat') ui.monatLaden();
      }
      inhalt.scrollTop = alt;
      fenster.scrollTo(0, scrollY);
      fuelle(leiste, TABS.map(([id, symbol, text]) => tab(id, symbol, text, seite)));
      document.title = `${ui.titel()} · ${TABS.find(([id]) => id === seite)[2]}`;
    },
    /** Lädt den angezeigten Monat (samt Randwochen) nach, falls er außerhalb des geladenen Fensters liegt. */
    monatLaden() {
      const { jahr, monat } = ui.monat;
      const erster = `${jahr}-${String(monat).padStart(2, '0')}-01`;
      const naechster = monat === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(monat + 1).padStart(2, '0')}-01`;
      store.sichereBereich(addDays(erster, -7), addDays(naechster, 7));
    },
    gehZu(seite) {
      if (ui.seite() === seite) ui.rendern();
      else fenster.location.hash = `#/${seite}`;
      fenster.scrollTo(0, 0);
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

  fenster.addEventListener('hashchange', () => ui.rendern());

  let letzterFehler = null;
  let speicherZeitgeber = null;
  store.subscribe((state) => {
    if (state.fehler && state.fehler !== letzterFehler) toast(state.fehler, { art: 'fehler', dauer: 6000 });
    else if (!state.fehler && letzterFehler) entferneFehlerToast();
    letzterFehler = state.fehler;
    ui.rendern();
    if (snapshot && state.geladen && !state.nurSnapshot) {
      clearTimeout(speicherZeitgeber);
      speicherZeitgeber = setTimeout(() => snapshot.speichern(store.getState(), store.heute()), SNAPSHOT_VERZOEGERUNG_MS);
    }
  });

  // Rückkehr in die App (z. B. am nächsten Tag): neu zeichnen, damit „heute“ stimmt, und – mit gültiger Anmeldung – höchstens einmal pro Minute neu laden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    ui.rendern();
    if (auth) store.aktualisieren();
    versionPruefen();
  });

  if (auth) {
    auth.onStatus(() => ui.bannerAktualisieren());
    setInterval(() => ui.bannerAktualisieren(), BANNER_INTERVALL_MS); // „läuft bald ab“ erscheint ohne Zutun
    auth.vorbereiten(); // Google schon laden, damit der Anmelde-Tipp sofort wirkt
  }

  ui.rendern();
  return ui;
}
