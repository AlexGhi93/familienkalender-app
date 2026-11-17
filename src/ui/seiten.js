// Alle Seiten der App an einer Stelle (Hub): Name in der Adresse (#/<name>), Bildschirm, Fenstertitel und was beim Betreten zu lesen
// ist. Eine neue Seite = ein Eintrag hier; die Shell (src/shell.js) zeichnet sie und führt den Besuchsplan aus (src/app/seiten-besuch.js).
import { heuteScreen } from './heute-screen.js';
import { monatScreen } from './monat-screen.js';
import { neuScreen } from './neu-screen.js';
import { urlaubScreen } from './urlaub-screen.js';
import { mehrScreen } from './mehr-screen.js';
import { einkaufScreen } from './einkauf-screen.js';
import { verlaufScreen } from './verlauf-screen.js';
import { kontoScreen } from './konto-screen.js';
import { appScreen } from './app-screen.js';
import { autosScreen } from './autos-screen.js';
import { schichtScreen } from './schicht-screen.js';

const KONTO_TEILE = Object.freeze({ fixkosten: 'Fixkosten', sparziele: 'Sparziele', versicherung: 'Versicherung' });

/** Liest nach dem laufenden Zeichnen (Fehler stehen im Status, der letzte Stand bleibt sichtbar). */
const danach = (lesen) => Promise.resolve().then(lesen).catch(() => {});

/**
 * { name, screen({ store, ui }), titel? (Text oder (ui) => Text; sonst der Text der Registerkarte), teil? (ui) => Unteransicht oder
 * null, schluessel? (ui) => Text, betreten?({ store, ui }), nachladen?(ui) }.
 * `betreten` läuft einmal je Besuch: beim Öffnen und wieder, wenn sich `teil` oder `schluessel` ändert (Konto: die Ansicht;
 * Schichtplan: der angezeigte Monat). `nachladen` läuft nach jedem Zeichnen und lädt nur, was im geladenen Fenster fehlt.
 */
export const SEITEN = Object.freeze([
  { name: 'heute', screen: heuteScreen },
  { name: 'monat', screen: monatScreen, nachladen: (ui) => ui.monatLaden() },
  { name: 'neu', screen: neuScreen },
  // „Schichtplan“: wer wann welchen Dienst hat; Schichtarten und der angezeigte Monat samt Nachbarn, bei jedem Monatswechsel neu
  { name: 'schicht', screen: schichtScreen, titel: 'Schichtplan', schluessel: (ui) => ui.schicht.jm, betreten: ({ store, ui }) => store.schichtLaden(ui.schicht.jm).catch(() => {}) },
  { name: 'urlaub', screen: urlaubScreen, nachladen: (ui) => ui.urlaubLaden() },
  { name: 'mehr', screen: mehrScreen },
  { name: 'einkauf', screen: einkaufScreen, titel: 'Einkauf' }, // Registerkarte; auch erreichbar von „Heute“ (Karte) und „Neu“ (Kachel)
  { name: 'verlauf', screen: verlaufScreen, titel: 'Verlauf', nachladen: (ui) => ui.verlaufLaden() }, // erreichbar von „Mehr“
  // Registerkarte „Konto“ mit „Kontostand · Fixkosten · Sparziele · Versicherung“; auch erreichbar von „Mehr“, „Heute“ (am letzten Tag) und
  // den Erinnerungen (#/konto/kontostand, #/konto/fixkosten, …). Fixkosten, Sparziele und Versicherung werden beim Öffnen ihrer Ansicht
  // frisch gelesen (das andere Telefon könnte etwas geändert haben); Lesefehler stehen im Status.
  {
    name: 'konto',
    screen: kontoScreen,
    titel: (ui) => KONTO_TEILE[ui.kontoAnsicht] ?? 'Kontostand',
    teil: (ui) => (ui.kontoAnsicht in KONTO_TEILE ? ui.kontoAnsicht : null),
    betreten: ({ store, ui }) => {
      if (ui.kontoAnsicht === 'fixkosten') ui.fixLaden();
      else if (ui.kontoAnsicht === 'sparziele') store.zieleLaden?.().catch?.(() => {});
      else if (ui.kontoAnsicht === 'versicherung') danach(() => store.versicherungLaden?.());
    },
  },
  { name: 'app', screen: appScreen, titel: 'Konto & App' }, // „Konto & App“: erreichbar von „Mehr“
  // „Autos“ (#/autos) und die Seite eines Autos (#/autos/<id>): von „Mehr“, der Karte „🚗 Auto“ auf Heute und den Erinnerungen;
  // beim Öffnen frisch lesen (das andere Telefon könnte etwas eingetragen haben)
  { name: 'autos', screen: autosScreen, titel: 'Autos', betreten: ({ store }) => danach(() => store.autosLaden?.()) },
]);
