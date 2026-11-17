// „Mitnehmen“ / „Sachen“ in den Formularen für Termin und Krabbelstube/Kindergarten: die gewählten Dinge als entfernbare Chips,
// optional Vorschlags-Gruppen zum Antippen und die Eingabe „Weiteres“ mit „Hinzufügen“. Die Anordnung im Formular bleibt Sache des
// Formulars: es setzt die Teile (`chips`, `zuletzt`, `gruppen`, `eingabe`) selbst ein.
import { fuelle, h } from './dom.js';
import { chip, toast } from './components.js';
import { MAX_MITNEHMEN, MAX_MITNEHMEN_EINTRAG } from '../app/termin.js';

/**
 * `gewaehlt()` liefert die aktuelle Liste; jede Änderung kommt als neue Liste an `beiAenderung(liste)` (das Formular übernimmt sie
 * und zeichnet seine Vorschau neu), danach zeichnet sich das Feld selbst neu. Ändert das Formular die Liste von außen, ruft es
 * `neuZeichnen()`. `vorschlaege` = { zuletzt: [Text], gruppen: { Name: [Text] }, farbeHex } oder null.
 * Texte: `leerText` (nichts gewählt), `platzhalter` und `beschriftung` der Eingabe, `maxText` (Liste voll).
 * `weiteres` = was in „Weiteres“ schon getippt war (aus dem Entwurf des Formulars); jede Änderung des Getippten geht an
 * `beiWeiteres(text)`, damit sie ein Neuzeichnen übersteht.
 */
export function mitnehmenFeld({ vorschlaege = null, gewaehlt, beiAenderung, weiteres = '', beiWeiteres = () => {}, leerText, platzhalter, beschriftung, maxText }) {
  const chips = h('div', { class: 'chip-reihe' });
  const vorschlagChips = new Map(); // Text -> alle Buttons dazu (Gruppen und „Zuletzt benutzt“)

  const aendern = (liste) => {
    beiAenderung(liste);
    neuZeichnen();
  };
  const umschalten = (text) => {
    const liste = gewaehlt();
    if (liste.includes(text)) aendern(liste.filter((x) => x !== text));
    else if (liste.length >= MAX_MITNEHMEN) toast(maxText);
    else aendern([...liste, text]);
  };

  function vorschlagButton(text) {
    const k = chip(text, { farbeHex: vorschlaege.farbeHex, onClick: () => umschalten(text) });
    vorschlagChips.set(text, [...(vorschlagChips.get(text) ?? []), k]);
    return k;
  }
  const zuletzt = vorschlaege?.zuletzt?.length > 0 ? h('div', { class: 'gruppe-offen' }, h('span', { class: 'leise' }, 'Zuletzt benutzt'), h('div', { class: 'chip-reihe' }, vorschlaege.zuletzt.map(vorschlagButton))) : null;
  const gruppen = vorschlaege
    ? h(
        'div',
        { class: 'gruppen' },
        Object.entries(vorschlaege.gruppen).map(([name, liste], i) => h('details', { class: 'gruppe', open: i === 0 }, h('summary', {}, name), h('div', { class: 'chip-reihe' }, liste.map(vorschlagButton)))),
      )
    : null;

  const eingabe = h('input', { type: 'text', maxlength: String(MAX_MITNEHMEN_EINTRAG), autocomplete: 'off', placeholder: platzhalter, value: weiteres || null, 'aria-label': beschriftung, onInput: (e) => beiWeiteres(e.target.value) });
  const leeren = () => {
    eingabe.value = '';
    beiWeiteres('');
  };
  const hinzufuegen = () => {
    const text = eingabe.value.trim();
    if (text === '') return;
    const liste = gewaehlt();
    if (!liste.includes(text)) {
      if (liste.length >= MAX_MITNEHMEN) {
        toast(maxText);
        return;
      }
      leeren();
      aendern([...liste, text]);
      return;
    }
    leeren(); // schon in der Liste: still leeren, die Liste bleibt gleich (beiAenderung wäre ein leeres Neuzeichnen)
  };
  eingabe.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      hinzufuegen();
    }
  });
  const eingabeZeile = h('div', { class: 'zeile-eingabe' }, eingabe, h('button', { class: 'knopf klein', type: 'button', onClick: hinzufuegen }, 'Hinzufügen'));

  function neuZeichnen() {
    const liste = gewaehlt();
    fuelle(
      chips,
      ...liste.map((text) =>
        h('button', { class: 'chip entfernbar', type: 'button', 'aria-label': `${text} entfernen`, onClick: () => aendern(liste.filter((x) => x !== text)) }, `🎒 ${text}`, h('span', { class: 'x', 'aria-hidden': 'true' }, '✕')),
      ),
      liste.length === 0 ? h('span', { class: 'leise' }, leerText) : null,
    );
    for (const [text, knoepfe] of vorschlagChips) {
      for (const k of knoepfe) {
        const aktiv = liste.includes(text);
        k.classList.toggle('aktiv', aktiv);
        k.setAttribute('aria-pressed', String(aktiv));
      }
    }
  }
  neuZeichnen();
  return { chips, zuletzt, gruppen, eingabe: eingabeZeile, neuZeichnen };
}
