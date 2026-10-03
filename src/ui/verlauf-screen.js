// Verlauf: alle Termine, Urlaube und Krank-/Abwesend-/Schließtage der Familie, mit Filtern, Suche und „Ältere laden“.
// Antippen öffnet das Blatt des Tages. Alle Texte kommen als Text in die Seite, nie als HTML.
import { fuelle, h } from './dom.js';
import { abschnitt, chip, farbe } from './components.js';
import { VERLAUF_ARTEN, fruehereGrenze, geladenAbText, verlaufModel } from '../app/views/verlauf-model.js';

function zeile(e, ui) {
  return h(
    'button',
    { class: 'zeile tint verlauf-zeile', type: 'button', style: farbe(e.farbe), 'aria-label': `${e.titel}, ${e.datumText}`, onClick: () => ui.tagesblatt(e.start) },
    h('span', { class: 'emoji' }, e.emoji),
    h('span', { class: 'karte-text' }, h('b', {}, e.titel), h('small', {}, e.datumText), e.details.map((d) => h('small', {}, d))),
    h('span', { class: 'pfeil', 'aria-hidden': 'true' }, '›'),
  );
}

export function verlaufScreen({ store, ui }) {
  const v = ui.verlauf; // { typ, jahr, text, von (Beginn des geladenen Bereichs), laedt }
  const fenster = store.getState().fenster;
  if (!v.von && fenster) v.von = fenster.von;

  async function aeltereLaden() {
    const bis = v.von ?? fenster.von;
    const alt = v.von;
    v.von = fruehereGrenze(bis);
    v.laedt = true;
    ui.rendern();
    const ok = await store.sichereBereich(v.von, bis);
    if (!ok) v.von = alt; // nicht geklappt: der Hinweis nennt weiter den wirklich geladenen Beginn (die Meldung kommt vom Store)
    v.laedt = false;
    ui.rendern();
  }

  const suche = h('input', { type: 'search', class: 'verlauf-suche', placeholder: 'Suchen …', 'aria-label': 'Im Verlauf suchen', value: v.text, maxlength: '40', autocomplete: 'off', enterkeyhint: 'search' });
  const filterBox = h('div', { class: 'verlauf-filter' });
  const listeBox = h('div', { class: 'verlauf-liste' });

  // Filter und Suche zeichnen nur ihre eigenen Bereiche neu; so behält das Suchfeld Fokus und Tastatur.
  function zeichne() {
    const m = verlaufModel(store.getState(), store.heute(), v);
    const wahl = (text, aktiv, beiKlick) => chip(text, { art: aktiv ? 'aktiv' : '', onClick: beiKlick });
    fuelle(
      filterBox,
      h('div', { class: 'chip-reihe' }, VERLAUF_ARTEN.map(([id, text]) => wahl(text, v.typ === id, () => { v.typ = id; zeichne(); }))),
      m.jahre.length > 1
        ? h('div', { class: 'chip-reihe' }, wahl('Alle Jahre', v.jahr === null, () => { v.jahr = null; zeichne(); }), m.jahre.map((j) => wahl(String(j), v.jahr === j, () => { v.jahr = j; zeichne(); })))
        : null,
    );
    const liste = (eintraege) => h('div', { class: 'liste' }, eintraege.map((e) => zeile(e, ui)));
    fuelle(
      listeBox,
      m.gesamt === 0 ? h('p', { class: 'leise' }, 'Noch keine Einträge.') : null,
      m.gesamt > 0 && m.anzahl === 0 ? h('p', { class: 'leise' }, 'Nichts gefunden. Probiere einen anderen Filter oder Suchbegriff.') : null,
      m.bevorstehend.length > 0 ? abschnitt(`Bevorstehend · ${m.bevorstehend.length}`, liste(m.bevorstehend)) : null,
      m.vergangen.map((g) => abschnitt(`${g.titel} · ${g.eintraege.length}`, liste(g.eintraege))),
      m.aeltereMoeglich
        ? h(
            'div',
            { class: 'verlauf-aeltere' },
            v.von ? h('small', { class: 'leise' }, geladenAbText(v.von)) : null,
            h('button', { class: 'knopf klein', type: 'button', disabled: v.laedt, onClick: aeltereLaden }, v.laedt ? 'Lade …' : 'Ältere laden'),
          )
        : null,
    );
  }

  suche.addEventListener('input', () => {
    v.text = suche.value;
    zeichne();
  });
  zeichne();

  return h(
    'section',
    { class: 'screen verlauf' },
    h('button', { class: 'zurueck', type: 'button', onClick: () => ui.gehZu('mehr') }, '‹ Zurück'),
    h('h1', { class: 'gruss' }, 'Verlauf 📜'),
    h('p', { class: 'datum' }, 'Termine, Urlaube und Krank-, Abwesend- und Schließtage. Antippen öffnet den Tag.'),
    suche,
    filterBox,
    listeBox,
  );
}
