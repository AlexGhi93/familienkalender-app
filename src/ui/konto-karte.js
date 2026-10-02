import { fuelle, h } from './dom.js';
import { bestaetigen, toast } from './components.js';
import { freigabeAnleitung } from './anleitung.js';

async function kopieren(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopiert ✓');
  } catch {
    toast('Kopieren hat nicht geklappt. Bitte den Code von Hand markieren.');
  }
}

const STATUS = { verbunden: '✅ Verbunden', abgelaufen: '🔒 Anmeldung abgelaufen', getrennt: '📴 Nicht verbunden' };

/** „Mehr“: Konto bei Google (Status, neu anmelden, Code, Anleitung) bzw. im Demo-Modus der Weg zu Google. Gibt { oben, unten } zurück (leer ohne `ui.konto`). */
export function kontoKarten({ store, ui }) {
  const konto = ui.konto;
  if (!konto) return { oben: [], unten: [] };
  if (konto.modus === 'demo') {
    const mitGoogle = h(
        'article',
        { class: 'karte' },
        h('h3', {}, 'Mit Google verbinden'),
        h('p', { class: 'leise' }, 'Du siehst Beispieldaten. Zum echten Familienkalender (für euch beide) richtest du die Kalender mit Google ein. Die Demo bleibt dabei erhalten.'),
        h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: konto.zuGoogleWechseln }, 'Mit Google einrichten')),
      );
    return { oben: [mitGoogle], unten: [] };
  }

  const status = ui.auth.status();
  const codeBox = h('div', { class: 'code-box' });
  codeBox.hidden = true;
  if (konto.kalenderCode) {
    fuelle(codeBox, h('p', { class: 'code' }, konto.kalenderCode), h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => kopieren(konto.kalenderCode) }, 'Code kopieren')), h('p', { class: 'leise' }, 'Der Code ist kein Passwort: ohne Freigabe öffnet er nichts.'), freigabeAnleitung());
  }

  const konto_ = h(
    'article',
    { class: 'karte' },
    h('h3', {}, 'Konto'),
    h('p', {}, STATUS[status] ?? STATUS.getrennt),
    h('p', { class: 'leise' }, konto.rolle === 'besitzer' ? 'Du hast den Familienkalender eingerichtet.' : 'Du bist über einen Code mit dem Familienkalender verbunden.'),
    h(
      'div',
      { class: 'knopfzeile' },
      h('button', { class: 'knopf klein', type: 'button', onClick: () => store.laden().then(() => toast('Aktualisiert ✓')).catch((e) => toast(e.message)) }, 'Aktualisieren'),
      h('button', { class: 'knopf klein primaer', type: 'button', onClick: ui.verbinden }, status === 'verbunden' ? 'Neu anmelden' : 'Mit Google anmelden'),
    ),
    konto.kalenderCode ? h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => { codeBox.hidden = !codeBox.hidden; } }, 'Code für das andere Elternteil anzeigen')) : null,
    konto.kalenderCode ? codeBox : null,
  );

  // Bewusst eine eigene Karte weit unten, nie neben harmlosen Knöpfen: betrifft nur dieses Telefon, nie die Google-Kalender.
  const zuruecksetzen = h(
    'article',
    { class: 'karte gefahrenzone' },
    h('h3', {}, 'Dieses Telefon zurücksetzen'),
    h('p', { class: 'leise' }, 'Meldet dieses Telefon ab und vergisst die Einrichtung. Deine Kalender bei Google bleiben unverändert; danach kannst du neu einrichten oder einen Code eingeben.'),
    h(
      'div',
      { class: 'knopfzeile' },
      h(
        'button',
        {
          class: 'knopf klein gefahr',
          type: 'button',
          onClick: () =>
            bestaetigen({
              titel: 'Dieses Telefon zurücksetzen?',
              text: 'Die Einrichtung auf diesem Telefon wird gelöscht. Bei Google passiert nichts.',
              ja: 'Weiter',
              gefahr: true,
              beiJa: () =>
                bestaetigen({
                  titel: 'Wirklich zurücksetzen?',
                  text: 'Zweite Rückfrage: Du musst danach alles auf diesem Telefon neu einrichten. Deine Kalender bei Google bleiben erhalten.',
                  ja: 'Ja, zurücksetzen',
                  gefahr: true,
                  beiJa: konto.zuruecksetzen,
                }),
            }),
        },
        'Zurücksetzen …',
      ),
    ),
  );
  return { oben: [konto_], unten: [zuruecksetzen] };
}
