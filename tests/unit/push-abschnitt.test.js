// „Benachrichtigungen von der App“ (src/ui/push-abschnitt.js) mit einem kleinen Ersatz-DOM: solange der Abgleich wartet, zeichnet der
// Abschnitt nach 5 s neu – egal wie oft getippt wird, gibt es dafür immer nur EINEN Zeitgeber.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

class Knoten {}
class Element extends Knoten {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.attribute = {};
    this.kinder = [];
    this.hoerer = {};
    this.hidden = false;
    this.isConnected = true;
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {} };
  }
  setAttribute(name, wert) {
    this.attribute[name] = wert;
  }
  addEventListener(art, fn) {
    (this.hoerer[art] ??= []).push(fn);
  }
  append(...kinder) {
    this.kinder.push(...kinder);
  }
  replaceChildren() {
    this.kinder = [];
  }
  remove() {}
  get textContent() {
    return this.kinder.map((k) => k.textContent ?? '').join('');
  }
  /** Alle Nachfahren, die `pruefe` erfüllen. */
  finde(pruefe) {
    return this.kinder.flatMap((k) => (k instanceof Element ? [...(pruefe(k) ? [k] : []), ...k.finde(pruefe)] : []));
  }
}

const zeitgeber = new Map(); // id → { fn, ms }
let naechsteId = 1;
const global = {};

before(() => {
  for (const k of ['Node', 'document', 'setTimeout', 'clearTimeout', 'requestAnimationFrame']) global[k] = globalThis[k];
  globalThis.Node = Knoten;
  globalThis.document = { createElement: (t) => new Element(t), createTextNode: (text) => ({ textContent: text }), querySelector: () => null, body: new Element('body') };
  globalThis.setTimeout = (fn, ms) => {
    const id = naechsteId++;
    zeitgeber.set(id, { fn, ms });
    return id;
  };
  globalThis.clearTimeout = (id) => zeitgeber.delete(id);
  globalThis.requestAnimationFrame = () => 0;
});

after(() => {
  for (const [k, v] of Object.entries(global)) globalThis[k] = v;
});

const ruhe = () => new Promise((r) => global.setTimeout(r, 0)); // echte Wartezeit: alle laufenden `await` kommen an
const neuZeichnen = () => [...zeitgeber.entries()].filter(([, z]) => z.ms === 5000);
const tippe = (box, text) => {
  const [knopf] = box.finde((e) => e.tagName === 'BUTTON' && e.textContent.includes(text));
  assert.ok(knopf, `Knopf „${text}“`);
  for (const fn of knopf.hoerer.click) fn();
};

test('wartet: jedes Tippen zeichnet neu, aber es bleibt bei einem Zeitgeber fürs Neuzeichnen; ohne Warten keiner', async () => {
  const { pushAbschnitt } = await import('../../src/ui/push-abschnitt.js');
  let wartet = true;
  let person = '';
  const push = {
    status: async () => ({ zustand: 'aktiv', wartet, geraete: 2, letzteSync: null, letzterFehler: null }),
    sync: async () => ({ art: 'wartet' }),
    person: () => person,
    setzePerson: (p) => (person = p),
    personenMitTelefon: () => [],
  };
  const box = pushAbschnitt({ push });
  await ruhe();
  assert.match(box.textContent, /Der Schichtplan wird noch geladen/);
  assert.equal(neuZeichnen().length, 1);

  for (let i = 0; i < 3; i += 1) tippe(box, 'Papa');
  tippe(box, 'Jetzt abgleichen');
  tippe(box, 'Jetzt abgleichen');
  await ruhe();
  assert.equal(neuZeichnen().length, 1, 'N-mal tippen: trotzdem nur ein Neuzeichnen geplant');

  const [[id, { fn }]] = neuZeichnen();
  zeitgeber.delete(id);
  fn(); // nach 5 s: neu zeichnen, wartet noch
  await ruhe();
  assert.equal(neuZeichnen().length, 1);

  wartet = false;
  tippe(box, 'Jetzt abgleichen');
  await ruhe();
  assert.equal(neuZeichnen().length, 0, 'wartet nicht mehr: kein Neuzeichnen');
  assert.doesNotMatch(box.textContent, /Der Schichtplan wird noch geladen/);
});
