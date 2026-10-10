// Felder für Uhrzeit und Datum, die man mit der Zifferntastatur schreibt (statt nur über das Auswahl-Rad), mit dem gewohnten
// Auswahl-Knopf daneben. Die Logik steckt in src/domain/eingabe.js; hier ist nur das DOM.
import { fuelle, h } from './dom.js';
import { datumLang } from '../app/format-de.js';
import { datumAnzeige, datumAusEingabe, datumWaehrendTippen, zeitAusEingabe, zeitWaehrendTippen } from '../domain/eingabe.js';

/**
 * Gemeinsames Gerüst: Textfeld mit Ziffernblock, daneben ein Knopf, dessen durchsichtiges <input type=date|time> den
 * Auswahldialog des Telefons öffnet (ohne JavaScript, geht auch auf dem iPhone).
 * `umwandeln(text)` → Wert oder null; `waehrendTippen(text)` → Text; `anzeige(wert)` → Text im Feld;
 * `istVollstaendig(text)` → true, wenn schon beim Tippen übernommen werden darf.
 */
function baue({ art, symbol, platzhalter, maxLaenge, beschriftung, wert, beiAenderung, erstBeiFertig, umwandeln, waehrendTippen, anzeige, istVollstaendig, pickerWert, hinweis }) {
  let aktuell = wert ?? ''; // zuletzt gültig erkannter Wert (auch schon während des Tippens)
  let gemeldet = aktuell; // zuletzt an `beiAenderung` gemeldeter (bzw. von außen gesetzter) Wert
  const text = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done', maxlength: String(maxLaenge), placeholder: platzhalter, 'aria-label': beschriftung });
  text.value = anzeige(aktuell);
  const picker = h('input', { type: art, class: 'picker-unsichtbar', tabindex: '-1', 'aria-label': `${beschriftung} auswählen` });
  picker.value = pickerWert(aktuell);
  const knopf = h('span', { class: 'picker-knopf' }, symbol, picker);
  const zusatz = h('small', { class: 'leise eingabe-hinweis' });
  const knoten = h('div', { class: 'eingabe-feld' }, h('div', { class: 'eingabe-zeile' }, text, knopf), zusatz);

  const markiere = (ungueltig) => {
    if (ungueltig) text.setAttribute('aria-invalid', 'true');
    else text.removeAttribute('aria-invalid');
  };
  const zeigeHinweis = (w) => fuelle(zusatz, w ? hinweis(w) : null);
  zeigeHinweis(aktuell);

  // Mit `erstBeiFertig` wird eine beim Tippen schon vollständige Eingabe erst bei Enter/Verlassen gemeldet: verglichen wird deshalb
  // mit dem zuletzt gemeldeten Wert, nicht mit `aktuell` (sonst ginge eine fertig getippte Uhrzeit nie raus).
  function uebernehmen(neu, fertig) {
    zeigeHinweis(neu);
    aktuell = neu;
    if ((!erstBeiFertig || fertig) && neu !== gemeldet) {
      gemeldet = neu;
      beiAenderung(neu);
    }
  }

  function fertig() {
    const roh = text.value.trim();
    if (roh === '') {
      markiere(false);
      uebernehmen('', true);
      return;
    }
    const w = umwandeln(roh);
    if (w) {
      text.value = anzeige(w);
      picker.value = pickerWert(w);
      markiere(false);
      uebernehmen(w, true);
    } else {
      markiere(true);
      zeigeHinweis('');
      uebernehmen('', true);
    }
  }

  text.addEventListener('input', () => {
    const formatiert = waehrendTippen(text.value);
    if (formatiert !== text.value) text.value = formatiert;
    if (formatiert.trim() === '') {
      markiere(false);
      uebernehmen('', false);
    } else if (istVollstaendig(formatiert) && umwandeln(formatiert)) {
      markiere(false);
      uebernehmen(umwandeln(formatiert), false); // bei vollständiger Eingabe sofort (Vorschau), unfertige Eingaben werden nie übernommen
    }
  });
  text.addEventListener('blur', fertig);
  text.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    fertig();
    text.blur();
  });
  text.addEventListener('focus', () => setTimeout(() => text.select(), 0)); // ein Tipp, und man schreibt den neuen Wert direkt darüber
  picker.addEventListener('change', () => {
    const w = umwandeln(picker.value.length === 10 ? datumAnzeige(picker.value) : picker.value);
    if (!w) return;
    text.value = anzeige(w);
    markiere(false);
    uebernehmen(w, true);
  });

  return Object.assign(knoten, {
    /** Setzt den Wert von außen (ohne `beiAenderung` aufzurufen). */
    setzeWert(neu) {
      aktuell = neu ?? '';
      gemeldet = aktuell;
      text.value = anzeige(aktuell);
      picker.value = pickerWert(aktuell);
      markiere(false);
      zeigeHinweis(aktuell);
    },
    /** Der zuletzt gültig übernommene Wert ('' = leer oder ungültig). */
    wert: () => aktuell,
  });
}

/** Uhrzeit: `wert` = 'HH:MM' oder ''. `beiAenderung('HH:MM' | '')`. Mit `erstBeiFertig` erst bei Enter/Verlassen/Auswahl (z. B. wenn jede Änderung gespeichert wird). */
export function zeitFeld({ wert = '', beiAenderung, erstBeiFertig = false, beschriftung = 'Uhrzeit' }) {
  return baue({
    art: 'time',
    symbol: '🕒',
    platzhalter: 'HH:MM',
    maxLaenge: 5,
    beschriftung,
    wert,
    beiAenderung,
    erstBeiFertig,
    umwandeln: zeitAusEingabe,
    waehrendTippen: zeitWaehrendTippen,
    anzeige: (w) => w,
    istVollstaendig: (t) => /^\d{2}:\d{2}$/.test(t),
    pickerWert: (w) => w,
    hinweis: () => null,
  });
}

/** Datum: `wert` = 'JJJJ-MM-TT' oder ''. `beiAenderung('JJJJ-MM-TT' | '')`; `heute` für Eingaben ohne Jahr. */
export function datumFeld({ wert = '', beiAenderung, heute, erstBeiFertig = false, beschriftung = 'Datum' }) {
  return baue({
    art: 'date',
    symbol: '📅',
    platzhalter: 'TT.MM.JJJJ',
    maxLaenge: 10,
    beschriftung,
    wert,
    beiAenderung,
    erstBeiFertig,
    umwandeln: (t) => datumAusEingabe(t, { heute }),
    waehrendTippen: datumWaehrendTippen,
    anzeige: datumAnzeige,
    istVollstaendig: (t) => /^\d{2}\.\d{2}\.\d{4}$/.test(t),
    pickerWert: (w) => w,
    hinweis: (w) => datumLang(w),
  });
}
