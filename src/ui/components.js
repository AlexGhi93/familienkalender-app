import { fuelle, h, svg } from './dom.js';

/** Farbe eines Typs als CSS-Variable `--c`; die Tönung kommt aus dem Stylesheet (color-mix). */
export const farbe = (hex) => ({ '--c': hex });

export function chip(text, { art = '', farbeHex = null, onClick = null } = {}) {
  return h(onClick ? 'button' : 'span', { class: `chip ${art}`.trim(), type: onClick ? 'button' : null, style: farbeHex ? farbe(farbeHex) : null, onClick }, text);
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

/** Blatt von unten (Tagesdetails, Bestätigungen). `render` baut den Inhalt; `neuZeichnen()` aktualisiert ihn. */
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
    setTimeout(() => huelle.remove(), 180);
    beimSchliessen();
  }
  document.addEventListener('keydown', beiTaste);
  neuZeichnen();
  document.body.append(huelle);
  requestAnimationFrame(() => huelle.classList.add('auf'));
  schliessenKnopf.focus();
  return { schliessen, neuZeichnen };
}

let toastZeitgeber = null;
export function toast(text) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('auf'));
  clearTimeout(toastZeitgeber);
  toastZeitgeber = setTimeout(() => {
    el.classList.remove('auf');
    setTimeout(() => el.remove(), 200);
  }, 2600);
}

/** Rückfrage als Blatt; ruft `beiJa` nur nach Bestätigung auf. */
export function bestaetigen({ titel, text, ja = 'Ja', nein = 'Abbrechen', gefahr = false, beiJa }) {
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
            onClick: () => {
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
