import { fuelle, h } from './dom.js';
import { einrichtenBesitzer, codeEingeben } from './einrichtung-screen.js';

/** Erster Start: Neu einrichten (erstes Elternteil), Code eingeben (zweites Elternteil) oder Demo ansehen. */
export function zeigeWillkommen({ wurzel, speicher, google, konfiguration, jetzt, beiFertig }) {
  let hatDemo = false;
  try {
    hatDemo = speicher?.getItem('fk.demo.v1') != null;
  } catch {
    hatDemo = false;
  }
  const zurueck = () => zeigeWillkommen({ wurzel, speicher, google, konfiguration, jetzt, beiFertig });
  const kontext = { wurzel, google, konfiguration, jetzt, beiFertig, zurueck };

  const knopf = (emoji, titel, text, beiKlick, art = '') =>
    h('button', { class: `willkommen-knopf ${art}`.trim(), type: 'button', onClick: beiKlick }, h('span', { class: 'e', 'aria-hidden': 'true' }, emoji), h('b', {}, titel), h('small', {}, text));

  fuelle(
    wurzel,
    h(
      'main',
      { class: 'screen willkommen' },
      h('div', { class: 'logo', 'aria-hidden': 'true' }, '🌸'),
      h('h1', { class: 'gruss' }, 'Willkommen beim Familienkalender'),
      h('p', { class: 'datum' }, 'Krabbelstube, Kindergarten, Termine und Urlaub: für euch beide an einem Ort, auf beiden Telefonen.'),
      knopf('🚀', 'Neu einrichten', 'Ich bin das erste Elternteil und lege die Kalender an', () => einrichtenBesitzer(kontext), 'primaer'),
      knopf('🔑', 'Ich habe einen Code', 'Das andere Elternteil hat schon eingerichtet', () => codeEingeben(kontext)),
      knopf('👀', hatDemo ? 'Demo weiter ansehen' : 'Demo ausprobieren', 'Beispieldaten, nur auf diesem Gerät, nichts wird gespeichert oder geteilt', () => {
        konfiguration.speichern({ modus: 'demo' });
        beiFertig();
      }),
    ),
  );
}
