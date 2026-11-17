import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monatWischRichtung, monatWischen } from '../../src/ui/wischen.js';

test('monatWischRichtung', () => {
  assert.equal(monatWischRichtung(-80, 10), 1);
  assert.equal(monatWischRichtung(80, -10), -1);
  assert.equal(monatWischRichtung(-59, 0), null);
  assert.equal(monatWischRichtung(-80, 60), null); // eher senkrecht: Scrollen
  assert.equal(monatWischRichtung(0, 0), null);
});

/** Falsche Fläche: sammelt die Listener, löst sie von Hand aus. */
function flaeche() {
  const l = {};
  return {
    addEventListener: (art, fn) => { (l[art] ||= []).push(fn); },
    senden: (art, e = {}) => (l[art] || []).forEach((fn) => fn(e)),
  };
}
const finger = (x, y) => ({ touches: [{ clientX: x, clientY: y }] });
function wische(f, dx, dy = 0) {
  f.senden('touchstart', finger(100, 100));
  f.senden('touchmove', finger(100 + dx, 100 + dy));
  f.senden('touchend', { touches: [] });
}
function klick(f) {
  const e = { gestoppt: false, verhindert: false, stopPropagation() { this.gestoppt = true; }, preventDefault() { this.verhindert = true; } };
  f.senden('click', e);
  return e.gestoppt && e.verhindert;
}

test('monatWischen: links = vor, rechts = zurück, senkrecht nichts, gesperrt nichts', () => {
  const f = flaeche();
  const log = [];
  let gesperrt = false;
  monatWischen(f, { zurueck: () => log.push('zurueck'), vor: () => log.push('vor'), gesperrt: () => gesperrt });
  wische(f, -90);
  wische(f, 90);
  wische(f, -90, 80);
  wische(f, -20);
  gesperrt = true;
  wische(f, -90);
  assert.deepEqual(log, ['vor', 'zurueck']);
});

test('monatWischen: zwei Finger lösen nichts aus (von Anfang an oder als zweiter Finger mitten im Wischen)', () => {
  const zwei = (x1, x2) => ({ touches: [{ clientX: x1, clientY: 100 }, { clientX: x2, clientY: 100 }] });
  const f = flaeche();
  const log = [];
  // feste Uhr bei 0: die Klicksperre der Gegenprobe (gemeinsam für alle Flächen) ist vorbei, bevor der nächste Test beginnt
  monatWischen(f, { zurueck: () => log.push('z'), vor: () => log.push('v'), jetzt: () => 0 });
  // zwei Finger von Anfang an, weit gezogen (Zoomen)
  f.senden('touchstart', zwei(100, 200));
  f.senden('touchmove', zwei(0, 100));
  f.senden('touchend', { touches: [] });
  assert.deepEqual(log, []);
  // ein Finger zieht schon weit genug, dann kommt ein zweiter dazu (nur touchmove meldet ihn) und der erste zieht weiter
  f.senden('touchstart', finger(200, 100));
  f.senden('touchmove', finger(120, 100));
  f.senden('touchmove', zwei(100, 250));
  f.senden('touchmove', finger(40, 100));
  f.senden('touchend', { touches: [] });
  assert.deepEqual(log, []);
  // ebenso, wenn der zweite Finger mit eigenem touchstart aufsetzt
  f.senden('touchstart', finger(200, 100));
  f.senden('touchmove', finger(120, 100));
  f.senden('touchstart', zwei(120, 250));
  f.senden('touchmove', finger(40, 100));
  f.senden('touchend', { touches: [] });
  assert.deepEqual(log, []);
  // Gegenprobe: derselbe Weg mit einem Finger wechselt den Monat
  f.senden('touchstart', finger(200, 100));
  f.senden('touchmove', finger(120, 100));
  f.senden('touchmove', finger(40, 100));
  f.senden('touchend', { touches: [] });
  assert.deepEqual(log, ['v']);
});

test('monatWischen: Klick nach dem Wischen wird einmal geschluckt, nur 400 ms lang', () => {
  const f = flaeche();
  let t = 1000;
  monatWischen(f, { zurueck() {}, vor() {}, jetzt: () => t });
  assert.equal(klick(f), false, 'ohne Wischen wird nichts geschluckt');
  wische(f, -90);
  t += 100;
  assert.equal(klick(f), true, 'erster Klick direkt nach dem Wischen');
  assert.equal(klick(f), false, 'nur einmal');
  wische(f, -90);
  t += 500;
  assert.equal(klick(f), false, 'nach 400 ms nicht mehr scharf');
});

test('monatWischen: neuer touchstart hebt die Sperre auf (Tippen nach dem Wischen)', () => {
  const f = flaeche();
  const t = 1000;
  monatWischen(f, { zurueck() {}, vor() {}, jetzt: () => t });
  wische(f, -90); // kein Klick folgt
  f.senden('touchstart', finger(50, 50)); // das nächste Tippen
  f.senden('touchend', { touches: [] });
  assert.equal(klick(f), false);
});
