// Setzt die gewählte Darstellung (Hell/Dunkel) SOFORT beim Laden, bevor die Seite gezeichnet wird (kein Aufblitzen).
// Bewusst ein klassisches Skript ohne Module und ohne Import: es muss im <head> synchron laufen. Die Regeln stehen auch in
// src/domain/darstellung.js und src/ui/darstellung.js; ein Test prüft beide gegeneinander.
(function () {
  var wahl = 'auto';
  try {
    var gespeichert = localStorage.getItem('fk.darstellung.v1');
    if (gespeichert === 'hell' || gespeichert === 'dunkel') wahl = gespeichert;
  } catch (fehler) {
    // Speicher gesperrt (privater Modus o. Ä.): dem Telefon folgen
  }
  var wurzel = document.documentElement;
  if (wahl === 'hell') wurzel.setAttribute('data-theme', 'light');
  else if (wahl === 'dunkel') wurzel.setAttribute('data-theme', 'dark');
  else wurzel.removeAttribute('data-theme');
  if (wahl === 'auto') return; // die zwei theme-color-Zeilen im HTML genügen
  var alt = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < alt.length; i += 1) alt[i].remove();
  var meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', wahl === 'dunkel' ? '#1F1B2E' : '#FFF7EC');
  document.head.append(meta);
})();
