// Tagesblatt des Schichtplans (ein Tipp auf einen Tag ohne Pinsel): beide Personen, gleich welcher Filter auf der Seite gilt.
// Je Person: die eingetragene Art (mit Zeiten, ☾ bei Nacht), Knöpfe der aktiven Dienst-Arten und „Frei“ (ein Tipp speichert sofort),
// eine Notiz (eine Zeile, gespeichert beim Verlassen des Feldes oder mit Enter) und die Zusätze des Tages mit ✕; je Zusatz-Art ein
// Knopf „＋ <Name>“ (z. B. „＋ Dienstbesprechung“), der gleich Von/Bis öffnet, darunter der Hinweis auf die Erinnerung.
import { h } from './dom.js';
import { blatt, toast } from './components.js';
import { zeitFeld } from './eingabefelder.js';
import { schichtTagModel } from '../app/views/schicht-model.js';
import { MAX_NOTIZ } from '../domain/schicht.js';
import { musterKlassen } from './schicht-pinsel.js';

const ALLGEMEINER_FEHLER = 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
const gleicheNotiz = (a, b) => a.replace(/\s+/g, ' ').trim() === b;

/** Kürzel als farbige Pille (wie in der Pinsel-Leiste), Urlaub und Ersatzdienst zusätzlich gestreift; „Frei“ gestrichelt. */
const kuerzelPille = (kuerzel, klasse) => h('i', { class: `sp-tag-kuerzel ${klasse}` }, kuerzel);
const farbKlasse = (a) => `sf-${a.farbe} ${musterKlassen(a.muster)}`.trim();

/** Öffnet das Tagesblatt für `datum` ('JJJJ-MM-TT'); es zeichnet sich bei Änderungen im Store neu (nur wenn sich an dem Tag etwas ändert). */
export function oeffneSchichtTag({ store }, datum) {
  const jm = datum.slice(0, 7);
  const tag = Number(datum.slice(8));
  const entwurf = { papa: null, mama: null }; // getippte, noch nicht gespeicherte Notizen (überstehen das Neuzeichnen)
  const notizFelder = {}; // die Notizfelder der letzten Zeichnung, je Person
  let zusatz = null; // offenes Formular „＋ <Name>“: { person, k, von, bis }
  let zeichnet = false; // während des Neuzeichnens zählt das Verlassen eines Feldes nicht als „fertig“
  let notizStill = false; // eine eigene Notiz wird gerade übernommen: das Feld zeigt sie schon, also nicht neu zeichnen
  let letzterStand = '';
  let abmelden = () => {};

  const model = () => schichtTagModel(store.getState(), datum);
  const fehler = (e) => toast(e?.message ?? ALLGEMEINER_FEHLER, { art: 'fehler' });
  // Abgelehnte Änderungen (z. B. „Höchstens 3 Zusätze pro Tag.“) landen hier; Speicherfehler meldet der Store selbst.
  const aendern = (lauf) => lauf.catch(fehler);

  function notizSpeichern(person) {
    const text = entwurf[person];
    if (text === null) return;
    entwurf[person] = null;
    const alt = model().personen.find((p) => p.person === person).notiz;
    if (gleicheNotiz(text, alt)) return;
    // Gespeichert wird beim Verlassen des Feldes, also oft mitten in einem Tipp auf einen anderen Knopf des Blatts. Würde das Blatt
    // jetzt neu gezeichnet, wäre dieser Knopf weg, bevor der Tipp ankommt – deshalb wird der Stand nur übernommen (der Store meldet
    // die Änderung sofort, noch innerhalb dieses Aufrufs).
    notizStill = true;
    let lauf;
    try {
      lauf = store.schichtNotiz(jm, tag, person, text);
    } finally {
      notizStill = false;
    }
    lauf.catch((e) => {
      entwurf[person] = text; // die Eingabe bleibt stehen, damit man sie korrigieren kann
      fehler(e);
    });
  }

  /** Neu zeichnen, ohne die Notiz, in der gerade geschrieben wird, zu verlieren (Text, Fokus und Schreibmarke bleiben). */
  function neuZeichnen() {
    const fokus = Object.entries(notizFelder).find(([, feld]) => feld === document.activeElement)?.[0] ?? null;
    const marke = fokus ? [notizFelder[fokus].selectionStart, notizFelder[fokus].selectionEnd] : null;
    zeichnet = true;
    try {
      b.neuZeichnen();
    } finally {
      zeichnet = false;
    }
    if (fokus && notizFelder[fokus]) {
      notizFelder[fokus].focus();
      notizFelder[fokus].setSelectionRange(...marke);
    }
  }

  function notizFeld(p) {
    const feld = h('input', {
      type: 'text',
      maxlength: String(MAX_NOTIZ),
      enterkeyhint: 'done',
      autocomplete: 'off',
      placeholder: 'z. B. Dienst 12',
      onInput: (e) => {
        entwurf[p.person] = e.target.value;
      },
      onBlur: () => {
        if (!zeichnet) notizSpeichern(p.person);
      },
      onKeydown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        notizSpeichern(p.person);
        e.target.blur();
      },
    });
    feld.value = entwurf[p.person] ?? p.notiz;
    notizFelder[p.person] = feld;
    return h('label', { class: 'feld sp-tag-notiz' }, h('span', {}, 'Notiz (optional)'), feld);
  }

  function artenReihe(p) {
    const knopf = (aktiv, pille, name, k) =>
      h(
        'button',
        { class: `sp-tag-art ${aktiv ? 'aktiv' : ''}`.trim(), type: 'button', 'aria-pressed': aktiv ? 'true' : 'false', onClick: () => aendern(store.schichtSetzen(jm, tag, p.person, k)) },
        pille,
        ' ',
        name,
      );
    const n = p.nichtWaehlbar;
    return h(
      'div',
      { class: 'sp-tag-arten', role: 'group', 'aria-label': `Schicht ${p.name}` },
      p.arten.map((a) => knopf(a.aktiv, kuerzelPille(a.kuerzel, farbKlasse(a)), a.name, a.k)),
      n ? h('span', { class: 'sp-tag-art inaktiv' }, kuerzelPille(n.kuerzel, farbKlasse(n)), ' ', n.name) : null,
      knopf(p.frei, kuerzelPille('–', 'frei'), 'Frei', null),
    );
  }

  function zusatzListe(p) {
    if (p.zusaetze.length === 0) return null;
    return h(
      'ul',
      { class: 'sp-tag-zusaetze' },
      p.zusaetze.map((z) =>
        h(
          'li',
          { class: 'sp-tag-zusatz' },
          kuerzelPille(z.kuerzel, `sf-${z.farbe}`),
          ' ',
          h('span', { class: 'sp-tag-zusatz-text' }, z.text),
          ' ',
          h(
            'button',
            { class: 'sp-tag-weg', type: 'button', 'aria-label': `${z.text} entfernen`, onClick: () => aendern(store.schichtZusatzEntfernen(jm, tag, p.person, { k: z.k, von: z.von, bis: z.bis })) },
            '✕',
          ),
        ),
      ),
    );
  }

  async function zusatzHinzufuegen() {
    const form = zusatz;
    if (!form.von || !form.bis) {
      toast('Bitte Von und Bis eingeben.', { art: 'fehler' });
      return;
    }
    zusatz = null;
    const lauf = store.schichtZusatzHinzufuegen(jm, tag, form.person, { k: form.k, von: form.von, bis: form.bis });
    neuZeichnen(); // auch wenn sich nichts ändert (derselbe Zusatz war schon da), schließt das Formular
    try {
      await lauf;
    } catch (e) {
      zusatz = form; // abgelehnt: das Formular bleibt mit der Eingabe offen
      neuZeichnen();
      fehler(e);
    }
  }

  /** Je Zusatz-Art ein Knopf „＋ <Name>“ (z. B. „＋ Dienstbesprechung“); er öffnet gleich Von/Bis mit den Zeiten der Art. */
  function zusatzKnoepfe(p) {
    return h(
      'div',
      { class: 'sp-tag-plus-reihe' },
      p.zusatzArten.map((a) =>
        h(
          'button',
          {
            class: 'knopf klein sp-tag-plus',
            type: 'button',
            onClick: () => {
              zusatz = { person: p.person, k: a.k, von: a.von, bis: a.bis };
              neuZeichnen();
            },
          },
          `＋ ${a.name}`,
        ),
      ),
    );
  }

  function zusatzBereich(p) {
    if (p.zusatzArten.length === 0) return null; // diese Person hat keine Zusatz-Art (anlegen unter „Schichtarten bearbeiten“)
    const form = zusatz?.person === p.person ? zusatz : null;
    const art = form ? p.zusatzArten.find((a) => a.k === form.k) : null;
    if (!art) {
      if (form) zusatz = null; // die Art wurde inzwischen ausgeblendet (z. B. auf dem anderen Telefon): Formular zu
      return zusatzKnoepfe(p);
    }
    return [
      h(
        'div',
        { class: 'sp-tag-zusatz-form' },
        h('p', { class: 'sp-tag-zusatz-kopf' }, kuerzelPille(art.kuerzel, `sf-${art.farbe}`), ' ', art.name),
        h(
          'div',
          { class: 'sp-tag-zeiten' },
          h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Von'), zeitFeld({ wert: form.von, beschriftung: 'Von', beiAenderung: (w) => (form.von = w) })),
          h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Bis'), zeitFeld({ wert: form.bis, beschriftung: 'Bis', beiAenderung: (w) => (form.bis = w) })),
        ),
        h(
          'div',
          { class: 'knopfzeile' },
          h(
            'button',
            {
              class: 'knopf klein',
              type: 'button',
              onClick: () => {
                zusatz = null;
                neuZeichnen();
              },
            },
            'Abbrechen',
          ),
          h('button', { class: 'knopf klein primaer', type: 'button', onClick: zusatzHinzufuegen }, 'Hinzufügen'),
        ),
      ),
      art.hinweis ? h('p', { class: 'sp-tag-erinnerung' }, art.hinweis) : null,
    ];
  }

  function personKarte(p) {
    return h(
      'article',
      { class: 'karte sp-tag-karte', 'data-person': p.person },
      h('h3', { class: 'sp-tag-kopf' }, h('span', {}, `${p.emoji} ${p.name}`), h('small', {}, p.schicht.nacht ? `${p.schicht.text} ☾` : p.schicht.text)),
      artenReihe(p),
      notizFeld(p),
      zusatzListe(p),
      zusatzBereich(p),
    );
  }

  const b = blatt({
    titel: model().titel,
    beimSchliessen: () => {
      abmelden();
      for (const person of Object.keys(entwurf)) notizSpeichern(person); // z. B. mit Escape mitten im Schreiben geschlossen
    },
    render: () => {
      const m = model();
      letzterStand = JSON.stringify(m);
      return [m.geladen ? null : h('p', { class: 'leise' }, 'Dieser Monat ist noch nicht geladen.'), m.personen.map(personKarte)];
    },
  });
  abmelden = store.subscribe(() => {
    const stand = JSON.stringify(model());
    if (stand === letzterStand) return; // Änderungen an anderen Tagen stören das Schreiben nicht
    if (notizStill) letzterStand = stand;
    else neuZeichnen();
  });
  return b;
}
