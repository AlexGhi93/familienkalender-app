import { datumFeld as datumEingabe } from './eingabefelder.js';
import { h } from './dom.js';
import { bestaetigen, farbe, toast } from './components.js';
import { neuKacheln, urlaubVorschau, werktageImBereich } from '../app/views/neu-model.js';
import { werktageText } from '../domain/format.js';
import { terminFormular } from './termin-formular.js';
import { sachenFormular } from './sachen-formular.js';
import { eingetragenMelden } from './fortschritt.js';
import { einmal } from '../app/einmal.js';
import { einmalSpeichern, erledigt } from './formular.js';

/** Öffnet „Neu“ im Formular „Urlaub bearbeiten“ für den Urlaub `id` (Von/Bis vorbelegt); ein Urlaub, den es nicht mehr gibt, wird nicht geöffnet. */
export function urlaubBearbeitenStarten({ store, ui }, id) {
  const u = store.getState().urlaub.find((x) => x.id === id);
  if (!u) return;
  ui.neu = { auswahl: 'urlaub', von: u.start, bis: u.end, urlaubId: id };
  ui.gehZu('neu');
}

function auswahlAnsicht({ ui }, kacheln) {
  return h(
    'section',
    { class: 'screen neu-seite' },
    h('h1', { class: 'gruss' }, 'Was ist los? 🎈'),
    h('p', { class: 'datum' }, 'Tippe auf eine Kachel.'),
    h(
      'div',
      { class: 'kacheln' },
      kacheln.map((k) =>
        h(
          'button',
          {
            class: 'kachel tint',
            type: 'button',
            style: farbe(k.farbe),
            onClick: () => {
              if (k.art === 'termin') {
                ui.neuTerminStarten(k.id);
                return;
              }
              if (k.art === 'einkauf') {
                ui.gehZu('einkauf');
                return;
              }
              ui.neu = { auswahl: k.id, von: ui.store.heute(), bis: ui.store.heute() };
              ui.rendern();
            },
          },
          h('span', { class: 'emoji gross' }, k.emoji),
          h('b', {}, k.titel),
        ),
      ),
    ),
  );
}

function formularAnsicht({ store, ui }, kachel) {
  const state = store.getState();
  const heute = store.heute();
  const n = ui.neu;
  const info = h('div', { class: 'info', 'aria-live': 'polite' });
  let bisFeld;

  function infoZeilen() {
    if (!n.von || !n.bis) return ['Bitte beide Daten wählen.'];
    if (n.bis < n.von) return ['„Bis“ liegt vor „Von“.'];
    if (kachel.art === 'tag') {
      const tage = werktageImBereich(n.von, n.bis);
      return [tage.length === 0 ? 'In diesem Zeitraum gibt es keine Werktage.' : `Gilt für ${tage.length} ${tage.length === 1 ? 'Werktag' : 'Werktage'} (Mo–Fr, ohne Feiertage).`];
    }
    const v = urlaubVorschau(state, { start: n.von, end: n.bis }, heute, { ohneId: n.urlaubId ?? null });
    const zeilen = [`${v.werktage} ${v.werktage === 1 ? 'Urlaubstag' : 'Urlaubstage'} (ohne Wochenenden und Feiertage).`];
    if (v.umwandeln > 0) zeilen.push(`${v.umwandeln} ${v.umwandeln === 1 ? 'Betreuungstag wird' : 'Betreuungstage werden'} umgewandelt.`);
    zeilen.push(`Danach: noch ${werktageText(v.nachher.offen)} offen (Kindergartenjahr ${v.nachher.jahrId}/${String(v.nachher.jahrId + 1).slice(2)}).`);
    zeilen.push(`${v.nachher.durchgehend ? '✅' : '❗'} Zwei Wochen am Stück ${v.nachher.durchgehend ? 'erfüllt' : 'noch offen'}.`);
    return zeilen;
  }
  const aktualisieren = () => info.replaceChildren(...infoZeilen().map((z) => h('p', {}, z)));

  function feld(beschriftung, wert, beiAenderung) {
    const eingabe = datumEingabe({ wert, heute, beschriftung, beiAenderung });
    return { eingabe, knoten: h('div', { class: 'feld' }, h('span', {}, beschriftung), eingabe) };
  }
  const von = feld('Von', n.von, (w) => {
    n.von = w;
    if (n.bis < n.von) {
      n.bis = n.von;
      bisFeld.eingabe.setzeWert(n.bis);
    }
    aktualisieren();
  });
  bisFeld = feld('Bis', n.bis, (w) => {
    n.bis = w;
    aktualisieren();
  });

  async function speichern() {
    if (!n.von || !n.bis || n.bis < n.von) {
      toast('Bitte den Zeitraum prüfen.');
      return;
    }
    if (kachel.art === 'tag') {
      const tage = werktageImBereich(n.von, n.bis);
      if (tage.length === 0) {
        toast('In diesem Zeitraum gibt es keine Werktage.');
        return;
      }
      const r = await einmal(n, () => store.setTage(tage, kachel.id));
      if (r === undefined) return;
      if (!eingetragenMelden(r, `${tage.length} ${tage.length === 1 ? 'Tag' : 'Tage'} gespeichert ✓`)) {
        ui.rendern(); // nicht gespeichert: das Formular bleibt mit dem Zeitraum offen, „Speichern“ geht wieder
        return;
      }
      const ziel = n.von;
      ui.neuZuruecksetzen();
      ui.gehZuMonat(ziel);
      return;
    }
    const vorschau = urlaubVorschau(store.getState(), { start: n.von, end: n.bis }, heute, { ohneId: n.urlaubId ?? null });
    const anlegen = async () => {
      const r = n.urlaubId
        ? await einmalSpeichern(n, () => store.urlaubAendern(n.urlaubId, { start: n.von, end: n.bis }))
        : await einmal(n, () => store.urlaubHinzufuegen({ start: n.von, end: n.bis }));
      if (r === undefined) return;
      const text = n.urlaubId ? 'Urlaub geändert ✓' : r.umgewandelt > 0 ? `Urlaub gespeichert, ${r.umgewandelt} Betreuungstage umgewandelt ✓` : 'Urlaub gespeichert ✓';
      if (!(n.urlaubId && !r.rueckgaengig ? erledigt(r, text) : eingetragenMelden(r, text))) {
        ui.rendern(); // nicht gespeichert: das Formular bleibt mit dem Zeitraum offen, „Speichern“ geht wieder
        return;
      }
      ui.neuZuruecksetzen();
      ui.gehZu('urlaub');
    };
    if (vorschau.umwandeln > 0) {
      bestaetigen({
        titel: 'Betreuungstage umwandeln?',
        text: `${vorschau.umwandeln} eingetragene Betreuungstage in diesem Zeitraum werden durch den Urlaub ersetzt.`,
        ja: 'Urlaub speichern',
        beiJa: anlegen,
      });
    } else {
      await anlegen();
    }
  }

  aktualisieren();
  return h(
    'section',
    { class: 'screen neu-formular' },
    h('button', { class: 'zurueck', type: 'button', onClick: () => ui.neuZuruecksetzen(true) }, '‹ Zurück'),
    h('div', { class: 'karte tint formular', style: farbe(kachel.farbe) }, h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji gross' }, kachel.emoji), h('div', { class: 'karte-text' }, h('b', {}, n.urlaubId ? 'Urlaub bearbeiten' : kachel.titel))), von.knoten, bisFeld.knoten, info),
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => ui.neuZuruecksetzen(true) }, 'Abbrechen'), h('button', { class: 'knopf klein primaer', type: 'button', disabled: n.speichert, onClick: speichern }, 'Speichern')),
  );
}

export function neuScreen(ctx) {
  const { store, ui } = ctx;
  const kacheln = neuKacheln(store.heute(), store.getState().settings);
  const kachel = ui.neu.auswahl ? kacheln.find((k) => k.id === ui.neu.auswahl) : null;
  if (!kachel || kachel.art === 'einkauf') return auswahlAnsicht(ctx, kacheln);
  if (kachel.art !== 'termin') return formularAnsicht(ctx, kachel);
  return kachel.id === 'kita_sache' ? sachenFormular(ctx, kachel) : terminFormular(ctx, kachel);
}
