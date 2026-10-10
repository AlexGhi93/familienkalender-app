// „Mehr“: oben der Weg zu „Konto & App“, darunter das Menü der Familien-Einstellungen. Jede Zeile hat ein eigenes animiertes Symbol
// und klappt ihre Einstellungen auf; beim Betreten der Seite spielen die Symbole nacheinander, damit man sieht, wo man tippen kann.
import { fuelle, h } from './dom.js';
import { chip, toast } from './components.js';
import { WOCHENTAGE_KURZ } from '../app/format-de.js';
import { verbindungsModel } from '../app/views/verbindung-model.js';
import { datumFeld as datumEingabe, zeitFeld as zeitEingabe } from './eingabefelder.js';
import { mitnehmenInhalt, sachenEigeneInhalt, schliessTageInhalt } from './listen-karten.js';
import { kontostandInhalt } from './kontostand-karte.js';
import { menue } from './menue.js';
import { einstellungsFeld } from './einstellungs-feld.js';
import { nachrichtenInhalt } from './nachrichten-einstellungen.js';
import { bringenHolenInhalt } from './bringen-holen.js';
import { einrichtungsFormen } from '../app/nachrichten.js';
import { betragAusText } from '../app/termin.js';
import { einrichtungFor } from '../domain/modus.js';
import { MAX_ESSEN_PREIS_CENT } from '../domain/settings.js';

const KURZSTATUS = {
  verbunden: '✅ Verbunden mit Google',
  laeuft: '⏳ Verbinde mit Google …',
  abgelaufen: '🔒 Bitte neu anmelden',
  getrennt: '📴 Nicht verbunden',
};

/** Preis pro Mittagessen: 350 → „3,50“; ohne Preis leer. */
const preisText = (cent) => (cent == null ? '' : (cent / 100).toFixed(2).replace('.', ','));

/** „3,50“, „3.50“, „3“ (auch mit €) → Cent; leer → null (aus). */
function preisEingabe(text) {
  const betrag = betragAusText(text);
  if (betrag === null) return { wert: null };
  const cent = Math.round(betrag * 100);
  if (Number.isNaN(betrag) || cent < 1 || cent > MAX_ESSEN_PREIS_CENT) {
    return { fehler: `Preis: bitte einen Betrag wie 3,50 eingeben (höchstens ${MAX_ESSEN_PREIS_CENT / 100} €). Leer lassen = aus.` };
  }
  return { wert: cent };
}

/** Kurzstatus der Verbindung für die Zeile „Konto & App“; wird wie die Karte in „Konto & App“ bei jedem Wechsel neu gezeichnet. */
function verbindungsStatus({ store, ui }) {
  const box = h('small', { class: 'menue-status' });
  const zeichne = () => {
    const { karte } = verbindungsModel({ state: store.getState(), status: ui.auth.status(), restMs: ui.auth.restMs(), bald: ui.auth.baldAbgelaufen(), verbindung: ui.verbindung, ausstehend: store.ausstehend() });
    box.classList.toggle('warnung', karte.status === 'abgelaufen' || karte.status === 'getrennt' || karte.fehler !== null);
    fuelle(box, KURZSTATUS[karte.status], karte.fehler ? ' · ⚠️ Letzter Versuch fehlgeschlagen' : null);
  };
  zeichne();
  ui.verbindungZeichnen = () => {
    if (box.isConnected) zeichne();
  };
  return box;
}

export function mehrScreen({ store, ui }) {
  const settings = store.getState().settings;
  const google = ui.konto?.modus === 'google' && ui.auth;
  const formen = einrichtungsFormen(einrichtungFor(store.heute(), settings)); // „der Krabbelstube“ bzw. „des Kindergartens“

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

  // Datum und Uhrzeit schreibt man mit der Zifferntastatur; gespeichert wird erst bei Enter, beim Verlassen des Feldes oder nach der Auswahl.
  const datumsFeld = (beschriftung, wert, beiAenderung, hinweis) =>
    h(
      'div',
      { class: 'feld' },
      h('span', {}, beschriftung),
      datumEingabe({ wert: wert ?? '', heute: store.heute(), beschriftung, erstBeiFertig: true, beiAenderung: (w) => beiAenderung(w || null) }),
      hinweis ? h('small', { class: 'leise' }, hinweis) : null,
    );

  const kindnameFeld = h(
    'label',
    { class: 'feld' },
    h('span', {}, 'Name des Kindes'),
    h('input', {
      type: 'text',
      maxlength: '20',
      autocomplete: 'off',
      placeholder: 'Vorname eingeben',
      value: settings.kindname,
      onChange: (e) => {
        const name = e.target.value.trim();
        if (/[(),]| · /.test(name)) {
          toast('Bitte ohne Klammern, Kommas und „ · “.');
          return;
        }
        speichern({ kindname: name });
      },
    }),
    h('small', { class: 'leise' }, 'Erscheint bei „Für wen“ und in neuen Terminen, z. B. „Kinderarzt (Vorname)“. Du kannst ihn jederzeit ändern.'),
  );

  const geschlecht = (text, wert) => chip(text, { art: settings.kindGeschlecht === wert ? 'aktiv' : '', onClick: () => speichern({ kindGeschlecht: wert }) });
  const geschlechtFeld = h(
    'div',
    { class: 'feld' },
    h('span', {}, 'Das Kind ist'),
    h('div', { class: 'chip-reihe' }, geschlecht('👧 Mädchen', 'w'), geschlecht('👦 Junge', 'm'), geschlecht('Keine Angabe', '')),
    h('small', { class: 'leise' }, `Für „sie“ bzw. „er“ in den Nachrichten ${formen.an}.`),
  );

  const essenPreisFeld = einstellungsFeld({
    id: 'essenPreisCent',
    beschriftung: 'Preis pro Mittagessen',
    hinweis: `Steht auf der Rechnung ${formen.der}. Leer lassen = aus.`,
    wert: settings.essenPreisCent,
    anzeige: preisText,
    pruefen: preisEingabe,
    speichern: (w) => speichern({ essenPreisCent: w }),
    attribute: { inputmode: 'decimal', maxlength: '9', placeholder: 'z. B. 3,50' },
  });

  const zeitFeld = (beschriftung, wert, beiAenderung) =>
    h(
      'div',
      { class: 'feld' },
      h('span', {}, beschriftung),
      zeitEingabe({ wert, beschriftung, erstBeiFertig: true, beiAenderung: (w) => (w ? beiAenderung(w) : toast('Bitte eine Uhrzeit eingeben, z. B. 07:30.')) }),
    );

  const kontoApp = {
    id: 'app',
    emoji: '👤',
    animation: 'nicken',
    farbe: 'var(--akzent)',
    titel: 'Konto & App',
    text: google ? 'Erinnerungen, Darstellung, Sicherung' : 'Mit Google verbinden, Darstellung, Sicherung',
    status: google ? verbindungsStatus({ store, ui }) : null,
    beiKlick: () => ui.gehZu('app'),
  };

  const einstellungen = [
    {
      id: 'betreuung',
      emoji: '📅',
      animation: 'blatt',
      farbe: 'var(--kita)',
      titel: 'Betreuung',
      text: 'Wochentage, Erfassung, Kindergarten, Essensgeld',
      inhalt: [
        h('p', { class: 'leise' }, 'An welchen Wochentagen geht dein Kind normalerweise hin? Daraus ergeben sich die Tage, die noch „offen“ sind.'),
        tage,
        datumsFeld('Erfassung ab', settings.erfassungAb, (w) => speichern({ erfassungAb: w }), 'Ab diesem Tag zählt die App „offene“ Tage.'),
        datumsFeld('Wechsel zum Kindergarten ab', settings.wechseldatum, (w) => speichern({ wechseldatum: w }), 'Ab diesem Tag heißt es „Kindergarten“ statt „Krabbelstube“.'),
        essenPreisFeld,
      ],
    },
    { id: 'familie', emoji: '👶', animation: 'wiegen', farbe: 'var(--familie)', titel: 'Familie', text: 'Name des Kindes, Mädchen oder Junge', inhalt: [kindnameFeld, geschlechtFeld] },
    {
      id: 'nachrichten',
      emoji: '📨',
      animation: 'brief',
      farbe: 'var(--urlaub)',
      titel: 'Nachrichten',
      text: `Kontakt ${formen.der}, Gruß, Unterschrift`,
      inhalt: nachrichtenInhalt({ store, ui, settings, speichern }),
    },
    {
      id: 'zeiten',
      emoji: '⏰',
      animation: 'klingeln',
      farbe: 'var(--abwesend)',
      titel: 'Zeiten für Sachen',
      text: 'Hinbringen, Heimholen, Vorabend',
      inhalt: [
        h('p', { class: 'leise' }, 'Zu dieser Uhrzeit meldet sich die Erinnerung (einen Tag und eine Stunde vorher).'),
        zeitFeld('Hinbringen um', settings.bringzeit, (w) => speichern({ bringzeit: w })),
        zeitFeld('Heimholen um', settings.abholzeit, (w) => speichern({ abholzeit: w })),
        h(
          'div',
          { class: 'feld' },
          h('span', {}, 'Erinnerung am Vorabend um (nur Hinbringen)'),
          zeitEingabe({ wert: settings.vorabend, beschriftung: 'Erinnerung am Vorabend', erstBeiFertig: true, beiAenderung: (w) => speichern({ vorabend: w }) }),
          h('small', { class: 'leise' }, 'Am Abend davor, zum Einpacken, direkt aus der App. Leer lassen = aus.'),
        ),
      ],
    },
    {
      id: 'bringen',
      emoji: '🚗',
      animation: 'auto',
      farbe: 'var(--kita-ohne)',
      titel: 'Bringen & Abholen',
      text: 'Wer bringt, wer holt – je Wochentag',
      inhalt: bringenHolenInhalt({ settings, formen, speichern }),
    },
    { id: 'urlaub', emoji: '✈️', animation: 'fliegen', farbe: 'var(--urlaub)', titel: 'Urlaub', text: 'Schließtage als Urlaub', inhalt: schliessTageInhalt({ settings, speichern }) },
    { id: 'mitnehmen', emoji: '🩺', animation: 'herz', farbe: 'var(--arzt)', titel: 'Mitnehmen beim Arzt', text: 'Vorschläge je Arzttermin', inhalt: mitnehmenInhalt({ settings, speichern }) },
    { id: 'sachen', emoji: '🎒', animation: 'huepfen', farbe: 'var(--sache)', titel: 'Eigene Sachen', text: 'Eigene Vorschläge für Sachen', inhalt: sachenEigeneInhalt({ settings, speichern }) },
    { id: 'kontostand', emoji: '💶', animation: 'muenze', farbe: 'var(--serie-papa)', titel: 'Kontostand', text: 'Stand, Erinnerung am Monatsende', inhalt: kontostandInhalt({ store, ui, settings, speichern }) },
    { id: 'verlauf', emoji: '📜', animation: 'rolle', farbe: 'var(--grau)', titel: 'Verlauf', text: 'Alle Einträge, mit Suche und Filtern', beiKlick: () => ui.gehZu('verlauf') },
  ];

  const animieren = ui.seiteBetreten !== false; // nur beim Betreten, nicht bei jedem Neuzeichnen (z. B. nach dem Speichern)
  return h(
    'section',
    { class: 'screen' },
    h('h1', { class: 'gruss' }, 'Mehr ⚙️'),
    menue({ eintraege: [kontoApp], startIndex: animieren ? 0 : null }),
    menue({ eintraege: einstellungen, startIndex: animieren ? 1 : null }),
  );
}
