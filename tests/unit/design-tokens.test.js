// Design-Tokens in theme.css (1.2.0): jede Eigenschaft, die ein Aussehen (Glas, Bento) ändern darf, ist ein Token mit dem Wert von
// Klassisch; die Liste steht im Kopf von theme.css. Dazu die lokalen Schriften (nur deklariert, Klassisch nutzt sie nicht).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const wurzel = new URL('../../', import.meta.url);
const css = readFileSync(new URL('theme.css', wurzel), 'utf8').replace(/\r\n/g, '\n');

/** Inhalt des ersten Blocks nach `kopf` bis zur nächsten schließenden Klammer (wie in schicht-farben.test.js). */
function block(kopf) {
  const start = css.indexOf(kopf);
  assert.notEqual(start, -1, `Block fehlt: ${kopf}`);
  const auf = css.indexOf('{', start + kopf.length - 1);
  return css.slice(auf + 1, css.indexOf('}', auf));
}

function variablen(text) {
  const ohneKommentare = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return Object.fromEntries([...ohneKommentare.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].replace(/\s+/g, ' ').trim()]));
}

const HELL = variablen(block(':root {'));
const DUNKEL_MEDIA = variablen(block("@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {"));
const DUNKEL_ATTR = variablen(block(":root[data-theme='dark'] {"));
const KOPF = css.slice(0, css.indexOf('*/') + 2);
const OHNE_KOMMENTARE = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Inhalt der Regel, deren Selektor genau `selektor` ist (am Zeilenanfang, erste Fundstelle). */
function regelVon(selektor) {
  const i = OHNE_KOMMENTARE.indexOf(`\n${selektor} {`);
  assert.notEqual(i, -1, `Regel fehlt: ${selektor}`);
  return OHNE_KOMMENTARE.slice(i, OHNE_KOMMENTARE.indexOf('}', i));
}

/** Tokens, auf die sich die Aufgaben 4–9 verlassen, mit dem Wert von Klassisch (= Stand 1.1.2). */
const KLASSISCH = {
  // Flächen, Text, Akzent
  '--bg': '#fff7ec',
  '--karte': '#ffffff',
  '--karte-2': 'var(--karte)',
  '--linie': '#eadfcb',
  '--rand': '1.5px',
  '--karte-rand': 'var(--rand) solid var(--linie)',
  '--feld-rand': 'var(--rand) solid var(--linie)',
  '--feld-bg': 'var(--karte-2)',
  '--chip-grund': 'var(--karte)',
  '--chip-anteil': '12%',
  '--chip-aktiv-anteil': '38%',
  '--tint-grund': 'var(--karte)',
  '--tint-anteil': '16%',
  '--seite-bild': 'none',
  '--ink': '#2d2a3e',
  '--ink-2': '#6b6680',
  '--akzent': '#7a5ce0',
  '--akzent-ink': '#ffffff',
  // Radien
  '--r-karte': '20px',
  '--r-knopf': '14px',
  '--r-zeile': '14px',
  '--r-feld': '14px',
  '--r-chip': '999px',
  '--r-blatt': '26px',
  '--r-zelle': '12px',
  '--r-pinsel': '22px',
  // Schatten
  '--schatten-karte': '0 1px 0 rgba(45, 42, 62, 0.04), 0 8px 22px rgba(45, 42, 62, 0.07)',
  '--schatten-schwebend': '0 -10px 40px rgba(20, 16, 36, 0.25)',
  '--schatten-leiste': '0 -10px 24px rgba(20, 16, 36, 0.14)',
  '--schatten-knopf': 'none',
  // Fokus
  '--fokus-ring': '3px solid var(--akzent)',
  '--fokus-abstand': '2px',
  // Schrift
  '--font-text': "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Segoe UI Variable Text', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  '--font-titel': 'var(--font-text)',
  '--font-zahl': 'var(--font-text)',
  '--font-feld': 'var(--font-text)',
  '--gewicht-titel': '800',
  '--titel-gross': '1.9rem',
  '--titel-seite': '1.5rem',
  '--titel-blatt': '1.2rem',
  '--titel-karte': '1.05rem',
  '--titel-abschnitt': '0.8rem',
  '--titel-schicht': '1.55rem',
  // Tableiste
  '--tabs-hoehe': '68px',
  '--tabs-bg': 'color-mix(in srgb, var(--karte) 92%, transparent)',
  '--tabs-blur': 'blur(14px)',
  '--tabs-rand': 'var(--rand) solid var(--linie)',
  '--tabs-radius': '0',
  '--tabs-abstand': '0px',
  '--tabs-schatten': 'none',
  '--tabs-rahmen': 'none',
  '--tab-aktiv': 'var(--akzent)',
  '--tab-aktiv-bg': 'transparent',
  '--fab-bg': 'var(--akzent)',
  '--fab-ink': 'var(--akzent-ink)',
  '--fab-schatten': '0 6px 16px color-mix(in srgb, var(--akzent) 45%, transparent)',
  // Pinsel-Leiste, Meldung, Tooltip
  '--pinsel-bg': 'var(--karte)',
  '--pinsel-blur': 'none',
  '--toast-bg': 'var(--ink)',
  '--toast-ink': 'var(--bg)',
  '--tooltip-bg': 'var(--ink)',
  '--tooltip-ink': 'var(--bg)',
  // Blatt
  '--blatt-bg': 'var(--bg)',
  '--blatt-blur': 'none',
  '--blatt-schleier': 'rgba(20, 16, 36, 0.45)',
  // Bewegung
  '--dauer-kurz': '0.18s',
  '--dauer-mittel': '0.22s',
  '--kurve-feder': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  '--kurve-sanft': 'ease',
};

describe('Design-Tokens in theme.css', () => {
  test('jedes Token ist im hellen :root-Block definiert, mit dem Wert von Klassisch', () => {
    for (const [name, wert] of Object.entries(KLASSISCH)) assert.equal(HELL[name], wert, name);
  });

  test('der Kopf von theme.css nennt jedes Token, und jedes dort genannte Token gibt es', () => {
    const genannt = new Set(KOPF.match(/--[\w-]+/g));
    for (const name of Object.keys(KLASSISCH)) assert.ok(genannt.has(name), `${name} fehlt im Kopf`);
    for (const name of genannt) assert.ok(name in HELL, `${name} steht im Kopf, ist aber nicht definiert`);
  });

  test('Dunkel: Kartenschatten in beiden dunklen Blöcken gleich und wie bisher', () => {
    const dunkel = '0 1px 0 rgba(0, 0, 0, 0.2), 0 8px 22px rgba(0, 0, 0, 0.3)';
    assert.equal(DUNKEL_MEDIA['--schatten-karte'], dunkel);
    assert.equal(DUNKEL_ATTR['--schatten-karte'], dunkel);
  });

  test('die alten Namen sind ganz ersetzt (keine zwei Wege zum selben Wert)', () => {
    for (const alt of ['--radius', '--radius-klein', '--schatten', '--schrift']) {
      assert.doesNotMatch(OHNE_KOMMENTARE, new RegExp(`${alt}\\s*[:)]`), alt);
    }
  });

  test('Komponenten benutzen die Tokens: Karte, Knopf, Chip, Blatt, Tableiste, Titel', () => {
    const regel = (selektor) => {
      const i = OHNE_KOMMENTARE.indexOf(`\n${selektor} {`);
      assert.notEqual(i, -1, `Regel fehlt: ${selektor}`);
      return OHNE_KOMMENTARE.slice(i, OHNE_KOMMENTARE.indexOf('}', i));
    };
    assert.match(regel('.karte'), /border-radius: var\(--r-karte\)/);
    assert.match(regel('.karte'), /box-shadow: var\(--schatten-karte\)/);
    assert.match(regel('.knopf'), /border-radius: var\(--r-knopf\)/);
    assert.match(regel('.chip'), /border-radius: var\(--r-chip\)/);
    assert.match(regel('.zeile'), /background: var\(--karte-2\)/);
    assert.match(regel('.blatt'), /background: var\(--blatt-bg\)/);
    assert.match(regel('.blatt'), /border-radius: var\(--r-blatt\) var\(--r-blatt\) 0 0/);
    assert.match(regel('.blatt'), /backdrop-filter: var\(--blatt-blur\)/);
    assert.match(regel('.blatt'), /transition: transform var\(--dauer-mittel\) var\(--kurve-feder\)/);
    assert.match(regel('.blatt-hintergrund'), /background: var\(--blatt-schleier\)/);
    assert.match(regel('.tabs'), /background: var\(--tabs-bg\)/);
    assert.match(regel('.tabs'), /border-radius: var\(--tabs-radius\)/);
    assert.match(regel('.tabs'), /bottom: var\(--tabs-abstand\)/);
    assert.match(regel('.gruss'), /font-size: var\(--titel-gross\)/);
    assert.match(regel('.gruss'), /font-family: var\(--font-titel\)/);
    assert.match(regel('body'), /font-family: var\(--font-text\)/);
  });

  test('Lücken aus dem Review: Rahmen, Felder, Chips, Tableiste, Pinsel, Meldung, Fokus, Knopf, Seite', () => {
    const regel = regelVon;
    assert.match(regel('.karte'), /border: var\(--karte-rand\)/);
    for (const feld of ['.feld input', '.feld textarea', '.zeile-eingabe input', '.verlauf-suche', '.konto-eingabe']) {
      assert.match(regel(feld), /border: var\(--feld-rand\)/, feld);
      assert.match(regel(feld), /background: var\(--feld-bg\)/, feld);
    }
    assert.match(regel('.chip'), /background: color-mix\(in srgb, var\(--c, var\(--ink-2\)\) var\(--chip-anteil\), var\(--chip-grund\)\)/);
    assert.match(regel('.chip.aktiv'), /var\(--chip-aktiv-anteil\), var\(--chip-grund\)\)/);
    assert.match(regel('.tint'), /background: color-mix\(in srgb, var\(--c\) var\(--tint-anteil\), var\(--tint-grund\)\)/);
    assert.match(regel('.tabs'), /border: var\(--tabs-rahmen\);\s*border-top: var\(--tabs-rand\)/);
    assert.match(regel('.tab.aktiv'), /color: var\(--tab-aktiv\)/);
    assert.match(regel('.tab.aktiv'), /background: var\(--tab-aktiv-bg\)/);
    assert.match(regel('.tab.fab .tab-symbol'), /background: var\(--fab-bg\)/);
    assert.match(regel('.tab.fab .tab-symbol'), /box-shadow: var\(--fab-schatten\)/);
    assert.match(regel('.sp-pinsel'), /background: var\(--pinsel-bg\)/);
    assert.match(regel('.sp-pinsel'), /backdrop-filter: var\(--pinsel-blur\)/);
    assert.match(regel('.sp-pinsel'), /border-radius: var\(--r-pinsel\) var\(--r-pinsel\) 0 0/);
    assert.match(regel('.toast'), /background: var\(--toast-bg\);\s*color: var\(--toast-ink\)/);
    assert.match(regel('.diag-tip'), /background: var\(--tooltip-bg\);\s*color: var\(--tooltip-ink\)/);
    assert.match(regel(':focus-visible'), /outline: var\(--fokus-ring\);\s*outline-offset: var\(--fokus-abstand\)/);
    assert.match(regel('.knopf'), /box-shadow: var\(--schatten-knopf\)/);
    assert.match(regel('body'), /background-image: var\(--seite-bild\)/);
    assert.match(regel('.sp-kopf .gruss'), /font-size: var\(--titel-schicht\)/);
    for (const titel of ['.blatt-inhalt h3', '.darstellung-titel', '.kachel b']) assert.match(regel(titel), /font-family: var\(--font-titel\)/, titel);
  });

  test('Auswahllisten: --font-feld wirkt nur in Glas/Bento (Klassisch lässt select die Schrift des Browsers)', () => {
    assert.match(OHNE_KOMMENTARE, /:root\[data-aussehen\] select \{\s*font-family: var\(--font-feld\);\s*\}/);
    // sonst keine Regel für select in der Basis: das würde Klassisch ändern
    assert.doesNotMatch(OHNE_KOMMENTARE.replace(/:root\[data-aussehen\] select \{[^}]*\}/, ''), /(^|\n)select[^{]*\{/);
  });

  test('--font-zahl nur auf Zahlen, nicht auf Behältern mit Beschriftungen', () => {
    const regelMit = regelVon;
    for (const behaelter of ['.sz-raster', '.fk-legende']) assert.doesNotMatch(regelMit(behaelter), /--font-zahl/, behaelter);
    assert.match(regelMit('.sz-raster b'), /font-family: var\(--font-zahl\)/);
    // im selben Block nach font: inherit wäre es wirkungslos
    assert.doesNotMatch(OHNE_KOMMENTARE, /font-family: var\(--font-zahl\);[^}]*font: inherit/);
  });

  test('kein Aussehen setzt --font-zahl auf Fredoka (proportionale Ziffern, kein tnum)', () => {
    for (const datei of ['themes/glas.css', 'themes/bento.css']) {
      const text = readFileSync(new URL(datei, wurzel), 'utf8');
      assert.doesNotMatch(text, /--font-zahl\s*:[^;]*Fredoka/, datei);
    }
  });
});

describe('Schriften (lokal, OFL)', () => {
  const faces = [...OHNE_KOMMENTARE.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const familie = (f) => /font-family:\s*'([^']+)'/.exec(f)?.[1];
  const datei = (f) => /url\('([^']+)'\)\s*format\('woff2'\)/.exec(f)?.[1];

  test('drei @font-face (Onest, Fredoka, Nunito) aus fonts/, woff2, font-display: swap', () => {
    assert.deepEqual(faces.map(familie).sort(), ['FK Fredoka', 'FK Nunito', 'FK Onest']);
    for (const f of faces) {
      assert.match(datei(f) ?? '', /^fonts\/[a-z]+\.woff2$/, familie(f));
      assert.match(f, /font-display:\s*swap/, familie(f));
      assert.doesNotMatch(f, /https?:|\/\//, `${familie(f)}: nur lokale Quellen`);
    }
  });

  test('Klassisch nutzt keine der neuen Schriften: kein Name einer @font-face steht in einer Schriftliste', () => {
    // Wichtig: „Nunito“ steht schon in der Schriftliste von Klassisch (als installierte Systemschrift). Hieße die neue Schrift
    // „Nunito“, würde Klassisch sie auf Telefonen ohne ui-rounded plötzlich laden – deshalb das Präfix „FK“.
    const listen = [...OHNE_KOMMENTARE.matchAll(/(?:font-family|--font-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => m[1]).filter((l) => !/^'FK /.test(l.trim()));
    for (const name of faces.map(familie)) for (const l of listen) assert.ok(!l.includes(name), `${name} in „${l}“`);
  });

  test('jede Schrift hat ihre eigene unicode-range (Fredoka ohne Pfeile und ≤ ≥, Nunito ohne Pfeile)', () => {
    const bereich = (name) => /unicode-range:\s*([^;]+);/.exec(faces.find((f) => familie(f) === name))?.[1] ?? '';
    assert.match(bereich('FK Onest'), /U\+2190-2193/);
    assert.doesNotMatch(bereich('FK Fredoka'), /U\+2190|U\+2264/);
    assert.doesNotMatch(bereich('FK Nunito'), /U\+2190/);
    for (const name of ['FK Onest', 'FK Fredoka', 'FK Nunito']) assert.match(bereich(name), /U\+0020-007E, U\+00A0-.*U\+20AC/, name);
  });

  test('zusammen höchstens 250 KB, Lizenztexte in fonts/LIZENZ.md', () => {
    const groesse = faces.map(datei).reduce((s, d) => s + statSync(new URL(d, wurzel)).size, 0);
    assert.ok(groesse > 0 && groesse <= 250 * 1024, `${groesse} Bytes`);
    const lizenz = readFileSync(new URL('fonts/LIZENZ.md', wurzel), 'utf8');
    assert.equal(lizenz.match(/SIL OPEN FONT LICENSE Version 1\.1/g)?.length, 3);
    for (const name of ['Onest', 'Fredoka', 'Nunito']) assert.match(lizenz, new RegExp(`Copyright \\d{4} The ${name} Project Authors`));
  });
});
