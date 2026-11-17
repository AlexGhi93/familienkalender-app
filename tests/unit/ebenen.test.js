// Ebenenregel: domain ist rein, calendar/push hängen nur an domain, app kennt ui nicht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

function dateien(ordner) {
  const liste = [];
  for (const name of readdirSync(ordner)) {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) liste.push(...dateien(pfad));
    else if (name.endsWith('.js')) liste.push(pfad);
  }
  return liste;
}

const MUSTER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g;

function importe(datei) {
  const text = readFileSync(datei, 'utf8');
  const ziele = [];
  for (const m of text.matchAll(MUSTER)) ziele.push(resolve(dirname(datei), m[2]));
  return ziele;
}

const rel = (pfad) => relative(SRC, pfad).split(sep).join('/');

function verstoesse(bereich, erlaubt, ausnahmen = []) {
  const fehler = [];
  for (const datei of dateien(join(SRC, bereich))) {
    for (const ziel of importe(datei)) {
      const r = rel(ziel);
      const ordner = r.split('/')[0];
      if (!erlaubt.includes(ordner) && !ausnahmen.includes(r)) fehler.push(`${rel(datei)} → ${r}`);
    }
  }
  return fehler;
}

test('domain importiert nur domain', () => {
  assert.deepEqual(verstoesse('domain', ['domain']), []);
});

test('calendar und push importieren nur domain, calendar, push und app/speicher.js', () => {
  assert.deepEqual(verstoesse('calendar', ['domain', 'calendar', 'push'], ['app/speicher.js']), []);
  assert.deepEqual(verstoesse('push', ['domain', 'calendar', 'push'], ['app/speicher.js']), []);
});

test('app importiert nichts aus ui', () => {
  assert.deepEqual(verstoesse('app', ['domain', 'app', 'calendar', 'push']), []);
});
