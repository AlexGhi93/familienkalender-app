import { h } from './dom.js';

/** Schritt-für-Schritt-Anleitung: Kalender in Google Kalender mit dem anderen Elternteil teilen (am Computer). */
export function freigabeAnleitung() {
  return h(
    'details',
    { class: 'anleitung' },
    h('summary', {}, 'So teilst du die Kalender (Schritt für Schritt)'),
    h(
      'ol',
      {},
      h('li', {}, 'Am Computer calendar.google.com öffnen und mit demselben Konto anmelden wie in dieser App.'),
      h('li', {}, 'Links unter „Meine Kalender“ bei „Familie · Termine“ auf die drei Punkte ⋮ gehen und „Einstellungen und Freigabe“ wählen.'),
      h('li', {}, 'Bei „Für bestimmte Personen oder Gruppen freigeben“ auf „Personen und Gruppen hinzufügen“ tippen und die Adresse des anderen Elternteils eingeben.'),
      h('li', {}, 'Als Berechtigung „Änderungen an Terminen vornehmen“ wählen und auf „Senden“ gehen.'),
      h('li', {}, 'Dasselbe für „Familie · Abwesenheit“ und „Familie · Anwesenheit“ wiederholen.'),
      h('li', {}, 'Das andere Elternteil öffnet die App, wählt „Ich habe einen Code“ und gibt den Code ein.'),
    ),
    h('p', { class: 'leise' }, 'Der Code ist kein Passwort: ohne Freigabe öffnet er nichts.'),
  );
}
