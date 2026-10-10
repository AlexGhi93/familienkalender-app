import { fuelle, h } from './dom.js';
import { datumFeld as datumEingabe, zeitFeld as zeitEingabe } from './eingabefelder.js';
import { chip, farbe, toast } from './components.js';
import { ARZT_SUBTYPEN, FAMILIE_SYMBOLE, TYPES } from '../domain/types.js';
import { fuerAuswahl } from '../domain/fuer.js';
import { mitnehmenFor } from '../domain/settings.js';
import { MAX_MITNEHMEN, MAX_MITNEHMEN_EINTRAG, MAX_NOTIZ, MAX_TITEL, terminAusEntwurf, terminVorschau } from '../app/termin.js';

const KOSTEN_ARTEN = [
  ['keine', 'Keine Angabe'],
  ['kostenlos', '🆓 Kostenlos'],
  ['betrag', '💶 Betrag'],
];

/** Formular für Arzttermin und „Termin“ (alles andere), mit Für wen, Mitnehmen, Kosten und Notiz (neu oder zum Bearbeiten, je nach `ui.neu.bearbeiten`). */
export function terminFormular({ store, ui }, kachel) {
  const n = ui.neu;
  const settings = store.getState().settings;
  const istArzt = n.auswahl === 'arzt';

  const artBox = h('div', { class: 'chip-reihe' });
  const fuerBox = h('div', { class: 'chip-reihe' });
  const symbolBox = h('div', { class: 'chip-reihe' });
  const zeitHinweis = h('small', { class: 'leise' });
  const mitnehmenBox = h('div', { class: 'chip-reihe' });
  const kostenBox = h('div', { class: 'chip-reihe' });
  const betragFeld = h('div', { class: 'feld' });
  const vorschauBox = h('div', { class: 'vorschau', 'aria-live': 'polite' });

  function zeichneVorschau() {
    const v = terminVorschau(n, settings); // mit dem Namen des Kindes, wie später gespeichert
    vorschauBox.classList.toggle('zu-lang', v.ok && v.zuLang);
    fuelle(
      vorschauBox,
      h('small', {}, 'So steht es im Kalender und in der Benachrichtigung:'),
      v.ok ? h('b', {}, v.titel) : h('span', { class: 'leise' }, v.meldung),
      v.ok ? h('small', {}, v.zuLang ? `${v.laenge} von ${v.limit} Zeichen: etwas kürzen, damit alles in der Benachrichtigung steht.` : `${v.laenge} von ${v.limit} Zeichen`) : null,
    );
  }

  function zeichneFuer() {
    fuelle(
      fuerBox,
      ...fuerAuswahl(settings).map((f) =>
        chip(`${f.emoji} ${f.label}`, {
          art: n.fuer === f.id ? 'aktiv' : '',
          farbeHex: istArzt ? TYPES.arzt.farbe : TYPES.familie.farbe,
          onClick: () => {
            n.fuer = f.id;
            zeichneFuer();
            zeichneVorschau();
          },
        }),
      ),
    );
  }

  function zeichneSymbol() {
    fuelle(
      symbolBox,
      ...FAMILIE_SYMBOLE.map((s) =>
        h(
          'button',
          {
            class: `chip symbol ${n.symbol === s ? 'aktiv' : ''}`.trim(),
            type: 'button',
            'aria-label': `Symbol ${s}`,
            'aria-pressed': n.symbol === s ? 'true' : 'false',
            style: farbe(TYPES.familie.farbe),
            onClick: () => {
              n.symbol = s;
              zeichneSymbol();
              zeichneVorschau();
            },
          },
          s,
        ),
      ),
    );
  }

  function zeichneZeitHinweis() {
    zeitHinweis.hidden = istArzt || n.time !== '';
    zeitHinweis.textContent = 'Ohne Uhrzeit erinnert nur das Telefon, auf dem du den Termin einträgst (am Vortag um 09:00).';
  }

  function zeichneArt() {
    fuelle(
      artBox,
      ...Object.values(ARZT_SUBTYPEN).map((s) =>
        chip(`${s.emoji} ${s.label}`, {
          art: n.subtyp === s.id ? 'aktiv' : '',
          farbeHex: TYPES.arzt.farbe,
          onClick: () => {
            n.subtyp = s.id;
            if (!n.mitnehmenGeaendert) n.mitnehmen = [...mitnehmenFor(s.id, settings)];
            zeichneArt();
            zeichneMitnehmen();
            zeichneVorschau();
          },
        }),
      ),
    );
  }

  function zeichneMitnehmen() {
    fuelle(
      mitnehmenBox,
      ...n.mitnehmen.map((text, i) =>
        h(
          'button',
          {
            class: 'chip entfernbar',
            type: 'button',
            'aria-label': `${text} entfernen`,
            onClick: () => {
              n.mitnehmen = n.mitnehmen.filter((_, j) => j !== i);
              n.mitnehmenGeaendert = true;
              zeichneMitnehmen();
              zeichneVorschau();
            },
          },
          `🎒 ${text}`,
          h('span', { class: 'x', 'aria-hidden': 'true' }, '✕'),
        ),
      ),
      n.mitnehmen.length === 0 ? h('span', { class: 'leise' }, 'Nichts zum Mitnehmen eingetragen.') : null,
    );
  }

  function zeichneKosten() {
    fuelle(
      kostenBox,
      ...KOSTEN_ARTEN.map(([art, text]) =>
        chip(text, {
          art: n.kosten.art === art ? 'aktiv' : '',
          onClick: () => {
            n.kosten = { art, text: art === 'betrag' ? n.kosten.text : '' };
            zeichneKosten();
            zeichneVorschau();
          },
        }),
      ),
    );
    if (n.kosten.art === 'betrag') {
      const eingabe = h('input', {
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        placeholder: 'z. B. 15 oder 12,50',
        maxlength: '8',
        value: n.kosten.text,
        'aria-label': 'Betrag in Euro',
        onInput: (e) => {
          n.kosten.text = e.target.value;
          zeichneVorschau();
        },
      });
      fuelle(betragFeld, h('span', {}, 'Betrag in Euro'), eingabe);
      betragFeld.hidden = false;
    } else {
      fuelle(betragFeld);
      betragFeld.hidden = true;
    }
  }

  function neuesMitnehmen() {
    const eingabe = h('input', { type: 'text', maxlength: String(MAX_MITNEHMEN_EINTRAG), autocomplete: 'off', placeholder: 'z. B. Trinkflasche', 'aria-label': 'Weiteres zum Mitnehmen' });
    const hinzufuegen = () => {
      const text = eingabe.value.trim();
      if (text === '') return;
      if (n.mitnehmen.length >= MAX_MITNEHMEN) {
        toast(`Höchstens ${MAX_MITNEHMEN} Dinge zum Mitnehmen.`);
        return;
      }
      if (!n.mitnehmen.includes(text)) n.mitnehmen = [...n.mitnehmen, text];
      n.mitnehmenGeaendert = true;
      eingabe.value = '';
      zeichneMitnehmen();
      zeichneVorschau();
    };
    eingabe.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        hinzufuegen();
      }
    });
    return h('div', { class: 'zeile-eingabe' }, eingabe, h('button', { class: 'knopf klein', type: 'button', onClick: hinzufuegen }, 'Hinzufügen'));
  }

  async function speichern() {
    try {
      await store.terminSpeichern(terminAusEntwurf(n), n.bearbeiten);
    } catch (fehler) {
      toast(fehler.message);
      return;
    }
    toast(n.bearbeiten ? 'Termin geändert ✓' : 'Termin gespeichert ✓');
    const ziel = n.date;
    ui.neuZuruecksetzen();
    ui.gehZuMonat(ziel);
  }

  const datumFeld = datumEingabe({
    wert: n.date,
    heute: store.heute(),
    beiAenderung: (w) => {
      n.date = w;
      zeichneVorschau();
    },
  });
  const zeitFeld = zeitEingabe({
    wert: n.time,
    beiAenderung: (w) => {
      n.time = w;
      zeichneZeitHinweis();
      zeichneVorschau();
    },
  });

  zeichneArt();
  zeichneFuer();
  zeichneSymbol();
  zeichneZeitHinweis();
  zeichneMitnehmen();
  zeichneKosten();
  zeichneVorschau();

  const abbrechen = () => ui.neuZuruecksetzen(true);
  return h(
    'section',
    { class: 'screen' },
    h('button', { class: 'zurueck', type: 'button', onClick: abbrechen }, '‹ Zurück'),
    h(
      'div',
      { class: 'karte tint formular', style: farbe(kachel.farbe) },
      h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji gross' }, kachel.emoji), h('div', { class: 'karte-text' }, h('b', {}, n.bearbeiten ? `${kachel.titel} ändern` : kachel.titel))),
      istArzt
        ? h('div', { class: 'feld' }, h('span', {}, 'Art'), artBox)
        : h(
            'label',
            { class: 'feld' },
            h('span', {}, 'Titel'),
            h('input', {
              type: 'text',
              maxlength: String(MAX_TITEL),
              autocomplete: 'off',
              placeholder: 'z. B. Finanzamt, Friseur, Geburtstag Oma',
              value: n.label,
              onInput: (e) => {
                n.label = e.target.value;
                zeichneVorschau();
              },
            }),
          ),
      istArzt ? null : h('div', { class: 'feld' }, h('span', {}, 'Symbol'), symbolBox),
      h('div', { class: 'feld' }, h('span', {}, 'Für wen'), fuerBox),
      h('div', { class: 'feld-paar' }, h('label', { class: 'feld' }, h('span', {}, 'Datum'), datumFeld), h('label', { class: 'feld' }, h('span', {}, istArzt ? 'Uhrzeit' : 'Uhrzeit (optional)'), zeitFeld)),
      zeitHinweis,
      h('div', { class: 'feld' }, h('span', {}, '🎒 Mitnehmen'), mitnehmenBox, neuesMitnehmen()),
      h('div', { class: 'feld' }, h('span', {}, '💶 Zu bezahlen'), kostenBox),
      betragFeld,
      h(
        'label',
        { class: 'feld' },
        h('span', {}, '📝 Notiz (Grund, Ort, Hinweise)'),
        h('textarea', {
          rows: '3',
          maxlength: String(MAX_NOTIZ),
          placeholder: 'z. B. Arbeitnehmerveranlagung, 2. Stock',
          'aria-label': 'Notiz',
          onInput: (e) => {
            n.notiz = e.target.value;
            zeichneVorschau();
          },
        }, n.notiz ?? ''), // Inhalt als Text: bei <textarea> wirkt ein value-Attribut nicht
        h('small', { class: 'leise' }, 'Steht in den Termin-Details, nicht in der Benachrichtigung.'),
      ),
    ),
    vorschauBox,
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: abbrechen }, 'Abbrechen'), h('button', { class: 'knopf klein primaer', type: 'button', onClick: speichern }, n.bearbeiten ? 'Änderungen speichern' : 'Speichern')),
  );
}
