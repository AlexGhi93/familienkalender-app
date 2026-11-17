// Offene Diensttausche im Schichtplan: die Karte „Offene Diensttausche“ unter der Monatszählung (je angezeigter Person ihre Tausche, bei denen
// die Rückgabe noch aussteht) und das Blatt „Rückgabe eintragen“. Alles Rechnen steht in app/views/schicht-model.js (offeneTauscheModel,
// rueckgabeFormModel), das Schreiben im Store (diensttauschRueckgabe, …Abschliessen, …Rueckgaengig, …Verwerfen).
import { fuelle, h } from './dom.js';
import { bestaetigen, blatt } from './components.js';
import { datumFeld } from './eingabefelder.js';
import { abbrechenSpeichern } from './schicht-tausch.js';
import { auswahl, einmalSpeichern, erledigt, gruppe, sicher } from './formular.js';
import { TAUSCH_EINTRAG_ENTFERNEN_TEXT, TAUSCH_OFFEN_RUECKGAENGIG_TEXT, TAUSCH_RUECKGAENGIG_TEXT, offeneTauscheModel, rasterFilter, rueckgabeFormModel } from '../app/views/schicht-model.js';

const RUECKGABE_ERKLAERUNG = {
  abgegeben: 'Ihr habt diesen Dienst abgegeben. Tragt ein, an welchem Tag ihr dafür einen Dienst übernehmt.',
  uebernommen: 'Ihr habt diesen Dienst übernommen. Tragt ein, an welchem Tag ihr dafür einen Dienst abgebt.',
};

/** „Tausch rückgängig“ mit Rückfrage; `offen` = ein offener Tausch (nur sein einer Tag wird zurückgesetzt). */
export function rueckgaengigFragen({ store }, { id, offen = false }) {
  bestaetigen({
    titel: 'Diensttausch rückgängig machen?',
    text: offen ? TAUSCH_OFFEN_RUECKGAENGIG_TEXT : TAUSCH_RUECKGAENGIG_TEXT,
    ja: 'Rückgängig machen',
    beiJa: async () => {
      erledigt(await sicher(store.diensttauschRueckgaengig(id)), 'Diensttausch rückgängig gemacht ✓');
    },
  });
}

/** Blatt „Rückgabe eintragen“ zum offenen Tausch `id`: Rückgabetag (und bei „abgegeben“ der Dienst, den ihr dort übernehmt). */
export function oeffneRueckgabe({ store }, { id }) {
  const heute = store.heute();
  const e = { id, tag: '', kb: '', ungueltig: false, speichert: false }; // der Entwurf überlebt das Neuzeichnen
  let statusZeile = null;
  let dienstFeld = null;
  let schliesser = () => {};
  let abmelden = () => {};
  const model = () => rueckgabeFormModel(store.getState(), { id, tag: e.tag, kb: e.kb }, heute);

  /** Die Zeile „Ersetzt am …“ bzw. die Meldung (nichts wird neu gezeichnet, damit die Eingabe bleibt); ist der Tausch weg, schließt das Blatt. */
  function zeileAktualisieren() {
    const m = model();
    if (!m) return schliesser();
    if (!statusZeile) return;
    const wartet = e.tag !== '' && !m.tGeladen;
    const warnung = m.fehler !== null && e.tag !== '' && !wartet;
    const text = wartet ? 'Der Monat wird geladen …' : warnung ? m.fehler : m.ersetzt;
    statusZeile.hidden = !text;
    statusZeile.classList.toggle('warnung', warnung);
    fuelle(statusZeile, text);
    if (dienstFeld) dienstFeld.disabled = e.tag === '';
  }

  function tagWaehlen(wert, ungueltig = false) {
    e.tag = wert;
    e.ungueltig = ungueltig;
    if (wert !== '') store.schichtLaden(wert.slice(0, 7)).catch(() => {});
    zeileAktualisieren();
  }

  async function speichern(ev, schliessen) {
    const m = model();
    if (!m) return;
    if (e.tag === '' || e.ungueltig) {
      statusZeile.hidden = false;
      statusZeile.classList.add('warnung');
      fuelle(statusZeile, 'Bitte den Rückgabetag wählen, z. B. 04.01.2027.');
      return;
    }
    const knopf = ev.currentTarget; // nach dem `await` ist currentTarget schon null
    knopf.disabled = true;
    const r = await einmalSpeichern(e, () => store.diensttauschRueckgabe(id, { tag: e.tag, kb: m.kb }));
    if (r && erledigt(r, 'Rückgabe eingetragen ✓')) schliessen();
    else knopf.disabled = false;
  }

  const b = blatt({
    titel: 'Rückgabe eintragen',
    beimSchliessen: () => abmelden(),
    render: ({ schliessen }) => {
      schliesser = schliessen;
      const m = model();
      if (!m) {
        queueMicrotask(schliessen);
        return h('p', { class: 'leise' }, 'Diesen Diensttausch gibt es nicht mehr.');
      }
      const abgegeben = m.richtung === 'abgegeben';
      statusZeile = h('p', { class: 'sp-tag-erinnerung', role: 'status' });
      statusZeile.hidden = true;
      dienstFeld = auswahl('Dienst am Rückgabetag', m.dienste, m.kb, (w) => ((e.kb = w), zeileAktualisieren()));
      queueMicrotask(zeileAktualisieren);
      return h(
        'div',
        { class: 'sp-tausch-form' },
        h('p', { class: 'blatt-text' }, m.kopf.text),
        h('p', { class: 'blatt-text' }, RUECKGABE_ERKLAERUNG[m.richtung]),
        gruppe(
          abgegeben ? 'Tag, an dem ihr einen Dienst übernehmt' : 'Tag, an dem ihr einen Dienst abgebt',
          datumFeld({ wert: e.tag, heute, beschriftung: 'Rückgabetag', beiAenderung: (w) => tagWaehlen(w), beiUngueltig: () => tagWaehlen('', true) }),
        ),
        abgegeben ? gruppe('Dienst am Rückgabetag', dienstFeld) : null,
        statusZeile,
        abbrechenSpeichern(schliessen, (ev) => speichern(ev, schliessen)),
      );
    },
  });
  abmelden = store.subscribe(zeileAktualisieren);
  return b;
}

/** Eine Zeile der Karte: Text, ggf. Hinweis und die Knöpfe, die zum Zustand passen. */
function zeile({ store }, z) {
  const knopf = (text, beiKlick) => h('button', { class: 'knopf klein', type: 'button', onClick: beiKlick }, text);
  const abschliessen = async (ev) => {
    const k = ev.currentTarget; // nach dem `await` ist currentTarget schon null
    k.disabled = true;
    if (!erledigt(await sicher(store.diensttauschAbschliessen(z.id)), 'Diensttausch abgeschlossen ✓')) k.disabled = false;
  };
  const entfernen = () =>
    bestaetigen({
      titel: 'Eintrag entfernen?',
      text: TAUSCH_EINTRAG_ENTFERNEN_TEXT,
      ja: 'Entfernen',
      gefahr: true,
      beiJa: async () => {
        erledigt(await sicher(store.diensttauschVerwerfen(z.id)), 'Eintrag entfernt ✓');
      },
    });
  return h(
    'div',
    { class: `sp-offen-zeile${z.ueberfaellig ? ' ueberfaellig' : ''}`, 'data-id': z.id },
    h('p', { class: 'sp-offen-text' }, z.text),
    z.hinweis ? h('p', { class: 'sp-tag-erinnerung warnung', role: 'note' }, z.hinweis) : null,
    h(
      'div',
      { class: 'sp-offen-knoepfe' },
      z.kannRueckgabe ? knopf('Rückgabe eintragen', () => oeffneRueckgabe({ store }, { id: z.id })) : null,
      z.kannAbschliessen ? knopf('Tausch abschließen', abschliessen) : null,
      z.kannAbschliessen ? knopf('Tausch rückgängig', () => rueckgaengigFragen({ store }, { id: z.id, offen: true })) : null,
      z.kannVerwerfen ? knopf('Eintrag entfernen', entfernen) : null,
    ),
  );
}

/** Die Karte „Offene Diensttausche“ (folgt dem Personenfilter der Seite) oder null, wenn es keine offenen Tausche gibt. */
export function offeneTauscheKarte({ store, ui }) {
  const m = offeneTauscheModel(store.getState(), { filter: rasterFilter(ui.schicht.filter, ui.schicht.pinsel), heute: store.heute() });
  if (!m) return null;
  return h(
    'article',
    { class: 'karte sp-offen' },
    h('h3', { class: 'sp-offen-titel' }, 'Offene Diensttausche'),
    m.personen.map((p) => h('div', { class: 'sp-offen-person', 'data-person': p.person }, h('b', {}, p.kopf), p.zeilen.map((z) => zeile({ store }, z)))),
  );
}
