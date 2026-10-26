// Gemeinsame Bewegung der Aussehen „Glas & Licht“ und „Bento bunt“ (1.2.0): Tabwechsel, Einblenden, Hochzählen, Fortschritt, Konfetti.
// Klassisch bekommt davon nichts (kein Attribut data-aussehen → keine Klasse, kein Übergang, Zahlen und Balken gleich am Ziel).
// Alles ist aus bei „Bewegung: Reduziert“ (data-bewegung="reduziert") oder prefers-reduced-motion. Keine Animation hält eine Aktion
// auf: Tipps wirken sofort (ein zweiter Tabwechsel überspringt den laufenden), Neuzeichnen im Hintergrund spielt nichts erneut ab.
// Die Klassen und Keyframes stehen in theme.css (Abschnitt „Bewegung“); Glas und Bento würzen sie in themes/glas.css bzw. bento.css.

/** Aussehen, in denen die Effekte laufen. */
const MIT_EFFEKTEN = new Set(['glas', 'bento']);

/** Klasse am Behälter beim ersten Zeichnen eines Bildschirms; die Kinder tragen `--bw-i` (Staffel-Index). */
export const EINBLENDEN_KLASSE = 'bw-einblenden';
/** Höchstens so viele Kinder werden gestaffelt, alle weiteren kommen mit dem letzten zusammen. */
export const MAX_GESTAFFELT = 8;
/** Danach sind Klasse und Index wieder weg (Staffel 8 × 45 ms + Dauer ≤ 0,6 s, mit Reserve). */
const EINBLENDEN_AUFRAEUMEN_MS = 1400;
/** Dauer des Hochzählens (rAF, ease-out). */
const ZAEHLEN_MS = 700;
/** Fallback ohne View Transitions: so lange steht `bw-tabwechsel` an <html>. */
const TAB_FALLBACK_MS = 260;
/**
 * Spätestens dann wird gezeichnet, auch wenn der Übergang noch nicht dazu kam (er wartet auf ein Bild, um den alten Stand
 * festzuhalten; ein beschäftigtes Telefon oder ein Browser ohne Bild ließe die Seite sonst bis zu 4 s stehen).
 */
const TAB_NOTFALL_MS = 200;
/** Konfetti: höchstens so viele Teilchen; nach KONFETTI_MS ist alles aus dem DOM. */
export const MAX_KONFETTI = 80;
export const KONFETTI_MS = 1500;
const KONFETTI_STANDARD = 46;
/** Farben der Teilchen: Bento setzt --konfetti-1 … 4 (Personenfarben), sonst diese. */
const KONFETTI_FARBEN = ['var(--konfetti-1, #4f8df7)', 'var(--konfetti-2, #ff7a6b)', 'var(--konfetti-3, #ffc94a)', 'var(--konfetti-4, #3fcf9e)'];
/** Blatt: so lange gleitet es in Klassisch hinaus, bevor es aus dem DOM geht (wie bis 1.1.2). */
const BLATT_KLASSISCH_MS = 180;

const fensterVon = (dokument) => dokument?.defaultView ?? globalThis;
const dokumentVon = (el) => el?.ownerDocument ?? globalThis.document;
const aussehenVon = (dokument) => dokument?.documentElement?.getAttribute?.('data-aussehen') ?? null;

function systemWillRuhe(dokument) {
  try {
    return fensterVon(dokument).matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

/** Bewegung erlaubt? false bei data-bewegung="reduziert" (Wahl in der App) oder prefers-reduced-motion (System). */
export function bewegungAn(dokument = globalThis.document) {
  const wurzel = dokument?.documentElement;
  if (!wurzel) return false;
  if (wurzel.getAttribute('data-bewegung') === 'reduziert') return false;
  return !systemWillRuhe(dokument);
}

/** Laufen die Effekte dieses Moduls? Nur in Glas und Bento und nur mit Bewegung. */
export function effekteAn(dokument = globalThis.document) {
  return MIT_EFFEKTEN.has(aussehenVon(dokument)) && bewegungAn(dokument);
}

// ---------- Tabwechsel ----------

let laufenderWechsel = null; // laufende View Transition (nur eine zugleich)
let fallbackZeitgeber = null;
const angebunden = new WeakSet(); // Dokumente, an denen die Hörer für „Tipp durch den Übergang“ hängen
let nachholen = null; // { x, y }: ein Tipp, der mitten im Übergang an <html> ging

/** Übergang sofort beenden (der neue Stand steht dann gleich da). */
function wechselUeberspringen() {
  const alt = laufenderWechsel;
  laufenderWechsel = null;
  if (!alt) return;
  try {
    alt.skipTransition();
  } catch {
    // schon fertig
  }
}

const EINGABE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * Während einer View Transition schickt der Browser jeden Tipp an <html> (das Bild des Übergangs liegt über der Seite; Chrome
 * beachtet `pointer-events: none` darauf nicht). Darum: beim Aufsetzen den Übergang sofort beenden und den Klick, der dann an <html>
 * ankommt, an das Element an derselben Stelle weitergeben – der Tipp wirkt also sofort (Tab, Knopf, Feld).
 */
function tippDurchUebergang(dokument) {
  if (angebunden.has(dokument) || typeof dokument.addEventListener !== 'function') return;
  angebunden.add(dokument);
  dokument.addEventListener(
    'pointerdown',
    (e) => {
      if (!laufenderWechsel) return;
      wechselUeberspringen();
      nachholen = e.target === dokument.documentElement ? { x: e.clientX, y: e.clientY } : null;
    },
    true,
  );
  dokument.addEventListener(
    'click',
    (e) => {
      const n = nachholen;
      nachholen = null;
      if (!n || !e.isTrusted || e.target !== dokument.documentElement) return;
      const ziel = dokument.elementFromPoint?.(n.x, n.y);
      if (!ziel || ziel === dokument.documentElement || ziel === dokument.body) return;
      e.stopPropagation();
      e.preventDefault();
      if (ziel.matches?.(EINGABE)) ziel.focus?.();
      ziel.click?.();
    },
    true,
  );
}

/**
 * Wechselt die Seite (`aktualisieren` zeichnet sie). Mit Effekten und View Transitions (iOS 18+, Chrome 111+) als kurzer Übergang
 * (≤ 260 ms, Klasse `bw-wechselt` an <html> solange er läuft); ohne API sofort zeichnen und kurz `bw-tabwechsel` setzen (CSS-Bewegung).
 * Ein zweiter Wechsel überspringt den laufenden sofort; ein Tipp mitten im Übergang beendet ihn und wirkt gleich (tippDurchUebergang).
 * Klassisch und reduziert: einfach `aktualisieren()`.
 */
export function tabWechsel(aktualisieren, { dokument = globalThis.document } = {}) {
  wechselUeberspringen();
  if (!effekteAn(dokument)) {
    aktualisieren();
    return;
  }
  const wurzel = dokument.documentElement;
  const fenster = fensterVon(dokument);
  if (typeof dokument.startViewTransition === 'function') {
    tippDurchUebergang(dokument);
    wurzel.classList.add('bw-wechselt');
    let gezeichnet = false;
    let notfall = null;
    const zeichne = () => {
      fenster.clearTimeout(notfall);
      if (gezeichnet) return;
      gezeichnet = true;
      aktualisieren();
    };
    let wechsel;
    try {
      wechsel = dokument.startViewTransition(zeichne);
      notfall = fenster.setTimeout(() => {
        if (gezeichnet) return;
        zeichne();
        if (laufenderWechsel === wechsel) wechselUeberspringen();
      }, TAB_NOTFALL_MS);
    } catch {
      wurzel.classList.remove('bw-wechselt');
      aktualisieren();
      return;
    }
    laufenderWechsel = wechsel;
    const fertig = () => {
      if (laufenderWechsel === wechsel) laufenderWechsel = null;
      if (!laufenderWechsel) wurzel.classList.remove('bw-wechselt');
    };
    Promise.resolve(wechsel.finished).then(fertig, fertig);
    Promise.resolve(wechsel.ready).catch(() => {}); // übersprungen: kein Fehler
    // ein Fehler beim Zeichnen darf nicht im Übergang verschwinden (die Fehlerwache der Tests und die Konsole sollen ihn sehen)
    Promise.resolve(wechsel.updateCallbackDone).catch((fehler) =>
      fenster.setTimeout(() => {
        throw fehler;
      }, 0),
    );
    return;
  }
  aktualisieren();
  wurzel.classList.remove('bw-tabwechsel');
  void wurzel.offsetWidth; // Animation neu starten, falls sie noch lief
  wurzel.classList.add('bw-tabwechsel');
  fenster.clearTimeout(fallbackZeitgeber);
  fallbackZeitgeber = fenster.setTimeout(() => {
    fallbackZeitgeber = null;
    wurzel.classList.remove('bw-tabwechsel');
  }, TAB_FALLBACK_MS);
}

// ---------- Erinnerung je Besuch ----------

const gesehen = new Set(); // Bildschirm-Schlüssel, die in diesem Besuch schon eingeblendet wurden
const zahlen = new Map(); // data-bw-schluessel → zuletzt gezeigte Cents
const anteile = new Map(); // data-bw-schluessel → zuletzt gezeigter Anteil
const angezeigteZahl = new WeakMap(); // Element → gerade gezeigte Cents
const angezeigterAnteil = new WeakMap(); // Element → gerade gezeigter Anteil
const zaehler = new WeakMap(); // Element → { fenster, id } des geplanten Bildwechsels

/**
 * Ein neuer Besuch beginnt (die Shell ruft das, wenn eine andere Seite betreten wird): Einblenden und Hochzählen dürfen wieder
 * von vorn spielen. Neuzeichnen innerhalb eines Besuchs (Speichern, Vorladen im Hintergrund, anderes Telefon) spielt nichts erneut ab.
 */
export function neuerBesuch() {
  gesehen.clear();
  zahlen.clear();
  anteile.clear();
}

const schluesselVon = (el) => el?.getAttribute?.('data-bw-schluessel') || null;

// ---------- Einblenden ----------

/**
 * Gestaffeltes Hereinkommen der Kinder von `container` (Karten, Listen) beim ERSTEN Zeichnen des Bildschirms `schluessel` in diesem
 * Besuch: Klasse `bw-einblenden` am Behälter, `--bw-i` (0…8) an jedem Kind; beides ist danach wieder weg. Gibt true zurück, wenn
 * eingeblendet wurde (z. B. um beim ersten Mal von 0 hochzuzählen). Klassisch/reduziert: nichts, false.
 */
export function einblenden(container, schluessel) {
  if (!container || gesehen.has(schluessel)) return false;
  gesehen.add(schluessel);
  const dokument = dokumentVon(container);
  if (!effekteAn(dokument)) return false;
  const kinder = [...(container.children ?? [])];
  kinder.forEach((kind, i) => kind.style?.setProperty('--bw-i', String(Math.min(i, MAX_GESTAFFELT))));
  container.classList.add(EINBLENDEN_KLASSE);
  fensterVon(dokument).setTimeout(() => {
    container.classList.remove(EINBLENDEN_KLASSE);
    for (const kind of kinder) kind.style?.removeProperty('--bw-i');
  }, EINBLENDEN_AUFRAEUMEN_MS);
  return true;
}

// ---------- Hochzählen ----------

function anhalten(el) {
  const z = zaehler.get(el);
  if (!z) return;
  zaehler.delete(el);
  z.fenster.cancelAnimationFrame?.(z.id);
}

/**
 * Zählt den Text von `el` auf `format(nachCents)` hoch (rAF, ease-out, ~0,7 s; Zwischenwerte auf ganze Euro). Beginnt bei `von`, sonst
 * beim zuletzt gezeigten Wert dieses Elements bzw. – mit `data-bw-schluessel` – dieses Schlüssels im Besuch, sonst bei 0. Elemente,
 * die neu gezeichnet werden, brauchen den Schlüssel, damit ein Neuzeichnen mit demselben Wert nicht noch einmal zählt.
 * Der letzte Text ist immer genau `format(nachCents)`; wird das Element mitten im Zählen ersetzt, hört es auf (kein Zeitgeber bleibt).
 * Klassisch/reduziert: sofort der Endwert.
 */
export function hochzaehlen(el, nachCents, format, { von } = {}) {
  if (!el) return;
  const dokument = dokumentVon(el);
  const fenster = fensterVon(dokument);
  anhalten(el);
  const schluessel = schluesselVon(el);
  const start = von ?? (angezeigteZahl.has(el) ? angezeigteZahl.get(el) : schluessel !== null && zahlen.has(schluessel) ? zahlen.get(schluessel) : 0);
  if (schluessel !== null) zahlen.set(schluessel, nachCents);
  const zeige = (cents) => {
    el.textContent = format(cents);
    angezeigteZahl.set(el, cents);
  };
  const ende = () => {
    zaehler.delete(el);
    zeige(nachCents);
  };
  if (!effekteAn(dokument) || !Number.isFinite(start) || !Number.isFinite(nachCents) || start === nachCents || typeof fenster.requestAnimationFrame !== 'function') {
    ende();
    return;
  }
  zeige(start);
  const ganzeEuro = Math.abs(nachCents - start) >= 100;
  let t0 = null;
  const schritt = (t) => {
    if (!el.isConnected) {
      ende();
      return;
    }
    t0 ??= t;
    const p = (t - t0) / ZAEHLEN_MS;
    if (p >= 1) {
      ende();
      return;
    }
    const roh = start + (nachCents - start) * (1 - (1 - p) ** 3);
    zeige(ganzeEuro ? Math.round(roh / 100) * 100 : Math.round(roh));
    zaehler.set(el, { fenster, id: fenster.requestAnimationFrame(schritt) });
  };
  zaehler.set(el, { fenster, id: fenster.requestAnimationFrame(schritt) });
}

// ---------- Fortschritt ----------

/**
 * Füllt einen Balken über `transform: scaleX(anteil)` (0…1, begrenzt; Klasse `bw-fortschritt` setzt transform-origin links). Das
 * Element ist die volle Breite der Füllung (nicht `width`). Mit Effekten gleitet es vom zuletzt gezeigten Anteil (Element bzw.
 * `data-bw-schluessel`, sonst `von` oder 0) zum neuen; Klassisch/reduziert gleich am Ziel.
 */
export function fortschritt(el, anteil, { von } = {}) {
  if (!el) return;
  const zahl = Number(anteil);
  const ziel = Number.isFinite(zahl) ? Math.min(1, Math.max(0, zahl)) : 0;
  const dokument = dokumentVon(el);
  const fenster = fensterVon(dokument);
  const schluessel = schluesselVon(el);
  const start = von ?? (angezeigterAnteil.has(el) ? angezeigterAnteil.get(el) : schluessel !== null && anteile.has(schluessel) ? anteile.get(schluessel) : 0);
  if (schluessel !== null) anteile.set(schluessel, ziel);
  angezeigterAnteil.set(el, ziel);
  el.classList.add('bw-fortschritt');
  const setze = (w) => el.style.setProperty('transform', `scaleX(${w})`);
  if (!effekteAn(dokument) || start === ziel || typeof fenster.requestAnimationFrame !== 'function') {
    setze(ziel);
    return;
  }
  setze(start);
  // zwei Bilder: erst ist der Startwert gezeichnet, dann gleitet die CSS-Transition zum Ziel
  fenster.requestAnimationFrame(() => fenster.requestAnimationFrame(() => setze(ziel)));
}

// ---------- Konfetti ----------

/**
 * Konfetti aus `anker` (z. B. „Sparziel erreicht“): nur Bento mit Bewegung. Höchstens 80 Teilchen (Standard 46), nur transform/opacity,
 * ohne Zeiger und für Bildschirmleser versteckt; nach 1,5 s ist alles aus dem DOM. Gibt die Hülle zurück (sonst null).
 */
export function konfetti(anker, { anzahl = KONFETTI_STANDARD } = {}) {
  if (!anker) return null;
  const dokument = dokumentVon(anker);
  if (aussehenVon(dokument) !== 'bento' || !bewegungAn(dokument)) return null;
  const n = Math.max(1, Math.min(MAX_KONFETTI, Math.floor(Number(anzahl)) || KONFETTI_STANDARD));
  const r = anker.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
  const huelle = dokument.createElement('div');
  huelle.classList.add('bw-konfetti');
  huelle.setAttribute('aria-hidden', 'true');
  huelle.style.setProperty('pointer-events', 'none');
  huelle.style.setProperty('left', `${Math.round(r.left + r.width / 2)}px`);
  huelle.style.setProperty('top', `${Math.round(r.top + r.height / 2)}px`);
  for (let i = 0; i < n; i += 1) {
    const teil = dokument.createElement('i');
    teil.classList.add('bw-konfetti-teil');
    const winkel = -Math.PI * (0.1 + 0.8 * Math.random()); // nach oben, fächerförmig
    const weite = 50 + Math.random() * 110;
    teil.style.setProperty('--bw-dx', `${Math.round(Math.cos(winkel) * weite)}px`);
    teil.style.setProperty('--bw-dy', `${Math.round(Math.sin(winkel) * weite)}px`);
    teil.style.setProperty('--bw-fall', `${Math.round(80 + Math.random() * 90)}px`);
    teil.style.setProperty('--bw-dreh', `${Math.round((Math.random() - 0.5) * 720)}deg`);
    teil.style.setProperty('--bw-dauer', `${Math.round(900 + Math.random() * 350)}ms`);
    teil.style.setProperty('--bw-verz', `${Math.round(Math.random() * 120)}ms`);
    teil.style.setProperty('--bw-farbe', KONFETTI_FARBEN[i % KONFETTI_FARBEN.length]);
    huelle.append(teil);
  }
  dokument.body.append(huelle);
  fensterVon(dokument).setTimeout(() => huelle.remove(), KONFETTI_MS);
  return huelle;
}

// ---------- Blatt ----------

function dauerMs(text) {
  const t = String(text ?? '').trim();
  const m = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/.exec(t);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2] === 's' ? 1000 : 1));
}

/**
 * Wie lange ein schließendes Blatt noch im DOM bleibt (es gleitet hinaus). Klassisch wie bis 1.1.2: 180 ms, bei prefers-reduced-motion 0.
 * Glas/Bento: die Dauer aus `--dauer-mittel` (ihr Blatt-Übergang), ohne Bewegung 0 (dann gibt es nichts hinauszugleiten).
 */
export function blattSchliessenMs(dokument = globalThis.document) {
  if (!MIT_EFFEKTEN.has(aussehenVon(dokument))) return systemWillRuhe(dokument) ? 0 : BLATT_KLASSISCH_MS;
  if (!bewegungAn(dokument)) return 0;
  try {
    const wert = fensterVon(dokument).getComputedStyle?.(dokument.documentElement)?.getPropertyValue('--dauer-mittel');
    return dauerMs(wert) ?? BLATT_KLASSISCH_MS;
  } catch {
    return BLATT_KLASSISCH_MS;
  }
}
