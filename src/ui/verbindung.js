import { h } from './dom.js';
import { anmeldeHinweis, verbindungsModel } from '../app/views/verbindung-model.js';

/** Eine Zeile oben: Emoji, Text, optional der Fehler des letzten Versuchs (bleibt stehen) und der Knopf (fehlt, solange die Verbindung läuft). */
function banner(emoji, text, knopfText, beiKlick, fehler = null) {
  return h(
    'div',
    { class: 'banner', role: 'status' },
    h('span', { class: 'emoji', 'aria-hidden': 'true' }, emoji),
    h('div', { class: 'banner-text' }, h('p', {}, text), fehler ? h('p', { class: 'banner-fehler', role: 'alert' }, `⚠️ ${fehler}`) : null),
    knopfText ? h('button', { class: 'knopf klein primaer', type: 'button', onClick: beiKlick }, knopfText) : null,
  );
}

/** Hinweis oben auf jedem Bildschirm (Texte und Fälle: app/views/verbindung-model.js). `verbindung` = { laeuft, fehler } des letzten Versuchs. */
export function verbindungsBanner({ state, auth, ausstehend, verbinden, verbindung }) {
  if (!auth) return null;
  const { banner: b } = verbindungsModel({ state, status: auth.status(), restMs: auth.restMs(), bald: auth.baldAbgelaufen(), verbindung, ausstehend, login: auth.dauerAnmeldung?.() ?? null });
  return b ? banner(b.emoji, b.text, b.knopf, verbinden, b.fehler) : null;
}

/**
 * Große Karte, solange noch nichts geladen ist (erster Start nach der Einrichtung oder ohne gespeicherten Stand).
 * `login` = auth.dauerAnmeldung() (null ohne Login-Dienst): Hinweis „bleibt angemeldet“ und „Verbinde …“ während der stillen Anmeldung.
 */
export function verbindenKarte({ verbinden, verbindung = { laeuft: false, fehler: null }, login = null }) {
  const hinweis = anmeldeHinweis(login);
  const still = login?.still === true && !verbindung.laeuft;
  return h(
    'section',
    { class: 'screen' },
    h('h1', { class: 'gruss' }, 'Schön, dass du da bist! 🌸'),
    h(
      'article',
      { class: 'karte tint', style: { '--c': '#7a5ce0' } },
      h('p', {}, 'Tippe auf „Mit Google anmelden“, um den Familienkalender zu laden. Das dauert nur einen Moment.'),
      hinweis ? h('p', { class: 'leise' }, hinweis) : null,
      verbindung.laeuft ? h('p', { class: 'leise' }, '⏳ Verbinde mit Google … Erscheint kein Fenster, erlaube Pop-ups für diese Seite.') : null,
      still ? h('p', { class: 'leise' }, '⏳ Verbinde mit Google …') : null,
      verbindung.fehler && !still ? h('p', { class: 'banner-fehler', role: 'alert' }, `⚠️ ${verbindung.fehler}`) : null,
      h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf primaer', type: 'button', disabled: verbindung.laeuft || still, onClick: verbinden }, 'Mit Google anmelden')),
    ),
  );
}

/** Hinweis, wenn auf dem Server eine neuere Version der App liegt (beim Zurückkehren in die App geprüft). */
export function versionsBanner({ neuLaden }) {
  return banner('🆕', 'Eine neue Version des Familienkalenders ist da.', 'Neu laden', neuLaden);
}
