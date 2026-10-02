// Kleine Helfer zum Bauen von DOM-Knoten. Text wird immer als Textknoten eingefügt, nie als HTML:
// Kalenderdaten (Titel, Notizen) können so keinen Code einschleusen.

const SVG_NS = 'http://www.w3.org/2000/svg';

function eigenschaftenSetzen(el, eigenschaften) {
  for (const [name, wert] of Object.entries(eigenschaften ?? {})) {
    if (wert == null || wert === false) continue;
    if (name === 'style') {
      for (const [prop, w] of Object.entries(wert)) el.style.setProperty(prop, w);
    } else if (name.startsWith('on')) {
      el.addEventListener(name.slice(2).toLowerCase(), wert);
    } else {
      el.setAttribute(name, wert === true ? '' : String(wert));
    }
  }
}

function kinderAnhaengen(el, kinder) {
  for (const k of kinder.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function h(tag, eigenschaften = {}, ...kinder) {
  const el = document.createElement(tag);
  eigenschaftenSetzen(el, eigenschaften);
  kinderAnhaengen(el, kinder);
  return el;
}

export function svg(tag, eigenschaften = {}, ...kinder) {
  const el = document.createElementNS(SVG_NS, tag);
  eigenschaftenSetzen(el, eigenschaften);
  kinderAnhaengen(el, kinder);
  return el;
}

/** Ersetzt den Inhalt von `el`; `null` und `false` werden übersprungen (replaceChildren würde sie als Text „null“ einfügen). */
export function fuelle(el, ...kinder) {
  el.replaceChildren();
  kinderAnhaengen(el, kinder);
  return el;
}
