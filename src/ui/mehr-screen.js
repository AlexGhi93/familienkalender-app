import { fuelle, h } from './dom.js';
import { bestaetigen, chip, toast } from './components.js';
import { WOCHENTAGE_KURZ } from '../app/format-de.js';
import { VERSION } from '../app/version.js';
import { kontoKarten } from './konto-karte.js';
import { erinnerungenKarte } from './erinnerungen-karte.js';
import { datumFeld as datumEingabe, zeitFeld as zeitEingabe } from './eingabefelder.js';
import { leseDarstellung, wendeDarstellungAn } from './darstellung.js';
import { mitnehmenKarte, sachenEigeneKarte, schliessTageKarte } from './listen-karten.js';
import { sichernKarte } from './sichern-karte.js';
import { kontoKarte } from './kontostand-karte.js';

export function mehrScreen({ store, ui }) {
  const settings = store.getState().settings;
  const konto = kontoKarten({ store, ui });
  const demo = ui.konto?.modus === 'demo';

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

  const zeitFeld = (beschriftung, wert, beiAenderung) =>
    h(
      'div',
      { class: 'feld' },
      h('span', {}, beschriftung),
      zeitEingabe({ wert, beschriftung, erstBeiFertig: true, beiAenderung: (w) => (w ? beiAenderung(w) : toast('Bitte eine Uhrzeit eingeben, z. B. 07:30.')) }),
    );

  const DARSTELLUNG_TEXTE = [['auto', 'Automatisch'], ['hell', '☀️ Hell'], ['dunkel', '🌙 Dunkel']];
  const darstellungBox = h('div', { class: 'chip-reihe' });
  function zeichneDarstellung() {
    const aktuell = leseDarstellung();
    fuelle(
      darstellungBox,
      ...DARSTELLUNG_TEXTE.map(([wahl, text]) =>
        chip(text, {
          art: aktuell === wahl ? 'aktiv' : '',
          onClick: () => {
            wendeDarstellungAn(wahl);
            zeichneDarstellung();
          },
        }),
      ),
    );
  }
  zeichneDarstellung();

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
    h('article', { class: 'karte' }, h('h3', {}, 'Familie'), kindnameFeld),
    h('article', { class: 'karte' }, h('h3', {}, 'Darstellung'), h('p', { class: 'leise' }, 'Automatisch folgt dem Telefon. Die Wahl gilt nur für dieses Telefon.'), darstellungBox),
    h(
      'article',
      { class: 'karte' },
      h('h3', {}, 'Zeiten für Sachen'),
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
    ),
    schliessTageKarte({ settings, speichern }),
    mitnehmenKarte({ settings, speichern }),
    sachenEigeneKarte({ settings, speichern }),
    kontoKarte({ store, ui, settings, speichern }),
    h(
      'article',
      { class: 'karte' },
      h('h3', {}, 'Verlauf'),
      h('p', { class: 'leise' }, 'Alle Termine, Urlaube und Krank-, Abwesend- und Schließtage in einer Liste, mit Suche und Filtern.'),
      h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: () => ui.gehZu('verlauf') }, 'Verlauf öffnen')),
    ),
    sichernKarte({ store }),
    ui.konto?.modus === 'google' ? erinnerungenKarte({ store, ui }) : null,
    ...konto.oben,
    demo
      ? h(
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
      )
      : null,
    ...konto.unten,
    h('p', { class: 'version' }, `Familienkalender ${VERSION}`),
  );
}
