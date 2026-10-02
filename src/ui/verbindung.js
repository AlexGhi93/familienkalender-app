import { h } from './dom.js';
import { standText } from '../app/format-de.js';

function banner(emoji, text, knopfText, beiKlick) {
  return h(
    'div',
    { class: 'banner', role: 'status' },
    h('span', { class: 'emoji', 'aria-hidden': 'true' }, emoji),
    h('p', {}, text),
    h('button', { class: 'knopf klein primaer', type: 'button', onClick: beiKlick }, knopfText),
  );
}

/** Hinweis oben auf jedem Bildschirm: Verbinden (nur gespeicherter Stand), Neu anmelden (abgelaufen) oder Erneuern (läuft bald ab). */
export function verbindungsBanner({ state, auth, ausstehend, verbinden }) {
  if (!auth) return null;
  if (state.nurSnapshot) return banner('📴', `Gespeicherter Stand vom ${standText(state.stand)}. Zum Aktualisieren verbinden.`, 'Verbinden', verbinden);
  if (state.anmeldungNoetig || auth.status() === 'abgelaufen') {
    const warten = ausstehend > 0 ? ` ${ausstehend} ${ausstehend === 1 ? 'Änderung wartet' : 'Änderungen warten'} auf das Speichern.` : '';
    return banner('🔒', `Bitte neu anmelden.${warten}`, 'Neu anmelden', verbinden);
  }
  if (auth.baldAbgelaufen()) return banner('⏳', 'Die Anmeldung läuft bald ab. Jetzt erneuern, damit nichts verloren geht.', 'Erneuern', verbinden);
  return null;
}

/** Große Karte, solange noch nichts geladen ist (erster Start nach der Einrichtung oder ohne gespeicherten Stand). */
export function verbindenKarte({ verbinden }) {
  return h(
    'section',
    { class: 'screen' },
    h('h1', { class: 'gruss' }, 'Schön, dass du da bist! 🌸'),
    h(
      'article',
      { class: 'karte tint', style: { '--c': '#7a5ce0' } },
      h('p', {}, 'Tippe auf „Mit Google anmelden“, um den Familienkalender zu laden. Das dauert nur einen Moment.'),
      h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf primaer', type: 'button', onClick: verbinden }, 'Mit Google anmelden')),
    ),
  );
}

/** Hinweis, wenn auf dem Server eine neuere Version der App liegt (beim Zurückkehren in die App geprüft). */
export function versionsBanner({ neuLaden }) {
  return banner('🆕', 'Eine neue Version des Familienkalenders ist da.', 'Neu laden', neuLaden);
}
