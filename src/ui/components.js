import { blattZiehenAnbinden } from './blatt-ziehen.js';
import { blattSchliessenMs } from './bewegung.js';
import { fuelle, h, svg } from './dom.js';

/** Farbe eines Typs als CSS-Variable `--c`; die Tönung kommt aus dem Stylesheet (color-mix). */
export const farbe = (hex) => ({ '--c': hex });

/**
 * Chip: mit `onClick` ein Knopf, sonst eine Marke. Ein Knopf, dem `art` mitgegeben wird, ist eine Wahl (gewählt = Klasse `aktiv`):
 * er sagt Bildschirmlesern über `aria-pressed`, ob er gewählt ist. Knöpfe ohne `art` tun etwas (z. B. „＋ Milch“) und bekommen nichts.
 */
export function chip(text, { art, farbeHex = null, onClick = null } = {}) {
  const klasse = `chip ${art ?? ''}`.trim();
  const gewaehlt = onClick && art !== undefined ? String(/(^|\s)aktiv(\s|$)/.test(art)) : null;
  return h(onClick ? 'button' : 'span', { class: klasse, type: onClick ? 'button' : null, 'aria-pressed': gewaehlt, style: farbeHex ? farbe(farbeHex) : null, onClick }, text);
}

export function abschnitt(titel, ...inhalt) {
  return h('section', { class: 'abschnitt' }, h('h2', {}, titel), ...inhalt);
}

/** Ring für den Urlaub: dunkel = genommen, hell = geplant, Rest = offen. */
export function urlaubRing({ genommen, geplant, ziel, groesse = 66 }) {
  const r = 26;
  const umfang = 2 * Math.PI * r;
  const g = Math.min(1, genommen / ziel);
  const p = Math.min(1 - g, geplant / ziel);
  const kreis = (klasse, laenge, versatz = 0) =>
    svg('circle', {
      class: klasse,
      cx: 33,
      cy: 33,
      r,
      fill: 'none',
      'stroke-width': 9,
      'stroke-linecap': 'round',
      'stroke-dasharray': `${laenge} ${umfang}`,
      'stroke-dashoffset': -versatz,
      transform: 'rotate(-90 33 33)',
    });
  const summe = genommen + geplant;
  return svg(
    'svg',
    { class: 'ring', viewBox: '0 0 66 66', width: groesse, height: groesse, role: 'img', 'aria-label': `${summe} von ${ziel} Urlaubstagen` },
    kreis('ring-bahn', umfang),
    p > 0 ? kreis('ring-geplant', p * umfang, g * umfang) : null,
    g > 0 ? kreis('ring-genommen', g * umfang) : null,
    svg('text', { x: 33, y: 38, 'text-anchor': 'middle', class: 'ring-zahl' }, `${Math.round((summe / 5) * 10) / 10}`.replace('.', ',')),
  );
}

/**
 * Blatt von unten (Tagesdetails, Bestätigungen). `render` baut den Inhalt; `neuZeichnen()` aktualisiert ihn.
 * Schließen mit ✕, Escape, Tipp auf den Hintergrund oder nach unten wischen; `beimSchliessen` läuft dabei genau einmal.
 */
export function blatt({ titel, render, beimSchliessen = () => {} }) {
  const inhalt = h('div', { class: 'blatt-inhalt' });
  const schliessenKnopf = h('button', { class: 'blatt-zu', type: 'button', 'aria-label': 'Schließen', onClick: () => schliessen() }, '✕');
  const kopf = h('div', { class: 'blatt-kopf' }, h('h2', {}, titel), schliessenKnopf);
  const tafel = h('div', { class: 'blatt', role: 'dialog', 'aria-modal': 'true', 'aria-label': titel }, h('div', { class: 'blatt-griff' }), kopf, inhalt);
  const hintergrund = h('div', { class: 'blatt-hintergrund', onClick: () => schliessen() });
  const huelle = h('div', { class: 'blatt-huelle' }, hintergrund, tafel);

  let offen = true;
  const beiTaste = (e) => {
    if (e.key === 'Escape') schliessen();
  };
  function neuZeichnen() {
    fuelle(inhalt, render({ schliessen }));
  }
  function schliessen() {
    if (!offen) return;
    offen = false;
    document.removeEventListener('keydown', beiTaste);
    huelle.classList.add('zu');
    // Bei reduzierter Bewegung gibt es nichts hinauszugleiten: gleich weg, damit nichts unsichtbar über der Seite liegt.
    // Klassisch wie bisher 180 ms; Glas/Bento so lange wie ihr Blatt-Übergang (--dauer-mittel), siehe bewegung.js.
    const nachMs = blattSchliessenMs(document);
    if (nachMs === 0) huelle.remove();
    else setTimeout(() => huelle.remove(), nachMs);
    beimSchliessen();
  }
  blattZiehenAnbinden({ huelle, tafel, schliessen });
  document.addEventListener('keydown', beiTaste);
  neuZeichnen();
  document.body.append(huelle);
  // erst im nächsten Bild „auf“ (damit es hereingleitet) – aber nicht mehr, wenn es inzwischen schon geschlossen wurde
  requestAnimationFrame(() => {
    if (offen) huelle.classList.add('auf');
  });
  schliessenKnopf.focus();
  return { schliessen, neuZeichnen };
}

/** Zähler mit − und +: `beiAenderung(neuerWert)` wird nur innerhalb von min…max aufgerufen. */
export function wochenStepper({ wert, min, max, beschriftung, beiAenderung }) {
  return h(
    'div',
    { class: 'stepper' },
    h('button', { class: 'rund', type: 'button', 'aria-label': `${beschriftung} weniger`, disabled: wert <= min, onClick: () => beiAenderung(wert - 1) }, '−'),
    h('span', { class: 'stepper-wert' }, `${wert} ${beschriftung}`),
    h('button', { class: 'rund', type: 'button', 'aria-label': `${beschriftung} mehr`, disabled: wert >= max, onClick: () => beiAenderung(wert + 1) }, '+'),
  );
}

let toastZeitgeber = null;
/**
 * Kurze Meldung unten; mit `aktion` ({ text, beiKlick }) bleibt sie 10 Sekunden und bietet z. B. „Rückgängig“ an. `ersetztFehler`:
 * die Meldung gehört zu einer GELUNGENEN neuen Aktion und darf eine noch stehende Fehlermeldung (einer früheren Aktion) ersetzen.
 */
export function toast(text, { aktion = null, dauer = aktion ? 10000 : 2600, art = '', ersetztFehler = false } = {}) {
  // Eine Fehlermeldung wird nicht von einer „Gespeichert ✓“-Meldung derselben Aktion überdeckt.
  if (art !== 'fehler' && !ersetztFehler && document.querySelector('.toast.fehler')) return;
  document.querySelector('.toast')?.remove();
  clearTimeout(toastZeitgeber);
  const el = h(
    'div',
    { class: `toast ${art}`.trim(), role: art === 'fehler' ? 'alert' : 'status' },
    h('span', {}, text),
    aktion
      ? h(
          'button',
          {
            class: 'toast-aktion',
            type: 'button',
            onClick: async () => {
              clearTimeout(toastZeitgeber);
              el.remove();
              await aktion.beiKlick();
            },
          },
          aktion.text,
        )
      : null,
  );
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('auf'));
  toastZeitgeber = setTimeout(() => {
    el.classList.remove('auf');
    setTimeout(() => el.remove(), 200);
  }, dauer);
}

/** Entfernt eine angezeigte Fehlermeldung (z. B. wenn die nächste Aktion beginnt). */
export function entferneFehlerToast() {
  document.querySelector('.toast.fehler')?.remove();
}

/**
 * Rückfrage als Blatt; ruft `beiJa` nur nach Bestätigung auf – und höchstens einmal: ein Doppeltipp, während das Blatt noch
 * hinausgleitet, löst die Aktion kein zweites Mal aus (der Knopf ist sofort aus).
 */
export function bestaetigen({ titel, text, ja = 'Ja', nein = 'Abbrechen', gefahr = false, beiJa }) {
  let gewaehlt = false;
  return blatt({
    titel,
    render: ({ schliessen }) => [
      h('p', { class: 'blatt-text' }, text),
      h(
        'div',
        { class: 'knopfzeile' },
        h('button', { class: 'knopf klein', type: 'button', onClick: schliessen }, nein),
        h(
          'button',
          {
            class: `knopf klein ${gefahr ? 'gefahr' : 'primaer'}`,
            type: 'button',
            onClick: (ev) => {
              if (gewaehlt) return;
              gewaehlt = true;
              ev.currentTarget.disabled = true;
              schliessen();
              beiJa();
            },
          },
          ja,
        ),
      ),
    ],
  });
}
