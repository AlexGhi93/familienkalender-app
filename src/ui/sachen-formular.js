import { fuelle, h } from './dom.js';
import { chip, farbe, toast, wochenStepper } from './components.js';
import { KITA_RICHTUNGEN, KITA_VORSCHLAEGE, TYPES } from '../domain/types.js';
import { addDays } from '../domain/dates.js';
import { MAX_MITNEHMEN, MAX_MITNEHMEN_EINTRAG, mitRichtung, terminAusEntwurf, terminVorschau } from '../app/termin.js';
import { MAX_SERIEN_WOCHEN, serieZusammenfassung, wochenSerie } from '../app/serie.js';
import { datumKurz } from '../app/format-de.js';
import { pyjamasWechsel } from './pyjamas-wechsel.js';

const RICHTUNG_EMOJI = { hin: '🎒', heim: '🏠' };

/** Die zuletzt verwendeten Sachen (neueste zuerst, ohne Dubletten), aus den vorhandenen Erinnerungen. */
function zuletztBenutzt(state) {
  const gesehen = [];
  const sachen = state.termine.filter((t) => t.typ === 'kita_sache').sort((a, b) => b.date.localeCompare(a.date));
  for (const t of sachen) for (const s of t.mitnehmen) if (!gesehen.includes(s)) gesehen.push(s);
  return gesehen.slice(0, 8);
}

/** Formular „Sachen für Krabbelstube/Kindergarten“ (neu oder zum Bearbeiten, je nach `ui.neu.bearbeiten`). */
export function sachenFormular({ store, ui }, kachel) {
  const n = ui.neu;
  const state = store.getState();
  const settings = state.settings;
  const heute = store.heute();

  const richtungBox = h('div', { class: 'chip-reihe' });
  const gewaehltBox = h('div', { class: 'chip-reihe' });
  const wiederholenBox = h('div', { class: 'feld' });
  const planBox = h('div', { class: 'vorschau' });
  const vorschauBox = h('div', { class: 'vorschau', 'aria-live': 'polite' });
  const pyjamasBox = h('div', {});
  pyjamasBox.hidden = true;
  const vorschlagChips = new Map(); // Text -> alle Buttons dazu (Gruppen und „Zuletzt benutzt“)

  const datumFeld = h('input', {
    type: 'date',
    value: n.date,
    required: true,
    onInput: (e) => {
      n.date = e.target.value;
      zeichnePlan();
      zeichneVorschau();
    },
  });
  const zeitFeld = h('input', {
    type: 'time',
    value: n.time,
    onInput: (e) => {
      n.time = e.target.value;
      n.zeitGeaendert = true;
      zeichneVorschau();
    },
  });

  function zeichneVorschau() {
    const v = terminVorschau(n, settings);
    vorschauBox.classList.toggle('zu-lang', v.ok && v.zuLang);
    fuelle(
      vorschauBox,
      h('small', {}, 'So steht es im Kalender und in der Benachrichtigung:'),
      v.ok ? h('b', {}, v.titel) : h('span', { class: 'leise' }, v.meldung),
      v.ok ? h('small', {}, v.zuLang ? `${v.laenge} von ${v.limit} Zeichen: etwas weniger Sachen, damit alles in der Benachrichtigung steht.` : `${v.laenge} von ${v.limit} Zeichen`) : null,
    );
  }

  function zeichneRichtung() {
    fuelle(
      richtungBox,
      Object.values(KITA_RICHTUNGEN).map((r) =>
        chip(`${RICHTUNG_EMOJI[r.id]} ${r.label}`, {
          art: n.richtung === r.id ? 'aktiv' : '',
          farbeHex: TYPES.kita_sache.farbe,
          onClick: () => {
            Object.assign(n, mitRichtung(n, r.id, settings));
            zeitFeld.value = n.time;
            zeichneRichtung();
            zeichnePlan();
            zeichneVorschau();
          },
        }),
      ),
    );
  }

  function markiereVorschlaege() {
    for (const [text, knoepfe] of vorschlagChips) {
      for (const k of knoepfe) {
        const aktiv = n.mitnehmen.includes(text);
        k.classList.toggle('aktiv', aktiv);
        k.setAttribute('aria-pressed', String(aktiv));
      }
    }
  }

  function zeichneGewaehlt() {
    fuelle(
      gewaehltBox,
      n.mitnehmen.map((text) =>
        h(
          'button',
          { class: 'chip entfernbar', type: 'button', 'aria-label': `${text} entfernen`, onClick: () => umschalten(text) },
          `🎒 ${text}`,
          h('span', { class: 'x', 'aria-hidden': 'true' }, '✕'),
        ),
      ),
      n.mitnehmen.length === 0 ? h('span', { class: 'leise' }, 'Noch nichts gewählt: unten antippen oder selbst eintragen.') : null,
    );
  }

  function aktualisiereSachen() {
    zeichneGewaehlt();
    markiereVorschlaege();
    zeichneVorschau();
  }

  function umschalten(text) {
    if (n.mitnehmen.includes(text)) {
      n.mitnehmen = n.mitnehmen.filter((x) => x !== text);
    } else if (n.mitnehmen.length >= MAX_MITNEHMEN) {
      toast(`Höchstens ${MAX_MITNEHMEN} Sachen pro Erinnerung.`);
      return;
    } else {
      n.mitnehmen = [...n.mitnehmen, text];
    }
    aktualisiereSachen();
  }

  function vorschlagButton(text) {
    const k = chip(text, { farbeHex: TYPES.kita_sache.farbe, onClick: () => umschalten(text) });
    vorschlagChips.set(text, [...(vorschlagChips.get(text) ?? []), k]);
    return k;
  }

  const gruppen = Object.entries(KITA_VORSCHLAEGE).map(([name, liste], i) =>
    h('details', { class: 'gruppe', open: i === 0 }, h('summary', {}, name), h('div', { class: 'chip-reihe' }, liste.map(vorschlagButton))),
  );
  const zuletzt = zuletztBenutzt(state);
  const zuletztBlock =
    zuletzt.length > 0 && !n.bearbeiten
      ? h('div', { class: 'gruppe-offen' }, h('span', { class: 'leise' }, 'Zuletzt benutzt'), h('div', { class: 'chip-reihe' }, zuletzt.map(vorschlagButton)))
      : null;

  function eigeneSache() {
    const eingabe = h('input', { type: 'text', maxlength: String(MAX_MITNEHMEN_EINTRAG), autocomplete: 'off', placeholder: 'Etwas anderes, z. B. Lieblingsbuch', 'aria-label': 'Eigene Sache' });
    const hinzufuegen = () => {
      const text = eingabe.value.trim();
      if (text === '') return;
      eingabe.value = '';
      if (!n.mitnehmen.includes(text)) umschalten(text);
    };
    eingabe.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        hinzufuegen();
      }
    });
    return h('div', { class: 'zeile-eingabe' }, eingabe, h('button', { class: 'knopf klein', type: 'button', onClick: hinzufuegen }, 'Hinzufügen'));
  }

  function zeichneWiederholen() {
    if (n.bearbeiten) {
      fuelle(wiederholenBox, n.serie ? h('p', { class: 'leise' }, 'Diese Änderung gilt nur für diese eine Sache, nicht für die ganze Serie.') : null);
      return;
    }
    const einmalig = n.wiederholen.art === 'einmalig';
    fuelle(
      wiederholenBox,
      h('span', {}, 'Wiederholen'),
      h(
        'div',
        { class: 'chip-reihe' },
        chip('Einmalig', {
          art: einmalig ? 'aktiv' : '',
          onClick: () => {
            n.wiederholen.art = 'einmalig';
            zeichneWiederholen();
            zeichnePlan();
          },
        }),
        chip('🔁 Jede Woche', {
          art: einmalig ? '' : 'aktiv',
          onClick: () => {
            n.wiederholen.art = 'woechentlich';
            zeichneWiederholen();
            zeichnePlan();
          },
        }),
      ),
      einmalig
        ? null
        : wochenStepper({
            wert: n.wiederholen.wochen,
            min: 2,
            max: MAX_SERIEN_WOCHEN,
            beschriftung: 'Wochen',
            beiAenderung: (w) => {
              n.wiederholen.wochen = w;
              zeichneWiederholen();
              zeichnePlan();
            },
          }),
    );
  }

  function zeichnePlan() {
    const aktiv = !n.bearbeiten && n.wiederholen.art === 'woechentlich';
    planBox.hidden = !aktiv;
    if (!aktiv) return;
    try {
      const plan = wochenSerie(state, { start: n.date, wochen: n.wiederholen.wochen, richtung: n.richtung, heute });
      const daten = plan.eintraege.slice(0, 6).map((e) => datumKurz(e.date)).join(' · ');
      fuelle(planBox, h('b', {}, serieZusammenfassung(plan)), plan.eintraege.length > 0 ? h('small', {}, `${daten}${plan.eintraege.length > 6 ? ' · …' : ''}`) : null);
    } catch (fehler) {
      fuelle(planBox, h('span', { class: 'leise' }, fehler.message));
    }
  }

  async function speichern() {
    try {
      const wochen = !n.bearbeiten && n.wiederholen.art === 'woechentlich' ? n.wiederholen.wochen : 1;
      const r = await store.sachenSpeichern(terminAusEntwurf(n), { wochen, id: n.bearbeiten });
      toast(n.bearbeiten ? 'Änderung gespeichert ✓' : r.ids.length === 1 ? 'Gespeichert ✓' : `${r.ids.length} Erinnerungen gespeichert ✓`);
    } catch (fehler) {
      toast(fehler.message);
      return;
    }
    const ziel = n.date;
    ui.neuZuruecksetzen();
    if (ziel > addDays(heute, 7)) ui.gehZuMonat(ziel);
    else ui.gehZu('heute');
  }

  const schnellstart = n.bearbeiten
    ? null
    : h(
        'button',
        {
          class: 'knopf schnellstart',
          type: 'button',
          onClick: () => {
            if (pyjamasBox.hidden) {
              if (!pyjamasBox.firstChild) pyjamasBox.append(pyjamasWechsel({ store, ui }));
              pyjamasBox.hidden = false;
            } else {
              pyjamasBox.hidden = true;
            }
          },
        },
        h('span', { class: 'e' }, '🛏️'),
        h('b', {}, 'Pyjamas-Wechsel einrichten'),
        h('small', {}, 'jede Woche hinbringen und zum Waschen mit nach Hause nehmen'),
      );

  zeichneRichtung();
  zeichneGewaehlt();
  markiereVorschlaege();
  zeichneWiederholen();
  zeichnePlan();
  zeichneVorschau();

  const abbrechen = () => ui.neuZuruecksetzen(true);
  return h(
    'section',
    { class: 'screen' },
    h('button', { class: 'zurueck', type: 'button', onClick: abbrechen }, '‹ Zurück'),
    schnellstart,
    pyjamasBox,
    h(
      'div',
      { class: 'karte tint formular', style: farbe(kachel.farbe) },
      h('div', { class: 'karte-zeile' }, h('span', { class: 'emoji gross' }, kachel.emoji), h('div', { class: 'karte-text' }, h('b', {}, n.bearbeiten ? `${kachel.titel} ändern` : kachel.titel))),
      h('div', { class: 'feld' }, h('span', {}, 'Was passiert?'), richtungBox),
      h('div', { class: 'feld-paar' }, h('label', { class: 'feld' }, h('span', {}, 'Datum'), datumFeld), h('label', { class: 'feld' }, h('span', {}, 'Uhrzeit'), zeitFeld)),
      h('div', { class: 'feld' }, h('span', {}, '🎒 Sachen'), gewaehltBox),
      zuletztBlock,
      h('div', { class: 'gruppen' }, gruppen),
      eigeneSache(),
      wiederholenBox,
      planBox,
    ),
    vorschauBox,
    h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: abbrechen }, 'Abbrechen'), h('button', { class: 'knopf klein primaer', type: 'button', onClick: speichern }, n.bearbeiten ? 'Änderung speichern' : 'Speichern')),
  );
}
