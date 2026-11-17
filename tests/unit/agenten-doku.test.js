// Die Agenten-Doku stimmt mit dem Baum überein: Zeilenlimit, genau ein Bereich je Datei in src/ und themes/, alle genannten Pfade existieren.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = new URL('../../', import.meta.url);
const wurzelPfad = fileURLToPath(wurzel);
const zeilenenden = (text) => text.replace(/\r\n?/g, '\n');
const lesen = (name) => zeilenenden(readFileSync(new URL(name, wurzel), 'utf8'));
const zeilen = (name) => lesen(name).trimEnd().split('\n').length;

const ARBEITSORDNER = new Set(['node_modules', '.git', '.superpowers', '.internal', 'test-results', 'playwright-report', '__basis__']);
function alleDateien(ordner) {
  const liste = [];
  for (const name of readdirSync(ordner)) {
    if (ARBEITSORDNER.has(name)) continue;
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) liste.push(...alleDateien(pfad));
    else liste.push(relative(wurzelPfad, pfad).split(sep).join('/'));
  }
  return liste;
}
const dateien = alleDateien(wurzelPfad);

/** Nur `*` (innerhalb eines Pfadsegments) und `{a,b}` (auch mit `/` in den Alternativen). */
function ausklappen(muster) {
  const m = /\{([^{}]*)\}/.exec(muster);
  if (!m) return [muster];
  return m[1].split(',').flatMap((teil) => ausklappen(muster.slice(0, m.index) + teil + muster.slice(m.index + m[0].length)));
}
function passt(muster, pfad) {
  return ausklappen(muster).some((einzeln) => {
    const regex = einzeln.split('*').map((s) => s.replace(/[.+?^$()|[\]\\]/g, '\\$&')).join('[^/]*');
    return new RegExp(`^${regex}$`).test(pfad);
  });
}
const hatPlatzhalter = (muster) => /[*{<]/.test(muster);

function bereicheAus(text) {
  const aus = new Map();
  let name = null;
  for (const zeile of zeilenenden(text).split('\n')) {
    const kopf = /^## (.+)$/.exec(zeile);
    if (kopf) { name = kopf[1].trim(); aus.set(name, []); continue; }
    if (name && /^- /.test(zeile)) aus.get(name).push(...[...zeile.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
  }
  return aus;
}
const bereiche = () => bereicheAus(lesen('OWNERS.md'));

// Lokale, git-ignorierte Arbeitsordner: in einem frischen Clone/CI nicht vorhanden, daher nie als fehlend melden.
const LOKALE_ORDNER = ['.internal/', '.superpowers/', 'tests/visuell/__basis__/', 'test-results/', 'playwright-report/'];
const istLokalerOrdner = (pfad) => LOKALE_ORDNER.some((o) => pfad === o.slice(0, -1) || pfad.startsWith(o));

test('der OWNERS-Parser liefert bei LF und CRLF dasselbe', () => {
  const lf = '## Hubs\n- `a.js`, `b.js`\n## Shared\n- `c/*.js`\n';
  const erwartet = new Map([['Hubs', ['a.js', 'b.js']], ['Shared', ['c/*.js']]]);
  assert.deepEqual(bereicheAus(lf), erwartet);
  assert.deepEqual(bereicheAus(lf.replace(/\n/g, '\r\n')), erwartet);
});

test('AGENTS.md und OWNERS.md haben höchstens 100 Zeilen; CLAUDE.md verweist nur auf AGENTS.md', () => {
  assert.ok(zeilen('AGENTS.md') <= 100); assert.ok(zeilen('OWNERS.md') <= 100);
  assert.equal(lesen('CLAUDE.md').trim(), '@AGENTS.md');
});

test('jede Datei des Repos (außer den drei Doku-Dateien) gehört laut OWNERS.md zu genau einem Bereich', () => {
  const alle = bereiche();
  const zonen = [...alle].filter(([name]) => name !== 'Shared');
  assert.ok(zonen.length >= 10);
  const ohneBereich = [];
  const inMehrerenBereichen = [];
  for (const datei of dateien.filter((d) => !['AGENTS.md', 'OWNERS.md', 'CLAUDE.md'].includes(d))) {
    const treffer = zonen.filter(([, muster]) => muster.some((m) => passt(m, datei))).map(([name]) => name);
    if (treffer.length === 0) ohneBereich.push(datei);
    if (treffer.length > 1) inMehrerenBereichen.push(`${datei}: ${treffer.join(', ')}`);
  }
  assert.deepEqual(ohneBereich, []); assert.deepEqual(inMehrerenBereichen, []);
});

test('jeder Pfad ohne Platzhalter in OWNERS.md und jede in AGENTS.md genannte Datei existiert', () => {
  const fehlend = [];
  for (const [bereich, muster] of bereiche()) {
    for (const m of muster) {
      if (hatPlatzhalter(m)) { if (!dateien.some((d) => passt(m, d))) fehlend.push(`OWNERS ${bereich}: ${m} trifft nichts`); }
      else if (!istLokalerOrdner(m) && !existsSync(new URL(m, wurzel))) fehlend.push(`OWNERS ${bereich}: ${m}`);
    }
  }
  for (const [, token] of lesen('AGENTS.md').matchAll(/`([^`]+)`/g)) {
    const istPfad = !/[\s*{<$()=:→]/.test(token) && (token.includes('/') || /\.(js|mjs|css|json|md|html)$/.test(token));
    if (istPfad && !istLokalerOrdner(token) && !existsSync(new URL(token, wurzel))) fehlend.push(`AGENTS: ${token}`);
  }
  assert.deepEqual(fehlend, []);
});

test('die Hub-Liste in AGENTS.md ist identisch mit dem Abschnitt Hubs in OWNERS.md', () => {
  const aus = lesen('AGENTS.md').split('\n').find((z) => z.startsWith('- Hub files are integrator-only'));
  assert.ok(aus);
  const inAgents = [...aus.split('):')[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.deepEqual(inAgents, bereiche().get('Hubs'));
});
