// Blätter nach unten wischen zum Schließen (wie auf dem Telefon üblich).
// Oben die reinen Entscheidungen (ohne DOM, Unit-Tests), unten das Anbinden an ein Blatt mit Touch-Ereignissen
// (funktionieren gleich in Safari auf dem iPhone – auch als installierte App – und in Chrome auf Android).

/** Ab dieser Strecke nach unten schließt das Loslassen immer. */
export const SCHLIESSEN_AB_PX = 100;
/** Kleiner Weg, bevor ein Zug überhaupt als Zug gilt: Tippen auf Knöpfe bleibt Tippen. */
export const TOTZONE_PX = 8;
/** Ein „Wurf“ (kurz und schnell nach unten) schließt ab dieser Strecke und Geschwindigkeit. */
const WURF_AB_PX = 30;
const WURF_PX_PRO_MS = 0.3;
/** Steht der Finger länger still, zählt die Bewegung davor nicht mehr als Wurf. */
const WURF_PAUSE_MS = 80;
/** So lange gedrückt, ohne sich zu bewegen: eher Text markieren (langes Drücken) als Ziehen. */
const LANG_GEDRUECKT_MS = 500;

/**
 * Schließt das Loslassen das Blatt? `dy` = ganze Strecke nach unten (px), `wurf` = Strecke der letzten zügigen Bewegung nach unten
 * (ohne Angabe die ganze Strecke), `dt` = Dauer dieser Bewegung (ms).
 */
export function sollSchliessen({ dy, dt, wurf = dy }) {
  if (!(dy > 0)) return false;
  if (dy >= SCHLIESSEN_AB_PX) return true;
  return wurf >= WURF_AB_PX && wurf / Math.max(dt, 1) >= WURF_PX_PRO_MS;
}

/** Richtung eines Zugs: `null` innerhalb der Totzone, sonst 'runter', 'hoch' oder 'seitlich' (auch schräg). */
export function ziehRichtung({ dx, dy }) {
  if (Math.hypot(dx, dy) < TOTZONE_PX) return null;
  if (Math.abs(dy) <= Math.abs(dx)) return 'seitlich';
  return dy > 0 ? 'runter' : 'hoch';
}

/** Felder, in denen ein Finger tippt, markiert oder einen Regler schiebt: dort beginnt nie ein Zug am Blatt. */
const EINGABE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** Ist zwischen `ziel` und dem Blatt (einschließlich) etwas nach unten gescrollt? Dann gehört ein Zug nach unten dem Scrollen. */
function gescrollt(ziel, tafel) {
  for (let el = ziel; el; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
    if (el === tafel) return false;
  }
  return false;
}

/**
 * Bindet das Wischen an ein Blatt: `tafel` geht mit dem Finger nach unten (nie über 0 nach oben), `hintergrund` wird heller.
 * Beim Loslassen ruft es `schliessen()` (weit genug oder geworfen) oder lässt das Blatt zurückgleiten.
 */
export function blattZiehenAnbinden({ tafel, hintergrund, schliessen }) {
  let zug = null; // { x0, y0, t0, richtung, frei, anker, letzte }

  function setze(dy) {
    tafel.style.transition = 'none';
    tafel.style.transform = `translate(-50%, ${dy}px)`;
    hintergrund.style.transition = 'none';
    hintergrund.style.opacity = String(Math.max(0.15, 1 - dy / Math.max(tafel.offsetHeight, 1)));
  }
  // Inline-Werte weg: die Klassen (auf/zu) und ihre Übergänge übernehmen wieder – zurückgleiten bzw. hinausgleiten.
  function freigeben() {
    for (const el of [tafel, hintergrund]) el.style.removeProperty('transition');
    tafel.style.removeProperty('transform');
    hintergrund.style.removeProperty('opacity');
  }

  function beiBeruehrung(e) {
    if (zug?.richtung === 'runter') freigeben(); // ein hängengebliebener Zug (z. B. Inhalt neu gezeichnet) springt zurück
    zug = null;
    if (e.touches.length !== 1) return;
    const ziel = e.target instanceof Element ? e.target : null;
    if (!ziel || ziel.closest(EINGABE)) return;
    const amGriff = Boolean(ziel.closest('.blatt-griff, .blatt-kopf'));
    const p = e.touches[0];
    const t = e.timeStamp;
    zug = { x0: p.clientX, y0: p.clientY, t0: t, richtung: null, frei: amGriff || !gescrollt(ziel, tafel), anker: { y: p.clientY, t }, letzte: { y: p.clientY, t } };
  }

  function beiBewegung(e) {
    if (!zug || e.touches.length !== 1) return;
    const p = e.touches[0];
    const dy = p.clientY - zug.y0;
    if (!zug.richtung) {
      const richtung = ziehRichtung({ dx: p.clientX - zug.x0, dy });
      if (!richtung) {
        // schon in der Totzone: kein Überscrollen nach unten anfangen lassen (sonst wäre das Ereignis später nicht mehr abbrechbar);
        // seitliche Bewegungen bleiben unberührt
        if (zug.frei && dy > Math.abs(p.clientX - zug.x0) && e.cancelable) e.preventDefault();
        return;
      }
      const markiert = String(document.getSelection?.() ?? '') !== '';
      if (richtung !== 'runter' || !zug.frei || markiert || e.timeStamp - zug.t0 > LANG_GEDRUECKT_MS) {
        zug = null; // Scrollen, seitliches Wischen oder Markieren: das gehört nicht uns
        return;
      }
      zug.richtung = 'runter';
    }
    if (e.cancelable) e.preventDefault();
    const t = e.timeStamp;
    // Wurf neu beginnen, wenn der Finger zurück nach oben geht oder kurz stillsteht
    if (p.clientY < zug.letzte.y) zug.anker = { y: p.clientY, t };
    else if (t - zug.letzte.t > WURF_PAUSE_MS) zug.anker = { ...zug.letzte };
    zug.letzte = { y: p.clientY, t };
    setze(Math.max(0, dy));
  }

  function beimLoslassen(e) {
    const z = zug;
    zug = null;
    if (z?.richtung !== 'runter') return;
    const still = e.type === 'touchcancel' || e.timeStamp - z.letzte.t > WURF_PAUSE_MS;
    const dy = Math.max(0, z.letzte.y - z.y0);
    const zu = e.type !== 'touchcancel' && sollSchliessen({ dy, dt: z.letzte.t - z.anker.t, wurf: still ? 0 : z.letzte.y - z.anker.y });
    freigeben();
    if (zu) schliessen();
  }

  tafel.addEventListener('touchstart', beiBeruehrung, { passive: true });
  tafel.addEventListener('touchmove', beiBewegung, { passive: false });
  tafel.addEventListener('touchend', beimLoslassen);
  tafel.addEventListener('touchcancel', beimLoslassen);
}
