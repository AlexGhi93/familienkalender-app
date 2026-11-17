// Duplikat-Prüfung mit jscpd (fest 4.3.0, keine devDependency).
// Jeder neue Klon lässt die CI scheitern: Schwelle = Stand in tests/duplikate-basis.json.
// Sinkt der Stand, läuft die Prüfung grün und nennt die neue, niedrigere Basis.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const basis = JSON.parse(readFileSync(join(wurzel, 'tests', 'duplikate-basis.json'), 'utf8'));
const JSCPD = 'jscpd@4.3.0';

const laeufe = [
  {
    name: 'js', format: 'javascript', endung: '.js', grosseDatei: 'src',
    args: ['--format', 'javascript', '--min-tokens', '50', '--max-lines', '20000', '--max-size', '2mb',
      '--ignore', '**/tests/visuell/**', 'src', 'tests'],
  },
  {
    name: 'css', format: 'css', endung: '.css', grosseDatei: 'themes',
    args: ['--format', 'css', '--min-tokens', '30', '--min-lines', '4', '--max-lines', '20000',
      '--max-size', '2mb', 'themes'],
  },
];

function dateien(ordner, endung) {
  const aus = [];
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = join(ordner, e.name);
    if (e.isDirectory()) aus.push(...dateien(pfad, endung));
    else if (e.name.endsWith(endung)) aus.push(pfad);
  }
  return aus;
}

function zeilen(pfad) {
  return readFileSync(pfad, 'utf8').split('\n').length;
}

let fehler = 0;
const senken = [];

for (const lauf of laeufe) {
  const ausgabe = mkdtempSync(join(tmpdir(), 'jscpd-'));
  try {
    const befehl = 'npx -y ' + JSCPD + ' ' + [...lauf.args, '--reporters', 'json', '--silent', '--output', ausgabe]
      .map((a) => `"${a}"`).join(' ');
    const r = spawnSync(befehl, { cwd: wurzel, encoding: 'utf8', shell: true });
    let bericht;
    try {
      bericht = JSON.parse(readFileSync(join(ausgabe, 'jscpd-report.json'), 'utf8'));
    } catch {
      console.error(`${lauf.name}: jscpd lieferte keinen Bericht (Exit ${r.status}).\n${r.stderr || ''}`);
      fehler++;
      continue;
    }
    const gesamt = bericht.statistics.total;
    const soll = basis[lauf.name];
    console.log(`${lauf.name}: ${gesamt.clones} Klone / ${gesamt.duplicatedLines} Zeilen (Basis ${soll.klone} / ${soll.zeilen})`);

    // Wächter: die größte Datei darf nicht stillschweigend übersprungen worden sein.
    const alle = dateien(join(wurzel, lauf.grosseDatei), lauf.endung);
    const groesste = alle.map((p) => ({ p, n: zeilen(p) })).sort((a, b) => b.n - a.n)[0];
    const gelesen = Object.keys(bericht.statistics.formats[lauf.format]?.sources || {})
      .map((s) => s.replaceAll(String.fromCharCode(92), '/'));
    const rel = relative(wurzel, groesste.p).replaceAll(String.fromCharCode(92), '/');
    if (!gelesen.some((s) => s === rel || s.endsWith('/' + rel))) {
      console.error(`${lauf.name}: jscpd hat eine große Datei übersprungen: ${rel} (${groesste.n} Zeilen)`);
      fehler++;
    }

    if (gesamt.clones > soll.klone || gesamt.duplicatedLines > soll.zeilen) {
      console.error(`${lauf.name}: neue Duplikate (mehr als die Basis). Klone im Bericht:`);
      for (const d of bericht.duplicates) {
        console.error(`  ${d.firstFile.name}:${d.firstFile.start}-${d.firstFile.end}  <->  ${d.secondFile.name}:${d.secondFile.start}-${d.secondFile.end}  (${d.lines} Zeilen)`);
      }
      fehler++;
    } else if (gesamt.clones < soll.klone || gesamt.duplicatedLines < soll.zeilen) {
      senken.push(`${lauf.name}: { "klone": ${gesamt.clones}, "zeilen": ${gesamt.duplicatedLines} }`);
    }
  } finally {
    rmSync(ausgabe, { recursive: true, force: true });
  }
}

if (fehler) process.exit(1);
if (senken.length) console.log(`Basis senken: ${senken.join('; ')} (in tests/duplikate-basis.json)`);
