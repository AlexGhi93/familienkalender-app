// Diensttausch im Schichtplan (Blatt „Diensttausch“, vom Tagesblatt aus): ihr gebt am geöffneten Tag (A) euren Dienst ab und übernehmt an
// einem anderen Tag (B, auch in einem anderen Monat oder Jahr) einen Dienst. Gefragt werden die Person (vorgewählt), der übernommene Tag,
// der Dienst an diesem Tag und – freiwillig – „Mit wem“ (eine Zeile). Eine Zeile sagt, was am Tag B ersetzt wird. Alles Rechnen steht in
// app/views/schicht-model.js (tauschFormModel), das Schreiben im Store (diensttauschSpeichern).
import { fuelle, h } from './dom.js';
import { blatt, toast } from './components.js';
import { datumFeld } from './eingabefelder.js';
import { auswahl, einmalSpeichern, erledigt, feld, gruppe, textFeld } from './formular.js';
import { tauschFormModel } from '../app/views/schicht-model.js';
import { datumLang } from '../app/format-de.js';
import { MAX_MIT_WEM } from '../domain/schicht-tausch.js';

const PERSONEN = [
  ['papa', '👨 Papa'],
  ['mama', '👩 Mama'],
];

/** Öffnet das Blatt „Diensttausch“ für `person`, die am Tag `datum` ('JJJJ-MM-TT') ihren Dienst abgibt. */
export function oeffneDiensttausch({ store }, { person, datum }) {
  const heute = store.heute();
  const e = { person, b: '', kb: '', mitWem: '', speichert: false }; // der Entwurf überlebt das Neuzeichnen
  let ersetztZeile = null;
  let abmelden = () => {};
  const model = () => tauschFormModel(store.getState(), { person: e.person, a: datum, b: e.b, kb: e.kb, mitWem: e.mitWem }, heute);

  /** Die Zeile „Ersetzt am …“ bzw. die Meldung, warum es so nicht geht (nichts wird neu gezeichnet, damit die Eingabe bleibt). */
  function zeileAktualisieren() {
    if (!ersetztZeile) return;
    const m = model();
    const warnung = m.b !== '' && m.fehler !== null && m.bGeladen;
    ersetztZeile.hidden = m.b === '';
    ersetztZeile.classList.toggle('warnung', warnung);
    fuelle(ersetztZeile, warnung ? m.fehler : (m.ersetzt ?? 'Der Monat wird geladen …'));
  }

  function bWaehlen(wert) {
    e.b = wert;
    if (wert !== '') store.schichtLaden(wert.slice(0, 7)).catch(() => {}); // der Monat von B muss da sein: Ersetzt-Zeile und Prüfung
    zeileAktualisieren();
  }

  async function speichern(ev, schliessen) {
    const m = model();
    if (m.b === '') {
      toast('Bitte den übernommenen Tag wählen, z. B. 04.01.2027.', { art: 'fehler' });
      return;
    }
    const knopf = ev.currentTarget; // nach dem `await` ist currentTarget schon null
    knopf.disabled = true;
    const r = await einmalSpeichern(e, () => store.diensttauschSpeichern({ person: e.person, a: datum, b: m.b, kb: m.kb, mitWem: e.mitWem }));
    if (r && erledigt(r, 'Diensttausch gespeichert ✓')) schliessen();
    else knopf.disabled = false; // nochmal versuchen (ein halb geschriebener Tausch wird dabei fortgesetzt)
  }

  const b = blatt({
    titel: 'Diensttausch',
    beimSchliessen: () => abmelden(),
    render: ({ schliessen, neuZeichnen }) => {
      const m = model();
      ersetztZeile = h('p', { class: 'sp-tag-erinnerung', role: 'status' });
      ersetztZeile.hidden = true;
      const kopf = h('p', { class: 'blatt-text' }, 'Ihr gebt einen Dienst ab und übernehmt dafür einen anderen Dienst an einem anderen Tag. Beide Tage lassen sich später zusammen rückgängig machen.');
      const inhalt = [
        kopf,
        gruppe('Person', auswahl('Person', PERSONEN, e.person, (w) => ((e.person = w), (e.kb = ''), neuZeichnen()))),
        h('div', { class: 'feld' }, h('span', {}, 'Abgegebener Tag'), h('p', { class: 'sp-tausch-tag' }, datumLang(datum))),
        gruppe(
          'Übernommener Tag',
          datumFeld({ wert: e.b, heute, beschriftung: 'Übernommener Tag', beiAenderung: bWaehlen, beiUngueltig: () => bWaehlen('') }),
        ),
        gruppe('Dienst am übernommenen Tag', auswahl('Dienst am übernommenen Tag', m.dienste, m.kb, (w) => ((e.kb = w), zeileAktualisieren()))),
        feld(
          'Mit wem (optional)',
          textFeld({ wert: e.mitWem, beschriftung: 'Mit wem (optional)', platzhalter: 'z. B. Kollege', max: MAX_MIT_WEM, beiEingabe: (w) => (e.mitWem = w) }),
        ),
        ersetztZeile,
        h(
          'div',
          { class: 'knopfzeile' },
          h('button', { class: 'knopf klein', type: 'button', onClick: schliessen }, 'Abbrechen'),
          h('button', { class: 'knopf klein primaer', type: 'button', onClick: (ev) => speichern(ev, schliessen) }, 'Speichern'),
        ),
      ];
      queueMicrotask(zeileAktualisieren);
      return h('div', { class: 'sp-tausch-form' }, inhalt);
    },
  });
  abmelden = store.subscribe(zeileAktualisieren); // der Monat von B kommt herein → die Zeile nennt, was ersetzt wird
  return b;
}
