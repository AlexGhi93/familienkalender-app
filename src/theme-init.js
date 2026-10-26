// Setzt Darstellung (Hell/Dunkel), Aussehen (Klassisch/Glas/Bento) und Bewegung SOFORT beim Laden, bevor die Seite gezeichnet wird
// (kein Aufblitzen). Bewusst ein klassisches Skript ohne Module und ohne Import: es muss im <head> synchron laufen. Die Regeln stehen
// auch in src/domain/darstellung.js, src/domain/aussehen.js und src/ui/darstellung.js; ein Test prüft sie gegeneinander.
// Ohne Wahl (Automatisch, Klassisch, Bewegung an) setzt es kein Attribut und lässt die zwei theme-color-Zeilen im HTML gelten.
(function () {
  // jeder Schlüssel für sich (wie src/ui/darstellung.js): wirft ein Zugriff, gilt für diesen Wert der Standard
  function lies(schluessel) {
    try {
      return localStorage.getItem(schluessel);
    } catch (fehler) {
      return null; // Speicher gesperrt (privater Modus o. Ä.)
    }
  }
  var gespeichert = lies('fk.darstellung.v1');
  var wahl = gespeichert === 'hell' || gespeichert === 'dunkel' ? gespeichert : 'auto';
  var a = lies('fk.aussehen.v1');
  var aussehen = a === 'glas' || a === 'bento' ? a : 'klassisch';
  var bewegung = lies('fk.bewegung.v1') === 'reduziert' ? 'reduziert' : 'an';
  var wurzel = document.documentElement;
  if (wahl === 'hell') wurzel.setAttribute('data-theme', 'light');
  else if (wahl === 'dunkel') wurzel.setAttribute('data-theme', 'dark');
  else wurzel.removeAttribute('data-theme');
  if (aussehen !== 'klassisch') wurzel.setAttribute('data-aussehen', aussehen);
  else wurzel.removeAttribute('data-aussehen');
  if (bewegung === 'reduziert') wurzel.setAttribute('data-bewegung', 'reduziert');
  else wurzel.removeAttribute('data-bewegung');
  if (wahl === 'auto' && aussehen === 'klassisch') return; // die zwei theme-color-Zeilen im HTML genügen
  // [hell, dunkel] je Aussehen. Die neuen Metas landen VOR den theme-color-Metas aus index.html, weil dieses Skript im <head> über
  // ihnen steht (sie sind beim Lauf noch nicht gelesen; querySelectorAll unten findet sie deshalb nicht) – und das erste passende gilt.
  // Das <script> muss also über den Metas bleiben, sonst gewinnen die Klassisch-Farben aus dem HTML.
  var farben = aussehen === 'glas' ? ['#F1EEFA', '#0D0B19'] : aussehen === 'bento' ? ['#F1EFFA', '#14111D'] : ['#FFF7EC', '#1F1B2E'];
  var alt = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < alt.length; i += 1) alt[i].remove();
  function meta(farbe, media) {
    var m = document.createElement('meta');
    m.setAttribute('name', 'theme-color');
    m.setAttribute('content', farbe);
    if (media) m.setAttribute('media', media);
    document.head.append(m);
  }
  if (wahl === 'hell') meta(farben[0]);
  else if (wahl === 'dunkel') meta(farben[1]);
  else {
    meta(farben[0], '(prefers-color-scheme: light)');
    meta(farben[1], '(prefers-color-scheme: dark)');
  }
})();
