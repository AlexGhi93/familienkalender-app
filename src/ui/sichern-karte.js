// „Mehr“ → Sicherung: den ganzen Verlauf holen und als Datei speichern. Zwei Schritte (Vorbereiten, dann Speichern),
// weil Teilen/Herunterladen auf dem iPhone eine direkte Berührung braucht und das Holen etwas dauern kann.
import { fuelle, h } from './dom.js';
import { toast } from './components.js';
import { VERSION } from '../app/version.js';
import { sicherungAnzahlText, sicherungDateiname, sicherungErstellen, sicherungText } from '../app/sicherung.js';

let bereit = null; // { text, name, anzahl }: bleibt erhalten, wenn die Seite neu gezeichnet wird

const MELDUNG_ANMELDEN = 'Bitte zuerst neu anmelden (Mehr → Konto → Neu anmelden).';
const fehlerText = (fehler) => (fehler?.name === 'AuthAbgelaufen' ? MELDUNG_ANMELDEN : fehler?.message || 'Das hat nicht geklappt. Bitte noch einmal versuchen.');

const istApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Datei speichern: auf Apple-Geräten über das Teilen-Blatt („In Dateien sichern“), sonst als Download. */
function dateiSpeichern({ text, name }) {
  const datei = new File([text], name, { type: 'application/json' });
  if (istApple() && navigator.canShare?.({ files: [datei] })) {
    navigator.share({ files: [datei], title: name }).catch((fehler) => {
      if (fehler?.name !== 'AbortError') toast('Das Teilen hat nicht geklappt.');
    });
    return;
  }
  const adresse = URL.createObjectURL(datei);
  const link = h('a', { href: adresse, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 10_000);
}

export function sichernKarte({ store }) {
  const box = h('div', { class: 'sichern-box', 'aria-live': 'polite' });

  function zeichneBereit() {
    fuelle(
      box,
      bereit
        ? h(
            'div',
            { class: 'sichern-bereit' },
            h('p', {}, `Bereit: ${bereit.anzahl}.`),
            h('div', { class: 'knopfzeile' }, h('button', { class: 'knopf klein primaer', type: 'button', onClick: () => dateiSpeichern(bereit) }, `Datei speichern (${bereit.name})`)),
          )
        : null,
    );
  }

  async function vorbereiten(knopf) {
    knopf.disabled = true;
    fuelle(box, h('p', { class: 'leise' }, 'Ich hole den ganzen Verlauf aus den Kalendern …'));
    try {
      const daten = await store.sicherungsDaten();
      const sicherung = sicherungErstellen({ state: daten, appVersion: VERSION, jetzt: store.jetzt() });
      bereit = { text: sicherungText(sicherung), name: sicherungDateiname(store.heute()), anzahl: sicherungAnzahlText(sicherung) };
      zeichneBereit();
    } catch (fehler) {
      bereit = null;
      fuelle(box, h('p', { class: 'fehlertext' }, fehlerText(fehler)));
    }
    knopf.disabled = false;
  }

  const knopf = h('button', { class: 'knopf klein', type: 'button', onClick: () => vorbereiten(knopf) }, 'Sicherung vorbereiten');
  zeichneBereit();
  return h(
    'article',
    { class: 'karte' },
    h('h3', {}, 'Sicherung'),
    h('p', { class: 'leise' }, 'Speichert alles als Datei: Betreuungstage, Urlaub, Termine, Einkaufsliste und Einstellungen, auch ältere Monate. Die Datei enthält Arzttermine; bitte sicher aufbewahren.'),
    h('div', { class: 'knopfzeile' }, knopf),
    box,
  );
}
