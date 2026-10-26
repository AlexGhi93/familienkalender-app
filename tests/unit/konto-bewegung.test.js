// Konto in Glas/Bento (1.2.0): neutrale Haken für die Bewegung – Konfetti je erreichtem Sparziel einmal je Besuch, und `data-von` am
// Umschalter „Kontostand · Fixkosten · Sparziele“ nur direkt nach dem Umschalten (daran gleitet der Tropfen/Blob in themes/konto.css).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { zuFeiern } from '../../src/ui/sparziele-screen.js';
import { GLEITEN_MS, kontoUmschalter } from '../../src/ui/fixkosten-screen.js';

/** Kleinstes DOM für h(): Elemente mit Attributen, Stil, Kindern und Ereignissen. */
class Knoten {}
class Text extends Knoten {
  constructor(text) {
    super();
    this.text = text;
  }
}
class El extends Knoten {
  constructor(tag) {
    super();
    this.tag = tag;
    this.attribute = new Map();
    this.kinder = [];
    this.style = { setProperty() {} };
  }
  setAttribute(n, w) {
    this.attribute.set(n, String(w));
  }
  getAttribute(n) {
    return this.attribute.has(n) ? this.attribute.get(n) : null;
  }
  addEventListener() {}
  append(...k) {
    this.kinder.push(...k);
  }
}

describe('Sparziele: Konfetti je erreichtem Ziel einmal je Besuch', () => {
  const ziel = (id, art) => ({ id, status: { art } });

  test('nur erreichte Ziele („fertig“), jedes nur einmal – Neuzeichnen feiert nichts erneut', () => {
    const gemerkt = new Set();
    assert.deepEqual(zuFeiern([ziel('a', 'fertig'), ziel('b', 'ok'), ziel('c', 'fertig')], gemerkt), ['a', 'c']);
    assert.deepEqual(zuFeiern([ziel('a', 'fertig'), ziel('b', 'ok'), ziel('c', 'fertig')], gemerkt), []);
  });

  test('ein Ziel, das gerade erst erreicht wurde, wird gefeiert; ein neuer Besuch (geleerter Merker) feiert wieder', () => {
    const gemerkt = new Set();
    zuFeiern([ziel('a', 'fertig'), ziel('b', 'warn')], gemerkt);
    assert.deepEqual(zuFeiern([ziel('a', 'fertig'), ziel('b', 'fertig')], gemerkt), ['b']);
    gemerkt.clear();
    assert.deepEqual(zuFeiern([ziel('a', 'fertig'), ziel('b', 'fertig')], gemerkt), ['a', 'b']);
  });
});

describe('Konto-Umschalter: data-von nur direkt nach dem Umschalten', () => {
  let alt;
  before(() => {
    alt = { document: globalThis.document, Node: globalThis.Node };
    globalThis.document = { createElement: (tag) => new El(tag), createTextNode: (t) => new Text(t) };
    globalThis.Node = Knoten;
  });
  after(() => {
    globalThis.document = alt.document;
    globalThis.Node = alt.Node;
  });

  const von = (ui, jetzt) => kontoUmschalter(ui, { jetzt }).getAttribute('data-von');

  test('Betreten der Seite: kein data-von; Umschalten: die vorige Ansicht; Neuzeichnen kurz danach: läuft weiter, später: keins', () => {
    assert.equal(von({ kontoAnsicht: 'kontostand', seiteBetreten: true }, 1000), null);
    assert.equal(von({ kontoAnsicht: 'sparziele', seiteBetreten: false }, 2000), 'kontostand');
    assert.equal(von({ kontoAnsicht: 'sparziele', seiteBetreten: false }, 2200), 'kontostand', 'Neuzeichnen während des Gleitens');
    assert.equal(von({ kontoAnsicht: 'sparziele', seiteBetreten: false }, 2000 + GLEITEN_MS), null, 'Neuzeichnen danach spielt nichts erneut');
    assert.equal(von({ kontoAnsicht: 'fixkosten', seiteBetreten: false }, 5000), 'sparziele');
    assert.equal(von({ kontoAnsicht: 'kontostand', seiteBetreten: true }, 5100), null, 'wieder betreten: der Tropfen steht gleich');
  });

  test('beim Neuzeichnen während des Gleitens: --kt-seit = schon vergangene Zeit (negativ), damit es an derselben Stelle weiterläuft', () => {
    const gesetzt = [];
    globalThis.document.createElement = (tag) => {
      const el = new El(tag);
      el.style = { setProperty: (n, w) => gesetzt.push([n, w]) };
      return el;
    };
    kontoUmschalter({ kontoAnsicht: 'kontostand', seiteBetreten: true }, { jetzt: 0 });
    kontoUmschalter({ kontoAnsicht: 'fixkosten' }, { jetzt: 100 });
    kontoUmschalter({ kontoAnsicht: 'fixkosten' }, { jetzt: 350 });
    assert.deepEqual(gesetzt, [['--kt-seit', '0ms'], ['--kt-seit', '-250ms']]);
  });

  test('die drei Knöpfe bleiben gleich (Reihenfolge, aria-pressed)', () => {
    const el = kontoUmschalter({ kontoAnsicht: 'fixkosten', seiteBetreten: true });
    assert.deepEqual(
      el.kinder.map((k) => [k.kinder[0].text, k.getAttribute('aria-pressed')]),
      [['Kontostand', 'false'], ['Fixkosten', 'true'], ['Sparziele', 'false']],
    );
  });
});
