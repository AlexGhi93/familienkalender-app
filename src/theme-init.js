// Setzt Darstellung (Hell/Dunkel), Aussehen (Klassisch/Glas/Bento) und Bewegung SOFORT beim Laden, bevor die Seite gezeichnet wird
// (kein Aufblitzen). Bewusst ein klassisches Skript ohne Module und ohne Import: es muss im <head> synchron laufen. Die Regeln stehen
// auch in src/domain/darstellung.js, src/domain/aussehen.js und src/ui/darstellung.js; ein Test prüft sie gegeneinander.
// Ohne Wahl (Automatisch, Klassisch, Bewegung an) setzt es kein Attribut und lässt die zwei theme-color-Zeilen im HTML gelten.
(function () {
  var wahl = 'auto';
  var aussehen = 'klassisch';
  var bewegung = 'an';
  try {
    var gespeichert = localStorage.getItem('fk.darstellung.v1');
    if (gespeichert === 'hell' || gespeichert === 'dunkel') wahl = gespeichert;
    var a = localStorage.getItem('fk.aussehen.v1');
    if (a === 'glas' || a === 'bento') aussehen = a;
    if (localStorage.getItem('fk.bewegung.v1') === 'reduziert') bewegung = 'reduziert';
  } catch (fehler) {
    // Speicher gesperrt (privater Modus o. Ä.): dem Telefon folgen, Klassisch, Bewegung an
    wahl = 'auto';
    aussehen = 'klassisch';
    bewegung = 'an';
  }
  var wurzel = document.documentElement;
  if (wahl === 'hell') wurzel.setAttribute('data-theme', 'light');
  else if (wahl === 'dunkel') wurzel.setAttribute('data-theme', 'dark');
  else wurzel.removeAttribute('data-theme');
  if (aussehen !== 'klassisch') wurzel.setAttribute('data-aussehen', aussehen);
  else wurzel.removeAttribute('data-aussehen');
  if (bewegung === 'reduziert') wurzel.setAttribute('data-bewegung', 'reduziert');
  else wurzel.removeAttribute('data-bewegung');
  if (wahl === 'auto' && aussehen === 'klassisch') return; // die zwei theme-color-Zeilen im HTML genügen
  // [hell, dunkel] je Aussehen; die Metas stehen vor denen im HTML, das erste passende gilt
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
