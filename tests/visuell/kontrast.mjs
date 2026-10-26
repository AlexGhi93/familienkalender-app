// Kontrast- und Zielgrößen-Prüfung aller Bildschirme (tests/visuell/bildschirme.js) in Klassisch, Glas und Bento × Hell/Dunkel.
// Aufruf: node tests/visuell/kontrast.mjs [--aussehen glas,bento] [--modus hell,dunkel] [--bildschirm heute,monat] [--port 8143]
//         [--breite 390] [--json datei.json] [--fotos ordner]   (Ende 0 = alles ≥ 4,5:1 und alle Ziele ≥ 44 px, sonst 1)
//
// Gemessen wird, was man sieht (Review Focus 5: Glas-Dunkel über dem hellsten Fleck des Lichts): je Scrollstellung zwei Fotos des
// Bildschirms, einmal wie er ist (A) und einmal mit unsichtbarer Schrift (B, -webkit-text-fill-color: transparent – Ränder, Flächen,
// Glas, Verläufe und Licht bleiben gleich). Wo A und B sich unterscheiden, liegen die Buchstaben. Je Wort(gruppe): die Schriftfarbe
// ist das am stärksten abweichende Pixel (voll bedeckt), der Hintergrund ist B an jedem Buchstabenpixel; das Ergebnis ist das
// 5.-Perzentil (fast der schlechteste Fleck) über alle Buchstabenpixel. So zählen Verläufe, Glas und Licht dort, wo die Schrift liegt.
// Bilder und Emoji (eigene Farben) zählen nicht. Dasselbe Wort an mehreren Scrollstellungen: der schlechteste Wert zählt.
// Felder: Wert bzw. Platzhalter. Gesperrte Bedienelemente (disabled) sind nach WCAG 1.4.3 ausgenommen und werden nur genannt.
//
// Ziele: jedes sichtbare Bedienelement (Link, Knopf, Feld, Auswahl, role=button …) ≥ 44 × 44 px; ein Kästchen/Schalter zählt mit
// seinem <label>. Ausgenommen (und gezählt): Links im Fließtext (WCAG 2.5.8 „inline“).
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { BILDSCHIRME } from './bildschirme.js';
import { AUSSEHEN, MODI, neuerKontext, ruhe, starteServer, telefon } from './werkzeug.js';

const GRENZE = 4.5;
const ZIEL_PX = 44;

function argument(name, standard) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : standard;
}
const liste = (wert, alle) => (wert ? wert.split(',').map((s) => s.trim()) : alle);

const aussehenListe = liste(argument('aussehen'), AUSSEHEN);
const modusListe = liste(argument('modus'), MODI);
const bildschirmNamen = liste(argument('bildschirm'), BILDSCHIRME.map((b) => b.name));
const port = Number(argument('port', process.env.KONTRAST_PORT ?? 8143));
const jsonDatei = argument('json');
const breite = Number(argument('breite', 390)); // Breite des Telefons in CSS-px (z. B. 360 oder 384 für Samsung)
const fotoOrdner = argument('fotos'); // zur Fehlersuche: die Fotos A (mit Schrift) und B (ohne) je Scrollstellung

/** Schrift unsichtbar, alles andere bleibt (auch currentColor in Rändern und Symbolen). */
const OHNE_SCHRIFT = `
*, *::before, *::after { -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }
::placeholder { -webkit-text-fill-color: transparent !important; color: transparent !important; }
svg text, svg tspan { fill: transparent !important; stroke: transparent !important; }`;

// ---------- in der Seite: Wortgruppen, Felder, Ziele ----------

/** Läuft in der App: alle sichtbaren Wortgruppen im Bildschirm (Bildschirm-Koordinaten in CSS-px), Felder mit Text. */
function sammleTexte() {
  const vw = innerWidth;
  const vh = innerHeight;
  const ergebnis = [];
  const pfad = (el) => {
    const teile = [];
    for (let e = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i += 1) {
      const klassen = [...e.classList].filter((k) => !k.startsWith('bw-')).slice(0, 2);
      teile.unshift(e.tagName.toLowerCase() + (klassen.length ? `.${klassen.join('.')}` : ''));
    }
    return teile.join(' > ');
  };
  const sichtbar = (el, r) => {
    if (r.width < 2 || r.height < 2) return false;
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    // Mitte, links, rechts, oben und unten (je etwas innen): halb abgeschnittene oder halb verdeckte Schrift zählt an dieser
    // Scrollstellung nicht (dahinter läge sonst fremde Schrift im Messfeld)
    const punkte = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + Math.min(3, r.width / 2), r.top + r.height / 2],
      [r.right - Math.min(3, r.width / 2), r.top + r.height / 2],
      [r.left + r.width / 2, r.top + r.height * 0.2],
      [r.left + r.width / 2, r.bottom - r.height * 0.2],
    ];
    return punkte.every(([x, y]) => {
      const treffer = document.elementFromPoint(x, y);
      return treffer && (treffer === el || el.contains(treffer) || treffer.contains(el));
    });
  };
  const gesperrt = (el) => Boolean(el.closest('button:disabled, input:disabled, select:disabled, textarea:disabled, fieldset:disabled, [aria-disabled="true"]'));
  const deckung = (el) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };
  const info = (el, art, text, r, schluessel) => {
    const s = getComputedStyle(el);
    ergebnis.push({
      schluessel,
      art,
      text: text.slice(0, 40),
      pfad: pfad(el),
      x: r.left,
      y: r.top,
      b: r.width,
      h: r.height,
      groesse: Number.parseFloat(s.fontSize),
      gewicht: Number(s.fontWeight) || 400,
      farbe: s.color,
      deckung: deckung(el),
      gesperrt: gesperrt(el),
      diagramm: Boolean(el.closest('svg')),
    });
  };
  // Text im DOM (auch SVG-Text): Abschnitte zwischen Emoji (die nie mitgemessen werden), je Zeile ein Rechteck
  const OHNE_EMOJI = /[^\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]+/gu;
  const gang = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let nr = 0;
  for (let knoten = gang.nextNode(); knoten; knoten = gang.nextNode()) {
    nr += 1;
    const el = knoten.parentElement;
    if (!el || el.closest('script, style, noscript, template, .bw-nur-vorlesen, option')) continue;
    let i = 0;
    for (const m of knoten.data.matchAll(OHNE_EMOJI)) {
      const vorne = m[0].length - m[0].trimStart().length;
      const kern = m[0].trim();
      if (!kern) continue;
      const bereich = document.createRange();
      bereich.setStart(knoten, m.index + vorne);
      bereich.setEnd(knoten, m.index + vorne + kern.length);
      for (const r of bereich.getClientRects()) {
        if (r.width < 1) continue;
        if (sichtbar(el, r)) info(el, el.closest('svg') ? 'diagramm' : 'text', kern, r, `t${nr}.${i}`);
        i += 1;
      }
    }
  }
  // Felder: Wert oder Platzhalter im Inhaltsbereich
  const felder = document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), textarea, select');
  felder.forEach((el, i) => {
    const text = el.tagName === 'SELECT' ? (el.selectedOptions[0]?.textContent ?? '') : el.value || el.placeholder || '';
    if (!text.trim()) return;
    const s = getComputedStyle(el);
    const a = el.getBoundingClientRect();
    const px = (w) => Number.parseFloat(w) || 0;
    const links = a.left + px(s.borderLeftWidth) + px(s.paddingLeft);
    const oben = a.top + px(s.borderTopWidth) + px(s.paddingTop);
    const r = new DOMRect(links, oben, a.right - px(s.borderRightWidth) - px(s.paddingRight) - links, a.bottom - px(s.borderBottomWidth) - px(s.paddingBottom) - oben);
    if (sichtbar(el, a)) info(el, el.value ? 'feld' : 'platzhalter', text, r, `f${i}`);
  });
  return ergebnis;
}

/** Läuft in der App: alle sichtbaren Bedienelemente der ganzen Seite (bzw. des offenen Blatts) und ihre Größe. */
function sammleZiele() {
  const blatt = [...document.querySelectorAll('[role=dialog], dialog[open]')].filter((d) => d.checkVisibility?.() ?? true).at(-1) ?? null;
  const wurzel = blatt ?? document.body;
  const auswahl = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [tabindex]:not([tabindex="-1"])';
  const pfad = (el) => {
    const teile = [];
    for (let e = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i += 1) {
      const klassen = [...e.classList].filter((k) => !k.startsWith('bw-')).slice(0, 2);
      teile.unshift(e.tagName.toLowerCase() + (klassen.length ? `.${klassen.join('.')}` : ''));
    }
    return teile.join(' > ');
  };
  const ziele = [];
  for (const el of wurzel.querySelectorAll(auswahl)) {
    if (el.closest('[inert]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue;
    let r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const label = el.matches('input[type=checkbox], input[type=radio], input[type=file]') ? (el.closest('label') ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null)) : null;
    if (label) r = label.getBoundingClientRect();
    else if (Number(getComputedStyle(el).opacity) === 0 || r.width <= 2 || r.height <= 2) continue; // unsichtbarer Auslöser ohne Label (z. B. Datumswahl hinter einem Knopf)
    const imText = el.tagName === 'A' && el.closest('p, li.text') && el.parentElement && getComputedStyle(el).display === 'inline';
    ziele.push({
      pfad: pfad(el),
      text: (el.getAttribute('aria-label') || el.textContent || el.value || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      b: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      imText: Boolean(imText),
      gesperrt: el.matches(':disabled'),
    });
  }
  return ziele;
}

/** Scrollstellungen: das offene Blatt (sein scrollender Bereich) oder die Seite. */
function scrollbereich() {
  const blatt = [...document.querySelectorAll('[role=dialog], dialog[open]')].filter((d) => d.checkVisibility?.() ?? true).at(-1) ?? null;
  let el = document.scrollingElement;
  if (blatt) {
    const kandidaten = [blatt, ...blatt.querySelectorAll('*')].filter((e) => {
      const s = getComputedStyle(e);
      return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight - e.clientHeight > 4;
    });
    el = kandidaten.sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight))[0] ?? null;
    if (!el) return { stellungen: [0] };
  }
  const max = el.scrollHeight - el.clientHeight;
  const schritt = Math.max(200, Math.floor(el.clientHeight * 0.7));
  const stellungen = [];
  for (let y = 0; y < max; y += schritt) stellungen.push(y);
  stellungen.push(Math.max(0, max));
  el.setAttribute('data-kontrast-scroll', '');
  return { stellungen: [...new Set(stellungen)] };
}

function scrolleZu(y) {
  const el = document.querySelector('[data-kontrast-scroll]') ?? document.scrollingElement;
  el.scrollTo({ top: y, behavior: 'instant' });
}

// ---------- im Analyse-Fenster: Pixel ----------

/** Läuft in einer leeren Seite: misst je Wortgruppe die Schrift gegen das, was hinter ihr liegt. */
async function misst({ a, b, dpr, gruppen }) {
  const lade = async (daten) => {
    const bild = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const leinwand = new OffscreenCanvas(bild.width, bild.height);
    const ctx = leinwand.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bild, 0, 0);
    return { breite: bild.width, hoehe: bild.height, px: ctx.getImageData(0, 0, bild.width, bild.height).data };
  };
  const A = await lade(a);
  const B = await lade(b);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const leucht = (r, g, bl) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  const verhaeltnis = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const hex = (r, g, bl) => `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return gruppen.map((g) => {
    const x0 = Math.max(0, Math.floor(g.x * dpr));
    const y0 = Math.max(0, Math.floor(g.y * dpr));
    const x1 = Math.min(A.breite, Math.ceil((g.x + g.b) * dpr));
    const y1 = Math.min(A.hoehe, Math.ceil((g.y + g.h) * dpr));
    let maxD = 0;
    let schrift = null;
    const diffs = [];
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * A.breite + x) * 4;
        // Summe über die Kanäle: ein voll bedecktes Pixel weicht in allen drei ab (ein Farbsaum der Kantenglättung nur in einem)
        const d = Math.abs(A.px[i] - B.px[i]) + Math.abs(A.px[i + 1] - B.px[i + 1]) + Math.abs(A.px[i + 2] - B.px[i + 2]);
        diffs.push([i, d]);
        if (d > maxD) {
          maxD = d;
          schrift = [A.px[i], A.px[i + 1], A.px[i + 2]];
        }
      }
    }
    // Hintergrund ohne Schrift: Mittelwert von B (für den Fall ohne sichtbare Buchstaben)
    if (maxD < 48) {
      let r = 0;
      let gr = 0;
      let bl = 0;
      for (const [i] of diffs) {
        r += B.px[i];
        gr += B.px[i + 1];
        bl += B.px[i + 2];
      }
      const n = Math.max(1, diffs.length);
      const grund = [Math.round(r / n), Math.round(gr / n), Math.round(bl / n)];
      return { ...g, ohneGlyphen: true, grund, hintergrund: hex(...grund) };
    }
    const ls = leucht(...schrift);
    const werte = [];
    for (const [i, d] of diffs) {
      if (d < maxD * 0.5) continue;
      werte.push([verhaeltnis(ls, leucht(B.px[i], B.px[i + 1], B.px[i + 2])), i]);
    }
    werte.sort((p, q) => p[0] - q[0]);
    const [wert, i] = werte[Math.floor(werte.length * 0.05)];
    return { ...g, verhaeltnis: Math.round(wert * 100) / 100, schrift: hex(...schrift), hintergrund: hex(B.px[i], B.px[i + 1], B.px[i + 2]), pixel: werte.length };
  });
}

/** Farbe aus getComputedStyle (rgb/rgba) → [r, g, b, a]. */
function rgba(text) {
  const m = /rgba?\(([^)]+)\)/.exec(text ?? '');
  if (!m) return null;
  const t = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [t[0], t[1], t[2], t[3] ?? 1];
}

function wcag(farbe, grund) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const [l1, l2] = [l(farbe), l(grund)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ---------- Ablauf ----------

async function pruefeBildschirm(page, analyse, bildschirm) {
  await bildschirm.oeffne(page);
  await ruhe(page);
  const ziele = await page.evaluate(sammleZiele);
  const { stellungen } = await page.evaluate(scrollbereich);
  const dpr = await page.evaluate(() => devicePixelRatio);
  const gemessen = new Map();
  for (const y of stellungen) {
    await page.evaluate(scrolleZu, y);
    await ruhe(page);
    const gruppen = await page.evaluate(sammleTexte);
    if (gruppen.length === 0) continue;
    const foto = { animations: 'disabled', caret: 'hide', scale: 'device' };
    const a = (await page.screenshot(foto)).toString('base64');
    // über CSSOM (die Seite verbietet Inline-Stile per CSP; ein erzeugtes Stylesheet ist erlaubt)
    await page.evaluate((css) => {
      const blatt = new CSSStyleSheet();
      blatt.replaceSync(css);
      window.__ohneSchrift = blatt;
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, blatt];
    }, OHNE_SCHRIFT);
    await ruhe(page);
    const b = (await page.screenshot(foto)).toString('base64');
    await page.evaluate(() => (document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== window.__ohneSchrift)));
    if (fotoOrdner) {
      await writeFile(`${fotoOrdner}/${bildschirm.name}-${y}-a.png`, Buffer.from(a, 'base64'));
      await writeFile(`${fotoOrdner}/${bildschirm.name}-${y}-b.png`, Buffer.from(b, 'base64'));
    }
    for (const g of await analyse.evaluate(misst, { a, b, dpr, gruppen })) {
      if (g.ohneGlyphen) {
        // keine sichtbaren Buchstaben: aus der berechneten Farbe (sonst würde Schrift in Hintergrundfarbe nie auffallen)
        const f = rgba(g.farbe);
        const h = g.grund;
        const alpha = (f?.[3] ?? 0) * g.deckung;
        if (!f || alpha < 0.05) continue;
        const misch = f.slice(0, 3).map((c, k) => Math.round(c * alpha + h[k] * (1 - alpha)));
        g.verhaeltnis = Math.round(wcag(misch, h) * 100) / 100;
        g.schrift = `${g.farbe} (berechnet)`;
      }
      const alt = gemessen.get(g.schluessel);
      if (!alt || g.verhaeltnis < alt.verhaeltnis) gemessen.set(g.schluessel, g);
    }
  }
  return { texte: [...gemessen.values()], ziele };
}

const server = await starteServer(port);
const browser = await chromium.launch({ args: ['--disable-lcd-text'] }); // Graustufen-Kantenglättung wie auf dem Telefon
const analyseKontext = await browser.newContext();
const analyse = await analyseKontext.newPage();
const bericht = [];
let fehlerGesamt = 0;
try {
  for (const aussehen of aussehenListe) {
    for (const modus of modusListe) {
      const zeile = { aussehen, modus, minimum: Infinity, minText: null, texte: 0, fehler: [], gesperrt: [], ziele: 0, kleineZiele: [], imText: 0, kleinsteSchrift: [] };
      for (const bildschirm of BILDSCHIRME.filter((b) => bildschirmNamen.includes(b.name))) {
        const kontext = await neuerKontext(browser, { url: server.url, aussehen, modus, geraet: telefon({ breite, hoehe: Math.round(breite * 2.16) }) });
        const page = await kontext.newPage();
        page.on('pageerror', (e) => console.error(`  ${aussehen}/${modus}/${bildschirm.name}: pageerror ${e.message}`));
        try {
          const { texte, ziele } = await pruefeBildschirm(page, analyse, bildschirm);
          for (const t of texte) {
            if (t.gesperrt) {
              if (t.verhaeltnis < GRENZE) zeile.gesperrt.push({ bildschirm: bildschirm.name, ...t });
              continue;
            }
            zeile.texte += 1;
            if (t.verhaeltnis < zeile.minimum) {
              zeile.minimum = t.verhaeltnis;
              zeile.minText = `${bildschirm.name}: „${t.text}“ ${t.schrift} auf ${t.hintergrund} (${t.pfad})`;
            }
            if (t.verhaeltnis < GRENZE) zeile.fehler.push({ bildschirm: bildschirm.name, ...t });
            zeile.kleinsteSchrift.push({ bildschirm: bildschirm.name, groesse: t.groesse, text: t.text, pfad: t.pfad, diagramm: t.diagramm });
          }
          for (const z of ziele) {
            if (z.imText) {
              zeile.imText += 1;
              continue;
            }
            zeile.ziele += 1;
            if (z.b < ZIEL_PX - 0.5 || z.h < ZIEL_PX - 0.5) zeile.kleineZiele.push({ bildschirm: bildschirm.name, ...z });
          }
        } catch (e) {
          zeile.fehler.push({ bildschirm: bildschirm.name, text: `ABBRUCH: ${e.message.split('\n')[0]}`, verhaeltnis: 0 });
        } finally {
          await kontext.close();
        }
      }
      // kleinste Schriften: je Größe einmal, aufsteigend
      const proGroesse = new Map();
      for (const s of zeile.kleinsteSchrift.sort((p, q) => p.groesse - q.groesse)) {
        const k = `${s.groesse}|${s.pfad}`;
        if (!proGroesse.has(k)) proGroesse.set(k, s);
      }
      zeile.kleinsteSchrift = [...proGroesse.values()].filter((s) => s.groesse < 14).slice(0, 40);
      fehlerGesamt += zeile.fehler.length + zeile.kleineZiele.length;
      bericht.push(zeile);
      console.log(`\n== ${aussehen} · ${modus}: ${zeile.texte} Wortgruppen, Minimum ${zeile.minimum.toFixed(2)}:1 – ${zeile.minText}`);
      for (const f of zeile.fehler) console.log(`  KONTRAST ${String(f.verhaeltnis).padStart(5)}  ${f.bildschirm}: „${f.text}“ ${f.schrift ?? ''} auf ${f.hintergrund ?? ''}  ${f.groesse}px/${f.gewicht}  ${f.pfad ?? ''}`);
      for (const f of zeile.gesperrt) console.log(`  (gesperrt, ausgenommen) ${f.verhaeltnis}  ${f.bildschirm}: „${f.text}“  ${f.pfad}`);
      console.log(`  Ziele: ${zeile.ziele} geprüft, ${zeile.kleineZiele.length} unter ${ZIEL_PX} px, ${zeile.imText} Links im Fließtext ausgenommen`);
      for (const z of zeile.kleineZiele) console.log(`  ZIEL ${z.b}×${z.h}  ${z.bildschirm}: „${z.text}“  ${z.pfad}${z.gesperrt ? ' (gesperrt)' : ''}`);
      if (zeile.kleinsteSchrift.length) console.log(`  Schrift < 14 px: ${zeile.kleinsteSchrift.map((s) => `${s.groesse}px ${s.pfad}${s.diagramm ? ' (Diagramm)' : ''}`).join('; ')}`);
    }
  }
} finally {
  await browser.close();
  await server.stop();
}

console.log('\nAussehen   Modus    Minimum   Fehler  Ziele<44');
for (const z of bericht) console.log(`${z.aussehen.padEnd(10)} ${z.modus.padEnd(8)} ${z.minimum.toFixed(2).padStart(6)}:1 ${String(z.fehler.length).padStart(6)} ${String(z.kleineZiele.length).padStart(8)}`);
if (jsonDatei) await writeFile(jsonDatei, JSON.stringify(bericht, null, 2));
process.exitCode = fehlerGesamt === 0 ? 0 : 1;
