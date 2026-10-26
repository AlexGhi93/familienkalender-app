// Pinsel des Schichtplans: eine feste Leiste über den Registerkarten (Papa | Mama, die Arten der Person, „– Frei“, „Fertig“).
// Art wählen, dann Tage antippen; jeder Tipp wird sofort gespeichert, eine Meldung gibt es nur bei Fehlern.
import { h } from './dom.js';
import { toast } from './components.js';
import { pinselAktion, pinselModel, pinselStart } from '../app/views/schicht-model.js';
import { schichtAm } from '../domain/schicht.js';
import { merker, GEMALT_MS, PINSEL_REIN_MS } from './schicht-bewegung.js';
import { zeitTeile } from './schicht-zeiten.js';

const PERSONEN = [
  ['papa', '👨 Papa'],
  ['mama', '👩 Mama'],
];

/**
 * CSS-Klassen zum Muster einer Art ('urlaub', 'offen' oder null): `gestreift` zeichnet die Streifen (Urlaub und z. B. Ersatzdienst E
 * gleich), `muster-…` sagt welches; unterscheiden lassen sich die Arten weiter an Kürzel und Farbe. Gilt für Raster, Legende, Pinsel,
 * Tagesblatt und Schichtarten.
 */
export const musterKlassen = (muster) => (muster ? `gestreift muster-${muster}` : '');

/**
 * Angezeigter Text mit Zeitspanne („Dienstbesprechung 18:00–19:30“): in Glas/Bento eine Hülle mit der Spanne als `.sp-zeiten` (kein
 * Umbruch nach dem Strich). Klassisch bekommt den Text unverändert (getrennte Textläufe verschöben dort Glyphen um Subpixel). Der Text
 * (textContent, Vorlesen) ist in beiden Fällen derselbe; ein Wechsel des Aussehens zeichnet die Seite beim nächsten Öffnen neu.
 */
export function mitZeiten(text) {
  if (!document.documentElement.hasAttribute('data-aussehen')) return text;
  const teile = zeitTeile(text);
  if (!teile.some((t) => t.zeit)) return text;
  return h('span', {}, teile.map((t) => (t.zeit ? h('span', { class: 'sp-zeiten' }, t.text) : t.text)));
}

// Haken für die Bewegung in Glas/Bento (themes/schicht.css, Merker in schicht-bewegung.js; in Klassisch ohne Stil): die Leiste trägt
// `sp-pinsel-neu`, solange sie nach dem Öffnen hereinfedert, der gerade gemalte Streifen `sp-gemalt`, solange er stempelt – jeweils mit
// der vergangenen Zeit als negativer Verzögerung (`--sp-pinsel-vor`, `--sp-gemalt-vor`): ein Neuzeichnen dazwischen (Tipp, Speichern)
// lässt die Bewegung weiterlaufen, statt sie springen oder neu beginnen zu lassen.
const leisteRein = merker(PINSEL_REIN_MS);
const gemalt = merker(GEMALT_MS);

/** Der gerade gemalte Streifen ({ datum, person, vorher, vor }) oder null, wenn kein Stempel mehr läuft. */
export const gemaltJetzt = () => gemalt.lesen();

/** Öffnet den Pinsel (Person nach Filter, erste aktive Art) bzw. schließt ihn. */
export function pinselUmschalten({ store, ui }) {
  ui.schicht.pinsel = ui.schicht.pinsel ? null : pinselStart(store.getState(), ui.schicht.filter);
  if (ui.schicht.pinsel) leisteRein.setzen({});
  else leisteRein.loeschen();
  gemalt.loeschen();
  ui.rendern();
}

/** Ein Tipp auf den Tag `datum` ('JJJJ-MM-TT') mit dem gewählten Pinsel. */
export function pinselTippen({ store }, pinsel, datum) {
  const jm = datum.slice(0, 7);
  const tag = Number(datum.slice(8));
  const state = store.getState();
  const { person, k } = pinselModel(state, pinsel); // eine inzwischen archivierte Art: wie angezeigt die erste aktive
  const a = pinselAktion(state, jm, tag, { person, k });
  if (!a) return;
  if (a.aktion === 'pinsel') gemalt.setzen({ datum, person, vorher: schichtAm(state.schicht?.monate?.[jm], person, tag) });
  else gemalt.loeschen();
  const aufrufe = {
    setzen: () => store.schichtSetzen(jm, tag, person, null),
    pinsel: () => store.schichtPinsel(jm, tag, person, a.k),
    zusatzDazu: () => store.schichtZusatzHinzufuegen(jm, tag, person, { k: a.k, von: a.von, bis: a.bis }),
    zusatzWeg: () => store.schichtZusatzEntfernen(jm, tag, person, { k: a.k, von: a.von, bis: a.bis }),
  };
  // Speicherfehler meldet der Store selbst (und nimmt nur diesen Tipp zurück); hier landen abgelehnte Änderungen, z. B. „Höchstens 3 Zusätze pro Tag.“
  aufrufe[a.aktion]().catch((fehler) => {
    gemalt.loeschen(); // abgelehnt: kein Stempel mehr auf dem zurückgenommenen Tag
    toast(fehler?.message ?? 'Das hat nicht geklappt. Bitte noch einmal versuchen.', { art: 'fehler' });
  });
}

/**
 * Die Seite braucht unten Platz für die Leiste, sonst verschwinden die letzten Tage dahinter. Die gemessene Höhe steht in
 * `--pinsel-hoehe` an der Wurzel: so ist sie beim Neuzeichnen nach jedem Tipp sofort da und die Seite springt nicht.
 */
function hoeheMerken(leiste) {
  if (typeof ResizeObserver === 'undefined') return;
  const beobachter = new ResizeObserver(() => {
    if (!leiste.isConnected) {
      beobachter.disconnect();
      return;
    }
    document.documentElement.style.setProperty('--pinsel-hoehe', `${Math.ceil(leiste.getBoundingClientRect().height)}px`);
  });
  beobachter.observe(leiste);
}

export function pinselLeiste({ store, ui }) {
  const p = pinselModel(store.getState(), ui.schicht.pinsel);
  const waehle = (k) => {
    ui.schicht.pinsel = { person: p.person, k };
    ui.rendern();
  };
  const artKnopf = (gewaehlt, kuerzelKlasse, kuerzel, name, k) =>
    h(
      'button',
      { class: `sp-pinsel-art ${gewaehlt ? 'aktiv' : ''}`.trim(), type: 'button', 'aria-pressed': gewaehlt ? 'true' : 'false', onClick: () => waehle(k) },
      h('i', { class: `sp-pinsel-kuerzel ${kuerzelKlasse}` }, kuerzel),
      ' ',
      h('span', { class: 'sp-pinsel-name' }, name), // Haken: Glas/Bento zeigen nur das Kürzel (der Name bleibt vorgelesen und steht im Hinweis)
    );

  const rein = leisteRein.lesen();
  const leiste = h(
    'section',
    { class: rein ? 'sp-pinsel sp-pinsel-neu' : 'sp-pinsel', 'aria-label': 'Pinsel: Schichten eintragen' },
    h(
      'div',
      { class: 'sp-pinsel-kopf' },
      h(
        'div',
        { class: 'sp-pinsel-wer', role: 'group', 'aria-label': 'Für wen' },
        PERSONEN.map(([person, text]) =>
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': p.person === person ? 'true' : 'false',
              onClick: () => {
                if (p.person === person) return;
                ui.schicht.pinsel = pinselStart(store.getState(), person);
                ui.rendern();
              },
            },
            text,
          ),
        ),
      ),
      h('button', { class: 'sp-pinsel-fertig', type: 'button', onClick: () => pinselUmschalten({ store, ui }) }, 'Fertig'),
    ),
    h(
      'div',
      { class: 'sp-pinsel-arten', role: 'group', 'aria-label': 'Schichtart' },
      p.arten.map((a) => artKnopf(a.gewaehlt, `sf-${a.farbe} ${musterKlassen(a.muster)}`.trim(), a.kuerzel, a.name, a.k)),
      artKnopf(p.frei, 'frei', '–', 'Frei', null),
    ),
    h('p', { class: 'sp-pinsel-hinweis' }, mitZeiten(p.hinweis)),
  );
  if (rein) leiste.style?.setProperty('--sp-pinsel-vor', `${-Math.round(rein.vor)}ms`); // Haken: federt weiter, wo sie war
  hoeheMerken(leiste);
  return leiste;
}
