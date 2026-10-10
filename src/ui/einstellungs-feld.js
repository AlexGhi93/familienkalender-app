// Textfeld für „Mehr“, das beim Verlassen (oder mit Enter) speichert. Nach jedem Speichern wird die ganze Seite neu gezeichnet;
// das <input> bleibt dabei dasselbe (wie die Eingabezeile im Einkauf). So behält das Feld, in das man gerade tippt, Fokus und
// halb Getipptes, auch wenn ein anderes Feld eben gespeichert wurde (z. B. von „Telefon“ direkt weiter zu „E-Mail“).
import { h } from './dom.js';
import { toast } from './components.js';

const felder = new Map(); // id → { eingabe, wert, anzeige, pruefen, speichern }: überlebt das Neuzeichnen der Seite

async function uebernehmen(f) {
  const { eingabe } = f;
  const text = eingabe.value;
  if (text === f.anzeige(f.wert)) {
    eingabe.removeAttribute('aria-invalid');
    return;
  }
  const ergebnis = f.pruefen(text);
  if ('fehler' in ergebnis) {
    eingabe.setAttribute('aria-invalid', 'true');
    toast(ergebnis.fehler);
    return;
  }
  eingabe.removeAttribute('aria-invalid');
  eingabe.value = f.anzeige(ergebnis.wert);
  if (ergebnis.wert === f.wert) return; // nur anders geschrieben (z. B. Leerzeichen am Ende)
  await f.speichern(ergebnis.wert);
}

/**
 * `id`: eindeutiger Name des Feldes; `wert`: gespeicherter Wert; `anzeige(wert)` → Text im Feld;
 * `pruefen(text)` → { wert } oder { fehler: 'Meldung für den Toast' }; `speichern(wert)` → Promise (zeichnet die Seite neu).
 * `attribute`: weitere Attribute des <input> (type, inputmode, placeholder, maxlength …).
 */
export function einstellungsFeld({ id, beschriftung, hinweis = null, wert, anzeige = (w) => w ?? '', pruefen, speichern, attribute = {} }) {
  let f = felder.get(id);
  if (!f) {
    const eingabe = h('input', { type: 'text', autocomplete: 'off', enterkeyhint: 'done', 'data-feld': id });
    f = { eingabe };
    eingabe.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      eingabe.blur(); // „Fertig“: Tastatur zu, gespeichert wird beim Verlassen
    });
    // Erst speichern, wenn der Fokus gewechselt hat: das Neuzeichnen findet dann schon das nächste Feld vor und gibt ihm den Fokus zurück.
    // Hat dieses Feld den Fokus sofort wieder (es wurde nur neu eingesetzt), ist nichts zu tun.
    eingabe.addEventListener('blur', () => setTimeout(() => document.activeElement !== eingabe && uebernehmen(f), 0));
    felder.set(id, f);
  }
  Object.assign(f, { wert, anzeige, pruefen, speichern });
  const { eingabe } = f;
  for (const [name, w] of Object.entries({ 'aria-label': beschriftung, ...attribute })) eingabe.setAttribute(name, String(w));
  if (document.activeElement === eingabe) {
    // nach dem Einsetzen der neuen Seite wieder hinein (der Text bleibt, er ist ja dasselbe Feld)
    queueMicrotask(() => eingabe.isConnected && document.activeElement !== eingabe && eingabe.focus({ preventScroll: true }));
  } else {
    eingabe.value = anzeige(wert); // z. B. vom anderen Telefon geändert
    eingabe.removeAttribute('aria-invalid');
  }
  return h('label', { class: 'feld' }, h('span', {}, beschriftung), eingabe, hinweis ? h('small', { class: 'leise' }, hinweis) : null);
}
