import { fuelle, h } from './dom.js';
import { bestaetigen, toast } from './components.js';
import { freigabeAnleitung } from './anleitung.js';
import { todayVienna } from '../domain/dates.js';
import { createGoogleAdapter } from '../calendar/google-adapter.js';
import { FreigabeFehlt, abonniere, codeErzeugen, codeLesen, freigabeVorschau, richteEin, teile } from '../calendar/setup.js';

const seite = (zurueck, ...inhalt) =>
  h('main', { class: 'screen einrichtung' }, zurueck ? h('button', { class: 'zurueck', type: 'button', onClick: zurueck }, '‹ Zurück') : null, ...inhalt);

async function kopieren(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopiert ✓');
  } catch {
    toast('Kopieren hat nicht geklappt. Bitte den Code von Hand markieren.');
  }
}

const googleHinweis = () =>
  h('p', { class: 'leise' }, 'Beim ersten Mal zeigt Google „Nicht bestätigte App“. Das ist bei uns normal (die App ist nur für euch zwei): „Weiter“ bzw. „Erweitert“ → „Trotzdem fortfahren“ und dann den Zugriff erlauben.');

/** Erstes Elternteil: Anmelden, Kalender anlegen, Code zum Weitergeben, Freigabe. */
export function einrichtenBesitzer({ wurzel, google, konfiguration, jetzt, beiFertig, zurueck }) {
  const { auth, api } = google.erzeuge();
  const z = { schritt: 'start', fehler: null, beschaeftigt: false, kalender: null, code: null, vorschau: null, freigabeText: null };
  auth.vorbereiten();

  function los() {
    const anmeldung = auth.anmelden(); // sofort, im Tipp: sonst blockieren Telefone das Google-Fenster
    z.beschaeftigt = true;
    z.fehler = null;
    zeichne();
    anmeldung
      .then(async () => {
        z.schritt = 'laeuft';
        zeichne();
        const r = await richteEin(api);
        if (r.neuAngelegt.length === 3) {
          await createGoogleAdapter({ api, kalender: r.kalender, jetzt }).speichereSettings({ erfassungAb: todayVienna(jetzt()) });
        }
        if (!konfiguration.speichern({ modus: 'google', rolle: 'besitzer', kalender: r.kalender })) throw new Error('Die Einstellungen konnten auf diesem Telefon nicht gespeichert werden.');
        z.kalender = r.kalender;
        z.code = codeErzeugen(r.kalender);
        z.schritt = 'einladen';
      })
      .catch((fehler) => {
        z.fehler = fehler.message;
        z.schritt = 'start';
      })
      .finally(() => {
        z.beschaeftigt = false;
        zeichne();
      });
  }

  async function freigabePruefen(eingabe) {
    try {
      z.vorschau = freigabeVorschau(eingabe);
      z.fehler = null;
    } catch (fehler) {
      z.vorschau = null;
      z.fehler = fehler.message;
    }
    zeichne();
  }

  function freigabeSenden() {
    bestaetigen({
      titel: 'Wirklich freigeben?',
      text: `${z.vorschau.zeilen[0]} Das lässt sich nur in Google Kalender wieder entziehen.`,
      ja: 'Ja, freigeben',
      beiJa: async () => {
        try {
          const r = await teile(api, z.kalender, z.vorschau, { bestaetigt: true });
          z.freigabeText = r.geteilt ? 'Geteilt ✓ Das andere Elternteil kann jetzt „Ich habe einen Code“ wählen.' : 'Google erlaubt das nicht automatisch. Bitte die Kalender wie unten beschrieben teilen.';
        } catch (fehler) {
          z.freigabeText = fehler.message;
        }
        z.vorschau = null;
        zeichne();
      },
    });
  }

  function zeichne() {
    if (z.schritt === 'start') {
      fuelle(
        wurzel,
        seite(
          zurueck,
          h('h1', { class: 'gruss' }, 'Einrichten 🚀'),
          h('article', { class: 'karte' }, h('p', {}, 'Du meldest dich mit Google an, danach legt die App drei Kalender für euch an: „Termine“, „Abwesenheit“ und „Anwesenheit“.'), googleHinweis(), z.fehler ? h('p', { class: 'fehlertext' }, z.fehler) : null, h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf primaer', type: 'button', disabled: z.beschaeftigt, onClick: los }, z.beschaeftigt ? 'Einen Moment …' : 'Mit Google anmelden'))),
        ),
      );
    } else if (z.schritt === 'laeuft') {
      fuelle(wurzel, seite(null, h('h1', { class: 'gruss' }, 'Ich richte alles ein … ✨'), h('article', { class: 'karte' }, h('p', {}, 'Die drei Familienkalender werden angelegt und eingestellt. Das dauert nur einen Moment.'))));
    } else if (z.schritt === 'einladen') {
      const emailFeld = h('input', { type: 'email', autocomplete: 'off', placeholder: 'adresse@beispiel.at', 'aria-label': 'E-Mail-Adresse des anderen Elternteils' });
      fuelle(
        wurzel,
        seite(
          null,
          h('h1', { class: 'gruss' }, 'Fast fertig 🎉'),
          h('article', { class: 'karte' }, h('h3', {}, 'Code für das andere Elternteil'), h('p', { class: 'code' }, z.code), h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => kopieren(z.code) }, 'Code kopieren')), h('p', { class: 'leise' }, 'Schick den Code zum Beispiel per Nachricht. Er ist kein Passwort: ohne Freigabe öffnet er nichts.')),
          h('article', { class: 'karte' }, h('h3', {}, 'Kalender teilen'), freigabeAnleitung(), z.freigabeText ? h('p', { class: 'hinweis-text' }, z.freigabeText) : null, z.fehler ? h('p', { class: 'fehlertext' }, z.fehler) : null,
            z.vorschau
              ? h('div', { class: 'vorschau' }, h('small', {}, 'Bitte genau prüfen:'), h('b', { class: 'adresse' }, z.vorschau.anzeige), h('small', {}, z.vorschau.zeilen[0]), h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => { z.vorschau = null; zeichne(); } }, 'Ändern'), h('button', { class: 'knopf klein primaer', type: 'button', onClick: freigabeSenden }, 'Adresse stimmt')))
              : h('div', { class: 'feld' }, h('span', {}, 'Adresse des anderen Elternteils (optional: wir versuchen die Freigabe automatisch)'), emailFeld, h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein', type: 'button', onClick: () => freigabePruefen(emailFeld.value) }, 'Prüfen'))),
          ),
          h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf primaer', type: 'button', onClick: beiFertig }, 'Fertig, los geht’s')),
        ),
      );
    }
  }

  zeichne();
}

/** Zweites Elternteil: Code eingeben, anmelden, Kalender abonnieren. */
export function codeEingeben({ wurzel, google, konfiguration, beiFertig, zurueck }) {
  const { auth, api } = google.erzeuge();
  const z = { fehler: null, beschaeftigt: false, kalender: null, fehlt: false, text: '' };
  auth.vorbereiten();

  async function abonnieren() {
    try {
      await abonniere(api, z.kalender);
      if (!konfiguration.speichern({ modus: 'google', rolle: 'partner', kalender: z.kalender })) throw new Error('Die Einstellungen konnten auf diesem Telefon nicht gespeichert werden.');
      beiFertig();
    } catch (fehler) {
      z.fehler = fehler.message;
      z.fehlt = fehler instanceof FreigabeFehlt;
      z.beschaeftigt = false;
      zeichne();
    }
  }

  function weiter(text) {
    try {
      z.kalender = codeLesen(text);
    } catch (fehler) {
      z.fehler = fehler.message;
      zeichne();
      return;
    }
    const anmeldung = auth.anmelden(); // sofort, im Tipp
    z.beschaeftigt = true;
    z.fehler = null;
    zeichne();
    anmeldung.then(abonnieren).catch((fehler) => {
      z.fehler = fehler.message;
      z.beschaeftigt = false;
      zeichne();
    });
  }

  function zeichne() {
    const feld = h('textarea', { rows: '3', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'FK1.…', 'aria-label': 'Einrichtungscode', onInput: (e) => { z.text = e.target.value; } }, z.text);
    fuelle(
      wurzel,
      seite(
        zurueck,
        h('h1', { class: 'gruss' }, 'Ich habe einen Code 🔑'),
        h(
          'article',
          { class: 'karte' },
          h('p', {}, 'Das andere Elternteil hat schon eingerichtet und dir einen Code geschickt. Füge ihn hier ein.'),
          h('div', { class: 'feld' }, h('span', {}, 'Code'), feld),
          googleHinweis(),
          z.fehler ? h('p', { class: 'fehlertext' }, z.fehler) : null,
          z.fehlt ? freigabeAnleitung() : null,
          h(
            'div',
            { class: 'knopfzeile' },
            z.fehlt
              ? h('button', { class: 'knopf primaer', type: 'button', onClick: () => { z.beschaeftigt = true; z.fehler = null; zeichne(); abonnieren(); } }, 'Noch einmal versuchen')
              : h('button', { class: 'knopf primaer', type: 'button', disabled: z.beschaeftigt, onClick: () => weiter(z.text) }, z.beschaeftigt ? 'Einen Moment …' : 'Weiter mit Google'),
          ),
        ),
      ),
    );
  }

  zeichne();
}
