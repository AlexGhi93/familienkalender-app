// Einkaufsliste: eintragen, abhaken („im Wagen“), löschen, „Gekaufte entfernen“ mit Rückgängig. Beide Eltern sehen dieselbe Liste;
// mit Google bleibt sie aktuell (alle 30 Sekunden, siehe app/einkauf-abgleich.js) und lässt sich ganz oben durch Herunterziehen aktualisieren.
import { h } from './dom.js';
import { abschnitt, chip, farbe, toast } from './components.js';
import { aktualisiertText, einkaufModel, EINKAUF_FARBE } from '../app/views/einkauf-model.js';
import { MAX_MENGE, MAX_TEXT, hinzufuegen } from '../domain/einkauf.js';
import { zeigeRueckgaengig } from './fortschritt.js';

/** Bei einem Fehler (z. B. gerade erst abgelaufene Anmeldung) meldet der Store selbst; hier nur, was er nicht abfängt. */
const sicher = (versprechen) => versprechen.catch((fehler) => toast(fehler?.message ?? 'Das hat nicht geklappt. Bitte noch einmal versuchen.'));

// Die Eingabezeile bleibt bei jedem Neuzeichnen dieselbe: so behalten Tastatur, Auswahl und halb Getipptes ihren Zustand,
// auch wenn gerade vom anderen Telefon etwas Neues hereinkommt.
let eingabe = null;
let aktuell = null; // { store, ui } der letzten Zeichnung, damit die Knöpfe der festen Zeile immer den richtigen Store benutzen

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

// „Aktualisiert um …“ und die Anzeige beim Herunterziehen bleiben wie die Eingabezeile bei jedem Neuzeichnen dieselben Knoten:
// so übersteht ein Ziehen auch neue Daten, und die Uhrzeit lässt sich nach einem Abgleich ohne Änderung direkt setzen.
let stand = null;
let zieh = null;

const ZIEH_SCHWELLE = 70; // so weit (px) muss man ganz oben herunterziehen, damit Loslassen aktualisiert
const ZIEH_MAX = 96; // höher wird die Anzeige beim Ziehen nicht
const ZIEH_HOEHE = 44; // Höhe beim Aktualisieren und danach (und immer, wenn Bewegung reduziert ist)
const MELDUNG_MS = 1400; // so lange bleibt „Aktualisiert ✓“ stehen
const ZIEH_TEXT = { ruhe: '', ziehen: '↓ Ziehen zum Aktualisieren', bereit: '↻ Loslassen zum Aktualisieren', laedt: 'Aktualisiere …' };
const ZIEH_MELDUNG = {
  neu: 'Aktualisiert ✓',
  gleich: 'Aktualisiert ✓',
  warten: 'Deine Änderung wird noch gespeichert …',
  getrennt: 'Nicht mit Google verbunden',
  fehler: 'Hat nicht geklappt. Bitte gleich noch einmal.',
};
const zug = { phase: 'ruhe', ziel: null, start: 0, weite: 0, meldung: '', zeitgeber: null }; // phase: ruhe | ziehen | bereit | laedt | fertig

const ganzOben = () => (globalThis.scrollY ?? 0) <= 0;
const wenigBewegung = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function zeichneStand() {
  const { store, ui } = aktuell;
  const text = ui.auth ? aktualisiertText(store.einkaufGeprueftAm(), store.jetzt().getTime()) : ''; // in der Demo gibt es nichts abzugleichen
  stand.textContent = text;
  stand.hidden = text === '';
}

function zeichneZieh() {
  const folgt = zug.phase === 'ziehen' || zug.phase === 'bereit';
  const hoehe = zug.phase === 'ruhe' ? 0 : folgt && !wenigBewegung() ? Math.min(ZIEH_MAX, Math.round(zug.weite * 0.6)) : ZIEH_HOEHE; // gedämpft dem Finger nach
  zieh.knoten.dataset.phase = zug.phase;
  zieh.knoten.style.setProperty('--zug', `${hoehe}px`);
  zieh.text.textContent = zug.phase === 'fertig' ? zug.meldung : ZIEH_TEXT[zug.phase];
}

async function ziehAktualisieren() {
  clearTimeout(zug.zeitgeber);
  zug.phase = 'laedt';
  zeichneZieh();
  let ergebnis = 'fehler';
  try {
    ergebnis = await aktuell.ui.einkaufAktualisieren();
  } catch {
    // bleibt „fehler“
  }
  zug.phase = 'fertig';
  zug.meldung = ZIEH_MELDUNG[ergebnis] ?? ZIEH_MELDUNG.fehler;
  zeichneZieh();
  zug.zeitgeber = setTimeout(() => {
    zug.phase = 'ruhe';
    zeichneZieh();
  }, MELDUNG_MS);
}

/** Beendet das Verfolgen eines Fingers; war noch nicht losgelassen, verschwindet die Anzeige wieder. */
function loesen() {
  for (const [art, f] of ZIEH_HOERER) zug.ziel?.removeEventListener(art, f);
  zug.ziel = null;
  if (zug.phase === 'ziehen' || zug.phase === 'bereit') {
    zug.phase = 'ruhe';
    zeichneZieh();
  }
}

function beiBeruehrung(e) {
  if (zug.ziel) {
    loesen(); // ein zweiter Finger: kein Aktualisieren
    return;
  }
  if (!zieh?.knoten.isConnected || zug.phase === 'laedt' || e.touches.length !== 1 || !ganzOben()) return; // nur auf der Einkaufsliste, nur ganz oben
  // Bewegung und Loslassen am berührten Element verfolgen: dort kommen sie auch an, wenn die Seite inzwischen neu gezeichnet wurde
  zug.ziel = e.target;
  zug.start = e.touches[0].clientY;
  zug.weite = 0;
  for (const [art, f] of ZIEH_HOERER) zug.ziel.addEventListener(art, f, { passive: true });
}

function beiBewegung(e) {
  if (e.touches.length !== 1 || !ganzOben()) {
    loesen(); // die Seite scrollt (nicht mehr ganz oben) oder ein zweiter Finger
    return;
  }
  const weite = Math.max(0, e.touches[0].clientY - zug.start);
  if (weite === 0 && zug.phase !== 'ziehen' && zug.phase !== 'bereit') return; // (noch) nicht nach unten gezogen
  clearTimeout(zug.zeitgeber);
  zug.weite = weite;
  zug.phase = weite === 0 ? 'ruhe' : weite >= ZIEH_SCHWELLE ? 'bereit' : 'ziehen';
  zeichneZieh();
}

function beimLoslassen() {
  const bereit = zug.phase === 'bereit';
  loesen();
  if (bereit) ziehAktualisieren();
}

const ZIEH_HOERER = [
  ['touchmove', beiBewegung],
  ['touchend', beimLoslassen],
  ['touchcancel', loesen],
];

/** Kopfteile, die bei jedem Neuzeichnen dieselben bleiben; das Herunterziehen wird beim ersten Mal angemeldet (passiv: Scrollen bleibt flüssig). */
function festeKnoten() {
  if (!zieh) {
    const text = h('span', {});
    zieh = { text, knoten: h('div', { class: 'ek-ziehen', role: 'status' }, text) };
    stand = h('p', { class: 'ek-stand' });
    document.addEventListener('touchstart', beiBeruehrung, { passive: true });
    zeichneZieh();
  }
  zeichneStand();
  return { zieh: zieh.knoten, stand };
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
  aktuell = { store, ui };
  const m = einkaufModel(store.getState());
  const zeileEin = eingabeZeile();
  const kopf = festeKnoten();
  ui.einkaufStandZeichnen = () => {
    if (stand.isConnected) zeichneStand();
  };
  const hatteFokus = [zeileEin.text, zeileEin.menge].find((feld) => feld === document.activeElement) ?? null;
  const auswahl = hatteFokus ? [hatteFokus.selectionStart, hatteFokus.selectionEnd, hatteFokus.selectionDirection ?? 'none'] : null; // Schreibmarke bzw. Markierung
  zeileEin.text.disabled = m.voll;
  zeileEin.menge.disabled = m.voll;
  zeileEin.knopf.disabled = m.voll;
  zeileEin.text.placeholder = m.voll ? 'Die Liste ist voll' : 'Was fehlt?';
  if (hatteFokus) {
    // nach dem Einsetzen der neuen Seite: Fokus und Schreibmarke zurück, damit mitten im Wort einfach weitergetippt werden kann
    queueMicrotask(() => {
      if (!hatteFokus.isConnected || hatteFokus.disabled) return;
      hatteFokus.focus({ preventScroll: true });
      if (auswahl[0] !== null) hatteFokus.setSelectionRange(...auswahl);
    });
  }

  const leer = m.offen.length === 0 && m.gekauft.length === 0;
  return h(
    'section',
    { class: 'screen einkauf' },
    kopf.zieh,
    h('button', { class: 'zurueck', type: 'button', onClick: () => ui.gehZu('heute') }, '‹ Zurück'),
    h('h1', { class: 'gruss' }, 'Einkaufsliste 🛒'),
    h('p', { class: 'datum' }, leer ? 'Schreib auf, was fehlt – dann vergisst es niemand.' : m.anzahlOffen === 0 ? 'Alles im Wagen 🎉' : `${m.anzahlOffen} Artikel offen`),
    kopf.stand,
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
