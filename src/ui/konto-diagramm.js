// Kontostand: Zeitraum-Chips, Kennzahlen-Kacheln, „Kontostand-Verlauf“ (Linien) und „Veränderung pro Monat“ (Balken).
// Reines SVG, ohne Bibliothek. Jede Stelle mit Zahlen hat Hover/Tippen (Fadenkreuz bzw. Balken), Tastatur (←/→) und eine Tabellen-Ansicht;
// alle Texte kommen als Text in die Seite. Die Geometrie (Achsen, Pfade, Balken) steht getestet in app/views/konto-diagramm.js.
import { fuelle, h, svg } from './dom.js';
import { chip } from './components.js';
import { achsenText, balkenLayout, pfadTeile, schoeneSkala } from '../app/views/konto-diagramm.js';
import { deltaText } from '../domain/konto.js';

const BREITE = 340;

/** Eine Zeile „Zeitraum: 6 Monate · 12 Monate · Alles“ – ein Filter, der Diagramme und Kacheln darunter begrenzt. */
export function bereichLeiste(m, setze) {
  return h(
    'div',
    { class: 'konto-bereich', role: 'group', 'aria-label': 'Zeitraum der Diagramme' },
    h('span', { class: 'leise' }, 'Zeitraum'),
    h('div', { class: 'chip-reihe' }, m.bereiche.map((b) => chip(b.text, { art: m.bereich === b.wert ? 'aktiv' : '', onClick: () => setze(b.wert) }))),
  );
}

/** Drei Kennzahlen-Kacheln: Ersparnis im Zeitraum, Ø pro Monat, Monate im Plus (jeweils mit „ohne Extra“, wenn es Sonderbeträge gab). */
export function kacheln(m) {
  const z = m.zusammenfassung;
  if (!z) return null;
  const kachel = (titel, wert, zusatz) => h('div', { class: 'konto-kachel' }, h('span', { class: 'konto-kachel-titel' }, titel), h('b', { class: 'konto-kachel-wert' }, wert), zusatz ? h('small', {}, zusatz) : null);
  return h(
    'div',
    { class: 'konto-kacheln' },
    kachel(m.zeitraumText, z.seitBeginn, z.ohneExtra ? `ohne Extra ${z.ohneExtra.seitBeginn}` : null),
    kachel('Ø pro Monat', z.durchschnitt, z.ohneExtra ? `ohne Extra ${z.ohneExtra.durchschnitt}` : null),
    kachel('Im Plus', `${z.imPlus} von ${z.monate}`, z.ohneExtra ? z.ohneExtra.text.replace(/^\d+ von \d+ /, '') : 'Monaten'),
  );
}

/**
 * Hülle mit Tooltip: `zeige(index, xInViewBox, inhalt)` setzt den Tooltip neben die Stelle, `verstecke()` nimmt ihn weg.
 * Tippen/Maus/Tastatur laufen über dieselbe Funktion; der Tooltip ersetzt nie die Tabelle, er ergänzt sie.
 */
function huelleMitTooltip(beschriftung) {
  const tip = h('div', { class: 'diag-tip', role: 'status' });
  tip.hidden = true;
  const huelle = h('figure', { class: 'diagramm', tabindex: '0', role: 'group', 'aria-label': beschriftung }, tip);
  return {
    huelle,
    tip,
    zeige(xInViewBox, inhalt, svgKnoten) {
      fuelle(tip, ...inhalt);
      tip.hidden = false;
      const aussen = huelle.getBoundingClientRect();
      const innen = svgKnoten.getBoundingClientRect();
      const px = innen.left - aussen.left + (xInViewBox / BREITE) * innen.width;
      tip.style.left = `${Math.max(4, Math.min(px - tip.offsetWidth / 2, aussen.width - tip.offsetWidth - 4))}px`;
      tip.style.top = `${innen.top - aussen.top + 2}px`; // über dem Diagramm, die Legende bleibt sichtbar
    },
    verstecke() {
      tip.hidden = true;
    },
  };
}

function tabelleAus(tooltips) {
  return h(
    'details',
    { class: 'diag-tabelle' },
    h('summary', {}, 'Als Tabelle anzeigen'),
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Monat'), h('th', {}, 'Zusammen'), h('th', {}, 'Papa'), h('th', {}, 'Mama'))),
      h(
        'tbody',
        {},
        [...tooltips].reverse().map((t) =>
          h(
            'tr',
            {},
            h('th', { scope: 'row' }, t.monatText),
            t.zeilen.map((z) => h('td', {}, z.stand, z.veraenderung ? h('small', {}, ` ${z.veraenderung.text}`) : null)),
          ),
        ),
      ),
    ),
  );
}

function achsenGitter(skala, yFuer, links, rechts) {
  return skala.ticks.map((t) => svg('g', {}, svg('line', { class: 'diag-gitter', x1: links, x2: BREITE - rechts, y1: yFuer(t), y2: yFuer(t) }), svg('text', { class: 'diag-achse', x: links - 6, y: yFuer(t) + 3.5, 'text-anchor': 'end' }, achsenText(t))));
}

/** Kontostand-Verlauf: Papa, Mama und (dicker) Zusammen über die Monate. */
export function verlaufDiagramm(m) {
  const d = m.diagramm;
  if (!d) return null;
  const hoehe = 210;
  const rand = { links: 52, rechts: 12, oben: 14, unten: 34 };
  const alle = d.reihen.flatMap((r) => r.werte).filter((w) => w !== null);
  const skala = schoeneSkala(Math.min(...alle), Math.max(...alle));
  const plotBreite = BREITE - rand.links - rand.rechts;
  const plotHoehe = hoehe - rand.oben - rand.unten;
  const n = d.monate.length;
  const xFuer = (i) => rand.links + (n === 1 ? plotBreite / 2 : (i / (n - 1)) * plotBreite);
  const yFuer = (w) => rand.oben + ((skala.max - w) / (skala.max - skala.min)) * plotHoehe;

  const zusammen = d.reihen.find((r) => r.id === 'zusammen');
  const zusammenWerte = zusammen.werte.filter((w) => w !== null);
  const beschriftung = `Kontostand-Verlauf: Zusammen ${zusammenWerte.length > 0 ? `von ${achsenText(zusammenWerte[0])} auf ${achsenText(zusammenWerte.at(-1))}` : ''} (${d.monate[0].text} bis ${d.monate.at(-1).text}). Details als Tabelle darunter.`;
  const { huelle, zeige, verstecke } = huelleMitTooltip(beschriftung);

  const schritt = Math.ceil(n / 6);
  const markierungen = d.monate.map((mon, i) => {
    const zeigen = i % schritt === 0 || i === n - 1;
    if (!zeigen || (i !== n - 1 && n - 1 - i < schritt && schritt > 1)) return null;
    const jahrZeigen = i === 0 || mon.monat.endsWith('-01');
    return svg('g', {}, svg('text', { class: 'diag-achse', x: xFuer(i), y: hoehe - 18, 'text-anchor': 'middle' }, mon.kurz), jahrZeigen ? svg('text', { class: 'diag-achse jahr', x: xFuer(i), y: hoehe - 6, 'text-anchor': 'middle' }, mon.monat.slice(0, 4)) : null);
  });

  const reihenSvg = [...d.reihen].map((r) => {
    const teile = pfadTeile(r.werte, xFuer, yFuer);
    const alleMarker = n <= 12;
    const marker = teile.punkte.filter((p) => alleMarker || p.i === teile.punkte.at(-1).i);
    return svg(
      'g',
      { class: `diag-reihe ${r.id}`, 'data-reihe': r.id },
      teile.luecken.map((pfad) => svg('path', { class: 'diag-linie luecke', d: pfad })),
      teile.linien.map((pfad) => svg('path', { class: 'diag-linie', d: pfad })),
      marker.map((p) => svg('circle', { class: 'diag-punkt', cx: p.x, cy: p.y, r: 4.5 })),
    );
  });

  const fadenkreuz = svg('line', { class: 'diag-fadenkreuz', y1: rand.oben, y2: rand.oben + plotHoehe, visibility: 'hidden' });
  const hervorgehoben = svg('g', { class: 'diag-hervor' });
  const flaeche = svg('rect', { class: 'diag-treffer', x: rand.links - 8, y: rand.oben - 6, width: plotBreite + 16, height: plotHoehe + 12, fill: 'transparent' });
  const grafik = svg('svg', { class: 'konto-diagramm', viewBox: `0 0 ${BREITE} ${hoehe}`, role: 'img', 'aria-label': beschriftung }, achsenGitter(skala, yFuer, rand.links, rand.rechts), markierungen, reihenSvg, fadenkreuz, hervorgehoben, flaeche);

  let aktuell = null;
  function waehle(i) {
    aktuell = Math.max(0, Math.min(n - 1, i));
    const x = xFuer(aktuell);
    fadenkreuz.setAttribute('x1', x);
    fadenkreuz.setAttribute('x2', x);
    fadenkreuz.setAttribute('visibility', 'visible');
    fuelle(hervorgehoben, ...d.reihen.filter((r) => r.werte[aktuell] !== null).map((r) => svg('circle', { class: `diag-punkt hervor ${r.id}`, cx: x, cy: yFuer(r.werte[aktuell]), r: 5.5 })));
    const t = d.tooltips[aktuell];
    zeige(
      x,
      [h('b', { class: 'diag-tip-titel' }, t.monatText), ...t.zeilen.map((z) => h('div', { class: 'diag-tip-zeile' }, h('span', { class: `diag-schluessel ${z.id}` }), h('b', { class: 'diag-tip-wert' }, z.stand), z.veraenderung ? h('span', { class: `diag-tip-delta ${z.veraenderung.art}` }, z.veraenderung.text) : null, h('small', {}, z.label)))],
      grafik,
    );
  }
  function leere() {
    aktuell = null;
    fadenkreuz.setAttribute('visibility', 'hidden');
    fuelle(hervorgehoben);
    verstecke();
  }
  const naechster = (ev) => {
    const r = grafik.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * BREITE;
    waehle(Math.round(((x - rand.links) / plotBreite) * (n - 1)));
  };
  flaeche.addEventListener('pointermove', naechster);
  flaeche.addEventListener('pointerdown', naechster);
  flaeche.addEventListener('pointerleave', (ev) => ev.pointerType === 'mouse' && leere());
  huelle.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft') waehle((aktuell ?? n) - 1);
    else if (ev.key === 'ArrowRight') waehle((aktuell ?? -1) + 1);
    else if (ev.key === 'Home') waehle(0);
    else if (ev.key === 'End') waehle(n - 1);
    else if (ev.key === 'Escape') leere();
    else return;
    ev.preventDefault();
  });
  huelle.addEventListener('blur', leere);

  const legende = h('div', { class: 'diag-legende' }, d.legende.map((l) => h('span', { class: 'diag-legende-eintrag' }, h('span', { class: `diag-schluessel ${l.id}` }), h('span', {}, l.label), h('b', {}, l.letzter))));
  huelle.append(legende, grafik, tabelleAus(d.tooltips));
  return huelle;
}

/** Rundung nur am Datenende, am Fußpunkt eckig; `nachOben`: wächst der Balken nach oben (sonst nach unten). */
function balkenPfad(x, y, breite, hoehe, nachOben) {
  const r = Math.min(4, hoehe / 2, breite / 2);
  const rechts = x + breite;
  const unten = y + hoehe;
  return nachOben
    ? `M${x} ${unten} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${rechts - r} ${y} Q${rechts} ${y} ${rechts} ${y + r} L${rechts} ${unten} Z`
    : `M${x} ${y} L${rechts} ${y} L${rechts} ${unten - r} Q${rechts} ${unten} ${rechts - r} ${unten} L${x + r} ${unten} Q${x} ${unten} ${x} ${unten - r} Z`;
}

/** Veränderung pro Monat (Zusammen): Balken = gewöhnliche Ersparnis, Sonderbeträge umrandet, Ø als gestrichelte Linie. */
export function balkenDiagramm(m) {
  const balken = m.balken;
  if (balken.length === 0) return null;
  const hoehe = 190;
  const rand = { links: 52, rechts: 12, oben: 18, unten: 26 };
  const werte = balken.flatMap((b) => [b.wert, b.wert + b.extra]);
  const skala = schoeneSkala(Math.min(...werte), Math.max(...werte), { mitNull: true });
  const L = balkenLayout({ balken, breite: BREITE, hoehe, rand, skala });
  const yFuer = (w) => rand.oben + ((skala.max - w) / (skala.max - skala.min)) * (hoehe - rand.oben - rand.unten);
  const beschriftung = `Veränderung pro Monat (zusammen): ${balken.map((b) => b.text).join('; ')}`;
  const { huelle, zeige, verstecke } = huelleMitTooltip(beschriftung);

  // Beschriftet werden nur der letzte Balken und die Ausreißer (größter und kleinster Wert), nie jeder
  const beschriftet = new Set([balken.length - 1, balken.reduce((a, b, i) => (b.wert > balken[a].wert ? i : a), 0), balken.reduce((a, b, i) => (b.wert < balken[a].wert ? i : a), 0)]);
  const schritt = Math.ceil(balken.length / 8);
  const durchschnitt = m.balkenDurchschnitt;

  const marken = L.balken.map((b, i) => {
    const gruppe = svg('g', { class: 'diag-balken-gruppe', 'data-monat': b.monat });
    gruppe.append(svg('path', { class: `konto-balken ${b.art}`, d: balkenPfad(b.x, b.y, b.breite, b.hoehe, b.wert >= 0) }));
    if (b.extraBereich) gruppe.append(svg('rect', { class: 'konto-extra', x: b.x, y: b.extraBereich.y, width: b.breite, height: b.extraBereich.hoehe, rx: 3 }));
    if (beschriftet.has(i)) gruppe.append(svg('text', { class: 'diag-wert', x: b.mitteX, y: b.labelY, 'text-anchor': 'middle' }, deltaText(balken[i].wert)));
    if (i % schritt === 0 || i === balken.length - 1) gruppe.append(svg('text', { class: 'diag-achse', x: b.mitteX, y: hoehe - 8, 'text-anchor': 'middle' }, balken[i].kurz));
    return gruppe;
  });

  const hervor = svg('rect', { class: 'diag-balken-hervor', visibility: 'hidden', rx: 4 });
  const schritteBreite = (BREITE - rand.links - rand.rechts) / balken.length;
  const treffer = L.balken.map((b, i) => {
    const flaeche = svg('rect', { class: 'diag-treffer', x: b.mitteX - schritteBreite / 2, y: rand.oben - 6, width: schritteBreite, height: hoehe - rand.oben - rand.unten + 12, fill: 'transparent', tabindex: '-1' });
    const zeigeBalken = () => {
      const oben = Math.min(b.y, b.extraBereich?.y ?? b.y);
      const unten = Math.max(b.y + b.hoehe, b.extraBereich ? b.extraBereich.y + b.extraBereich.hoehe : 0);
      hervor.setAttribute('x', b.x - 2);
      hervor.setAttribute('y', oben - 2);
      hervor.setAttribute('width', b.breite + 4);
      hervor.setAttribute('height', unten - oben + 4);
      hervor.setAttribute('visibility', 'visible');
      zeige(b.mitteX, [h('b', { class: 'diag-tip-titel' }, balken[i].text)], grafik);
    };
    flaeche.addEventListener('pointermove', zeigeBalken);
    flaeche.addEventListener('pointerdown', zeigeBalken);
    flaeche.addEventListener('pointerleave', (ev) => ev.pointerType === 'mouse' && leere());
    flaeche.zeigeBalken = zeigeBalken;
    return flaeche;
  });

  const durchschnittLinie =
    durchschnitt && balken.length > 1
      ? svg('line', { class: 'diag-schnitt', x1: rand.links, x2: BREITE - rand.rechts, y1: yFuer(durchschnitt.wert), y2: yFuer(durchschnitt.wert) })
      : null;

  const grafik = svg('svg', { class: 'konto-diagramm', viewBox: `0 0 ${BREITE} ${hoehe}`, role: 'img', 'aria-label': beschriftung }, achsenGitter(skala, yFuer, rand.links, rand.rechts), svg('line', { class: 'konto-null', x1: rand.links, x2: BREITE - rand.rechts, y1: L.nullLinieY, y2: L.nullLinieY }), hervor, marken, durchschnittLinie, treffer);

  let aktuell = null;
  function leere() {
    aktuell = null;
    hervor.setAttribute('visibility', 'hidden');
    verstecke();
  }
  huelle.addEventListener('keydown', (ev) => {
    const n = balken.length;
    if (ev.key === 'ArrowLeft') aktuell = Math.max(0, (aktuell ?? n) - 1);
    else if (ev.key === 'ArrowRight') aktuell = Math.min(n - 1, (aktuell ?? -1) + 1);
    else if (ev.key === 'Escape') return leere();
    else return undefined;
    treffer[aktuell].zeigeBalken();
    ev.preventDefault();
    return undefined;
  });
  huelle.addEventListener('blur', leere);

  const legende = h(
    'div',
    { class: 'diag-legende' },
    h('span', { class: 'diag-legende-eintrag' }, h('span', { class: 'diag-schluessel plus' }), h('span', {}, 'Plus')),
    h('span', { class: 'diag-legende-eintrag' }, h('span', { class: 'diag-schluessel minus' }), h('span', {}, 'Minus')),
    balken.some((b) => b.extra !== 0) ? h('span', { class: 'diag-legende-eintrag' }, h('span', { class: 'diag-schluessel extra' }), h('span', {}, 'Sonderbeträge')) : null,
    durchschnitt && balken.length > 1 ? h('span', { class: 'diag-legende-eintrag' }, h('span', { class: 'diag-schluessel schnitt' }), h('b', {}, durchschnitt.text)) : null,
  );
  huelle.append(legende, grafik);
  return huelle;
}
