// Konto in Glas/Bento (1.2.0): neutrale Haken für die Bewegung – Konfetti je erreichtem Sparziel einmal je Besuch, und `data-von` am
// Umschalter „Kontostand · Fixkosten · Sparziele“ nur direkt nach dem Umschalten (daran gleitet der Tropfen/Blob in themes/konto.css).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { zuFeiern } from '../../src/ui/sparziele-screen.js';
import { GLEITEN_MS, OHNE_BILD_MS, kontoUmschalter } from '../../src/ui/fixkosten-screen.js';

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
    this.stil = {};
    this.style = { setProperty: (n, w) => (this.stil[n] = String(w)) };
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

  /** Ein Zeichnen des Umschalters zur Zeit `jetzt`; `bilder` sammelt die Rückrufe für das erste gemalte Bild, `x` ist die Stelle des Tropfens. */
  const bilder = [];
  const zeichne = (ui, jetzt, x = null) => kontoUmschalter(ui, { jetzt, bild: (fn) => bilder.push(fn), tropfenX: () => x });
  const gemalt = (t) => bilder.splice(0).forEach((fn) => fn(t));

  test('Betreten der Seite: kein data-von; Umschalten: die vorige Ansicht; Neuzeichnen während des Gleitens: läuft weiter, später: keins', () => {
    assert.equal(zeichne({ kontoAnsicht: 'kontostand', seiteBetreten: true }, 1000).getAttribute('data-von'), null);
    assert.equal(bilder.length, 0, 'beim Betreten wird nichts geplant');
    assert.equal(zeichne({ kontoAnsicht: 'sparziele' }, 2000).getAttribute('data-von'), 'kontostand');
    gemalt(2016);
    assert.equal(zeichne({ kontoAnsicht: 'sparziele' }, 2200).getAttribute('data-von'), 'kontostand', 'Neuzeichnen während des Gleitens');
    assert.equal(zeichne({ kontoAnsicht: 'sparziele' }, 2016 + GLEITEN_MS).getAttribute('data-von'), null, 'Neuzeichnen danach spielt nichts erneut');
    assert.equal(zeichne({ kontoAnsicht: 'fixkosten' }, 5000).getAttribute('data-von'), 'sparziele');
    assert.equal(zeichne({ kontoAnsicht: 'kontostand', seiteBetreten: true }, 5100).getAttribute('data-von'), null, 'wieder betreten: der Tropfen steht gleich');
    bilder.length = 0;
  });

  test('die Zeit zählt ab dem ersten GEMALTEN Bild: Neuzeichnen davor (z. B. Laden der Sparziele) beginnt das Gleiten von vorn (--kt-seit 0)', () => {
    zeichne({ kontoAnsicht: 'kontostand', seiteBetreten: true }, 0);
    assert.equal(zeichne({ kontoAnsicht: 'fixkosten' }, 100).stil['--kt-seit'], '0ms');
    // langsames Telefon: das Neuzeichnen kommt erst 700 ms später, noch vor dem ersten Bild
    const vorBild = zeichne({ kontoAnsicht: 'fixkosten' }, 800);
    assert.equal(vorBild.getAttribute('data-von'), 'kontostand');
    assert.equal(vorBild.stil['--kt-seit'], '0ms');
    gemalt(820);
    const danach = zeichne({ kontoAnsicht: 'fixkosten' }, 1070);
    assert.equal(danach.getAttribute('data-von'), 'kontostand');
    assert.equal(danach.stil['--kt-seit'], '-250ms', 'an derselben Stelle weiter');
    bilder.length = 0;
  });

  test('Start an der Stelle, an der der Tropfen gerade ist (auch mitten im Gleiten), als --kt-von in px', () => {
    zeichne({ kontoAnsicht: 'kontostand', seiteBetreten: true }, 0);
    const el = zeichne({ kontoAnsicht: 'sparziele' }, 100, 57.25);
    assert.equal(el.stil['--kt-von'], '57.25px');
    gemalt(116);
    assert.equal(zeichne({ kontoAnsicht: 'sparziele' }, 200, 140).stil['--kt-von'], '57.25px', 'Neuzeichnen behält den Start');
    const ohne = zeichne({ kontoAnsicht: 'fixkosten' }, 3000, null);
    assert.equal(ohne.stil['--kt-von'], undefined, 'unbekannt (Klassisch, reduziert): die Stelle der vorigen Ansicht aus dem CSS');
    bilder.length = 0;
  });

  test('wird nie ein Bild gemalt (Seite im Hintergrund), endet das Gleiten trotzdem', () => {
    zeichne({ kontoAnsicht: 'kontostand', seiteBetreten: true }, 0);
    zeichne({ kontoAnsicht: 'fixkosten' }, 100);
    assert.equal(zeichne({ kontoAnsicht: 'fixkosten' }, 100 + OHNE_BILD_MS).getAttribute('data-von'), null);
    bilder.length = 0;
  });

  test('die drei Knöpfe bleiben gleich (Reihenfolge, aria-pressed)', () => {
    const el = kontoUmschalter({ kontoAnsicht: 'fixkosten', seiteBetreten: true });
    assert.deepEqual(
      el.kinder.map((k) => [k.kinder[0].text, k.getAttribute('aria-pressed')]),
      [['Kontostand', 'false'], ['Fixkosten', 'true'], ['Sparziele', 'false']],
    );
  });
});
