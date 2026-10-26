// Gemeinsame Bewegung für Glas und Bento (src/ui/bewegung.js) mit einem kleinen Ersatz-DOM (wie push-abschnitt.test.js):
// an/aus nach data-bewegung und prefers-reduced-motion, nur in Glas/Bento wirksam, Einblenden nur beim ersten Zeichnen eines
// Bildschirms je Besuch, Hochzählen endet immer beim genauen Text, Konfetti nur in Bento und räumt sich weg, Tabwechsel blockiert nichts.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  bewegungAn,
  effekteAn,
  tabWechsel,
  einblenden,
  neuerBesuch,
  hochzaehlen,
  fortschritt,
  konfetti,
  blattSchliessenMs,
  EINBLENDEN_KLASSE,
  MAX_KONFETTI,
  KONFETTI_MS,
} from '../../src/ui/bewegung.js';

class Klassen {
  constructor() {
    this.s = new Set();
  }
  add(...k) {
    for (const x of k) this.s.add(x);
  }
  remove(...k) {
    for (const x of k) this.s.delete(x);
  }
  contains(k) {
    return this.s.has(k);
  }
}

class El {
  constructor(tag, dok) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = dok;
    this.classList = new Klassen();
    this.attr = {};
    this.children = [];
    this.parent = null;
    this.stil = {};
    this._text = '';
    this.style = {
      setProperty: (k, v) => (this.stil[k] = String(v)),
      removeProperty: (k) => delete this.stil[k],
      getPropertyValue: (k) => this.stil[k] ?? '',
    };
  }
  get textContent() {
    return this.children.length > 0 ? this.children.map((k) => k.textContent).join('') : this._text;
  }
  set textContent(wert) {
    for (const k of this.children) k.parent = null;
    this.children = [];
    this._text = String(wert);
  }
  getAttribute(n) {
    return n in this.attr ? this.attr[n] : null;
  }
  setAttribute(n, v) {
    this.attr[n] = String(v);
  }
  removeAttribute(n) {
    delete this.attr[n];
  }
  append(...kinder) {
    for (const k of kinder) {
      k.remove?.();
      k.parent = this;
      this.children.push(k);
    }
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  get parentElement() {
    return this.parent;
  }
  get isConnected() {
    let e = this;
    while (e.parent) e = e.parent;
    return e === this.ownerDocument.documentElement;
  }
  get offsetWidth() {
    return 0;
  }
  getBoundingClientRect() {
    return { left: 40, top: 300, width: 200, height: 12 };
  }
}

/** Ein Dokument mit Fenster: Zeitgeber und Bildwechsel (rAF) laufen nur, wenn der Test sie anstößt. */
function neuesDokument({ aussehen = null, bewegung = null, reduziert = false, viewTransition = false, css = {} } = {}) {
  let naechsteId = 1;
  const zeitgeber = new Map();
  const bilder = new Map();
  const fenster = {
    matchMedia: (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' && reduziert }),
    setTimeout: (fn, ms) => {
      zeitgeber.set(naechsteId, { fn, ms });
      return naechsteId++;
    },
    clearTimeout: (id) => zeitgeber.delete(id),
    requestAnimationFrame: (fn) => {
      bilder.set(naechsteId, fn);
      return naechsteId++;
    },
    cancelAnimationFrame: (id) => bilder.delete(id),
    getComputedStyle: () => ({ getPropertyValue: (n) => css[n] ?? '' }),
  };
  const hoerer = {};
  const dok = {
    defaultView: fenster,
    createElement: (t) => new El(t, dok),
    addEventListener: (art, fn) => (hoerer[art] ??= []).push(fn),
    elementFromPoint: () => null,
  };
  /** Ein Ereignis am Dokument (Erfassungsphase), wie es der Browser schickt. */
  const melde = (art, e) => {
    for (const fn of hoerer[art] ?? []) fn(e);
  };
  dok.documentElement = new El('html', dok);
  dok.body = new El('body', dok);
  dok.documentElement.append(dok.body);
  if (aussehen) dok.documentElement.setAttribute('data-aussehen', aussehen);
  if (bewegung) dok.documentElement.setAttribute('data-bewegung', bewegung);
  const wechsel = [];
  if (viewTransition) {
    dok.startViewTransition = (f) => {
      const w = { f, uebersprungen: false, aufgerufen: false };
      let fertig;
      w.finished = new Promise((r) => (fertig = r));
      w.ready = Promise.resolve();
      w.updateCallbackDone = Promise.resolve().then(() => {
        w.aufgerufen = true;
        f();
      });
      w.skipTransition = () => {
        w.uebersprungen = true;
        fertig();
      };
      w.beenden = () => fertig();
      wechsel.push(w);
      return w;
    };
  }
  /** Alle wartenden Bildwechsel einmal mit der Zeit `t` (ms). */
  const bild = (t) => {
    const jetzt = [...bilder.entries()];
    bilder.clear();
    for (const [, fn] of jetzt) fn(t);
  };
  /** Alle Zeitgeber, die bis jetzt geplant sind, ablaufen lassen. */
  const zeitAblaufen = () => {
    const jetzt = [...zeitgeber.entries()];
    zeitgeber.clear();
    for (const [, { fn }] of jetzt) fn();
  };
  const el = (tag = 'div', eltern = dok.body) => {
    const e = new El(tag, dok);
    eltern.append(e);
    return e;
  };
  return { dok, fenster, zeitgeber, bilder, wechsel, bild, zeitAblaufen, el, melde };
}

beforeEach(() => neuerBesuch());

describe('bewegungAn', () => {
  test('an ohne Attribut und ohne Systemwunsch; aus bei data-bewegung="reduziert" oder prefers-reduced-motion', () => {
    assert.equal(bewegungAn(neuesDokument().dok), true);
    assert.equal(bewegungAn(neuesDokument({ aussehen: 'glas' }).dok), true);
    assert.equal(bewegungAn(neuesDokument({ bewegung: 'reduziert' }).dok), false);
    assert.equal(bewegungAn(neuesDokument({ reduziert: true }).dok), false);
    assert.equal(bewegungAn(neuesDokument({ aussehen: 'bento', bewegung: 'reduziert', reduziert: true }).dok), false);
  });

  test('ohne matchMedia (alter Browser) oder ohne Dokument: kein Absturz', () => {
    const { dok } = neuesDokument();
    delete dok.defaultView.matchMedia;
    assert.equal(bewegungAn(dok), true);
    assert.equal(bewegungAn(null), false);
  });

  test('effekteAn: nur Glas und Bento mit Bewegung; Klassisch nie', () => {
    assert.equal(effekteAn(neuesDokument().dok), false);
    assert.equal(effekteAn(neuesDokument({ aussehen: 'xyz' }).dok), false);
    assert.equal(effekteAn(neuesDokument({ aussehen: 'glas' }).dok), true);
    assert.equal(effekteAn(neuesDokument({ aussehen: 'bento' }).dok), true);
    assert.equal(effekteAn(neuesDokument({ aussehen: 'glas', bewegung: 'reduziert' }).dok), false);
    assert.equal(effekteAn(neuesDokument({ aussehen: 'bento', reduziert: true }).dok), false);
  });
});

describe('einblenden', () => {
  test('erstes Zeichnen: Klasse am Behälter und Staffel-Index je Kind (höchstens 8); zweites Mal mit demselben Schlüssel nichts mehr', () => {
    const t = neuesDokument({ aussehen: 'glas' });
    const box = t.el();
    for (let i = 0; i < 11; i += 1) t.el('article', box);
    assert.equal(einblenden(box, 'heute'), true);
    assert.ok(box.classList.contains(EINBLENDEN_KLASSE));
    assert.deepEqual(
      box.children.map((k) => k.stil['--bw-i']),
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '8', '8'],
    );

    t.bild(16); // das erste Bild ist gemalt
    // Neuzeichnen (z. B. Vorladen im Hintergrund fertig): neuer Behälter, gleicher Schlüssel → keine Klasse
    const neu = t.el();
    t.el('article', neu);
    assert.equal(einblenden(neu, 'heute'), false);
    assert.equal(neu.classList.contains(EINBLENDEN_KLASSE), false);
    assert.equal(neu.children[0].stil['--bw-i'], undefined);

    // ein anderer Bildschirm (z. B. Konto · Fixkosten) blendet sein erstes Mal ein
    const andere = t.el();
    assert.equal(einblenden(andere, 'konto-fixkosten'), true);
  });

  test('Neuzeichnen VOR dem ersten Bild (z. B. Laden gleich nach dem Öffnen) ist noch das erste Zeigen: der neue Behälter blendet ein', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    const alt = t.el();
    t.el('article', alt);
    assert.equal(einblenden(alt, 'konto-sparziele'), true);
    alt.remove();
    const neu = t.el();
    t.el('article', neu);
    t.el('article', neu);
    assert.equal(einblenden(neu, 'konto-sparziele'), true);
    assert.ok(neu.classList.contains(EINBLENDEN_KLASSE));
    assert.deepEqual(
      neu.children.map((k) => k.stil['--bw-i']),
      ['0', '1'],
    );
    t.bild(16);
    const spaeter = t.el();
    t.el('article', spaeter);
    assert.equal(einblenden(spaeter, 'konto-sparziele'), false, 'nach dem ersten Bild: kein zweites Einblenden');
    assert.equal(spaeter.classList.contains(EINBLENDEN_KLASSE), false);
    // ein anderer Bildschirm vor dessen erstem Bild ändert daran nichts: der alte Schlüssel blendet nicht noch einmal ein
    assert.equal(einblenden(t.el(), 'konto-fixkosten'), true);
    assert.equal(einblenden(t.el(), 'konto-sparziele'), false);
  });

  test('die Klasse wird nach dem Einblenden wieder entfernt (ein Zeitgeber, auch wenn der Behälter schon ersetzt ist)', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    const box = t.el();
    t.el('article', box);
    einblenden(box, 'monat');
    assert.equal(t.zeitgeber.size, 1);
    box.remove();
    t.zeitAblaufen();
    assert.equal(box.classList.contains(EINBLENDEN_KLASSE), false);
    assert.equal(box.children[0].stil['--bw-i'], undefined);
    assert.equal(t.zeitgeber.size, 0);
  });

  test('neuer Besuch (Seite wieder betreten): derselbe Schlüssel blendet wieder ein', () => {
    const t = neuesDokument({ aussehen: 'glas' });
    assert.equal(einblenden(t.el(), 'heute'), true);
    t.bild(16);
    assert.equal(einblenden(t.el(), 'heute'), false);
    neuerBesuch();
    assert.equal(einblenden(t.el(), 'heute'), true);
  });

  test('Klassisch, data-bewegung="reduziert" und prefers-reduced-motion: keine Klasse, kein Zeitgeber', () => {
    for (const optionen of [{}, { aussehen: 'glas', bewegung: 'reduziert' }, { aussehen: 'bento', reduziert: true }]) {
      neuerBesuch();
      const t = neuesDokument(optionen);
      const box = t.el();
      t.el('article', box);
      assert.equal(einblenden(box, 'heute'), false);
      assert.equal(box.classList.contains(EINBLENDEN_KLASSE), false);
      assert.equal(box.children[0].stil['--bw-i'], undefined);
      assert.equal(t.zeitgeber.size, 0);
    }
  });

  test('ohne Behälter: nichts passiert', () => {
    assert.equal(einblenden(null, 'heute'), false);
  });
});

describe('hochzaehlen', () => {
  const euro = (c) => `${(c / 100).toFixed(2)} €`;
  /** Was man sieht: während des Zählens die versteckte Anzeige (aria-hidden), danach der Text selbst. */
  const sichtbar = (el) => (el.children.length > 0 ? el.children[0].textContent : el.textContent);

  test('zählt von `von` bis zum Ziel; der letzte Text ist genau das Ziel', () => {
    const t = neuesDokument({ aussehen: 'glas' });
    const el = t.el('b');
    hochzaehlen(el, 123456, euro, { von: 0 });
    assert.equal(sichtbar(el), euro(0));
    t.bild(1000);
    t.bild(1200);
    const zwischen = sichtbar(el);
    assert.notEqual(zwischen, euro(0));
    assert.notEqual(zwischen, euro(123456));
    for (let ms = 1300; ms <= 3000; ms += 100) t.bild(ms);
    assert.equal(el.textContent, euro(123456));
    assert.equal(t.bilder.size, 0, 'kein Bildwechsel mehr geplant');
  });

  test('ohne `von`: neues Element zählt von 0; dasselbe Element zählt vom zuletzt angezeigten Wert weiter', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    const el = t.el('b');
    hochzaehlen(el, 500, euro);
    assert.equal(sichtbar(el), euro(0));
    for (let ms = 0; ms <= 2000; ms += 100) t.bild(ms);
    assert.equal(el.textContent, euro(500));
    hochzaehlen(el, 900, euro);
    assert.equal(sichtbar(el), euro(500));
    for (let ms = 0; ms <= 2000; ms += 100) t.bild(ms);
    assert.equal(el.textContent, euro(900));
  });

  /** Ein Betrag mit Schlüssel, wie ihn ein Bildschirm bei jedem Zeichnen neu anlegt. */
  const betrag = (t, schluessel = 'konto-seit-beginn') => {
    const el = t.el('b');
    el.setAttribute('data-bw-schluessel', schluessel);
    return el;
  };

  test('Schlüssel: Neuzeichnen mitten im Zählen zählt an derselben Stelle weiter; danach mit demselben Wert sofort, ohne Zählen', () => {
    const t = neuesDokument({ aussehen: 'glas' });
    const alt = betrag(t);
    hochzaehlen(alt, 7000, euro);
    t.bild(0);
    t.bild(200);
    const zwischen = sichtbar(alt);
    assert.notEqual(zwischen, euro(0));
    assert.notEqual(zwischen, euro(7000));
    // mitten im Zählen ersetzt ein Neuzeichnen das Element
    alt.remove();
    const neu = betrag(t);
    hochzaehlen(neu, 7000, euro);
    assert.equal(sichtbar(neu), zwischen, 'weiter an derselben Stelle, nicht von vorn und nicht sprunghaft am Ziel');
    t.bild(300); // das alte Element bemerkt, dass es weg ist: hört auf, setzt den Endwert, plant nichts mehr
    assert.equal(alt.textContent, euro(7000));
    assert.equal(t.bilder.size, 1, 'nur das neue Element zählt noch');
    for (let ms = 400; ms <= 3000; ms += 100) t.bild(ms);
    assert.equal(neu.textContent, euro(7000));
    assert.equal(t.bilder.size, 0, 'keine verwaisten Bildwechsel');
    // Neuzeichnen danach mit demselben Wert: sofort, kein Zählen
    const gleich = betrag(t);
    hochzaehlen(gleich, 7000, euro);
    assert.equal(gleich.textContent, euro(7000));
    assert.equal(t.bilder.size, 0);
    // ein neuer Wert zählt vom zuletzt angezeigten weiter
    const danach = betrag(t);
    hochzaehlen(danach, 8000, euro);
    assert.equal(sichtbar(danach), euro(7000));
  });

  test('Ansicht mitten im Zählen verlassen (kein Nachfolger bis zum nächsten Bild): später steht derselbe Schlüssel gleich am Ziel', () => {
    // Fixkosten → Sparziele → Fixkosten innerhalb von 0,7 s: der Kopf zählt nicht noch einmal ein Stück hoch
    const t = neuesDokument({ aussehen: 'glas' });
    const alt = betrag(t, 'fk-monatlich');
    hochzaehlen(alt, 300000, euro);
    t.bild(0);
    t.bild(200);
    assert.notEqual(sichtbar(alt), euro(300000));
    alt.remove(); // andere Ansicht: kein neues Element mit diesem Schlüssel
    t.bild(250);
    assert.equal(t.bilder.size, 0, 'nichts zählt mehr');
    const zurueck = betrag(t, 'fk-monatlich');
    hochzaehlen(zurueck, 300000, euro);
    assert.equal(zurueck.textContent, euro(300000), 'gleich am Ziel, kein Teil-Hochzählen');
    assert.equal(t.bilder.size, 0);
  });

  test('langsames Telefon: ein langes Bild (z. B. 2 s Zeichnen) frisst das Zählen nicht auf – es läuft danach sichtbar weiter', () => {
    const t = neuesDokument({ aussehen: 'glas' });
    const el = t.el('b');
    hochzaehlen(el, 284524, euro, { von: 0 });
    t.bild(0); // der Zeitstempel des ersten Bildes stammt noch von vor dem langen Zeichnen
    t.bild(2300);
    const nachPause = sichtbar(el);
    assert.notEqual(nachPause, euro(284524), 'nicht gleich am Ziel');
    t.bild(2500);
    const weiter = sichtbar(el);
    assert.notEqual(weiter, nachPause);
    assert.notEqual(weiter, euro(284524));
    for (let ms = 2600; ms <= 4000; ms += 50) t.bild(ms);
    assert.equal(el.textContent, euro(284524));
  });

  test('Neuzeichnen VOR dem ersten Bild (Laden gleich nach dem Öffnen): das neue Element zählt von vorn und endet genau', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    const alt = betrag(t, 'fk-monatlich');
    hochzaehlen(alt, 145939, euro);
    alt.remove();
    const neu = betrag(t, 'fk-monatlich');
    hochzaehlen(neu, 145939, euro);
    assert.equal(sichtbar(neu), euro(0));
    t.bild(0);
    t.bild(250);
    assert.notEqual(sichtbar(neu), euro(0));
    assert.notEqual(sichtbar(neu), euro(145939));
    for (let ms = 300; ms <= 3000; ms += 100) t.bild(ms);
    assert.equal(neu.textContent, euro(145939));
    assert.equal(t.bilder.size, 0);
  });

  test('Bildschirmleser hören nie einen Zwischenwert: gezählt wird in einer versteckten Anzeige, daneben steht (unsichtbar) der Endwert', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    const el = t.el('b');
    hochzaehlen(el, 25000, euro, { von: 0 });
    t.bild(0);
    t.bild(200);
    const [anzeige, vorlesen] = el.children;
    assert.equal(anzeige.getAttribute('aria-hidden'), 'true');
    assert.notEqual(anzeige.textContent, euro(25000));
    assert.ok(vorlesen.classList.contains('bw-nur-vorlesen'));
    assert.equal(vorlesen.textContent, euro(25000));
    for (let ms = 300; ms <= 2000; ms += 100) t.bild(ms);
    assert.equal(el.children.length, 0, 'am Ende wieder nur der Text');
    assert.equal(el.textContent, euro(25000));
  });

  test('ein zweiter Aufruf mitten im Zählen ersetzt den ersten (nur ein Bildwechsel geplant)', () => {
    const t = neuesDokument({ aussehen: 'glas' });
    const el = t.el('b');
    hochzaehlen(el, 10000, euro, { von: 0 });
    t.bild(0);
    t.bild(200);
    hochzaehlen(el, 20000, euro);
    assert.equal(t.bilder.size, 1);
    for (let ms = 0; ms <= 3000; ms += 100) t.bild(ms);
    assert.equal(el.textContent, euro(20000));
  });

  test('Klassisch und reduziert: sofort der genaue Endwert, kein Bildwechsel', () => {
    for (const optionen of [{}, { aussehen: 'glas', bewegung: 'reduziert' }, { aussehen: 'bento', reduziert: true }]) {
      const t = neuesDokument(optionen);
      const el = t.el('b');
      hochzaehlen(el, -4250, euro, { von: 0 });
      assert.equal(el.textContent, euro(-4250));
      assert.equal(t.bilder.size, 0);
    }
  });
});

describe('fortschritt', () => {
  test('setzt die Füllung über transform: scaleX (0…1, begrenzt); mit Bewegung erst der alte Stand, dann das Ziel', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    const balken = t.el('span');
    fortschritt(balken, 0.6);
    assert.ok(balken.classList.contains('bw-fortschritt'));
    assert.equal(balken.stil.transform, 'scaleX(0)');
    t.bild(0);
    t.bild(16);
    assert.equal(balken.stil.transform, 'scaleX(0.6)');
    fortschritt(balken, 7);
    t.bild(0);
    t.bild(16);
    assert.equal(balken.stil.transform, 'scaleX(1)');
  });

  test('Schlüssel: ein Neuzeichnen, bevor der Übergang begonnen hat, gleitet noch vom alten Stand; danach steht es gleich am Ziel', () => {
    const t = neuesDokument({ aussehen: 'glas' });
    const fuellung = () => {
      const el = t.el('span', t.el());
      el.setAttribute('data-bw-schluessel', 'sz-balken-a');
      return el;
    };
    const alt = fuellung();
    fortschritt(alt, 0.5);
    assert.equal(alt.stil.transform, 'scaleX(0)');
    alt.parent.remove(); // Neuzeichnen vor dem ersten Bild
    const neu = fuellung();
    fortschritt(neu, 0.5);
    assert.equal(neu.stil.transform, 'scaleX(0)', 'noch vom alten Stand');
    t.bild(0);
    t.bild(16);
    assert.equal(neu.stil.transform, 'scaleX(0.5)');
    const spaeter = fuellung();
    fortschritt(spaeter, 0.5);
    assert.equal(spaeter.stil.transform, 'scaleX(0.5)', 'späteres Neuzeichnen: gleich am Ziel');
    assert.equal(t.bilder.size, 0);
  });

  test('die Bahn (Elternknoten) trägt den Anteil als --bw-anteil, im selben Moment wie das transform', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    const bahn = t.el();
    const balken = t.el('span', bahn);
    fortschritt(balken, 0.3);
    assert.equal(bahn.stil['--bw-anteil'], '0');
    t.bild(0);
    t.bild(16);
    assert.equal(bahn.stil['--bw-anteil'], '0.3');
  });

  test('Klassisch: rührt den Balken nicht an (dort bleibt die Breite wie bisher)', () => {
    const t = neuesDokument();
    const bahn = t.el();
    const balken = t.el('span', bahn);
    fortschritt(balken, 0.4);
    assert.equal(balken.classList.contains('bw-fortschritt'), false);
    assert.equal(balken.stil.transform, undefined);
    assert.equal(bahn.stil['--bw-anteil'], undefined);
    assert.equal(t.bilder.size, 0);
  });

  test('Glas/Bento reduziert: gleich der Endstand; ungültige Werte → 0', () => {
    const t = neuesDokument({ aussehen: 'glas', bewegung: 'reduziert' });
    const balken = t.el('span');
    fortschritt(balken, 0.25);
    assert.equal(balken.stil.transform, 'scaleX(0.25)');
    assert.equal(t.bilder.size, 0);
    fortschritt(balken, Number.NaN);
    assert.equal(balken.stil.transform, 'scaleX(0)');
    fortschritt(balken, -3);
    assert.equal(balken.stil.transform, 'scaleX(0)');
  });
});

describe('konfetti', () => {
  test('Klassisch, Glas und reduziertes Bento: nichts entsteht', () => {
    for (const optionen of [{}, { aussehen: 'glas' }, { aussehen: 'bento', bewegung: 'reduziert' }, { aussehen: 'bento', reduziert: true }]) {
      const t = neuesDokument(optionen);
      const anker = t.el();
      assert.equal(konfetti(anker), null);
      assert.equal(t.dok.body.children.length, 1, 'nur der Anker');
      assert.equal(t.zeitgeber.size, 0);
    }
  });

  test('Bento: höchstens 80 Teilchen, ohne Zeiger und für Bildschirmleser versteckt; nach höchstens 1,6 s ist alles weg', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    const anker = t.el();
    const huelle = konfetti(anker, { anzahl: 500 });
    assert.ok(huelle);
    assert.equal(huelle.parent, t.dok.body);
    assert.equal(huelle.getAttribute('aria-hidden'), 'true');
    assert.equal(huelle.stil['pointer-events'], 'none');
    assert.ok(huelle.classList.contains('bw-konfetti'));
    assert.ok(huelle.children.length > 0 && huelle.children.length <= MAX_KONFETTI);
    assert.ok(MAX_KONFETTI <= 80);
    for (const teil of huelle.children) assert.ok(teil.classList.contains('bw-konfetti-teil'));
    const zeiten = [...t.zeitgeber.values()].map((z) => z.ms);
    assert.equal(zeiten.length, 1);
    assert.ok(zeiten[0] <= 1600 && KONFETTI_MS <= 1600);
    t.zeitAblaufen();
    assert.deepEqual(t.dok.body.children, [anker]);
  });

  test('zweimal schnell hintereinander: die erste Wolke geht, es bleibt bei höchstens 80 Teilchen', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    const anker = t.el();
    konfetti(anker, { anzahl: 80 });
    const zweite = konfetti(anker, { anzahl: 80 });
    assert.deepEqual(t.dok.body.children, [anker, zweite]);
    t.zeitAblaufen();
    assert.deepEqual(t.dok.body.children, [anker]);
  });

  test('Standard-Anzahl ist klein; ohne Anker nichts', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    assert.ok(konfetti(t.el()).children.length <= MAX_KONFETTI);
    assert.equal(konfetti(null), null);
  });
});

describe('tabWechsel', () => {
  test('Klassisch und reduziert: sofort zeichnen, ohne Klasse und ohne View Transition', () => {
    for (const optionen of [{ viewTransition: true }, { aussehen: 'glas', bewegung: 'reduziert', viewTransition: true }, { aussehen: 'bento', reduziert: true }]) {
      const t = neuesDokument(optionen);
      let gezeichnet = 0;
      tabWechsel(() => (gezeichnet += 1), { dokument: t.dok });
      assert.equal(gezeichnet, 1);
      assert.equal(t.wechsel.length, 0);
      assert.equal(t.dok.documentElement.classList.contains('bw-tabwechsel'), false);
      assert.equal(t.zeitgeber.size, 0);
    }
  });

  test('Glas/Bento: immer sofort (synchron) zeichnen – nie über View Transitions, auch wenn der Browser sie kann –, dann die CSS-Klasse', () => {
    for (const aussehen of ['glas', 'bento']) {
      const t = neuesDokument({ aussehen, viewTransition: true });
      const reihenfolge = [];
      tabWechsel(() => reihenfolge.push(t.dok.documentElement.classList.contains('bw-tabwechsel') ? 'mit Klasse' : 'gezeichnet'), { dokument: t.dok });
      reihenfolge.push('zurück');
      assert.deepEqual(reihenfolge, ['gezeichnet', 'zurück'], 'gezeichnet, bevor tabWechsel zurückkehrt');
      assert.equal(t.wechsel.length, 0, 'keine View Transition');
      assert.ok(t.dok.documentElement.classList.contains('bw-tabwechsel'));
    }
  });

  test('die Klasse bleibt so lange wie --dauer-tab (plus Reserve); ein zweiter Wechsel zeichnet sofort und plant nur einen Zeitgeber', () => {
    const t = neuesDokument({ aussehen: 'bento', css: { '--dauer-tab': '0.22s' } });
    let gezeichnet = 0;
    tabWechsel(() => (gezeichnet += 1), { dokument: t.dok });
    const [zeit] = [...t.zeitgeber.values()].map((z) => z.ms);
    assert.ok(zeit >= 220 && zeit <= 400, `Zeitgeber ${zeit} ms`);
    tabWechsel(() => (gezeichnet += 1), { dokument: t.dok });
    assert.equal(gezeichnet, 2);
    assert.equal(t.zeitgeber.size, 1);
    assert.ok(t.dok.documentElement.classList.contains('bw-tabwechsel'));
    t.zeitAblaufen();
    assert.equal(t.dok.documentElement.classList.contains('bw-tabwechsel'), false);
    const lang = neuesDokument({ aussehen: 'glas', css: { '--dauer-tab': '2s' } });
    tabWechsel(() => {}, { dokument: lang.dok });
    assert.ok([...lang.zeitgeber.values()][0].ms >= 2000, 'längere Dauer (z. B. im Test): Klasse bleibt bis zum Ende');
  });

  test('Glas/Bento: kommt man von einer Seite ohne aktive Karte (Neu, Konto & App), entsteht der Tropfen ohne Gleiten (Safari)', () => {
    // WebKit startet für ein neu entstehendes ::before einen Übergang von translateX(0): der Tropfen fegte vom linken Rand herein.
    // Die Klasse bw-tropfen-frisch schaltet den Übergang ab, bis das neue Bild steht (zwei Bilder), dann gleitet er wieder.
    const t = neuesDokument({ aussehen: 'glas' });
    let aktiveKarte = false;
    t.dok.querySelector = (sel) => (sel.includes('.aktiv') && aktiveKarte ? {} : null);
    const wurzel = t.dok.documentElement;
    let beimZeichnen = null;
    tabWechsel(() => (beimZeichnen = wurzel.classList.contains('bw-tropfen-frisch')), { dokument: t.dok });
    assert.equal(beimZeichnen, true, 'schon beim Zeichnen der neuen Seite');
    t.bild(16);
    assert.equal(wurzel.classList.contains('bw-tropfen-frisch'), true, 'nach dem ersten Bild noch');
    t.bild(32);
    assert.equal(wurzel.classList.contains('bw-tropfen-frisch'), false, 'danach wieder mit Gleiten');
    // von einer Karte zur anderen: gleiten, keine Klasse
    aktiveKarte = true;
    tabWechsel(() => (beimZeichnen = wurzel.classList.contains('bw-tropfen-frisch')), { dokument: t.dok });
    assert.equal(beimZeichnen, false);
    assert.equal(t.bilder.size, 0, 'kein Bildwechsel geplant');
    // Klassisch: nichts
    const k = neuesDokument({});
    k.dok.querySelector = () => null;
    tabWechsel(() => {}, { dokument: k.dok });
    assert.equal(k.dok.documentElement.classList.contains('bw-tropfen-frisch'), false);
    assert.equal(k.bilder.size, 0);
  });

  test('ein gewöhnlicher Wechsel erzwingt kein Layout (offsetWidth) – nur ein Neustart mitten im Einblenden', () => {
    // Leistung (4× langsamere CPU): das erzwungene Layout zog sonst die ganze neue Seite in die Aufgabe des Tipps
    const t = neuesDokument({ aussehen: 'glas' });
    let gelesen = 0;
    Object.defineProperty(t.dok.documentElement, 'offsetWidth', { get: () => (gelesen += 1) });
    tabWechsel(() => {}, { dokument: t.dok });
    assert.equal(gelesen, 0, 'erster Wechsel: nur die Klasse');
    tabWechsel(() => {}, { dokument: t.dok });
    assert.equal(gelesen, 1, 'zweiter Wechsel, während die Klasse noch steht: einmal neu starten');
    t.zeitAblaufen();
    tabWechsel(() => {}, { dokument: t.dok });
    assert.equal(gelesen, 1, 'nach dem Einblenden wieder ohne');
  });

  test('ein Fehler beim Zeichnen kommt sofort beim Aufrufer an', () => {
    const t = neuesDokument({ aussehen: 'glas' });
    assert.throws(
      () =>
        tabWechsel(
          () => {
            throw new Error('kaputt');
          },
          { dokument: t.dok },
        ),
      /kaputt/,
    );
  });
});

describe('blattSchliessenMs', () => {
  test('Klassisch wie bisher 180 ms; ohne Bewegung (prefers-reduced-motion oder „Reduziert“, gilt in allen Aussehen) 0', () => {
    assert.equal(blattSchliessenMs(neuesDokument().dok), 180);
    assert.equal(blattSchliessenMs(neuesDokument({ reduziert: true }).dok), 0);
    assert.equal(blattSchliessenMs(neuesDokument({ bewegung: 'reduziert' }).dok), 0);
  });

  test('Glas/Bento: Dauer aus --dauer-mittel (s oder ms), reduziert 0, unlesbar 180', () => {
    assert.equal(blattSchliessenMs(neuesDokument({ aussehen: 'glas', css: { '--dauer-mittel': ' 0.36s' } }).dok), 360);
    assert.equal(blattSchliessenMs(neuesDokument({ aussehen: 'bento', css: { '--dauer-mittel': '420ms' } }).dok), 420);
    assert.equal(blattSchliessenMs(neuesDokument({ aussehen: 'bento', css: { '--dauer-mittel': 'quatsch' } }).dok), 180);
    assert.equal(blattSchliessenMs(neuesDokument({ aussehen: 'glas', bewegung: 'reduziert', css: { '--dauer-mittel': '0.36s' } }).dok), 0);
  });
});
