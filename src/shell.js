// Die eigentliche App-Oberfläche: Tab-Leiste, Seiten, Hinweisleiste (Verbindung, Fortschritt) und alle Bildschirme.
import { parseDate, addDays } from './domain/dates.js';
import { fuelle, h } from './ui/dom.js';
import { entferneFehlerToast, toast } from './ui/components.js';
import { heuteScreen } from './ui/heute-screen.js';
import { monatScreen } from './ui/monat-screen.js';
import { neuScreen } from './ui/neu-screen.js';
import { urlaubScreen } from './ui/urlaub-screen.js';
import { urlaubModel } from './app/views/urlaub-model.js';
import { mehrScreen } from './ui/mehr-screen.js';
import { einkaufScreen } from './ui/einkauf-screen.js';
import { verlaufScreen } from './ui/verlauf-screen.js';
import { kontoScreen } from './ui/konto-screen.js';
import { appScreen } from './ui/app-screen.js';
import { oeffneTagesblatt } from './ui/tagesblatt.js';
import { terminEntwurf } from './app/termin.js';
import { verbindenKarte, verbindungsBanner, versionsBanner } from './ui/verbindung.js';
import { VERSION } from './app/version.js';
import { istNeueVersionVerfuegbar } from './app/version-check.js';
import { fortschrittLeiste } from './ui/fortschritt.js';
import { createEinkaufAbgleich } from './app/einkauf-abgleich.js';

const SEITEN = {
  heute: heuteScreen,
  monat: monatScreen,
  neu: neuScreen,
  urlaub: urlaubScreen,
  mehr: mehrScreen,
  einkauf: einkaufScreen, // keine eigene Registerkarte: erreichbar von „Heute“ (Karte) und „Neu“ (Kachel)
  verlauf: verlaufScreen, // erreichbar von „Mehr“
  konto: kontoScreen, // „Kontostand“: erreichbar von „Mehr“, „Heute“ (am letzten Tag) und der Erinnerung
  app: appScreen, // „Konto & App“: erreichbar von „Mehr“
};

const SEITEN_TITEL = { einkauf: 'Einkauf', verlauf: 'Verlauf', konto: 'Kontostand', app: 'Konto & App' }; // Seiten ohne Registerkarte

const TABS = [
  ['heute', '🏠', 'Heute'],
  ['monat', '📅', 'Monat'],
  ['neu', '＋', 'Neu'],
  ['urlaub', '✈️', 'Urlaub'],
  ['mehr', '⚙️', 'Mehr'],
];

const BANNER_INTERVALL_MS = 30_000;
const SNAPSHOT_VERZOEGERUNG_MS = 1000;
const CHECKS_VERZOEGERUNG_MS = 2500; // Urlaub-Checks erst abgleichen, wenn sich der Urlaub kurz nicht mehr ändert

/**
 * `auth` und `snapshot` gibt es nur im Google-Modus; `konto` bündelt, was „Konto & App“ dafür braucht
 * ({ rolle, kalenderCode, zuruecksetzen }); `push` = Push-Erinnerungen dieses Telefons (src/push/client.js). Im Demo-Modus sind alle null.
 */
export function startShell({ wurzel, store, auth = null, snapshot = null, konto = null, push = null, fenster = window }) {
  const banner = h('div', { id: 'banner' });
  const fortschritt = h('div', { id: 'fortschritt-box' });
  const inhalt = h('main', { id: 'inhalt', tabindex: '-1' });
  const leiste = h('nav', { class: 'tabs', 'aria-label': 'Hauptmenü' });
  fuelle(wurzel, banner, fortschritt, inhalt, leiste);

  let neueVersion = false;
  let letzteSeite = null; // zuletzt gezeichnete Seite (für `ui.seiteBetreten`)
  const versionPruefen = async () => {
    if (neueVersion || !(await istNeueVersionVerfuegbar({ aktuell: VERSION }))) return;
    neueVersion = true;
    ui.bannerAktualisieren();
  };

  const jetztMonat = () => {
    const { y, m } = parseDate(store.heute());
    return { jahr: y, monat: m };
  };

  /** Google ist gerade nutzbar: angemeldet, frisch geladen (nicht nur der gespeicherte Stand) und nichts wartet auf die Anmeldung. */
  const googleBereit = () => {
    const state = store.getState();
    return Boolean(auth) && auth.status() === 'verbunden' && state.geladen && !state.nurSnapshot && !state.anmeldungNoetig;
  };

  /** Anmelden (im Tipp!), danach Wartendes speichern und alles neu laden. */
  async function verbinden() {
    if (ui.verbindung.laeuft) return; // ein Versuch läuft schon (das Google-Fenster ist offen): nicht doppelt starten
    const anmeldung = auth.anmelden(); // zuerst, noch im Tipp: Safari öffnet das Google-Fenster nur dann
    ui.verbindung = { laeuft: true, fehler: null };
    ui.rendern(); // sofort sichtbar: „Verbinde mit Google …“
    try {
      await anmeldung;
      await store.wiederholeAusstehende();
      await store.laden();
      ui.verbindung = { laeuft: false, fehler: null };
      toast('Verbunden ✓');
    } catch (fehler) {
      const text = fehler?.message ?? 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
      ui.verbindung = { laeuft: false, fehler: text }; // bleibt im Banner, in „Mehr“ und in „Konto & App“ stehen, bis es klappt
      toast(text, { art: 'fehler', dauer: 7000 });
    }
    ui.rendern();
  }

  const ui = {
    store,
    auth,
    konto,
    push,
    verbinden,
    verbindung: { laeuft: false, fehler: null }, // letzter Verbindungsversuch (Banner, „Mehr“ und „Konto & App“)
    seiteBetreten: true, // true, wenn die Seite gerade neu betreten wurde (nicht nur neu gezeichnet): „Mehr“ spielt dann seine Animationen
    monat: jetztMonat(),
    neu: { auswahl: null },
    urlaubJahr: 0, // gewähltes Kindergartenjahr auf der Urlaub-Seite (0 = aktuelles)
    verlauf: { typ: 'alle', jahr: null, text: '', von: null, laedt: false }, // Filter und geladener Bereich des Verlaufs
    titel: () => 'Familienkalender',
    seite: () => {
      const name = fenster.location.hash.replace(/^#\/?/, '');
      return name in SEITEN ? name : 'heute';
    },
    bannerAktualisieren() {
      fuelle(banner, verbindungsBanner({ state: store.getState(), auth, ausstehend: store.ausstehend(), verbinden, verbindung: ui.verbindung }), neueVersion ? versionsBanner({ neuLaden: () => fenster.location.reload() }) : null);
      fuelle(fortschritt, fortschrittLeiste(store.getState()));
      ui.verbindungZeichnen?.(); // die Verbindung in „Mehr“ bzw. „Konto & App“, falls die Seite gerade offen ist
    },
    rendern() {
      const seite = ui.seite();
      const state = store.getState();
      const alt = inhalt.scrollTop;
      const scrollY = fenster.scrollY;
      ui.bannerAktualisieren();
      if (auth && !state.geladen) {
        fuelle(inhalt, verbindenKarte({ verbinden, verbindung: ui.verbindung }));
      } else {
        ui.seiteBetreten = seite !== letzteSeite;
        letzteSeite = seite;
        fuelle(inhalt, SEITEN[seite]({ store, ui }));
        if (seite === 'monat') ui.monatLaden();
        if (seite === 'urlaub') ui.urlaubLaden();
        if (seite === 'verlauf') ui.verlaufLaden();
      }
      inhalt.scrollTop = alt;
      fenster.scrollTo(0, scrollY);
      fuelle(leiste, TABS.map(([id, symbol, text]) => tab(id, symbol, text, seite)));
      document.title = `${ui.titel()} · ${TABS.find(([id]) => id === seite)?.[2] ?? SEITEN_TITEL[seite]}`;
      einkaufAbgleich.pruefen(); // Einkaufsliste offen (und Google verbunden): alle 30 Sekunden nachsehen, sonst nicht
    },
    /**
     * Holt nur die Einkaufsliste neu (alle 30 Sekunden, beim Zurückkehren, „Ziehen zum Aktualisieren“); Ergebnis wie store.einkaufAktualisieren.
     * In der Demo gibt es kein anderes Telefon: dort ist die Liste immer aktuell.
     */
    async einkaufAktualisieren() {
      if (auth && !googleBereit()) return 'getrennt';
      const ergebnis = await store.einkaufAktualisieren();
      ui.einkaufStandZeichnen?.(); // „Aktualisiert um …“ auch dann, wenn sich nichts geändert hat (dann wird nicht neu gezeichnet)
      return ergebnis;
    },
    /** Lädt den angezeigten Monat (samt Randwochen) nach, falls er außerhalb des geladenen Fensters liegt. */
    monatLaden() {
      const { jahr, monat } = ui.monat;
      const erster = `${jahr}-${String(monat).padStart(2, '0')}-01`;
      const naechster = monat === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(monat + 1).padStart(2, '0')}-01`;
      store.sichereBereich(addDays(erster, -7), addDays(naechster, 7));
    },
    /** Lädt das gewählte Kindergartenjahr nach, falls es außerhalb des geladenen Fensters liegt. */
    urlaubLaden() {
      const { jahr } = urlaubModel(store.getState(), store.heute(), ui.urlaubJahr);
      store.sichereBereich(jahr.start, addDays(jahr.end, 1));
    },
    /** Holt den Verlauf bis zum gewählten Beginn nach (nach einem vollständigen Neuladen fehlen die älteren Monate wieder). */
    verlaufLaden() {
      const fenster = store.getState().fenster;
      if (fenster && ui.verlauf.von && ui.verlauf.von < fenster.von) store.sichereBereich(ui.verlauf.von, fenster.von);
    },
    setzeUrlaubJahr(offset) {
      ui.urlaubJahr = urlaubModel(store.getState(), store.heute(), offset).jahrOffset;
      ui.rendern();
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
    /** Formular für einen neuen Termin der Art `art` (oder `termin` bearbeiten); `datum` = Tag, mit dem ein neuer Eintrag beginnt (sonst der Vorschlag). */
    neuTerminStarten(art, termin = null, { datum = null } = {}) {
      ui.neu = terminEntwurf(art, { settings: store.getState().settings, heute: store.heute(), termin, state: store.getState(), datum });
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

  const einkaufAbgleich = createEinkaufAbgleich({
    aktiv: () => ui.seite() === 'einkauf' && document.visibilityState === 'visible' && googleBereit(),
    holen: () => ui.einkaufAktualisieren(),
    zuletzt: () => store.einkaufGeprueftAm(),
    jetzt: () => store.jetzt().getTime(),
  });

  fenster.addEventListener('hashchange', () => ui.rendern());

  let letzterFehler = null;
  let speicherZeitgeber = null;
  let pushTermine = null;
  let pushSettings = null;
  let pushUrlaub = null;
  let pushKonto = null;
  let checksUrlaub = null;
  let checksTage = null;
  let checksSettings = null;
  let checksZeitgeber = null;
  store.subscribe((state) => {
    if (state.fehler && state.fehler !== letzterFehler) toast(state.fehler, { art: 'fehler', dauer: 6000 });
    else if (!state.fehler && letzterFehler) entferneFehlerToast();
    letzterFehler = state.fehler;
    // Push-Plan abgleichen, sobald frisch aus Google geladen wurde und sich Termine oder Einstellungen geändert haben (nie aus dem gespeicherten Stand)
    if (push && state.geladen && !state.nurSnapshot && (state.termine !== pushTermine || state.settings !== pushSettings || state.urlaub !== pushUrlaub || state.konto !== pushKonto)) {
      pushTermine = state.termine;
      pushSettings = state.settings;
      pushUrlaub = state.urlaub; // der Urlaubsstand bestimmt auch die Urlaub-Check-Erinnerungen
      pushKonto = state.konto; // und wer den Kontostand schon eingetragen hat, die Erinnerung am Monatsende
      push.anstossen();
    }
    // Urlaub-Checks im Kalender (1.3., 1.5., 1.7.) beim Öffnen und nach Änderungen am Urlaub abgleichen; nur mit Google, nie aus dem gespeicherten Stand
    if (auth && state.geladen && !state.nurSnapshot && (state.urlaub !== checksUrlaub || state.tage !== checksTage || state.settings !== checksSettings)) {
      checksUrlaub = state.urlaub;
      checksTage = state.tage;
      checksSettings = state.settings;
      clearTimeout(checksZeitgeber);
      checksZeitgeber = setTimeout(() => store.urlaubChecksAbgleichen(), CHECKS_VERZOEGERUNG_MS);
    }
    ui.rendern();
    if (snapshot && state.geladen && !state.nurSnapshot) {
      clearTimeout(speicherZeitgeber);
      speicherZeitgeber = setTimeout(() => snapshot.speichern(store.getState(), store.heute()), SNAPSHOT_VERZOEGERUNG_MS);
    }
  });

  // Rückkehr in die App (z. B. am nächsten Tag): neu zeichnen, damit „heute“ stimmt, und – mit gültiger Anmeldung – höchstens einmal pro Minute neu laden.
  document.addEventListener('visibilitychange', () => {
    einkaufAbgleich.pruefen(); // im Hintergrund ruht der Zeitgeber der Einkaufsliste
    if (document.visibilityState !== 'visible') return;
    ui.rendern();
    if (auth) store.aktualisieren();
    einkaufAbgleich.sofort(); // zurück auf der Einkaufsliste: gleich einmal nachsehen
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
