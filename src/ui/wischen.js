// Nach links wischen gibt „Löschen“ frei (Verlauf der Autos, Rechnungen der Versicherung): reine Geste, ohne Wissen über die Zeile.
const WISCH_BREITE = 96; // so weit gibt das Wischen den Knopf „Löschen“ frei
const WISCH_SCHWELLE = 48;

/**
 * Wohin eine Zeile nach dem Wischen geht: `dx`/`dy` = Weg des Fingers (px), `offen` = Löschen schon frei → 'auf' | 'zu' | null
 * (kein waagrechtes Wischen: nichts tun, z. B. Scrollen).
 */
export function wischZiel(dx, dy, offen) {
  if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return null;
  if (offen) return dx > WISCH_SCHWELLE / 2 ? 'zu' : 'auf';
  return dx < -WISCH_SCHWELLE ? 'auf' : 'zu';
}

/**
 * Wischen nach links gibt „Löschen“ frei; ein Tipp auf die (offene) Zeile schließt sie wieder bzw. öffnet das Blatt zum Ändern.
 * Auch für die Rechnungen der Versicherung (versicherung-screen.js; dieselben Klassen au-wisch / au-wisch-loeschen).
 */
export function wischbar(huelle, zeile, loeschen) {
  let start = null;
  let offen = false;
  const setze = (auf) => {
    offen = auf;
    huelle.classList.toggle('offen', auf);
    zeile.style.removeProperty('transform');
    loeschen.tabIndex = auf ? 0 : -1;
    loeschen.setAttribute('aria-hidden', String(!auf));
  };
  zeile.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, dy: 0 };
    huelle.classList.add('zieht');
  }, { passive: true });
  zeile.addEventListener('touchmove', (e) => {
    if (!start) return;
    start.dx = e.touches[0].clientX - start.x;
    start.dy = e.touches[0].clientY - start.y;
    if (Math.abs(start.dx) > Math.abs(start.dy)) zeile.style.setProperty('transform', `translateX(${Math.min(0, Math.max(-WISCH_BREITE, (offen ? -WISCH_BREITE : 0) + start.dx))}px)`);
  }, { passive: true });
  const ende = () => {
    if (!start) return;
    huelle.classList.remove('zieht');
    const ziel = wischZiel(start.dx, start.dy, offen);
    if (ziel) {
      zeile.dataset.gewischt = '1'; // der folgende Klick öffnet kein Blatt
      setze(ziel === 'auf');
    } else zeile.style.removeProperty('transform');
    start = null;
  };
  zeile.addEventListener('touchend', ende);
  zeile.addEventListener('touchcancel', ende);
  setze(false);
  return {
    istOffen: () => offen,
    schliessen: () => setze(false),
  };
}
