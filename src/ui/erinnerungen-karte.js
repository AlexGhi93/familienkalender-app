import { fuelle, h } from './dom.js';
import { toast } from './components.js';
import { erinnerungenAnleitung } from './anleitung.js';

const MELDUNG_ANMELDEN = 'Bitte zuerst neu anmelden (Mehr → Konto → Neu anmelden).';

let laufenderTest = null; // { zeit, klingeltUm }: bleibt erhalten, wenn man den Bildschirm wechselt

function fehlerText(fehler) {
  return fehler?.name === 'AuthAbgelaufen' ? MELDUNG_ANMELDEN : fehler?.message || 'Das hat nicht geklappt.';
}

/** „Mehr“: Erinnerungen prüfen und reparieren, Test-Erinnerung auslösen, Hilfe für Android und iPhone. Nur im Google-Modus. */
export function erinnerungenKarte({ store }) {
  const ergebnis = h('div', { class: 'pruefergebnis', 'aria-live': 'polite' });
  const testBox = h('div', { class: 'pruefergebnis', 'aria-live': 'polite' });

  function zeigeFehler(box, fehler) {
    fuelle(box, h('p', { class: 'fehlertext' }, fehlerText(fehler)));
  }

  function zeigePruefung(r) {
    const zeilen = r.punkte.map((p) => h('li', { class: p.ok ? 'ok' : 'warn' }, p.ok ? `✅ ${p.name}` : `⚠️ ${p.name}: ${p.probleme.join(' ')}`));
    fuelle(
      ergebnis,
      h('ul', { class: 'pruefliste' }, zeilen),
      r.ok
        ? h('p', { class: 'leise' }, 'Bei diesem Konto ist alles richtig eingestellt. Das andere Elternteil drückt auf seinem Telefon ebenfalls „Prüfen“.')
        : r.reparierbar
          ? h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: reparieren }, 'Reparieren'))
          : h('p', { class: 'leise' }, 'Das kann die App nicht beheben: Bitte den Besitzer, den Kalender mit „Änderungen an Terminen vornehmen“ zu teilen.'),
    );
  }

  async function pruefen() {
    fuelle(ergebnis, h('p', { class: 'leise' }, 'Ich prüfe …'));
    try {
      zeigePruefung(await store.erinnerungenPruefen());
    } catch (fehler) {
      zeigeFehler(ergebnis, fehler);
    }
  }

  async function reparieren() {
    fuelle(ergebnis, h('p', { class: 'leise' }, 'Ich repariere …'));
    try {
      const r = await store.erinnerungenReparieren();
      zeigePruefung(r);
      toast(r.ok ? 'Repariert ✓' : 'Noch nicht alles in Ordnung');
    } catch (fehler) {
      zeigeFehler(ergebnis, fehler);
    }
  }

  function zeigeTest() {
    if (!laufenderTest) {
      fuelle(testBox);
      return;
    }
    fuelle(
      testBox,
      h('p', {}, `Test läuft: Um ${laufenderTest.klingeltUm} Uhr muss „🔔 Test-Erinnerung“ auf allen Telefonen klingeln (Google Kalender).`),
      h('p', { class: 'leise' }, `Der Test-Termin liegt heute um ${laufenderTest.zeit} Uhr im Kalender „Familie · Termine“. Danach „Test beenden“ drücken.`),
      h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: testBeenden }, 'Test beenden')),
    );
  }

  async function testStarten() {
    fuelle(testBox, h('p', { class: 'leise' }, 'Ich lege den Test an …'));
    try {
      laufenderTest = await store.erinnerungenTestStarten();
      zeigeTest();
    } catch (fehler) {
      laufenderTest = null;
      zeigeFehler(testBox, fehler);
    }
  }

  async function testBeenden() {
    try {
      await store.erinnerungenTestBeenden();
      laufenderTest = null;
      zeigeTest();
      toast('Test beendet ✓');
    } catch (fehler) {
      zeigeFehler(testBox, fehler);
    }
  }

  zeigeTest();
  return h(
    'article',
    { class: 'karte' },
    h('h3', {}, '🔔 Erinnerungen'),
    h('p', { class: 'leise' }, 'Die Erinnerungen (1 Tag und 1 Stunde vorher) schickt Google Kalender auf dem Telefon, nicht diese App. Hier prüfst du, ob bei deinem Konto alles stimmt, und kannst sie testen.'),
    h(
      'div',
      { class: 'knopfzeile' },
      h('button', { class: 'knopf klein', type: 'button', onClick: pruefen }, 'Prüfen'),
      h('button', { class: 'knopf klein primaer', type: 'button', onClick: testStarten }, 'Test-Erinnerung starten'),
    ),
    ergebnis,
    testBox,
    erinnerungenAnleitung(),
  );
}
