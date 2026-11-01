// Seite „Autos“ (#/autos, von „Mehr“): eine Karte je Auto (Farbe, Name, Kennzeichen, „ca. 21.830 km“, „Als Nächstes: …“ mit Stand,
// „N fällig“) und „＋ Auto hinzufügen“; ohne Auto „Noch kein Auto“ mit den Vorlagen. #/autos/<id> zeigt die Seite des Autos
// (auto-screen.js). Alle Zahlen und Texte aus app/views/autos-model.js; Text kommt immer als Text in die Seite.
import { h } from './dom.js';
import { autosListeModel } from '../app/views/autos-model.js';
import { oeffneAutoFormular } from './auto-formular.js';
import { autoScreen, autosMeldungen, autosNochmalKnopf, kmZahl, statusPille } from './auto-screen.js';

function autoKarte(k) {
  return h(
    'a',
    { class: 'karte au-karte', href: k.ziel, style: { '--auto': k.farbe }, 'aria-label': k.beschriftung, 'data-id': k.id },
    h(
      'div',
      { class: 'au-kopf' },
      h('span', { class: 'au-kachel', 'aria-hidden': 'true' }, '🚗'),
      h('div', { class: 'au-name' }, h('h3', {}, k.name), k.untertitel ? h('small', {}, k.untertitel) : null),
      h('span', { class: 'au-pfeil', 'aria-hidden': 'true' }, '›'),
    ),
    h(
      'div',
      { class: 'au-zeile-km' },
      kmZahl('au-km-zahl', `au-km-${k.id}`, k.km),
      k.kennzeichen ? h('span', { class: 'au-kennzeichen' }, k.kennzeichen) : null,
      k.faelligText ? h('span', { class: 'au-faellig' }, k.faelligText) : null,
    ),
    k.naechste
      ? h(
          'div',
          { class: `au-naechste ${k.naechste.status}` },
          h('small', { class: 'au-naechste-titel' }, 'Als Nächstes'),
          h('div', { class: 'au-naechste-zeile' }, statusPille(k.naechste), h('b', {}, k.naechste.titel)),
          h('small', { class: 'au-naechste-text' }, k.naechste.text),
        )
      : h('small', { class: 'leise' }, 'Keine Termine – Regeln auf der Seite des Autos.'),
  );
}

function leerKarte(m, ctx) {
  return h(
    'article',
    { class: 'karte hinweis au-leer' },
    h('h3', {}, 'Noch kein Auto – ＋ Auto hinzufügen'),
    h('p', { class: 'leise' }, 'Mit einer Vorlage sind Wartungsregeln und Reifensätze gleich da. Kennzeichen, FIN und Erstzulassung tragt ihr selbst ein.'),
    h(
      'div',
      { class: 'au-vorlagen', role: 'group', 'aria-label': 'Vorlage wählen' },
      m.vorlagen.map((v) =>
        h('button', { class: 'au-vorlage', type: 'button', disabled: !m.kannAnlegen, onClick: () => oeffneAutoFormular(ctx, { vorlage: v.id }) }, h('b', {}, v.id === 'leer' ? '＋ Leer' : `＋ ${v.name}`), h('small', {}, v.text)),
      ),
    ),
  );
}

function listeSeite({ store, ui }) {
  const m = autosListeModel(store.getState(), store.heute());
  const ctx = { store, ui };
  let inhalt;
  if (m.zustand === 'laedt') inhalt = [h('article', { class: 'karte hinweis au-laedt' }, h('p', {}, 'Die Autos werden geladen …'))];
  else if (m.zustand === 'nichtGeladen') inhalt = [h('article', { class: 'karte hinweis' }, h('p', {}, 'Die Autos konnten nicht gelesen werden.'), h('div', { class: 'knopfzeile' }, autosNochmalKnopf(store)))];
  else if (m.zustand === 'leer') inhalt = [...autosMeldungen(m.meldungen, store), m.gesperrt ? null : leerKarte(m, ctx)];
  else
    inhalt = [
      ...autosMeldungen(m.meldungen, store),
      m.karten.map(autoKarte),
      h('button', { class: 'knopf primaer au-neu', type: 'button', disabled: !m.kannAnlegen, onClick: () => oeffneAutoFormular(ctx, {}) }, '＋ Auto hinzufügen'),
      m.kannAnlegen || m.gesperrt ? null : h('p', { class: 'leise' }, 'Mehr Autos passen nicht in den Kalender.'),
    ];
  return h('section', { class: 'screen autos-seite' }, h('button', { class: 'zurueck', type: 'button', onClick: () => ui.gehZu('mehr') }, '‹ Mehr'), h('h1', { class: 'gruss' }, 'Autos 🚗'), inhalt);
}

/** #/autos → Liste, #/autos/<id> → Seite des Autos. */
export function autosScreen(ctx) {
  const id = ctx.ui.autoId?.() ?? null;
  return id ? autoScreen(ctx, id) : listeSeite(ctx);
}
