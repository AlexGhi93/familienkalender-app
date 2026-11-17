// Tagesblatt des Schichtplans (ein Tipp auf einen Tag ohne Pinsel): beide Personen, gleich welcher Filter auf der Seite gilt.
// Je Person: die eingetragene Art (mit Zeiten, ☾ bei Nacht), Knöpfe der aktiven Dienst-Arten und „Frei“ (ein Tipp speichert sofort),
// eine Notiz (eine Zeile, gespeichert beim Verlassen des Feldes oder mit Enter) und die Zusätze des Tages mit ✕ (danach „Gelöscht ✓ ·
// Rückgängig“); bei einem Dienst außer Urlaub „Zeiten für diesen Tag“ (Von/Bis, vorbelegt mit den Zeiten der Art; gespeichert, wenn beide
// stimmen oder beide leer sind); je Zusatz-Art ein
// Knopf „＋ <Name>“ (z. B. „＋ Dienstbesprechung“), der gleich Von/Bis öffnet, darunter der Hinweis auf die Erinnerung – oder eine
// Warnung, wenn laut Geräte-Register (ui.push) kein Telefon der Person gehört bzw. dieses Telefon das nicht sehen kann.
import { fuelle, h } from './dom.js';
import { blatt, toast } from './components.js';
import { zeitFeld } from './eingabefelder.js';
import { erinnerungHinweis, schichtTagModel } from '../app/views/schicht-model.js';
import { MAX_NOTIZ } from '../domain/schicht.js';
import { mitZeiten, musterKlassen } from './schicht-pinsel.js';
import { geloeschtMelden, sicherLoeschen } from './fortschritt.js';

const ALLGEMEINER_FEHLER = 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
const gleicheNotiz = (a, b) => a.replace(/\s+/g, ' ').trim() === b;

/** Kürzel als farbige Pille (wie in der Pinsel-Leiste), Urlaub und Ersatzdienst zusätzlich gestreift; „Frei“ gestrichelt. */
const kuerzelPille = (kuerzel, klasse) => h('i', { class: `sp-tag-kuerzel ${klasse}` }, kuerzel);
const farbKlasse = (a) => `sf-${a.farbe} ${musterKlassen(a.muster)}`.trim();

/**
 * Öffnet das Tagesblatt für `datum` ('JJJJ-MM-TT'); es zeichnet sich bei Änderungen im Store neu (nur wenn sich an dem Tag etwas ändert).
 * `ui.push` (Google-Modus) sagt, wem laut Geräte-Register ein Telefon gehört; ohne (Demo) gibt es keine Benachrichtigungen.
 */
export function oeffneSchichtTag({ store, ui = null }, datum) {
  const jm = datum.slice(0, 7);
  const tag = Number(datum.slice(8));
  const entwurf = { papa: null, mama: null }; // getippte, noch nicht gespeicherte Notizen (überstehen das Neuzeichnen)
  const notizFelder = {}; // die Notizfelder der letzten Zeichnung, je Person
  let zusatz = null; // offenes Formular „＋ <Name>“: { person, k, von, bis }
  const zeitEntwurf = { papa: null, mama: null }; // Von/Bis des Tages, noch nicht gespeichert: { von, bis, schlecht: { von, bis } }
  const zeitFelder = {}; // je Person { von, bis, hinweis } der letzten Zeichnung
  const kopfFelder = {}; // je Person die Zeile mit der Art im Kopf der Karte
  let zeitenStill = false; // Zeiten werden gerade gespeichert: das Blatt wird nicht neu gezeichnet (der Tipp auf einen anderen Knopf ginge sonst verloren)
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
    const felder = () => ({ ...notizFelder, ...Object.fromEntries(['papa', 'mama'].flatMap((p) => ['von', 'bis'].map((w) => [`${p}-${w}`, zeitFelder[p]?.[w]?.querySelector('input')]))) });
    const fokus = Object.entries(felder()).find(([, feld]) => feld && feld === document.activeElement)?.[0] ?? null;
    const marke = fokus ? [felder()[fokus].selectionStart, felder()[fokus].selectionEnd] : null;
    zeichnet = true;
    try {
      b.neuZeichnen();
    } finally {
      zeichnet = false;
    }
    const neu = fokus ? felder()[fokus] : null;
    if (neu) {
      neu.focus();
      neu.setSelectionRange(...marke);
    }
  }

  /** Die Zeile mit der Art im Kopf einer Karte nach einem stillen Übernehmen neu schreiben. */
  function kopfAktualisieren() {
    for (const p of model().personen) if (kopfFelder[p.person]) fuelle(kopfFelder[p.person], mitZeiten(p.schicht.nacht ? `${p.schicht.text} ☾` : p.schicht.text));
  }

  const ZEIT_FEHLT = 'Bitte beide Uhrzeiten eingeben.';
  const ZEIT_UNLESBAR = 'Bitte eine Uhrzeit wie 07:30 eingeben.';
  const ZEIT_GLEICH = 'Gleiche Uhrzeiten zählen als Nacht (☾).';
  /** Meldung unter den Zeiten: Warnung (nichts gespeichert) oder Hinweis; '' = keine. */
  const zeitMeldung = (d) => {
    if (d.schlecht?.von || d.schlecht?.bis) return { text: ZEIT_UNLESBAR, warnung: true };
    if ((d.von === '') !== (d.bis === '')) return { text: ZEIT_FEHLT, warnung: true };
    return { text: d.von !== '' && d.von === d.bis ? ZEIT_GLEICH : '', warnung: false };
  };
  function meldungSetzen(hinweis, d) {
    const m = zeitMeldung(d);
    fuelle(hinweis, m.text);
    hinweis.hidden = m.text === '';
    hinweis.classList.toggle('warnung', m.warnung);
  }

  /** Eine Eingabe in Von oder Bis (`wert` '' = leer; `schlecht` = nicht lesbar): gespeichert wird, wenn beide Zeiten stimmen oder beide leer sind. */
  function zeitEingabe(p, feldName, wert, schlecht) {
    const aktuell = model().personen.find((x) => x.person === p.person); // frisch: nach einem stillen Übernehmen ist `p` veraltet
    const d = (zeitEntwurf[p.person] ??= { von: aktuell.zeiten.von, bis: aktuell.zeiten.bis, schlecht: { von: false, bis: false } });
    d[feldName] = wert;
    d.schlecht[feldName] = schlecht;
    if (zeitFelder[p.person]) meldungSetzen(zeitFelder[p.person].hinweis, d);
    if (zeitMeldung(d).warnung) return; // nur eine Zeit oder Unlesbares: nichts speichern, der Hinweis steht da
    zeitEntwurf[p.person] = null;
    if (d.von === aktuell.zeiten.von && d.bis === aktuell.zeiten.bis) return;
    zeitenStill = d.von !== ''; // beide leer: die Zeiten der Art kommen zurück, das Blatt muss neu gezeichnet werden
    let lauf;
    try {
      lauf = store.schichtTagZeiten(jm, tag, p.person, { von: d.von, bis: d.bis });
    } finally {
      zeitenStill = false;
    }
    lauf.catch((e) => {
      zeitEntwurf[p.person] = d; // die Eingabe bleibt stehen, damit man sie korrigieren kann
      fehler(e);
    });
  }

  /** „Zeiten für diesen Tag“: Von/Bis, vorbelegt mit den Zeiten der Art; bei einer Art ohne Zeiten (z. B. Schulung) leer. */
  function zeitenBereich(p) {
    if (!p.zeitenMoeglich) return null;
    const d = zeitEntwurf[p.person] ?? { von: p.zeiten.von, bis: p.zeiten.bis, schlecht: { von: false, bis: false } };
    const feldFuer = (name, beschriftung) =>
      h(
        'div',
        { class: 'feld' },
        h('span', { 'aria-hidden': 'true' }, beschriftung),
        zeitFeld({ wert: d[name], beschriftung, erstBeiFertig: true, beiAenderung: (w) => zeitEingabe(p, name, w, false), beiUngueltig: () => zeitEingabe(p, name, '', true) }),
      );
    const von = feldFuer('von', 'Von');
    const bis = feldFuer('bis', 'Bis');
    const hinweis = h('p', { class: 'sp-tag-zeitmeldung', role: 'status' });
    meldungSetzen(hinweis, d);
    zeitFelder[p.person] = { von: von.lastChild, bis: bis.lastChild, hinweis };
    return h(
      'div',
      { class: 'sp-tag-tagzeiten', role: 'group', 'aria-label': `Zeiten für diesen Tag, ${p.name}` },
      h('p', { class: 'sp-tag-tagzeiten-kopf' }, '🕘 Zeiten für diesen Tag'),
      h('div', { class: 'sp-tag-zeiten' }, von, bis),
      hinweis,
    );
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

  /** Dienst wählen (oder „Frei“); hat der neue Dienst keine Zeiten (z. B. Schulung), steht der Cursor gleich in „Von“. */
  function artWaehlen(p, schonAktiv, k) {
    zeitEntwurf[p.person] = null; // andere Art oder anderer Tag: die Eingabe gilt nicht mehr
    aendern(store.schichtSetzen(jm, tag, p.person, k));
    if (schonAktiv || k === null) return;
    const q = model().personen.find((x) => x.person === p.person);
    if (q.zeitenMoeglich && q.zeiten.artVon === '' && !q.zeiten.eigene) zeitFelder[p.person]?.von.querySelector('input')?.focus();
  }

  function artenReihe(p) {
    const knopf = (aktiv, pille, name, k) =>
      h(
        'button',
        { class: `sp-tag-art ${aktiv ? 'aktiv' : ''}`.trim(), type: 'button', 'aria-pressed': aktiv ? 'true' : 'false', onClick: () => artWaehlen(p, aktiv, k) },
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
          h('span', { class: 'sp-tag-zusatz-text' }, mitZeiten(z.text)),
          ' ',
          h(
            'button',
            {
              class: 'sp-tag-weg',
              type: 'button',
              'aria-label': `${z.text} entfernen`,
              onClick: async (ev) => {
                const knopf = ev.currentTarget; // nach dem `await` ist currentTarget schon null
                knopf.disabled = true; // genau einmal (das Neuzeichnen ersetzt den Knopf)
                if (!geloeschtMelden(await sicherLoeschen(store.schichtZusatzLoeschen(jm, tag, p.person, { k: z.k, von: z.von, bis: z.bis })))) knopf.disabled = false;
              },
            },
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

  /** Hinweis bzw. Warnung unter dem Formular (gelesen wird nichts: das Register stammt aus dem letzten Abgleich dieses Telefons). */
  function erinnerungZeile(person) {
    const hw = erinnerungHinweis(person, ui?.push ? ui.push.personenMitTelefon() : undefined);
    const warnung = hw.art === 'fehlt' || hw.art === 'unbekannt';
    return h('p', { class: `sp-tag-erinnerung${warnung ? ' warnung' : ''}`, role: warnung ? 'note' : null }, hw.text);
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
        { class: 'sp-tag-zusatz-form', role: 'group', 'aria-label': `${art.name} hinzufügen` },
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
      art.erinnern ? erinnerungZeile(p.person) : null,
    ];
  }

  function kopfZeile(p) {
    const klein = h('small', {}, mitZeiten(p.schicht.nacht ? `${p.schicht.text} ☾` : p.schicht.text));
    kopfFelder[p.person] = klein;
    return h('h3', { class: 'sp-tag-kopf' }, h('span', {}, `${p.emoji} ${p.name}`), klein);
  }

  function personKarte(p) {
    return h(
      'article',
      { class: 'karte sp-tag-karte', 'data-person': p.person },
      kopfZeile(p),
      artenReihe(p),
      zeitenBereich(p),
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
    if (notizStill || zeitenStill) {
      letzterStand = stand;
      kopfAktualisieren();
    } else neuZeichnen();
  });
  return b;
}
