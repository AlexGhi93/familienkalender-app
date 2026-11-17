// Die Fehler-Wache der e2e-Tests (tests/e2e/hilfen.js): das Bildschirmfoto, das Playwright nach einem Fehlschlag macht, hängt kurz ein
// <style> an (playwright-core screenshotter.js, „body {}“). WebKit meldet das unter unserer CSP (style-src 'self') als console.error.
// Diese Meldung stammt vom Werkzeug, nicht von der App: bei einem schon gescheiterten Test darf sie den eigentlichen Fehler nicht verdecken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meldenswerteFehler } from '../e2e/hilfen.js';

const FOTO = "console.error +28699 ms #/autos: Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy. (/#/autos:1)";
const ANDERE = 'pageerror +120 ms #/autos: TypeError: x is undefined (at src/ui/auto-screen.js:10:3)';

test('gescheiterter Test: die CSP-Meldung des Bildschirmfotos fällt weg, alles andere bleibt', () => {
  assert.deepEqual(meldenswerteFehler([FOTO, ANDERE], { gescheitert: true }), [ANDERE]);
});

test('bestandener Test: jede Meldung zählt – auch eine CSP-Meldung (dann käme sie von der App)', () => {
  assert.deepEqual(meldenswerteFehler([FOTO, ANDERE], { gescheitert: false }), [FOTO, ANDERE]);
});
