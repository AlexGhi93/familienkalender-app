import { h } from './dom.js';

/** „Wenn nichts klingelt“: Einstellungen am Telefon (Android und iPhone), denn die Erinnerungen kommen von Google Kalender, nicht von dieser App. */
export function erinnerungenAnleitung() {
  return h(
    'details',
    { class: 'anleitung' },
    h('summary', {}, 'Wenn nichts klingelt: Einstellungen am Telefon'),
    h('p', { class: 'leise' }, 'Die Erinnerungen schickt Google Kalender auf dem Telefon, nicht diese App. Darum muss dort alles stimmen:'),
    h('h4', {}, 'Android'),
    h(
      'ol',
      {},
      h('li', {}, 'Die App „Google Kalender“ ist installiert und mit deinem Google-Konto angemeldet.'),
      h('li', {}, 'In Google Kalender: Menü ☰ öffnen und „Familie · Termine“ anhaken.'),
      h('li', {}, 'Menü ☰ → Einstellungen → „Familie · Termine“: „Synchronisiert“ einschalten, Benachrichtigungen an.'),
      h('li', {}, 'Android-Einstellungen → Apps → Kalender → Benachrichtigungen: alle an; „Wecker & Erinnerungen“ erlauben; Akku: „Nicht eingeschränkt“.'),
    ),
    h('h4', {}, 'iPhone'),
    h(
      'ol',
      {},
      h('li', {}, 'Am einfachsten: die App „Google Kalender“ aus dem App Store installieren und mit dem eigenen Google-Konto anmelden. Beim ersten Start „Erlauben“ bei den Mitteilungen wählen.'),
      h('li', {}, 'In Google Kalender: Menü ☰ öffnen und „Familie · Termine“ anhaken.'),
      h('li', {}, 'iPhone-Einstellungen → Mitteilungen → Google Kalender: „Mitteilungen erlauben“, Banner und Töne an. Kein Fokus- oder „Nicht stören“-Modus.'),
      h('li', {}, 'Wer lieber den Apple-Kalender nutzt: Einstellungen → Kalender → Accounts → Google-Konto hinzufügen, und auf calendar.google.com/calendar/syncselect „Familie · Termine“ anhaken.'),
    ),
    h('p', { class: 'leise' }, 'Danach „Test-Erinnerung starten“ drücken: Es muss auf beiden Telefonen klingeln.'),
  );
}

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
