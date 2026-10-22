// Schichtplan-Farben: jede Palettenfarbe hat Fläche und Schrift (--sf-<id>, --sf-<id>-ink) im hellen und in beiden dunklen Blöcken von theme.css.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTE } from '../../src/domain/schicht.js';

const css = readFileSync(new URL('../../theme.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** Inhalt des ersten Blocks nach `kopf` bis zur nächsten schließenden Klammer (die Theme-Blöcke sind nicht verschachtelt). */
function block(kopf) {
  const start = css.indexOf(kopf);
  assert.notEqual(start, -1, `Block fehlt: ${kopf}`);
  const auf = css.indexOf('{', start + kopf.length - 1);
  const zu = css.indexOf('}', auf);
  return css.slice(auf + 1, zu);
}

function variablen(text) {
  const ohneKommentare = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return Object.fromEntries([...ohneKommentare.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const HELL = variablen(block(':root {'));
const DUNKEL_MEDIA = variablen(block("@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {"));
const DUNKEL_ATTR = variablen(block(":root[data-theme='dark'] {"));

function luminanz(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `kein #rrggbb: ${hex}`);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontrast(a, b) {
  const [x, y] = [luminanz(a), luminanz(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const BLOECKE = [
  ['hell', HELL],
  ['dunkel (Systemeinstellung)', DUNKEL_MEDIA],
  ['dunkel (Schalter)', DUNKEL_ATTR],
];

describe('Schichtplan-Farbpalette im Theme', () => {
  test('jede Palettenfarbe hat Fläche und Schrift in allen drei Blöcken', () => {
    assert.equal(PALETTE.length, 16);
    for (const [name, vars] of BLOECKE) {
      for (const { id } of PALETTE) {
        assert.ok(vars[`--sf-${id}`], `${name}: --sf-${id} fehlt`);
        assert.ok(vars[`--sf-${id}-ink`], `${name}: --sf-${id}-ink fehlt`);
      }
    }
  });

  test('beide dunklen Blöcke haben dieselben Schichtfarben', () => {
    const sf = (vars) => Object.fromEntries(Object.entries(vars).filter(([k]) => k.startsWith('--sf-')));
    assert.equal(Object.keys(sf(DUNKEL_MEDIA)).length, PALETTE.length * 2);
    assert.deepEqual(sf(DUNKEL_ATTR), sf(DUNKEL_MEDIA));
  });

  test('Kürzel auf der Fläche: Kontrast mindestens 4,5:1 (hell und dunkel)', () => {
    for (const [name, vars] of BLOECKE) {
      for (const { id } of PALETTE) {
        const k = kontrast(vars[`--sf-${id}`], vars[`--sf-${id}-ink`]);
        assert.ok(k >= 4.5, `${name}: ${id} hat nur ${k.toFixed(2)}:1`);
      }
    }
  });

  test('dunkel: jede Fläche hebt sich von der Karte ab (mindestens 2:1)', () => {
    const karte = DUNKEL_MEDIA['--karte'];
    assert.equal(karte, DUNKEL_ATTR['--karte']);
    for (const { id } of PALETTE) {
      const k = kontrast(DUNKEL_MEDIA[`--sf-${id}`], karte);
      assert.ok(k >= 2, `${id} auf der dunklen Karte nur ${k.toFixed(2)}:1`);
    }
  });

  test('jede Palettenfarbe hat eine Klasse .sf-<id> mit Fläche und Schrift', () => {
    for (const { id } of PALETTE) {
      const regel = css.match(new RegExp(`\\.sf-${id}\\s*\\{([^}]*)\\}`));
      assert.ok(regel, `.sf-${id} fehlt`);
      assert.match(regel[1], new RegExp(`background:\\s*var\\(--sf-${id}\\)`));
      assert.match(regel[1], new RegExp(`color:\\s*var\\(--sf-${id}-ink\\)`));
    }
  });
});
