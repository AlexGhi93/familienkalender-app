// Karten in „Mehr“ zum Bearbeiten kurzer Listen: Schließtage-Schalter, Mitnehmen je Arzt-Untertyp, eigene Sachen.
import { h } from './dom.js';
import { chip, toast } from './components.js';
import { listeMitEintrag, listeOhneEintrag } from '../app/listen.js';
import { ARZT_SUBTYPEN } from '../domain/types.js';
import { MAX_LISTEN_EINTRAG, MAX_MITNEHMEN_LISTE, MAX_SACHEN_EIGENE, mitnehmenFor } from '../domain/settings.js';

const aufgeklappt = new Set(); // welche Gruppen offen sind: überlebt das Neuzeichnen der Seite

/**
 * Chips mit ✕ plus Eingabezeile. `beiAenderung(neueListe)` speichert (Promise); die Seite wird dabei sofort neu gezeichnet,
 * deshalb setzt der Editor den Fokus danach selbst zurück ins Eingabefeld (die Tastatur bleibt offen für den nächsten Eintrag).
 */
function listenEditor({ id, liste, max, leerText, platzhalter, beiAenderung }) {
  const eingabe = h('input', { type: 'text', 'data-liste': id, maxlength: String(MAX_LISTEN_EINTRAG), autocomplete: 'off', placeholder: platzhalter, 'aria-label': platzhalter });
  const fokus = () => document.querySelector(`input[data-liste="${id}"]`)?.focus({ preventScroll: true });

  async function aendern(neu, { fokussieren }) {
    const gespeichert = beiAenderung(neu);
    if (fokussieren) fokus();
    await gespeichert;
  }

  function hinzufuegen() {
    let neu;
    try {
      neu = listeMitEintrag(liste, eingabe.value, { max });
    } catch (fehler) {
      toast(fehler.message);
      eingabe.focus();
      return;
    }
    eingabe.value = '';
    aendern(neu, { fokussieren: true });
  }
  eingabe.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      hinzufuegen();
    }
  });

  return h(
    'div',
    { class: 'listen-editor' },
    h(
      'div',
      { class: 'chip-reihe' },
      liste.map((text) =>
        h(
          'button',
          { class: 'chip entfernbar', type: 'button', 'aria-label': `${text} entfernen`, onClick: () => aendern(listeOhneEintrag(liste, text), { fokussieren: false }) },
          text,
          h('span', { class: 'x', 'aria-hidden': 'true' }, '✕'),
        ),
      ),
      liste.length === 0 ? h('span', { class: 'leise' }, leerText) : null,
    ),
    liste.length >= max
      ? h('p', { class: 'leise' }, `Die Liste ist voll (höchstens ${max}). Zum Ergänzen bitte erst etwas entfernen.`)
      : h('div', { class: 'zeile-eingabe' }, eingabe, h('button', { class: 'knopf klein', type: 'button', onClick: hinzufuegen }, 'Hinzufügen')),
  );
}

/** „Schließtage zählen als Urlaub“: Ja / Nein (wirkt auf den Urlaubsstand). */
export function schliessTageKarte({ settings, speichern }) {
  const wahl = (text, wert) => chip(text, { art: settings.schliessZaehlenAlsUrlaub === wert ? 'aktiv' : '', onClick: () => speichern({ schliessZaehlenAlsUrlaub: wert }) });
  return h(
    'article',
    { class: 'karte' },
    h('h3', {}, 'Urlaub'),
    h('p', { class: 'leise' }, 'Schließtage zählen als Urlaub: Wenn die Einrichtung geschlossen hat, wird dieser Tag auf die Urlaubswochen angerechnet. Im Zweifel bei der Einrichtung nachfragen, wie es bei euch gilt.'),
    h('div', { class: 'chip-reihe' }, wahl('Nein', false), wahl('Ja', true)),
  );
}

/** Mitnehmen-Listen je Arzt-Untertyp (ab dem nächsten neuen Arzttermin vorgeschlagen). */
export function mitnehmenKarte({ settings, speichern }) {
  const gruppe = (s) => {
    const eigen = settings.mitnehmen[s.id];
    const liste = mitnehmenFor(s.id, settings);
    const setze = (neu) => speichern({ mitnehmen: { ...settings.mitnehmen, [s.id]: neu } });
    return h(
      'details',
      { class: 'gruppe', open: aufgeklappt.has(s.id), onToggle: (e) => (e.target.open ? aufgeklappt.add(s.id) : aufgeklappt.delete(s.id)) },
      h('summary', {}, `${s.emoji} ${s.label}${eigen ? ' · angepasst' : ''}`),
      listenEditor({ id: `mitnehmen-${s.id}`, liste, max: MAX_MITNEHMEN_LISTE, leerText: 'Nichts eingetragen.', platzhalter: 'Etwas ergänzen, z. B. Impfpass', beiAenderung: setze }),
      eigen
        ? h(
            'div',
            { class: 'knopfzeile' },
            h(
              'button',
              {
                class: 'knopf klein',
                type: 'button',
                onClick: () => {
                  const { [s.id]: _weg, ...rest } = settings.mitnehmen;
                  speichern({ mitnehmen: rest }, 'Zurückgesetzt ✓');
                },
              },
              'Zurücksetzen',
            ),
          )
        : null,
    );
  };
  return h(
    'article',
    { class: 'karte' },
    h('h3', {}, 'Mitnehmen bei Arztterminen'),
    h('p', { class: 'leise' }, 'Das wird bei einem neuen Arzttermin vorgeschlagen. Beim Termin selbst kannst du es jederzeit ändern.'),
    h('div', { class: 'gruppen' }, Object.values(ARZT_SUBTYPEN).map(gruppe)),
  );
}

/** Eigene Vorschläge für „Sachen“: erscheinen im Formular als Gruppe „Eigene“. */
export function sachenEigeneKarte({ settings, speichern }) {
  return h(
    'article',
    { class: 'karte' },
    h('h3', {}, 'Eigene Sachen'),
    h('p', { class: 'leise' }, 'Was ihr oft in die Krabbelstube oder den Kindergarten mitgebt. Es erscheint beim Eintragen von Sachen in der Gruppe „Eigene“.'),
    listenEditor({ id: 'sachen-eigene', liste: settings.sachenEigene, max: MAX_SACHEN_EIGENE, leerText: 'Noch nichts eingetragen.', platzhalter: 'z. B. Lieblingsbuch', beiAenderung: (neu) => speichern({ sachenEigene: neu }) }),
  );
}
