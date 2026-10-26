// Gemeinsame Bewegung der Aussehen „Glas & Licht“ und „Bento bunt“ (1.2.0): Tabwechsel, Einblenden, Hochzählen, Fortschritt, Konfetti.
// Klassisch bekommt davon nichts (kein Attribut data-aussehen → keine Klasse, kein Übergang, Zahlen gleich am Ziel, Balken unberührt).
// Alles ist aus bei „Bewegung: Reduziert“ (data-bewegung="reduziert", gilt in ALLEN Aussehen) oder prefers-reduced-motion.
// Keine Animation hält eine Aktion auf: gezeichnet wird immer sofort, die Bewegung läuft danach nur über transform/opacity auf dem
// echten DOM (keine View Transitions: die fangen Tipps ab und verzögern das Zeichnen); Neuzeichnen im Hintergrund spielt nichts erneut ab.
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
/** Ein Bild, das länger dauert, gilt beim Zählen nur als ein gewöhnliches Bild (BILD_MS). */
const LANGES_BILD_MS = 100;
const BILD_MS = 16;
/** Tabwechsel: `bw-tabwechsel` bleibt so lange wie --dauer-tab (Standard 220 ms) plus diese Reserve an <html>. */
const TAB_STANDARD_MS = 220;
const TAB_RESERVE_MS = 60;
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

let tabZeitgeber = null;

/** Dauer eines CSS-Tokens in ms (`0.22s`, `220ms`), sonst null. */
function dauerMs(text) {
  const t = String(text ?? '').trim();
  const m = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/.exec(t);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2] === 's' ? 1000 : 1));
}

function tokenMs(dokument, name) {
  try {
    return dauerMs(fensterVon(dokument).getComputedStyle?.(dokument.documentElement)?.getPropertyValue(name));
  } catch {
    return null;
  }
}

/**
 * Wechselt die Seite: `aktualisieren()` zeichnet sie IMMER sofort (synchron) – ein Tipp gleich danach trifft schon die neue Seite.
 * In Glas/Bento mit Bewegung blendet #inhalt danach kurz ein (Klasse `bw-tabwechsel` an <html>, nur opacity, --dauer-tab ≤ 260 ms);
 * ein zweiter Wechsel startet die Bewegung neu. Klassisch und reduziert: nur `aktualisieren()`.
 * Bewusst ohne View Transitions (Ruling Task 3): sie zeichnen erst ein Bild später und schicken Tipps währenddessen an <html>.
 * Kommt man von einer Seite ohne aktive Karte, trägt <html> zwei Bilder lang `bw-tropfen-frisch` (Tropfen/Blob ohne Gleiten).
 */
export function tabWechsel(aktualisieren, { dokument = globalThis.document } = {}) {
  const wurzel = dokument?.documentElement;
  const fenster = fensterVon(dokument);
  // Tropfen/Blob der Tab-Leiste (::before): gab es eben keine aktive Karte, entsteht er jetzt neu. Safari startet dann einen Übergang
  // von translateX(0) – er fegte vom linken Rand herein. `bw-tropfen-frisch` schaltet das Gleiten ab, bis das neue Bild steht.
  const frisch = effekteAn(dokument) && typeof dokument.querySelector === 'function' && !dokument.querySelector('nav.tabs > .tab.aktiv:not(.fab)');
  if (frisch) wurzel.classList.add('bw-tropfen-frisch');
  try {
    aktualisieren();
  } catch (fehler) {
    wurzel?.classList.remove('bw-tropfen-frisch');
    throw fehler;
  }
  if (frisch) fenster.requestAnimationFrame?.(() => fenster.requestAnimationFrame?.(() => wurzel.classList.remove('bw-tropfen-frisch')));
  if (!effekteAn(dokument)) return;
  if (wurzel.classList.contains('bw-tabwechsel')) {
    // lief das Einblenden vom letzten Wechsel noch: neu starten. Nur dann ein erzwungenes Layout – sonst zöge es die ganze neue Seite
    // in die Aufgabe des Tipps (auf langsamen Telefonen eine lange Aufgabe mehr)
    wurzel.classList.remove('bw-tabwechsel');
    void wurzel.offsetWidth;
  }
  wurzel.classList.add('bw-tabwechsel');
  fenster.clearTimeout(tabZeitgeber);
  tabZeitgeber = fenster.setTimeout(
    () => {
      tabZeitgeber = null;
      wurzel.classList.remove('bw-tabwechsel');
    },
    (tokenMs(dokument, '--dauer-tab') ?? TAB_STANDARD_MS) + TAB_RESERVE_MS,
  );
}

// ---------- Erinnerung je Besuch ----------

const gesehen = new Set(); // Bildschirm-Schlüssel, die in diesem Besuch schon eingeblendet wurden
let ersteAnzeige = null; // { schluessel, gemalt }: der Bildschirm, der gerade zum ersten Mal einblendet (gemalt = erstes Bild ist da)
const zahlen = new Map(); // data-bw-schluessel → gerade gezeigte Cents (während des Zählens der Zwischenwert)
const anteile = new Map(); // data-bw-schluessel → gezeigter Anteil (das Ziel erst, wenn der Übergang dorthin begonnen hat)
const angezeigteZahl = new WeakMap(); // Element → gerade gezeigte Cents
const angezeigterAnteil = new WeakMap(); // Element → gerade gezeigter Anteil
const zaehler = new WeakMap(); // Element → { fenster, id } des geplanten Bildwechsels
const zaehlendes = new Map(); // data-bw-schluessel → Element, das zuletzt für diesen Schlüssel zu zählen begann

/**
 * Ein neuer Besuch beginnt (die Shell ruft das, wenn eine andere Seite betreten wird): Einblenden und Hochzählen dürfen wieder
 * von vorn spielen. Neuzeichnen innerhalb eines Besuchs (Speichern, Vorladen im Hintergrund, anderes Telefon) spielt nichts erneut ab.
 */
export function neuerBesuch() {
  gesehen.clear();
  ersteAnzeige = null;
  zahlen.clear();
  anteile.clear();
  zaehlendes.clear();
}

const schluesselVon = (el) => el?.getAttribute?.('data-bw-schluessel') || null;

// ---------- Einblenden ----------

/**
 * Gestaffeltes Hereinkommen der Kinder von `container` (Karten, Listen) beim ERSTEN Zeigen des Bildschirms `schluessel` in diesem
 * Besuch: Klasse `bw-einblenden` am Behälter, `--bw-i` (0…8) an jedem Kind; beides ist danach wieder weg. Gibt true zurück, wenn
 * eingeblendet wurde (z. B. um beim ersten Mal von 0 hochzuzählen). Klassisch/reduziert: nichts, false.
 * Ersetzt ein Neuzeichnen den Behälter, BEVOR das erste Bild gemalt ist (z. B. die Fixkosten/Sparziele laden gleich nach dem Öffnen
 * und zeichnen sofort noch einmal), ist das noch das erste Zeigen: der neue Behälter blendet ein. Jedes spätere Neuzeichnen nicht.
 */
export function einblenden(container, schluessel) {
  if (!container) return false;
  const dokument = dokumentVon(container);
  if (gesehen.has(schluessel)) {
    if (ersteAnzeige?.schluessel !== schluessel || ersteAnzeige.gemalt || !effekteAn(dokument)) return false;
    staffeln(container, dokument);
    return true;
  }
  gesehen.add(schluessel);
  if (!effekteAn(dokument)) return false;
  const anzeige = { schluessel, gemalt: false };
  ersteAnzeige = anzeige;
  fensterVon(dokument).requestAnimationFrame?.(() => {
    anzeige.gemalt = true;
  });
  staffeln(container, dokument);
  return true;
}

function staffeln(container, dokument) {
  const kinder = [...(container.children ?? [])];
  kinder.forEach((kind, i) => kind.style?.setProperty('--bw-i', String(Math.min(i, MAX_GESTAFFELT))));
  container.classList.add(EINBLENDEN_KLASSE);
  fensterVon(dokument).setTimeout(() => {
    container.classList.remove(EINBLENDEN_KLASSE);
    for (const kind of kinder) kind.style?.removeProperty('--bw-i');
  }, EINBLENDEN_AUFRAEUMEN_MS);
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
 * beim gerade gezeigten Wert dieses Elements bzw. – mit `data-bw-schluessel` – dieses Schlüssels im Besuch, sonst bei 0. Während
 * des Zählens steht die Zahl in einem `aria-hidden`-Span, der Endwert unsichtbar daneben (`.bw-nur-vorlesen`). Elemente,
 * die neu gezeichnet werden, brauchen den Schlüssel: er merkt sich den GEZEIGTEN Wert. Ein Neuzeichnen mitten im Zählen (auch eines
 * vor dem ersten Bild) zählt deshalb an derselben Stelle weiter, eines danach mit demselben Wert zählt nicht noch einmal.
 * Verschwindet das Element mitten im Zählen und übernimmt bis zum nächsten Bild keines mit demselben Schlüssel (andere Ansicht), gilt
 * der Endwert als gezeigt: kommt man zurück, steht er gleich da. Der letzte Text ist immer genau `format(nachCents)`; das ersetzte
 * Element hört auf (kein Zeitgeber bleibt).
 * Klassisch/reduziert: sofort der Endwert.
 */
export function hochzaehlen(el, nachCents, format, { von } = {}) {
  if (!el) return;
  const dokument = dokumentVon(el);
  const fenster = fensterVon(dokument);
  anhalten(el);
  const schluessel = schluesselVon(el);
  const start = von ?? (angezeigteZahl.has(el) ? angezeigteZahl.get(el) : schluessel !== null && zahlen.has(schluessel) ? zahlen.get(schluessel) : 0);
  const merke = (cents) => {
    if (schluessel !== null) zahlen.set(schluessel, cents);
  };
  if (schluessel !== null) zaehlendes.set(schluessel, el);
  const abschliessen = () => {
    zaehler.delete(el);
    el.textContent = format(nachCents);
    angezeigteZahl.set(el, nachCents);
  };
  const ende = () => {
    abschliessen();
    merke(nachCents);
    if (schluessel !== null && zaehlendes.get(schluessel) === el) zaehlendes.delete(schluessel);
  };
  if (!effekteAn(dokument) || !Number.isFinite(start) || !Number.isFinite(nachCents) || start === nachCents || typeof fenster.requestAnimationFrame !== 'function') {
    ende();
    return;
  }
  // gezählt wird in einer Anzeige, die Bildschirmleser überspringen; daneben steht unsichtbar der genaue Endwert
  const anzeige = dokument.createElement('span');
  anzeige.setAttribute('aria-hidden', 'true');
  const vorlesen = dokument.createElement('span');
  vorlesen.classList.add('bw-nur-vorlesen');
  vorlesen.textContent = format(nachCents);
  el.textContent = '';
  el.append(anzeige, vorlesen);
  const zeige = (cents) => {
    anzeige.textContent = format(cents);
    angezeigteZahl.set(el, cents);
    merke(cents);
  };
  zeige(start);
  const ganzeEuro = Math.abs(nachCents - start) >= 100;
  let t0 = null;
  let vorher = null;
  const schritt = (t) => {
    if (!el.isConnected) {
      abschliessen();
      // ersetzt (Neuzeichnen): das neue Element zählt mit demselben Schlüssel weiter, hier wird nichts gemerkt. Hat bis zu diesem Bild
      // niemand übernommen (andere Ansicht, z. B. Fixkosten → Sparziele), gilt das Zählen als beendet: zurück steht der Betrag gleich.
      if (schluessel !== null && zaehlendes.get(schluessel) === el) {
        zaehlendes.delete(schluessel);
        merke(nachCents);
      }
      return;
    }
    t0 ??= t;
    // ein langes Bild (langsames Telefon, langes Zeichnen) zählt nur wie ein gewöhnliches: sonst wäre das Zählen schon vorbei, bevor man es sieht
    if (vorher !== null && t - vorher > LANGES_BILD_MS) t0 += t - vorher - BILD_MS;
    vorher = t;
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
 * Element ist die volle Breite der Füllung (nicht `width`). Mit Bewegung gleitet es vom zuletzt gezeigten Anteil (Element bzw.
 * `data-bw-schluessel`, sonst `von` oder 0) zum neuen; reduziert gleich am Ziel. Klassisch: tut nichts (dort bleibt `width`).
 * Der Schlüssel merkt sich das Ziel erst, wenn der Übergang an einem Element in der Seite begonnen hat: ein Neuzeichnen vorher (z. B.
 * gleich nach dem Öffnen) gleitet deshalb noch vom alten Stand. Der Elternknoten (die Bahn) trägt den Anteil als `--bw-anteil`
 * (z. B. für eine runde Kappe am Ende der Füllung); er wechselt im selben Moment wie das transform.
 */
export function fortschritt(el, anteil, { von } = {}) {
  if (!el || !MIT_EFFEKTEN.has(aussehenVon(dokumentVon(el)))) return;
  const zahl = Number(anteil);
  const ziel = Number.isFinite(zahl) ? Math.min(1, Math.max(0, zahl)) : 0;
  const dokument = dokumentVon(el);
  const fenster = fensterVon(dokument);
  const schluessel = schluesselVon(el);
  const start = von ?? (angezeigterAnteil.has(el) ? angezeigterAnteil.get(el) : schluessel !== null && anteile.has(schluessel) ? anteile.get(schluessel) : 0);
  const merke = (w) => {
    if (schluessel !== null) anteile.set(schluessel, w);
  };
  angezeigterAnteil.set(el, ziel);
  el.classList.add('bw-fortschritt');
  const setze = (w) => {
    el.style.setProperty('transform', `scaleX(${w})`);
    el.parentElement?.style?.setProperty('--bw-anteil', String(w));
  };
  if (!effekteAn(dokument) || start === ziel || typeof fenster.requestAnimationFrame !== 'function') {
    setze(ziel);
    merke(ziel);
    return;
  }
  setze(start);
  merke(start);
  // zwei Bilder: erst ist der Startwert gezeichnet, dann gleitet die CSS-Transition zum Ziel
  fenster.requestAnimationFrame(() =>
    fenster.requestAnimationFrame(() => {
      setze(ziel);
      if (el.isConnected) merke(ziel);
    }),
  );
}

// ---------- Konfetti ----------

let letzteWolke = null; // die zuletzt gestartete Konfetti-Hülle (eine neue ersetzt sie)

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
  letzteWolke?.remove(); // zweimal schnell: höchstens eine Wolke (≤ 80 Teilchen) zugleich
  letzteWolke = huelle;
  dokument.body.append(huelle);
  fensterVon(dokument).setTimeout(() => {
    huelle.remove();
    if (letzteWolke === huelle) letzteWolke = null;
  }, KONFETTI_MS);
  return huelle;
}

// ---------- Blatt ----------

/**
 * Wie lange ein schließendes Blatt noch im DOM bleibt (es gleitet hinaus). Ohne Bewegung (prefers-reduced-motion oder „Reduziert“,
 * in jedem Aussehen) 0 – dann gibt es nichts hinauszugleiten. Klassisch wie bis 1.1.2: 180 ms; Glas/Bento: `--dauer-mittel`.
 */
export function blattSchliessenMs(dokument = globalThis.document) {
  if (!bewegungAn(dokument)) return 0;
  if (!MIT_EFFEKTEN.has(aussehenVon(dokument))) return BLATT_KLASSISCH_MS;
  return tokenMs(dokument, '--dauer-mittel') ?? BLATT_KLASSISCH_MS;
}
