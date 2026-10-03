// Einkaufsliste: eintragen, abhaken („im Wagen“), löschen, „Gekaufte entfernen“ mit Rückgängig. Beide Eltern sehen dieselbe Liste.
import { h } from './dom.js';
import { abschnitt, chip, farbe, toast } from './components.js';
import { einkaufModel, EINKAUF_FARBE } from '../app/views/einkauf-model.js';
import { MAX_MENGE, MAX_TEXT, hinzufuegen } from '../domain/einkauf.js';
import { zeigeRueckgaengig } from './fortschritt.js';

/** Bei einem Fehler (z. B. gerade erst abgelaufene Anmeldung) meldet der Store selbst; hier nur, was er nicht abfängt. */
const sicher = (versprechen) => versprechen.catch((fehler) => toast(fehler?.message ?? 'Das hat nicht geklappt. Bitte noch einmal versuchen.'));

// Die Eingabezeile bleibt bei jedem Neuzeichnen dieselbe: so behalten Tastatur, Auswahl und halb Getipptes ihren Zustand,
// auch wenn gerade vom anderen Telefon etwas Neues hereinkommt.
let eingabe = null;
let aktuell = null; // { store } der letzten Zeichnung, damit die Knöpfe der festen Zeile immer den richtigen Store benutzen

function eingabeZeile() {
  if (eingabe) return eingabe;
  const text = h('input', { type: 'text', class: 'ek-text', maxlength: MAX_TEXT, placeholder: 'Was fehlt?', 'aria-label': 'Artikel', autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'done' });
  const menge = h('input', { type: 'text', class: 'ek-menge', maxlength: MAX_MENGE, placeholder: 'Menge', 'aria-label': 'Menge (optional)', autocomplete: 'off', enterkeyhint: 'done' });
  const knopf = h('button', { class: 'knopf primaer ek-plus', type: 'button', 'aria-label': 'Zur Liste hinzufügen' }, '＋');

  function eintragen() {
    const { store } = aktuell;
    try {
      hinzufuegen(store.getState().einkauf, { text: text.value, menge: menge.value }, { jetzt: 0, id: 'pruefen' }); // dieselbe Prüfung wie im Store, aber vor dem Leeren der Felder
    } catch (fehler) {
      toast(fehler.message);
      text.focus();
      return;
    }
    const t = text.value;
    const m = menge.value;
    text.value = '';
    menge.value = '';
    text.focus(); // Tastatur bleibt offen für den nächsten Artikel
    sicher(store.einkaufHinzufuegen(t, m));
  }

  const beiEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      eintragen();
    }
  };
  text.addEventListener('keydown', beiEnter);
  menge.addEventListener('keydown', beiEnter);
  knopf.addEventListener('click', eintragen);
  eingabe = { text, menge, knopf, knoten: h('div', { class: 'ek-eingabe' }, text, menge, knopf) };
  return eingabe;
}

function zeile(store, a, gekauft) {
  return h(
    'div',
    { class: `ek-zeile ${gekauft ? 'gekauft' : 'offen'}` },
    h(
      'button',
      { class: 'ek-haupt', type: 'button', role: 'checkbox', 'aria-checked': gekauft ? 'true' : 'false', onClick: () => sicher(store.einkaufUmschalten(a.i)) },
      h('span', { class: 'ek-haken', 'aria-hidden': 'true' }, gekauft ? '✓' : ''),
      h('span', { class: 'karte-text' }, h('b', { class: 'ek-name' }, a.t), a.m ? h('small', {}, a.m) : null),
    ),
    h(
      'button',
      {
        class: 'ek-weg',
        type: 'button',
        'aria-label': `${a.t} löschen`,
        onClick: async () => {
          await sicher(store.einkaufEntfernen(a.i));
          zeigeRueckgaengig(`„${a.t}“ gelöscht`, () => store.einkaufHinzufuegen(a.t, a.m));
        },
      },
      '✕',
    ),
  );
}

export function einkaufScreen({ store, ui }) {
  aktuell = { store };
  const m = einkaufModel(store.getState());
  const zeileEin = eingabeZeile();
  const hatteFokus = [zeileEin.text, zeileEin.menge].find((feld) => feld === document.activeElement) ?? null;
  zeileEin.text.disabled = m.voll;
  zeileEin.menge.disabled = m.voll;
  zeileEin.knopf.disabled = m.voll;
  zeileEin.text.placeholder = m.voll ? 'Die Liste ist voll' : 'Was fehlt?';
  if (hatteFokus) queueMicrotask(() => hatteFokus.isConnected && hatteFokus.focus({ preventScroll: true })); // nach dem Einsetzen der neuen Seite

  const leer = m.offen.length === 0 && m.gekauft.length === 0;
  return h(
    'section',
    { class: 'screen einkauf' },
    h('button', { class: 'zurueck', type: 'button', onClick: () => ui.gehZu('heute') }, '‹ Zurück'),
    h('h1', { class: 'gruss' }, 'Einkaufsliste 🛒'),
    h('p', { class: 'datum' }, leer ? 'Schreib auf, was fehlt – dann vergisst es niemand.' : m.anzahlOffen === 0 ? 'Alles im Wagen 🎉' : `${m.anzahlOffen} Artikel offen`),
    h(
      'div',
      { class: 'karte tint formular', style: farbe(EINKAUF_FARBE) },
      zeileEin.knoten,
      m.vorschlaege.length > 0 && !m.voll
        ? h(
            'div',
            { class: 'ek-oft' },
            h('small', {}, 'Oft gekauft'),
            h(
              'div',
              { class: 'chips' },
              m.vorschlaege.map((name) => chip(`＋ ${name}`, { onClick: () => sicher(store.einkaufHinzufuegen(name)) })),
            ),
          )
        : null,
    ),
    m.offen.length > 0 ? abschnitt(`Zu kaufen · ${m.offen.length}`, h('div', { class: 'ek-liste' }, m.offen.map((a) => zeile(store, a, false)))) : null,
    m.gekauft.length > 0
      ? abschnitt(
          `Im Wagen · ${m.gekauft.length}`,
          h('div', { class: 'ek-liste' }, m.gekauft.map((a) => zeile(store, a, true))),
          h(
            'div',
            { class: 'knopfzeile' },
            h(
              'button',
              {
                class: 'knopf klein',
                type: 'button',
                onClick: async () => {
                  const r = await store.einkaufErledigteEntfernen().catch((fehler) => {
                    toast(fehler?.message ?? 'Das hat nicht geklappt. Bitte noch einmal versuchen.');
                    return null;
                  });
                  if (r && r.anzahl > 0) zeigeRueckgaengig(`${r.anzahl} Artikel entfernt ✓`, r.rueckgaengig);
                },
              },
              'Gekaufte entfernen',
            ),
          ),
        )
      : null,
  );
}
