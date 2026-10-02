import { h } from './dom.js';
import { bestaetigen, farbe, toast } from './components.js';
import { neuKacheln, urlaubVorschau, werktageImBereich } from '../app/views/neu-model.js';
import { werktageText } from '../domain/format.js';
import { terminFormular } from './termin-formular.js';
import { sachenFormular } from './sachen-formular.js';
import { zeigeRueckgaengig } from './fortschritt.js';

function auswahlAnsicht({ ui }, kacheln) {
  return h(
    'section',
    { class: 'screen' },
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
    const v = urlaubVorschau(state, { start: n.von, end: n.bis }, heute);
    const zeilen = [`${v.werktage} ${v.werktage === 1 ? 'Urlaubstag' : 'Urlaubstage'} (ohne Wochenenden und Feiertage).`];
    if (v.umwandeln > 0) zeilen.push(`${v.umwandeln} ${v.umwandeln === 1 ? 'Betreuungstag wird' : 'Betreuungstage werden'} umgewandelt.`);
    zeilen.push(`Danach: noch ${werktageText(v.nachher.offen)} offen (Kindergartenjahr ${v.nachher.jahrId}/${String(v.nachher.jahrId + 1).slice(2)}).`);
    zeilen.push(`${v.nachher.durchgehend ? '✅' : '❗'} Zwei Wochen am Stück ${v.nachher.durchgehend ? 'erfüllt' : 'noch offen'}.`);
    return zeilen;
  }
  const aktualisieren = () => info.replaceChildren(...infoZeilen().map((z) => h('p', {}, z)));

  function feld(beschriftung, wert, beiAenderung) {
    const eingabe = h('input', { type: 'date', value: wert, required: true, onInput: (e) => beiAenderung(e.target.value) });
    return { eingabe, knoten: h('label', { class: 'feld' }, h('span', {}, beschriftung), eingabe) };
  }
  const von = feld('Von', n.von, (w) => {
    n.von = w;
    if (n.bis < n.von) {
      n.bis = n.von;
      bisFeld.eingabe.value = n.bis;
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
      const { rueckgaengig } = await store.setTage(tage, kachel.id);
      zeigeRueckgaengig(`${tage.length} ${tage.length === 1 ? 'Tag' : 'Tage'} gespeichert ✓`, rueckgaengig);
      const ziel = n.von;
      ui.neuZuruecksetzen();
      ui.gehZuMonat(ziel);
      return;
    }
    const vorschau = urlaubVorschau(store.getState(), { start: n.von, end: n.bis }, heute);
    const anlegen = async () => {
      const r = await store.urlaubHinzufuegen({ start: n.von, end: n.bis });
      zeigeRueckgaengig(r.umgewandelt > 0 ? `Urlaub gespeichert, ${r.umgewandelt} Betreuungstage umgewandelt ✓` : 'Urlaub gespeichert ✓', r.rueckgaengig);
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
    { class: 'screen' },
    h('button', { class: 'zurueck', type: 'button', onClick: () => ui.neuZuruecksetzen(true) }, '‹ Zurück'),
    h('div', { class: 'karte tint formular', style: farbe(kachel.farbe) }, h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji gross' }, kachel.emoji), h('div', { class: 'karte-text' }, h('b', {}, kachel.titel))), von.knoten, bisFeld.knoten, info),
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => ui.neuZuruecksetzen(true) }, 'Abbrechen'), h('button', { class: 'knopf klein primaer', type: 'button', onClick: speichern }, 'Speichern')),
  );
}

export function neuScreen(ctx) {
  const { store, ui } = ctx;
  const kacheln = neuKacheln(store.heute(), store.getState().settings);
  const kachel = ui.neu.auswahl ? kacheln.find((k) => k.id === ui.neu.auswahl) : null;
  if (!kachel) return auswahlAnsicht(ctx, kacheln);
  if (kachel.art !== 'termin') return formularAnsicht(ctx, kachel);
  return kachel.id === 'kita_sache' ? sachenFormular(ctx, kachel) : terminFormular(ctx, kachel);
}
