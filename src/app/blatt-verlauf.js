// Blätter und Browser-Verlauf (1.5.0): ein offenes Blatt bekommt einen Verlaufseintrag, „Zurück“ schließt es. Ohne DOM, `verlauf` wird hineingegeben.
// Einträge der Blätter tragen `{ fkBlatt: Tiefe, s: Sitzung }` und dieselbe Adresse wie die Seite darunter (kein hashchange).
// Schließen ohne „Zurück“ (✕, Escape, Hintergrund, Wischen, nach dem Speichern) geht im Verlauf zurück und verbraucht so den eigenen Eintrag.
// Bleibt ein Eintrag übrig (Navigation aus einem offenen Blatt), ist er „tot“: landet ein späteres Zurück darauf, wird er übersprungen.
// Ein eigenes go() läuft verzögert; navigiert die App inzwischen (Speichern → ui.gehZu nach einem await), nimmt der Rücksprung die
// Navigation zurück (Chrome und WebKit gleich). Alle eigenen Sprünge landen auf derselben Adresse, von der sie ausgingen: ein popstate
// mit anderer Adresse ist diese Navigation; sie wird nach dem Rücksprung über `gehe(adresse)` wiederholt.
// Kommt der Rücksprung nicht an (Browser verschluckt ihn), stellt ein Wächter nach WAECHTER_MS den Takt wieder her.
// Ohne offenes Blatt wird jeder Blatt-Eintrag übersprungen, auch einer aus einem früheren Laden; die Sitzung trennt nur bei offenen
// Blättern eigene von fremden Einträgen. Startet die App auf einem Blatt-Eintrag (PWA neu geladen), geht `beimStart` einmal zurück.

/** So lange darf der eigene Rücksprung dauern, bis der Wächter ihn aufgibt. */
export const WAECHTER_MS = 800;

/** Tiefe des Blatts, zu dem ein Verlaufszustand gehört; 0 für Seiten, fremde Sitzungen (früheres Laden) und alles Unbekannte. */
export function tiefeAus(state, sitzung) {
  if (!state || typeof state !== 'object' || state.s !== sitzung) return 0;
  const n = state.fkBlatt;
  return Number.isInteger(n) && n >= 1 ? n : 0;
}

/** Tiefe eines Blatt-Eintrags gleich welcher Sitzung (0 für Seiten und alles Unbekannte). */
const blattTiefe = (state) => (state && typeof state === 'object' ? tiefeAus(state, state.s) : 0);

/** Was nach einem Sprung im Verlauf zu tun ist: `schliessen` Blätter von oben schließen oder `zurueck` tote Einträge überspringen. */
export function blattAbgleich({ tiefe, offen }) {
  if (tiefe < offen) return { schliessen: offen - tiefe, zurueck: 0 };
  if (tiefe > offen) return { schliessen: 0, zurueck: tiefe - offen };
  return { schliessen: 0, zurueck: 0 };
}

/**
 * Hält die offenen Blätter (`eintrag = { zu() }`, schließt ohne den Verlauf anzufassen) in Deckung mit dem Verlauf.
 * `geoeffnet` / `geschlossen` melden die Blätter; `beiPopstate` / `beiHashwechsel` hängen an den Ereignissen des Fensters.
 */
export function createBlattVerlauf({ verlauf, sitzung, planen = queueMicrotask, adresse = () => null, gehe = () => {} }) {
  const stapel = [];
  let geplant = null; // { erwartet }: Tiefe des aktuellen Eintrags, als das erste Schließen dieses Schritts kam
  let unterwegs = false; // ein eigenes go() läuft, sein popstate kommt noch
  let adresseBeimGo = null; // dort landet das eigene go() wieder
  let tiefeBeimGo = 0; // von dort ging es los (jedes eigene go() ändert die Tiefe)
  let ueberholt = null; // Adresse einer Navigation, die während des eigenen go() kam (wird danach wiederholt)
  let waechter = null; // Zeitgeber, falls der eigene Rücksprung nie ankommt

  const tiefeJetzt = () => tiefeAus(verlauf.state, sitzung);
  const eintragen = (n) => verlauf.pushState({ fkBlatt: n, s: sitzung }, '');
  const angekommen = () => {
    unterwegs = false;
    clearTimeout(waechter);
    waechter = null;
  };
  // kein popstate zum eigenen go: aufgeben und die Tiefe des aktuellen Eintrags wieder mit den offenen Blättern in Deckung bringen
  function waechterSchlaegtAn() {
    waechter = null;
    if (!unterwegs) return;
    unterwegs = false;
    ueberholt = null; // die Navigation ist ohne Rücksprung schon da, es gibt nichts zu wiederholen
    adresseBeimGo = null;
    const tiefe = tiefeJetzt();
    if (tiefe > stapel.length) verlauf.replaceState(stapel.length ? { fkBlatt: stapel.length, s: sitzung } : null, '');
    else for (let n = tiefe + 1; n <= stapel.length; n += 1) eintragen(n);
  }
  const zurueckSpringen = (k) => {
    unterwegs = true;
    adresseBeimGo = adresse();
    tiefeBeimGo = blattTiefe(verlauf.state);
    clearTimeout(waechter);
    waechter = setTimeout(waechterSchlaegtAn, WAECHTER_MS);
    verlauf.go(-k);
  };

  function geplantesZurueck() {
    const { erwartet } = geplant;
    geplant = null;
    const tiefe = tiefeJetzt();
    // inzwischen woandershin navigiert (schließen + ui.gehZu im selben Schritt): nicht zurückspringen, der Eintrag bleibt tot
    if (tiefe !== erwartet) return;
    if (tiefe > stapel.length) zurueckSpringen(tiefe - stapel.length);
  }

  return {
    geoeffnet(eintrag) {
      stapel.push(eintrag);
      const n = stapel.length;
      if (unterwegs) return; // bekommt seinen Eintrag, sobald der Rücksprung angekommen ist (beiPopstate)
      if (geplant && n <= geplant.erwartet) {
        // ein Schließen im selben Schritt hat einen Eintrag frei gemacht: ihn weiterverwenden statt einen neuen anzulegen
        if (n === geplant.erwartet) verlauf.replaceState({ fkBlatt: n, s: sitzung }, '');
        return;
      }
      eintragen(n);
      if (geplant) geplant.erwartet = n;
    },
    geschlossen(eintrag) {
      const i = stapel.indexOf(eintrag);
      if (i < 0) return;
      stapel.splice(i, 1);
      if (unterwegs || geplant) return; // ein go für alle Schließungen dieses Schritts (bzw. Abgleich nach dem laufenden)
      geplant = { erwartet: tiefeJetzt() };
      planen(geplantesZurueck);
    },
    beiPopstate(state) {
      // ohne offenes Blatt zählt jeder Blatt-Eintrag (auch aus einem früheren Laden), sonst nur die eigenen
      const tiefe = stapel.length ? tiefeAus(state, sitzung) : blattTiefe(state);
      if (unterwegs && adresse() !== adresseBeimGo) {
        // nicht der eigene Rücksprung, sondern eine Navigation der App dazwischen: merken, der Rücksprung kommt noch
        ueberholt = adresse();
        while (stapel.length) stapel.pop().zu();
        return;
      }
      // Chrome meldet bei einem Doppeltipp mitunter ein popstate, bevor der Sprung geschehen ist (Zustand noch der alte): abwarten
      if (unterwegs && tiefe === tiefeBeimGo && tiefe > 0) return;
      if (geplant && tiefe === geplant.erwartet) return; // ebenso vor dem geplanten go: das erledigt den Abgleich
      if (unterwegs) {
        angekommen();
        if (ueberholt !== null) {
          // der Rücksprung hat die Navigation zurückgenommen: wiederholen (neuer Eintrag; der übersprungene bleibt tot)
          const ziel = ueberholt;
          ueberholt = null;
          while (stapel.length) stapel.pop().zu();
          gehe(ziel);
          return;
        }
        // während des Rücksprungs geöffnete Blätter bekommen jetzt ihren Eintrag
        for (let n = tiefe + 1; n <= stapel.length; n += 1) eintragen(n);
        if (tiefe <= stapel.length) return;
      }
      const { schliessen, zurueck } = blattAbgleich({ tiefe, offen: stapel.length });
      for (let i = 0; i < schliessen; i += 1) stapel.pop().zu();
      if (zurueck > 0) zurueckSpringen(zurueck);
    },
    /** Einmal beim Laden: steht die App auf einem Blatt-Eintrag (Neuladen über einem Blatt), um dessen Tiefe zurück. */
    beimStart() {
      const tiefe = blattTiefe(verlauf.state);
      if (tiefe > 0 && !stapel.length && !unterwegs) zurueckSpringen(tiefe);
    },
    beiHashwechsel() {
      // neue Seite: alle Blätter zu (mit beimSchliessen), ohne go – ihre Einträge bleiben tot und werden später übersprungen
      while (stapel.length) stapel.pop().zu();
    },
    oberstes: () => stapel.at(-1) ?? null,
    anzahl: () => stapel.length,
  };
}
