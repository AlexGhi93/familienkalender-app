// Diensttausch im Schichtplan (Blatt „Diensttausch“, vom Tagesblatt aus): ihr gebt am geöffneten Tag euren Dienst ab oder übernehmt dort
// einen (an einem freien Tag nur „übernehmen“). Den Tag der Rückgabe könnt ihr gleich eintragen – dann ist der Tausch sofort vollständig und
// lässt sich später zusammen rückgängig machen – oder leer lassen: dann steht er unter „Offene Diensttausche“ und die Rückgabe folgt später
// (siehe schicht-offen.js). Gefragt werden die Person (vorgewählt), die Richtung, ggf. der Dienst und – freiwillig – „Mit wem“ (eine Zeile).
// Eine Zeile sagt, was ersetzt wird. Alles Rechnen steht in app/views/schicht-model.js (tauschFormModel), das Schreiben im Store.
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

const ERKLAERUNG = {
  abgegeben: 'Ihr gebt diesen Dienst ab. Einen Dienst an einem anderen Tag übernehmt ihr dafür: gleich hier mit Tag und Dienst, oder später unter „Offene Diensttausche“.',
  uebernommen: 'Ihr übernehmt hier einen Dienst. Den Tag, an dem ihr dafür einen Dienst abgebt, könnt ihr gleich eintragen oder später unter „Offene Diensttausche“.',
};

/** Die Knopfzeile unten im Blatt: „Abbrechen“ und „Speichern“. */
export const abbrechenSpeichern = (schliessen, beiSpeichern) =>
  h(
    'div',
    { class: 'knopfzeile' },
    h('button', { class: 'knopf klein', type: 'button', onClick: schliessen }, 'Abbrechen'),
    h('button', { class: 'knopf klein primaer', type: 'button', onClick: beiSpeichern }, 'Speichern'),
  );

/** Öffnet das Blatt „Diensttausch“ für `person` am Tag `datum` ('JJJJ-MM-TT'). */
export function oeffneDiensttausch({ store }, { person, datum }) {
  const heute = store.heute();
  const e = { person, richtung: '', kb: '', rueckgabe: '', rUngueltig: false, mitWem: '', speichert: false }; // der Entwurf überlebt das Neuzeichnen
  let ersetztZeile = null;
  let dienstGruppe = null;
  let abmelden = () => {};
  const model = () => tauschFormModel(store.getState(), { person: e.person, tag: datum, richtung: e.richtung, kb: e.kb, rueckgabe: e.rueckgabe, mitWem: e.mitWem }, heute);

  /** Die Zeile „Ersetzt am …“ bzw. die Meldung, warum es so nicht geht; der Dienst ist nur mit Rückgabetag wählbar (nichts wird neu gezeichnet, damit die Eingabe bleibt). */
  function zeileAktualisieren() {
    if (!ersetztZeile) return;
    const m = model();
    const wartet = m.rueckgabe !== '' && !m.rGeladen;
    const warnung = m.fehler !== null && !wartet;
    const text = wartet ? 'Der Monat wird geladen …' : warnung ? m.fehler : m.ersetzt;
    ersetztZeile.hidden = !text;
    ersetztZeile.classList.toggle('warnung', warnung);
    fuelle(ersetztZeile, text);
    if (dienstGruppe) dienstGruppe.hidden = !m.brauchtDienst;
  }

  function rueckgabeWaehlen(wert, ungueltig = false) {
    e.rueckgabe = wert;
    e.rUngueltig = ungueltig;
    if (wert !== '') store.schichtLaden(wert.slice(0, 7)).catch(() => {}); // der Monat der Rückgabe muss da sein: Ersetzt-Zeile und Prüfung
    zeileAktualisieren();
  }

  async function speichern(ev, schliessen) {
    if (e.rUngueltig) {
      toast('Bitte den Rückgabetag so schreiben: z. B. 04.01.2027 – oder das Feld leer lassen.', { art: 'fehler' });
      return;
    }
    const { speichern: was } = model();
    const knopf = ev.currentTarget; // nach dem `await` ist currentTarget schon null
    knopf.disabled = true;
    const r = await einmalSpeichern(e, () => (was.art === 'offen' ? store.diensttauschOffenSpeichern(was.entwurf) : store.diensttauschSpeichern(was.entwurf)));
    if (r && erledigt(r, 'Diensttausch gespeichert ✓')) schliessen();
    else knopf.disabled = false; // nochmal versuchen (ein halb geschriebener Tausch wird dabei fortgesetzt)
  }

  const b = blatt({
    titel: 'Diensttausch',
    beimSchliessen: () => abmelden(),
    render: ({ schliessen, neuZeichnen }) => {
      const m = model();
      const abgegeben = m.richtung === 'abgegeben';
      ersetztZeile = h('p', { class: 'sp-tag-erinnerung', role: 'status' });
      ersetztZeile.hidden = true;
      const dienstFeld = auswahl(abgegeben ? 'Dienst am übernommenen Tag' : 'Übernommener Dienst', m.dienste, m.kb, (w) => ((e.kb = w), zeileAktualisieren()));
      dienstGruppe = gruppe(abgegeben ? 'Dienst am übernommenen Tag' : 'Übernommener Dienst', dienstFeld);
      dienstGruppe.hidden = !m.brauchtDienst;
      const inhalt = [
        h('p', { class: 'blatt-text' }, ERKLAERUNG[m.richtung]),
        gruppe('Person', auswahl('Person', PERSONEN, e.person, (w) => ((e.person = w), (e.kb = ''), neuZeichnen()))),
        h('div', { class: 'feld' }, h('span', {}, abgegeben ? 'Abgegebener Tag' : 'Übernommener Tag'), h('p', { class: 'sp-tausch-tag' }, datumLang(datum))),
        gruppe('Was passiert?', auswahl('Richtung', m.richtungen, m.richtung, (w) => ((e.richtung = w), neuZeichnen()))),
        gruppe(
          abgegeben ? 'Übernommener Tag (optional)' : 'Rückgabe: Tag, an dem ihr einen Dienst abgebt (optional)',
          datumFeld({ wert: e.rueckgabe, heute, beschriftung: abgegeben ? 'Übernommener Tag' : 'Rückgabetag', beiAenderung: (w) => rueckgabeWaehlen(w), beiUngueltig: () => rueckgabeWaehlen('', true) }),
        ),
        dienstGruppe,
        feld(
          'Mit wem (optional)',
          textFeld({ wert: e.mitWem, beschriftung: 'Mit wem (optional)', platzhalter: 'z. B. Kollege', max: MAX_MIT_WEM, beiEingabe: (w) => (e.mitWem = w) }),
        ),
        ersetztZeile,
        abbrechenSpeichern(schliessen, (ev) => speichern(ev, schliessen)),
      ];
      queueMicrotask(zeileAktualisieren);
      return h('div', { class: 'sp-tausch-form' }, inhalt);
    },
  });
  abmelden = store.subscribe(zeileAktualisieren); // der Monat der Rückgabe kommt herein → die Zeile nennt, was ersetzt wird
  return b;
}
