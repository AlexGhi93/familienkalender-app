// Blatt „Schichtarten“ (Knopf „Schichtarten bearbeiten“ auf der Schichtplan-Seite): je Person die Arten mit farbigem Kürzel, Name und
// Zeiten, ↑ ↓ für die Reihenfolge, „Bearbeiten“, „Entfernen“ (ausblenden; aufklappbar unter „Ausgeblendet (n)“ mit „Wiederherstellen“)
// und „＋ Neue Art“. Das Formular (Name, Kürzel, Farbe, Gruppe, bei Zusatz „🔔 Erinnern“, Nacht, Von/Bis) ersetzt die Liste, bis gespeichert oder abgebrochen
// wird. Es schließt sich erst, wenn die Art im Kalender gespeichert ist; abgelehnte Eingaben (auch erst auf der neuesten Fassung, z. B.
// das andere Telefon hat dasselbe Kürzel schon vergeben) melden sich als Fehler und das Formular bleibt mit der Eingabe offen.
import { h } from './dom.js';
import { blatt, toast } from './components.js';
import { zeitFeld } from './eingabefelder.js';
import { artEntwurf, artEntwurfFehler, schichtArtenModel } from '../app/views/schicht-model.js';
import { MAX_KUERZEL, MAX_NAME, PALETTE } from '../domain/schicht.js';
import { musterKlassen } from './schicht-pinsel.js';

const ALLGEMEINER_FEHLER = 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
const FALSCHE_UHRZEIT = 'Bitte eine Uhrzeit wie 07:30 eingeben.';
const GRUPPEN = [
  ['dienst', 'Dienst'],
  ['zusatz', 'Zusatz'],
];

const kuerzelPille = (a) => h('i', { class: `sp-art-kuerzel sf-${a.farbe} ${musterKlassen(a.muster)}`.trim() }, a.kuerzel);

/** Knöpfe einer Gruppe, von denen genau einer gewählt ist: wechselt die Wahl an Ort und Stelle (kein Neuzeichnen, getippte Zeiten bleiben). */
function waehleIn(gruppe, gewaehlt) {
  for (const knopf of gruppe.querySelectorAll('button')) {
    const an = knopf === gewaehlt;
    knopf.setAttribute('aria-pressed', an ? 'true' : 'false');
    knopf.classList.toggle('aktiv', an);
    if (knopf.classList.contains('sp-farbe')) knopf.textContent = an ? '✓' : '';
  }
}

export function oeffneSchichtarten({ store }) {
  let form = null; // offenes Formular: { person, k (null = neue Art), titel, entwurf }
  let fokusNachher = null; // data-fokus des Knopfs, der nach dem nächsten Zeichnen den Fokus bekommt
  const aufgeklappt = { papa: false, mama: false }; // „Ausgeblendet (n)“ offen (übersteht das Neuzeichnen)
  let letzterStand = '';
  let abmelden = () => {};

  const fehler = (e) => toast(e?.message ?? ALLGEMEINER_FEHLER, { art: 'fehler' });
  // Schon auf dem angezeigten Stand abgelehnte Änderungen landen hier; Speicherfehler (auch fachliche auf der neuesten Fassung) meldet
  // der Store selbst über seine Fehlermeldung, nimmt nur diese Änderung zurück und liest die Schichtarten neu.
  const aendern = (lauf) => lauf.catch(fehler);

  /** Neu zeichnen; der Fokus bleibt auf demselben Knopf (z. B. ↓ nach dem Verschieben), sonst geht er nach `fokusNachher`. */
  function neuZeichnen() {
    const ziel = fokusNachher ?? document.activeElement?.closest?.('.sp-arten-blatt [data-fokus]')?.dataset.fokus ?? null;
    fokusNachher = null;
    b.neuZeichnen();
    const el = ziel ? document.querySelector(`.sp-arten-blatt [data-fokus="${CSS.escape(ziel)}"]`) : null;
    if (el && !el.disabled) el.focus();
  }

  function formOeffnen(person, k) {
    const p = schichtArtenModel(store.getState()).find((x) => x.person === person);
    const art = k === null ? null : [...p.aktiv, ...p.ausgeblendet].find((a) => a.k === k);
    const entwurf = artEntwurf(store.getState(), person, k);
    // `start`: der Stand beim Öffnen; beim Bearbeiten gehen nur geänderte Felder raus (Änderungen des anderen Telefons an den übrigen bleiben)
    form = { person, k, titel: `${art ? art.name : 'Neue Art'} · ${p.emoji} ${p.name}`, entwurf, start: { ...entwurf }, zeiten: {}, speichert: false };
    neuZeichnen();
    document.querySelector('.sp-art-form input')?.focus();
  }

  function formSchliessen() {
    const { person, k } = form;
    form = null;
    fokusNachher = k === null ? `${person}:neu` : `${person}:${k}:bearbeiten`;
    neuZeichnen();
  }

  /** Eine getippte, aber unlesbare Uhrzeit (das Zeitfeld meldet dann '') wird nie still verworfen. */
  const unlesbareZeit = (offen) => ['von', 'bis'].some((feld) => offen.zeiten[feld]?.value.trim() && !offen.entwurf[feld]);

  async function speichern() {
    const offen = form;
    if (!offen || offen.speichert) return;
    const meldung = unlesbareZeit(offen) ? FALSCHE_UHRZEIT : artEntwurfFehler(store.getState(), offen.person, offen.k, offen.entwurf);
    if (meldung) {
      toast(meldung, { art: 'fehler' }); // das Formular bleibt mit der Eingabe offen
      return;
    }
    const geaendert = offen.k === null ? { ...offen.entwurf } : Object.fromEntries(Object.entries(offen.entwurf).filter(([feld, wert]) => wert !== offen.start[feld]));
    const knopf = document.querySelector('.sp-art-form .sp-art-speichern');
    offen.speichert = true;
    if (knopf) {
      knopf.disabled = true;
      knopf.textContent = 'Speichert …';
    }
    let r;
    try {
      r = await store.schichtArtSpeichern(offen.person, geaendert, offen.k ?? undefined);
    } catch (e) {
      r = { ok: false, fehler: e?.message ?? ALLGEMEINER_FEHLER };
    }
    offen.speichert = false;
    if (form !== offen) return; // inzwischen abgebrochen oder das Blatt geschlossen
    // gespeichert, oder es wartet nur auf die Anmeldung (dann speichert der Store es danach selbst): Formular zu
    if (r.ok || r.wartet) {
      formSchliessen();
      return;
    }
    if (knopf) {
      knopf.disabled = false;
      knopf.textContent = 'Speichern';
    }
    // z. B. „Dieses Kürzel gibt es schon.“: Eingabe bleibt stehen. Kam der Fehler beim Schreiben, zeigt die Shell ihn schon (`gemeldet`).
    if (!r.gemeldet) toast(r.fehler ?? ALLGEMEINER_FEHLER, { art: 'fehler' });
  }

  function verschieben(person, a, richtung) {
    const schritte = richtung < 0 ? a.hoch : a.runter;
    // Jeder Schritt tauscht mit der Nachbarin; ausgeblendete dazwischen werden so übersprungen. Der Store reiht die Schritte ein.
    for (let i = 0; i < schritte; i += 1) aendern(store.schichtArtVerschieben(person, a.k, richtung));
  }

  function artZeile(p, a) {
    const fokus = (was) => `${p.person}:${a.k}:${was}`;
    return h(
      'li',
      { class: 'sp-art-zeile' },
      kuerzelPille(a),
      h('span', { class: 'sp-art-text' }, a.text),
      h(
        'span',
        { class: 'sp-art-pfeile' },
        h('button', { class: 'sp-art-pfeil', type: 'button', 'aria-label': `${a.name} nach oben`, 'data-fokus': fokus('hoch'), disabled: a.hoch === 0, onClick: () => verschieben(p.person, a, -1) }, '↑'),
        h('button', { class: 'sp-art-pfeil', type: 'button', 'aria-label': `${a.name} nach unten`, 'data-fokus': fokus('runter'), disabled: a.runter === 0, onClick: () => verschieben(p.person, a, 1) }, '↓'),
      ),
      h(
        'span',
        { class: 'sp-art-aktionen' },
        h('button', { class: 'knopf klein', type: 'button', 'aria-label': `${a.name} bearbeiten`, 'data-fokus': fokus('bearbeiten'), onClick: () => formOeffnen(p.person, a.k) }, 'Bearbeiten'),
        h(
          'button',
          {
            class: 'knopf klein',
            type: 'button',
            'aria-label': `${a.name} entfernen`,
            onClick: () => {
              fokusNachher = `${p.person}:neu`;
              aendern(store.schichtArtArchivieren(p.person, a.k, true));
            },
          },
          'Entfernen',
        ),
      ),
    );
  }

  function ausgeblendetZeile(p, a) {
    return h(
      'li',
      { class: 'sp-art-zeile aus' },
      kuerzelPille(a),
      h('span', { class: 'sp-art-text' }, a.text),
      h(
        'button',
        {
          class: 'knopf klein',
          type: 'button',
          'aria-label': `${a.name} wiederherstellen`,
          onClick: () => {
            fokusNachher = `${p.person}:${a.k}:bearbeiten`;
            aendern(store.schichtArtArchivieren(p.person, a.k, false));
          },
        },
        'Wiederherstellen',
      ),
    );
  }

  function personAbschnitt(p) {
    const aus = p.ausgeblendet.length
      ? h(
          'details',
          { class: 'sp-arten-aus', open: aufgeklappt[p.person], onToggle: (e) => (aufgeklappt[p.person] = e.target.open) },
          h('summary', {}, `Ausgeblendet (${p.ausgeblendet.length})`),
          h('p', { class: 'leise' }, 'Stehen an alten Tagen weiter da, fehlen aber beim Eintragen.'),
          h(
            'ul',
            { class: 'sp-arten-liste' },
            p.ausgeblendet.map((a) => ausgeblendetZeile(p, a)),
          ),
        )
      : null;
    return h(
      'section',
      { class: 'karte sp-arten-person', 'data-person': p.person },
      h('h3', {}, `${p.emoji} ${p.name}`),
      h(
        'ul',
        { class: 'sp-arten-liste aktiv' },
        p.aktiv.map((a) => artZeile(p, a)),
      ),
      aus,
      h('button', { class: 'knopf klein sp-arten-neu', type: 'button', 'data-fokus': `${p.person}:neu`, onClick: () => formOeffnen(p.person, null) }, '＋ Neue Art'),
    );
  }

  function textFeld(beschriftung, feld, max, extra = {}) {
    const eingabe = h('input', {
      type: 'text',
      maxlength: String(max),
      autocomplete: 'off',
      enterkeyhint: 'done',
      ...extra,
      onInput: (e) => {
        form.entwurf[feld] = e.target.value;
      },
      onKeydown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        speichern();
      },
    });
    eingabe.value = form.entwurf[feld];
    return h('label', { class: 'feld' }, h('span', {}, beschriftung), eingabe);
  }

  function formular() {
    const e = form.entwurf;
    const farben = h(
      'div',
      { class: 'sp-farben', role: 'group', 'aria-label': 'Farbe' },
      PALETTE.map((f) =>
        h(
          'button',
          {
            class: `sp-farbe sf-${f.id}${f.id === e.farbe ? ' aktiv' : ''}`,
            type: 'button',
            'aria-label': f.name,
            title: f.name,
            'aria-pressed': f.id === e.farbe ? 'true' : 'false',
            onClick: (ev) => {
              e.farbe = f.id;
              waehleIn(farben, ev.currentTarget);
            },
          },
          f.id === e.farbe ? '✓' : '',
        ),
      ),
    );
    const gruppen = h(
      'div',
      { class: 'chips sp-art-gruppe', role: 'group', 'aria-label': 'Gruppe' },
      GRUPPEN.map(([wert, text]) =>
        h(
          'button',
          {
            class: `chip${wert === e.gruppe ? ' aktiv' : ''}`,
            type: 'button',
            'aria-pressed': wert === e.gruppe ? 'true' : 'false',
            onClick: (ev) => {
              e.gruppe = wert;
              waehleIn(gruppen, ev.currentTarget);
              erinnernZeile.hidden = wert !== 'zusatz'; // „Erinnern“ gibt es nur bei Zusätzen
            },
          },
          text,
        ),
      ),
    );
    const nacht = h('input', {
      type: 'checkbox',
      onChange: (ev) => {
        e.nacht = ev.target.checked;
      },
    });
    nacht.checked = e.nacht;
    const erinnern = h('input', {
      type: 'checkbox',
      onChange: (ev) => {
        e.erinnern = ev.target.checked;
      },
    });
    erinnern.checked = e.erinnern;
    const erinnernZeile = h('label', { class: 'sp-art-nacht sp-art-erinnern', hidden: e.gruppe !== 'zusatz' }, erinnern, ' 🔔 Erinnern (1 Tag und 1 Stunde vorher)');

    return h(
      'section',
      { class: 'karte sp-art-form' },
      h('h3', {}, form.titel),
      h('div', { class: 'sp-art-felder' }, textFeld('Name', 'name', MAX_NAME), textFeld('Kürzel', 'kuerzel', MAX_KUERZEL, { autocapitalize: 'characters', class: 'sp-art-kuerzel-feld' })),
      h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Farbe'), farben),
      h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, 'Gruppe'), gruppen, h('small', { class: 'leise' }, 'Dienst: einer pro Tag. Zusatz: kommt dazu, mit Uhrzeit.')),
      erinnernZeile,
      h('label', { class: 'sp-art-nacht' }, nacht, ' Nacht ☾'),
      h('small', { class: 'leise' }, 'Zeiten über Mitternacht (z. B. 22:00–06:00) gelten auch ohne Haken als Nacht.'),
      h(
        'div',
        { class: 'feld' },
        h('span', { id: 'sp-art-zeiten-hinweis' }, 'Zeiten (optional, bei Zusatz nötig)'),
        h(
          'div',
          { class: 'sp-tag-zeiten', role: 'group', 'aria-labelledby': 'sp-art-zeiten-hinweis' },
          ['von', 'bis'].map((feld) => {
            const beschriftung = feld === 'von' ? 'Von' : 'Bis';
            const knoten = zeitFeld({ wert: e[feld], beschriftung, beiAenderung: (w) => (e[feld] = w) });
            form.zeiten[feld] = knoten.querySelector('input[type="text"]');
            return h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, beschriftung), knoten);
          }),
        ),
      ),
      h(
        'div',
        { class: 'knopfzeile' },
        h('button', { class: 'knopf klein', type: 'button', onClick: formSchliessen }, 'Abbrechen'),
        h('button', { class: 'knopf klein primaer sp-art-speichern', type: 'button', onClick: speichern }, 'Speichern'),
      ),
    );
  }

  const b = blatt({
    titel: 'Schichtarten',
    beimSchliessen: () => abmelden(),
    render: () => {
      const m = schichtArtenModel(store.getState());
      letzterStand = JSON.stringify(m);
      return h('div', { class: 'sp-arten-blatt' }, form ? formular() : m.map(personAbschnitt));
    },
  });
  abmelden = store.subscribe(() => {
    if (form) return; // mitten im Formular nicht neu zeichnen (Eingaben und Fokus bleiben); die Liste kommt danach frisch
    if (JSON.stringify(schichtArtenModel(store.getState())) !== letzterStand) neuZeichnen();
  });
  return b;
}
