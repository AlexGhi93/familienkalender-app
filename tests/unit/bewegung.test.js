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
    this.style = {
      setProperty: (k, v) => (this.stil[k] = String(v)),
      removeProperty: (k) => delete this.stil[k],
      getPropertyValue: (k) => this.stil[k] ?? '',
    };
    this.textContent = '';
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

  test('zählt von `von` bis zum Ziel; der letzte Text ist genau das Ziel', () => {
    const t = neuesDokument({ aussehen: 'glas' });
    const el = t.el('b');
    hochzaehlen(el, 123456, euro, { von: 0 });
    assert.equal(el.textContent, euro(0));
    t.bild(1000);
    t.bild(1200);
    const zwischen = el.textContent;
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
    assert.equal(el.textContent, euro(0));
    for (let ms = 0; ms <= 2000; ms += 100) t.bild(ms);
    assert.equal(el.textContent, euro(500));
    hochzaehlen(el, 900, euro);
    assert.equal(el.textContent, euro(500));
    for (let ms = 0; ms <= 2000; ms += 100) t.bild(ms);
    assert.equal(el.textContent, euro(900));
  });

  test('Schlüssel (data-bw-schluessel): ein neu gezeichnetes Element mit demselben Wert zeigt ihn sofort, ohne neu zu zählen', () => {
    const t = neuesDokument({ aussehen: 'glas' });
    const alt = t.el('b');
    alt.setAttribute('data-bw-schluessel', 'konto-seit-beginn');
    hochzaehlen(alt, 7000, euro);
    t.bild(0);
    // mitten im Zählen ersetzt ein Neuzeichnen das Element
    alt.remove();
    const neu = t.el('b');
    neu.setAttribute('data-bw-schluessel', 'konto-seit-beginn');
    hochzaehlen(neu, 7000, euro);
    assert.equal(neu.textContent, euro(7000));
    t.bild(100); // das alte Element bemerkt, dass es weg ist: hört auf, setzt den Endwert, plant nichts mehr
    assert.equal(alt.textContent, euro(7000));
    assert.equal(t.bilder.size, 0, 'keine verwaisten Bildwechsel');
    // ein neuer Wert zählt vom zuletzt angezeigten weiter
    const danach = t.el('b');
    danach.setAttribute('data-bw-schluessel', 'konto-seit-beginn');
    hochzaehlen(danach, 8000, euro);
    assert.equal(danach.textContent, euro(7000));
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

  test('Klassisch oder reduziert: gleich der Endstand; ungültige Werte → 0', () => {
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

  test('Standard-Anzahl ist klein; ohne Anker nichts', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    assert.ok(konfetti(t.el()).children.length <= MAX_KONFETTI);
    assert.equal(konfetti(null), null);
  });
});

describe('tabWechsel', () => {
  test('Klassisch und reduziert: sofort, ohne View Transition und ohne Klasse', () => {
    for (const optionen of [{ viewTransition: true }, { aussehen: 'glas', bewegung: 'reduziert', viewTransition: true }, { aussehen: 'bento', reduziert: true }]) {
      const t = neuesDokument(optionen);
      let gezeichnet = 0;
      tabWechsel(() => (gezeichnet += 1), { dokument: t.dok });
      assert.equal(gezeichnet, 1);
      assert.equal(t.wechsel.length, 0);
      assert.equal(t.dok.documentElement.classList.contains('bw-tabwechsel'), false);
      assert.equal(t.dok.documentElement.classList.contains('bw-wechselt'), false);
    }
  });

  test('Glas mit View Transitions: zeichnet im Übergang; ein zweiter Wechsel überspringt den laufenden sofort', async () => {
    const t = neuesDokument({ aussehen: 'glas', viewTransition: true });
    const seiten = [];
    tabWechsel(() => seiten.push('monat'), { dokument: t.dok });
    assert.equal(t.wechsel.length, 1);
    assert.ok(t.dok.documentElement.classList.contains('bw-wechselt'));
    tabWechsel(() => seiten.push('einkauf'), { dokument: t.dok });
    assert.equal(t.wechsel.length, 2);
    assert.equal(t.wechsel[0].uebersprungen, true);
    await t.wechsel[1].updateCallbackDone;
    assert.deepEqual(seiten, ['monat', 'einkauf']);
    t.wechsel[1].beenden();
    await t.wechsel[1].finished;
    await Promise.resolve();
    assert.equal(t.dok.documentElement.classList.contains('bw-wechselt'), false);
  });

  test('ein Tipp mitten im Übergang (der Browser schickt ihn an <html>): Übergang sofort vorbei, der Tipp landet am Ziel darunter', () => {
    const t = neuesDokument({ aussehen: 'bento', viewTransition: true });
    const ziel = t.el('a');
    let geklickt = 0;
    ziel.click = () => (geklickt += 1);
    t.dok.elementFromPoint = (x, y) => (x === 50 && y === 800 ? ziel : null);
    tabWechsel(() => {}, { dokument: t.dok });
    const wurzel = t.dok.documentElement;
    t.melde('pointerdown', { target: wurzel, clientX: 50, clientY: 800, isTrusted: true });
    assert.equal(t.wechsel[0].uebersprungen, true, 'sofort übersprungen');
    let gestoppt = false;
    t.melde('click', { target: wurzel, isTrusted: true, stopPropagation: () => (gestoppt = true), preventDefault() {} });
    assert.equal(geklickt, 1, 'der Tipp kommt am Element an der Stelle an');
    assert.equal(gestoppt, true);
    // ohne laufenden Übergang: nichts wird nachgeholt
    t.melde('pointerdown', { target: wurzel, clientX: 50, clientY: 800, isTrusted: true });
    t.melde('click', { target: wurzel, isTrusted: true, stopPropagation() {}, preventDefault() {} });
    assert.equal(geklickt, 1);
  });

  test('Tipp mitten im Übergang auf ein Eingabefeld: es bekommt den Fokus', () => {
    const t = neuesDokument({ aussehen: 'glas', viewTransition: true });
    const feld = t.el('input');
    let fokus = 0;
    feld.focus = () => (fokus += 1);
    feld.click = () => {};
    feld.matches = (sel) => sel.includes('input');
    t.dok.elementFromPoint = () => feld;
    tabWechsel(() => {}, { dokument: t.dok });
    t.melde('pointerdown', { target: t.dok.documentElement, clientX: 1, clientY: 1, isTrusted: true });
    t.melde('click', { target: t.dok.documentElement, isTrusted: true, stopPropagation() {}, preventDefault() {} });
    assert.equal(fokus, 1);
  });

  test('kommt der Übergang nicht zum Zeichnen (kein Bild, z. B. beschäftigtes Telefon): nach kurzer Zeit trotzdem zeichnen, nur einmal', async () => {
    const t = neuesDokument({ aussehen: 'glas' });
    let gezeichnet = 0;
    const wechsel = [];
    t.dok.startViewTransition = (f) => {
      const w = { f, uebersprungen: false, finished: new Promise(() => {}), ready: Promise.resolve(), updateCallbackDone: new Promise(() => {}), skipTransition: () => (w.uebersprungen = true) };
      wechsel.push(w);
      return w;
    };
    tabWechsel(() => (gezeichnet += 1), { dokument: t.dok });
    assert.equal(gezeichnet, 0, 'erst im Übergang');
    const notfall = [...t.zeitgeber.values()];
    assert.equal(notfall.length, 1);
    assert.ok(notfall[0].ms <= 200);
    t.zeitAblaufen();
    assert.equal(gezeichnet, 1, 'gezeichnet, ohne auf den Übergang zu warten');
    assert.equal(wechsel[0].uebersprungen, true);
    wechsel[0].f(); // der Browser ruft später doch noch auf
    assert.equal(gezeichnet, 1, 'nicht doppelt');
  });

  test('Fehler beim Zeichnen im Übergang geht nicht verloren (wird später geworfen)', async () => {
    const t = neuesDokument({ aussehen: 'bento', viewTransition: true });
    t.dok.startViewTransition = (f) => {
      const done = Promise.resolve().then(f);
      return { updateCallbackDone: done, ready: done, finished: done, skipTransition() {} };
    };
    tabWechsel(
      () => {
        throw new Error('kaputt');
      },
      { dokument: t.dok },
    );
    await new Promise((r) => setTimeout(r, 0));
    const geplant = [...t.zeitgeber.values()];
    assert.equal(geplant.length, 1);
    assert.throws(() => geplant[0].fn(), /kaputt/);
  });

  test('ohne View Transitions: sofort zeichnen, dann kurz die Klasse bw-tabwechsel (für die CSS-Bewegung)', () => {
    const t = neuesDokument({ aussehen: 'bento' });
    let gezeichnet = 0;
    tabWechsel(() => (gezeichnet += 1), { dokument: t.dok });
    assert.equal(gezeichnet, 1);
    assert.ok(t.dok.documentElement.classList.contains('bw-tabwechsel'));
    const zeiten = [...t.zeitgeber.values()].map((z) => z.ms);
    assert.equal(zeiten.length, 1);
    assert.ok(zeiten[0] <= 400);
    tabWechsel(() => (gezeichnet += 1), { dokument: t.dok }); // zweiter Tipp: sofort, nur ein Zeitgeber
    assert.equal(gezeichnet, 2);
    assert.equal(t.zeitgeber.size, 1);
    t.zeitAblaufen();
    assert.equal(t.dok.documentElement.classList.contains('bw-tabwechsel'), false);
  });
});

describe('blattSchliessenMs', () => {
  test('Klassisch wie bisher: 180 ms, bei prefers-reduced-motion 0 (data-bewegung ändert Klassisch nicht)', () => {
    assert.equal(blattSchliessenMs(neuesDokument().dok), 180);
    assert.equal(blattSchliessenMs(neuesDokument({ reduziert: true }).dok), 0);
    assert.equal(blattSchliessenMs(neuesDokument({ bewegung: 'reduziert' }).dok), 180);
  });

  test('Glas/Bento: Dauer aus --dauer-mittel (s oder ms), reduziert 0, unlesbar 180', () => {
    assert.equal(blattSchliessenMs(neuesDokument({ aussehen: 'glas', css: { '--dauer-mittel': ' 0.36s' } }).dok), 360);
    assert.equal(blattSchliessenMs(neuesDokument({ aussehen: 'bento', css: { '--dauer-mittel': '420ms' } }).dok), 420);
    assert.equal(blattSchliessenMs(neuesDokument({ aussehen: 'bento', css: { '--dauer-mittel': 'quatsch' } }).dok), 180);
    assert.equal(blattSchliessenMs(neuesDokument({ aussehen: 'glas', bewegung: 'reduziert', css: { '--dauer-mittel': '0.36s' } }).dok), 0);
  });
});
