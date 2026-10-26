// Merker für die Bewegung des Schichtplans in Glas/Bento (themes/schicht.css; in Klassisch ohne Stil): wie lange die Pinsel-Leiste noch
// hereinfedert und welcher Streifen gerade stempelt. Die Seite zeichnet sich oft neu (nach jedem Tipp, nach dem Speichern): der neue
// Knoten bekommt Klasse und negative Verzögerung (vergangene Zeit) und läuft so an derselben Stelle weiter, statt neu zu beginnen oder
// zu springen. Nach der Dauer ist der Merker leer; nichts spielt erneut. Ohne Zeitgeber: abgelaufen wird beim nächsten Lesen.

/** So lange federt die Leiste nach dem Öffnen herein (Glas 0,55 s, Bento 0,5 s), mit Reserve. */
export const PINSEL_REIN_MS = 600;
/** So lange stempelt ein gemalter Streifen (Glas 0,5 s, Bento 0,42 s), mit Reserve. */
export const GEMALT_MS = 600;

/** Ein Merker für `dauer` ms: setzen(daten), loeschen(), lesen() → { ...daten, vor } (ms seit dem Setzen) oder null. */
export function merker(dauer, jetzt = () => performance.now()) {
  let marke = null;
  return {
    setzen(daten) {
      marke = { daten, seit: jetzt() };
    },
    loeschen() {
      marke = null;
    },
    lesen() {
      if (!marke) return null;
      const vor = jetzt() - marke.seit;
      if (vor >= dauer || vor < 0) {
        marke = null;
        return null;
      }
      return { ...marke.daten, vor };
    },
  };
}

/**
 * Stempelt der Streifen `s` von `person` am `datum`? Nur der eben gemalte (`gemalt`: { datum, person, vorher }) und nur, wenn er jetzt eine
 * andere Art zeigt als vor dem Tipp: frei getippt (kein Streifen) oder zurückgenommen (Speichern scheiterte, die alte Art ist wieder da) – nein.
 */
export function stempelt(gemalt, datum, person, s) {
  return Boolean(gemalt && s && gemalt.datum === datum && gemalt.person === person && s.k !== gemalt.vorher);
}
