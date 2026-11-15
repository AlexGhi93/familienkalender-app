// Gemeinsame Bausteine der Formular-Blätter (Autos, Versicherung, Sparziele, Fixkosten): Felder, Auswahlliste, Haken, der Hinweis
// „Nicht änderbar“, die einheitliche Meldung nach einem Store-Ergebnis und der Text für einen Fehler. Alles als Text in die Seite.
import { h } from './dom.js';
import { toast } from './components.js';
import { einmal } from '../app/einmal.js';

export const ALLGEMEINER_FEHLER = 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
export const MELDUNG_ANMELDEN = 'Bitte zuerst neu anmelden (Mehr → Konto & App → Neu anmelden).';
const WARNUNG_DAUER = 6000; // eine Warnung zum Gespeicherten bleibt länger stehen

/** Feld mit Titel (ein `<label>`: ein Tipp auf den Titel geht ins Feld). `mehr` steht dahinter, z. B. ein Hinweis. */
export const feld = (titel, inhalt, ...mehr) => h('label', { class: 'feld' }, h('span', {}, titel), inhalt, ...mehr);

/** Wie `feld`, mit einer zusätzlichen Klasse am Feld. */
export const feldKlasse = (klasse, titel, inhalt) => h('label', { class: `feld ${klasse}`.trim() }, h('span', {}, titel), inhalt);

/** Feld mit Titel für mehrere Bedienelemente (ein `<div>`; der Titel ist für Vorleseprogramme verborgen, die Elemente haben eigene Namen). */
export const gruppe = (titel, inhalt, ...mehr) => h('div', { class: 'feld' }, h('span', { 'aria-hidden': 'true' }, titel), inhalt, ...mehr);

export function textFeld({ wert, beschriftung, platzhalter = '', max = 40, modus = null, beiEingabe }) {
  return h('input', { type: 'text', value: wert ?? '', maxlength: String(max), autocomplete: 'off', placeholder: platzhalter, inputmode: modus, 'aria-label': beschriftung, onInput: (ev) => beiEingabe(ev.target.value) });
}

/** Auswahlliste; `optionen` = [[Wert, Text], …]; `mehr` = weitere Attribute der Liste. */
export function auswahl(beschriftung, optionen, wert, beiAenderung, mehr = {}) {
  return h(
    'select',
    { class: 'fk-auswahl', 'aria-label': beschriftung, onChange: (ev) => beiAenderung(ev.target.value), ...mehr },
    optionen.map(([w, text]) => h('option', { value: String(w), selected: String(w) === String(wert ?? '') }, text)),
  );
}

export function haken(text, wert, beiAenderung) {
  return h('label', { class: 'fk-haken' }, h('input', { type: 'checkbox', checked: Boolean(wert), onChange: (ev) => beiAenderung(ev.target.checked) }), ` ${text}`);
}

/** Die Karte „🔒 Nicht änderbar“ mit dem Grund. */
export const gesperrtHinweis = (text) => h('article', { class: 'karte fk-meldung warn' }, h('b', {}, '🔒 Nicht änderbar'), h('p', {}, text));

/**
 * Ergebnis des Stores melden; true = erledigt (gespeichert oder wartet nur auf die Anmeldung). `erfolg` ist der Text oder
 * `(r) => Text`. Die Erfolgsmeldung ersetzt eine noch stehende Fehlermeldung (nach einer berichtigten Eingabe soll man sehen, dass
 * gespeichert wurde – sonst trägt man es womöglich ein zweites Mal ein); eine Warnung des Stores (z. B. „vor dem Beginn der Polizze“)
 * steht mit dabei. Ein Fehler mit `gemeldet` zeigt schon die Shell (aus state.fehler) – dann keine zweite Meldung; vor dem Schreiben
 * Abgelehntes (ohne `gemeldet`) zeigt nur diese hier.
 */
export function erledigt(r, erfolg) {
  if (r?.ok || r?.wartet) {
    if (r.ok) {
      const text = typeof erfolg === 'function' ? erfolg(r) : erfolg;
      toast(r.warnung ? `${text} · ${r.warnung}` : text, { ersetztFehler: true, ...(r.warnung ? { dauer: WARNUNG_DAUER } : {}) });
    }
    return true;
  }
  if (!r?.gemeldet) toast(r?.fehler ?? ALLGEMEINER_FEHLER, { art: 'fehler' });
  return false;
}

/**
 * Speichern aus einem Formular, das seine Eingaben selbst prüfen lässt (der Store wirft bei einer abgelehnten Eingabe): je Entwurf
 * `halter` nur einmal gleichzeitig (siehe app/einmal.js; der Knopf hat `disabled: halter.speichert`). → das Ergebnis des Stores für
 * `erledigt`, oder undefined: es wird schon gespeichert, oder die Eingabe wurde abgelehnt (ihre Meldung steht dann schon da).
 */
export async function einmalSpeichern(halter, lauf) {
  try {
    return await einmal(halter, lauf);
  } catch (fehler) {
    toast(fehler.message);
    return undefined;
  }
}

/** Wartet auf den Lauf des Stores; eine Ausnahme wird zu `{ ok: false, fehler }`. */
export async function sicher(lauf) {
  try {
    return await lauf;
  } catch (e) {
    return { ok: false, fehler: e?.message ?? ALLGEMEINER_FEHLER };
  }
}

/** Text für einen Fehler: abgelaufene Anmeldung → der Weg zum neuen Anmelden, sonst seine Meldung (oder `ersatz`). */
export function fehlerText(fehler, ersatz = ALLGEMEINER_FEHLER) {
  return fehler?.name === 'AuthAbgelaufen' ? MELDUNG_ANMELDEN : fehler?.message || ersatz;
}

/** Knopf „Nochmal versuchen“: ruft `laden()` auf (das Neuzeichnen der Seite ersetzt ihn); währenddessen aus. */
export function nochmalKnopf(laden) {
  return h(
    'button',
    {
      class: 'knopf klein',
      type: 'button',
      onClick: async (ev) => {
        const knopf = ev.currentTarget; // nach dem `await` ist currentTarget schon null
        knopf.disabled = true;
        knopf.textContent = 'Wird geladen …';
        await laden();
        knopf.disabled = false; // falls die Seite (noch) nicht neu gezeichnet wurde
        knopf.textContent = 'Nochmal versuchen';
      },
    },
    'Nochmal versuchen',
  );
}
